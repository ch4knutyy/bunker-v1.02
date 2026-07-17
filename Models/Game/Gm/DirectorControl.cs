namespace Bunker.Models;

public sealed record DirectorActionRequestDto(string ActionType, string? TargetPlayerId = null,
    string? Category = null, string? Option = null);
public sealed record DirectorActionPreviewDto(string ActionType, string SafeTarget,
    IReadOnlyList<string> AffectedCategories, int MutationCount, bool SnapshotAvailable,
    bool CanUndo, string? IrreversibleWarning, long CurrentStateVersion, string PreviewToken,
    DateTimeOffset ExpiresAtUtc, bool CanApply, IReadOnlyList<string> Blockers);
public sealed record DirectorActionApplyDto(string ActionType, bool Applied, bool Duplicate,
    string? SnapshotId, bool CanUndo, long StateVersion);
