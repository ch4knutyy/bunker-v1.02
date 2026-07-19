namespace Bunker.Models;

public enum GamePreset { Classic, Calm, Dangerous, Hardcore, Quick, Long, Custom }
public enum ReadyRequirementMode { AllPlayers, HostDecision }
public enum BunkerCapacityMode { Automatic, Manual, RandomRange }
public enum InteractiveThreatRate { Off, Rare, Standard, Often, Always }
public enum ThreatFrequencyMode { OncePerGame, EveryOtherRound, EveryRound, RandomEligibleRounds }
public enum VotingFrequencyMode { EveryRound, EveryTwoRounds }
public enum CharacterGenerationMode { Classic }

public sealed class RoomGameSettings
{
    public const int CurrentVersion = 2;
    public int Version { get; set; } = CurrentVersion;
    public GamePreset Preset { get; set; } = GamePreset.Classic;

    public int MaxGameplayPlayers { get; set; } = 12;
    public int MinGameplayPlayers { get; set; } = 2;
    public bool SpectatorsAllowed { get; set; } = true;
    public bool AllowSpectatorsAfterStart { get; set; }
    public bool AllowLateGameplayJoin { get; set; }
    public bool LockRoomOnStart { get; set; } = true;
    public bool JoinsLocked { get; set; }

    public ReadyRequirementMode ReadyRequirement { get; set; } = ReadyRequirementMode.AllPlayers;
    public bool HostCanStartWithoutAllReady { get; set; }
    public bool ResetReadinessAfterSettingsChange { get; set; } = true;

    public BunkerCapacityMode BunkerCapacityMode { get; set; } = BunkerCapacityMode.Automatic;
    public int? ManualBunkerCapacity { get; set; }
    public int? RandomBunkerCapacityMin { get; set; }
    public int? RandomBunkerCapacityMax { get; set; }

    public bool ApocalypseEnabled { get; set; } = true;
    public bool BunkerScenarioEnabled { get; set; } = true;

    public bool ThreatsEnabled { get; set; } = true;
    public InteractiveThreatRate InteractiveThreatRate { get; set; } = InteractiveThreatRate.Rare;
    public int FirstThreatRound { get; set; } = 3;
    public ThreatFrequencyMode ThreatFrequency { get; set; } = ThreatFrequencyMode.OncePerGame;
    public int? MaxThreatsPerGame { get; set; } = 1;
    public bool AvoidRepeatedThreats { get; set; } = true;

    public bool RoundTimerEnabled { get; set; }
    public int RoundTimerDurationSeconds { get; set; } = 300;
    public bool AutoStartRoundTimer { get; set; }
    public bool PauseTimerOnHostDisconnect { get; set; }

    public bool VotingEnabled { get; set; } = true;
    public int VotingStartRound { get; set; } = 3;
    public VotingFrequencyMode VotingFrequency { get; set; } = VotingFrequencyMode.EveryRound;

    public bool SpecialCardsEnabled { get; set; } = true;
    public int SpecialCardsPerPlayer { get; set; } = 1;
    public bool BonusInventoryEnabled { get; set; } = true;
    public int BonusInventoryRound { get; set; } = 3;
    public int BonusInventoryCount { get; set; } = 1;
    public int StartingInventoryCount { get; set; } = 1;

    public CharacterGenerationMode CharacterGenerationMode { get; set; } = CharacterGenerationMode.Classic;
    public ScenarioScheduleSettings? ScenarioSchedule { get; set; } = new();
    public BunkerIntelMode? BunkerIntelMode { get; set; } = Bunker.Models.BunkerIntelMode.Progressive;
    public int BunkerIntelIntervalRounds { get; set; } = 2;
}

public sealed record LobbyGameSettingsDto(
    int Version,
    string Preset,
    int MaxGameplayPlayers,
    int MinGameplayPlayers,
    bool SpectatorsAllowed,
    bool AllowSpectatorsAfterStart,
    bool AllowLateGameplayJoin,
    bool LockRoomOnStart,
    bool JoinsLocked,
    string ReadyRequirement,
    bool HostCanStartWithoutAllReady,
    bool ResetReadinessAfterSettingsChange,
    string BunkerCapacityMode,
    int? ManualBunkerCapacity,
    int? RandomBunkerCapacityMin,
    int? RandomBunkerCapacityMax,
    int? ResolvedBunkerCapacity,
    bool ApocalypseEnabled,
    bool BunkerScenarioEnabled,
    bool ThreatsEnabled,
    string InteractiveThreatRate,
    int InteractiveThreatPercent,
    int FirstThreatRound,
    string ThreatFrequency,
    int? MaxThreatsPerGame,
    bool AvoidRepeatedThreats,
    bool RoundTimerEnabled,
    int RoundTimerDurationSeconds,
    bool AutoStartRoundTimer,
    bool PauseTimerOnHostDisconnect,
    bool VotingEnabled,
    int VotingStartRound,
    string VotingFrequency,
    bool SpecialCardsEnabled,
    int SpecialCardsPerPlayer,
    bool BonusInventoryEnabled,
    int BonusInventoryRound,
    int BonusInventoryCount,
    int StartingInventoryCount,
    string CharacterGenerationMode,
    bool ScenarioEnabled = true,
    int ScenarioFirstAfterRound = 3,
    int ScenarioIntervalRounds = 3,
    string ScenarioTriggerPhase = "after_round_before_voting",
    IReadOnlyList<string>? ScenarioEnabledTypes = null,
    string BunkerIntelMode = "Progressive",
    int BunkerIntelIntervalRounds = 2);

public sealed record LobbySettingsWarningDto(string Code, string Message);
public sealed record LobbyAuditEventDto(long Id, DateTimeOffset OccurredAtUtc, string ActionType, string Summary, string Result);

public sealed class LobbySettingsUpdateRequest
{
    public long ExpectedRevision { get; set; }
    public string CommandId { get; set; } = "";
    public RoomGameSettings Settings { get; set; } = new();
}

public sealed record LobbySettingsApplyResult(
    bool Success,
    bool IsDuplicate,
    string? ErrorCode,
    IReadOnlyList<string> Errors,
    long SettingsRevision,
    LobbyGameSettingsDto Settings,
    IReadOnlyList<LobbySettingsWarningDto> Warnings);
