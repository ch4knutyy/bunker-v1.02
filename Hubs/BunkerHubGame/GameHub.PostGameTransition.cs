using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public object GetRoomState()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        if (!_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out _))
            throw new HubException("room_membership_required");
        return new
        {
            room = room.ToPublicInfo(),
            players = BuildRoomPlayersPayload(room),
            roundState = BuildRoundState(room),
            completion = room.Completion,
            postGameTransition = BuildPostGameTransition(room),
            developerPresence = _developerAuthority.Presence(room)
        };
    }

    public object GetDeveloperAccessState() => new
    {
        isDeveloper = _developerAuthority.IsDeveloper(Context.User),
        features = new
        {
            developerTools = _developerAuthority.FeatureAllows(RoomActorCapability.UseDeveloperTools),
            scenarioImages = _developerAuthority.FeatureAllows(RoomActorCapability.ManageScenarioImages),
            postGameStory = _developerAuthority.FeatureAllows(RoomActorCapability.OperatePostGameStoryDirector)
        }
    };

    public async Task FinishPostGameDiscussion(string commandId)
    {
        var (room, actor) = RequirePostGameManager();
        if (string.IsNullOrWhiteSpace(commandId)) throw new HubException("command_id_required");
        lock (room.GameSettingsSyncRoot)
        {
            if (room.ProcessedPostGameCommandIds.Contains(commandId)) return;
            if (room.PostGamePhase != PostGamePhase.FinalDiscussion || room.Completion == null)
                throw new HubException("final_discussion_required");
            RememberPostGameCommand(room, commandId);
            room.PostGamePhase = PostGamePhase.HostDecision;
        }
        QueueRoomRecovery(room, "post_game_host_decision");
        await BroadcastPostGameTransition(room);
    }

    public async Task ChoosePostGameStory(string mode, string? parentEntryId, string commandId)
    {
        var (room, actor) = RequirePostGameManager();
        if (string.IsNullOrWhiteSpace(commandId)) throw new HubException("command_id_required");
        if (!PostGameStoryModes.All.Contains(mode)) throw new HubException("story_mode_invalid");
        lock (room.GameSettingsSyncRoot)
        {
            if (room.ProcessedPostGameCommandIds.Contains(commandId)) return;
            if (room.PostGamePhase is not (PostGamePhase.HostDecision or PostGamePhase.StoryPublished or PostGamePhase.Completed))
                throw new HubException("host_decision_required");
            if (!_developerAuthority.Presence(room).DeveloperPresent) throw new HubException("developer_required");
            if (!_developerAuthority.FeatureAllows(RoomActorCapability.OperatePostGameStoryDirector)) throw new HubException("feature_disabled");
            if (mode != PostGameStoryModes.FinalStory && room.PostGameStory.PublishedEntries.Count == 0)
                throw new HubException("story_initial_entry_required");
            RememberPostGameCommand(room, commandId);
            room.PostGameStory.CurrentMode = mode;
            room.PostGameStory.ParentEntryId = parentEntryId;
            room.PostGamePhase = PostGamePhase.StoryRequested;
        }
        QueueRoomRecovery(room, "post_game_story_requested");
        await BroadcastPostGameTransition(room);
    }

    public async Task CancelPostGameStoryRequest(string commandId)
    {
        var (room, _) = RequirePostGameManager();
        if (string.IsNullOrWhiteSpace(commandId)) throw new HubException("command_id_required");
        lock (room.GameSettingsSyncRoot)
        {
            if (room.ProcessedPostGameCommandIds.Contains(commandId)) return;
            if (room.PostGamePhase is not (PostGamePhase.StoryRequested or PostGamePhase.StoryPreparation))
                throw new HubException("story_request_not_active");
            RememberPostGameCommand(room, commandId);
            // Host cancellation only exits the public story flow. The Developer's
            // canonical private draft is retained until the Developer explicitly
            // discards it via CancelPostGameStoryDraft.
            room.PostGamePhase = PostGamePhase.HostDecision;
        }
        QueueRoomRecovery(room, "post_game_story_request_cancelled");
        await Clients.Group(room.Id).SendAsync("PostGameStoryCleared", _postGameStories.ToPublicDto(room.PostGameStory));
        foreach (var developer in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value)
            .Where(player => player.IsConnected && _developerAuthority.IsDeveloper(player)))
        {
            await Clients.Client(developer.ConnectionId).SendAsync(
                "PostGameStoryDeveloperStateChanged",
                _postGameStories.ToHostDto(room.PostGameStory));
        }
        await BroadcastPostGameTransition(room);
    }

    public async Task RevealRemainingPostGameCharacteristics(string commandId)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        var player = _roomService.GetPlayer(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        if (string.IsNullOrWhiteSpace(commandId)) throw new HubException("command_id_required");
        if (room.PostGamePhase != PostGamePhase.FinalDiscussion) throw new HubException("final_discussion_required");
        var playerCommand = $"reveal:{RoomService.GetPlayerKey(player)}:{commandId}";
        lock (room.GameSettingsSyncRoot)
        {
            if (room.ProcessedPostGameCommandIds.Contains(playerCommand)) return;
            RememberPostGameCommand(room, playerCommand);
        }
        foreach (var characteristic in new[] { "Personality", "Body", "Profession", "PhysicalHealth", "MentalHealth", "Hobby", "CharacterTrait", "Phobia", "Inventory", "Property", "Fact", "SpecialCard" })
        {
            if (IsCharacteristicRevealed(player, characteristic)) continue;
            var data = GetRevealedDataForCharacteristic(player, characteristic);
            if (data == null) continue;
            SetCharacteristicRevealed(player, characteristic);
            await Clients.Group(room.Id).SendAsync("CharacteristicRevealed", new
            {
                playerName = player.Name, connectionId = Context.ConnectionId, characteristicKey = characteristic,
                data, postGameReveal = true
            });
        }
        player.HasRevealedAllAfterElimination = player.IsEliminated;
        player.CanRevealAllAfterElimination = false;
        _roomService.UpdatePlayer(Context.ConnectionId, player);
        await Clients.Group(room.Id).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));
    }

    private (Room Room, Player Actor) RequirePostGameManager()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        var actor = _roomService.GetPlayer(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        if (!HasActiveRoomCapability(room, actor, RoomActorCapability.ManageRoom)) throw new HubException("host_required");
        return (room, actor);
    }

    private PostGameTransitionPublicDto BuildPostGameTransition(Room room)
    {
        if (room.PostGamePhase == PostGamePhase.None && room.State == RoomState.Finished && room.Completion != null)
        {
            room.PostGamePhase = room.PostGameStory.Status == PostGameStoryStatuses.Completed
                ? PostGamePhase.Completed
                : room.PostGameStory.PublishedEntries.Count > 0
                    ? PostGamePhase.StoryPublished
                    : PostGamePhase.FinalDiscussion;
        }
        var presence = _developerAuthority.Presence(room);
        return new(room.PostGamePhase.ToString(), presence.DeveloperPresent, presence.DeveloperPlayerId,
            room.PostGamePhase == PostGamePhase.FinalDiscussion,
            room.PostGamePhase == PostGamePhase.HostDecision,
            room.PostGamePhase is PostGamePhase.StoryRequested or PostGamePhase.StoryPreparation,
            room.PostGameStory.PublishedEntries.Count > 0,
            room.PostGamePhase switch
            {
                PostGamePhase.StoryRequested or PostGamePhase.StoryPreparation when !presence.DeveloperPresent => "waiting_for_developer",
                PostGamePhase.StoryRequested or PostGamePhase.StoryPreparation => "developer_preparing",
                PostGamePhase.HostDecision when !presence.DeveloperPresent => "developer_offline",
                PostGamePhase.HostDecision => "developer_available",
                _ => "none"
            },
            _developerAuthority.FeatureAllows(RoomActorCapability.OperatePostGameStoryDirector),
            room.PostGamePhase is PostGamePhase.StoryRequested or PostGamePhase.StoryPreparation
                ? room.PostGameStory.CurrentMode
                : null);
    }

    private Task BroadcastPostGameTransition(Room room) =>
        Clients.Group(room.Id).SendAsync("PostGameTransitionChanged", BuildPostGameTransition(room));

    private async Task BroadcastDeveloperAuthorityState(Room room)
    {
        await Clients.Group(room.Id).SendAsync("DeveloperPresenceChanged", _developerAuthority.Presence(room));
        foreach (var entry in RoomService.GetPlayersSnapshot(room).Where(entry => entry.Value.IsConnected && _developerAuthority.IsDeveloper(entry.Value)))
            await Clients.Client(entry.Value.ConnectionId).SendAsync("DeveloperAuthorityChanged", _developerAuthority.PrivateState(room, entry.Value, entry.Value.ConnectionId));
    }

    private static void RememberPostGameCommand(Room room, string commandId)
    {
        while (room.ProcessedPostGameCommandIds.Count >= 200) room.ProcessedPostGameCommandIds.Remove(room.ProcessedPostGameCommandIds.First());
        room.ProcessedPostGameCommandIds.Add(commandId);
    }
}
