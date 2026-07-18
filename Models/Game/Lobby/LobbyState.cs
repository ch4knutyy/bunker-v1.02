namespace Bunker.Models;

public enum LobbyParticipationRole { Player, Spectator }
public sealed record LobbyMemberDto(string PlayerId, string DisplayName, string Role, bool IsCurrentHost,
    bool IsGameplayParticipant, bool IsSpectator, bool IsTechnicalGm, bool IsOmniscientGm,
    bool IsReady, bool IsConnected, bool IsAccountBound, string? BlockedReason);
public sealed record LobbyStateDto(string Lifecycle, int GameplayPlayerCount, int SpectatorCount,
    int TechnicalGmCount, int OmniscientGmCount, int ReadyCount, int TotalConnectedMembers,
    bool CanStart, IReadOnlyList<string> Blockers, long StateVersion, DateTimeOffset UpdatedAtUtc,
    IReadOnlyList<LobbyMemberDto> Members, int ReadyRequiredCount, bool HasPassword, LobbyGameSettingsDto Settings,
    long SettingsRevision, bool SettingsFrozen, IReadOnlyList<LobbySettingsWarningDto> SettingsWarnings,
    IReadOnlyList<LobbyAuditEventDto> RecentEvents, long GuestWarningRevision, long GuestWarningRequestedRevision);
public sealed record LobbyParticipationPreviewDto(string TargetPlayerId, string TargetName,
    string CurrentRole, string RequestedRole, bool WillResetReady, bool CanApply, IReadOnlyList<string> Blockers);
public sealed record LobbyStartPreviewDto(int GameplayPlayerCount, int SpectatorCount, int TechnicalGmCount,
    int OmniscientGmCount, IReadOnlyList<string> NotReadyMembers, IReadOnlyList<string> DisconnectedMembers,
    IReadOnlyList<string> Blockers, bool CanStart, long StateVersion, string PreviewToken, DateTimeOffset ExpiresAtUtc,
    int GuestGameplayPlayerCount);
