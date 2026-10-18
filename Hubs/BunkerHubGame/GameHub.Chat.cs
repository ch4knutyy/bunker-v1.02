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
        var existing = _roomChat.GetCompanions(room.Id).Select(companion => companion.Name).ToHashSet(StringComparer.Ordinal);
        var defaults = new (string Name, string Motivation)[]
        {
            ("Марія", "Build alliances while protecting your chances of entering the bunker."),
            ("Олексій", "Question weak claims and negotiate for survival.")
        };
        foreach (var (name, motivation) in defaults.Where(candidate => !existing.Contains(candidate.Name)))
        {
            var character = _generator.Generate(name);
            _roomChat.AddCompanion(room.Id, new AiChatCompanion { Name = name, Motivation = motivation, Character = character });
        }
        await Clients.Group(room.Id).SendAsync("RoomChatCompanionsUpdated", _roomChat.GetCompanions(room.Id).Select(x => new { x.Id, x.Name }));
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
        if (_roomChat.RemoveCompanion(room.Id, companionId)) _aiConversation?.CancelRoom(room.Id);
        await Clients.Group(room.Id).SendAsync("RoomChatCompanionsUpdated", _roomChat.GetCompanions(room.Id).Select(x => new { x.Id, x.Name }));
    }
}
