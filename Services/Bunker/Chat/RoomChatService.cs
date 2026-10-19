using System.Collections.Concurrent;
using Bunker.Models;

namespace Bunker.Services;

public sealed class RoomChatService
{
    public const int MaxMessageLength = 800;
    private const int MaxHistory = 120;
    private const int MaxSocialMemories = 40;
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
        => TryAddHumanMessage(roomId, senderId, senderName, text, clientMessageId, 0, out message, out error);

    public bool TryAddHumanMessage(string roomId, string senderId, string senderName, string text, string clientMessageId, int round,
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
            RememberSocialStatement(state, message, round);
            return true;
        }
    }

    public RoomChatMessage AddAiMessage(string roomId, AiChatCompanion companion, string text, int round = 0)
    {
        var state = _rooms.GetOrAdd(roomId, _ => new());
        lock (state.SyncRoot)
        {
            var message = Add(state, roomId, companion.Id, companion.Name, ChatSenderType.Ai, NormalizeText(text) ?? "…", null, _time.GetUtcNow());
            RememberSocialStatement(state, message, round);
            return message;
        }
    }

    public RoomChatMessage AddSystemMessage(string roomId, string text, string eventId)
        => TryAddSystemMessage(roomId, text, eventId, null, null, out var message) ? message! : GetHistory(roomId).First(x => x.Id == eventId);

    public bool TryAddSystemMessage(
        string roomId,
        string text,
        string eventId,
        string? systemEventType,
        IReadOnlyDictionary<string, string>? systemEventData,
        out RoomChatMessage? message)
    {
        message = null;
        var state = _rooms.GetOrAdd(roomId, _ => new());
        lock (state.SyncRoot)
        {
            if (state.MessageIds.Contains(eventId)) return false;
            message = new RoomChatMessage(eventId, roomId, "system", "System", _time.GetUtcNow(), ChatSenderType.System, text,
                systemEventType, systemEventData);
            state.Messages.Add(message); state.MessageIds.Add(eventId);
            while (state.Messages.Count > MaxHistory) state.Messages.RemoveAt(0);
            return true;
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

    public void EnsureCompanion(string roomId, AiChatCompanion companion)
    {
        var state = _rooms.GetOrAdd(roomId, _ => new());
        lock (state.SyncRoot)
        {
            var existing = state.Companions.FirstOrDefault(x => x.PlayerStableId == companion.PlayerStableId);
            if (existing == null) state.Companions.Add(companion);
            else
            {
                existing.Provider = companion.Provider;
                existing.Model = companion.Model;
                existing.BehavioralProfile = companion.BehavioralProfile;
                existing.SocialMemory = companion.SocialMemory;
                existing.Relationships = companion.Relationships;
            }
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

    public bool UpdateCompanionProvider(string roomId, string playerStableId, string provider, string model)
    {
        if (!_rooms.TryGetValue(roomId, out var state)) return false;
        lock (state.SyncRoot)
        {
            var companion = state.Companions.FirstOrDefault(x => x.PlayerStableId == playerStableId);
            if (companion == null) return false;
            companion.Provider = provider;
            companion.Model = model;
            return true;
        }
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
    private static void RememberSocialStatement(RoomChatState state, RoomChatMessage message, int round)
    {
        var type = ClassifySocialStatement(message.Text);
        if (type == null) return;
        var mentioned = FindMentionedCompanion(state, message);
        var summary = message.Text.Length <= 220 ? message.Text : message.Text[..220].TrimEnd() + "…";
        foreach (var companion in state.Companions)
        {
            if (string.Equals(companion.PlayerStableId, message.SenderId, StringComparison.OrdinalIgnoreCase) && mentioned == null) continue;
            var target = mentioned;
            companion.SocialMemory.Add(new(message.Timestamp, message.SenderId, message.SenderName,
                target?.PlayerStableId, target?.Name, type.Value, summary, round, 85, "chat"));
            TrimMemories(companion.SocialMemory);

            var isSpeaker = string.Equals(companion.PlayerStableId, message.SenderId, StringComparison.OrdinalIgnoreCase);
            var isDirectTarget = target != null && string.Equals(companion.PlayerStableId, target.PlayerStableId, StringComparison.OrdinalIgnoreCase);
            // Observers retain the public event, but only speaker/recipient relationships change when it is addressed.
            if (target != null && !isSpeaker && !isDirectTarget) continue;
            var relatedPlayerId = isSpeaker
                ? target?.PlayerStableId
                : message.SenderId;
            var relatedPlayerName = isSpeaker
                ? target?.Name
                : message.SenderName;
            if (!string.IsNullOrWhiteSpace(relatedPlayerId) && !string.Equals(relatedPlayerId, companion.PlayerStableId, StringComparison.OrdinalIgnoreCase))
                ApplyRelationshipChange(companion.Relationships, relatedPlayerId, relatedPlayerName ?? "", type.Value);
        }
    }

    private static AiChatCompanion? FindMentionedCompanion(RoomChatState state, RoomChatMessage message) => state.Companions
        .Where(companion => !string.Equals(companion.PlayerStableId, message.SenderId, StringComparison.OrdinalIgnoreCase))
        .OrderByDescending(companion => companion.Name.Length)
        .FirstOrDefault(companion => MentionsName(message.Text, companion.Name));

    // Covers direct mentions and common Ukrainian vocative endings without trying to parse ambiguous prose.
    private static bool MentionsName(string text, string name) =>
        text.Contains(name, StringComparison.OrdinalIgnoreCase) ||
        name.Length >= 4 && text.Contains(name[..^1], StringComparison.OrdinalIgnoreCase);

    private static AiSocialMemoryType? ClassifySocialStatement(string text)
    {
        if (ContainsAny(text, "зрад", "преда", "betray")) return AiSocialMemoryType.Betrayal;
        if (ContainsAny(text, "погрож", "викину", "не пущу", "threat", "throw you out")) return AiSocialMemoryType.Threat;
        if (ContainsAny(text, "обіцяю", "обещаю", "i promise", "обіця")) return AiSocialMemoryType.Promise;
        if (ContainsAny(text, "пропоную союз", "давай союз", "предлагаю союз", "alliance proposal", "form an alliance")) return AiSocialMemoryType.AllianceProposal;
        if (ContainsAny(text, "домовились", "погоджуюсь", "договорились", "согласен", "agreed", "i agree")) return AiSocialMemoryType.Agreement;
        if (ContainsAny(text, "підтримую", "я за", "поддерживаю", "i support")) return AiSocialMemoryType.Support;
        if (ContainsAny(text, "не згод", "я проти", "не соглас", "i oppose", "i disagree")) return AiSocialMemoryType.Opposition;
        if (ContainsAny(text, "змінив думку", "передумав", "изменил мнение", "changed my mind")) return AiSocialMemoryType.OpinionChange;
        return null;
    }

    private static void ApplyRelationshipChange(List<AiSocialRelationship> relationships, string targetId, string targetName, AiSocialMemoryType type)
    {
        var relationship = relationships.FirstOrDefault(item => string.Equals(item.TargetId, targetId, StringComparison.OrdinalIgnoreCase));
        if (relationship == null)
        {
            relationship = new AiSocialRelationship { TargetId = targetId, TargetName = targetName };
            relationships.Add(relationship);
        }
        else if (!string.IsNullOrWhiteSpace(targetName)) relationship.TargetName = targetName;

        var (trust, tension, cooperation, rivalry) = type switch
        {
            AiSocialMemoryType.Support or AiSocialMemoryType.Agreement => (4, -2, 4, -1),
            AiSocialMemoryType.Promise or AiSocialMemoryType.AllianceProposal => (3, -1, 5, -1),
            AiSocialMemoryType.Betrayal => (-10, 8, -8, 8),
            AiSocialMemoryType.Threat => (-7, 7, -5, 6),
            AiSocialMemoryType.Opposition => (-4, 4, -3, 3),
            AiSocialMemoryType.OpinionChange => (1, -1, 1, 0),
            _ => (0, 0, 0, 0)
        };
        relationship.Trust = Math.Clamp(relationship.Trust + trust, 0, 100);
        relationship.Tension = Math.Clamp(relationship.Tension + tension, 0, 100);
        relationship.Cooperation = Math.Clamp(relationship.Cooperation + cooperation, 0, 100);
        relationship.Rivalry = Math.Clamp(relationship.Rivalry + rivalry, 0, 100);
    }

    private static void TrimMemories(List<AiSocialMemoryEntry> memories)
    {
        while (memories.Count > MaxSocialMemories)
        {
            var expendable = memories.FindIndex(item => item.Type is not (AiSocialMemoryType.Promise or AiSocialMemoryType.Threat or AiSocialMemoryType.Betrayal));
            memories.RemoveAt(expendable >= 0 ? expendable : 0);
        }
    }

    private static bool ContainsAny(string value, params string[] terms) =>
        terms.Any(term => value.Contains(term, StringComparison.OrdinalIgnoreCase));
    private static string? NormalizeText(string? text)
    {
        var value = text?.Trim();
        return string.IsNullOrWhiteSpace(value) || value.Length > MaxMessageLength ? null : value;
    }
}
