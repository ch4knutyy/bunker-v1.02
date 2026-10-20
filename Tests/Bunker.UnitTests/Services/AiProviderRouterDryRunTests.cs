using System.Net;
using System.Text;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests.Services;

public sealed class AiProviderRouterDryRunTests
{
    [Fact]
    public async Task Dry_run_only_blocks_the_provider_when_explicitly_enabled()
    {
        var liveHandler = new CountingHandler();
        var dryRunHandler = new CountingHandler();
        var live = CreateRouter(dryRun: false, liveHandler);
        var dryRun = CreateRouter(dryRun: true, dryRunHandler);
        var companion = new AiChatCompanion { PlayerStableId = "ai", Provider = "Groq", Model = "openai/gpt-oss-120b" };

        var liveReply = await live.Router.GenerateReplyAsync(companion, "Discussion mode: test", CancellationToken.None);
        var dryRunReply = await dryRun.Router.GenerateReplyAsync(companion, "Discussion mode: test", CancellationToken.None);

        Assert.Equal("Mock reply.", liveReply.Text);
        Assert.Null(liveReply.ErrorCode);
        Assert.Equal(1, liveHandler.RequestCount);
        Assert.Equal("ai_cost_dry_run", dryRunReply.ErrorCode);
        Assert.Equal(0, dryRunHandler.RequestCount);
        File.Delete(live.ReportPath);
        File.Delete(dryRun.ReportPath);
    }

    private static (AiProviderRouter Router, string ReportPath) CreateRouter(bool dryRun, CountingHandler handler)
    {
        var reportPath = Path.Combine(Path.GetTempPath(), $"bunker-ai-cost-{Guid.NewGuid():N}.json");
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AiChat:GroqApiKey"] = "test-key",
            ["AiTokenCost:ReportPath"] = reportPath
        }).Build();
        var clients = new TestHttpClientFactory(handler);
        var chatOptions = Options.Create(new AiChatOptions());
        var costs = Options.Create(new AiTokenCostOptions { DryRun = dryRun });
        var management = new AiProviderManagementService(configuration, clients, chatOptions, new AiProviderRateLimitService(TimeProvider.System));
        var router = new AiProviderRouter(new StubGemini(),
            new GroqAiProvider(clients, configuration, NullLogger<OpenAiCompatibleAiProvider>.Instance),
            new OpenRouterAiProvider(clients, configuration, NullLogger<OpenAiCompatibleAiProvider>.Instance),
            management, new AiTokenCostEstimator(costs, TimeProvider.System),
            new OpenAiInputTokenCounter(clients, configuration, costs), costs, configuration, TimeProvider.System);
        return (router, reportPath);
    }

    private sealed class StubGemini : IGeminiAiProvider
    {
        public Task<AiProviderReply> GenerateReplyAsync(string prompt, CancellationToken cancellationToken) =>
            Task.FromResult(new AiProviderReply("unused"));
    }

    private sealed class TestHttpClientFactory(HttpMessageHandler handler) : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(handler, disposeHandler: false);
    }

    private sealed class CountingHandler : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent("""{"choices":[{"message":{"content":"Mock reply."}}]}""", Encoding.UTF8, "application/json")
            });
        }
    }
}
