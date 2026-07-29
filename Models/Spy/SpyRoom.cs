namespace Bunker.Models.Spy
{
    public class SpyRoom
    {
        public string RoomCode { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public string HostPlayerId { get; set; } = "";
        public Dictionary<string, SpyPlayer> Players { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public int CurrentRound { get; set; }
        public bool IsRoundActive { get; set; }
        public string? SelectedLocationId { get; set; }
        public string? SelectedLocationName { get; set; }
        public string? SpyPlayerId { get; set; }
        public DateTime? RoundStartedAt { get; set; }
        public DateTime? RoundEndsAtUtc { get; set; }
        public int RoundDurationSeconds { get; set; } = 480;
        public int MinimumPlayers { get; set; } = 3;
        public bool RolesRevealed { get; set; }
        public string? RoundId { get; set; }
        public bool SpyGuessUsed { get; set; }
        public SpyRoundResult? RoundResult { get; set; }
        public List<SpyGameEvent> Journal { get; set; } = [];
        public List<SpySnapshot> SnapshotHistory { get; set; } = [];
        public HashSet<string> ProcessedCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
        public Dictionary<string, SpyRestoreResult> RestoreCommandResults { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    }

    public sealed class SpyRoundResult
    {
        public string Reason { get; set; } = "";
        public string Winner { get; set; } = "";
        public string? AccusedPlayerId { get; set; }
        public string? GuessedLocationId { get; set; }
        public DateTime CompletedAtUtc { get; set; }
    }

    public sealed class SpyGameEvent
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public DateTime CreatedAtUtc { get; set; } = DateTime.UtcNow;
        public string Type { get; set; } = "";
        public string ActorPlayerId { get; set; } = "";
        public string? TargetPlayerId { get; set; }
        public string? CommandId { get; set; }
        public string MessageKey { get; set; } = "";
        public string? PlayerName { get; set; }
    }

    public sealed class SpySnapshot
    {
        public string Id { get; set; } = Guid.NewGuid().ToString("N");
        public string Scope { get; set; } = "Spy";
        public string RoomId { get; set; } = "";
        public DateTime CreatedAtUtc { get; set; }
        public string CreatedByPlayerId { get; set; } = "";
        public int Version { get; set; } = 1;
        public string Fingerprint { get; set; } = "";
        public string Description { get; set; } = "";
        public string? RelatedCommandId { get; set; }
        public string HostTopologyPlayerId { get; set; } = "";
        public List<string> PlayerTopologyIds { get; set; } = [];
        public SpySnapshotState State { get; set; } = new();
    }

    public sealed class SpySnapshotState
    {
        public int CurrentRound { get; set; }
        public bool IsRoundActive { get; set; }
        public string? SelectedLocationId { get; set; }
        public string? SelectedLocationName { get; set; }
        public string? SpyPlayerId { get; set; }
        public DateTime? RoundStartedAt { get; set; }
        public DateTime? RoundEndsAtUtc { get; set; }
        public int? RoundRemainingSeconds { get; set; }
        public int RoundDurationSeconds { get; set; }
        public int MinimumPlayers { get; set; }
        public bool RolesRevealed { get; set; }
        public string? RoundId { get; set; }
        public bool SpyGuessUsed { get; set; }
        public SpyRoundResult? RoundResult { get; set; }
        public List<SpyPlayerSnapshot> Players { get; set; } = [];
    }

    public sealed class SpyPlayerSnapshot
    {
        public string PlayerId { get; set; } = "";
        public string Name { get; set; } = "";
        public bool IsHost { get; set; }
        public bool IsReady { get; set; }
        public string? VoteTargetPlayerId { get; set; }
        public int Score { get; set; }
    }

    public sealed record SpyRestoreResult(
        bool Success,
        bool IsDuplicate,
        string? ErrorCode,
        string? RestoredSnapshotId,
        string? SafetySnapshotId);
}
