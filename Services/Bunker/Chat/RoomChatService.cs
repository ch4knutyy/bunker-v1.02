using System.Collections.Concurrent;
using Bunker.Models;

namespace Bunker.Services;

public sealed class RoomChatService
{
    public const int MaxMessageLength = 800;
    private const int MaxHistory = 120;
    private static readonly TimeSpan HumanRateWindow = TimeSpan.FromSeconds(3);
    private readonly TimeProvider _time;
    private readonly ConcurrentDictionary<string, RoomChatState> _rooms = new(StringComparer.OrdinalIgnoreCase);

    private sealed class RoomChatState
    {
        public object SyncRoot { get; } = new();
        public List<RoomChatMessage> Messages { get; } = [];
        public Dictionary<string, DateTimeOffset> LastHumanMessageAt { get; } = new(StringComparer.OrdinalIgnoreCase);
        public HashSet<string> MessageIds { get; } = new(StringComparer.OrdinalIgnoreCase);
        public List<AiChatCompanion> Companions { get; } = [];
        public bool AiResponsesEnabled { get; set; } = true;
    }

    public RoomChatService(TimeProvider time, RoomService? rooms = null)
    {
        _time = time;
        if (rooms != null) rooms.RoomRemoved += RemoveRoom;
    }

    public bool TryAddHumanMessage(string roomId, string senderId, string senderName, string text, string clientMessageId,
        out RoomChatMessage? message, out string? error)
    {
        message = null;
        error = null;
        var normalized = NormalizeText(text);
        if (normalized == null) { error = "chat_message_invalid"; return false; }
        var state = _rooms.GetOrAdd(roomId, _ => new());
        lock (state.SyncRoot)
        {
            if (!string.IsNullOrWhiteSpace(clientMessageId) && state.MessageIds.Contains(clientMessageId))
            {
                error = "chat_message_duplicate";
                return false;
            }
            var now = _time.GetUtcNow();
            if (state.LastHumanMessageAt.TryGetValue(senderId, out var last) && now - last < HumanRateWindow)
            {
                error = "chat_rate_limited";
                return false;
            }
            state.LastHumanMessageAt[senderId] = now;
            message = Add(state, roomId, senderId, senderName, ChatSenderType.Human, normalized, clientMessageId, now);
            return true;
        }
    }

    public RoomChatMessage AddAiMessage(string roomId, AiChatCompanion companion, string text)
    {
        var state = _rooms.GetOrAdd(roomId, _ => new());
        lock (state.SyncRoot)
            return Add(state, roomId, companion.Id, companion.Name, ChatSenderType.Ai, NormalizeText(text) ?? "…", null, _time.GetUtcNow());
    }

    public RoomChatMessage AddSystemMessage(string roomId, string text, string eventId)
    {
        var state = _rooms.GetOrAdd(roomId, _ => new());
        lock (state.SyncRoot)
        {
            if (state.MessageIds.Contains(eventId)) return state.Messages.First(x => x.Id == eventId);
            var message = new RoomChatMessage(eventId, roomId, "system", "System", _time.GetUtcNow(), ChatSenderType.System, text);
            state.Messages.Add(message); state.MessageIds.Add(eventId);
            while (state.Messages.Count > MaxHistory) state.Messages.RemoveAt(0);
            return message;
        }
    }

    public IReadOnlyList<RoomChatMessage> GetHistory(string roomId) => _rooms.TryGetValue(roomId, out var state)
        ? lockAndCopy(state, x => x.Messages.ToList()) : [];

    public IReadOnlyList<AiChatCompanion> GetCompanions(string roomId) => _rooms.TryGetValue(roomId, out var state)
        ? lockAndCopy(state, x => x.Companions.ToList()) : [];

    public bool AddCompanion(string roomId, AiChatCompanion companion)
    {
        var state = _rooms.GetOrAdd(roomId, _ => new());
        lock (state.SyncRoot)
        {
            if (state.Companions.Any(x => x.Id == companion.Id || x.PlayerStableId == companion.PlayerStableId)) return false;
            state.Companions.Add(companion);
            return true;
        }
    }

    public bool RemoveCompanion(string roomId, string companionId)
    {
        if (!_rooms.TryGetValue(roomId, out var state)) return false;
        lock (state.SyncRoot) return state.Companions.RemoveAll(companion => companion.Id == companionId) > 0;
    }

    public bool RemoveCompanionForPlayer(string roomId, string playerStableId)
    {
        if (!_rooms.TryGetValue(roomId, out var state)) return false;
        lock (state.SyncRoot) return state.Companions.RemoveAll(x => x.PlayerStableId == playerStableId) > 0;
    }

    public bool AiResponsesEnabled(string roomId) => !_rooms.TryGetValue(roomId, out var state) || lockAndCopy(state, x => x.AiResponsesEnabled);
    public void SetAiResponsesEnabled(string roomId, bool enabled) { var state = _rooms.GetOrAdd(roomId, _ => new()); lock (state.SyncRoot) state.AiResponsesEnabled = enabled; }
    public void RemoveRoom(string roomId) => _rooms.TryRemove(roomId, out _);

    private static T lockAndCopy<T>(RoomChatState state, Func<RoomChatState, T> action) { lock (state.SyncRoot) return action(state); }
    private static RoomChatMessage Add(RoomChatState state, string roomId, string senderId, string senderName, ChatSenderType type, string text, string? clientMessageId, DateTimeOffset timestamp)
    {
        var message = new RoomChatMessage(Guid.NewGuid().ToString("N"), roomId, senderId, senderName, timestamp, type, text);
        state.Messages.Add(message);
        if (!string.IsNullOrWhiteSpace(clientMessageId)) state.MessageIds.Add(clientMessageId);
        while (state.Messages.Count > MaxHistory) state.Messages.RemoveAt(0);
        return message;
    }
    private static string? NormalizeText(string? text)
    {
        var value = text?.Trim();
        return string.IsNullOrWhiteSpace(value) || value.Length > MaxMessageLength ? null : value;
    }
}
