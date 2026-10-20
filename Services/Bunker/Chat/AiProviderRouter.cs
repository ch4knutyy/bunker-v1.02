using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text.Json;
using System.Diagnostics;
using Bunker.Models;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

/// <summary>Routes a companion to its explicitly assigned provider; there is no cross-provider fallback.</summary>
public sealed class AiProviderRouter(IGeminiAiProvider gemini, GroqAiProvider groq, OpenRouterAiProvider openRouter,
    AiProviderManagementService management, AiTokenCostEstimator costs, OpenAiInputTokenCounter exactInputTokens,
    IOptions<AiTokenCostOptions> costOptions, IConfiguration configuration, TimeProvider time) : IAiProvider
{
    public Task<AiProviderReply> GenerateReplyAsync(string prompt, CancellationToken cancellationToken) =>
        gemini.GenerateReplyAsync(prompt, cancellationToken);

    public async Task<AiProviderReply> GenerateReplyAsync(AiChatCompanion companion, string prompt, CancellationToken cancellationToken)
    {
        var kind = AiTokenCostEstimator.Classify(prompt);
        var exactInput = await exactInputTokens.CountAsync(prompt, cancellationToken);
        if (costOptions.Value.DryRun)
        {
            costs.RecordDryRun(kind, prompt, exactInput);
            costs.TryWriteReport(ReportPath(configuration));
            return new(null, "ai_cost_dry_run");
        }
        var started = time.GetTimestamp();
        var result = await ((companion.Provider ?? "Gemini").Trim().ToLowerInvariant() switch
        {
            "gemini" => gemini.GenerateReplyAsync(prompt, cancellationToken),
            "groq" => groq.GenerateReplyAsync(companion, prompt, cancellationToken),
            "openrouter" => openRouter.GenerateReplyAsync(companion, prompt, cancellationToken),
            _ => Task.FromResult(new AiProviderReply(null, "ai_provider_unknown"))
        });
        management.RecordResult(companion.PlayerStableId, result, time.GetElapsedTime(started));
        costs.RecordProviderResponse(kind, prompt, companion.Provider, result.Usage, exactInput);
        costs.TryWriteReport(ReportPath(configuration));
        return result;
    }

    private static string ReportPath(IConfiguration configuration) =>
        Path.GetFullPath(configuration["AiTokenCost:ReportPath"] ?? "ai-cost-report.json");
}

