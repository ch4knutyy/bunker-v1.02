using System.Text.Json;

namespace Bunker.Models;

public enum ScenarioType { Threat, Event, SecretEvent, CrisisDecision }
public enum ScenarioResolutionMode
{
    AutomaticPublicEvent,
    AutomaticSecretGrant,
    SecretPlayerChoice,
    SplitPrivateInformation,
    ExistingThreatFlow
}
public enum CardOperation { ApplyEffects, TransferOwnedCard, SelectAndApply, ChooseEffect }

public static class ScenarioRules
{
    public const int MajorSituationLimitPerRound = 1;
    public const int PrivateChoiceTimeoutSeconds = 180;
    public static bool BunkerIntelEnabled => false;
    public const int EarliestSocialScenarioRound = 2;
    public static readonly IReadOnlyDictionary<ScenarioType, int> TypeWeights =
        new Dictionary<ScenarioType, int>
        {
            [ScenarioType.Threat] = 35,
            [ScenarioType.Event] = 35,
            [ScenarioType.SecretEvent] = 30,
            [ScenarioType.CrisisDecision] = 0
        };
}

public sealed class ScenarioScheduleSettings
{
    public bool Enabled { get; set; } = true;
    public int FirstScenarioAfterRound { get; set; } = ScenarioRules.EarliestSocialScenarioRound;
    public int IntervalRounds { get; set; } = 3;
    public string TriggerPhase { get; set; } = "after_round_before_voting";
    public HashSet<string> EnabledTypes { get; set; } =
        new(["threat", "event", "secret_event"], StringComparer.OrdinalIgnoreCase);
}

public sealed class ScenarioSituationState
{
    public bool Enabled { get; set; }
    public int FirstScenarioAfterRound { get; set; } = ScenarioRules.EarliestSocialScenarioRound;
    public int IntervalRounds { get; set; } = 3;
    public string TriggerPhase { get; set; } = "after_round_before_voting";
    public HashSet<string> EnabledTypes { get; set; } =
        new(["threat", "event", "secret_event"], StringComparer.OrdinalIgnoreCase);
    public int? LastActualScenarioRound { get; set; }
    public int NextDueAfterRound { get; set; } = ScenarioRules.EarliestSocialScenarioRound;
    public string? LastScenarioId { get; set; }
    public string? LastScenarioType { get; set; }
    public string? LastCooldownGroup { get; set; }
    public ActiveScenarioSituation? ActiveScenario { get; set; }
    public Dictionary<string, PendingScenarioChoice> PendingPrivateChoices { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public HashSet<string> ProcessedCommandIds { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public HashSet<string> TriggeredScenarioIds { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, int> CooldownGroupLastRound { get; set; } =
        new(StringComparer.OrdinalIgnoreCase);
    public List<ScenarioHistoryEntry> History { get; set; } = [];
}

public sealed record ScenarioHistoryEntry(
    string ScenarioId,
    string Type,
    int ActualRound,
    string Result,
    DateTimeOffset OccurredAtUtc);

public sealed class ActiveScenarioSituation
{
    public string Id { get; set; } = "";
    public string ScenarioId { get; set; } = "";
    public string Type { get; set; } = "";
    public string ResolutionMode { get; set; } = "";
    public int TriggeredAfterRound { get; set; }
    public DateTimeOffset TriggeredAtUtc { get; set; }
    public bool IsBlocking { get; set; }
    public bool IsResolved { get; set; }
}

public sealed class PendingScenarioChoice
{
    public string ChoiceId { get; set; } = "";
    public string ScenarioId { get; set; } = "";
    public string PlayerId { get; set; } = "";
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public JsonElement Payload { get; set; }
}

public sealed class ScenarioDefinition
{
    public string Id { get; init; } = "";
    public bool Enabled { get; init; }
    public string Type { get; init; } = "";
    public string ResolutionMode { get; init; } = "";
    public int MinRound { get; init; }
    public int Weight { get; init; } = 1;
    public bool OncePerGame { get; init; }
    public string CooldownGroup { get; init; } = "";
    public int CooldownRounds { get; init; }
    public IReadOnlyDictionary<string, string> Title { get; init; } =
        new Dictionary<string, string>();
    public IReadOnlyDictionary<string, string> PublicText { get; init; } =
        new Dictionary<string, string>();
    public JsonElement Source { get; init; }
}

public sealed class EventSpecialCardDefinition
{
    public string Id { get; init; } = "";
    public bool Enabled { get; init; }
    public string Category { get; init; } = "";
    public bool Transferable { get; init; }
    public IReadOnlyDictionary<string, string> Title { get; init; } =
        new Dictionary<string, string>();
    public IReadOnlyDictionary<string, string> Description { get; init; } =
        new Dictionary<string, string>();
    public JsonElement Source { get; init; }
}

public sealed record ScenarioSelectionResult(
    bool IsDue,
    bool IsPostponed,
    string? Reason,
    ScenarioDefinition? Scenario);

public sealed record ScenarioPublicDto(
    string InstanceId,
    string ScenarioId,
    string Type,
    string Title,
    string Text,
    string ResolutionMode,
    int TriggeredAfterRound,
    bool RequiresPrivateResolution);

public sealed record ScenarioPrivateDto(
    string InstanceId,
    string ScenarioId,
    string Title,
    string Message,
    object? Card,
    object? Choice,
    DateTimeOffset? ExpiresAtUtc);

public sealed class PendingEliminationState
{
    public string PlayerId { get; set; } = "";
    public string PlayerName { get; set; } = "";
    public int Round { get; set; }
    public DateTimeOffset ExpiresAtUtc { get; set; }
    public string Source { get; set; } = "vote";
}
