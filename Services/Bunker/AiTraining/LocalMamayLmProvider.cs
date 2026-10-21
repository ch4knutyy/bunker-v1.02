using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

/// <summary>Local-only OpenAI-compatible gateway for the isolated training arena.</summary>
public interface ILocalMamayLmProvider
{
    Task<AiProviderReply> GenerateAsync(AiTrainingModelRequest request, CancellationToken cancellationToken);
    Task<AiTrainingProviderStatus> ProbeAsync(CancellationToken cancellationToken);
    AiTrainingProviderStatus LastStatus { get; }
}

public sealed record AiTrainingModelRequest(string Model, string SystemPrompt, string UserPrompt, int MaxResponseTokens);
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
        try
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(_options.LocalTimeoutSeconds, 5, 180)));
            using var response = await clients.CreateClient(nameof(LocalMamayLmProvider)).PostAsJsonAsync(endpoint + "chat/completions", new
            {
                model = request.Model,
                messages = new[]
                {
                    new { role = "system", content = request.SystemPrompt },
                    new { role = "user", content = request.UserPrompt }
                },
                temperature = 0.65,
                max_tokens = Math.Clamp(request.MaxResponseTokens, 64, 512)
            }, timeout.Token);
            if (!response.IsSuccessStatusCode)
            {
                var error = response.StatusCode switch
                {
                    HttpStatusCode.NotFound => "ai_model_not_found",
                    HttpStatusCode.RequestTimeout or HttpStatusCode.GatewayTimeout => "ai_timeout",
                    _ when (int)response.StatusCode >= 500 => "ai_provider_unavailable",
                    _ => "ai_provider_failed"
                };
                SetStatus("unavailable", error);
                logger.LogWarning("Local MamayLM request failed: status={StatusCode} error={ErrorCode}", (int)response.StatusCode, error);
                return new(null, error);
            }

            using var document = JsonDocument.Parse(await response.Content.ReadAsStringAsync(timeout.Token));
            var text = document.RootElement.TryGetProperty("choices", out var choices) && choices.ValueKind == JsonValueKind.Array &&
                choices.GetArrayLength() > 0 && choices[0].TryGetProperty("message", out var message) &&
                message.TryGetProperty("content", out var content) ? content.GetString() : null;
            if (string.IsNullOrWhiteSpace(text))
            {
                SetStatus("unavailable", "ai_empty_response");
                return new(null, "ai_empty_response", AiTokenUsageParser.FromOpenAiCompatible(document.RootElement));
            }
            SetStatus("available", null);
            return new(text, Usage: AiTokenUsageParser.FromOpenAiCompatible(document.RootElement));
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            return new(null, "ai_cancelled");
        }
        catch (OperationCanceledException)
        {
            SetStatus("unavailable", "ai_timeout");
            return new(null, "ai_timeout");
        }
        catch (HttpRequestException)
        {
            SetStatus("unavailable", "ai_local_unavailable");
            return new(null, "ai_local_unavailable");
        }
        catch (JsonException)
        {
            SetStatus("unavailable", "ai_malformed_response");
            return new(null, "ai_malformed_response");
        }
        finally
        {
            _requestGate.Release();
        }
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
}
