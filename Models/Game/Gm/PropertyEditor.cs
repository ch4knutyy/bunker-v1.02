namespace Bunker.Models;

public sealed record PropertyEditorConditionOptionDto(
    int Level,
    string Label);

public sealed record PropertyEditorFieldDto(
    string Key,
    string Label,
    int Min,
    int Max,
    bool IsCondition,
    IReadOnlyList<PropertyEditorConditionOptionDto> Options);

public sealed record PropertyEditorDefinitionDto(
    string Id,
    string Title,
    string ConditionProfile,
    IReadOnlyList<PropertyEditorFieldDto> Fields);

public sealed record PropertyEditorDataDto(
    string TargetPlayerId,
    string PlayerName,
    string? CurrentDefinitionId,
    IReadOnlyDictionary<string, int> CurrentValues,
    PropertyPresentationDto? CurrentPresentation,
    IReadOnlyList<PropertyEditorDefinitionDto> Definitions);

public sealed record PropertyEditorPreviewDto(
    string DefinitionId,
    IReadOnlyDictionary<string, int> GeneratedValues,
    PropertyPresentationDto Presentation);
