using System.Text.Json;
using Bunker.Models;
using Bunker.Models.Сharacteristics;

namespace Bunker.Services;

public sealed record ScenarioEffectResult(
    bool Success,
    string? ErrorCode,
    IReadOnlyList<object> Changes,
    IReadOnlyList<object> Options);

public sealed record EventCardCommandResult(
    bool Success,
    bool IsDuplicate,
    string? ErrorCode,
    object? Card,
    ScenarioEffectResult? Effects);

public sealed record EventCardPublicNotice(
    string Code,
    string? AccusedPlayerName = null);

public sealed record EventCardRoundBoundaryResult(
    IReadOnlyList<Player> ChangedPlayers,
    IReadOnlyList<EventCardPublicNotice> PublicNotices);

public sealed class EventSpecialCardService
{
    private readonly IScenarioContentRegistry _content;
    private readonly BunkerResourceService _resources;
    private readonly BunkerIntelService _intel;
    private readonly CharacterGeneratorService _generator;
    private readonly TimeProvider _timeProvider;

    public EventSpecialCardService(
        IScenarioContentRegistry content,
        BunkerResourceService resources,
        BunkerIntelService intel,
        CharacterGeneratorService generator,
        TimeProvider timeProvider)
    {
        _content = content;
        _resources = resources;
        _intel = intel;
        _generator = generator;
        _timeProvider = timeProvider;
    }

    public EventSpecialCard Grant(Room room, Player owner, string definitionId, string sourceScenarioId)
    {
        var definition = _content.FindCard(definitionId)
            ?? throw new InvalidOperationException($"Event card '{definitionId}' was not found.");
        if (!definition.Enabled) throw new InvalidOperationException($"Event card '{definitionId}' is disabled.");

        var storedResource = ReadStoredResource(definition.Source);
        var card = new EventSpecialCard
        {
            DefinitionId = definition.Id,
            SourceScenarioId = sourceScenarioId,
            OriginalOwnerPlayerId = owner.Id.ToString("N"),
            OwnerPlayerId = owner.Id.ToString("N"),
            GrantedAtRound = room.CurrentRound,
            ExpiresAfterRound = ReadNullableInt(definition.Source, "expiresAfterRounds") is { } expires
                ? room.CurrentRound + expires
                : null,
            RemainingUses = Math.Max(1, ReadInt(definition.Source, "maxUses", 1)),
            StoredResource = storedResource,
            GrantedAtUtc = _timeProvider.GetUtcNow(),
            Title = new(definition.Title, StringComparer.OrdinalIgnoreCase),
            Description = new(definition.Description, StringComparer.OrdinalIgnoreCase),
            Actions = definition.Source.GetProperty("actions").Clone()
        };
        owner.EventSpecialCards.Add(card);
        return card;
    }

    public EventCardCommandResult Transfer(
        Room room,
        Player owner,
        string runtimeCardId,
        Player recipient,
        string commandId)
    {
        var card = FindOwned(owner, runtimeCardId);
        if (card == null) return Failure("event_card_not_found");
        lock (card.ProcessedCommandIds)
        {
            if (card.ProcessedCommandIds.Contains(commandId))
                return new(true, true, null, Project(card), null);
            if (!CanAct(card)) return Failure(CardUnavailableCode(card));
            if (!Remember(card, commandId)) return Failure("invalid_command_id");
            var definition = _content.FindCard(card.DefinitionId);
            if (definition == null || !definition.Transferable) return Failure("event_card_not_transferable");
            if (owner.Id == recipient.Id || !IsActiveRoomPlayer(room, recipient))
                return Failure("invalid_event_card_target");
            card.Status = EventSpecialCardStatus.Resolved;
            card.Result = EventSpecialCardResult.Transferred;
            card.ResolvedAtRound = room.CurrentRound;
            card.RemainingUses = 0;
            var transferred = CloneForNewOwner(card, recipient, EventSpecialCardStatus.Available);
            recipient.EventSpecialCards.Add(transferred);
            return new(true, false, null, Project(transferred), null);
        }
    }

