using System.Collections.Concurrent;
using System.Collections.ObjectModel;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Bunker.Models;

namespace Bunker.Services;

public sealed class GlobalContentCatalogService
{
    public const int MaximumFileBytes = 5 * 1024 * 1024;
    public const int MaximumSearchLength = 100;
    public const int MaximumPageSize = 100;
    private const int ReadsPerMinute = 30;

    private sealed record CategoryDefinition(string Slug, string RelativeFile, string? RootProperty);
    private static readonly ReadOnlyDictionary<GlobalContentCategory, CategoryDefinition> Definitions =
        new(new Dictionary<GlobalContentCategory, CategoryDefinition>
        {
            [GlobalContentCategory.Professions] = new("professions", "professions.json", "professions"),
            [GlobalContentCategory.Hobbies] = new("hobbies", "hobbies.json", "hobbies"),
            [GlobalContentCategory.MentalConditions] = new("mental_conditions", "Mental_conditions/mental_conditions.uk.json", null),
            [GlobalContentCategory.PhysicalHealth] = new("physical_health", "Physical_conditions/physical_conditions.uk.json", null),
            [GlobalContentCategory.Phobias] = new("phobias", "phobias.json", "phobias"),
            [GlobalContentCategory.CharacterTraits] = new("character_traits", "character_traits.json", "character_traits"),
            [GlobalContentCategory.Facts] = new("facts", "facts.json", "facts"),
            [GlobalContentCategory.SpecialCards] = new("special_cards", "special_cards.json", "special_cards"),
            [GlobalContentCategory.Apocalypses] = new("apocalypses", "apocalypses.json", "apocalypses"),
            [GlobalContentCategory.Bunkers] = new("bunkers", "bunkers.json", "bunkers"),
            [GlobalContentCategory.Items] = new("items", "items.json", "items"),
            [GlobalContentCategory.Threats] = new("threats", "threats.json", "threats")
        });

    private readonly string _root;
    private readonly TimeProvider _timeProvider;
    private readonly ILogger<GlobalContentCatalogService> _logger;
    private readonly ConcurrentDictionary<string, Queue<DateTimeOffset>> _reads = new(StringComparer.Ordinal);

    public GlobalContentCatalogService(IWebHostEnvironment environment, TimeProvider timeProvider, ILogger<GlobalContentCatalogService> logger)
        : this(Path.Combine(environment.WebRootPath, "data"), timeProvider, logger) { }

    public GlobalContentCatalogService(string root, TimeProvider? timeProvider = null, ILogger<GlobalContentCatalogService>? logger = null)
    {
        _root = Path.GetFullPath(root);
        _timeProvider = timeProvider ?? TimeProvider.System;
        _logger = logger ?? Microsoft.Extensions.Logging.Abstractions.NullLogger<GlobalContentCatalogService>.Instance;
    }

    public IReadOnlyList<string> GetCategories() => Definitions.Values.Select(x => x.Slug).ToList();

    public bool TryConsumeRead(string clientKey)
    {
        if (string.IsNullOrWhiteSpace(clientKey)) return false;
        var queue = _reads.GetOrAdd(clientKey, _ => new Queue<DateTimeOffset>());
        lock (queue)
        {
            var cutoff = _timeProvider.GetUtcNow().AddMinutes(-1);
            while (queue.Count > 0 && queue.Peek() <= cutoff) queue.Dequeue();
            if (queue.Count >= ReadsPerMinute) return false;
            queue.Enqueue(_timeProvider.GetUtcNow());
            return true;
        }
    }

    public GlobalContentMetadataDto GetMetadata(string category) => Read(category).Metadata;

    public GlobalContentPageDto GetEntries(string category, int page, int pageSize, string? search)
    {
        if (page < 1) throw new GlobalContentRequestException("invalid_page");
        if (pageSize is < 1 or > MaximumPageSize) throw new GlobalContentRequestException("invalid_page_size");
        search = (search ?? string.Empty).Trim();
        if (search.Length > MaximumSearchLength) throw new GlobalContentRequestException("search_too_long");

        var read = Read(category);
        var matching = read.Entries.Where(x => Matches(x, search)).ToList();
        var entries = matching.Skip((page - 1) * pageSize).Take(pageSize)
            .Select(ToSummary).ToList();
        return new(read.Metadata, page, pageSize, matching.Count, entries);
    }

