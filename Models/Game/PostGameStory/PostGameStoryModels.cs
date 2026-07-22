using System.Text.Json.Serialization;

namespace Bunker.Models;

public static class PostGameStoryStatuses
{
    public const string NotStarted = "not_started";
    public const string PromptReady = "prompt_ready";
    public const string AwaitingResult = "awaiting_result";
    public const string PreviewReady = "preview_ready";
    public const string Published = "published";
    public const string AwaitingNextChoice = "awaiting_next_choice";
    public const string Completed = "completed";
}

public static class PostGameStoryModes
{
    public const string FinalStory = "final_story";
    public const string Continuation = "continuation";
    public const string HumanityOutcome = "humanity_outcome";
    public const string BunkerContribution = "bunker_contribution";
    public const string EliminatedFates = "eliminated_fates";

    public static readonly HashSet<string> All =
    [
        FinalStory, Continuation, HumanityOutcome, BunkerContribution, EliminatedFates
    ];
}

public sealed class PostGameStoryState
{
    public int Version { get; set; } = 1;
    public string Status { get; set; } = PostGameStoryStatuses.NotStarted;
    public string? CurrentMode { get; set; }
    public int PromptVersion { get; set; } = 1;
    public string? GeneratedPrompt { get; set; }
    public string? GeneratedPromptFingerprint { get; set; }
    public string? RawResult { get; set; }
    public PostGameStoryEntry? Preview { get; set; }
    public string? PreviewFingerprint { get; set; }
    public List<string> ValidationErrors { get; set; } = [];
    public List<string> ValidationWarnings { get; set; } = [];
    public List<PostGameStoryEntry> PublishedEntries { get; set; } = [];
    public string? CurrentEntryId { get; set; }
    public string? ParentEntryId { get; set; }
    public DateTimeOffset? CreatedAtUtc { get; set; }
    public DateTimeOffset? UpdatedAtUtc { get; set; }
    public string? CreatedByPlayerId { get; set; }
    public HashSet<string> ProcessedCommandIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
    public Dictionary<string, string> PublishedCommandEntryIds { get; set; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed class PostGameStoryEntry
{
    public string Id { get; set; } = "";
    public string? ParentEntryId { get; set; }
    public int SchemaVersion { get; set; } = 1;
    public string Mode { get; set; } = PostGameStoryModes.FinalStory;
    public string Title { get; set; } = "";
    public string Subtitle { get; set; } = "";
    public int SurvivalScore { get; set; }
    public string VerdictCode { get; set; } = "";
    public string VerdictText { get; set; } = "";
    public string EstimatedHorizon { get; set; } = "";
    public string Opening { get; set; } = "";
    public List<PostGameStoryChapter> Chapters { get; set; } = [];
    public List<PostGamePlayerEpilogue> SurvivorEpilogues { get; set; } = [];
    public List<PostGameEliminatedPlayerFate> EliminatedPlayerFates { get; set; } = [];
    public string BunkerOutcome { get; set; } = "";
    public string HumanityOutcomePreview { get; set; } = "";
    public string BunkerContributionPreview { get; set; } = "";
    public List<string> Strengths { get; set; } = [];
    public List<string> CriticalRisks { get; set; } = [];
    public string FinalSummary { get; set; } = "";
    public List<string> ContinuationHooks { get; set; } = [];
    public string HumanityOutcome { get; set; } = "";
    public List<PostGameWorldTimelineItem> WorldTimeline { get; set; } = [];
    public string BunkerRole { get; set; } = "";
    public string BunkerContribution { get; set; } = "";
    public string Legacy { get; set; } = "";
    public List<string> KeyContributors { get; set; } = [];
    public string DecisionAssessment { get; set; } = "";
    public List<string> GroupLosses { get; set; } = [];
    public DateTimeOffset? PublishedAtUtc { get; set; }
    public string? PublishedByPlayerId { get; set; }
    public string SourcePromptFingerprint { get; set; } = "";
}

public sealed class PostGameStoryChapter
{
    public string Title { get; set; } = "";
    public string Text { get; set; } = "";
}

public sealed class PostGamePlayerEpilogue
{
    public string PlayerName { get; set; } = "";
    public string Role { get; set; } = "";
    public string Fate { get; set; } = "";
}

public sealed class PostGameEliminatedPlayerFate
{
    public string PlayerName { get; set; } = "";
    public string UsefulnessAssessment { get; set; } = "";
    public string Fate { get; set; } = "";
}

public sealed class PostGameWorldTimelineItem
{
    public string Period { get; set; } = "";
    public string Event { get; set; } = "";
}

public sealed record PostGameStoryValidationResult(
    bool IsValid,
    PostGameStoryEntry? Entry,
    IReadOnlyList<string> Errors,
    IReadOnlyList<string> Warnings,
    string? PreviewFingerprint);

public sealed record PostGameStoryPublicDto(
    int Version,
    string Status,
    string? CurrentMode,
    IReadOnlyList<PostGameStoryEntry> PublishedEntries,
    string? CurrentEntryId,
    string WaitingState);

public sealed record PostGameStoryHostDto(
    int Version,
    string Status,
    string? CurrentMode,
    IReadOnlyList<PostGameStoryEntry> PublishedEntries,
    string? CurrentEntryId,
    string WaitingState,
    string? GeneratedPrompt,
    string? GeneratedPromptFingerprint,
    string? RawResult,
    PostGameStoryEntry? Preview,
    string? PreviewFingerprint,
    IReadOnlyList<string> ValidationErrors,
    IReadOnlyList<string> ValidationWarnings);
