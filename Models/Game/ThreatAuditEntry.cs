namespace Bunker.Models;

public enum ThreatAuditEventType
{
    Revealed,
    AttemptStarted,
    AttemptReset,
    Aborted,
    CompletedSuccess,
    CompletedFailure,
    EffectsApplied
}

public sealed class ThreatAuditEntry
{
    public long SequenceId { get; init; }
    public DateTimeOffset TimestampUtc { get; init; }
    public ThreatAuditEventType EventType { get; init; }
    public string ThreatId { get; init; } = "";
    public string ThreatName { get; init; } = "";
    public int Round { get; init; }
    public string? AttemptId { get; init; }
    public string? ActorPlayerId { get; init; }
    public Dictionary<string, string> Metadata { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public string? CommandId { get; init; }
}

public sealed record ThreatAuditEntryDto(
    long SequenceId,
    DateTimeOffset TimestampUtc,
    string EventType,
    string ThreatId,
    string ThreatName,
    int Round,
    string? ActorPlayerId,
    IReadOnlyDictionary<string, string> Metadata);
