using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public async Task PreparePostGameStoryPrompt(string mode, string? parentEntryId, string commandId)
    {
        var (room, actor) = RequireStoryDeveloper(RoomActorCapability.OperatePostGameStoryDirector);
        if (room.PostGamePhase is not (PostGamePhase.StoryRequested or PostGamePhase.StoryPreparation))
            throw new HubException("story_not_requested");
        PostGameStoryHostDto result;
        try { result = _postGameStories.Prepare(room, actor, mode, parentEntryId, commandId); }
        catch (Exception exception) { throw StoryHubException(exception); }
        room.PostGamePhase = PostGamePhase.StoryPreparation;
        _developerAuthority.Audit(room, actor, RoomActorCapability.OperatePostGameStoryDirector, "story_prompt_prepared", "success", commandId: commandId);
        QueueRoomRecovery(room, "post_game_story_prompt");
        await Clients.Caller.SendAsync("PostGameStoryDeveloperStateChanged", result);
        await Clients.OthersInGroup(room.Id).SendAsync("PostGameStoryStateChanged", _postGameStories.ToPublicDto(room.PostGameStory));
        await BroadcastPostGameTransition(room);
    }

    public async Task ResumePostGameStoryDraft(string commandId)
    {
        var (room, actor) = RequireStoryDeveloper(RoomActorCapability.OperatePostGameStoryDirector);
        if (string.IsNullOrWhiteSpace(commandId)) throw new HubException("command_id_required");
        lock (room.GameSettingsSyncRoot)
        {
            if (room.ProcessedPostGameCommandIds.Contains(commandId)) return;
            if (room.PostGamePhase != PostGamePhase.StoryRequested) throw new HubException("story_not_requested");
            if (string.IsNullOrWhiteSpace(room.PostGameStory.GeneratedPromptFingerprint))
                throw new HubException("story_prompt_required");
            RememberPostGameCommand(room, commandId);
            room.PostGamePhase = PostGamePhase.StoryPreparation;
        }
        _developerAuthority.Audit(room, actor, RoomActorCapability.OperatePostGameStoryDirector, "story_draft_resumed", "success", commandId: commandId);
        await Clients.Caller.SendAsync("PostGameStoryDeveloperStateChanged", _postGameStories.ToHostDto(room.PostGameStory));
        await Clients.OthersInGroup(room.Id).SendAsync("PostGameStoryStateChanged", _postGameStories.ToPublicDto(room.PostGameStory));
        await BroadcastPostGameTransition(room);
    }

    public async Task SubmitPostGameStoryResult(string rawResult, string commandId)
    {
        var (room, actor) = RequireStoryDeveloper(RoomActorCapability.OperatePostGameStoryDirector);
        if (room.PostGamePhase != PostGamePhase.StoryPreparation) throw new HubException("story_not_in_preparation");
        try { _postGameStories.Submit(room, actor, rawResult, commandId); }
        catch (Exception exception) { throw StoryHubException(exception); }
        QueueRoomRecovery(room, "post_game_story_preview");
        await Clients.Caller.SendAsync("PostGameStoryDeveloperStateChanged", _postGameStories.ToHostDto(room.PostGameStory));
        await Clients.OthersInGroup(room.Id).SendAsync("PostGameStoryStateChanged", _postGameStories.ToPublicDto(room.PostGameStory));
    }

	public Task<long> SavePostGameStoryDraft(
		string rawResult,
		long operatorVersion)
	{
		var (room, actor) = RequireStoryDeveloper(
			RoomActorCapability.OperatePostGameStoryDirector);

		if (room.PostGamePhase != PostGamePhase.StoryPreparation)
			throw new HubException("story_not_in_preparation");

		var isActiveConnection = string.Equals(
			room.ActiveDeveloperConnectionId,
			Context.ConnectionId,
			StringComparison.Ordinal);

		if (!isActiveConnection)
			throw new HubException("developer_operator_required");

		var currentOperatorVersion = room.DeveloperOperatorVersion;

		if (operatorVersion != currentOperatorVersion)
		{
			_logger.LogInformation(
				"Story draft received stale operator version. Client={ClientVersion}, Server={ServerVersion}, Connection={ConnectionId}. Using current server version.",
				operatorVersion,
				currentOperatorVersion,
				Context.ConnectionId);
		}

		try
		{
			_postGameStories.SaveDraft(
				room,
				actor,
				rawResult ?? string.Empty);
		}
		catch (Exception exception)
		{
			throw StoryHubException(exception);
		}

		return Task.FromResult(currentOperatorVersion);
	}

	public string GetPostGameStoryResponseSchema()
	{
		var room = _roomService.GetPlayerRoom(Context.ConnectionId)
			?? throw new HubException("room_membership_required");

		var actor = _roomService.GetPlayer(Context.ConnectionId)
			?? throw new HubException("room_membership_required");

		if (!_developerAuthority.IsDeveloper(actor))
			throw new HubException("developer_required");

		if (!_developerAuthority.FeatureAllows(
				RoomActorCapability.OperatePostGameStoryDirector))
		{
			throw new HubException("feature_disabled");
		}

		return Bunker.Services.PostGameStoryPromptBuilder.ResponseSchema.Replace(
			"\"final_story\"",
			$"\"{room.PostGameStory.CurrentMode ?? PostGameStoryModes.FinalStory}\"",
			StringComparison.Ordinal);
	}

	public async Task PublishPostGameStory(string previewFingerprint, string commandId)
    {
        var (room, actor) = RequireStoryDeveloper(RoomActorCapability.PublishPostGameStory);
        if (room.PostGamePhase != PostGamePhase.StoryPreparation) throw new HubException("story_not_in_preparation");
        PostGameStoryEntry entry;
        try { entry = _postGameStories.Publish(room, actor, previewFingerprint, commandId); }
        catch (Exception exception) { throw StoryHubException(exception); }
        room.PostGamePhase = PostGamePhase.StoryPublished;
        _developerAuthority.Audit(room, actor, RoomActorCapability.PublishPostGameStory, "story_published", "success", entry.Id, commandId);
        QueueRoomRecovery(room, "post_game_story_published");
        await Clients.Group(room.Id).SendAsync("PostGameStoryPublished", new
        {
            entry,
            state = _postGameStories.ToPublicDto(room.PostGameStory),
            transition = BuildPostGameTransition(room)
        });
        await BroadcastPostGameTransition(room);
    }

    public async Task CancelPostGameStoryDraft(string commandId)
    {
        var (room, actor) = RequireStoryDeveloper(RoomActorCapability.OperatePostGameStoryDirector);
        try { _postGameStories.CancelDraft(room, actor, commandId); }
        catch (Exception exception) { throw StoryHubException(exception); }
        room.PostGamePhase = PostGamePhase.StoryRequested;
        QueueRoomRecovery(room, "post_game_story_draft_cancelled");
        await Clients.OthersInGroup(room.Id).SendAsync("PostGameStoryCleared", _postGameStories.ToPublicDto(room.PostGameStory));
        await Clients.Caller.SendAsync("PostGameStoryDeveloperStateChanged", _postGameStories.ToHostDto(room.PostGameStory));
        await BroadcastPostGameTransition(room);
    }

    public async Task FinishPostGameStory(string commandId)
    {
        var (room, actor) = RequireStoryDeveloper(RoomActorCapability.OperatePostGameStoryDirector);
        try { _postGameStories.Finish(room, actor, commandId); }
        catch (Exception exception) { throw StoryHubException(exception); }
        room.PostGamePhase = PostGamePhase.Completed;
        QueueRoomRecovery(room, "post_game_story_finished");
        await Clients.Group(room.Id).SendAsync("PostGameStoryStateChanged", _postGameStories.ToPublicDto(room.PostGameStory));
        await BroadcastPostGameTransition(room);
    }

    public async Task TakeOverDeveloperOperator(string commandId, bool confirmation)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        var actor = _roomService.GetPlayer(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        if (!_developerAuthority.IsDeveloper(actor)) throw new HubException("developer_required");
        if (!confirmation || string.IsNullOrWhiteSpace(commandId)) throw new HubException("developer_takeover_confirmation_required");
        _developerAuthority.EnsureActiveOperator(room, actor, Context.ConnectionId, takeover: true);
        _developerAuthority.Audit(room, actor, RoomActorCapability.UseDeveloperTools, "operator_takeover", "success", commandId: commandId);
        await BroadcastDeveloperAuthorityState(room);
    }

    private (Room Room, Player Actor) RequireStoryDeveloper(RoomActorCapability capability)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        var actor = _roomService.GetPlayer(Context.ConnectionId) ?? throw new HubException("room_membership_required");
        if (!_developerAuthority.IsDeveloper(actor) || !_developerAuthority.FeatureAllows(capability))
            throw new HubException(_developerAuthority.IsDeveloper(actor) ? "feature_disabled" : "developer_required");
        if (!_developerAuthority.EnsureActiveOperator(room, actor, Context.ConnectionId) ||
            !_developerAuthority.IsActiveOperator(room, actor, Context.ConnectionId))
            throw new HubException("developer_operator_read_only");
        return (room, actor);
    }

    private static HubException StoryHubException(Exception exception) => exception switch
    {
        HubException hub => hub,
        UnauthorizedAccessException => new HubException("developer_required"),
        ArgumentException argument => new HubException(argument.Message),
        InvalidOperationException invalid => new HubException(invalid.Message),
        _ => new HubException("post_game_story_failed")
    };
}
