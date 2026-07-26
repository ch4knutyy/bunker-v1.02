namespace Bunker.Models;

public sealed record HostTransferPreviewDto(
    bool Allowed,
    string Code,
    string CurrentHostPlayerId,
    string CurrentHostName,
    string TargetPlayerId,
    string TargetPlayerName,
    bool TargetIsConnected,
    bool TargetIsActive,
    string Warning,
    string Fingerprint);
