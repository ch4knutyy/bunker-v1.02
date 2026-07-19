using Bunker.Models;
using Bunker.Models.ViewModels;

namespace Bunker.UnitTests;

public sealed class GmPrivacyBoundaryTests
{
    [Fact]
    public void PlayerHost_CannotPeekOrBrowseFutureThreats()
    {
        Assert.True(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.ViewPlayerControls));
        Assert.False(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.PeekHiddenCharacteristics));
        Assert.False(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.BrowseFutureThreatCatalog));
        Assert.False(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.ManageGlobalContent));
    }

    [Fact]
    public void OmniscientGm_HasExplicitHiddenDataCapabilities()
    {
        Assert.False(GmCapabilities.Allows(GmMode.OmniscientGm, GmCapability.PeekHiddenCharacteristics));
        Assert.False(GmCapabilities.Allows(GmMode.OmniscientGm, GmCapability.BrowseFutureThreatCatalog));
    }

    [Fact]
    public void PlayerHostControlDto_DoesNotExposeHiddenCharacteristics()
    {
        var names = typeof(PlayerHostControlDto).GetProperties().Select(property => property.Name).ToHashSet();
        var forbidden = new[]
        {
            "Personality", "Body", "Profession", "ProfessionItem", "PhysicalHealth",
            "AdditionalConditionEffects", "MentalHealth", "Hobby", "CharacterTrait",
            "Phobia", "Inventory", "Property", "Fact", "SpecialCardCount"
        };

        Assert.DoesNotContain(forbidden, names.Contains);
    }
}
