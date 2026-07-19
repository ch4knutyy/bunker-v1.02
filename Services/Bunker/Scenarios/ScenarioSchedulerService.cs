using Bunker.Models;

namespace Bunker.Services;

public sealed class ScenarioSchedulerService
{
    private readonly IScenarioContentRegistry _content;
    private readonly TimeProvider _timeProvider;
    private readonly Random _random;
    private readonly object _randomLock = new();

    public ScenarioSchedulerService(
        IScenarioContentRegistry content,
        TimeProvider timeProvider,
        Random? random = null)
    {
        _content = content;
        _timeProvider = timeProvider;
        _random = random ?? Random.Shared;
    }

    public ScenarioSituationState InitializeForNewGame(RoomGameSettings settings)
    {
        var configured = settings.ScenarioSchedule ?? new ScenarioScheduleSettings();
        return new ScenarioSituationState
        {
            Enabled = configured.Enabled,
            FirstScenarioAfterRound = Math.Clamp(configured.FirstScenarioAfterRound, 3, 6),
            IntervalRounds = Math.Clamp(configured.IntervalRounds, 2, 5),
            TriggerPhase = configured.TriggerPhase is "after_voting" ? "after_voting" : "after_round_before_voting",
            EnabledTypes = new(configured.EnabledTypes.Where(IsSelectableType), StringComparer.OrdinalIgnoreCase),
            NextDueAfterRound = Math.Clamp(configured.FirstScenarioAfterRound, 3, 6)
        };
    }

    public ScenarioSelectionResult SelectForCompletedRound(
        Room room,
        int completedRound,
        string triggerPhase = "after_round_before_voting")
    {
        var state = room.ScenarioSituations;
        if (state == null || !state.Enabled)
            return new(false, false, "scenario_disabled", null);
        if (!string.Equals(state.TriggerPhase, triggerPhase, StringComparison.OrdinalIgnoreCase))
            return new(false, false, "different_trigger_phase", null);
        if (room.State == RoomState.Finished || room.CurrentPhase == GamePhase.Finished || room.Completion != null)
            return new(false, false, "game_finished", null);
        if (completedRound < state.NextDueAfterRound)
            return new(false, false, "not_due", null);
        if (state.ActiveScenario is { IsResolved: false } || room.CurrentThreat != null &&
            room.IsThreatRevealed && room.ThreatState?.Resolution.EffectsApplied != true)
        {
            state.History.Add(new("", "postponed", completedRound, "major_situation_active", _timeProvider.GetUtcNow()));
            return new(true, true, "major_situation_active", null);
        }

        var activePlayers = RoomService.GetGameplayPlayersSnapshot(room)
            .Select(entry => entry.Value)
            .Where(player => !player.IsEliminated)
            .ToList();
        var eligibleEvents = _content.Events
            .Where(item => IsEligible(item, room, state, completedRound, activePlayers))
            .ToList();
        var availableTypes = BuildAvailableTypes(state, eligibleEvents);
        if (availableTypes.Count == 0)
        {
            state.History.Add(new("", "postponed", completedRound, "no_eligible_scenario", _timeProvider.GetUtcNow()));
            return new(true, true, "no_eligible_scenario", null);
        }

        var selectedType = PickWeighted(availableTypes);
        ScenarioDefinition selected;
        if (selectedType == ScenarioType.Threat)
        {
            selected = new ScenarioDefinition
            {
                Id = "__existing_threat_flow__",
                Enabled = true,
                Type = "threat",
                ResolutionMode = "existing_threat_flow",
                MinRound = completedRound,
                Weight = ScenarioRules.TypeWeights[ScenarioType.Threat],
                Title = Localized("Загроза", "Threat", "Угроза"),
                PublicText = Localized(
                    "Бункер зіткнувся з новою загрозою.",
                    "The bunker is facing a new threat.",
                    "Бункер столкнулся с новой угрозой.")
            };
        }
        else
        {
            var typeName = selectedType == ScenarioType.Event ? "event" : "secret_event";
            var candidates = eligibleEvents.Where(item =>
                string.Equals(item.Type, typeName, StringComparison.OrdinalIgnoreCase)).ToList();
            selected = PickWeighted(candidates.Select(item => (item, Math.Max(1, item.Weight))).ToList());
        }
        return new(true, false, null, selected);
    }

