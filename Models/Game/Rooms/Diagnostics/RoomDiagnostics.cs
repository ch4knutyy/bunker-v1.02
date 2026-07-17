namespace Bunker.Models;

public enum RoomIntegritySeverity { Info, Warning, Error }

public sealed record RoomIntegrityIssueDto(
    string Code,
    string Severity,
    string Message,
    string? AffectedPlayerId,
    string? AffectedPlayerName,
    bool CanAutoFix);

public sealed record RoomIntegrityReportDto(
    bool IsHealthy,
    DateTimeOffset CheckedAtUtc,
    int ErrorCount,
    int WarningCount,
    int InfoCount,
    IReadOnlyList<RoomIntegrityIssueDto> Issues,
    DateTimeOffset ServerTimestampUtc);

public sealed record RoomAutoFixChangeDto(string Code, string Message, int Count);

public sealed record RoomAutoFixPreviewDto(
    DateTimeOffset PreviewedAtUtc,
    IReadOnlyList<RoomAutoFixChangeDto> Changes,
    int ChangeCount,
    bool HasChanges,
    DateTimeOffset ServerTimestampUtc);

public enum GmAuditResult { Success, Rejected, Failed }

public sealed class GmAuditEntry
{
    public long Id { get; init; }
    public DateTimeOffset OccurredAtUtc { get; init; }
    public string ActorPlayerId { get; init; } = "";
    public string ActionType { get; init; } = "";
    public string? TargetPlayerId { get; init; }
    public GmAuditResult Result { get; init; }
    public string Summary { get; init; } = "";
    public string? CommandId { get; init; }
    public string? RelatedSnapshotId { get; set; }
    public bool CanUndo { get; set; }
    public bool WasUndone { get; set; }
    public DateTimeOffset? UndoneAtUtc { get; set; }
    public long? UndoAuditEntryId { get; set; }
    public string? ErrorCode { get; init; }
}

public sealed record GmAuditEntryDto(
    long Id,
    DateTimeOffset OccurredAtUtc,
    string ActorPlayerId,
    string ActionType,
    string? TargetPlayerId,
    string Result,
    string Summary,
    string? CommandId,
    string? RelatedSnapshotId,
    bool CanUndo,
    bool WasUndone,
    DateTimeOffset? UndoneAtUtc,
    long? UndoAuditEntryId,
    string? ErrorCode);
