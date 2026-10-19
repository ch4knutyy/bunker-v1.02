using System.Net.Http.Headers;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

public sealed record AiProviderModelDto(string Id, string Name, bool IsFree);
public sealed record AiProviderCatalogDto(string Provider, bool CatalogAvailable, string? ErrorCode, IReadOnlyList<AiProviderModelDto> Models);
public sealed record AiProviderDiagnosticDto(string Status, string? LastError, int SuccessfulRequests, int FailedRequests,
    long? InputTokens, long? OutputTokens, int? CooldownSeconds, double? AverageResponseMilliseconds);

/// <summary>Server-only catalogue, validation, and diagnostics for explicitly selected AI providers.</summary>
public sealed class AiProviderManagementService(IConfiguration configuration, IHttpClientFactory clients,
    IOptions<AiChatOptions> chatOptions, AiProviderRateLimitService rateLimits)
{
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, AiProviderCatalogDto> _catalogs = new(StringComparer.OrdinalIgnoreCase);
    private readonly System.Collections.Concurrent.ConcurrentDictionary<string, AiProviderDiagnosticState> _diagnostics = new(StringComparer.OrdinalIgnoreCase);

    public async Task<AiProviderCatalogDto> GetCatalogAsync(string provider, CancellationToken cancellationToken)
    {
        provider = NormalizeProvider(provider);
        if (string.IsNullOrWhiteSpace(provider)) return new("", false, "ai_provider_unknown", []);
        if (provider == "Gemini")
        {
            var model = chatOptions.Value.GeminiModel?.Trim() ?? "";
            return new(provider, !string.IsNullOrWhiteSpace(model), string.IsNullOrWhiteSpace(model) ? "ai_model_not_configured" : null,
                string.IsNullOrWhiteSpace(model) ? [] : [new(model, model, false)]);
        }
        if (_catalogs.TryGetValue(provider, out var cached)) return cached;
        if (!HasApiKey(provider)) return new(provider, false, "ai_not_configured", []);

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, provider == "Groq"
                ? "https://api.groq.com/openai/v1/models"
                : "https://openrouter.ai/api/v1/models");
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", GetApiKey(provider));
            using var response = await clients.CreateClient(nameof(AiProviderManagementService)).SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return new(provider, false, ToError(response.StatusCode), []);
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            var data = document.RootElement.TryGetProperty("data", out var dataNode) && dataNode.ValueKind == JsonValueKind.Array ? dataNode : default;
            var models = data.ValueKind != JsonValueKind.Array ? [] : data.EnumerateArray()
                .Select(item =>
                {
                    var id = item.TryGetProperty("id", out var idNode) ? idNode.GetString()?.Trim() : null;
                    var name = item.TryGetProperty("name", out var nameNode) ? nameNode.GetString() : null;
                    return new { Id = id, Name = name };
                })
                .Where(item => !string.IsNullOrWhiteSpace(item.Id))
                .Select(item => new AiProviderModelDto(item.Id!, string.IsNullOrWhiteSpace(item.Name) ? item.Id! : item.Name!,
                    provider == "OpenRouter" && item.Id!.EndsWith(":free", StringComparison.OrdinalIgnoreCase)))
                .Where(model => provider != "OpenRouter" || model.IsFree)
                .OrderBy(model => model.Name, StringComparer.OrdinalIgnoreCase).ToList();
            var result = new AiProviderCatalogDto(provider, true, null, models);
            _catalogs[provider] = result;
            return result;
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { return new(provider, false, "ai_timeout", []); }
        catch (HttpRequestException) { return new(provider, false, "ai_network_error", []); }
    }

    public async Task<bool> IsAllowedModelAsync(string provider, string model, CancellationToken cancellationToken)
    {
        provider = NormalizeProvider(provider); model = model?.Trim() ?? "";
        if (string.IsNullOrWhiteSpace(model) || model.Length > 200 || model.Any(char.IsControl)) return false;
        if (provider == "Gemini") return string.Equals(model, chatOptions.Value.GeminiModel?.Trim(), StringComparison.Ordinal);
        if (provider == "OpenRouter" && !model.EndsWith(":free", StringComparison.OrdinalIgnoreCase)) return false;
        var configured = configuration.GetSection($"AiChat:{provider}AllowedModels").Get<string[]>() ?? [];
        if (configured.Contains(model, StringComparer.OrdinalIgnoreCase)) return true;
        var catalog = await GetCatalogAsync(provider, cancellationToken);
        return catalog.CatalogAvailable && catalog.Models.Any(item => string.Equals(item.Id, model, StringComparison.OrdinalIgnoreCase));
    }

    public AiProviderDiagnosticDto GetDiagnostics(string stablePlayerId, string provider, string model)
    {
        var state = _diagnostics.GetValueOrDefault(stablePlayerId);
        int? cooldown = string.Equals(provider, "Gemini", StringComparison.OrdinalIgnoreCase) && rateLimits.IsCoolingDown ? 20 : null;
        var status = !HasApiKey(NormalizeProvider(provider)) ? "missing_api_key"
            : string.IsNullOrWhiteSpace(model) ? "model_unavailable"
            : state?.LastError switch { "ai_rate_limited" => "rate_limited", { } => "error", _ => "configured" };
        return new(status, state?.LastError, state?.SuccessfulRequests ?? 0, state?.FailedRequests ?? 0,
            state?.InputTokens, state?.OutputTokens, cooldown, state?.AverageResponseMilliseconds);
    }

    public void RecordResult(string stablePlayerId, AiProviderReply reply, TimeSpan elapsed)
    {
        if (string.IsNullOrWhiteSpace(stablePlayerId)) return;
        _diagnostics.AddOrUpdate(stablePlayerId,
            _ => AiProviderDiagnosticState.From(reply, elapsed),
            (_, state) => state.Add(reply, elapsed));
    }

    public bool HasApiKey(string provider) => !string.IsNullOrWhiteSpace(GetApiKey(NormalizeProvider(provider)));
    public static string NormalizeProvider(string? provider) => provider?.Trim().ToLowerInvariant() switch
    {
        "gemini" => "Gemini", "groq" => "Groq", "openrouter" => "OpenRouter", _ => ""
    };
    private string? GetApiKey(string provider) => provider switch
    {
        "Gemini" => chatOptions.Value.GeminiApiKey,
        "Groq" => configuration["AiChat:GroqApiKey"] ?? Environment.GetEnvironmentVariable("GROQ_API_KEY"),
        "OpenRouter" => configuration["AiChat:OpenRouterApiKey"] ?? Environment.GetEnvironmentVariable("OPENROUTER_API_KEY"),
        _ => null
    };
    private static string ToError(System.Net.HttpStatusCode status) => status switch
    {
        System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden => "ai_auth_failed",
        System.Net.HttpStatusCode.NotFound => "ai_model_not_found",
        System.Net.HttpStatusCode.TooManyRequests => "ai_rate_limited",
        _ when (int)status >= 500 => "ai_provider_unavailable",
        _ => "ai_provider_failed"
    };
    private sealed record AiProviderDiagnosticState(int SuccessfulRequests, int FailedRequests, string? LastError,
        long? InputTokens, long? OutputTokens, double AverageResponseMilliseconds)
    {
        public static AiProviderDiagnosticState From(AiProviderReply reply, TimeSpan elapsed) => new(
            string.IsNullOrWhiteSpace(reply.ErrorCode) ? 1 : 0,
            string.IsNullOrWhiteSpace(reply.ErrorCode) ? 0 : 1,
            reply.ErrorCode,
            reply.Usage?.InputTokens,
            reply.Usage?.OutputTokens,
            elapsed.TotalMilliseconds);
        public AiProviderDiagnosticState Add(AiProviderReply reply, TimeSpan elapsed)
        {
            var success = SuccessfulRequests + (string.IsNullOrWhiteSpace(reply.ErrorCode) ? 1 : 0);
            var failure = FailedRequests + (string.IsNullOrWhiteSpace(reply.ErrorCode) ? 0 : 1);
            var count = success + failure;
            return new(success, failure, reply.ErrorCode,
                InputTokens + reply.Usage?.InputTokens,
                OutputTokens + reply.Usage?.OutputTokens,
                ((AverageResponseMilliseconds * (count - 1)) + elapsed.TotalMilliseconds) / count);
        }
    }
}
