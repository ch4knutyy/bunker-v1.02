using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class AiProviderManagementServiceTests
{
    [Fact]
    public async Task Restricts_models_to_configured_gemini_and_free_or_allowlisted_openrouter_ids()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["AiChat:OpenRouterAllowedModels:0"] = "manual-model:free"
        }).Build();
        var service = new AiProviderManagementService(configuration, new EmptyHttpClientFactory(),
            Options.Create(new AiChatOptions { GeminiApiKey = "key", GeminiModel = "gemini-2.5-flash" }),
            new AiProviderRateLimitService(TimeProvider.System));

        Assert.True(await service.IsAllowedModelAsync("Gemini", "gemini-2.5-flash", CancellationToken.None));
        Assert.False(await service.IsAllowedModelAsync("Gemini", "other-gemini", CancellationToken.None));
        Assert.True(await service.IsAllowedModelAsync("OpenRouter", "manual-model:free", CancellationToken.None));
        Assert.False(await service.IsAllowedModelAsync("OpenRouter", "openrouter/free", CancellationToken.None));
        Assert.False(await service.IsAllowedModelAsync("OpenRouter", "paid-model", CancellationToken.None));
    }

    private sealed class EmptyHttpClientFactory : IHttpClientFactory
    {
        public HttpClient CreateClient(string name) => new(new HttpClientHandler());
    }
}