    public EventCardCommandResult Use(
        Room room,
        Player owner,
        string runtimeCardId,
        string actionId,
        Player? selectedTarget,
        string? choiceId,
        string? selectedOptionId,
        string commandId)
    {
        var card = FindOwned(owner, runtimeCardId);
        if (card == null) return Failure("event_card_not_found");
        lock (card.ProcessedCommandIds)
        {
            if (card.ProcessedCommandIds.Contains(commandId))
                return new(true, true, null, Project(card), null);
            if (!CanAct(card)) return Failure(CardUnavailableCode(card));
            if (card.ExpiresAfterRound is { } expiry && room.CurrentRound > expiry)
                return Failure("event_card_expired");
            var definition = _content.FindCard(card.DefinitionId);
            if (definition == null) return Failure("event_card_definition_not_found");
            var action = definition.Source.GetProperty("actions").EnumerateArray().FirstOrDefault(item =>
                string.Equals(ReadString(item, "id"), actionId, StringComparison.OrdinalIgnoreCase));
            if (action.ValueKind != JsonValueKind.Object) return Failure("event_card_action_not_found");
            if (!GetAvailableActionDefinitions(card, definition).Any(item =>
                    string.Equals(ReadString(item, "id"), actionId, StringComparison.OrdinalIgnoreCase)))
                return Failure("event_card_action_not_available");
            if (!ValidateTarget(room, owner, selectedTarget, ReadString(action, "targetMode")))
                return Failure("invalid_event_card_target");
            if (!Remember(card, commandId)) return Failure("invalid_command_id");

            if (ReadString(action, "operation") == "transfer_owned_card")
            {
                card.ProcessedCommandIds.Remove(commandId);
                return selectedTarget == null
                    ? Failure("event_card_target_required")
                    : Transfer(room, owner, runtimeCardId, selectedTarget, commandId);
            }

            var effects = ResolveEffects(action, choiceId);
            if (effects == null) return Failure("event_card_choice_required");
            var result = ApplyEffects(room, owner, selectedTarget ?? owner, card, effects.Value, selectedOptionId);
            if (!result.Success)
            {
                card.ProcessedCommandIds.Remove(commandId);
                return new(false, false, result.ErrorCode, Project(card), result);
            }

            if (ReadBool(action, "revealCardOnUse")) card.IsRevealedPublicly = true;
            if (result.Options.Count > 0)
            {
                card.Status = EventSpecialCardStatus.PendingChoice;
            }
            else if (card.Status is EventSpecialCardStatus.Available or EventSpecialCardStatus.PendingChoice &&
                     ReadBool(action, "consumeCard", true))
            {
                card.RemainingUses = Math.Max(0, card.RemainingUses - 1);
                card.Status = EventSpecialCardStatus.Resolved;
                card.Result = EventSpecialCardResult.Used;
                card.UsedAtRound ??= room.CurrentRound;
                card.ResolvedAtRound = room.CurrentRound;
            }
            return new(true, false, null, Project(card), result);
        }
    }

