using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Bunker.Data.ContentPersistence;
using Bunker.Data.ContentPersistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bunker.Services.ContentMigration;

public sealed record ContentImportRequest(string ContentRootPath, bool DryRun);
public sealed record ContentImportIssue(string Severity, string SourcePath, string StableId, string Message);
public sealed record ContentImportResult(
    bool DryRun,
    int DocumentCount,
    int ItemCount,
    int LocalizationCount,
    int TagCount,
    int RelationshipCount,
    IReadOnlyList<ContentImportIssue> Issues);

public sealed class ContentImportValidationException(IReadOnlyList<ContentImportIssue> issues)
    : Exception($"Content import validation failed with {issues.Count} error(s).")
{
    public IReadOnlyList<ContentImportIssue> Issues { get; } = issues;
}

public sealed class ContentJsonImporter(ContentDbContext dbContext, TimeProvider timeProvider)
{
    private static readonly string[] Languages = ["uk", "en", "ru"];
    private static readonly JsonDocumentOptions JsonOptions = new()
    {
        AllowTrailingCommas = false,
        CommentHandling = JsonCommentHandling.Disallow,
        MaxDepth = 128
    };

    // These are the active runtime collections loaded by GameDataService and ScenarioContentRegistry.
    private static readonly SourceSpec[] SourceSpecs =
    [
        new("hobbies", "hobbies.json", "hobbies"),
        new("professions", "professions.json", "professions"),
        new("mental_conditions", "Mental_conditions/mental_conditions.uk.json", null),
        new("mental_conditions", "Mental_conditions/mental_conditions.ru..json", null),
        new("physical_conditions", "Physical_conditions/physical_conditions.uk.json", null),
        new("physical_conditions", "Physical_conditions/physical_conditions.en..json", null),
        new("physical_conditions", "Physical_conditions/physical_conditions.ru..json", null),
        new("items", "items.json", "items"),
        new("character_traits", "character_traits.json", "character_traits"),
        new("phobias", "phobias.json", "phobias"),
        new("facts", "facts.json", "facts"),
        new("apocalypses", "Apocalypses/apocalypses.json", "apocalypses"),
        new("apocalypse_categories", "Apocalypses/apocalypses.json", "_apocalypseCategoryCatalog"),
        new("apocalypse_visual_themes", "Apocalypses/apocalypses.json", "_visualThemeProfiles"),
        new("bunkers", "bunkers.json", "bunkers"),
        new("threats", "threats.json", "threats"),
        new("special_cards", "special_cards.json", "special_cards"),
        new("properties", "property.json", "property"),
        new("scenario_events", "scenario/scenario_events.json", "events"),
        new("event_special_cards", "scenario/event_special_cards.json", "cards"),
        new("spy_locations", "Spy_Locations/spy_locations.json", null),
        new("apocalypse_category_index", "Apocalypses/apocalypse-category-index.json", "categories"),
        new("apocalypse_visual_classification", "visual-themes/apocalypse-realistic-visual-classification.json", "apocalypses"),
        new("bunker_visual_classification", "visual-themes/bunker-visual-classification.json", "bunkers")
    ];

    private static readonly IReadOnlyDictionary<string, RelationSpec> RelationSpecs =
        new Dictionary<string, RelationSpec>(StringComparer.Ordinal)
        {
            ["categoryId"] = new("category", "Apocalypses/apocalypses.json"),
            ["visualThemeId"] = new("visual_theme", "Apocalypses/apocalypses.json"),
            ["relatedApocalypseIds"] = new("related_apocalypse", "Apocalypses/apocalypses.json"),
            ["relatedBunkerIds"] = new("related_bunker", "bunkers.json"),
            ["grantCardId"] = new("grant_event_card", "scenario/event_special_cards.json"),
            ["excludeWhenExistingOwnedCard"] = new("requires_missing_event_card", "scenario/event_special_cards.json")
        };

    public async Task<ContentImportResult> ImportAsync(ContentImportRequest request, CancellationToken cancellationToken = default)
    {
        var root = Path.GetFullPath(request.ContentRootPath);
        if (!Directory.Exists(root))
            throw new ContentImportValidationException([new("error", root, "<root>", "Content root does not exist.")]);

        var issues = new List<ContentImportIssue>();
        var documents = ReadDocuments(root, issues);
        var imports = BuildItems(documents, issues);
        if (issues.Any(issue => issue.Severity == "error"))
            throw new ContentImportValidationException(issues);

        await using var transaction = await dbContext.Database.BeginTransactionAsync(cancellationToken);
        await ReplaceImportAsync(documents, imports, issues, cancellationToken);
        var result = new ContentImportResult(
            request.DryRun,
            documents.Count,
            imports.Count,
            imports.Sum(item => item.Localizations.Count),
            imports.Sum(item => item.Tags.Count),
            imports.Sum(item => item.Relationships.Count),
            issues);

        if (request.DryRun)
            await transaction.RollbackAsync(cancellationToken);
        else
            await transaction.CommitAsync(cancellationToken);

        return result;
    }

