using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

/// <summary>Routes a companion to its explicitly assigned provider; there is no cross-provider fallback.</summary>
public sealed class AiProviderRouter(IGeminiAiProvider gemini, GroqAiProvider groq, OpenRouterAiProvider openRouter) : IAiProvider
{
    public Task<AiProviderReply> GenerateReplyAsync(string prompt, CancellationToken cancellationToken) =>
        gemini.GenerateReplyAsync(prompt, cancellationToken);

    public Task<AiProviderReply> GenerateReplyAsync(AiChatCompanion companion, string prompt, CancellationToken cancellationToken) =>
        (companion.Provider ?? "Gemini").Trim().ToLowerInvariant() switch
        {
            "gemini" => gemini.GenerateReplyAsync(prompt, cancellationToken),
            "groq" => groq.GenerateReplyAsync(companion, prompt, cancellationToken),
            "openrouter" => openRouter.GenerateReplyAsync(companion, prompt, cancellationToken),
            _ => Task.FromResult(new AiProviderReply(null, "ai_provider_unknown"))
        };
}

public abstract class OpenAiCompatibleAiProvider(IHttpClientFactory clients, IConfiguration configuration)
{
    protected abstract string ProviderId { get; }
    protected abstract string BaseUrl { get; }
    protected abstract string ApiKeyEnvironmentName { get; }

    public async Task<AiProviderReply> GenerateReplyAsync(AiChatCompanion companion, string prompt, CancellationToken cancellationToken)
    {
        var apiKey = configuration["AiChat:" + ProviderId + "ApiKey"] ?? Environment.GetEnvironmentVariable(ApiKeyEnvironmentName);
        if (string.IsNullOrWhiteSpace(apiKey)) return new(null, "ai_not_configured");
        if (string.IsNullOrWhiteSpace(companion.Model)) return new(null, "ai_model_not_configured");

        using var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "chat/completions")
        {
            Content = JsonContent.Create(new { model = companion.Model, messages = new[] { new { role = "user", content = prompt } } })
        };
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
        try
        {
            using var response = await clients.CreateClient(nameof(OpenAiCompatibleAiProvider)).SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode)
                return new(null, response.StatusCode switch
                {
                    System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden => "ai_auth_failed",
                    System.Net.HttpStatusCode.NotFound => "ai_model_not_found",
                    System.Net.HttpStatusCode.TooManyRequests => "ai_rate_limited",
                    _ when (int)response.StatusCode >= 500 => "ai_provider_unavailable",
                    _ => "ai_provider_failed"
                });
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            var text = document.RootElement.TryGetProperty("choices", out var choices) && choices.GetArrayLength() > 0 &&
                choices[0].TryGetProperty("message", out var message) && message.TryGetProperty("content", out var content)
                ? content.GetString() : null;
            return string.IsNullOrWhiteSpace(text) ? new(null, "ai_empty_response") : new(text);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested) { return new(null, "ai_cancelled"); }
        catch (OperationCanceledException) { return new(null, "ai_timeout"); }
        catch (HttpRequestException) { return new(null, "ai_network_error"); }
    }
}

public sealed class GroqAiProvider(IHttpClientFactory clients, IConfiguration configuration) : OpenAiCompatibleAiProvider(clients, configuration)
{
    protected override string ProviderId => "Groq";
    protected override string BaseUrl => "https://api.groq.com/openai/v1/";
    protected override string ApiKeyEnvironmentName => "GROQ_API_KEY";
}

public sealed class OpenRouterAiProvider(IHttpClientFactory clients, IConfiguration configuration) : OpenAiCompatibleAiProvider(clients, configuration)
{
    protected override string ProviderId => "OpenRouter";
    protected override string BaseUrl => "https://openrouter.ai/api/v1/";
    protected override string ApiKeyEnvironmentName => "OPENROUTER_API_KEY";
}
