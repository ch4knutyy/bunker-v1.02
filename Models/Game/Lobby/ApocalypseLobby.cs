namespace Bunker.Models;

public sealed record LobbyApocalypseCategoryDto(
    string Id, string Name, string Description, string VisualThemeId,
    int TotalCount, int OrdinaryCount, int InteractiveCount);

public sealed record LobbyApocalypseOptionDto(
    string Id, string Name, string ShortDescription, string CategoryId, string VisualThemeId,
    string Severity, int SurvivalChance, string Duration, bool Interactive, string? ImageUrl);

public sealed record LobbyApocalypseHostConfigurationDto(
    string SelectionMode,
    string? SelectedApocalypseId,
    IReadOnlyList<string> AllowedApocalypseCategoryIds,
    IReadOnlyList<string> ApocalypseCustomPoolIds,
    bool AllowInteractiveApocalypses,
    int InteractiveApocalypseChancePercent,
    bool ApocalypseThemeEnabled);

public sealed record LobbyApocalypseCatalogDto(
    IReadOnlyList<LobbyApocalypseCategoryDto> Categories,
    IReadOnlyList<LobbyApocalypseOptionDto> Apocalypses,
    LobbyApocalypseHostConfigurationDto Configuration,
    ApocalypseSelectionPreviewDto Preview);

public sealed record ApocalypseSelectionPreviewDto(
    string Mode, int CandidateCount, int OrdinaryCount, int InteractiveCount,
    int CategoryCount, int PoolCount, int InteractiveChancePercent,
    LobbyApocalypseOptionDto? Specific, IReadOnlyDictionary<string, int> CategoryDistribution);
