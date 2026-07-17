using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Bunker.Models;

namespace Bunker.Services;

public sealed class StableIdMigrationService
{
    public const string AlgorithmVersion = "sha256-name-v1";
    public static readonly TimeSpan PreviewTtl = TimeSpan.FromMinutes(15);
    private static readonly HashSet<string> Supported = new(StringComparer.OrdinalIgnoreCase) { "hobbies", "character_traits" };
    private readonly GlobalContentCatalogService _catalog;
    private readonly GlobalContentCommitService _commits;
    private readonly GlobalContentDraftService _audit;
    private readonly TimeProvider _time;
    private readonly Func<string, string> _hash;
    private readonly object _sync = new();
    private readonly Dictionary<string, PreviewState> _previews = new(StringComparer.Ordinal);
    private readonly Dictionary<string, StableIdMigrationResultDto> _commands = new(StringComparer.Ordinal);
    private sealed record PreviewState(string Actor, string Category, string SourceVersion, string SourceFingerprint, string MappingFingerprint, DateTimeOffset Expires, IReadOnlyList<ComputedEntry> Entries, string ExternalReferences, bool Used);
    private sealed record ComputedEntry(string Name, string Id, string Status, string Original, string Migrated);

    public StableIdMigrationService(GlobalContentCatalogService catalog, GlobalContentCommitService commits, GlobalContentDraftService audit, TimeProvider time)
        : this(catalog, commits, audit, time, null) { }
    public StableIdMigrationService(GlobalContentCatalogService catalog, GlobalContentCommitService commits, GlobalContentDraftService audit, TimeProvider? time = null, Func<string, string>? hash = null)
    { _catalog = catalog; _commits = commits; _audit = audit; _time = time ?? TimeProvider.System; _hash = hash ?? DefaultHash; }

    public StableIdMigrationPreviewDto Preview(string category, string actor, int page = 1, int pageSize = 100)
    {
        ValidateCategory(category); if (page < 1 || pageSize is < 1 or > 100) throw new GlobalContentRequestException("invalid_pagination");
        var source = _catalog.ReadDraftSource(category); var computed = Compute(category, source.Entries); var duplicateNames = computed.GroupBy(x => Normalize(x.Name), StringComparer.Ordinal).Count(x => x.Key.Length == 0 || x.Count() > 1);
        var collisions = computed.GroupBy(x => x.Id, StringComparer.Ordinal).Count(x => string.IsNullOrWhiteSpace(x.Key) || x.Count() > 1);
        var invalid = computed.Count(x => string.IsNullOrWhiteSpace(x.Name) || !ValidId(x.Id)); var external = _catalog.AuditExternalReferences(category);
        var canApply = duplicateNames == 0 && collisions == 0 && invalid == 0 && external != "blocked_index_references";
        var token = Guid.NewGuid().ToString("N"); var expires = _time.GetUtcNow().Add(PreviewTtl); var mappingFingerprint = MappingFingerprint(computed);
        lock (_sync) { Cleanup(); _previews[token] = new(actor, category, source.Metadata.FileVersion, source.Metadata.Fingerprint, mappingFingerprint, expires, computed, external, false); }
        _audit.RecordExternalAudit("stable_id_migration_preview", token, category, actor, canApply ? "ready" : "blocked");
        return new(category, source.Metadata.FileVersion, source.Metadata.Fingerprint, computed.Count, computed.Count(x => x.Status == "generated"), computed.Count(x => x.Status == "preserved"), duplicateNames, collisions, invalid,
            canApply ? GlobalContentEditableReadiness.Ready : GlobalContentEditableReadiness.BlockedMissingStableIds,
            computed.Skip((page - 1) * pageSize).Take(pageSize).Select(ToDto).ToList(), page, pageSize, token, expires, canApply, external);
    }

