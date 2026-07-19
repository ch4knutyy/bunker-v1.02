using System.Collections.Immutable;
using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public interface IScenarioContentRegistry
{
    ImmutableArray<ScenarioDefinition> Events { get; }
    ImmutableArray<EventSpecialCardDefinition> Cards { get; }
    ScenarioDefinition? FindEvent(string id);
    EventSpecialCardDefinition? FindCard(string id);
}

public sealed class ScenarioContentRegistry : IScenarioContentRegistry
{
    public const int RequiredSchemaVersion = 3;
    public const string EventsFileName = "scenario_events.json";
    public const string CardsFileName = "event_special_cards.json";

    private static readonly HashSet<string> KnownScenarioTypes =
        new(["event", "secret_event"], StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> KnownResolutionModes =
        new(["automatic_public_event", "automatic_secret_grant", "secret_player_choice", "split_private_information"], StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> KnownOperations =
        new(["apply_effects", "transfer_owned_card", "select_and_apply", "choose_effect"], StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> KnownEffects =
        new([
            "grant_event_card", "grant_event_card_to_other_player",
            "remove_bunker_food", "remove_bunker_water", "add_bunker_food", "add_bunker_water",
            "reveal_bunker_intel_public", "reveal_bunker_intel_private", "reveal_random_bunker_intel_private",
            "reveal_random_characteristic", "grant_inventory_card", "grant_property_reroll",
            "grant_profession_retraining", "heal_physical_severity", "worsen_physical_severity",
            "heal_mental_severity", "worsen_mental_severity", "cancel_other_player_elimination", "no_effect"
        ], StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> KnownTargets =
        new([
            "room", "self", "other_active_player", "self_or_other_active_player",
            "eliminated_other_player", "random_active_player", "two_random_active_players",
            "two_distinct_random_active_players", "owner_selected_player", "selected_or_self",
            "selected_player", "selected", "selected_1", "selected_2", "selected_players",
            "all_active_players", "all_active_affected_players"
        ], StringComparer.OrdinalIgnoreCase);
    private static readonly HashSet<string> NonNegativeProperties =
        new(["amount", "count", "levels", "minRound", "weight", "cooldownRounds", "minimumFoodMonths",
            "minimumWaterMonths", "requiresAtLeastActivePlayers", "optionsCount", "expiresAfterRounds", "maxUses"],
            StringComparer.OrdinalIgnoreCase);

    private readonly ImmutableDictionary<string, ScenarioDefinition> _eventsById;
    private readonly ImmutableDictionary<string, EventSpecialCardDefinition> _cardsById;

    public ImmutableArray<ScenarioDefinition> Events { get; }
    public ImmutableArray<EventSpecialCardDefinition> Cards { get; }

    public ScenarioContentRegistry(IWebHostEnvironment environment)
        : this(Path.Combine(environment.WebRootPath, "data", "scenario"))
    {
    }

    public ScenarioContentRegistry(string contentDirectory)
    {
        var eventsPath = Path.Combine(contentDirectory, EventsFileName);
        var cardsPath = Path.Combine(contentDirectory, CardsFileName);
        using var cardsDocument = Load(cardsPath);
        using var eventsDocument = Load(eventsPath);

        ValidateSchema(cardsDocument.RootElement, CardsFileName);
        ValidateSchema(eventsDocument.RootElement, EventsFileName);

        Cards = ReadCards(cardsDocument.RootElement, CardsFileName);
        _cardsById = Cards.ToImmutableDictionary(card => card.Id, StringComparer.OrdinalIgnoreCase);
        Events = ReadEvents(eventsDocument.RootElement, EventsFileName, _cardsById);
        _eventsById = Events.ToImmutableDictionary(item => item.Id, StringComparer.OrdinalIgnoreCase);
    }

    public ScenarioDefinition? FindEvent(string id) =>
        _eventsById.GetValueOrDefault(id);

    public EventSpecialCardDefinition? FindCard(string id) =>
        _cardsById.GetValueOrDefault(id);

    private static JsonDocument Load(string path)
    {
        try
        {
            return JsonDocument.Parse(File.ReadAllBytes(path), new JsonDocumentOptions
            {
                AllowTrailingCommas = false,
                CommentHandling = JsonCommentHandling.Disallow,
                MaxDepth = 64
            });
        }
        catch (Exception exception) when (exception is IOException or JsonException)
        {
            throw new InvalidOperationException(
                $"Scenario content validation failed: file={Path.GetFileName(path)}, path=$, id=<root>, reason={exception.Message}",
                exception);
        }
    }

    private static void ValidateSchema(JsonElement root, string file)
    {
        if (!root.TryGetProperty("schemaVersion", out var version) ||
            version.ValueKind != JsonValueKind.Number ||
            version.GetInt32() != RequiredSchemaVersion)
        {
            Fail(file, "$.schemaVersion", "<root>", $"schemaVersion must equal {RequiredSchemaVersion}");
        }
    }

    private static ImmutableArray<EventSpecialCardDefinition> ReadCards(JsonElement root, string file)
    {
        if (!root.TryGetProperty("cards", out var cards) || cards.ValueKind != JsonValueKind.Array)
            Fail(file, "$.cards", "<root>", "cards must be an array");

        var result = ImmutableArray.CreateBuilder<EventSpecialCardDefinition>();
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var index = 0;
        foreach (var card in cards.EnumerateArray())
        {
            var path = $"$.cards[{index++}]";
            var id = RequiredString(card, "id", file, path, "<unknown>");
            if (!ids.Add(id)) Fail(file, path + ".id", id, "duplicate card id");
            ValidateLocalized(card, "title", file, path, id);
            ValidateLocalized(card, "description", file, path, id);
            ValidateGenericTree(card, file, path, id);

            if (!card.TryGetProperty("actions", out var actions) || actions.ValueKind != JsonValueKind.Array)
                Fail(file, path + ".actions", id, "actions must be an array");
            var actionIndex = 0;
            foreach (var action in actions.EnumerateArray())
            {
                var actionPath = $"{path}.actions[{actionIndex++}]";
                var operation = RequiredString(action, "operation", file, actionPath, id);
                if (!KnownOperations.Contains(operation))
                    Fail(file, actionPath + ".operation", id, $"unknown card operation '{operation}'");
                ValidateTargetProperty(action, "targetMode", file, actionPath, id);
            }

            result.Add(new EventSpecialCardDefinition
            {
                Id = id,
                Enabled = OptionalBool(card, "enabled", true),
                Category = OptionalString(card, "category"),
                Transferable = actions.EnumerateArray().Any(action =>
                    string.Equals(OptionalString(action, "operation"), "transfer_owned_card", StringComparison.OrdinalIgnoreCase)),
                Title = ReadLocalized(card.GetProperty("title")),
                Description = ReadLocalized(card.GetProperty("description")),
                Source = card.Clone()
            });
        }
        return result.ToImmutable();
    }

    private static ImmutableArray<ScenarioDefinition> ReadEvents(
        JsonElement root,
        string file,
        IReadOnlyDictionary<string, EventSpecialCardDefinition> cards)
    {
        if (!root.TryGetProperty("events", out var events) || events.ValueKind != JsonValueKind.Array)
            Fail(file, "$.events", "<root>", "events must be an array");

        var result = ImmutableArray.CreateBuilder<ScenarioDefinition>();
        var ids = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var index = 0;
        foreach (var item in events.EnumerateArray())
        {
            var path = $"$.events[{index++}]";
            var id = RequiredString(item, "id", file, path, "<unknown>");
            if (!ids.Add(id)) Fail(file, path + ".id", id, "duplicate event id");
            var type = RequiredString(item, "type", file, path, id);
            var mode = RequiredString(item, "resolutionMode", file, path, id);
            if (!KnownScenarioTypes.Contains(type)) Fail(file, path + ".type", id, $"unknown scenario type '{type}'");
            if (!KnownResolutionModes.Contains(mode)) Fail(file, path + ".resolutionMode", id, $"unknown resolution mode '{mode}'");
            ValidateLocalized(item, "title", file, path, id);
            ValidateLocalized(item, "publicText", file, path, id);
            ValidateGenericTree(item, file, path, id);
            ValidateCardReferences(item, file, path, id, cards);
            ValidateResourceEligibility(item, file, path, id);
            ValidateEventTargetSelection(item, mode, file, path, id);

            result.Add(new ScenarioDefinition
            {
                Id = id,
                Enabled = OptionalBool(item, "enabled", true),
                Type = type,
                ResolutionMode = mode,
                MinRound = OptionalInt(item, "minRound"),
                Weight = Math.Max(0, OptionalInt(item, "weight", 1)),
                OncePerGame = OptionalBool(item, "oncePerGame", false),
                CooldownGroup = OptionalString(item, "cooldownGroup"),
                CooldownRounds = OptionalInt(item, "cooldownRounds"),
                Title = ReadLocalized(item.GetProperty("title")),
                PublicText = ReadLocalized(item.GetProperty("publicText")),
                Source = item.Clone()
            });
        }
        return result.ToImmutable();
    }

    private static void ValidateGenericTree(JsonElement element, string file, string path, string id)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                var childPath = path + "." + property.Name;
                if (NonNegativeProperties.Contains(property.Name) &&
                    property.Value.ValueKind == JsonValueKind.Number &&
                    property.Value.TryGetDecimal(out var number) && number < 0)
                    Fail(file, childPath, id, $"{property.Name} cannot be negative");

                if (string.Equals(property.Name, "type", StringComparison.OrdinalIgnoreCase) &&
                    path.Contains("effects[", StringComparison.Ordinal) &&
                    property.Value.ValueKind == JsonValueKind.String &&
                    !KnownEffects.Contains(property.Value.GetString()!))
                    Fail(file, childPath, id, $"unknown effect type '{property.Value.GetString()}'");

                if (property.Name is "target" or "targetMode" or "targets" &&
                    property.Value.ValueKind == JsonValueKind.String &&
                    !KnownTargets.Contains(property.Value.GetString()!))
                    Fail(file, childPath, id, $"unknown target value '{property.Value.GetString()}'");

                if (property.Name is "label" or "message" or "publicResult" or "publicEffectsSummary" &&
                    property.Value.ValueKind == JsonValueKind.Object)
                    ValidateLocalizedObject(property.Value, file, childPath, id);

                ValidateGenericTree(property.Value, file, childPath, id);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            var index = 0;
            foreach (var child in element.EnumerateArray())
                ValidateGenericTree(child, file, $"{path}[{index++}]", id);
        }
    }

    private static void ValidateCardReferences(
        JsonElement element,
        string file,
        string path,
        string id,
        IReadOnlyDictionary<string, EventSpecialCardDefinition> cards)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                var childPath = path + "." + property.Name;
                if (property.Name is "grantCardId" or "cardId" or "excludeWhenExistingOwnedCard" or "excludeWhenAnyPlayerOwnsCard" &&
                    property.Value.ValueKind == JsonValueKind.String)
                {
                    var cardId = property.Value.GetString()!;
                    if (!cards.TryGetValue(cardId, out var card))
                    {
                        Fail(file, childPath, id, $"referenced card '{cardId}' does not exist");
                        continue;
                    }
                    if (OptionalBool(element, "enabled", true) && !card.Enabled)
                        Fail(file, childPath, id, $"active event references disabled card '{cardId}'");
                }
                ValidateCardReferences(property.Value, file, childPath, id, cards);
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            var index = 0;
            foreach (var child in element.EnumerateArray())
                ValidateCardReferences(child, file, $"{path}[{index++}]", id, cards);
        }
    }

