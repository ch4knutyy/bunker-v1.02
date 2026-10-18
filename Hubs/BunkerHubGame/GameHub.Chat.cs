using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public async Task GetRoomChatHistory()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId) ?? throw new HubException("chat_room_required");
        await Clients.Caller.SendAsync("RoomChatHistory", _roomChat.GetHistory(room.Id));
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

    private async Task BroadcastAiParticipants(Room room)
    {
        await Clients.Group(room.Id).SendAsync("RoomChatCompanionsUpdated", _roomChat.GetCompanions(room.Id).Select(x => new { x.Id, x.Name, x.PlayerStableId }));
        await Clients.Group(room.Id).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));
        await BroadcastLobbyState(room);
    }
}
