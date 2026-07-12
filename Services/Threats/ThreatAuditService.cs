using Bunker.Models;

namespace Bunker.Services.Threats;

public sealed class ThreatAuditService(TimeProvider timeProvider)
{
    public const int MaxEntriesPerRoom = 200;
    private static readonly HashSet<string> SafeMetadataKeys = new(StringComparer.OrdinalIgnoreCase)
    {
        "outcome", "status", "reason"
    };

    public bool Append(
        Room room,
        ThreatAuditEventType eventType,
        string? actorPlayerId = null,
        string? commandId = null,
        IReadOnlyDictionary<string, string>? metadata = null,
        bool deduplicateTransition = false)
    {
        lock (room.ThreatSyncRoot)
        {
            var threatId = room.CurrentThreat?.Id ?? room.ThreatState?.CurrentThreatId ?? "";
            var round = room.ThreatRevealedAtRound ?? room.ThreatState?.ThreatRevealedRound ?? room.CurrentRound;
            if (string.IsNullOrWhiteSpace(threatId)) return false;
            var attemptId = room.ThreatAuditLog
                .LastOrDefault(entry => entry.EventType is ThreatAuditEventType.Revealed or ThreatAuditEventType.AttemptReset &&
                    string.Equals(entry.ThreatId, threatId, StringComparison.OrdinalIgnoreCase))
                ?.SequenceId.ToString(System.Globalization.CultureInfo.InvariantCulture);

            if (!string.IsNullOrWhiteSpace(commandId) && room.ThreatAuditLog.Any(entry =>
                    entry.EventType == eventType && string.Equals(entry.CommandId, commandId, StringComparison.OrdinalIgnoreCase)))
                return false;

            if (deduplicateTransition && room.ThreatAuditLog.Any(entry =>
                    entry.EventType == eventType && entry.Round == round &&
                    string.Equals(entry.ThreatId, threatId, StringComparison.OrdinalIgnoreCase) &&
                    (eventType == ThreatAuditEventType.Revealed || string.Equals(entry.AttemptId, attemptId, StringComparison.Ordinal))))
                return false;

            var safeMetadata = metadata == null
                ? new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
                : metadata.Where(pair => SafeMetadataKeys.Contains(pair.Key) && !string.IsNullOrWhiteSpace(pair.Value))
                    .ToDictionary(pair => pair.Key, pair => pair.Value, StringComparer.OrdinalIgnoreCase);

            room.ThreatAuditLog.Add(new ThreatAuditEntry
            {
                SequenceId = ++room.NextThreatAuditSequenceId,
                TimestampUtc = timeProvider.GetUtcNow(),
                EventType = eventType,
                ThreatId = threatId,
                ThreatName = room.CurrentThreat?.Name ?? threatId,
                Round = round,
                AttemptId = eventType == ThreatAuditEventType.Revealed ? null : attemptId,
                ActorPlayerId = string.IsNullOrWhiteSpace(actorPlayerId) ? null : actorPlayerId,
                CommandId = string.IsNullOrWhiteSpace(commandId) ? null : commandId,
                Metadata = safeMetadata
            });

            var overflow = room.ThreatAuditLog.Count - MaxEntriesPerRoom;
            if (overflow > 0) room.ThreatAuditLog.RemoveRange(0, overflow);
            return true;
        }
    }

    public IReadOnlyList<ThreatAuditEntryDto> GetRecent(Room room, int take = 20)
    {
        lock (room.ThreatSyncRoot)
        {
            return room.ThreatAuditLog
                .OrderByDescending(entry => entry.SequenceId)
                .Take(Math.Clamp(take, 1, 20))
                .Select(entry => new ThreatAuditEntryDto(
                    entry.SequenceId,
                    entry.TimestampUtc,
                    ToWireEventType(entry.EventType),
                    entry.ThreatId,
                    entry.ThreatName,
                    entry.Round,
                    entry.ActorPlayerId,
                    new Dictionary<string, string>(entry.Metadata, StringComparer.OrdinalIgnoreCase)))
                .ToList();
        }
    }

    private static string ToWireEventType(ThreatAuditEventType eventType) => eventType switch
    {
        ThreatAuditEventType.Revealed => "revealed",
        ThreatAuditEventType.AttemptStarted => "attempt_started",
        ThreatAuditEventType.AttemptReset => "attempt_reset",
        ThreatAuditEventType.Aborted => "aborted",
        ThreatAuditEventType.ForcedSuccess => "forced_success",
        ThreatAuditEventType.ForcedFailure => "forced_failure",
        ThreatAuditEventType.CompletedSuccess => "completed_success",
        ThreatAuditEventType.CompletedFailure => "completed_failure",
        ThreatAuditEventType.EffectsApplied => "effects_applied",
        _ => "unknown"
    };
}
