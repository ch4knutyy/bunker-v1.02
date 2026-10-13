namespace Bunker.Models;

/// <summary>Compatibility history from operation-based threats. New narrative reveals use only <see cref="ThreatAuditEventType.Revealed"/>.</summary>
public enum ThreatAuditEventType
{
    Revealed,
    LegacyOperation
}

public sealed class ThreatAuditEntry
{
    public long SequenceId { get; init; }
    public DateTimeOffset TimestampUtc { get; init; }
    public ThreatAuditEventType EventType { get; init; }
    public string ThreatId { get; init; } = "";
    public string ThreatName { get; init; } = "";
    public int Round { get; init; }
    public string? ActorPlayerId { get; init; }
    public Dictionary<string, string> Metadata { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    public string? CommandId { get; init; }
}
