namespace Bunker.Models;

public enum GmMode { PlayerHost, TechnicalGm, OmniscientGm }

public enum GmCapability
{
    ViewPlayerControls,
    ManagePlayersWithoutHiddenData,
    ManagePublicGameState,
    PeekHiddenCharacteristics,
    BrowseFutureThreatCatalog
}

public static class GmCapabilities
{
    public static bool Allows(GmMode mode, GmCapability capability) => capability switch
    {
        GmCapability.ViewPlayerControls => true,
        GmCapability.ManagePlayersWithoutHiddenData => true,
        GmCapability.ManagePublicGameState => true,
        GmCapability.PeekHiddenCharacteristics => mode == GmMode.OmniscientGm,
        GmCapability.BrowseFutureThreatCatalog => mode == GmMode.OmniscientGm,
        _ => false
    };
}
