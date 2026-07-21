using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public sealed record ScenarioRecipientMessage(Player Player, ScenarioPrivateDto Payload);
public sealed record ScenarioRunResult(
    bool Success,
    string? ErrorCode,
    ScenarioPublicDto? Public,
    IReadOnlyList<ScenarioRecipientMessage> Private,
    bool BlocksVoting,
    int FoodBefore,
    int FoodAfter,
    int WaterBefore,
    int WaterAfter);

public sealed class ScenarioRunnerService
{
    private readonly ScenarioSchedulerService _scheduler;
    private readonly EventSpecialCardService _cards;
    private readonly BunkerIntelService _intel;
    private readonly TimeProvider _timeProvider;

    public ScenarioRunnerService(
        ScenarioSchedulerService scheduler,
        EventSpecialCardService cards,
        BunkerIntelService intel,
        TimeProvider timeProvider)
    {
        _scheduler = scheduler;
        _cards = cards;
        _intel = intel;
        _timeProvider = timeProvider;
    }

    public ScenarioRunResult Run(
        Room room,
        ScenarioDefinition scenario,
        int completedRound,
        string language = "uk",
        string? commandId = null)
    {
        var state = room.ScenarioSituations;
        if (!string.IsNullOrWhiteSpace(commandId))
        {
            if (state == null) return EmptyFailure("scenario_disabled");
            lock (state.ProcessedCommandIds)
            {
                if (!state.ProcessedCommandIds.Add(commandId))
                    return EmptySuccess();
            }
        }

        try
        {
            var result = RunCore(room, scenario, completedRound, language);
            if (!result.Success) ForgetCommand(state, commandId);
            return result;
        }
        catch
        {
            ForgetCommand(state, commandId);
            throw;
        }
    }

    private ScenarioRunResult RunCore(
        Room room,
        ScenarioDefinition scenario,
        int completedRound,
        string language)
    {
        var foodBefore = room.Bunker?.SuppliesMonths ?? 0;
        var waterBefore = room.Bunker?.WaterMonths ?? 0;
        var privateMessages = new List<ScenarioRecipientMessage>();
        var players = ActivePlayers(room);
        var selected = scenario.ResolutionMode == "existing_threat_flow"
            ? []
            : SelectTargets(scenario.Source, players);
        var active = _scheduler.MarkStarted(room, scenario, completedRound);

        if (scenario.ResolutionMode == "existing_threat_flow")
        {
            return Build(true, null, scenario, active, privateMessages, true,
                foodBefore, waterBefore, room, language);
        }

        if (scenario.Source.TryGetProperty("effects", out var effects))
        {
            foreach (var effect in effects.EnumerateArray())
            {
                var effectTargets = ReadString(effect, "targets");
                if (effectTargets is "all_active_players" or "all_active_affected_players" or "selected_players")
                {
                    var recipients = effectTargets switch
                    {
                        "selected_players" => selected,
                        "all_active_affected_players" => players.Where(player =>
                            player.PhysicalHealth.AllowsSeverity || player.MentalHealth.AllowsSeverity).ToList(),
                        _ => players
                    };
                    foreach (var player in recipients)
                    {
                        using var wrapper = JsonDocument.Parse($"[{effect.GetRawText()}]");
                        var result = _cards.ApplyEffects(room, player, player, null, wrapper.RootElement);
                        if (!result.Success) return Build(false, result.ErrorCode, scenario, active, [], false,
                            foodBefore, waterBefore, room, language);
                    }
                }
                else
                {
                    using var wrapper = JsonDocument.Parse($"[{effect.GetRawText()}]");
                    var actor = selected.FirstOrDefault() ?? players.FirstOrDefault();
                    if (actor == null) return Build(false, "no_eligible_player", scenario, active, [], false,
                        foodBefore, waterBefore, room, language);
                    var result = _cards.ApplyEffects(room, actor, actor, null, wrapper.RootElement);
                    if (!result.Success) return Build(false, result.ErrorCode, scenario, active, [], false,
                        foodBefore, waterBefore, room, language);
                }
            }
        }

        if (scenario.ResolutionMode == "secret_player_choice")
        {
            var recipient = selected.FirstOrDefault();
            if (recipient == null || !scenario.Source.TryGetProperty("privateChoice", out var choice))
                return Build(false, "private_choice_not_available", scenario, active, [], false,
                    foodBefore, waterBefore, room, language);
            var choiceId = Guid.NewGuid().ToString("N");
            var expiry = _timeProvider.GetUtcNow().AddSeconds(ScenarioRules.PrivateChoiceTimeoutSeconds);
            room.ScenarioSituations!.PendingPrivateChoices[choiceId] = new PendingScenarioChoice
            {
                ChoiceId = choiceId,
                ScenarioId = scenario.Id,
                PlayerId = recipient.Id.ToString("N"),
                ExpiresAtUtc = expiry,
                Payload = choice.Clone()
            };
            privateMessages.Add(new(recipient, new ScenarioPrivateDto(
                active.Id, scenario.Id, Localized(scenario.Title, language),
                LocalizedProperty(choice, "message", language), null,
                new
                {
                    choiceId,
                    choices = choice.GetProperty("choices").Clone(),
                    targetMode = "other_active_player"
                },
                expiry)));
            active.IsBlocking = true;
            return Build(true, null, scenario, active, privateMessages, true,
                foodBefore, waterBefore, room, language);
        }

        if (scenario.Source.TryGetProperty("privatePayloads", out var payloads))
        {
            var index = 0;
            foreach (var payload in payloads.EnumerateArray())
            {
                var recipient = ResolvePayloadTarget(payload, selected, index++);
                if (recipient == null) continue;
                object? cardProjection = null;
                if (payload.TryGetProperty("grantCardId", out var grantCardId))
                {
                    var card = _cards.Grant(room, recipient, grantCardId.GetString()!, scenario.Id);
                    cardProjection = _cards.Project(card);
                }
                if (payload.TryGetProperty("effect", out var privateEffect))
                {
                    using var wrapper = JsonDocument.Parse($"[{privateEffect.GetRawText()}]");
                    var effectResult = _cards.ApplyEffects(room, recipient, recipient, null, wrapper.RootElement);
                    if (!effectResult.Success)
                        return Build(false, effectResult.ErrorCode, scenario, active, [], false,
                            foodBefore, waterBefore, room, language);
                }
                privateMessages.Add(new(recipient, new ScenarioPrivateDto(
                    active.Id, scenario.Id, Localized(scenario.Title, language),
                    LocalizedProperty(payload, "message", language),
                    cardProjection, null, null)));
            }
        }

        _scheduler.MarkResolved(room);
        return Build(true, null, scenario, active, privateMessages, false,
            foodBefore, waterBefore, room, language);
    }

