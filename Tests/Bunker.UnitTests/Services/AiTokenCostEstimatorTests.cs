using Bunker.Services;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests.Services;

public sealed class AiTokenCostEstimatorTests
{
    [Fact]
    public void Report_separates_estimates_from_provider_usage_and_projects_five_ai_costs()
    {
        var estimator = new AiTokenCostEstimator(Options.Create(new AiTokenCostOptions()), TimeProvider.System);
        estimator.RecordDryRun(AiTokenRequestKind.Presentation, "Presentation mode: " + new string('x', 400));
        estimator.RecordProviderResponse(AiTokenRequestKind.Discussion, "Discussion mode: one", "Groq", new(100, 40, 10, 5, 140));
        estimator.RecordProviderResponse(AiTokenRequestKind.Discussion, "Discussion mode: two", "Groq", new(120, 60, 15, 5, 180));

        var report = estimator.BuildReport();
        var presentation = report.Statistics.Single(item => item.RequestKind == "presentation");
        var discussion = report.Statistics.Single(item => item.RequestKind == "discussion");
        var projection = report.Projections.Single(item => item.RequestKind == "discussion" && item.ResponsesPerAi == 10);

        Assert.Equal(1, presentation.ApproximateCount);
        Assert.Equal(2, discussion.ProviderReportedCount);
        Assert.Equal(2, discussion.NonOpenAiProviderReportedCount);
        Assert.Equal(220, discussion.Input.Sum);
        Assert.Equal(100, discussion.Input.Median);
        Assert.Equal(120, discussion.Input.P90);
        Assert.Equal(25, discussion.Reasoning.Sum);
        Assert.Equal(50, projection.TotalRequests);

        var initialReportPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "ai-cost-report.json"));
        new AiTokenCostEstimator(Options.Create(new AiTokenCostOptions()), TimeProvider.System).WriteReport(initialReportPath);
    }
}
