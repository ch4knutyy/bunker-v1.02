namespace Bunker.Models;

public sealed class ApocalypseEffectRuntimeState
{
    public int Version { get; set; } = 1;
    public int SuccessfulActivationCount { get; set; }
    public int FailedActivationCount { get; set; }
    public long NextSequenceId { get; set; }
    public string? LastSuccessfulActivationKey { get; set; }
    public int? LastSuccessfulRound { get; set; }
    public string? LastSuccessfulTrigger { get; set; }
    public HashSet<string> ProcessedOccurrenceKeys { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public List<ApocalypseEffectActivationRecord> History { get; set; } = new();
}

public sealed class ApocalypseEffectActivationRecord
{
    public long SequenceId { get; set; }
    public string ActivationId { get; set; } = "";
    public string OccurrenceKey { get; set; } = "";
    public DateTimeOffset OccurredAtUtc { get; set; }
    public string ApocalypseId { get; set; } = "";
    public string EffectProfileId { get; set; } = "";
    public string Trigger { get; set; } = "";
    public int Round { get; set; }
    public int ActivationNumber { get; set; }
    public string Result { get; set; } = "skipped";
    public IReadOnlyList<string> EffectTypes { get; set; } = Array.Empty<string>();
    public int AffectedPlayerCount { get; set; }
    public string? FailureCode { get; set; }
    public string? PublicSummaryCode { get; set; }
}

public sealed class ApocalypseProfessionSuppressionState
{
    public bool IsSuppressed { get; set; }
    public string ReplacementId { get; set; } = "profession_lost";
    public string OriginalProfessionName { get; set; } = "";
}

public sealed record ApocalypseEffectPersonalChange(string Field, string Before, string After);

public sealed record ApocalypseEffectExecutionResult(
    bool Success,
    string? FailureCode,
    int AffectedPlayerCount,
    IReadOnlyList<string> EffectTypes,
    string PublicSummaryCode,
    IReadOnlyDictionary<string, IReadOnlyList<ApocalypseEffectPersonalChange>> PersonalChanges);

public sealed record ApocalypseActivationExecutionResult(
    bool Due,
    bool Duplicate,
    ApocalypseEffectActivationRecord? Record,
    ApocalypseEffectExecutionResult? Execution);
