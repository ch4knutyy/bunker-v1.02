using Bunker.Services.Threats;

namespace Bunker.UnitTests.Services.Threats;

public class PlanChoiceScoringServiceTests
{
    private readonly PlanChoiceScoringService _service = new();

    [Fact]
    public void StrongHasPriorityOverRelatedAndSupportForSamePlayer()
    {
        var result = Score(new[]
        {
            new PlanChoiceCapability("p1", "profession", new[] { "strong", "related_a", "related_b", "support" })
        });
        Assert.Equal(25, result.InternalScore);
    }

    [Fact]
    public void RelatedRequiresEveryTagFromOneGroup()
    {
        Assert.Equal(0, Score(new[] { new PlanChoiceCapability("p1", "profession", new[] { "related_a" }) }).InternalScore);
        Assert.Equal(14, Score(new[] { new PlanChoiceCapability("p1", "profession", new[] { "related_a", "related_b" }) }).InternalScore);
    }

    [Fact]
    public void HobbyUsesPointSixtyFiveMultiplier()
    {
        var result = Score(new[] { new PlanChoiceCapability("p1", "hobby", new[] { "strong" }) });
        Assert.Equal(16.25, result.InternalScore);
    }

    [Fact]
    public void OnePlayerContributesOnlyBestCapabilityTier()
    {
        var result = Score(new[]
        {
            new PlanChoiceCapability("p1", "profession", new[] { "support" }),
            new PlanChoiceCapability("p1", "hobby", new[] { "strong" })
        });
        Assert.Equal(16.25, result.InternalScore);
    }

    [Fact]
    public void SameCapabilityGroupCountsOnce()
    {
        var result = Score(new[]
        {
            new PlanChoiceCapability("p1", "profession", new[] { "strong" }),
            new PlanChoiceCapability("p2", "profession", new[] { "strong" })
        }, maxStrong: 2);
        Assert.Equal(25, result.InternalScore);
    }

    [Fact]
    public void ConsequenceCeilingNeverReturnsSafeSuccess()
    {
        var result = Score(new[] { new PlanChoiceCapability("p1", "profession", new[] { "strong" }) },
            baseScore: 100, ceiling: "success_with_consequence");
        Assert.Equal("success_with_consequence", result.Outcome);
    }

    private PlanChoiceScoreResult Score(IEnumerable<PlanChoiceCapability> capabilities, int maxStrong = 1,
        double baseScore = 0, string ceiling = "safe_success")
    {
        var plan = new PlanChoicePlan("plan", baseScore, ceiling, new[] { "strong" },
            new[] { (IReadOnlyList<string>)new[] { "related_a", "related_b" } }, new[] { "support" },
            new PlanChoiceTierScores(25, 14, 5));
        var request = new PlanChoiceScoreRequest(plan, capabilities.ToList(),
            new PlanChoiceLimits(maxStrong, 2, 2, 10), new PlanChoiceAssetScores(12, 10, 15, 8),
            new PlanChoiceThresholds(80, 55), 0, 0, 0, 0);
        return _service.Score(request, 0);
    }
}
