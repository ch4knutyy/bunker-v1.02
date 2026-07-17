namespace Bunker.Models;

public sealed class OmniscientGmOptions
{
    public const string SectionName = "OmniscientGm";
    public bool Enabled { get; set; }
    public string DevelopmentBootstrapKey { get; set; } = string.Empty;
}

public sealed record OmniscientGmPreviewDto(
    string PlayerId, string PlayerName, bool WillLeaveGameplay,
    bool WillRemoveVote, bool WillRemoveReadiness, bool WillClearCurrentTurn,
    bool WillRemoveThreatParticipation, bool IsIrreversibleInRoom, bool CanApply);
public sealed record OmniscientGmStateDto(
    bool IsSpectatorGm, string PlayerId, string PlayerName, bool IsRoomHost,
    string PublicRole, string PublicDescription);
