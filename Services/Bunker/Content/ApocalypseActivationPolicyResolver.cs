using Bunker.Models;

namespace Bunker.Services;

public sealed class ApocalypseActivationPolicyResolver(GameDataService gameData, ApocalypseSelectionService selection)
{
    public IReadOnlyList<string> ValidateSettings(RoomGameSettings settings)
    {
        var activation = settings.ApocalypseActivation;
        if (activation == null) return ["apocalypse_activation_required"];
        if (!settings.ApocalypseEnabled || !settings.AllowInteractiveApocalypses ||
            (settings.ApocalypseSelectionMode != ApocalypseSelectionMode.Specific && settings.InteractiveApocalypseChancePercent == 0))
            return [];

        var candidates = selection.GetPossibleInteractiveCandidates(settings);
        if (candidates.Count == 0) return [];
        if (!Enum.IsDefined(activation.PolicyMode) || !Enum.IsDefined(activation.ScheduleMode) || !Enum.IsDefined(activation.Trigger))
            return ["invalid_apocalypse_activation_enum"];
        if (!activation.EffectsEnabled || activation.PolicyMode == ApocalypseActivationPolicyMode.DefinitionDefault)
            return [];

        var errors = new List<string>();
        var contract = gameData.ApocalypseInteractiveSchema?.ActivationContract;
        var mode = Mode(activation.ScheduleMode);
        var trigger = Trigger(activation.Trigger);
        var firstRound = activation.Trigger == ApocalypseActivationTriggerMode.GameStart ? 1 : activation.FirstRound;

        if (contract == null || !contract.ConfigurablePerLobby) errors.Add("apocalypse_activation_not_configurable");
        if (!(contract?.SupportedModes ?? []).Contains(mode, StringComparer.OrdinalIgnoreCase)) errors.Add("apocalypse_activation_mode_unsupported");
        if (!(contract?.SupportedTriggers ?? []).Contains(trigger, StringComparer.OrdinalIgnoreCase)) errors.Add("apocalypse_activation_trigger_unsupported");
        if (!(contract?.AllowedFirstRounds ?? Enumerable.Range(1, 10)).Contains(firstRound)) errors.Add("apocalypse_activation_first_round_unsupported");
        if (activation.MaxActivations is < 1 or > 20) errors.Add("apocalypse_activation_max_invalid");

        if (activation.ScheduleMode == ApocalypseActivationScheduleMode.Once)
        {
            if (activation.IntervalRounds != null) errors.Add("apocalypse_activation_once_interval_invalid");
            if (activation.MaxActivations != 1) errors.Add("apocalypse_activation_once_max_invalid");
        }
        else
        {
            if (activation.IntervalRounds == null) errors.Add("apocalypse_activation_interval_required");
            else if (!(contract?.AllowedIntervalRounds ?? Enumerable.Range(1, 10)).Contains(activation.IntervalRounds.Value))
                errors.Add("apocalypse_activation_interval_unsupported");
        }
        if (activation.Trigger == ApocalypseActivationTriggerMode.GameStart && activation.ScheduleMode != ApocalypseActivationScheduleMode.Once)
            errors.Add("apocalypse_activation_game_start_once_required");
        if (activation.Trigger == ApocalypseActivationTriggerMode.AfterVoting && !settings.VotingEnabled)
            errors.Add("apocalypse_activation_voting_required");

        if (errors.Count == 0)
            foreach (var candidate in candidates)
                ValidateCandidate(candidate, activation, mode, trigger, firstRound, errors);
        return errors.Distinct(StringComparer.OrdinalIgnoreCase).ToList();
    }

