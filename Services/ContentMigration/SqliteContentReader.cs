using System.Text.Json;
using System.Text.Json.Nodes;
using Bunker.Data.ContentPersistence;
using Bunker.Data.ContentPersistence.Entities;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;
using Microsoft.EntityFrameworkCore;

namespace Bunker.Services.ContentMigration;

/// <summary>
/// Read-only projection of the Phase 1 content database. It is deliberately not registered
/// with the application, so GameDataService and ScenarioContentRegistry remain JSON-backed.
/// </summary>
public sealed class SqliteContentReader(ContentDbContext dbContext)
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public async Task<SqliteContentSnapshot> ReadAsync(CancellationToken cancellationToken = default)
    {
        var items = await dbContext.Items
            .AsNoTracking()
            .Include(item => item.Localizations)
            .OrderBy(item => item.CategoryKey)
            .ThenBy(item => item.SortOrder)
            .ToListAsync(cancellationToken);
        var documents = await dbContext.Documents.AsNoTracking()
            .ToDictionaryAsync(document => document.SourcePath, StringComparer.Ordinal, cancellationToken);

        var propertyRoot = DeserializeDocument<PropertyDataRoot>(documents, "property.json");
        var apocalypseRoot = DeserializeDocument<ApocalypsesRoot>(documents, "Apocalypses/apocalypses.json");
        using var cardsDocument = JsonDocument.Parse(GetDocument(documents, "scenario/event_special_cards.json"));
        using var eventsDocument = JsonDocument.Parse(GetDocument(documents, "scenario/scenario_events.json"));
        var scenarios = ScenarioContentRegistry.ReadSnapshot(cardsDocument.RootElement, eventsDocument.RootElement);

        return new SqliteContentSnapshot(
            ReadCategory<HobbyData>(items, "hobbies"),
            ReadCategory<ProfessionData>(items, "professions"),
            ReadCategory<MentalConditionData>(items, "mental_conditions"),
            ReadCategory<PhysicalConditionData>(items, "physical_conditions"),
            ReadCategory<ItemData>(items, "items"),
            ReadCategory<CharacterTraitData>(items, "character_traits"),
            ReadCategory<PhobiaData>(items, "phobias"),
            ReadCategory<FactData>(items, "facts"),
            ReadCategory<Apocalypse>(items, "apocalypses"),
            ReadCategory<ApocalypseCategoryDefinition>(items, "apocalypse_categories"),
            ReadCategory<ApocalypseVisualThemeDefinition>(items, "apocalypse_visual_themes"),
            ReadCategory<BunkerInfo>(items, "bunkers"),
            ReadCategory<ThreatData>(items, "threats"),
            ReadCategory<SpecialCardData>(items, "special_cards"),
            propertyRoot.Properties.AsReadOnly(),
            new Dictionary<string, PropertyConditionProfile>(propertyRoot.ConditionProfiles, StringComparer.OrdinalIgnoreCase),
            apocalypseRoot.InteractiveEffectSchema,
            scenarios.Events,
            scenarios.Cards,
            BuildLocalizationIndex(items));
    }

    private static IReadOnlyList<T> ReadCategory<T>(IReadOnlyList<ContentItemEntity> items, string category) =>
        items.Where(item => item.CategoryKey == category)
            .Select(item => DeserializeItem<T>(item))
            .ToArray();

    private static T DeserializeItem<T>(ContentItemEntity item)
    {
        var root = JsonNode.Parse(item.PayloadJson)?.AsObject()
            ?? throw new InvalidDataException($"Content item '{item.CategoryKey}/{item.StableId}' has no object payload.");
        foreach (var localization in item.Localizations)
            MergeLocalizationProjection(root, localization);
        return root.Deserialize<T>(JsonOptions)
            ?? throw new InvalidDataException($"Content item '{item.CategoryKey}/{item.StableId}' cannot be deserialized as {typeof(T).Name}.");
    }

    private static void MergeLocalizationProjection(JsonObject target, ContentLocalizationEntity localization)
    {
        var projection = JsonNode.Parse(localization.PayloadJson)?.AsObject();
        if (projection == null) return;
        foreach (var (propertyName, propertyValue) in projection)
        {
            // Conditions store localization as language -> ConditionLocalization, whereas
            // _i18n-style payloads store field -> language -> value.
            if (propertyName == "localization")
            {
                var conditionLocalizations = target[propertyName] as JsonObject ?? new JsonObject();
                conditionLocalizations[localization.Language] = propertyValue?.DeepClone();
                target[propertyName] = conditionLocalizations;
                continue;
            }
            if (propertyValue is not JsonObject fields) continue;
            var targetFields = target[propertyName] as JsonObject ?? new JsonObject();
            target[propertyName] = targetFields;
            foreach (var (fieldName, fieldValue) in fields)
            {
                var translations = targetFields[fieldName] as JsonObject ?? new JsonObject();
                translations[localization.Language] = fieldValue?.DeepClone();
                targetFields[fieldName] = translations;
            }
        }
    }

    private static IReadOnlyDictionary<(string Category, string StableId), IReadOnlyList<ContentLocalizationEntity>> BuildLocalizationIndex(
        IEnumerable<ContentItemEntity> items) =>
        items.ToDictionary(
            item => (item.CategoryKey, item.StableId),
            item => (IReadOnlyList<ContentLocalizationEntity>)item.Localizations.ToArray());

    private static T DeserializeDocument<T>(IReadOnlyDictionary<string, ContentDocumentEntity> documents, string sourcePath) =>
        JsonSerializer.Deserialize<T>(GetDocument(documents, sourcePath), JsonOptions)
        ?? throw new InvalidDataException($"Content document '{sourcePath}' cannot be deserialized as {typeof(T).Name}.");

    private static string GetDocument(IReadOnlyDictionary<string, ContentDocumentEntity> documents, string sourcePath) =>
        documents.TryGetValue(sourcePath, out var document)
            ? document.RawJson
            : throw new InvalidDataException($"Content document '{sourcePath}' is missing.");
}