    public StableIdMigrationResultDto Apply(string category, string token, bool confirmation, string actor, string commandId)
    {
        ValidateCategory(category); if (!confirmation) throw new GlobalContentRequestException("migration_confirmation_required"); if (string.IsNullOrWhiteSpace(commandId)) throw new GlobalContentRequestException("invalid_command_id");
        lock (_sync) if (_commands.TryGetValue(commandId, out var replay)) return replay;
        PreviewState preview; lock (_sync) { Cleanup(); if (!_previews.TryGetValue(token, out preview!) || preview.Actor != actor || preview.Category != category || preview.Used) throw new GlobalContentRequestException("migration_preview_invalid"); if (preview.Expires <= _time.GetUtcNow()) throw new GlobalContentRequestException("migration_preview_expired"); }
        var source = _catalog.ReadDraftSource(category); if (source.Metadata.Fingerprint != preview.SourceFingerprint || source.Metadata.FileVersion != preview.SourceVersion) throw new GlobalContentRequestException("base_content_changed");
        var recomputed = Compute(category, source.Entries); if (MappingFingerprint(recomputed) != preview.MappingFingerprint) throw new GlobalContentRequestException("migration_mapping_changed");
        if (recomputed.GroupBy(x => Normalize(x.Name)).Any(x => x.Key.Length == 0 || x.Count() > 1) || recomputed.GroupBy(x => x.Id).Any(x => string.IsNullOrWhiteSpace(x.Key) || x.Count() > 1)) throw new GlobalContentRequestException("migration_collision");
        if (recomputed.Any(x => !SemanticallyEqualExceptId(x.Original, x.Migrated))) throw new GlobalContentRequestException("non_id_content_changed");
        var migrationId = Guid.NewGuid().ToString("N"); var commit = _commits.CommitStableIdMigration(category, recomputed.Select(x => x.Migrated).ToList(), preview.SourceVersion, preview.SourceFingerprint, actor, migrationId, recomputed.Count(x => x.Status == "generated"), recomputed.Count(x => x.Status == "preserved"), commandId);
        var current = _catalog.GetMetadata(category); if (current.StableIdStatus != "ValidUniqueDeterministic" || current.EditableReadiness != GlobalContentEditableReadiness.Ready) throw new GlobalContentRequestException("migration_readiness_failed");
        var manifest = new StableIdMigrationManifestDto(migrationId, AlgorithmVersion, category, preview.SourceVersion, preview.SourceFingerprint, commit.NewVersion, current.Fingerprint, _time.GetUtcNow(), actor, recomputed.Count, recomputed.Select(ToDto).ToList());
        var manifestId = WriteManifest(manifest); var result = new StableIdMigrationResultDto(true, "migrated", migrationId, category, recomputed.Count(x => x.Status == "generated"), recomputed.Count(x => x.Status == "preserved"), commit.NewVersion, current.Fingerprint, commit.BackupId, manifestId, "restart_required");
        lock (_sync) { _previews[token] = preview with { Used = true }; _commands[commandId] = result; } return result;
    }

    private IReadOnlyList<ComputedEntry> Compute(string category, IReadOnlyList<string> entries)
    {
        var nameField = category == "hobbies" ? "hobby" : "trait"; var prefix = category == "hobbies" ? "hobby_" : "trait_"; var result = new List<ComputedEntry>();
        foreach (var raw in entries)
        {
            var node = JsonNode.Parse(raw)!.AsObject(); var name = node[nameField]?.ToString() ?? ""; var existing = node["id"]?.ToString(); var status = ValidId(existing) ? "preserved" : "generated"; var id = status == "preserved" ? existing! : prefix + _hash(category + "\n" + Normalize(name));
            node["id"] = id; result.Add(new(name, id, status, raw, node.ToJsonString()));
        }
        return result;
    }
    private string WriteManifest(StableIdMigrationManifestDto manifest)
    {
        var root = _commits.MigrationMetadataRoot; Directory.CreateDirectory(root); var id = manifest.MigrationId; var target = Path.Combine(root, id + ".manifest.json"); var temp = target + ".tmp";
        try { var bytes = new UTF8Encoding(false).GetBytes(JsonSerializer.Serialize(manifest)); using (var stream = new FileStream(temp, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough)) { stream.Write(bytes); stream.Flush(true); } File.Move(temp, target, false); return id; }
        finally { if (File.Exists(temp)) File.Delete(temp); }
    }
    private void Cleanup() { foreach (var key in _previews.Where(x => x.Value.Expires <= _time.GetUtcNow() || x.Value.Used).Select(x => x.Key).ToList()) _previews.Remove(key); }
    private static StableIdMigrationMappingDto ToDto(ComputedEntry x) => new(x.Name, x.Id, x.Status);
    private static string Normalize(string value) => string.Join(' ', value.Normalize(NormalizationForm.FormKC).Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries)).ToLower(CultureInfo.InvariantCulture);
    private static string DefaultHash(string input) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(input))).ToLowerInvariant()[..16];
    private static string MappingFingerprint(IEnumerable<ComputedEntry> entries) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(string.Join('\n', entries.Select(x => x.Name + "=" + x.Id + ":" + x.Status))))).ToLowerInvariant();
    private static bool ValidId(string? id) => !string.IsNullOrWhiteSpace(id) && id.Length <= 100 && id.All(x => char.IsLetterOrDigit(x) || x is '_' or '-');
    private static bool SemanticallyEqualExceptId(string original, string migrated) { var left = JsonNode.Parse(original)!.AsObject(); var right = JsonNode.Parse(migrated)!.AsObject(); left.Remove("id"); right.Remove("id"); return JsonNode.DeepEquals(left, right); }
    private static void ValidateCategory(string category) { if (!Supported.Contains(category)) throw new GlobalContentRequestException("unsupported_migration_category"); }
}
