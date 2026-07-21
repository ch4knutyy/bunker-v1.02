using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public sealed class RoomGameSettingsService
{
    private readonly GmAuditService audit;
    private readonly ApocalypseSelectionService? apocalypseSelection;
    private readonly ApocalypseActivationPolicyResolver? apocalypseActivation;
    private static readonly HashSet<int> TimerDurations = [120, 180, 300, 420, 600, 900];

    public RoomGameSettingsService(GmAuditService audit, ApocalypseSelectionService? apocalypseSelection = null,
        ApocalypseActivationPolicyResolver? apocalypseActivation = null)
    {
        this.audit = audit;
        this.apocalypseSelection = apocalypseSelection;
        this.apocalypseActivation = apocalypseActivation;
    }

    public RoomGameSettings GetCanonical(Room room)
    {
        room.GameSettings = Migrate(room.GameSettings);
        if (room.SettingsRevision < 1) room.SettingsRevision = 1;
        return room.GameSettings;
    }

    public RoomGameSettings GetEffective(Room room) =>
        room.SettingsFrozen && room.FrozenGameSettings != null
            ? Migrate(room.FrozenGameSettings)
            : GetCanonical(room);

    public LobbyGameSettingsDto ToDto(Room room)
    {
        var settings = room.State == RoomState.Lobby ? GetCanonical(room) : GetEffective(room);
        return new(settings.Version, settings.Preset.ToString(), settings.MaxGameplayPlayers,
            settings.MinGameplayPlayers, settings.SpectatorsAllowed, settings.AllowSpectatorsAfterStart,
            settings.AllowLateGameplayJoin, settings.LockRoomOnStart, settings.JoinsLocked, settings.ReadyRequirement.ToString(),
            settings.HostCanStartWithoutAllReady, settings.ResetReadinessAfterSettingsChange,
            settings.BunkerCapacityMode.ToString(), settings.ManualBunkerCapacity,
            settings.RandomBunkerCapacityMin, settings.RandomBunkerCapacityMax, room.ResolvedBunkerCapacity,
            settings.ApocalypseEnabled, settings.ApocalypseSelectionMode.ToString(),
            settings.AllowedApocalypseCategoryIds?.Count ?? 0, settings.ApocalypseCustomPoolIds?.Count ?? 0,
            settings.AllowInteractiveApocalypses, settings.InteractiveApocalypseChancePercent, settings.ApocalypseThemeEnabled,
            settings.ApocalypseActivation.EffectsEnabled, settings.ApocalypseActivation.PolicyMode.ToString(),
            settings.ApocalypseActivation.ScheduleMode.ToString(), settings.ApocalypseActivation.Trigger.ToString(),
            settings.ApocalypseActivation.FirstRound, settings.ApocalypseActivation.IntervalRounds,
            settings.ApocalypseActivation.MaxActivations,
            settings.BunkerScenarioEnabled, settings.ThreatsEnabled,
            settings.InteractiveThreatRate.ToString(), InteractivePercent(settings.InteractiveThreatRate),
            settings.FirstThreatRound, settings.ThreatFrequency.ToString(), settings.MaxThreatsPerGame,
            settings.AvoidRepeatedThreats, settings.RoundTimerEnabled, settings.RoundTimerDurationSeconds,
            settings.AutoStartRoundTimer, settings.PauseTimerOnHostDisconnect, settings.VotingEnabled,
            settings.VotingStartRound, settings.VotingFrequency.ToString(), settings.SpecialCardsEnabled,
            settings.SpecialCardsPerPlayer, settings.BonusInventoryEnabled, settings.BonusInventoryRound,
            settings.BonusInventoryCount, settings.StartingInventoryCount,
            settings.CharacterGenerationMode.ToString(),
            settings.ScenarioSchedule?.Enabled == true,
            settings.ScenarioSchedule?.FirstScenarioAfterRound ?? ScenarioRules.EarliestSocialScenarioRound,
            settings.ScenarioSchedule?.IntervalRounds ?? 3,
            settings.ScenarioSchedule?.TriggerPhase ?? "after_round_before_voting",
            settings.ScenarioSchedule?.EnabledTypes.ToList(),
            (settings.BunkerIntelMode ?? BunkerIntelMode.AllVisible).ToString(),
            settings.BunkerIntelIntervalRounds);
    }

    public LobbySettingsApplyResult Apply(Room room, Player actor, LobbySettingsUpdateRequest? request)
    {
        lock (room.GameSettingsSyncRoot) return ApplyLocked(room, actor, request);
    }

    private LobbySettingsApplyResult ApplyLocked(Room room, Player actor, LobbySettingsUpdateRequest? request)
    {
        var current = GetCanonical(room);
        if (!room.IsHost(actor))
            return Failure(room, "lobby_host_required", "lobby_host_required");
        if (room.State != RoomState.Lobby || room.SettingsFrozen)
            return Failure(room, "settings_frozen", "settings_frozen");
        if (request == null || string.IsNullOrWhiteSpace(request.CommandId))
            return Failure(room, "invalid_request", "command_id_required");

        lock (room.ProcessedLobbyCommandIds)
        {
            if (room.ProcessedLobbyCommandIds.Contains(request.CommandId))
                return new(true, true, null, [], room.SettingsRevision, ToDto(room), GetWarnings(room, current));
        }
        if (request.ExpectedRevision != room.SettingsRevision)
            return Failure(room, "settings_revision_conflict", "settings_revision_conflict");

        if (request.Settings == null || request.Settings.Version != RoomGameSettings.CurrentVersion)
            return Failure(room, "unsupported_settings_version", "unsupported_settings_version");
        var candidate = Clone(request.Settings);
        if (!ScenarioRules.BunkerIntelEnabled)
            candidate.BunkerIntelMode = BunkerIntelMode.AllVisible;
        var errors = Validate(candidate, RoomService.GetGameplayPlayersSnapshot(room).Count);
        if (errors.Count > 0)
        {
            audit.Append(room, RoomService.GetPlayerKey(actor), "lobby_settings_applied", GmAuditResult.Rejected,
                "Lobby settings validation failed.", commandId: request.CommandId, errorCode: errors[0]);
            return new(false, false, "settings_validation_failed", errors, room.SettingsRevision, ToDto(room), GetWarnings(room, current));
        }

        candidate.Preset = ResolvePreset(candidate);
        var changed = Fingerprint(current) != Fingerprint(candidate);
        lock (room.ProcessedLobbyCommandIds) room.ProcessedLobbyCommandIds.Add(request.CommandId);
        if (!changed)
            return new(true, false, null, [], room.SettingsRevision, ToDto(room), GetWarnings(room, current));

        room.GameSettings = candidate;
        room.MaxPlayers = candidate.MaxGameplayPlayers;
        room.MinPlayers = candidate.MinGameplayPlayers;
        room.SettingsRevision++;
        if (candidate.ResetReadinessAfterSettingsChange)
            foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value))
                player.IsLobbyReady = false;

        audit.Append(room, RoomService.GetPlayerKey(actor), "lobby_settings_applied", GmAuditResult.Success,
            $"Lobby settings revision {room.SettingsRevision} applied ({candidate.Preset}).",
            commandId: request.CommandId, canUndo: false);
        return new(true, false, null, [], room.SettingsRevision, ToDto(room), GetWarnings(room, candidate));
    }

    public IReadOnlyList<string> ValidateStart(Room room)
    {
        var settings = GetCanonical(room);
        var count = RoomService.GetGameplayPlayersSnapshot(room).Count;
        var errors = Validate(settings, count);
        if (count < settings.MinGameplayPlayers) errors.Add("minimum_gameplay_players");
        if (count > settings.MaxGameplayPlayers) errors.Add("maximum_gameplay_players");
        if (settings.BunkerCapacityMode == BunkerCapacityMode.Manual && settings.ManualBunkerCapacity > count)
            errors.Add("bunker_capacity_exceeds_players");
        if (settings.BunkerCapacityMode == BunkerCapacityMode.RandomRange && settings.RandomBunkerCapacityMin > count)
            errors.Add("bunker_capacity_exceeds_players");
        return errors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public void FreezeForStart(Room room, Func<int, int, int> next)
    {
        lock (room.GameSettingsSyncRoot) FreezeForStartLocked(room, next);
    }

    private void FreezeForStartLocked(Room room, Func<int, int, int> next)
    {
        if (room.SettingsFrozen && room.FrozenGameSettings != null) return;
        var settings = Clone(GetCanonical(room));
        room.FrozenGameSettings = settings;
        room.SettingsFrozen = true;
        room.ResolvedBunkerCapacity = settings.BunkerCapacityMode switch
        {
            BunkerCapacityMode.Manual => settings.ManualBunkerCapacity,
            BunkerCapacityMode.RandomRange => next(
                settings.RandomBunkerCapacityMin!.Value,
                Math.Min(settings.RandomBunkerCapacityMax!.Value, RoomService.GetGameplayPlayersSnapshot(room).Count) + 1),
            _ => null
        };
    }

    public IReadOnlyList<LobbySettingsWarningDto> GetWarnings(Room room, RoomGameSettings? settings = null)
    {
        settings ??= GetCanonical(room);
        var warnings = new List<LobbySettingsWarningDto>();
        var players = RoomService.GetGameplayPlayersSnapshot(room).Count;
        if (settings.BunkerCapacityMode == BunkerCapacityMode.Manual && settings.ManualBunkerCapacity >= players && players > 0)
            warnings.Add(new("bunker_capacity_not_restrictive", "Bunker capacity is not lower than the current gameplay player count."));
        if (!settings.SpectatorsAllowed && RoomService.GetPlayersSnapshot(room).Any(entry => !RoomService.IsGameplayParticipant(entry.Value)))
            warnings.Add(new("spectators_present", "Spectators are present while new spectator roles are disabled."));
        if (players > settings.MaxGameplayPlayers)
            warnings.Add(new("player_count_exceeds_max", "Current gameplay player count exceeds the configured maximum."));
        if (settings.ApocalypseEnabled && settings.ApocalypseSelectionMode == ApocalypseSelectionMode.RandomCategories && settings.AllowedApocalypseCategoryIds.Count == 0)
            warnings.Add(new("apocalypse_categories_empty", "No apocalypse categories are selected."));
        if (settings.ApocalypseEnabled && settings.ApocalypseSelectionMode == ApocalypseSelectionMode.CustomPool && settings.ApocalypseCustomPoolIds.Count == 0)
            warnings.Add(new("apocalypse_pool_empty", "The custom apocalypse pool is empty."));
        if (settings.ApocalypseEnabled && settings.ApocalypseSelectionMode == ApocalypseSelectionMode.Specific && string.IsNullOrWhiteSpace(settings.SelectedApocalypseId))
            warnings.Add(new("apocalypse_specific_missing", "No specific apocalypse is selected."));
        if (settings.ApocalypseEnabled && apocalypseSelection != null)
        {
            var preview = apocalypseSelection.BuildPreview(settings);
            if (preview.CandidateCount == 0)
                warnings.Add(new("apocalypse_candidate_set_empty", "The apocalypse candidate set is empty."));
            if (settings.AllowInteractiveApocalypses && settings.InteractiveApocalypseChancePercent > 0 && preview.InteractiveCount == 0)
                warnings.Add(new("apocalypse_interactive_unavailable", "No interactive apocalypse is available in this selection."));
            if (preview.OrdinaryCount == 0 && preview.InteractiveCount > 0)
                warnings.Add(new("apocalypse_only_interactive_candidates", "This selection contains only interactive apocalypses."));
        }
        if (!settings.ApocalypseThemeEnabled)
            warnings.Add(new("apocalypse_theme_disabled", "Apocalypse thematic appearance is disabled."));
        if (settings.ApocalypseSelectionMode == ApocalypseSelectionMode.CustomPool && settings.ApocalypseCustomPoolIds.Count is > 0 and < 5)
            warnings.Add(new("apocalypse_custom_pool_small", "The custom apocalypse pool is small."));
        if (settings.ApocalypseSelectionMode == ApocalypseSelectionMode.Specific && apocalypseSelection != null &&
            apocalypseSelection.BuildPreview(settings).Specific?.Interactive == true)
            warnings.Add(new("apocalypse_specific_is_interactive", "The selected apocalypse is interactive."));
        var activation = settings.ApocalypseActivation;
        var interactiveCandidates = apocalypseSelection?.GetPossibleInteractiveCandidates(settings) ?? [];
        var possibleInteractive = interactiveCandidates.Count;
        var activationInactive = !settings.ApocalypseEnabled || !settings.AllowInteractiveApocalypses ||
            (settings.ApocalypseSelectionMode != ApocalypseSelectionMode.Specific && settings.InteractiveApocalypseChancePercent == 0) || possibleInteractive == 0;
        if (!activation.EffectsEnabled) warnings.Add(new("apocalypse_effects_disabled", "Interactive apocalypse effects are disabled."));
        if (activationInactive) warnings.Add(new("apocalypse_activation_inactive", "Interactive activation is inactive for the current selection."));
        if (possibleInteractive == 0) warnings.Add(new("apocalypse_activation_no_interactive_candidates", "No interactive candidates are available."));
        if (activation.PolicyMode == ApocalypseActivationPolicyMode.Custom && activation.Trigger == ApocalypseActivationTriggerMode.AfterVoting && !settings.VotingEnabled)
            warnings.Add(new("apocalypse_activation_requires_voting", "After-voting activation requires voting."));
        if (activation.PolicyMode == ApocalypseActivationPolicyMode.Custom && activation.ScheduleMode == ApocalypseActivationScheduleMode.Recurring && activation.MaxActivations == null)
            warnings.Add(new("apocalypse_activation_unlimited", "Recurring activation has no activation limit."));
        if (activation.PolicyMode == ApocalypseActivationPolicyMode.Custom && activation.Trigger == ApocalypseActivationTriggerMode.GameStart)
            warnings.Add(new("apocalypse_activation_game_start_once", "Game-start activation runs once."));
        if (activation.PolicyMode == ApocalypseActivationPolicyMode.Custom && apocalypseActivation != null && !activationInactive &&
            apocalypseActivation.CountCompatible(settings) < possibleInteractive)
            warnings.Add(new("apocalypse_activation_candidate_incompatible", "One or more interactive candidates do not support the custom activation policy."));
        if (activation.PolicyMode == ApocalypseActivationPolicyMode.DefinitionDefault && interactiveCandidates
            .Select(candidate => candidate.Gameplay?.Activation)
            .Where(definition => definition != null)
            .Select(definition => $"{definition!.Mode}|{definition.Trigger}|{definition.FirstRound}|{definition.IntervalRounds}|{definition.MaxActivations}")
            .Distinct(StringComparer.OrdinalIgnoreCase).Skip(1).Any())
            warnings.Add(new("apocalypse_activation_default_mixed", "Possible interactive candidates have different default activation schedules."));
        return warnings;
    }

    public static int InteractivePercent(InteractiveThreatRate rate) => rate switch
    {
        InteractiveThreatRate.Off => 0,
        InteractiveThreatRate.Rare => 1,
        InteractiveThreatRate.Standard => 10,
        InteractiveThreatRate.Often => 25,
        InteractiveThreatRate.Always => 100,
        _ => 1
    };

    public static RoomGameSettings Preset(GamePreset preset) => preset switch
    {
        GamePreset.Calm => With(new(), preset, settings =>
        {
            settings.InteractiveThreatRate = InteractiveThreatRate.Off;
            settings.RoundTimerEnabled = false;
        }),
        GamePreset.Dangerous => With(new(), preset, settings =>
        {
            settings.InteractiveThreatRate = InteractiveThreatRate.Standard;
            settings.FirstThreatRound = 2;
            settings.ThreatFrequency = ThreatFrequencyMode.EveryOtherRound;
            settings.MaxThreatsPerGame = 2;
            settings.RoundTimerEnabled = true;
            settings.RoundTimerDurationSeconds = 180;
            settings.AutoStartRoundTimer = true;
            settings.VotingStartRound = 2;
        }),
        GamePreset.Hardcore => With(new(), preset, settings =>
        {
            settings.InteractiveThreatRate = InteractiveThreatRate.Often;
            settings.FirstThreatRound = 2;
            settings.ThreatFrequency = ThreatFrequencyMode.EveryRound;
            settings.MaxThreatsPerGame = 3;
            settings.RoundTimerEnabled = true;
            settings.RoundTimerDurationSeconds = 120;
            settings.AutoStartRoundTimer = true;
            settings.VotingStartRound = 2;
            settings.BunkerCapacityMode = BunkerCapacityMode.RandomRange;
            settings.RandomBunkerCapacityMin = 1;
            settings.RandomBunkerCapacityMax = 4;
        }),
        GamePreset.Quick => With(new(), preset, settings =>
        {
            settings.RoundTimerEnabled = true;
            settings.RoundTimerDurationSeconds = 120;
            settings.AutoStartRoundTimer = true;
            settings.VotingStartRound = 2;
            settings.MaxThreatsPerGame = 1;
            settings.BonusInventoryEnabled = false;
        }),
        GamePreset.Long => With(new(), preset, settings =>
        {
            settings.RoundTimerEnabled = true;
            settings.RoundTimerDurationSeconds = 600;
            settings.AutoStartRoundTimer = true;
            settings.VotingStartRound = 4;
            settings.FirstThreatRound = 4;
            settings.ThreatFrequency = ThreatFrequencyMode.EveryOtherRound;
            settings.MaxThreatsPerGame = 3;
        }),
        _ => With(new(), preset == GamePreset.Custom ? GamePreset.Custom : GamePreset.Classic, _ => { })
    };

    public static RoomGameSettings Clone(RoomGameSettings? source)
    {
        if (source == null) return Preset(GamePreset.Classic);
        return JsonSerializer.Deserialize<RoomGameSettings>(JsonSerializer.Serialize(source)) ?? Preset(GamePreset.Classic);
    }

    public static RoomGameSettings Migrate(RoomGameSettings? source)
    {
        if (source == null || source.Version <= 0) return Preset(GamePreset.Classic);
        var wasLegacy = source.Version < 2;
        var wasVersion2 = source.Version < 3;
        var wasVersion3 = source.Version < 4;
        var result = Clone(source);
        if (!ScenarioRules.BunkerIntelEnabled)
            result.BunkerIntelMode = BunkerIntelMode.AllVisible;
        if (wasLegacy)
        {
            result.ScenarioSchedule = new ScenarioScheduleSettings { Enabled = false };
            result.BunkerIntelMode = BunkerIntelMode.AllVisible;
        }
        if (wasVersion2)
        {
            result.ApocalypseSelectionMode = ApocalypseSelectionMode.RandomAll;
            result.SelectedApocalypseId = null;
            result.AllowedApocalypseCategoryIds = RoomGameSettings.ProductionApocalypseCategoryIds.ToList();
            result.ApocalypseCustomPoolIds = [];
            result.AllowInteractiveApocalypses = true;
            result.InteractiveApocalypseChancePercent = 10;
            result.ApocalypseThemeEnabled = true;
        }
        if (wasVersion3)
            result.ApocalypseActivation = new();
        result.AllowedApocalypseCategoryIds ??= RoomGameSettings.ProductionApocalypseCategoryIds.ToList();
        result.ApocalypseCustomPoolIds ??= [];
        result.ApocalypseActivation ??= new();
        result.Version = RoomGameSettings.CurrentVersion;
        return result;
    }

    private List<string> Validate(RoomGameSettings settings, int currentGameplayCount)
    {
        var errors = new List<string>();
        if (settings.Version != RoomGameSettings.CurrentVersion) errors.Add("unsupported_settings_version");
        if (!Enum.IsDefined(settings.Preset)) errors.Add("invalid_preset");
        if (settings.MaxGameplayPlayers is < 2 or > 12 || settings.MaxGameplayPlayers < currentGameplayCount) errors.Add("invalid_max_players");
        if (settings.MinGameplayPlayers is < 2 or > 4 || settings.MinGameplayPlayers > settings.MaxGameplayPlayers) errors.Add("invalid_min_players");
        if (!settings.LockRoomOnStart || settings.AllowLateGameplayJoin || settings.AllowSpectatorsAfterStart) errors.Add("unsupported_late_join_policy");
        if (!Enum.IsDefined(settings.ReadyRequirement)) errors.Add("invalid_ready_requirement");
        if (!Enum.IsDefined(settings.BunkerCapacityMode)) errors.Add("invalid_bunker_capacity_mode");
        if (settings.BunkerCapacityMode == BunkerCapacityMode.Manual &&
            (settings.ManualBunkerCapacity is < 1 || settings.ManualBunkerCapacity > settings.MaxGameplayPlayers)) errors.Add("invalid_manual_bunker_capacity");
        if (settings.BunkerCapacityMode == BunkerCapacityMode.RandomRange &&
            (settings.RandomBunkerCapacityMin is < 1 || settings.RandomBunkerCapacityMax is null ||
             settings.RandomBunkerCapacityMax < settings.RandomBunkerCapacityMin ||
             settings.RandomBunkerCapacityMax > settings.MaxGameplayPlayers)) errors.Add("invalid_random_bunker_capacity");
        if (!Enum.IsDefined(settings.InteractiveThreatRate) || settings.FirstThreatRound is < 2 or > 5 || !Enum.IsDefined(settings.ThreatFrequency)) errors.Add("invalid_threat_settings");
        if (settings.MaxThreatsPerGame is < 1 or > 3) errors.Add("invalid_max_threats");
        if (!TimerDurations.Contains(settings.RoundTimerDurationSeconds)) errors.Add("invalid_timer_duration");
        if (settings.VotingStartRound is < 2 or > 5 || !Enum.IsDefined(settings.VotingFrequency)) errors.Add("invalid_voting_settings");
        if (settings.SpecialCardsPerPlayer is < 0 or > 2 || (settings.SpecialCardsEnabled && settings.SpecialCardsPerPlayer == 0)) errors.Add("invalid_special_card_count");
        if (settings.BonusInventoryRound is < 2 or > 5 || settings.BonusInventoryCount is < 1 or > 2 || settings.StartingInventoryCount is < 0 or > 2) errors.Add("invalid_inventory_settings");
        if (settings.CharacterGenerationMode != CharacterGenerationMode.Classic) errors.Add("unsupported_character_generation_mode");
        if (settings.ScenarioSchedule == null ||
            settings.ScenarioSchedule.FirstScenarioAfterRound is < ScenarioRules.EarliestSocialScenarioRound or > 6 ||
            settings.ScenarioSchedule.IntervalRounds is < 2 or > 5 ||
            settings.ScenarioSchedule.TriggerPhase is not ("after_round_before_voting" or "after_voting") ||
            settings.ScenarioSchedule.EnabledTypes.Any(type => type is not ("threat" or "event" or "secret_event")))
            errors.Add("invalid_scenario_settings");
        if (settings.BunkerIntelMode is null || !Enum.IsDefined(settings.BunkerIntelMode.Value) ||
            settings.BunkerIntelIntervalRounds is < 1 or > 3)
            errors.Add("invalid_bunker_intel_settings");
        if (!Enum.IsDefined(settings.ApocalypseSelectionMode) || settings.InteractiveApocalypseChancePercent is < 0 or > 100)
            errors.Add("invalid_apocalypse_settings");
        if (apocalypseSelection != null) errors.AddRange(apocalypseSelection.ValidateSettings(settings));
        if (apocalypseActivation != null && !errors.Any(code => code.StartsWith("apocalypse_", StringComparison.OrdinalIgnoreCase) && !code.StartsWith("apocalypse_activation_", StringComparison.OrdinalIgnoreCase)))
            errors.AddRange(apocalypseActivation.ValidateSettings(settings));
        return errors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    private LobbySettingsApplyResult Failure(Room room, string code, params string[] errors) =>
        new(false, false, code, errors, room.SettingsRevision, ToDto(room), GetWarnings(room));

    private static GamePreset ResolvePreset(RoomGameSettings settings)
    {
        if (settings.Preset == GamePreset.Custom) return GamePreset.Custom;
        var expected = Preset(settings.Preset);
        return Fingerprint(expected) == Fingerprint(settings) ? settings.Preset : GamePreset.Custom;
    }

    private static RoomGameSettings With(RoomGameSettings settings, GamePreset preset, Action<RoomGameSettings> configure)
    {
        settings.Preset = preset;
        settings.ScenarioSchedule ??= new ScenarioScheduleSettings();
        settings.BunkerIntelMode = ScenarioRules.BunkerIntelEnabled
            ? settings.BunkerIntelMode ?? BunkerIntelMode.Progressive
            : BunkerIntelMode.AllVisible;
        configure(settings);
        return settings;
    }

    private static string Fingerprint(RoomGameSettings settings)
    {
        var clone = Clone(settings);
        clone.Preset = GamePreset.Custom;
        return JsonSerializer.Serialize(clone);
    }
}
