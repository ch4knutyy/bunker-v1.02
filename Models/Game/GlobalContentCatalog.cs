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
