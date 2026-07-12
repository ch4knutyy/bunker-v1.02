using System.Text.Json;

namespace Bunker.Models;

public enum GlobalContentCategory
{
    Professions,
    Hobbies,
    MentalConditions,
    PhysicalHealth,
    Phobias,
    CharacterTraits,
    Facts,
    SpecialCards,
    Apocalypses,
    Bunkers,
    Items,
    Threats
}

public enum GlobalContentEditableReadiness
{
    Ready,
    BlockedMissingStableIds,
    BlockedSchemaUnknown,
    ReadOnly
}

public sealed record GlobalContentMetadataDto(
    string Category,
    int EntryCount,
    string FileVersion,
    string Fingerprint,
    DateTimeOffset? LastModifiedUtc,
    string SchemaStatus,
    string StableIdStatus,
    string LocalizationStatus,
    GlobalContentEditableReadiness EditableReadiness);

public sealed record GlobalContentEntrySummaryDto(string StableId, string DisplayName, string Summary);
public sealed record GlobalContentPageDto(
    GlobalContentMetadataDto Metadata,
    int Page,
    int PageSize,
    int TotalEntries,
    IReadOnlyList<GlobalContentEntrySummaryDto> Entries);
public sealed record GlobalContentEntryDto(
    string Category,
    string StableId,
    string DisplayName,
    IReadOnlyDictionary<string, string> Fields);
public sealed record GlobalContentAccessDto(bool Allowed, bool FeatureEnabled, bool IsDevelopment, string Reason);

public sealed class GlobalContentCatalogOptions
{
    public const string SectionName = "GlobalContentCatalog";
    public bool Enabled { get; set; }
    public string DevelopmentBootstrapKey { get; set; } = string.Empty;
}

public enum GlobalContentDraftStatus { Draft, Validated, Invalid, Conflict, Expired, Discarded }
public enum GlobalContentDraftCommandType { CreateEntry, UpdateEntry, DeleteEntry }
public enum GlobalContentIssueSeverity { Info, Warning, Error }

public sealed record GlobalContentDraftDto(
    string DraftId, string Category, string BaseVersion, string BaseFingerprint,
    DateTimeOffset CreatedAtUtc, string CreatedByPlayerId, DateTimeOffset UpdatedAtUtc,
    DateTimeOffset ExpiresAtUtc, GlobalContentDraftStatus Status, string DraftFingerprint,
    int EntryCount, string ValidationSummary);
public sealed record GlobalContentDraftCommandDto(
    string DraftId, string Category, GlobalContentDraftCommandType Type, string EntryId,
    IReadOnlyDictionary<string, JsonElement>? Fields, bool ConfirmDelete, string CommandId);
public sealed record GlobalContentValidationIssueDto(
    string Code, GlobalContentIssueSeverity Severity, string EntryId, string Field, string Message);
public sealed record GlobalContentDraftValidationDto(
    bool IsValid, int ErrorCount, int WarningCount, int InfoCount,
    IReadOnlyList<GlobalContentValidationIssueDto> Issues, string DraftFingerprint,
    bool HasBaseConflict, bool CanProceedToCommit);
public sealed record GlobalContentDraftDiffEntryDto(string EntryId, string ChangeType, IReadOnlyList<string> ChangedFields);
public sealed record GlobalContentDraftDiffDto(
    int AddedCount, int UpdatedCount, int DeletedCount, IReadOnlyList<string> ChangedEntryIds,
    IReadOnlyList<GlobalContentDraftDiffEntryDto> Entries, string ValidationSummary,
    bool HasBaseConflict, int EstimatedEntryCount);
public sealed record GlobalContentDraftAuditDto(
    long Sequence, DateTimeOffset TimestampUtc, string Action, string DraftId,
    string Category, string ActorId, string EntryId, string Result);
