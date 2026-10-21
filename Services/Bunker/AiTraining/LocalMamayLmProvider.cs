using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using System.Diagnostics;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

/// <summary>Local-only OpenAI-compatible gateway for the isolated training arena.</summary>
public interface ILocalMamayLmProvider
{
    Task<AiProviderReply> GenerateAsync(AiTrainingModelRequest request, CancellationToken cancellationToken);
    Task<AiTrainingProviderStatus> ProbeAsync(CancellationToken cancellationToken);
    AiTrainingProviderStatus LastStatus { get; }
}

public sealed record AiTrainingStructuredOutput(string Name, object Schema);
public sealed record AiTrainingModelRequest(string Model, string SystemPrompt, string UserPrompt, int MaxResponseTokens,
    bool UseJsonResponseFormat = false, AiTrainingStructuredOutput? StructuredOutput = null, double Temperature = 0.65);
public sealed record AiTrainingProviderStatus(string Provider, string Status, string? Model, string? ErrorCode = null);

public sealed class LocalMamayLmProvider(IHttpClientFactory clients, IOptions<AiTrainingArenaOptions> options,
    ILogger<LocalMamayLmProvider> logger) : ILocalMamayLmProvider
{
    private readonly AiTrainingArenaOptions _options = options.Value;
    private readonly SemaphoreSlim _requestGate = new(1, 1);
    private AiTrainingProviderStatus _lastStatus = new("Local", "not_checked", null);

    public AiTrainingProviderStatus LastStatus => _lastStatus;

    public async Task<AiProviderReply> GenerateAsync(AiTrainingModelRequest request, CancellationToken cancellationToken)
    {
        if (!TryGetEndpoint(out var endpoint, out var configurationError))
        {
            SetStatus("not_configured", configurationError);
            return new(null, configurationError);
        }
        if (string.IsNullOrWhiteSpace(request.Model))
        {
            SetStatus("not_configured", "ai_model_not_configured");
            return new(null, "ai_model_not_configured");
        }

        await _requestGate.WaitAsync(cancellationToken);
        var stopwatch = Stopwatch.StartNew();
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(_options.LocalTimeoutSeconds, 5, 180)));
            var messages = new[]
            {
                new { role = "system", content = request.SystemPrompt },
                new { role = "user", content = request.UserPrompt }
            };
            using var response = await PostCompletionAsync(endpoint, request, messages, timeout.Token);
            var result = await ReadCompletionAsync(response, stopwatch, timeout.Token);
            if (result.ErrorCode == "ai_structured_output_unsupported" && request.StructuredOutput != null)
            {
                logger.LogInformation("Local MamayLM does not support JSON Schema structured output; falling back to JSON object mode");
                var fallback = request with { StructuredOutput = null, UseJsonResponseFormat = true };
                using var fallbackResponse = await PostCompletionAsync(endpoint, fallback, messages, timeout.Token);
                result = await ReadCompletionAsync(fallbackResponse, stopwatch, timeout.Token);
            }

            SetStatus(string.IsNullOrWhiteSpace(result.ErrorCode) ? "available" : "unavailable", result.ErrorCode);
            return result;
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return new(null, "ai_cancelled", DurationMilliseconds: stopwatch.ElapsedMilliseconds);
        }
        catch (OperationCanceledException)
        {
            SetStatus("unavailable", "ai_timeout");
            return new(null, "ai_timeout", DurationMilliseconds: stopwatch.ElapsedMilliseconds);
        }
        catch (HttpRequestException)
        {
            SetStatus("unavailable", "ai_local_unavailable");
            return new(null, "ai_local_unavailable", DurationMilliseconds: stopwatch.ElapsedMilliseconds);
        }
        catch (JsonException)
        {
            SetStatus("unavailable", "ai_malformed_response");
            return new(null, "ai_malformed_response", DurationMilliseconds: stopwatch.ElapsedMilliseconds);
        }
        finally
        {
            _requestGate.Release();
        }
    }

    private Task<HttpResponseMessage> PostCompletionAsync(string endpoint, AiTrainingModelRequest request, object[] messages, CancellationToken cancellationToken)
    {
        var maxTokens = Math.Clamp(request.MaxResponseTokens, 64, 512);
        var temperature = Math.Clamp(request.Temperature, 0, 2);
        object payload = request.StructuredOutput != null
            ? new
            {
                model = request.Model,
                messages,
                temperature,
                max_tokens = maxTokens,
                response_format = new
                {
                    type = "json_schema",
                    json_schema = new { name = request.StructuredOutput.Name, strict = true, schema = request.StructuredOutput.Schema }
                }
            }
            : request.UseJsonResponseFormat
                ? new { model = request.Model, messages, temperature, max_tokens = maxTokens, response_format = new { type = "json_object" } }
                : new { model = request.Model, messages, temperature, max_tokens = maxTokens };
        return clients.CreateClient(nameof(LocalMamayLmProvider)).PostAsJsonAsync(endpoint + "chat/completions", payload, cancellationToken);
    }

    private async Task<AiProviderReply> ReadCompletionAsync(HttpResponseMessage response, Stopwatch stopwatch, CancellationToken cancellationToken)
    {
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        if (!response.IsSuccessStatusCode)
        {
            var detail = ExtractSanitizedErrorDetail(body);
            var error = IsStructuredOutputUnsupported(response.StatusCode, detail)
                ? "ai_structured_output_unsupported"
                : ClassifyFailure(response.StatusCode, detail);
            logger.LogWarning("Local MamayLM request failed: status={StatusCode} error={ErrorCode} reason={Reason} durationMs={DurationMs}",
                (int)response.StatusCode, error, detail ?? "unspecified", stopwatch.ElapsedMilliseconds);
            return new(null, error, ErrorDetail: detail, DurationMilliseconds: stopwatch.ElapsedMilliseconds);
        }

        using var document = JsonDocument.Parse(body);
        var hasChoice = document.RootElement.TryGetProperty("choices", out var choices) && choices.ValueKind == JsonValueKind.Array && choices.GetArrayLength() > 0;
        var choice = hasChoice ? choices[0] : default;
        var text = hasChoice && choice.TryGetProperty("message", out var message) && message.TryGetProperty("content", out var content)
            ? content.GetString() : null;
        var wasTruncated = hasChoice && choice.TryGetProperty("finish_reason", out var finishReason) && finishReason.ValueKind == JsonValueKind.String &&
            string.Equals(finishReason.GetString(), "length", StringComparison.OrdinalIgnoreCase);
        var usage = AiTokenUsageParser.FromOpenAiCompatible(document.RootElement);
        if (wasTruncated)
            return new(null, "ai_response_truncated", usage, "finish_reason:length", DurationMilliseconds: stopwatch.ElapsedMilliseconds);
        return string.IsNullOrWhiteSpace(text)
            ? new(null, "ai_empty_response", usage, DurationMilliseconds: stopwatch.ElapsedMilliseconds)
            : new(text, Usage: usage, DurationMilliseconds: stopwatch.ElapsedMilliseconds);
    }

    public async Task<AiTrainingProviderStatus> ProbeAsync(CancellationToken cancellationToken)
    {
        if (!TryGetEndpoint(out var endpoint, out var configurationError))
        {
            SetStatus("not_configured", configurationError);
            return LastStatus;
        }
        if (string.IsNullOrWhiteSpace(_options.Model))
        {
            SetStatus("not_configured", "ai_model_not_configured");
            return LastStatus;
        }

        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(_options.LocalTimeoutSeconds, 5, 180)));
            using var response = await clients.CreateClient(nameof(LocalMamayLmProvider)).GetAsync(endpoint + "models", timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                SetStatus("unavailable", response.StatusCode == HttpStatusCode.NotFound ? "ai_model_not_found" : "ai_local_unavailable");
                return LastStatus;
            }
            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
            var listed = document.RootElement.TryGetProperty("data", out var models) && models.ValueKind == JsonValueKind.Array &&
                models.EnumerateArray().Any(item => item.TryGetProperty("id", out var id) && string.Equals(id.GetString(), _options.Model, StringComparison.Ordinal));
            SetStatus(listed ? "available" : "unavailable", listed ? null : "ai_model_not_found");
        }
        catch (OperationCanceledException) when (!cancellationToken.IsCancellationRequested) { SetStatus("unavailable", "ai_timeout"); }
        catch (HttpRequestException) { SetStatus("unavailable", "ai_local_unavailable"); }
        catch (JsonException) { SetStatus("unavailable", "ai_malformed_response"); }
        return LastStatus;
    }

    private bool TryGetEndpoint(out string endpoint, out string error)
    {
        endpoint = (_options.BaseUrl ?? string.Empty).Trim().TrimEnd('/') + "/";
        error = string.Empty;
        if (!Uri.TryCreate(endpoint, UriKind.Absolute, out var uri) || !uri.IsLoopback || !string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase))
        {
            error = "ai_local_endpoint_invalid";
            return false;
        }
        return true;
    }

    private void SetStatus(string status, string? error) => _lastStatus = new("Local", status, _options.Model, error);

    private static string ClassifyFailure(HttpStatusCode status, string? detail)
    {
        if (status == HttpStatusCode.NotFound) return "ai_model_not_found";
        if (status is HttpStatusCode.RequestTimeout or HttpStatusCode.GatewayTimeout) return "ai_timeout";
        if ((int)status >= 500) return "ai_provider_unavailable";
        if (status != HttpStatusCode.BadRequest) return "ai_provider_failed";
        var reason = detail?.ToLowerInvariant() ?? string.Empty;
        if (reason.Contains("context") || reason.Contains("token limit") || reason.Contains("too many tokens") || reason.Contains("maximum context")) return "ai_context_overflow";
        if (reason.Contains("model") && (reason.Contains("not found") || reason.Contains("not loaded") || reason.Contains("unavailable"))) return "ai_model_not_found";
        return "ai_invalid_request";
    }

    private static bool IsStructuredOutputUnsupported(HttpStatusCode status, string? detail)
    {
        if (status != HttpStatusCode.BadRequest || string.IsNullOrWhiteSpace(detail)) return false;
        var reason = detail.ToLowerInvariant();
        return (reason.Contains("response_format") || reason.Contains("json_schema") || reason.Contains("structured output")) &&
            (reason.Contains("unsupported") || reason.Contains("not supported") || reason.Contains("invalid"));
    }

    private static string? ExtractSanitizedErrorDetail(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return null;
        try
        {
            using var document = JsonDocument.Parse(body);
            var root = document.RootElement;
            var error = root.TryGetProperty("error", out var errorValue) && errorValue.ValueKind == JsonValueKind.Object ? errorValue : root;
            var code = StringProperty(error, "code") ?? StringProperty(error, "type");
            var message = StringProperty(error, "message") ?? StringProperty(root, "message");
            return Sanitize(string.Join(": ", new[] { code, message }.Where(value => !string.IsNullOrWhiteSpace(value))));
        }
        catch (JsonException)
        {
            return Sanitize(body);
        }
    }

    private static string? StringProperty(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() : null;

    private static string? Sanitize(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        var compact = string.Join(' ', value.Split(["\r", "\n"], StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        if (compact.Contains("authorization", StringComparison.OrdinalIgnoreCase) || compact.Contains("api key", StringComparison.OrdinalIgnoreCase))
            return "provider_error_detail_redacted";
        var contextLimit = compact.Contains("context", StringComparison.OrdinalIgnoreCase) || compact.Contains("token limit", StringComparison.OrdinalIgnoreCase);
        if (!contextLimit && (compact.Contains("messages[", StringComparison.OrdinalIgnoreCase) || compact.Contains("prompt:", StringComparison.OrdinalIgnoreCase)))
            return "request_content_rejected";
        return compact.Length <= 240 ? compact : compact[..240] + "…";
    }
}
