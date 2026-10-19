using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class AiBehaviorProfileTests
{
    [Fact]
    public void Profiles_are_stable_and_reflect_distinct_character_traits()
    {
        var cautious = new Player { StablePlayerId = "ai-cautious", CharacterTrait = new CharacterTrait { Name = "Обережний" } };
        var assertive = new Player { StablePlayerId = "ai-assertive", CharacterTrait = new CharacterTrait { Name = "Сміливий" } };

        var first = AiBehaviorProfileFactory.Create(cautious, "Verify evidence before taking risks.");
        var repeated = AiBehaviorProfileFactory.Create(cautious, "Verify evidence before taking risks.");
        var second = AiBehaviorProfileFactory.Create(assertive, "Make a strong case for survival.");

        Assert.Equal(first.CommunicationStyle, repeated.CommunicationStyle);
        Assert.Equal(first.RiskTolerance, repeated.RiskTolerance);
        Assert.Equal("careful", first.CommunicationStyle);
        Assert.Equal("direct", second.CommunicationStyle);
        Assert.True(first.RiskTolerance < second.RiskTolerance);
        Assert.Equal("Verify evidence before taking risks.", first.Motivation);
    }
}
