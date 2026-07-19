using Bunker.Models.GameData;
using System.Text.Json.Serialization;

namespace Bunker.Models;

public enum RoomSnapshotRestoreStatus { Restorable, Blocked, Restored }

public sealed class RoomSnapshot
{
    public string SnapshotId { get; init; } = "";
    public DateTimeOffset CreatedAtUtc { get; init; }
    public string CreatedByPlayerId { get; init; } = "";
    public string Reason { get; init; } = "";
    public string? RelatedActionType { get; init; }
    public string? RelatedCommandId { get; init; }
    public int RoundNumber { get; init; }
    public string Phase { get; init; } = "";
    public int StateVersion { get; init; }
    public string Fingerprint { get; init; } = "";
    public RoomSnapshotRestoreStatus RestoreStatus { get; set; } = RoomSnapshotRestoreStatus.Restorable;
    public string? BlockedReason { get; set; }
    public DateTimeOffset? RestoredAtUtc { get; set; }
    public string? RestoredByPlayerId { get; set; }
    internal string HostTopologyPlayerId { get; init; } = "";
    internal HashSet<string> PlayerTopologyIds { get; init; } = new(StringComparer.OrdinalIgnoreCase);
    internal RoomSnapshotState State { get; init; } = new();
}

public sealed class RoomSnapshotState
{
    public RoomState State { get; set; }
    public RoomGameSettings GameSettings { get; set; } = new();
    public RoomGameSettings? FrozenGameSettings { get; set; }
    public long SettingsRevision { get; set; } = 1;
    public bool SettingsFrozen { get; set; }
    public int? ResolvedBunkerCapacity { get; set; }
    public string HostDisplayName { get; set; } = "";
    public int CurrentRound { get; set; }
    public GamePhase CurrentPhase { get; set; }
    public string? CurrentTurnPlayerId { get; set; }
    public bool IsPaused { get; set; }
    public string? PauseReason { get; set; }
    public DateTimeOffset? PausedAtUtc { get; set; }
    public string? PausedByPlayerId { get; set; }
    public GameTimerState GameTimer { get; set; } = new();
    public Dictionary<string, string> CurrentRoundReveals { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<int, RoundDiceRoll> RoundDiceRolls { get; set; } = new();
    public bool AdditionalInventoryGrantedAfterRound3 { get; set; }
    public int ThreatsTriggeredCount { get; set; }
    public HashSet<string> TriggeredThreatIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public HashSet<int> ThreatRoundsTriggered { get; set; } = new();
    public bool IsThreatRevealed { get; set; }
    public int? ThreatRevealedAtRound { get; set; }
    public ThreatData? CurrentThreat { get; set; }
    public ThreatInteractionState? ThreatState { get; set; }
    public Dictionary<string, string> VotingReadyResponses { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public VotingSession? CurrentVoting { get; set; }
    public Apocalypse? Apocalypse { get; set; }
    public BunkerInfo? Bunker { get; set; }
    public ScenarioSituationState? ScenarioSituations { get; set; }
    public BunkerIntelState? BunkerIntel { get; set; }
    public PendingEliminationState? PendingElimination { get; set; }
    public Dictionary<string, Player> PlayersByStableId { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed record RoomSnapshotMetadataDto(
    string SnapshotId,
    DateTimeOffset CreatedAtUtc,
    string CreatedByPlayerId,
    string Reason,
    string? RelatedActionType,
    string? RelatedCommandId,
    int RoundNumber,
    string Phase,
    int StateVersion,
    string Fingerprint,
    string RestoreStatus,
    string? BlockedReason,
    DateTimeOffset? RestoredAtUtc,
    string? RestoredByPlayerId);

public sealed record RoomSnapshotDiffDto(string Category, int ChangedCount);

public sealed record RoomSnapshotRestorePreviewDto(
    RoomSnapshotMetadataDto? Snapshot,
    bool CanRestore,
    string? BlockedReason,
    IReadOnlyList<RoomSnapshotDiffDto> Changes,
    DateTimeOffset ServerTimestampUtc);

public sealed record RoomSnapshotRestoreResult(
    bool Success,
    bool IsDuplicate,
    string? ErrorCode,
    string? Message,
    string? RestoredSnapshotId,
    string? SafetySnapshotId);
