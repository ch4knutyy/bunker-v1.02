using System.Text.Json;
using System.Net.Http.Json;
using Microsoft.Extensions.Options;

namespace Bunker.Services;

public enum AiTokenRequestKind { Presentation, Discussion, Other }
public enum AiTokenMeasurementKind { ProviderReported, ExactOpenAiInput, ApproximatePrompt }

/// <summary>Usage values are billed-token counters. ReasoningTokens, when present, is a subset of OutputTokens.</summary>
public sealed record AiTokenUsage(int? InputTokens, int? OutputTokens, int? ReasoningTokens, int? CachedInputTokens, int? TotalTokens);

public sealed class AiCostModelPrice
{
    public string Name { get; set; } = "";
    public decimal InputUsdPerMillion { get; set; }
    public decimal OutputUsdPerMillion { get; set; }
}

public sealed class AiTokenCostOptions
{
    public bool DryRun { get; set; }
    public bool ExactOpenAiInputTokensEnabled { get; set; }
    public bool ExactOpenAiInputTokensAuthorized { get; set; }
    public string ExactOpenAiInputTokensModel { get; set; } = "gpt-6-astra";
    public int AssumedOutputTokensMinimum { get; set; } = 30;
    public int AssumedOutputTokensMaximum { get; set; } = 768;
    public List<AiCostModelPrice> Prices { get; set; } =
    [
        new() { Name = "GPT-6 Luna", InputUsdPerMillion = 0.10m, OutputUsdPerMillion = 0.50m },
        new() { Name = "GPT-6.1 Sol", InputUsdPerMillion = 2m, OutputUsdPerMillion = 10m },
        new() { Name = "GPT-6 Astra", InputUsdPerMillion = 10m, OutputUsdPerMillion = 50m }
    ];
}

public sealed record AiTokenMetric(int SampleCount, long Sum, double? Average, int? Median, int? P90);
public sealed record AiTokenUsageSummary(
    string RequestKind,
    int RequestCount,
    int ProviderReportedCount,
    int NonOpenAiProviderReportedCount,
    int ExactOpenAiInputCount,
    int ApproximateCount,
    AiTokenMetric Input,
    AiTokenMetric Output,
    AiTokenMetric Reasoning,
    AiTokenMetric CachedInput,
    AiTokenMetric Total);
public sealed record AiCostByModel(string Model, decimal MinimumUsd, decimal MaximumUsd);
public sealed record AiCostProjection(
    string RequestKind,
    int AiCount,
    int ResponsesPerAi,
    int TotalRequests,
    double InputTokensPerRequest,
    bool HasInputTokenBasis,
    double OutputTokensPerRequestMinimum,
    double OutputTokensPerRequestMaximum,
    bool UsesAssumedOutputRange,
    IReadOnlyList<AiCostByModel> Models);
public sealed record AiTokenCostReport(
    int SchemaVersion,
    DateTimeOffset GeneratedAtUtc,
    string StoragePolicy,
    IReadOnlyList<AiTokenUsageSummary> Statistics,
    IReadOnlyList<AiCostProjection> Projections);

public sealed class AiTokenCostEstimator(IOptions<AiTokenCostOptions> options, TimeProvider time)
{
    private sealed record Sample(AiTokenRequestKind Kind, AiTokenMeasurementKind Measurement, AiTokenUsage Usage,
        bool IsNonOpenAiProviderUsage);
    private const int MaxSamples = 5000;
    private readonly object sync = new();
    private readonly List<Sample> samples = [];

    public static AiTokenRequestKind Classify(string prompt) =>
        prompt.Contains("Presentation mode:", StringComparison.Ordinal) ? AiTokenRequestKind.Presentation :
        prompt.Contains("Discussion mode:", StringComparison.Ordinal) ? AiTokenRequestKind.Discussion : AiTokenRequestKind.Other;

    public void RecordProviderResponse(AiTokenRequestKind kind, string prompt, string? provider, AiTokenUsage? usage,
        int? exactOpenAiInputTokens = null)
    {
        var measured = usage ?? new AiTokenUsage(EstimatePromptTokens(prompt), null, null, null, null);
        var measurement = usage == null ? AiTokenMeasurementKind.ApproximatePrompt : AiTokenMeasurementKind.ProviderReported;
        if (exactOpenAiInputTokens is { } exact)
        {
            measured = measured with { InputTokens = exact };
            measurement = AiTokenMeasurementKind.ExactOpenAiInput;
        }
        Add(kind, measurement, measured, usage != null && !string.Equals(provider, "OpenAI", StringComparison.OrdinalIgnoreCase));
    }

    public void RecordDryRun(AiTokenRequestKind kind, string prompt, int? exactOpenAiInputTokens = null) =>
        Add(kind, exactOpenAiInputTokens.HasValue ? AiTokenMeasurementKind.ExactOpenAiInput : AiTokenMeasurementKind.ApproximatePrompt,
            new(exactOpenAiInputTokens ?? EstimatePromptTokens(prompt), null, null, null, null), false);

    public AiTokenCostReport BuildReport()
    {
        List<Sample> snapshot;
        lock (sync) snapshot = samples.ToList();
        var statistics = Enum.GetValues<AiTokenRequestKind>().Select(kind => BuildSummary(kind, snapshot.Where(sample => sample.Kind == kind).ToList())).ToList();
        var projections = statistics.SelectMany(summary => new[] { 10, 50, 100, 500, 1000 }
            .Select(responses => BuildProjection(summary, responses))).ToList();
        return new(1, time.GetUtcNow(), "numeric token and cost statistics only; prompts, player data, and credentials are not stored", statistics, projections);
    }