    private static void ValidateResourceEligibility(JsonElement item, string file, string path, string id)
    {
        var minimumFood = item.TryGetProperty("eligibility", out var eligibility)
            ? OptionalInt(eligibility, "minimumFoodMonths") : 0;
        var minimumWater = item.TryGetProperty("eligibility", out eligibility)
            ? OptionalInt(eligibility, "minimumWaterMonths") : 0;
        var removedFood = FindMaximumEffectAmount(item, "remove_bunker_food");
        var removedWater = FindMaximumEffectAmount(item, "remove_bunker_water");
        if (removedFood > minimumFood)
            Fail(file, path + ".eligibility.minimumFoodMonths", id, "resource theft can remove more food than eligibility guarantees");
        if (removedWater > minimumWater)
            Fail(file, path + ".eligibility.minimumWaterMonths", id, "resource theft can remove more water than eligibility guarantees");
    }

    private static int FindMaximumEffectAmount(JsonElement element, string effectType)
    {
        var maximum = 0;
        if (element.ValueKind == JsonValueKind.Object)
        {
            if (string.Equals(OptionalString(element, "type"), effectType, StringComparison.OrdinalIgnoreCase))
                maximum = OptionalInt(element, "amount");
            foreach (var property in element.EnumerateObject())
                maximum = Math.Max(maximum, FindMaximumEffectAmount(property.Value, effectType));
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in element.EnumerateArray())
                maximum = Math.Max(maximum, FindMaximumEffectAmount(child, effectType));
        }
        return maximum;
    }

    private static void ValidateTargetProperty(JsonElement element, string propertyName, string file, string path, string id)
    {
        if (element.ValueKind != JsonValueKind.Object)
            Fail(file, path, id, $"target contract must be an object, but received {element.ValueKind}");
        if (!element.TryGetProperty(propertyName, out var value) || value.ValueKind != JsonValueKind.String) return;
        if (!KnownTargets.Contains(value.GetString()!))
            Fail(file, path + "." + propertyName, id, $"unknown target value '{value.GetString()}'");
    }

    private static void ValidateEventTargetSelection(
        JsonElement item,
        string resolutionMode,
        string file,
        string path,
        string id)
    {
        var required = resolutionMode is "automatic_secret_grant" or "secret_player_choice" or
            "split_private_information" || HasSelectorDependentTarget(item);
        if (!item.TryGetProperty("targetSelection", out var selector))
        {
            if (required) Fail(file, path + ".targetSelection", id, "targeted event requires a target selector");
            return;
        }
        if (selector.ValueKind == JsonValueKind.Null)
        {
            if (required) Fail(file, path + ".targetSelection", id, "targeted event cannot have a null target selector");
            return;
        }
        if (selector.ValueKind != JsonValueKind.Object)
            Fail(file, path + ".targetSelection", id,
                $"target selector must be an object or null, but received {selector.ValueKind}");

        var mode = RequiredString(selector, "mode", file, path + ".targetSelection", id);
        if (!KnownTargets.Contains(mode))
            Fail(file, path + ".targetSelection.mode", id, $"unknown target value '{mode}'");
        ValidateOptionalBoolean(selector, "excludeHostRoleOnlySpectators", file, path + ".targetSelection", id);
        ValidateOptionalBoolean(selector, "excludePlayersAtMaximumPhysicalSeverity", file, path + ".targetSelection", id);
        if (selector.TryGetProperty("prefer", out var prefer) &&
            prefer.ValueKind is not (JsonValueKind.Object or JsonValueKind.Null))
            Fail(file, path + ".targetSelection.prefer", id,
                $"prefer must be an object or null, but received {prefer.ValueKind}");
    }

    private static bool HasSelectorDependentTarget(JsonElement element)
    {
        if (element.ValueKind == JsonValueKind.Object)
        {
            foreach (var property in element.EnumerateObject())
            {
                if (property.Name is "target" or "targets" or "targetMode" &&
                    property.Value.ValueKind == JsonValueKind.String &&
                    property.Value.GetString() is "selected" or "selected_1" or "selected_2" or
                        "selected_player" or "selected_players" or "owner_selected_player")
                    return true;
                if (HasSelectorDependentTarget(property.Value)) return true;
            }
        }
        else if (element.ValueKind == JsonValueKind.Array)
        {
            foreach (var child in element.EnumerateArray())
                if (HasSelectorDependentTarget(child)) return true;
        }
        return false;
    }

    private static void ValidateOptionalBoolean(
        JsonElement element,
        string property,
        string file,
        string path,
        string id)
    {
        if (element.TryGetProperty(property, out var value) &&
            value.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            Fail(file, path + "." + property, id, $"{property} must be a boolean");
    }

    private static void ValidateLocalized(JsonElement element, string propertyName, string file, string path, string id)
    {
        if (!element.TryGetProperty(propertyName, out var localized) || localized.ValueKind != JsonValueKind.Object)
            Fail(file, path + "." + propertyName, id, $"{propertyName} must contain UK/EN/RU text");
        ValidateLocalizedObject(localized, file, path + "." + propertyName, id);
    }

    private static void ValidateLocalizedObject(JsonElement localized, string file, string path, string id)
    {
        foreach (var language in new[] { "uk", "en", "ru" })
        {
            if (!localized.TryGetProperty(language, out var value) ||
                value.ValueKind != JsonValueKind.String ||
                string.IsNullOrWhiteSpace(value.GetString()))
                Fail(file, path + "." + language, id, $"missing {language.ToUpperInvariant()} localization");
        }
    }

    private static IReadOnlyDictionary<string, string> ReadLocalized(JsonElement value) =>
        value.EnumerateObject().ToDictionary(property => property.Name, property => property.Value.GetString() ?? "",
            StringComparer.OrdinalIgnoreCase);

    private static string RequiredString(JsonElement element, string property, string file, string path, string id)
    {
        var value = OptionalString(element, property);
        if (string.IsNullOrWhiteSpace(value)) Fail(file, path + "." + property, id, $"{property} is required");
        return value;
    }

    private static string OptionalString(JsonElement element, string property) =>
        element.ValueKind == JsonValueKind.Object &&
        element.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.String
            ? value.GetString() ?? ""
            : "";

    private static int OptionalInt(JsonElement element, string property, int fallback = 0) =>
        element.ValueKind == JsonValueKind.Object &&
        element.TryGetProperty(property, out var value) &&
        value.ValueKind == JsonValueKind.Number &&
        value.TryGetInt32(out var result)
            ? result
            : fallback;

    private static bool OptionalBool(JsonElement element, string property, bool fallback) =>
        element.ValueKind == JsonValueKind.Object &&
        element.TryGetProperty(property, out var value) &&
        value.ValueKind is JsonValueKind.True or JsonValueKind.False
            ? value.GetBoolean()
            : fallback;

    private static void Fail(string file, string path, string id, string reason) =>
        throw new InvalidOperationException(
            $"Scenario content validation failed: file={file}, path={path}, id={id}, reason={reason}");
}
