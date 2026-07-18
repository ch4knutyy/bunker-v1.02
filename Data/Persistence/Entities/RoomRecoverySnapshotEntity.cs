namespace Bunker.Data.Persistence.Entities;

public sealed class RoomRecoverySnapshotEntity
{
	public string RoomCode { get; set; } = "";
	public int SchemaVersion { get; set; }
	public long Revision { get; set; }
	public string RoomState { get; set; } = "";
	public string StateJson { get; set; } = "";
	public string Fingerprint { get; set; } = "";
	public DateTime UpdatedAtUtc { get; set; }
	public DateTime? ExpiresAtUtc { get; set; }
	public Guid? GameSessionId { get; set; }
}
