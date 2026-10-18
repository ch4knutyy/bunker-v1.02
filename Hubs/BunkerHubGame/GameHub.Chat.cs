using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public async Task GetRoomChatHistory()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        foreach (var player in RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value).Where(player => player.IsAi))
        {
            _roomChat.EnsureCompanion(room.Id, new AiChatCompanion
            {
                Id = RoomService.GetPlayerKey(player),
                Name = player.Name,
                PlayerStableId = RoomService.GetPlayerKey(player),
                Provider = player.AiProvider,
                Model = player.AiModel
            });
        }
        await Clients.Caller.SendAsync("RoomChatHistory", _roomChat.GetHistory(room.Id));
        await Clients.Caller.SendAsync("AiPresentationUpdated", AiPresentationStatePayload(room));
    }

    // Reconnect-safe canonical snapshot for the presentation controls. This does not mutate
    // the queue and deliberately exposes only public scheduling metadata.
    public object GetAiPresentationState()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        return AiPresentationStatePayload(room);
    }

    public async Task SendRoomChatMessage(string text, string clientMessageId)
    {
        if (!_roomService.TryGetCurrentPlayer(Context.ConnectionId, out var room, out var player)) throw new HubException("chat_room_required");
        if (!_roomChat.TryAddHumanMessage(room.Id, RoomService.GetPlayerKey(player), player.Name, text, clientMessageId, out var message, out var error))
            throw new HubException(error ?? "chat_message_rejected");
        await Clients.Group(room.Id).SendAsync("RoomChatMessageReceived", message!);
        _aiConversation?.QueueHumanMessage(room, message!);
    }

    public async Task AddDefaultAiCompanions()
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        _aiParticipants.Add(room, 2);
        await BroadcastAiParticipants(room);
    }

    public async Task AddAiPlayers(int count)
    {
        var room = RequireLobbyHost();
        _aiParticipants.Add(room, count);
        await BroadcastAiParticipants(room);
    }

    public async Task RemoveAiPlayer(string stablePlayerId)
    {
        var room = RequireLobbyHost();
        if (_aiParticipants.Remove(room, stablePlayerId)) _aiConversation?.CancelRoom(room.Id);
        await BroadcastAiParticipants(room);
    }

    public async Task ConfigureAiProvider(string stablePlayerId, string provider, string model)
    {
        var room = RequireLobbyHost();
        var normalizedProvider = AiProviderManagementService.NormalizeProvider(provider);
        if (string.IsNullOrWhiteSpace(normalizedProvider)) throw new HubException("ai_provider_unknown");
        var normalizedModel = model?.Trim() ?? "";
        if (normalizedModel.Length > 200) throw new HubException("ai_model_invalid");
        if (_aiProviderManagement == null || !await _aiProviderManagement.IsAllowedModelAsync(normalizedProvider, normalizedModel, Context.ConnectionAborted))
            throw new HubException("ai_model_unavailable");
        var player = RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value)
            .FirstOrDefault(item => item.IsAi && string.Equals(RoomService.GetPlayerKey(item), stablePlayerId, StringComparison.OrdinalIgnoreCase))
            ?? throw new HubException("ai_player_not_found");
        player.AiProvider = normalizedProvider;
        player.AiModel = normalizedModel;
        _roomService.UpdatePlayer(player.ConnectionId, player);
        _roomChat.UpdateCompanionProvider(room.Id, stablePlayerId, normalizedProvider, normalizedModel);
        await BroadcastAiParticipants(room);
    }

    public Task<AiProviderCatalogDto> GetAiProviderCatalog(string provider)
    {
        RequireLobbyHost();
        return _aiProviderManagement?.GetCatalogAsync(provider, Context.ConnectionAborted)
            ?? Task.FromResult(new AiProviderCatalogDto(AiProviderManagementService.NormalizeProvider(provider), false, "ai_provider_unavailable", []));
    }

    public Task<AiProviderDiagnosticDto> GetAiProviderDiagnostics(string stablePlayerId)
    {
        var room = RequireLobbyHost();
        var player = RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value)
            .FirstOrDefault(item => item.IsAi && string.Equals(RoomService.GetPlayerKey(item), stablePlayerId, StringComparison.OrdinalIgnoreCase))
            ?? throw new HubException("ai_player_not_found");
        return Task.FromResult(_aiProviderManagement?.GetDiagnostics(stablePlayerId, player.AiProvider, player.AiModel)
            ?? new AiProviderDiagnosticDto("error", "ai_provider_unavailable", 0, 0, null, null, null, null));
    }

    public async Task<AiProviderDiagnosticDto> TestAiProviderConnection(string stablePlayerId)
    {
        var room = RequireLobbyHost();
        var player = RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value)
            .FirstOrDefault(item => item.IsAi && string.Equals(RoomService.GetPlayerKey(item), stablePlayerId, StringComparison.OrdinalIgnoreCase))
            ?? throw new HubException("ai_player_not_found");
        if (_aiProviderManagement == null || _aiProvider == null) throw new HubException("ai_provider_unavailable");
        if (!await _aiProviderManagement.IsAllowedModelAsync(player.AiProvider, player.AiModel, Context.ConnectionAborted))
            throw new HubException("ai_model_unavailable");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(Context.ConnectionAborted);
        timeout.CancelAfter(TimeSpan.FromSeconds(15));
        var reply = await _aiProvider.GenerateReplyAsync(new AiChatCompanion
        {
            Id = "connection-test", PlayerStableId = RoomService.GetPlayerKey(player), Name = player.Name,
            Provider = player.AiProvider, Model = player.AiModel
        }, "Reply with OK.", timeout.Token);
        return _aiProviderManagement.GetDiagnostics(RoomService.GetPlayerKey(player), player.AiProvider, player.AiModel);
    }

    public async Task SetAiChatResponsesEnabled(bool enabled)
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        _roomChat.SetAiResponsesEnabled(room.Id, enabled);
        if (!enabled) _aiConversation?.CancelRoom(room.Id);
        await Clients.Group(room.Id).SendAsync("RoomChatSettingsUpdated", new { aiResponsesEnabled = enabled });
    }

    public async Task RemoveAiChatCompanion(string companionId)
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        var companion = _roomChat.GetCompanions(room.Id).FirstOrDefault(x => x.Id == companionId);
        if (companion != null && _aiParticipants.Remove(room, companion.PlayerStableId)) _aiConversation?.CancelRoom(room.Id);
        await BroadcastAiParticipants(room);
    }

    public async Task<bool> StartAiPresentation(string characteristicKey)
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        return _aiPresentation != null && await _aiPresentation.StartAsync(room, characteristicKey, Context.ConnectionAborted);
    }

    public async Task<bool> PauseAiPresentation()
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        return _aiPresentation != null && await _aiPresentation.PauseAsync(room, Context.ConnectionAborted);
    }

    public async Task<bool> ResumeAiPresentation()
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        return _aiPresentation != null && await _aiPresentation.ResumeAsync(room, Context.ConnectionAborted);
    }

    public async Task<bool> NextAiPresentationSpeaker(bool skip = false)
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        return _aiPresentation != null && await _aiPresentation.NextAsync(room, skip, Context.ConnectionAborted);
    }

    public async Task<bool> EndAiPresentation()
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        return _aiPresentation != null && await _aiPresentation.EndAsync(room, Context.ConnectionAborted);
    }

    public async Task<bool> RetryAiPresentationSpeaker()
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        return _aiPresentation != null && await _aiPresentation.RetryAsync(room, Context.ConnectionAborted);
    }

    public async Task<bool> CompleteAiPresentationHumanTurn()
    {
        if (!_roomService.TryGetCurrentPlayer(Context.ConnectionId, out var room, out var player)) throw new HubException("chat_room_required");
        if (player.IsAi) throw new HubException("ai_presentation_required");
        return _aiPresentation != null && await _aiPresentation.CompleteHumanTurnAsync(room, RoomService.GetPlayerKey(player), Context.ConnectionAborted);
    }

    public async Task<bool> BeginAiDiscussion()
    {
        if (!IsCallerHost()) throw new HubException("host_required");
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        return _aiPresentation != null && await _aiPresentation.BeginDiscussionAsync(room, Context.ConnectionAborted);
    }

    private async Task BroadcastAiParticipants(Room room)
    {
        await Clients.Group(room.Id).SendAsync("RoomChatCompanionsUpdated", _roomChat.GetCompanions(room.Id).Select(x => new { x.Id, x.Name, x.PlayerStableId, x.Provider, x.Model }));
        await Clients.Group(room.Id).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));
        await BroadcastLobbyState(room);
    }

    private static object AiPresentationStatePayload(Room room) => new
    {
		Status = room.Presentation.Status.ToString(),
		room.Presentation.CharacteristicKey,
        room.Presentation.UsesAutomaticCharacteristicSelection,
        room.Presentation.CurrentSpeakerStablePlayerId,
        room.Presentation.LastGenerationError,
        room.Presentation.CurrentSpeakerStatus,
        room.Presentation.CurrentIndex,
        room.Presentation.RoundNumber,
        participantCount = room.Presentation.ParticipantStablePlayerIds.Count,
        completedCount = room.Presentation.CompletedSpeakerStablePlayerIds.Count
    };
}