    public ResolvedApocalypseActivationPolicy? Resolve(Apocalypse? apocalypse, RoomGameSettings frozenSettings)
    {
        if (!frozenSettings.ApocalypseEnabled || apocalypse?.Gameplay?.Interactive != true || apocalypse.Gameplay.Activation == null)
            return null;
        var configured = frozenSettings.ApocalypseActivation ?? new();
        var definition = apocalypse.Gameplay.Activation;
        var custom = configured.PolicyMode == ApocalypseActivationPolicyMode.Custom;
        var scheduleMode = custom ? Mode(configured.ScheduleMode) : definition.Mode;
        var trigger = custom ? Trigger(configured.Trigger) : definition.Trigger;
        var firstRound = custom ? configured.FirstRound : definition.FirstRound;
        var interval = custom ? configured.IntervalRounds : definition.IntervalRounds;
        var maximum = custom ? configured.MaxActivations : definition.MaxActivations;
        Normalize(scheduleMode, trigger, ref firstRound, ref interval, ref maximum);
        return new()
        {
            Enabled = configured.EffectsEnabled,
            ApocalypseId = apocalypse.Id,
            EffectProfileId = apocalypse.Gameplay.EffectProfileId,
            GameplaySchemaVersion = apocalypse.Gameplay.SchemaVersion,
            Source = configured.EffectsEnabled ? custom ? "custom" : "definition_default" : "disabled",
            ScheduleMode = scheduleMode,
            Trigger = trigger,
            FirstRound = firstRound,
            IntervalRounds = interval,
            MaxActivations = maximum
        };
    }

    public ResolvedApocalypseActivationPolicy? ResolveForStart(Room room, RoomGameSettings frozenSettings)
    {
        if (room.ApocalypseActivationPolicy != null) return room.ApocalypseActivationPolicy;
        room.ApocalypseActivationPolicy = Resolve(room.Apocalypse, frozenSettings);
        return room.ApocalypseActivationPolicy;
    }

    public int CountCompatible(RoomGameSettings settings)
    {
        var candidates = selection.GetPossibleInteractiveCandidates(settings);
        if (settings.ApocalypseActivation?.PolicyMode != ApocalypseActivationPolicyMode.Custom) return candidates.Count;
        return candidates.Count(candidate => CandidateErrors(candidate, settings.ApocalypseActivation).Count == 0);
    }

    private static void ValidateCandidate(Apocalypse candidate, ApocalypseActivationSettings settings, string mode, string trigger, int firstRound, List<string> errors)
    {
        foreach (var error in CandidateErrors(candidate, settings, mode, trigger, firstRound)) errors.Add(error);
    }

    private static IReadOnlyList<string> CandidateErrors(Apocalypse candidate, ApocalypseActivationSettings settings) =>
        CandidateErrors(candidate, settings, Mode(settings.ScheduleMode), Trigger(settings.Trigger),
            settings.Trigger == ApocalypseActivationTriggerMode.GameStart ? 1 : settings.FirstRound);

    private static IReadOnlyList<string> CandidateErrors(Apocalypse candidate, ApocalypseActivationSettings settings, string mode, string trigger, int firstRound)
    {
        var errors = new List<string>();
        var definition = candidate.Gameplay?.Activation;
        if (definition == null || !definition.Configurable) errors.Add("apocalypse_activation_candidate_not_configurable");
        else
        {
            if (settings.ScheduleMode == ApocalypseActivationScheduleMode.Once && !definition.AllowOneTime) errors.Add("apocalypse_activation_once_unsupported");
            if (!definition.AllowedTriggers.Contains(trigger, StringComparer.OrdinalIgnoreCase)) errors.Add("apocalypse_activation_candidate_trigger_unsupported");
            if (!definition.AllowedFirstRounds.Contains(firstRound)) errors.Add("apocalypse_activation_candidate_first_round_unsupported");
            if (mode == "recurring" && (!settings.IntervalRounds.HasValue || !definition.AllowedIntervalRounds.Contains(settings.IntervalRounds.Value)))
                errors.Add("apocalypse_activation_candidate_interval_unsupported");
        }
        return errors;
    }

    private static string Mode(ApocalypseActivationScheduleMode value) => value == ApocalypseActivationScheduleMode.Once ? "once" : "recurring";
    private static string Trigger(ApocalypseActivationTriggerMode value) => value switch
    {
        ApocalypseActivationTriggerMode.GameStart => "game_start",
        ApocalypseActivationTriggerMode.AfterRound => "after_round",
        _ => "after_voting"
    };
    private static void Normalize(string mode, string trigger, ref int firstRound, ref int? interval, ref int? maximum)
    {
        if (trigger == "game_start") firstRound = 1;
        if (mode == "once") { interval = null; maximum = 1; }
    }
}
