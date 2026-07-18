namespace Bunker.Services;

public sealed class RoomRecoveryOptions
{
	public const string SectionName = "RoomRecovery";
	public bool Enabled { get; set; } = true;
	public int SnapshotIntervalSeconds { get; set; } = 5;
	public int RetentionHours { get; set; } = 24;
}