    private static Dictionary<string, SourceDocument> ReadDocuments(string root, List<ContentImportIssue> issues)
    {
        var result = new Dictionary<string, SourceDocument>(StringComparer.Ordinal);
        foreach (var path in Directory.EnumerateFiles(root, "*.json", SearchOption.AllDirectories).OrderBy(x => x, StringComparer.Ordinal))
        {
            var relative = NormalizeRelative(root, path);
            try
            {
                var json = new UTF8Encoding(false, true).GetString(File.ReadAllBytes(path));
                using var document = JsonDocument.Parse(json, JsonOptions);
                result.Add(relative, new(relative, json, document.RootElement.Clone()));
            }
            catch (Exception exception) when (exception is IOException or DecoderFallbackException or JsonException)
            {
                issues.Add(new("error", relative, "<root>", $"Invalid JSON document: {exception.Message}"));
            }
        }
        return result;
    }

    private static List<ImportedItem> BuildItems(
        IReadOnlyDictionary<string, SourceDocument> documents,
        List<ContentImportIssue> issues)
    {
        var result = new List<ImportedItem>();
        foreach (var spec in SourceSpecs)
        {
            if (!documents.TryGetValue(spec.SourcePath, out var document))
            {
                issues.Add(new("error", spec.SourcePath, "<root>", "Required active content file is missing."));
                continue;
            }

            var entries = GetEntries(document.Root, spec, issues);
            var seenIds = new HashSet<string>(StringComparer.Ordinal);
            for (var index = 0; index < entries.Count; index++)
            {
                var entry = entries[index];
                if (entry.ValueKind != JsonValueKind.Object)
                {
                    issues.Add(new("error", spec.SourcePath, $"index:{index}", "Content entry must be an object."));
                    continue;
                }
                if (!entry.TryGetProperty("id", out var idElement) || idElement.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(idElement.GetString()))
                {
                    issues.Add(new("error", spec.SourcePath, $"index:{index}", "Stable string id is required."));
                    continue;
                }
                var id = idElement.GetString()!;
                if (!seenIds.Add(id))
                {
                    issues.Add(new("error", spec.SourcePath, id, "Duplicate stable id."));
                    continue;
                }

                var localizations = ExtractLocalizations(entry);
                var tags = ExtractTags(entry, spec.SourcePath, id, issues);
                result.Add(new ImportedItem(
                    spec.CategoryKey,
                    spec.SourcePath,
                    id,
                    DisplayName(entry, id),
                    index,
                    entry.GetRawText(),
                    localizations,
                    tags,
                    ExtractRelationships(entry, spec.SourcePath, id)));
            }
        }

        var merged = result
            .GroupBy(item => (item.CategoryKey, item.StableId))
            .Select(group => MergeItems(group.Key.CategoryKey, group.Key.StableId, group.ToArray(), issues))
            .ToList();
        var importedKeys = merged.Select(item => (item.SourcePath, item.StableId)).ToHashSet();
        foreach (var item in merged)
        {
            foreach (var relationship in item.Relationships)
            {
                if (!importedKeys.Contains((relationship.TargetSourcePath, relationship.TargetStableId)))
                    issues.Add(new("error", item.SourcePath, item.StableId,
                        $"Relationship '{relationship.Kind}' references missing target '{relationship.TargetStableId}' in '{relationship.TargetSourcePath}'."));
            }
        }
        return merged;
    }

