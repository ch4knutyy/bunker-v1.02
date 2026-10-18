namespace Bunker.Data.ContentPersistence.Entities;

public sealed class ContentCategoryEntity
{
    public string Key { get; set; } = "";
    public string SourceDescription { get; set; } = "";
    public ICollection<ContentItemEntity> Items { get; } = new List<ContentItemEntity>();
}

public sealed class ContentDocumentEntity
{
    public string SourcePath { get; set; } = "";
    public string Fingerprint { get; set; } = "";
    public string RawJson { get; set; } = "";
    public DateTime ImportedAtUtc { get; set; }
    public ICollection<ContentItemEntity> Items { get; } = new List<ContentItemEntity>();
}

public sealed class ContentItemEntity
{
    public string SourcePath { get; set; } = "";
    public string StableId { get; set; } = "";
    public string CategoryKey { get; set; } = "";
    public string DisplayName { get; set; } = "";
    public int SortOrder { get; set; }
    public string PayloadJson { get; set; } = "";
    public ContentDocumentEntity? Document { get; set; }
    public ContentCategoryEntity? Category { get; set; }
    public ICollection<ContentLocalizationEntity> Localizations { get; } = new List<ContentLocalizationEntity>();
    public ICollection<ContentTagEntity> Tags { get; } = new List<ContentTagEntity>();
}

public sealed class ContentLocalizationEntity
{
    public string SourcePath { get; set; } = "";
    public string StableId { get; set; } = "";
    public string Language { get; set; } = "";
    public string PayloadJson { get; set; } = "";
    public ContentItemEntity? Item { get; set; }
}

public sealed class ContentTagEntity
{
    public string SourcePath { get; set; } = "";
    public string StableId { get; set; } = "";
    public string Tag { get; set; } = "";
    public ContentItemEntity? Item { get; set; }
}

public sealed class ContentRelationshipEntity
{
    public string SourcePath { get; set; } = "";
    public string StableId { get; set; } = "";
    public string Kind { get; set; } = "";
    public int Ordinal { get; set; }
    public string TargetSourcePath { get; set; } = "";
    public string TargetStableId { get; set; } = "";
    public ContentItemEntity? SourceItem { get; set; }
    public ContentItemEntity? TargetItem { get; set; }
}

public sealed class ContentImportRunEntity
{
    public Guid Id { get; set; }
    public DateTime StartedAtUtc { get; set; }
    public DateTime FinishedAtUtc { get; set; }
    public int DocumentCount { get; set; }
    public int ItemCount { get; set; }
    public int MissingTranslationCount { get; set; }
    public string SummaryJson { get; set; } = "";
}
