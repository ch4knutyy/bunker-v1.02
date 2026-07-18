namespace Bunker.Models;

public sealed class RoomRecoverySnapshotData
{
	public string Id { get; set; } = "";
	public string Name { get; set; } = "";
	public string? PasswordVerificationHash { get; set; }
	public int MaxPlayers { get; set; }
	public int MinPlayers { get; set; }
	public string HostPlayerId { get; set; } = "";
	public string HostName { get; set; } = "";
	public DateTime CreatedAt { get; set; }
	public GmMode GmMode { get; set; }
	public Guid? GameSessionId { get; set; }
	public GameCompletionState? Completion { get; set; }
	public long GuestWarningRevision { get; set; } = 1;
	public HashSet<string> IrreversibleOmniscientPlayerIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
	public RoomSnapshotState State { get; set; } = new();
	public Dictionary<string, RoomRecoveryPlayerIdentityData> PlayerIdentities { get; set; } = new(StringComparer.OrdinalIgnoreCase);
	public List<GmAuditEntry> GmAuditLog { get; set; } = [];
	public long NextGmAuditSequenceId { get; set; }
	public List<ThreatAuditEntry> ThreatAuditLog { get; set; } = [];
	public long NextThreatAuditSequenceId { get; set; }
}

public sealed class RoomRecoveryPlayerIdentityData
{
	public Guid? AccountUserId { get; set; }
	public string ReconnectTokenHash { get; set; } = "";
}