    private async Task ReplaceImportAsync(
        IReadOnlyDictionary<string, SourceDocument> documents,
        IReadOnlyList<ImportedItem> imports,
        List<ContentImportIssue> issues,
        CancellationToken cancellationToken)
    {
        dbContext.ChangeTracker.Clear();
        await dbContext.Relationships.ExecuteDeleteAsync(cancellationToken);
        await dbContext.Tags.ExecuteDeleteAsync(cancellationToken);
        await dbContext.Localizations.ExecuteDeleteAsync(cancellationToken);
        await dbContext.Items.ExecuteDeleteAsync(cancellationToken);
        await dbContext.Documents.ExecuteDeleteAsync(cancellationToken);
        await dbContext.Categories.ExecuteDeleteAsync(cancellationToken);

        var categories = SourceSpecs.Select(spec => spec.CategoryKey).Distinct(StringComparer.Ordinal)
            .Select(key => new ContentCategoryEntity { Key = key, SourceDescription = "JSON phase-1 source category" });
        dbContext.Categories.AddRange(categories);
        dbContext.Documents.AddRange(documents.Values.Select(document => new ContentDocumentEntity
        {
            SourcePath = document.SourcePath,
            Fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(document.RawJson))).ToLowerInvariant(),
            RawJson = document.RawJson,
            ImportedAtUtc = timeProvider.GetUtcNow().UtcDateTime
        }));
        dbContext.Items.AddRange(imports.Select(item => new ContentItemEntity
        {
            SourcePath = item.SourcePath,
            StableId = item.StableId,
            CategoryKey = item.CategoryKey,
            DisplayName = item.DisplayName,
            SortOrder = item.SortOrder,
            PayloadJson = item.PayloadJson
        }));
        dbContext.Localizations.AddRange(imports.SelectMany(item => item.Localizations.Select(localization => new ContentLocalizationEntity
        {
            SourcePath = item.SourcePath,
            StableId = item.StableId,
            Language = localization.Language,
            PayloadJson = localization.PayloadJson
        })));
        dbContext.Tags.AddRange(imports.SelectMany(item => item.Tags.Select(tag => new ContentTagEntity
        {
            SourcePath = item.SourcePath,
            StableId = item.StableId,
            Tag = tag
        })));
        dbContext.Relationships.AddRange(imports.SelectMany(item => item.Relationships.Select(relationship => new ContentRelationshipEntity
        {
            SourcePath = item.SourcePath,
            StableId = item.StableId,
            Kind = relationship.Kind,
            Ordinal = relationship.Ordinal,
            TargetSourcePath = relationship.TargetSourcePath,
            TargetStableId = relationship.TargetStableId
        })));
        dbContext.ImportRuns.Add(new ContentImportRunEntity
        {
            Id = Guid.NewGuid(),
            StartedAtUtc = timeProvider.GetUtcNow().UtcDateTime,
            FinishedAtUtc = timeProvider.GetUtcNow().UtcDateTime,
            DocumentCount = documents.Count,
            ItemCount = imports.Count,
            MissingTranslationCount = issues.Count(issue => issue.Severity == "warning" && issue.Message.StartsWith("Missing translation", StringComparison.Ordinal)),
            SummaryJson = JsonSerializer.Serialize(new { documents = documents.Count, items = imports.Count })
        });
        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static List<JsonElement> GetEntries(JsonElement root, SourceSpec spec, List<ContentImportIssue> issues)
    {
        if (spec.RootProperty == null)
        {
            if (root.ValueKind != JsonValueKind.Array)
                issues.Add(new("error", spec.SourcePath, "<root>", "Expected root array."));
            return root.ValueKind == JsonValueKind.Array ? root.EnumerateArray().Select(x => x.Clone()).ToList() : [];
        }
        if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty(spec.RootProperty, out var entries) || entries.ValueKind != JsonValueKind.Array)
        {
            issues.Add(new("error", spec.SourcePath, "<root>", $"Expected '{spec.RootProperty}' array."));
            return [];
        }
        return entries.EnumerateArray().Select(x => x.Clone()).ToList();
    }

    private static List<LocalizedPayload> ExtractLocalizations(JsonElement entry)
    {
        var result = new List<LocalizedPayload>();
        foreach (var language in Languages)
        {
            var projection = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var property in entry.EnumerateObject())
            {
                if (property.Value.ValueKind == JsonValueKind.Object && property.Value.TryGetProperty(language, out var direct))
                    projection[property.Name] = direct.Clone();
                else if (property.Name is "_i18n" or "localization" && property.Value.ValueKind == JsonValueKind.Object)
                {
                    var fields = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
                    foreach (var field in property.Value.EnumerateObject())
                        if (field.Value.ValueKind == JsonValueKind.Object && field.Value.TryGetProperty(language, out var translated)) fields[field.Name] = translated.Clone();
                    if (fields.Count > 0) projection[property.Name] = JsonSerializer.SerializeToElement(fields);
                }
            }
            if (projection.Count > 0)
                result.Add(new(language, JsonSerializer.Serialize(projection)));
        }
        return result;
    }

    private static bool IsLocalizedObject(JsonElement value) => value.ValueKind == JsonValueKind.Object && Languages.Any(language => value.TryGetProperty(language, out _));

    private static IReadOnlyList<string> ExtractTags(JsonElement entry, string sourcePath, string id, List<ContentImportIssue> issues)
    {
        var tags = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var property in entry.EnumerateObject())
        {
            if (!(property.Name.Equals("tags", StringComparison.OrdinalIgnoreCase) || property.Name.EndsWith("Tags", StringComparison.Ordinal))) continue;
            if (property.Value.ValueKind != JsonValueKind.Array)
            {
                issues.Add(new("error", sourcePath, id, $"Tag field '{property.Name}' must be an array."));
                continue;
            }
            foreach (var tag in property.Value.EnumerateArray())
            {
                if (tag.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(tag.GetString()))
                    issues.Add(new("error", sourcePath, id, $"Tag field '{property.Name}' contains an invalid value."));
                else tags.Add(tag.GetString()!.Trim());
            }
        }
        return tags.OrderBy(x => x, StringComparer.OrdinalIgnoreCase).ToArray();
    }

    private static IReadOnlyList<RelationshipPayload> ExtractRelationships(JsonElement entry, string sourcePath, string id)
    {
        var result = new List<RelationshipPayload>();
        var ordinals = new Dictionary<string, int>(StringComparer.Ordinal);

        void Visit(JsonElement value)
        {
            if (value.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in value.EnumerateArray()) Visit(item);
                return;
            }
            if (value.ValueKind != JsonValueKind.Object) return;
            foreach (var property in value.EnumerateObject())
            {
                if (RelationSpecs.TryGetValue(property.Name, out var spec) &&
                    (!(property.Name is "categoryId" or "visualThemeId") || string.Equals(sourcePath, "Apocalypses/apocalypses.json", StringComparison.Ordinal)))
                {
                    var targets = property.Value.ValueKind == JsonValueKind.String
                        ? [property.Value.GetString()!]
                        : property.Value.ValueKind == JsonValueKind.Array
                            ? property.Value.EnumerateArray().Where(x => x.ValueKind == JsonValueKind.String).Select(x => x.GetString()!).ToArray()
                            : [];
                    foreach (var target in targets)
                    {
                        var ordinal = ordinals.GetValueOrDefault(spec.Kind);
                        ordinals[spec.Kind] = ordinal + 1;
                        result.Add(new(spec.Kind, ordinal, spec.TargetSourcePath, target));
                    }
                }
                Visit(property.Value);
            }
        }

        Visit(entry);
        return result;
    }

    private static string DisplayName(JsonElement entry, string fallback)
    {
        foreach (var field in new[] { "name", "profession", "hobby", "trait", "item", "fact" })
            if (entry.TryGetProperty(field, out var value) && value.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(value.GetString())) return value.GetString()!;
        if (entry.TryGetProperty("title", out var title) && title.ValueKind == JsonValueKind.Object && title.TryGetProperty("uk", out var ukrainian) && ukrainian.ValueKind == JsonValueKind.String) return ukrainian.GetString() ?? fallback;
        return fallback;
    }

    private static string NormalizeRelative(string root, string path) => Path.GetRelativePath(root, path).Replace(Path.DirectorySeparatorChar, '/');

    private static ImportedItem MergeItems(string categoryKey, string stableId, IReadOnlyList<ImportedItem> entries, List<ContentImportIssue> issues)
    {
        var canonical = entries.OrderBy(entry => entry.SourcePath.Contains(".uk", StringComparison.OrdinalIgnoreCase) ? 0 : 1)
            .ThenBy(entry => entry.SourcePath, StringComparer.Ordinal).First();
        var localizations = entries.SelectMany(entry => entry.Localizations)
            .GroupBy(localization => localization.Language, StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .OrderBy(localization => localization.Language, StringComparer.Ordinal)
            .ToArray();
        if (localizations.Length > 0)
            foreach (var language in Languages.Where(language => localizations.All(localization => !string.Equals(localization.Language, language, StringComparison.OrdinalIgnoreCase))))
                issues.Add(new("warning", canonical.SourcePath, stableId, $"Missing translation for '{language}'."));
        return canonical with
        {
            Localizations = localizations,
            Tags = entries.SelectMany(entry => entry.Tags).Distinct(StringComparer.OrdinalIgnoreCase).OrderBy(tag => tag, StringComparer.OrdinalIgnoreCase).ToArray(),
            Relationships = entries.SelectMany(entry => entry.Relationships).ToArray()
        };
    }
    private sealed record SourceSpec(string CategoryKey, string SourcePath, string? RootProperty);
    private sealed record RelationSpec(string Kind, string TargetSourcePath);
    private sealed record SourceDocument(string SourcePath, string RawJson, JsonElement Root);
    private sealed record LocalizedPayload(string Language, string PayloadJson);
    private sealed record RelationshipPayload(string Kind, int Ordinal, string TargetSourcePath, string TargetStableId);
    private sealed record ImportedItem(string CategoryKey, string SourcePath, string StableId, string DisplayName, int SortOrder, string PayloadJson, IReadOnlyList<LocalizedPayload> Localizations, IReadOnlyList<string> Tags, IReadOnlyList<RelationshipPayload> Relationships);
}