    public ScenarioRunResult ResolvePrivateChoice(
        Room room,
        Player actor,
        string choiceCommandId,
        string choiceId,
        string optionId,
        Player? selectedTarget,
        string language = "uk")
    {
        var state = room.ScenarioSituations;
        if (state == null) return EmptyFailure("scenario_disabled");
        lock (state.ProcessedCommandIds)
        {
            if (state.ProcessedCommandIds.Contains(choiceCommandId))
                return EmptySuccess();
            if (string.IsNullOrWhiteSpace(choiceCommandId) || !state.ProcessedCommandIds.Add(choiceCommandId))
                return EmptyFailure("invalid_command_id");
            if (!state.PendingPrivateChoices.TryGetValue(choiceId, out var pending) ||
                pending.PlayerId != actor.Id.ToString("N"))
                return EmptyFailure("pending_choice_not_found");
            if (_timeProvider.GetUtcNow() > pending.ExpiresAtUtc)
                return EmptyFailure("pending_choice_expired");
            var option = pending.Payload.GetProperty("choices").EnumerateArray().FirstOrDefault(item =>
                string.Equals(ReadString(item, "id"), optionId, StringComparison.OrdinalIgnoreCase));
            if (option.ValueKind != JsonValueKind.Object || !option.TryGetProperty("effects", out var effects))
                return EmptyFailure("scenario_choice_not_found");
            if (option.TryGetProperty("requiresTarget", out _) &&
                (selectedTarget == null || selectedTarget.Id == actor.Id || !ActivePlayers(room).Any(player => player.Id == selectedTarget.Id)))
                return EmptyFailure("invalid_scenario_choice_target");

            var result = _cards.ApplyEffects(room, actor, selectedTarget ?? actor, null, effects);
            if (!result.Success)
            {
                state.ProcessedCommandIds.Remove(choiceCommandId);
                return EmptyFailure(result.ErrorCode ?? "scenario_effect_failed");
            }
            state.PendingPrivateChoices.Remove(choiceId);
            _scheduler.MarkResolved(room);
            return new(true, null, null, [], false,
                room.Bunker?.SuppliesMonths ?? 0, room.Bunker?.SuppliesMonths ?? 0,
                room.Bunker?.WaterMonths ?? 0, room.Bunker?.WaterMonths ?? 0);
        }
    }

    public bool SkipPendingChoice(Room room, string choiceId, string commandId)
    {
        var state = room.ScenarioSituations;
        if (state == null || string.IsNullOrWhiteSpace(commandId)) return false;
        lock (state.ProcessedCommandIds)
        {
            if (!state.ProcessedCommandIds.Add(commandId)) return true;
            if (!state.PendingPrivateChoices.Remove(choiceId)) return false;
            if (state.PendingPrivateChoices.Count == 0) _scheduler.MarkResolved(room, "host_skipped");
            return true;
        }
    }