    public ScenarioEffectResult ApplyEffects(
        Room room,
        Player owner,
        Player target,
        EventSpecialCard? card,
        JsonElement effects,
        string? selectedOptionId = null)
    {
        var changes = new List<object>();
        var options = new List<object>();
        foreach (var effect in effects.EnumerateArray())
        {
            var type = ReadString(effect, "type");
            var actualTarget = ReadString(effect, "target") is "selected_player" or "selected_or_self" ? target : owner;
            switch (type)
            {
                case "no_effect":
                    break;
                case "grant_event_card":
                case "grant_event_card_to_other_player":
                {
                    var cardId = ReadString(effect, "cardId");
                    if (string.IsNullOrWhiteSpace(cardId)) return EffectFailure("event_card_definition_not_found");
                    var granted = Grant(room, actualTarget, cardId,
                        room.ScenarioSituations?.ActiveScenario?.ScenarioId ?? "");
                    changes.Add(Project(granted));
                    break;
                }
                case "add_bunker_food":
                case "add_bunker_water":
                {
                    if (room.Bunker == null) return EffectFailure("bunker_not_available");
                    var amount = ReadBool(effect, "amountFromStoredAsset") ? card?.StoredResource?.Amount ?? 0 : ReadInt(effect, "amount");
                    if (amount <= 0) return EffectFailure("invalid_resource_amount");
                    var kind = type.EndsWith("water", StringComparison.Ordinal) ? BunkerResourceKind.Water : BunkerResourceKind.Food;
                    var mutation = _resources.Add(room.Bunker, kind, amount);
                    changes.Add(mutation);
                    break;
                }
                case "remove_bunker_food":
                case "remove_bunker_water":
                {
                    if (room.Bunker == null) return EffectFailure("bunker_not_available");
                    var amount = ReadInt(effect, "amount");
                    var kind = type.EndsWith("water", StringComparison.Ordinal) ? BunkerResourceKind.Water : BunkerResourceKind.Food;
                    var available = kind == BunkerResourceKind.Water ? room.Bunker.WaterMonths : room.Bunker.SuppliesMonths;
                    if (amount <= 0 || available < amount) return EffectFailure("insufficient_bunker_resource");
                    changes.Add(_resources.Remove(room.Bunker, kind, amount));
                    break;
                }
                case "reveal_bunker_intel_public":
                {
                    var count = Math.Max(1, ReadInt(effect, "count", 1));
                    for (var index = 0; index < count; index++)
                    {
                        var category = ResolveIntelCategory(room, actualTarget, effect, selectedOptionId, privateReveal: false);
                        if (category == null) return EffectFailure("bunker_intel_category_required");
                        changes.Add(_intel.RevealPublic(room, category, ReadString(effect, "scopePolicy")));
                    }
                    break;
                }
                case "reveal_bunker_intel_private":
                {
                    var category = ResolveIntelCategory(room, actualTarget, effect, selectedOptionId, privateReveal: true);
                    if (category == null) return EffectFailure("bunker_intel_category_required");
                    changes.Add(_intel.RevealPrivate(room, actualTarget, category, ReadString(effect, "scopePolicy")));
                    break;
                }
                case "reveal_random_bunker_intel_private":
                    for (var index = 0; index < Math.Max(1, ReadInt(effect, "count", 1)); index++)
                        changes.Add(_intel.RevealRandomPrivate(room, actualTarget));
                    break;
                case "grant_inventory_card":
                {
                    var count = Math.Max(1, ReadInt(effect, "count", 1));
                    for (var index = 0; index < count; index++)
                    {
                        var item = _generator.Generate("Scenario",
                            RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value))
                            .Inventory.Items.FirstOrDefault();
                        if (item == null) continue;
                        actualTarget.Inventory.Items.Add(item);
                        changes.Add(new { type, playerId = actualTarget.Id, itemId = item.InstanceId });
                    }
                    break;
                }
                case "grant_property_reroll":
                {
                    var replacement = _generator.GenerateProperty(
                        RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value),
                        actualTarget.Property?.DefinitionId);
                    if (replacement == null) return EffectFailure("property_generation_failed");
                    actualTarget.Property = replacement;
                    changes.Add(new { type, playerId = actualTarget.Id });
                    break;
                }
                case "steal_all_bunker_supplies":
                {
                    if (card == null) return EffectFailure("event_card_required");
                    if (room.Bunker == null) return EffectFailure("bunker_not_available");
                    if (card.TheftActivated) return EffectFailure("event_card_action_already_applied");

                    var food = room.Bunker.SuppliesMonths;
                    var water = room.Bunker.WaterMonths;
                    card.StoredRuntimeValues["food"] = food;
                    card.StoredRuntimeValues["water"] = water;
                    if (food > 0)
                        changes.Add(_resources.Remove(room.Bunker, BunkerResourceKind.Food, food));
                    if (water > 0)
                        changes.Add(_resources.Remove(room.Bunker, BunkerResourceKind.Water, water));
                    card.TheftActivated = true;
                    card.Status = EventSpecialCardStatus.PendingChoice;
                    card.UsedAtRound = room.CurrentRound;
                    changes.Add(new { type = "bunker_supplies_stolen" });
                    break;
                }
                case "keep_stolen_supplies":
                {
                    if (!CanResolveTheft(card)) return EffectFailure("event_card_choice_not_available");
                    CreatePersistentStolenCache(room, actualTarget, card!);
                    CompleteTheftDecision(card!, room.CurrentRound, EventSpecialCardResult.Kept);
                    changes.Add(new { type = "stolen_supplies_kept" });
                    break;
                }
                case "return_stolen_supplies":
                {
                    if (!CanResolveTheft(card)) return EffectFailure("event_card_choice_not_available");
                    if (room.Bunker == null) return EffectFailure("bunker_not_available");
                    var storedFood = ReadStoredRuntime(card!, "food");
                    var storedWater = ReadStoredRuntime(card!, "water");
                    if (storedFood > 0)
                        changes.Add(_resources.Add(room.Bunker, BunkerResourceKind.Food, storedFood));
                    if (storedWater > 0)
                        changes.Add(_resources.Add(room.Bunker, BunkerResourceKind.Water, storedWater));
                    CompleteTheftDecision(card!, room.CurrentRound, EventSpecialCardResult.Returned);
                    changes.Add(new { type = "stolen_supplies_returned" });
                    break;
                }
                case "frame_supply_theft":
                {
                    if (!CanResolveTheft(card)) return EffectFailure("event_card_choice_not_available");
                    if (card!.TransferDepth >= 1) return EffectFailure("event_card_transfer_depth_exceeded");
                    if (owner.Id == actualTarget.Id || !IsActiveRoomPlayer(room, actualTarget))
                        return EffectFailure("invalid_event_card_target");
                    if (actualTarget.EventSpecialCards.Any(existing =>
                            existing.Status == EventSpecialCardStatus.PendingChoice))
                        return EffectFailure("event_card_target_has_pending_choice");

                    card.Status = EventSpecialCardStatus.Resolved;
                    card.Result = EventSpecialCardResult.Framed;
                    card.ResolvedAtRound = room.CurrentRound;
                    card.RemainingUses = 0;
                    var framed = CloneForNewOwner(card, actualTarget, EventSpecialCardStatus.PendingChoice);
                    framed.TransferDepth = 1;
                    framed.TheftActivated = true;
                    actualTarget.EventSpecialCards.Add(framed);
                    changes.Add(new
                    {
                        type = "supply_theft_framed",
                        targetPlayerId = actualTarget.Id,
                        runtimeCardId = framed.RuntimeCardId
                    });
                    break;
                }
                case "grant_profession_retraining":
                {
                    if (card == null) return EffectFailure("event_card_required");
                    if (card.PendingProfessionOptions.Count == 0)
                        card.PendingProfessionOptions = GenerateProfessionOptions(room, actualTarget, Math.Max(1, ReadInt(effect, "optionsCount", 3)));
                    if (string.IsNullOrWhiteSpace(selectedOptionId))
                    {
                        options.AddRange(card.PendingProfessionOptions.Select(option => new { id = option.Name, option.Name }));
                        break;
                    }
                    var profession = card.PendingProfessionOptions.FirstOrDefault(option =>
                        string.Equals(option.Name, selectedOptionId, StringComparison.OrdinalIgnoreCase));
                    if (profession == null) return EffectFailure("profession_option_not_found");
                    actualTarget.Profession = profession;
                    card.PendingProfessionOptions.Clear();
                    changes.Add(new { type, playerId = actualTarget.Id });
                    break;
                }
                case "reveal_random_characteristic":
                    changes.AddRange(InspectRandomCharacteristics(room, owner, actualTarget,
                        Math.Max(1, ReadInt(effect, "count", 1))));
                    break;
                case "heal_physical_severity":
                    ChangeSeverity(actualTarget.PhysicalHealth, -Math.Max(1, ReadInt(effect, "levels", 1)));
                    changes.Add(new { type, playerId = actualTarget.Id });
                    break;
                case "worsen_physical_severity":
                    ChangeSeverity(actualTarget.PhysicalHealth, Math.Max(1, ReadInt(effect, "levels", 1)));
                    changes.Add(new { type, playerId = actualTarget.Id });
                    break;
                case "heal_mental_severity":
                    ChangeSeverity(actualTarget.MentalHealth, -Math.Max(1, ReadInt(effect, "levels", 1)));
                    changes.Add(new { type, playerId = actualTarget.Id });
                    break;
                case "worsen_mental_severity":
                    ChangeSeverity(actualTarget.MentalHealth, Math.Max(1, ReadInt(effect, "levels", 1)));
                    changes.Add(new { type, playerId = actualTarget.Id });
                    break;
                case "cancel_other_player_elimination":
                    if (owner.Id == actualTarget.Id || !actualTarget.IsEliminated ||
                        room.PendingElimination?.PlayerId != actualTarget.Id.ToString("N"))
                        return EffectFailure("no_pending_other_player_elimination");
                    actualTarget.IsEliminated = false;
                    actualTarget.EliminatedAtRound = null;
                    actualTarget.EliminatedByVote = false;
                    actualTarget.CanRevealAllAfterElimination = false;
                    room.PendingElimination = null;
                    changes.Add(new { type, playerId = actualTarget.Id });
                    break;
                default:
                    return EffectFailure("unsupported_scenario_effect");
            }
        }
        return new(true, null, changes, options);
    }

    public object Project(EventSpecialCard card)
    {
        var definition = _content.FindCard(card.DefinitionId);
        var availableActions = definition == null
            ? Array.Empty<JsonElement>()
            : GetAvailableActionDefinitions(card, definition).Select(action => action.Clone()).ToArray();
        return new
        {
            runtimeCardId = card.RuntimeCardId,
            definitionId = card.DefinitionId,
            title = definition?.Title,
            description = definition?.Description,
            card.GrantedAtRound,
            card.ExpiresAfterRound,
            card.RemainingUses,
            card.IsRevealedPublicly,
            status = ToClientCode(card.Status),
            result = ToClientCode(card.Result),
            card.UsedAtRound,
            card.ResolvedAtRound,
            pendingProfessionOptions = card.PendingProfessionOptions.Select(option => new { option.Name }).ToArray(),
            canUse = availableActions.Length > 0,
            availableActions,
            actions = availableActions
        };
    }

    public IReadOnlyList<object> ProjectForOwner(Player owner) =>
        owner.EventSpecialCards
            .OrderBy(card => card.Status is EventSpecialCardStatus.Available or EventSpecialCardStatus.PendingChoice ? 0 : 1)
            .ThenByDescending(card => card.GrantedAtUtc)
            .Select(Project)
            .ToArray();

    public EventCardRoundBoundaryResult ProcessRoundBoundary(Room room, int completedRound)
    {
        var changedPlayers = new Dictionary<Guid, Player>();
        var notices = new List<EventCardPublicNotice>();
        foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value))
        {
            foreach (var card in player.EventSpecialCards.ToArray())
            {
                if (card.ExpiresAfterRound is not { } expiry || expiry > completedRound)
                    continue;

                if (card.Status == EventSpecialCardStatus.Available)
                {
                    card.Status = EventSpecialCardStatus.Expired;
                    card.Result = EventSpecialCardResult.OpportunityMissed;
                    card.RemainingUses = 0;
                    card.ResolvedAtRound = completedRound;
                    changedPlayers[player.Id] = player;
                }
                else if (card.Status == EventSpecialCardStatus.PendingChoice)
                {
                    if (card.TheftActivated)
                    {
                        CreatePersistentStolenCache(room, player, card);
                        card.Result = EventSpecialCardResult.Kept;
                        card.PublicRevealPending = true;
                    }
                    else
                    {
                        card.Result = EventSpecialCardResult.OpportunityMissed;
                    }
                    card.Status = EventSpecialCardStatus.Expired;
                    card.RemainingUses = 0;
                    card.ResolvedAtRound = completedRound;
                    changedPlayers[player.Id] = player;
                }

                if (card.PublicRevealPending && !card.PublicRevealCompleted)
                {
                    var code = card.Result == EventSpecialCardResult.Returned
                        ? "supplies_returned_accusation"
                        : "supplies_missing_accusation";
                    notices.Add(new(code, player.Name));
                    card.PublicRevealPending = false;
                    card.PublicRevealCompleted = true;
                    changedPlayers[player.Id] = player;
                }
            }
        }
        return new(changedPlayers.Values.ToArray(), notices);
    }

    private List<Profession> GenerateProfessionOptions(Room room, Player target, int count)
    {
        var result = new List<Profession>();
        for (var attempt = 0; attempt < 60 && result.Count < count; attempt++)
        {
            if (_generator.GenerateCharacteristicForSpecialCard("Profession",
                    RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value)) is not Profession profession)
                continue;
            if (string.Equals(profession.Name, target.Profession.Name, StringComparison.OrdinalIgnoreCase) ||
                result.Any(item => string.Equals(item.Name, profession.Name, StringComparison.OrdinalIgnoreCase)))
                continue;
            result.Add(profession);
        }
        return result;
    }

    private IReadOnlyList<object> InspectRandomCharacteristics(Room room, Player owner, Player target, int count)
    {
        var values = new List<(string Type, string Value)>
        {
            ("Profession", target.Profession.Name),
            ("Property", target.Property?.GetDisplayText("uk") ?? ""),
            ("PhysicalHealth", target.PhysicalHealth.Name),
            ("MentalHealth", target.MentalHealth.Name),
            ("Hobby", target.Hobby.Name),
            ("CharacterTrait", target.CharacterTrait.Name),
            ("Phobia", target.Phobia.Name),
            ("Fact", target.Fact.Name)
        };
        var existing = owner.PrivateInspectedFacts.Where(fact => fact.TargetPlayerId == target.Id.ToString("N"))
            .Select(fact => fact.CharacteristicType).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var candidates = values.Where(value => !string.IsNullOrWhiteSpace(value.Value) && !existing.Contains(value.Type))
            .OrderBy(_ => Random.Shared.Next()).Take(count).ToList();
        var result = new List<object>();
        foreach (var candidate in candidates)
        {
            var fact = new PrivateInspectedFact
            {
                SourceScenarioId = room.ScenarioSituations?.ActiveScenario?.ScenarioId ?? "",
                TargetPlayerId = target.Id.ToString("N"),
                CharacteristicType = candidate.Type,
                Value = candidate.Value,
                InspectedAtUtc = _timeProvider.GetUtcNow()
            };
            owner.PrivateInspectedFacts.Add(fact);
            result.Add(fact);
        }
        return result;
    }

    private static void ChangeSeverity(PhysicalHealth health, int delta)
    {
        if (!health.AllowsSeverity) return;
        var current = SeverityHelper.GetSeverityLevelFromCode(health.SeverityCode);
        var next = (SeverityLevel)Math.Clamp((int)current + delta, (int)SeverityLevel.Mild, (int)SeverityLevel.Critical);
        health.SeverityCode = SeverityHelper.GetSeverityCode(next);
        health.SeverityLevel = SeverityHelper.GetSeverityName(next, "uk");
        health.Name = SeverityHelper.FormatNameWithSeverity(health.BaseName, next, "uk");
    }

    private static void ChangeSeverity(MentalHealth health, int delta)
    {
        if (!health.AllowsSeverity) return;
        var current = SeverityHelper.GetSeverityLevelFromCode(health.SeverityCode);
        var next = (SeverityLevel)Math.Clamp((int)current + delta, (int)SeverityLevel.Mild, (int)SeverityLevel.Critical);
        health.SeverityCode = SeverityHelper.GetSeverityCode(next);
        health.SeverityLevel = SeverityHelper.GetSeverityName(next, "uk");
        health.Name = SeverityHelper.FormatNameWithSeverity(health.BaseName, next, "uk");
    }

    private static bool ValidateTarget(Room room, Player owner, Player? target, string targetMode) => targetMode switch
    {
        "room" or "self" => true,
        "other_active_player" =>
            target != null && target.Id != owner.Id && IsActiveRoomPlayer(room, target),
        "eliminated_other_player" =>
            target != null && target.Id != owner.Id && IsRoomPlayer(room, target) && target.IsEliminated,
        "self_or_other_active_player" => target == null || IsActiveRoomPlayer(room, target),
        _ => false
    };
    private static bool IsRoomPlayer(Room room, Player player) =>
        RoomService.GetPlayersSnapshot(room).Any(entry => entry.Value.Id == player.Id);
    private static bool IsActiveRoomPlayer(Room room, Player player) =>
        IsRoomPlayer(room, player) && !player.IsEliminated && !player.IsLobbySpectator && !player.IsSpectatorGm;
    private static EventSpecialCard? FindOwned(Player owner, string runtimeCardId) =>
        owner.EventSpecialCards.FirstOrDefault(card =>
            string.Equals(card.RuntimeCardId, runtimeCardId, StringComparison.OrdinalIgnoreCase) &&
            string.Equals(card.OwnerPlayerId, owner.Id.ToString("N"), StringComparison.OrdinalIgnoreCase));
    private static bool Remember(EventSpecialCard card, string commandId) =>
        !string.IsNullOrWhiteSpace(commandId) && card.ProcessedCommandIds.Add(commandId);
    private static bool CanAct(EventSpecialCard card) =>
        card.RemainingUses > 0 &&
        card.Status is EventSpecialCardStatus.Available or EventSpecialCardStatus.PendingChoice;
    private static string CardUnavailableCode(EventSpecialCard card) =>
        card.Status == EventSpecialCardStatus.Expired ? "event_card_expired" : "event_card_consumed";
    private static bool CanResolveTheft(EventSpecialCard? card) =>
        card is { TheftActivated: true, Status: EventSpecialCardStatus.PendingChoice, RemainingUses: > 0 };
    private static EventCardCommandResult Failure(string code) => new(false, false, code, null, null);
    private static ScenarioEffectResult EffectFailure(string code) => new(false, code, [], []);
    private string? ResolveIntelCategory(
        Room room,
        Player player,
        JsonElement effect,
        string? selectedOptionId,
        bool privateReveal)
    {
        var explicitCategory = ReadString(effect, "category");
        if (!string.IsNullOrWhiteSpace(explicitCategory)) return explicitCategory;
        var selection = ReadString(effect, "categorySelection");
        if (selection == "owner_choice")
            return selectedOptionId is "condition" or "food" or "water" or "facilities" or "resources" or "problems"
                ? selectedOptionId
                : null;
        if (selection == "random_hidden")
        {
            var categories = _intel.GetHiddenCategories(room, privateReveal ? player : null);
            return categories.Count == 0 ? null : categories[Random.Shared.Next(categories.Count)];
        }
        return null;
    }
    private static JsonElement? ResolveEffects(JsonElement action, string? choiceId)
    {
        if (action.TryGetProperty("effects", out var effects)) return effects;
        if (!action.TryGetProperty("choices", out var choices) || string.IsNullOrWhiteSpace(choiceId)) return null;
        var choice = choices.EnumerateArray().FirstOrDefault(item =>
            string.Equals(ReadString(item, "id"), choiceId, StringComparison.OrdinalIgnoreCase));
        return choice.ValueKind == JsonValueKind.Object && choice.TryGetProperty("effects", out effects) ? effects : null;
    }
    private static IEnumerable<JsonElement> GetAvailableActionDefinitions(
        EventSpecialCard card,
        EventSpecialCardDefinition definition)
    {
        if (!CanAct(card) || !definition.Source.TryGetProperty("actions", out var actions))
            return [];
        var result = actions.EnumerateArray();
        if (!string.Equals(card.DefinitionId, "main_store_access", StringComparison.OrdinalIgnoreCase))
            return result.ToArray();
        if (!card.TheftActivated)
            return result.Where(action =>
                string.Equals(ReadString(action, "id"), "steal_all_supplies", StringComparison.OrdinalIgnoreCase))
                .ToArray();
        return result.Where(action =>
        {
            var id = ReadString(action, "id");
            return id is "keep_supplies" or "return_supplies" ||
                   string.Equals(id, "frame_player", StringComparison.OrdinalIgnoreCase) &&
                   card.TransferDepth < 1;
        }).ToArray();
    }
    private static EventSpecialCard CloneForNewOwner(
        EventSpecialCard source,
        Player recipient,
        EventSpecialCardStatus status)
    {
        return new EventSpecialCard
        {
            DefinitionId = source.DefinitionId,
            SourceScenarioId = source.SourceScenarioId,
            OriginalOwnerPlayerId = string.IsNullOrWhiteSpace(source.OriginalOwnerPlayerId)
                ? source.OwnerPlayerId
                : source.OriginalOwnerPlayerId,
            OwnerPlayerId = recipient.Id.ToString("N"),
            GrantedAtRound = source.GrantedAtRound,
            ExpiresAfterRound = source.ExpiresAfterRound,
            RemainingUses = 1,
            Status = status,
            TransferDepth = source.TransferDepth + 1,
            TheftActivated = source.TheftActivated,
            PublicRevealPending = source.PublicRevealPending,
            IsRevealedPublicly = source.IsRevealedPublicly,
            StoredResource = source.StoredResource,
            StoredRuntimeValues = new(source.StoredRuntimeValues, StringComparer.OrdinalIgnoreCase),
            GrantedAtUtc = source.GrantedAtUtc,
            Title = new(source.Title, StringComparer.OrdinalIgnoreCase),
            Description = new(source.Description, StringComparer.OrdinalIgnoreCase),
            Actions = source.Actions.Clone()
        };
    }
    private EventSpecialCard CreatePersistentStolenCache(Room room, Player owner, EventSpecialCard source)
    {
        var existing = owner.EventSpecialCards.FirstOrDefault(card =>
            string.Equals(card.DefinitionId, "stolen_bunker_cache", StringComparison.OrdinalIgnoreCase) &&
            string.Equals(card.SourceScenarioId, source.RuntimeCardId, StringComparison.OrdinalIgnoreCase));
        if (existing != null) return existing;
        var cache = Grant(room, owner, "stolen_bunker_cache", source.RuntimeCardId);
        cache.Status = EventSpecialCardStatus.Resolved;
        cache.Result = EventSpecialCardResult.Kept;
        cache.RemainingUses = 0;
        cache.ResolvedAtRound = room.CurrentRound;
        cache.StoredRuntimeValues = new(source.StoredRuntimeValues, StringComparer.OrdinalIgnoreCase);
        return cache;
    }
    private static void CompleteTheftDecision(
        EventSpecialCard card,
        int round,
        EventSpecialCardResult result)
    {
        card.Status = EventSpecialCardStatus.Resolved;
        card.Result = result;
        card.RemainingUses = 0;
        card.ResolvedAtRound = round;
        card.PublicRevealPending = true;
    }
    private static int ReadStoredRuntime(EventSpecialCard card, string key) =>
        card.StoredRuntimeValues.TryGetValue(key, out var value) ? Math.Max(0, value) : 0;
    private static string ToClientCode<T>(T value) where T : struct, Enum =>
        value.ToString().ToLowerInvariant() switch
        {
            "pendingchoice" => "pending_choice",
            "opportunitymissed" => "opportunity_missed",
            var code => code
        };
    private static StoredScenarioResource? ReadStoredResource(JsonElement definition)
    {
        if (!definition.TryGetProperty("storedResource", out var value)) return null;
        var type = ReadString(value, "type");
        var amount = ReadInt(value, "amount");
        return string.IsNullOrWhiteSpace(type) || amount <= 0 ? null : new(type, amount);
    }
    private static string ReadString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static int ReadInt(JsonElement element, string property, int fallback = 0) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) &&
        value.TryGetInt32(out var result) ? result : fallback;
    private static int? ReadNullableInt(JsonElement element, string property) =>
        element.TryGetProperty(property, out var value) && value.TryGetInt32(out var result) ? result : null;
    private static bool ReadBool(JsonElement element, string property, bool fallback = false) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) &&
        value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : fallback;
}