    public bool IsDue(Room room, int completedRound, string triggerPhase) =>
        room.ScenarioSituations is { Enabled: true } state &&
        string.Equals(state.TriggerPhase, triggerPhase, StringComparison.OrdinalIgnoreCase) &&
        completedRound >= state.NextDueAfterRound;

    public void MarkPostponed(Room room, int completedRound, string reason)
    {
        room.ScenarioSituations?.History.Add(new("", "postponed", completedRound, reason,
            _timeProvider.GetUtcNow()));
    }

    public ActiveScenarioSituation MarkStarted(Room room, ScenarioDefinition scenario, int completedRound)
    {
        var state = room.ScenarioSituations ?? throw new InvalidOperationException("Scenario state is not initialized.");
        var active = new ActiveScenarioSituation
        {
            Id = Guid.NewGuid().ToString("N"),
            ScenarioId = scenario.Id,
            Type = scenario.Type,
            ResolutionMode = scenario.ResolutionMode,
            TriggeredAfterRound = completedRound,
            TriggeredAtUtc = _timeProvider.GetUtcNow(),
            IsBlocking = scenario.ResolutionMode is "secret_player_choice" or "existing_threat_flow"
        };
        state.ActiveScenario = active;
        state.LastActualScenarioRound = completedRound;
        state.NextDueAfterRound = completedRound + Math.Max(2, state.IntervalRounds);
        state.LastScenarioId = scenario.Id;
        state.LastScenarioType = scenario.Type;
        state.LastCooldownGroup = scenario.CooldownGroup;
        if (scenario.OncePerGame) state.TriggeredScenarioIds.Add(scenario.Id);
        if (!string.IsNullOrWhiteSpace(scenario.CooldownGroup))
            state.CooldownGroupLastRound[scenario.CooldownGroup] = completedRound;
        state.History.Add(new(scenario.Id, scenario.Type, completedRound, "started", _timeProvider.GetUtcNow()));
        return active;
    }

    public void MarkResolved(Room room, string result = "resolved")
    {
        var state = room.ScenarioSituations;
        if (state?.ActiveScenario == null) return;
        state.ActiveScenario.IsResolved = true;
        state.ActiveScenario.IsBlocking = false;
        state.PendingPrivateChoices.Clear();
        state.History.Add(new(state.ActiveScenario.ScenarioId, state.ActiveScenario.Type,
            state.ActiveScenario.TriggeredAfterRound, result, _timeProvider.GetUtcNow()));
    }

