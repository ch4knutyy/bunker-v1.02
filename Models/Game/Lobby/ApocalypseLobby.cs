namespace Bunker.Models;

public sealed record LobbyApocalypseCategoryDto(
    string Id, string Name, string Description, string VisualThemeId,
    int TotalCount, int OrdinaryCount, int InteractiveCount);

public sealed record LobbyApocalypseOptionDto(
    string Id, string Name, string ShortDescription, string CategoryId, string VisualThemeId,
    string Severity, int SurvivalChance, string Duration, bool Interactive, string? ImageUrl,
    LobbyApocalypseActivationDefinitionDto? Activation = null);

public sealed record LobbyApocalypseActivationDefinitionDto(
    bool Configurable, string DefaultMode, string DefaultTrigger, int DefaultFirstRound,
    int? DefaultIntervalRounds, int? DefaultMaxActivations, IReadOnlyList<string> AllowedTriggers,
    IReadOnlyList<int> AllowedFirstRounds, IReadOnlyList<int> AllowedIntervalRounds, bool AllowOneTime);

public sealed record LobbyApocalypseActivationContractDto(
    IReadOnlyList<string> SupportedModes, IReadOnlyList<string> SupportedTriggers,
    IReadOnlyList<int> AllowedFirstRounds, IReadOnlyList<int> AllowedIntervalRounds,
    int MaximumAllowedActivations, bool ConfigurablePerLobby);

public sealed record LobbyApocalypseHostConfigurationDto(
    string SelectionMode,
    string? SelectedApocalypseId,
    IReadOnlyList<string> AllowedApocalypseCategoryIds,
    IReadOnlyList<string> ApocalypseCustomPoolIds,
    bool AllowInteractiveApocalypses,
    int InteractiveApocalypseChancePercent,
    bool ApocalypseThemeEnabled,
    ApocalypseActivationSettings Activation);

public sealed record LobbyApocalypseCatalogDto(
    IReadOnlyList<LobbyApocalypseCategoryDto> Categories,
    IReadOnlyList<LobbyApocalypseOptionDto> Apocalypses,
    LobbyApocalypseHostConfigurationDto Configuration,
    ApocalypseSelectionPreviewDto Preview,
    LobbyApocalypseActivationContractDto ActivationContract);

public sealed record ApocalypseSelectionPreviewDto(
    string Mode, int CandidateCount, int OrdinaryCount, int InteractiveCount,
    int CategoryCount, int PoolCount, int InteractiveChancePercent,
    LobbyApocalypseOptionDto? Specific, IReadOnlyDictionary<string, int> CategoryDistribution);