    public GlobalContentEntryDto GetEntry(string category, string stableId)
    {
        if (string.IsNullOrWhiteSpace(stableId) || stableId.Length > 100)
            throw new GlobalContentRequestException("invalid_stable_id");
        var read = Read(category);
        var entry = read.Entries.FirstOrDefault(x => string.Equals(GetString(x, "id"), stableId, StringComparison.Ordinal));
        if (entry.ValueKind == JsonValueKind.Undefined) throw new GlobalContentRequestException("entry_not_found");
        return new(read.Definition.Slug, stableId, DisplayName(entry), SafeFields(entry));
    }

    public GlobalContentDraftSource ReadDraftSource(string category)
    {
        var read = Read(category);
        if (read.Metadata.SchemaStatus is not ("Valid") && !read.Metadata.SchemaStatus.StartsWith("ValidDuplicateNames:", StringComparison.Ordinal))
            throw new GlobalContentRequestException("category_schema_invalid");
        return new(read.Metadata, read.Entries.Select(x => x.GetRawText()).ToList());
    }

    internal string GetCanonicalPath(string category) => ResolvePath(Resolve(category));
    internal byte[] ReadCanonicalBytes(string category) => File.ReadAllBytes(GetCanonicalPath(category));

    internal byte[] BuildCanonicalBytes(string category, IReadOnlyList<string> entries)
    {
        var definition = Resolve(category);
        var current = JsonNode.Parse(File.ReadAllText(ResolvePath(definition))) ?? throw new GlobalContentRequestException("invalid_json");
        var array = new JsonArray(entries.Select(x => JsonNode.Parse(x)).ToArray());
        JsonNode output;
        if (definition.RootProperty == null) output = array;
        else
        {
            var root = current.AsObject(); root[definition.RootProperty] = array; output = root;
        }
        return new UTF8Encoding(false).GetBytes(output.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    internal GlobalContentBinaryValidation ValidateCanonicalBytes(string category, byte[] bytes, bool requireStableIds = true)
    {
        if (bytes.Length > MaximumFileBytes) return new(false, "file_too_large", 0, "");
        try
        {
            var definition = Resolve(category);
            var text = new UTF8Encoding(false, true).GetString(bytes);
            using var document = JsonDocument.Parse(text, new JsonDocumentOptions { MaxDepth = 64 });
            if (!TryGetEntries(document.RootElement, definition.RootProperty, out var source)) return new(false, "unexpected_root", 0, "");
            var entries = source.EnumerateArray().ToList();
            var ids = entries.Select(x => GetString(x, "id")).ToList();
            if (entries.Any(x => x.ValueKind != JsonValueKind.Object)) return new(false, "schema_invalid", entries.Count, "");
            if (requireStableIds && ids.Any(string.IsNullOrWhiteSpace)) return new(false, "schema_invalid", entries.Count, "");
            if (ids.Where(x => !string.IsNullOrWhiteSpace(x)).GroupBy(x => x, StringComparer.Ordinal).Any(x => x.Count() > 1)) return new(false, "duplicate_ids", entries.Count, "");
            return new(true, "valid", entries.Count, Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant());
        }
        catch (DecoderFallbackException) { return new(false, "invalid_utf8", 0, ""); }
        catch (JsonException) { return new(false, "invalid_json", 0, ""); }
    }

    internal IReadOnlyDictionary<string, JsonObject> ExtractCanonicalEntries(string category, byte[] bytes)
    {
        var definition = Resolve(category);
        var root = JsonNode.Parse(bytes) ?? throw new GlobalContentRequestException("invalid_json");
        var array = definition.RootProperty == null ? root.AsArray() : root[definition.RootProperty]?.AsArray() ?? throw new GlobalContentRequestException("unexpected_root");
        var result = new Dictionary<string, JsonObject>(StringComparer.Ordinal); var index = 0;
        foreach (var item in array) { var entry = item!.AsObject(); var key = entry["id"]?.ToString(); key = string.IsNullOrWhiteSpace(key) ? "legacy:" + (entry["hobby"]?.ToString() ?? entry["trait"]?.ToString() ?? index.ToString(System.Globalization.CultureInfo.InvariantCulture)) : key; result[key] = (JsonObject)entry.DeepClone(); index++; }
        return result;
    }

    internal string AuditExternalReferences(string category)
    {
        var indexKeys = category == "hobbies" ? new[] { "hobbyIndex", "hobby_index" } : new[] { "traitIndex", "trait_index" };
        var idKeys = category == "hobbies" ? new[] { "hobbyId", "hobby_id" } : new[] { "traitId", "trait_id" };
        foreach (var definition in Definitions.Values.Where(x => !string.Equals(x.Slug, category, StringComparison.OrdinalIgnoreCase)))
        {
            var path = ResolvePath(definition); if (!File.Exists(path)) continue; var text = File.ReadAllText(path);
            if (indexKeys.Any(key => text.Contains($"\"{key}\"", StringComparison.OrdinalIgnoreCase))) return "blocked_index_references";
            if (idKeys.Any(key => text.Contains($"\"{key}\"", StringComparison.OrdinalIgnoreCase))) return "stable_id_references_present";
        }
        return "name_references_compatible";
    }

    private CatalogRead Read(string category)
    {
        var definition = Resolve(category);
        var path = ResolvePath(definition);
        var info = new FileInfo(path);
        if (!info.Exists) return Invalid(definition, "missing_file", info.Exists ? info.LastWriteTimeUtc : null);
        if (info.Length > MaximumFileBytes) return Invalid(definition, "file_too_large", info.LastWriteTimeUtc);

        byte[] bytes;
        try { bytes = File.ReadAllBytes(path); }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
        {
            _logger.LogWarning("Global content read failed for category {Category}", definition.Slug);
            return Invalid(definition, "read_error", info.LastWriteTimeUtc);
        }

        var fingerprint = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        try
        {
            var utf8 = new UTF8Encoding(false, true).GetString(bytes);
            using var document = JsonDocument.Parse(utf8, new JsonDocumentOptions { MaxDepth = 64 });
            if (!TryGetEntries(document.RootElement, definition.RootProperty, out var source))
                return Invalid(definition, "unexpected_root", info.LastWriteTimeUtc, fingerprint);
            var entries = source.EnumerateArray().Select(x => x.Clone()).ToList();
            var ids = entries.Select(x => GetString(x, "id")).Where(x => !string.IsNullOrWhiteSpace(x)).ToList();
            var missingIds = entries.Count - ids.Count;
            var duplicateIds = ids.GroupBy(x => x, StringComparer.Ordinal).Count(x => x.Count() > 1);
            var obviousTypeErrors = entries.Count(x => x.ValueKind != JsonValueKind.Object);
            var missingNames = entries.Count(x => x.ValueKind == JsonValueKind.Object && string.IsNullOrWhiteSpace(DisplayName(x)));
            var duplicateNames = entries.Where(x => x.ValueKind == JsonValueKind.Object).Select(DisplayName)
                .Where(x => !string.IsNullOrWhiteSpace(x)).GroupBy(x => x, StringComparer.OrdinalIgnoreCase).Count(x => x.Count() > 1);
            var schemaValid = obviousTypeErrors == 0 && missingNames == 0;
            var schemaStatus = obviousTypeErrors > 0 ? $"InvalidTypes:{obviousTypeErrors}" :
                missingNames > 0 ? $"MissingRequiredName:{missingNames}" :
                duplicateNames > 0 ? $"ValidDuplicateNames:{duplicateNames}" : "Valid";
            var stableStatus = missingIds > 0 ? $"Missing:{missingIds}" : duplicateIds > 0 ? $"Duplicates:{duplicateIds}" : "ValidUniqueDeterministic";
            var readiness = !schemaValid ? GlobalContentEditableReadiness.BlockedSchemaUnknown :
                missingIds > 0 || duplicateIds > 0 ? GlobalContentEditableReadiness.BlockedMissingStableIds :
                GlobalContentEditableReadiness.Ready;
            var localization = GetLocalizationStatus(entries);
            var metadata = new GlobalContentMetadataDto(definition.Slug, entries.Count, fingerprint[..12], fingerprint,
                info.LastWriteTimeUtc, schemaStatus, stableStatus, localization, readiness);
            _logger.LogInformation("Global content audit {Category}: {Count} entries, IDs {StableIdStatus}, schema {SchemaStatus}",
                definition.Slug, entries.Count, stableStatus, schemaStatus);
            return new(definition, metadata, entries);
        }
        catch (DecoderFallbackException)
        {
            return Invalid(definition, "invalid_utf8", info.LastWriteTimeUtc, fingerprint);
        }
        catch (JsonException)
        {
            return Invalid(definition, "invalid_json", info.LastWriteTimeUtc, fingerprint);
        }
    }

    private CategoryDefinition Resolve(string category)
    {
        var match = Definitions.Values.FirstOrDefault(x => string.Equals(x.Slug, category, StringComparison.OrdinalIgnoreCase));
        return match ?? throw new GlobalContentRequestException("unsupported_category");
    }

    private string ResolvePath(CategoryDefinition definition)
    {
        var path = Path.GetFullPath(Path.Combine(_root, definition.RelativeFile.Replace('/', Path.DirectorySeparatorChar)));
        var prefix = _root.TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar;
        if (!path.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) throw new GlobalContentRequestException("path_blocked");
        for (var current = new FileInfo(path); current != null && current.FullName.StartsWith(prefix, StringComparison.OrdinalIgnoreCase); current = current.Directory?.Parent == null ? null : new FileInfo(current.Directory.FullName))
            if (current.LinkTarget != null) throw new GlobalContentRequestException("symlink_blocked");
        return path;
    }

    private CatalogRead Invalid(CategoryDefinition definition, string status, DateTime? modified, string fingerprint = "unavailable") =>
        new(definition, new(definition.Slug, 0, fingerprint == "unavailable" ? fingerprint : fingerprint[..12], fingerprint,
            modified, status, "Unknown", "Unknown", GlobalContentEditableReadiness.BlockedSchemaUnknown), []);

    private static bool TryGetEntries(JsonElement root, string? property, out JsonElement entries)
    {
        if (property == null && root.ValueKind == JsonValueKind.Array) { entries = root; return true; }
        if (root.ValueKind == JsonValueKind.Object && property != null && root.TryGetProperty(property, out entries) && entries.ValueKind == JsonValueKind.Array) return true;
        entries = default;
        return false;
    }

    private static bool Matches(JsonElement entry, string search) => string.IsNullOrEmpty(search) ||
        new[] { "id", "name", "profession", "hobby", "trait", "item", "fact", "description" }
            .Select(field => GetString(entry, field)).Any(value => value.Contains(search, StringComparison.OrdinalIgnoreCase));
    private static GlobalContentEntrySummaryDto ToSummary(JsonElement entry) =>
        new(GetString(entry, "id"), DisplayName(entry), FirstNonEmpty(entry, "description", "type", "category"));
    private static string DisplayName(JsonElement entry) => FirstNonEmpty(entry, "name", "profession", "hobby", "trait", "item", "fact", "id", "Без назви");
    private static string FirstNonEmpty(JsonElement entry, params string[] fields) => fields.Select(x => GetString(entry, x)).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)) ?? string.Empty;
    private static string GetString(JsonElement entry, string property) => entry.ValueKind == JsonValueKind.Object && entry.TryGetProperty(property, out var value) && value.ValueKind == JsonValueKind.String ? value.GetString() ?? string.Empty : string.Empty;
    private static IReadOnlyDictionary<string, string> SafeFields(JsonElement entry) =>
        entry.EnumerateObject().Where(x => x.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number or JsonValueKind.True or JsonValueKind.False)
            .Take(30).ToDictionary(x => x.Name, x => x.Value.ToString(), StringComparer.Ordinal);
    private static string GetLocalizationStatus(IReadOnlyList<JsonElement> entries)
    {
        if (entries.Count == 0) return "Unknown";
        var localizationNodes = entries.Select(x => x.TryGetProperty("_i18n", out var i18n) ? i18n : x.TryGetProperty("localization", out var localization) ? localization : default)
            .Where(x => x.ValueKind == JsonValueKind.Object).ToList();
        if (localizationNodes.Count == 0) return "NotLocalized";
        var complete = localizationNodes.Count(node =>
        {
            var json = node.GetRawText();
            return json.Contains("\"uk\"", StringComparison.OrdinalIgnoreCase) &&
                   json.Contains("\"ru\"", StringComparison.OrdinalIgnoreCase) &&
                   json.Contains("\"en\"", StringComparison.OrdinalIgnoreCase);
        });
        return complete == localizationNodes.Count && localizationNodes.Count == entries.Count
            ? "CompleteUkRuEn"
            : $"IncompleteUkRuEn:{complete}/{entries.Count}";
    }

    private sealed record CatalogRead(CategoryDefinition Definition, GlobalContentMetadataDto Metadata, IReadOnlyList<JsonElement> Entries);
}

public sealed class GlobalContentRequestException(string code) : Exception(code)
{
    public string Code { get; } = code;
}

public sealed record GlobalContentDraftSource(GlobalContentMetadataDto Metadata, IReadOnlyList<string> Entries);
internal sealed record GlobalContentBinaryValidation(bool IsValid, string Status, int EntryCount, string Fingerprint);