    private ScenarioRunResult Build(
        bool success,
        string? error,
        ScenarioDefinition scenario,
        ActiveScenarioSituation active,
        IReadOnlyList<ScenarioRecipientMessage> privateMessages,
        bool blocksVoting,
        int foodBefore,
        int waterBefore,
        Room room,
        string language)
    {
        var publicDto = new ScenarioPublicDto(
            active.Id,
            scenario.Id,
            scenario.Type,
            Localized(scenario.Title, language),
            Localized(scenario.PublicText, language),
            scenario.ResolutionMode,
            active.TriggeredAfterRound,
            blocksVoting);
        return new(success, error, publicDto, privateMessages, blocksVoting,
            foodBefore, room.Bunker?.SuppliesMonths ?? 0,
            waterBefore, room.Bunker?.WaterMonths ?? 0);
    }

    private static List<Player> ActivePlayers(Room room) =>
        RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value)
            .Where(player => !player.IsEliminated).ToList();
    private static List<Player> SelectTargets(JsonElement source, IReadOnlyList<Player> players)
    {
        if (!TryReadTargetSelection(source, out var selection))
            return [];

        var mode = ReadString(selection, "mode");
        if (!ScenarioRules.TryGetTargetSelectionCount(mode, out var desired))
            throw new InvalidDataException($"Unknown scenario target selector mode '{mode}'.");
        var excludeMaximumSeverity = ReadOptionalBoolean(
            selection,
            "excludePlayersAtMaximumPhysicalSeverity");
        _ = ReadOptionalBoolean(selection, "excludeHostRoleOnlySpectators");

        if (players.Count == 0) return [];
        var candidates = excludeMaximumSeverity
            ? players.Where(player => !string.Equals(player.PhysicalHealth.SeverityCode, "critical",
                StringComparison.OrdinalIgnoreCase)).ToList()
            : players.ToList();
        return candidates.OrderBy(player => player.EventSpecialCards.Count)
            .ThenBy(_ => Random.Shared.Next()).Take(desired).ToList();
    }
    private static bool TryReadTargetSelection(JsonElement source, out JsonElement selection)
    {
        selection = default;
        if (source.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            return false;
        if (source.ValueKind != JsonValueKind.Object)
            throw new InvalidDataException(
                $"Scenario source must be an object, but received {source.ValueKind}.");
        if (!source.TryGetProperty("targetSelection", out selection) ||
            selection.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null)
            return false;
        if (selection.ValueKind != JsonValueKind.Object)
            throw new InvalidDataException(
                $"Scenario target selector must be an object, but received {selection.ValueKind}.");
        return true;
    }
    private static bool ReadOptionalBoolean(JsonElement element, string property)
    {
        if (!element.TryGetProperty(property, out var value)) return false;
        return value.ValueKind switch
        {
            JsonValueKind.True => true,
            JsonValueKind.False => false,
            _ => throw new InvalidDataException(
                $"Scenario target selector property '{property}' must be a boolean.")
        };
    }
    private static Player? ResolvePayloadTarget(JsonElement payload, IReadOnlyList<Player> selected, int fallbackIndex)
    {
        var target = ReadString(payload, "target");
        if (target is "selected_1") return selected.ElementAtOrDefault(0);
        if (target is "selected_2") return selected.ElementAtOrDefault(1);
        if (target is "selected") return selected.ElementAtOrDefault(0);
        return selected.ElementAtOrDefault(fallbackIndex);
    }
    private static string Localized(IReadOnlyDictionary<string, string> values, string language) =>
        values.GetValueOrDefault(language) ?? values.GetValueOrDefault("uk") ?? "";
    private static string LocalizedProperty(JsonElement element, string property, string language)
    {
        if (!element.TryGetProperty(property, out var value) || value.ValueKind != JsonValueKind.Object) return "";
        return value.TryGetProperty(language, out var localized) ? localized.GetString() ?? "" :
            value.TryGetProperty("uk", out localized) ? localized.GetString() ?? "" : "";
    }
    private static string ReadString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object && element.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String ? value.GetString() ?? "" : "";
    private static ScenarioRunResult EmptyFailure(string code) =>
        new(false, code, null, [], false, 0, 0, 0, 0);
    private static ScenarioRunResult EmptySuccess() =>
        new(true, null, null, [], false, 0, 0, 0, 0);
    private static void ForgetCommand(ScenarioSituationState? state, string? commandId)
    {
        if (state == null || string.IsNullOrWhiteSpace(commandId)) return;
        lock (state.ProcessedCommandIds)
            state.ProcessedCommandIds.Remove(commandId);
    }
}