    public void WriteReport(string path)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path) ?? ".");
        File.WriteAllText(path, JsonSerializer.Serialize(BuildReport(), new JsonSerializerOptions { WriteIndented = true }));
    }

    public void TryWriteReport(string path)
    {
        try { WriteReport(path); }
        catch (IOException) { }
        catch (UnauthorizedAccessException) { }
    }

    private void Add(AiTokenRequestKind kind, AiTokenMeasurementKind measurement, AiTokenUsage usage, bool isNonOpenAiProviderUsage)
    {
        lock (sync)
        {
            samples.Add(new(kind, measurement, usage, isNonOpenAiProviderUsage));
            if (samples.Count > MaxSamples) samples.RemoveRange(0, samples.Count - MaxSamples);
        }
    }

    public static int EstimatePromptTokens(string prompt) => Math.Max(1, (int)Math.Ceiling((prompt?.Length ?? 0) / 4d));

    private static AiTokenUsageSummary BuildSummary(AiTokenRequestKind kind, IReadOnlyList<Sample> values) => new(
        kind.ToString().ToLowerInvariant(),
        values.Count,
        values.Count(value => value.Measurement == AiTokenMeasurementKind.ProviderReported),
        values.Count(value => value.Measurement == AiTokenMeasurementKind.ProviderReported && value.IsNonOpenAiProviderUsage),
        values.Count(value => value.Measurement == AiTokenMeasurementKind.ExactOpenAiInput),
        values.Count(value => value.Measurement == AiTokenMeasurementKind.ApproximatePrompt),
        Metric(values.Select(value => value.Usage.InputTokens)),
        Metric(values.Select(value => value.Usage.OutputTokens)),
        Metric(values.Select(value => value.Usage.ReasoningTokens)),
        Metric(values.Select(value => value.Usage.CachedInputTokens)),
        Metric(values.Select(value => value.Usage.TotalTokens)));

    private AiCostProjection BuildProjection(AiTokenUsageSummary summary, int responsesPerAi)
    {
        var settings = options.Value;
        var aiCount = 5;
        var totalRequests = aiCount * responsesPerAi;
        var input = summary.Input.Average ?? 0;
        var hasMeasuredOutput = summary.Output.Average.HasValue;
        var outputMinimum = hasMeasuredOutput ? summary.Output.Average!.Value : Math.Max(0, settings.AssumedOutputTokensMinimum);
        var outputMaximum = hasMeasuredOutput ? summary.Output.Average!.Value : Math.Max(outputMinimum, settings.AssumedOutputTokensMaximum);
        var models = settings.Prices.Select(price => new AiCostByModel(price.Name,
            Cost(totalRequests, input, outputMinimum, price), Cost(totalRequests, input, outputMaximum, price))).ToList();
        return new(summary.RequestKind, aiCount, responsesPerAi, totalRequests, input, summary.Input.Average.HasValue, outputMinimum, outputMaximum,
            !hasMeasuredOutput, models);
    }

    private static decimal Cost(int requests, double input, double output, AiCostModelPrice price) =>
        (decimal)requests * ((decimal)input * price.InputUsdPerMillion + (decimal)output * price.OutputUsdPerMillion) / 1_000_000m;

    private static AiTokenMetric Metric(IEnumerable<int?> source)
    {
        var values = source.Where(value => value.HasValue).Select(value => value!.Value).Order().ToArray();
        if (values.Length == 0) return new(0, 0, null, null, null);
        return new(values.Length, values.Sum(static value => (long)value), values.Average(), Percentile(values, .5), Percentile(values, .9));
    }

    private static int Percentile(IReadOnlyList<int> sorted, double percentile) =>
        sorted[(int)Math.Ceiling(percentile * sorted.Count) - 1];
}

/// <summary>Disabled by default. A network call requires both explicit configuration flags.</summary>
public sealed class OpenAiInputTokenCounter(IHttpClientFactory clients, IConfiguration configuration, IOptions<AiTokenCostOptions> options)
{
    public bool IsAuthorized => options.Value.ExactOpenAiInputTokensEnabled && options.Value.ExactOpenAiInputTokensAuthorized;

    public async Task<int?> CountAsync(string prompt, CancellationToken cancellationToken)
    {
        if (!IsAuthorized) return null;
        var apiKey = configuration["OpenAI:ApiKey"] ?? Environment.GetEnvironmentVariable("OPENAI_API_KEY");
        if (string.IsNullOrWhiteSpace(apiKey)) return null;
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://api.openai.com/v1/responses/input_tokens")
        {
            Content = JsonContent.Create(new { model = options.Value.ExactOpenAiInputTokensModel, input = prompt })
        };
        request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", apiKey);
        try
        {
            using var response = await clients.CreateClient(nameof(OpenAiInputTokenCounter)).SendAsync(request, cancellationToken);
            if (!response.IsSuccessStatusCode) return null;
            using var body = JsonDocument.Parse(await response.Content.ReadAsStringAsync(cancellationToken));
            return body.RootElement.TryGetProperty("input_tokens", out var tokens) && tokens.TryGetInt32(out var value) ? value : null;
        }
        catch (HttpRequestException) { return null; }
        catch (JsonException) { return null; }
    }
}
