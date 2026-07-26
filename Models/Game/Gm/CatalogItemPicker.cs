namespace Bunker.Models;

public sealed record CatalogPickerCategoryDto(
    string Key,
    string Title,
    bool SupportsReplacement,
    bool SupportsSeverity,
    IReadOnlyList<string> Actions);

public sealed record CatalogPickerItemDto(
    string RecordId,
    string Title,
    string Description,
    string Category,
    IReadOnlyList<string> Tags,
    IReadOnlyList<string> SeverityCodes,
    string? TechnicalEffectType);

public sealed record CatalogPickerPageDto(
    string Category,
    string? TargetPlayerId,
    string? CurrentRecordId,
    int Page,
    int PageSize,
    int Total,
    string Version,
    IReadOnlyList<CatalogPickerItemDto> Items);

public sealed record CatalogReplacementCommand(
    string Category,
    string TargetPlayerId,
    string RecordId,
    string ActionType,
    string? SeverityCode,
    string? ExpectedCurrentRecordId,
    string CommandId);

public sealed record CharacteristicOperationCommand(
    string Operation,
    string Category,
    string SourcePlayerId,
    string? TargetPlayerId,
    string? SourceReplacementRecordId,
    string? SeverityCode,
    string? ExpectedSourceRecordId,
    string? ExpectedTargetRecordId,
    string CommandId);

public sealed record CatalogMutationPreviewDto(
    bool Allowed,
    string Code,
    string Operation,
    string Category,
    string? SourcePlayerId,
    string? TargetPlayerId,
    string? BeforeSource,
    string? AfterSource,
    string? BeforeTarget,
    string? AfterTarget,
    string Fingerprint);

public sealed record CatalogMutationResult(
    bool Success,
    string Code,
    string Category,
    string Operation,
    string? SourcePlayerId,
    string? TargetPlayerId);
