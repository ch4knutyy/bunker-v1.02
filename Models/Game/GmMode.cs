namespace Bunker.Models;

public enum GmMode { PlayerHost, TechnicalGm, OmniscientGm }

public enum GmCapability
{
    ViewPlayerControls,
    ManagePlayersWithoutHiddenData,
    ManagePublicGameState,
    PeekHiddenCharacteristics,
    BrowseFutureThreatCatalog,
    ManageGlobalContent,
    EnterOmniscientGm,
    ViewHiddenGameState,
    ViewHiddenPlayerState,
    ViewHiddenRoomState,
    ViewSecretVotes,
    ManageOmniscientGmMode
}

public static class GmCapabilities
{
    public static bool Allows(GmMode mode, GmCapability capability) => capability switch
    {
        GmCapability.ViewPlayerControls => true,
        GmCapability.ManagePlayersWithoutHiddenData => true,
        GmCapability.ManagePublicGameState => true,
        GmCapability.PeekHiddenCharacteristics => false,
        GmCapability.BrowseFutureThreatCatalog => false,
        GmCapability.ManageGlobalContent => mode == GmMode.TechnicalGm,
        GmCapability.EnterOmniscientGm => mode == GmMode.OmniscientGm,
        GmCapability.ViewHiddenGameState => mode == GmMode.OmniscientGm,
        GmCapability.ViewHiddenPlayerState => mode == GmMode.OmniscientGm,
        GmCapability.ViewHiddenRoomState => mode == GmMode.OmniscientGm,
        GmCapability.ViewSecretVotes => mode == GmMode.OmniscientGm,
        GmCapability.ManageOmniscientGmMode => mode == GmMode.OmniscientGm,
        _ => false
    };
}