public sealed class SqliteContentSnapshot(
    IReadOnlyList<HobbyData> hobbies,
    IReadOnlyList<ProfessionData> professions,
    IReadOnlyList<MentalConditionData> mentalConditions,
    IReadOnlyList<PhysicalConditionData> physicalConditions,
    IReadOnlyList<ItemData> items,
    IReadOnlyList<CharacterTraitData> characterTraits,
    IReadOnlyList<PhobiaData> phobias,
    IReadOnlyList<FactData> facts,
    IReadOnlyList<Apocalypse> apocalypses,
    IReadOnlyList<ApocalypseCategoryDefinition> apocalypseCategories,
    IReadOnlyList<ApocalypseVisualThemeDefinition> apocalypseVisualThemes,
    IReadOnlyList<BunkerInfo> bunkers,
    IReadOnlyList<ThreatData> threats,
    IReadOnlyList<SpecialCardData> specialCards,
    IReadOnlyList<PropertyDefinition> properties,
    IReadOnlyDictionary<string, PropertyConditionProfile> propertyConditionProfiles,
    ApocalypseInteractiveSchemaDefinition? apocalypseInteractiveSchema,
    IReadOnlyList<ScenarioDefinition> scenarioEvents,
    IReadOnlyList<EventSpecialCardDefinition> eventSpecialCards,
    IReadOnlyDictionary<(string Category, string StableId), IReadOnlyList<ContentLocalizationEntity>> localizations)
{
    public IReadOnlyList<HobbyData> Hobbies { get; } = hobbies;
    public IReadOnlyList<ProfessionData> Professions { get; } = professions;
    public IReadOnlyList<MentalConditionData> MentalConditions { get; } = mentalConditions;
    public IReadOnlyList<PhysicalConditionData> PhysicalConditions { get; } = physicalConditions;
    public IReadOnlyList<ItemData> Items { get; } = items;
    public IReadOnlyList<CharacterTraitData> CharacterTraits { get; } = characterTraits;
    public IReadOnlyList<PhobiaData> Phobias { get; } = phobias;
    public IReadOnlyList<FactData> Facts { get; } = facts;
    public IReadOnlyList<Apocalypse> Apocalypses { get; } = apocalypses;
    public IReadOnlyList<ApocalypseCategoryDefinition> ApocalypseCategories { get; } = apocalypseCategories;
    public IReadOnlyList<ApocalypseVisualThemeDefinition> ApocalypseVisualThemes { get; } = apocalypseVisualThemes;
    public IReadOnlyList<BunkerInfo> Bunkers { get; } = bunkers;
    public IReadOnlyList<ThreatData> Threats { get; } = threats;
    public IReadOnlyList<SpecialCardData> SpecialCards { get; } = specialCards;
    public IReadOnlyList<PropertyDefinition> Properties { get; } = properties;
    public IReadOnlyDictionary<string, PropertyConditionProfile> PropertyConditionProfiles { get; } = propertyConditionProfiles;
    public ApocalypseInteractiveSchemaDefinition? ApocalypseInteractiveSchema { get; } = apocalypseInteractiveSchema;
    public IReadOnlyList<ScenarioDefinition> ScenarioEvents { get; } = scenarioEvents;
    public IReadOnlyList<EventSpecialCardDefinition> EventSpecialCards { get; } = eventSpecialCards;

    public string? ResolveLocalizationPayload(string category, string stableId, string? requestedLanguage) =>
        localizations.TryGetValue((category, stableId), out var entries)
            ? ContentLocalizationFallback.ResolvePayload(entries, requestedLanguage)
            : null;
}