    private bool IsEligible(
        ScenarioDefinition item,
        Room room,
        ScenarioSituationState state,
        int round,
        IReadOnlyCollection<Player> activePlayers)
    {
        if (!item.Enabled || item.MinRound > round) return false;
        if (!state.EnabledTypes.Contains(item.Type)) return false;
        if (item.OncePerGame && state.TriggeredScenarioIds.Contains(item.Id)) return false;
        if (string.Equals(item.Id, state.LastScenarioId, StringComparison.OrdinalIgnoreCase)) return false;
        if (!string.IsNullOrWhiteSpace(item.CooldownGroup) &&
            state.CooldownGroupLastRound.TryGetValue(item.CooldownGroup, out var usedRound) &&
            round - usedRound <= item.CooldownRounds)
            return false;

        var eligibility = item.Source.TryGetProperty("eligibility", out var value) ? value : default;
        if (eligibility.ValueKind == System.Text.Json.JsonValueKind.Object)
        {
            if (GetInt(eligibility, "minimumFoodMonths") > (room.Bunker?.SuppliesMonths ?? 0)) return false;
            if (GetInt(eligibility, "minimumWaterMonths") > (room.Bunker?.WaterMonths ?? 0)) return false;
            if (GetInt(eligibility, "requiresAtLeastActivePlayers") > activePlayers.Count) return false;
            var ownedCard = GetString(eligibility, "excludeWhenExistingOwnedCard");
            if (!string.IsNullOrWhiteSpace(ownedCard) && activePlayers.Any(player =>
                    player.EventSpecialCards.Any(card =>
                        !card.IsRevealedPublicly &&
                        string.Equals(card.DefinitionId, ownedCard, StringComparison.OrdinalIgnoreCase))))
                return false;
            var anyOwnedCard = GetString(eligibility, "excludeWhenAnyPlayerOwnsCard");
            if (!string.IsNullOrWhiteSpace(anyOwnedCard) && activePlayers.Any(player =>
                    player.EventSpecialCards.Any(card =>
                        card.RemainingUses > 0 &&
                        string.Equals(card.DefinitionId, anyOwnedCard, StringComparison.OrdinalIgnoreCase))))
                return false;
            var hiddenRequired = Math.Max(
                GetInt(eligibility, "minimumHiddenBunkerIntel"),
                GetInt(eligibility, "requiresHiddenBunkerIntelUnits"));
            if (hiddenRequired > 0 &&
                (room.BunkerIntel == null || BunkerIntelService.CountHiddenUnits(room) <
                    hiddenRequired))
                return false;
            if (GetString(eligibility, "requiresAtLeastOnePlayerWithPhysicalSeverityAbove") == "stable" &&
                !activePlayers.Any(player => player.PhysicalHealth.AllowsSeverity &&
                    !string.IsNullOrWhiteSpace(player.PhysicalHealth.SeverityCode)))
                return false;
        }
        return true;
    }

    private List<(ScenarioType Item, int Weight)> BuildAvailableTypes(
        ScenarioSituationState state,
        IReadOnlyCollection<ScenarioDefinition> eligibleEvents)
    {
        var result = new List<(ScenarioType, int)>();
        foreach (var pair in ScenarioRules.TypeWeights)
        {
            if (pair.Value <= 0 || !state.EnabledTypes.Contains(ToContentName(pair.Key))) continue;
            if (pair.Key == ScenarioType.Threat)
                result.Add((pair.Key, pair.Value));
            else if (pair.Key == ScenarioType.Event &&
                     eligibleEvents.Any(item => item.Type == "event"))
                result.Add((pair.Key, pair.Value));
            else if (pair.Key == ScenarioType.SecretEvent &&
                     eligibleEvents.Any(item => item.Type == "secret_event"))
                result.Add((pair.Key, pair.Value));
        }
        if (result.Count > 1 && state.LastScenarioType is { Length: > 0 })
            result.RemoveAll(pair => string.Equals(ToContentName(pair.Item1), state.LastScenarioType, StringComparison.OrdinalIgnoreCase));
        return result;
    }

    private T PickWeighted<T>(IReadOnlyList<(T Item, int Weight)> items)
    {
        var total = items.Sum(item => Math.Max(0, item.Weight));
        if (total <= 0) return items[0].Item;
        int roll;
        lock (_randomLock) roll = _random.Next(total);
        foreach (var item in items)
        {
            roll -= Math.Max(0, item.Weight);
            if (roll < 0) return item.Item;
        }
        return items[^1].Item;
    }

    private static bool IsSelectableType(string value) =>
        value is "threat" or "event" or "secret_event";
    private static string ToContentName(ScenarioType type) => type switch
    {
        ScenarioType.Threat => "threat",
        ScenarioType.Event => "event",
        ScenarioType.SecretEvent => "secret_event",
        _ => "crisis_decision"
    };
    private static int GetInt(System.Text.Json.JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.TryGetInt32(out var result) ? result : 0;
    private static string GetString(System.Text.Json.JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.ValueKind == System.Text.Json.JsonValueKind.String
            ? value.GetString() ?? "" : "";
    private static IReadOnlyDictionary<string, string> Localized(string uk, string en, string ru) =>
        new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["uk"] = uk, ["en"] = en, ["ru"] = ru
        };
}