public abstract class OpenAiCompatibleAiProvider(IHttpClientFactory clients, IConfiguration configuration,
    ILogger<OpenAiCompatibleAiProvider> logger)
{
    protected abstract string ProviderId { get; }
    protected abstract string BaseUrl { get; }
    protected abstract string ApiKeyEnvironmentName { get; }

    public async Task<AiProviderReply> GenerateReplyAsync(AiChatCompanion companion, string prompt, CancellationToken cancellationToken)
    {
        var apiKey = configuration["AiChat:" + ProviderId + "ApiKey"] ?? Environment.GetEnvironmentVariable(ApiKeyEnvironmentName);
        if (string.IsNullOrWhiteSpace(apiKey)) return new(null, "ai_not_configured");
        if (string.IsNullOrWhiteSpace(companion.Model)) return new(null, "ai_model_not_configured");

        var kind = AiTokenCostEstimator.Classify(prompt).ToString().ToLowerInvariant();
        var timeoutSeconds = Math.Clamp(configuration.GetValue<int?>("AiChat:TimeoutSeconds") ?? 20, 5, 60);
        var timeoutLimit = TimeSpan.FromSeconds(timeoutSeconds);
        var maxCompletionTokens = Math.Clamp(configuration.GetValue<int?>("AiChat:MaxCompletionTokens") ?? 320, 64, 512);
        var maxRetryAfter = TimeSpan.FromSeconds(Math.Clamp(configuration.GetValue<int?>("AiChat:MaxRateLimitRetrySeconds") ?? 5, 1, 10));
        var total = Stopwatch.StartNew();
        var attempt = 0;
        var compactRetry = false;
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(timeoutLimit);
        try
        {
            while (true)
            {
                var requestPrompt = compactRetry ? AiPromptCompactor.Compact(prompt) : prompt;
                using var request = new HttpRequestMessage(HttpMethod.Post, BaseUrl + "chat/completions")
                {
                    Content = JsonContent.Create(new
                    {
                        model = companion.Model,
                        messages = new[] { new { role = "user", content = requestPrompt } },
                        max_completion_tokens = maxCompletionTokens
                    })
                };
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", apiKey);
                using var response = await clients.CreateClient(nameof(OpenAiCompatibleAiProvider)).SendAsync(request, timeout.Token);
                if (!response.IsSuccessStatusCode)
                {
                    var errorCode = ToErrorCode(response.StatusCode);
                    if (response.StatusCode == System.Net.HttpStatusCode.RequestEntityTooLarge && attempt == 0 && !compactRetry)
                    {
                        attempt++;
                        compactRetry = true;
                        logger.LogWarning("AI request compact retry: {Provider} {Model} {Kind} estimatedInputTokens={EstimatedInputTokens} httpStatus={HttpStatus} retries={Retries}",
                            ProviderId, companion.Model, kind, AiTokenCostEstimator.EstimatePromptTokens(requestPrompt), (int)response.StatusCode, attempt);
                        continue;
                    }

                    var retryAfter = response.Headers.RetryAfter?.Delta;
                    var remaining = timeoutLimit - total.Elapsed;
                    if (response.StatusCode == System.Net.HttpStatusCode.TooManyRequests && attempt == 0 && retryAfter is { } delay &&
                        delay > TimeSpan.Zero && delay <= maxRetryAfter && delay < remaining)
                    {
                        attempt++;
                        logger.LogInformation("AI request rate-limit retry: {Provider} {Model} {Kind} estimatedInputTokens={EstimatedInputTokens} httpStatus={HttpStatus} retryAfterMs={RetryAfterMs} retries={Retries}",
                            ProviderId, companion.Model, kind, AiTokenCostEstimator.EstimatePromptTokens(requestPrompt), (int)response.StatusCode, delay.TotalMilliseconds, attempt);
                        await Task.Delay(delay, timeout.Token);
                        continue;
                    }

                    logger.LogWarning("AI request failed: {Provider} {Model} {Kind} estimatedInputTokens={EstimatedInputTokens} httpStatus={HttpStatus} errorCode={ErrorCode} durationMs={DurationMs} retries={Retries}",
                        ProviderId, companion.Model, kind, AiTokenCostEstimator.EstimatePromptTokens(requestPrompt), (int)response.StatusCode, errorCode, total.Elapsed.TotalMilliseconds, attempt);
                    return new(null, errorCode);
                }

                using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
                var hasChoice = document.RootElement.TryGetProperty("choices", out var choices) &&
                    choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() > 0;
                var choice = hasChoice ? choices[0] : default;
                var text = hasChoice && choice.TryGetProperty("message", out var message) && message.TryGetProperty("content", out var content)
                    ? content.GetString() : null;
                var hasReasoningWithoutText = hasChoice && choice.TryGetProperty("message", out var responseMessage) &&
                    (HasText(responseMessage, "reasoning") || HasText(responseMessage, "reasoning_content"));
                var wasTruncated = hasChoice && choice.TryGetProperty("finish_reason", out var finishReason) &&
                    finishReason.ValueKind == JsonValueKind.String &&
                    string.Equals(finishReason.GetString(), "length", StringComparison.OrdinalIgnoreCase);
                var usage = AiTokenUsageParser.FromOpenAiCompatible(document.RootElement);
                var result = string.IsNullOrWhiteSpace(text)
                    ? new AiProviderReply(null, hasReasoningWithoutText ? "ai_reasoning_exhausted" : "ai_empty_response", usage)
                    : wasTruncated ? new AiProviderReply(null, "ai_response_truncated", usage) : new AiProviderReply(text, Usage: usage);
                logger.LogInformation("AI request completed: {Provider} {Model} {Kind} estimatedInputTokens={EstimatedInputTokens} actualInputTokens={InputTokens} actualOutputTokens={OutputTokens} reasoningTokens={ReasoningTokens} cachedInputTokens={CachedInputTokens} httpStatus=200 durationMs={DurationMs} retries={Retries} errorCode={ErrorCode}",
                    ProviderId, companion.Model, kind, AiTokenCostEstimator.EstimatePromptTokens(requestPrompt), usage?.InputTokens, usage?.OutputTokens,
                    usage?.ReasoningTokens, usage?.CachedInputTokens, total.Elapsed.TotalMilliseconds, attempt, result.ErrorCode);
                return result;
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            logger.LogInformation("AI request cancelled: {Provider} {Model} {Kind} durationMs={DurationMs} retries={Retries}",
                ProviderId, companion.Model, kind, total.Elapsed.TotalMilliseconds, attempt);
            return new(null, "ai_cancelled");
        }
        catch (OperationCanceledException)
        {
            logger.LogWarning("AI request timed out: {Provider} {Model} {Kind} estimatedInputTokens={EstimatedInputTokens} durationMs={DurationMs} retries={Retries}",
                ProviderId, companion.Model, kind, AiTokenCostEstimator.EstimatePromptTokens(prompt), total.Elapsed.TotalMilliseconds, attempt);
            return new(null, "ai_timeout");
        }
        catch (HttpRequestException)
        {
            logger.LogWarning("AI request network failure: {Provider} {Model} {Kind} estimatedInputTokens={EstimatedInputTokens} durationMs={DurationMs} retries={Retries}",
                ProviderId, companion.Model, kind, AiTokenCostEstimator.EstimatePromptTokens(prompt), total.Elapsed.TotalMilliseconds, attempt);
            return new(null, "ai_network_error");
        }
        catch (JsonException)
        {
            logger.LogWarning("AI request returned invalid JSON: {Provider} {Model} {Kind} durationMs={DurationMs} retries={Retries}",
                ProviderId, companion.Model, kind, total.Elapsed.TotalMilliseconds, attempt);
            return new(null, "ai_provider_failed");
        }
    }

    private static string ToErrorCode(System.Net.HttpStatusCode status) => status switch
    {
        System.Net.HttpStatusCode.RequestEntityTooLarge => "ai_request_too_large",
        System.Net.HttpStatusCode.Unauthorized or System.Net.HttpStatusCode.Forbidden => "ai_auth_failed",
        System.Net.HttpStatusCode.NotFound => "ai_model_not_found",
        System.Net.HttpStatusCode.TooManyRequests => "ai_rate_limited",
        _ when (int)status >= 500 => "ai_provider_unavailable",
        _ => "ai_provider_failed"
    };

    private static bool HasText(JsonElement parent, string property) =>
        parent.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String &&
        !string.IsNullOrWhiteSpace(value.GetString());
}

internal static class AiPromptCompactor
{
    public static string Compact(string prompt)
    {
        var contextStart = prompt.IndexOf('{');
        var contextEnd = contextStart < 0 ? -1 : prompt.IndexOf("\n\n", contextStart, StringComparison.Ordinal);
        if (contextStart < 0 || contextEnd < 0) return "Use only your own known public context. Reply briefly and do not reveal hidden information.";
        try
        {
            using var document = JsonDocument.Parse(prompt[contextStart..contextEnd]);
            var root = document.RootElement;
            var compact = new
            {
                CanonicalSelf = Property(root, "CanonicalSelf"),
                GameSituation = Property(root, "GameSituation"),
                BehavioralProfile = Property(root, "BehavioralProfile"),
                Conversation = Property(root, "Conversation"),
                CurrentTask = Property(root, "CurrentTask")
            };
            var header = prompt[..contextStart].TrimEnd();
            var mode = prompt.Contains("Presentation mode:", StringComparison.Ordinal) ? "Presentation" : "Discussion";
            return $"{header}\n{JsonSerializer.Serialize(compact)}\n\n{mode} mode: use only this compact context. Give a brief natural response, preserve hidden data, and follow the current task.";
        }
        catch (JsonException)
        {
            return "Use only your own known public context. Reply briefly and do not reveal hidden information.";
        }
    }

    private static JsonElement? Property(JsonElement parent, string name) =>
        parent.TryGetProperty(name, out var value) ? value.Clone() : null;
}

internal static class AiTokenUsageParser
{
    public static AiTokenUsage? FromOpenAiCompatible(JsonElement root)
    {
        if (!root.TryGetProperty("usage", out var usage) || usage.ValueKind != JsonValueKind.Object) return null;
        var input = Integer(usage, "prompt_tokens") ?? Integer(usage, "input_tokens");
        var output = Integer(usage, "completion_tokens") ?? Integer(usage, "output_tokens");
        var total = Integer(usage, "total_tokens");
        var cached = NestedInteger(usage, "prompt_tokens_details", "cached_tokens") ?? NestedInteger(usage, "input_tokens_details", "cached_tokens");
        var reasoning = NestedInteger(usage, "completion_tokens_details", "reasoning_tokens") ?? NestedInteger(usage, "output_tokens_details", "reasoning_tokens");
        return input.HasValue || output.HasValue || total.HasValue ? new(input, output, reasoning, cached, total) : null;
    }

    public static AiTokenUsage? FromGemini(JsonElement root)
    {
        if (!root.TryGetProperty("usageMetadata", out var usage) || usage.ValueKind != JsonValueKind.Object) return null;
        var input = Integer(usage, "promptTokenCount");
        var total = Integer(usage, "totalTokenCount");
        var output = total.HasValue && input.HasValue ? Math.Max(0, total.Value - input.Value) : Integer(usage, "candidatesTokenCount");
        var reasoning = Integer(usage, "thoughtsTokenCount");
        var cached = Integer(usage, "cachedContentTokenCount");
        return input.HasValue || output.HasValue || total.HasValue ? new(input, output, reasoning, cached, total) : null;
    }

    private static int? Integer(JsonElement parent, string property) =>
        parent.TryGetProperty(property, out var value) && value.TryGetInt32(out var number) ? number : null;

    private static int? NestedInteger(JsonElement parent, string objectProperty, string valueProperty) =>
        parent.TryGetProperty(objectProperty, out var nested) && nested.ValueKind == JsonValueKind.Object ? Integer(nested, valueProperty) : null;
}

public sealed class GroqAiProvider(IHttpClientFactory clients, IConfiguration configuration, ILogger<OpenAiCompatibleAiProvider> logger) : OpenAiCompatibleAiProvider(clients, configuration, logger)
{
    protected override string ProviderId => "Groq";
    protected override string BaseUrl => "https://api.groq.com/openai/v1/";
    protected override string ApiKeyEnvironmentName => "GROQ_API_KEY";
}

public sealed class OpenRouterAiProvider(IHttpClientFactory clients, IConfiguration configuration, ILogger<OpenAiCompatibleAiProvider> logger) : OpenAiCompatibleAiProvider(clients, configuration, logger)
{
    protected override string ProviderId => "OpenRouter";
    protected override string BaseUrl => "https://openrouter.ai/api/v1/";
    protected override string ApiKeyEnvironmentName => "OPENROUTER_API_KEY";
}
