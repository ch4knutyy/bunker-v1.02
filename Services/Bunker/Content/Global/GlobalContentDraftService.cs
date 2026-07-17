using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Bunker.Models;

namespace Bunker.Services;

public sealed class GlobalContentDraftService
{
    public const int MaximumActiveDrafts = 10;
    public const int MaximumActorDrafts = 3;
    public const int MaximumCommandsPerMinute = 20;
    public static readonly TimeSpan DraftTtl = TimeSpan.FromHours(2);
    private const int MaximumEntries = 5_000;
    private const int MaximumFieldLength = 20_000;

    private sealed class DraftState
    {
        public required GlobalContentDraftDto Metadata;
        public required Dictionary<string, JsonObject> BaseEntries;
        public required Dictionary<string, JsonObject> Entries;
        public HashSet<string> Commands { get; } = new(StringComparer.Ordinal);
        public List<GlobalContentValidationIssueDto> Issues { get; set; } = [];
    }

    private static readonly HashSet<string> Editable = new(StringComparer.OrdinalIgnoreCase)
    { "professions", "hobbies", "mental_conditions", "physical_health", "phobias", "character_traits", "facts", "special_cards", "apocalypses", "bunkers", "items", "threats" };
    private static readonly HashSet<string> Blocked = new(StringComparer.OrdinalIgnoreCase) { "hobbies", "character_traits" };
    private static readonly IReadOnlyDictionary<string, HashSet<string>> Fields = BuildFields();

    private readonly GlobalContentCatalogService _catalog;
    private readonly TimeProvider _time;
    private readonly object _sync = new();
    private readonly Dictionary<string, DraftState> _drafts = new(StringComparer.Ordinal);
    private readonly ConcurrentDictionary<string, Queue<DateTimeOffset>> _mutationRates = new(StringComparer.Ordinal);
    private readonly List<GlobalContentDraftAuditDto> _audit = [];
    private long _sequence;

    public GlobalContentDraftService(GlobalContentCatalogService catalog, TimeProvider time)
    { _catalog = catalog; _time = time; }

    public bool TryConsumeMutation(string actor)
    {
        var queue = _mutationRates.GetOrAdd(actor, _ => new());
        lock (queue)
        {
            var cutoff = _time.GetUtcNow().AddMinutes(-1);
            while (queue.Count > 0 && queue.Peek() <= cutoff) queue.Dequeue();
            if (queue.Count >= MaximumCommandsPerMinute) return false;
            queue.Enqueue(_time.GetUtcNow()); return true;
        }
    }

    public IReadOnlyList<GlobalContentDraftDto> GetDrafts(string actor)
    { lock (_sync) { Cleanup(); return _drafts.Values.Where(x => x.Metadata.CreatedByPlayerId == actor).Select(x => x.Metadata).ToList(); } }
    public GlobalContentDraftDto GetDraft(string id, string actor)
    { lock (_sync) { Cleanup(); return Owned(id, actor).Metadata; } }
    public IReadOnlyList<GlobalContentDraftAuditDto> GetAudit() { lock (_sync) return _audit.ToList(); }

    public GlobalContentDraftDto Create(string category, string actor, string commandId)
    {
        lock (_sync)
        {
            Cleanup(); ValidateCommandId(commandId);
            if (!Editable.Contains(category)) throw new GlobalContentRequestException(Blocked.Contains(category) ? "category_missing_stable_ids" : "unsupported_category");
            if (_drafts.Values.Count(IsActive) >= MaximumActiveDrafts) throw new GlobalContentRequestException("draft_limit");
            if (_drafts.Values.Count(x => IsActive(x) && x.Metadata.CreatedByPlayerId == actor) >= MaximumActorDrafts) throw new GlobalContentRequestException("actor_draft_limit");
            var catalogMetadata = _catalog.GetMetadata(category);
            if (catalogMetadata.StableIdStatus != "ValidUniqueDeterministic") throw new GlobalContentRequestException("category_missing_stable_ids");
            var source = _catalog.ReadDraftSource(category);
            var entries = ParseEntries(source.Entries);
            var now = _time.GetUtcNow(); var id = Guid.NewGuid().ToString("N");
            var metadata = new GlobalContentDraftDto(id, category, source.Metadata.FileVersion, source.Metadata.Fingerprint,
                now, actor, now, now.Add(DraftTtl), GlobalContentDraftStatus.Draft, Fingerprint(entries), entries.Count, "not_validated");
            _drafts[id] = new() { Metadata = metadata, BaseEntries = Clone(entries), Entries = Clone(entries) };
            Audit("draft_created", metadata, actor, "", "success"); return metadata;
        }
    }

    public GlobalContentDraftDto Apply(GlobalContentDraftCommandDto command, string actor)
    {
        lock (_sync)
        {
            Cleanup(); ValidateCommandId(command.CommandId); var state = Owned(command.DraftId, actor);
            if (!string.Equals(state.Metadata.Category, command.Category, StringComparison.OrdinalIgnoreCase)) throw new GlobalContentRequestException("category_mismatch");
            if (!state.Commands.Add(command.CommandId)) return state.Metadata;
            ValidateEntryId(command.EntryId); var changed = command.Type switch
            {
                GlobalContentDraftCommandType.CreateEntry => CreateEntry(state, command),
                GlobalContentDraftCommandType.UpdateEntry => UpdateEntry(state, command),
                GlobalContentDraftCommandType.DeleteEntry => DeleteEntry(state, command),
                _ => throw new GlobalContentRequestException("unsupported_command")
            };
            if (!changed) return state.Metadata;
            state.Issues = [];
            state.Metadata = state.Metadata with { UpdatedAtUtc = _time.GetUtcNow(), Status = GlobalContentDraftStatus.Draft,
                DraftFingerprint = Fingerprint(state.Entries), EntryCount = state.Entries.Count, ValidationSummary = "not_validated" };
            Audit($"entry_{command.Type.ToString().Replace("Entry", "").ToLowerInvariant()}", state.Metadata, actor, command.EntryId, "success");
            return state.Metadata;
        }
    }

    public GlobalContentDraftValidationDto Validate(string id, string actor)
    {
        lock (_sync)
        {
            Cleanup(); var state = Owned(id, actor); var conflict = HasConflict(state);
            if (conflict) { state.Metadata = state.Metadata with { Status = GlobalContentDraftStatus.Conflict, ValidationSummary = "base_content_changed" }; Audit("conflict_detected", state.Metadata, actor, "", "conflict"); return Result(state, true); }
            state.Issues = ValidateEntries(state.Metadata.Category, state.Entries);
            var valid = state.Issues.All(x => x.Severity != GlobalContentIssueSeverity.Error);
            state.Metadata = state.Metadata with { Status = valid ? GlobalContentDraftStatus.Validated : GlobalContentDraftStatus.Invalid,
                UpdatedAtUtc = _time.GetUtcNow(), DraftFingerprint = Fingerprint(state.Entries), ValidationSummary = Summary(state.Issues) };
            Audit(valid ? "draft_validated" : "validation_failed", state.Metadata, actor, "", valid ? "success" : "invalid");
            return Result(state, false);
        }
    }

    public GlobalContentDraftDiffDto Preview(string id, string actor, int page = 1, int pageSize = 100)
    {
        if (page < 1 || pageSize is < 1 or > 100) throw new GlobalContentRequestException("invalid_pagination");
        lock (_sync)
        {
            Cleanup(); var state = Owned(id, actor); var conflict = HasConflict(state);
            if (conflict) state.Metadata = state.Metadata with { Status = GlobalContentDraftStatus.Conflict, ValidationSummary = "base_content_changed" };
            var diffs = Diff(state).ToList();
            return new(diffs.Count(x => x.ChangeType == "added"), diffs.Count(x => x.ChangeType == "updated"), diffs.Count(x => x.ChangeType == "deleted"),
                diffs.Select(x => x.EntryId).ToList(), diffs.Skip((page - 1) * pageSize).Take(pageSize).ToList(), state.Metadata.ValidationSummary, conflict, state.Entries.Count);
        }
    }

    public GlobalContentDraftDto Discard(string id, string actor)
    {
        lock (_sync)
        {
            Cleanup(); var state = OwnedIncludingDiscarded(id, actor);
            if (state.Metadata.Status == GlobalContentDraftStatus.Discarded) return state.Metadata;
            state.Entries.Clear(); state.BaseEntries.Clear();
            state.Metadata = state.Metadata with { Status = GlobalContentDraftStatus.Discarded, UpdatedAtUtc = _time.GetUtcNow(), EntryCount = 0, ValidationSummary = "discarded" };
            Audit("draft_discarded", state.Metadata, actor, "", "success"); return state.Metadata;
        }
    }

    public GlobalContentCommitPackage PrepareCommit(string id, string actor)
    {
        lock (_sync)
        {
            Cleanup(); var state = Owned(id, actor);
            if (state.Metadata.Status != GlobalContentDraftStatus.Validated) throw new GlobalContentRequestException("draft_not_validated");
            if (HasConflict(state)) { state.Metadata = state.Metadata with { Status = GlobalContentDraftStatus.Conflict, ValidationSummary = "base_content_changed" }; Audit("commit_rejected", state.Metadata, actor, "", "base_content_changed"); throw new GlobalContentRequestException("base_content_changed"); }
            var issues = ValidateEntries(state.Metadata.Category, state.Entries);
            if (issues.Any(x => x.Severity == GlobalContentIssueSeverity.Error)) throw new GlobalContentRequestException("draft_validation_failed");
            if (Fingerprint(state.Entries) != state.Metadata.DraftFingerprint) throw new GlobalContentRequestException("draft_fingerprint_mismatch");
            var diff = Diff(state).ToList();
            Audit("commit_started", state.Metadata, actor, "", "started");
            return new(state.Metadata, state.Entries.OrderBy(x => x.Key).Select(x => x.Value.ToJsonString()).ToList(), diff);
        }
    }

    public GlobalContentDraftDto MarkCommitted(string id, string actor, long version, string fingerprint)
    {
        lock (_sync)
        {
            var state = Owned(id, actor);
            state.Metadata = state.Metadata with { Status = GlobalContentDraftStatus.Committed, UpdatedAtUtc = _time.GetUtcNow(), CommittedVersion = version, CommittedFingerprint = fingerprint, ValidationSummary = "committed" };
            Audit("commit_succeeded", state.Metadata, actor, "", "success"); return state.Metadata;
        }
    }

    public void RecordExternalAudit(string action, string draftId, string category, string actor, string result)
    {
        lock (_sync)
        {
            var metadata = _drafts.TryGetValue(draftId, out var state) ? state.Metadata : new GlobalContentDraftDto(draftId, category, "", "", _time.GetUtcNow(), actor, _time.GetUtcNow(), _time.GetUtcNow(), GlobalContentDraftStatus.Invalid, "", 0, result);
            Audit(action, metadata, actor, "", result);
        }
    }

    private bool CreateEntry(DraftState state, GlobalContentDraftCommandDto command)
    {
        if (state.Entries.ContainsKey(command.EntryId)) throw new GlobalContentRequestException("duplicate_id");
        if (state.Entries.Count >= MaximumEntries) throw new GlobalContentRequestException("entry_limit");
        var entry = NormalizeFields(state.Metadata.Category, command.Fields); entry["id"] = command.EntryId;
        var name = CanonicalName(entry); if (name.Length > 0 && state.Entries.Values.Any(x => string.Equals(CanonicalName(x), name, StringComparison.OrdinalIgnoreCase))) throw new GlobalContentRequestException("duplicate_canonical_name");
        state.Entries.Add(command.EntryId, entry); return true;
    }
    private bool UpdateEntry(DraftState state, GlobalContentDraftCommandDto command)
    {
        if (!state.Entries.TryGetValue(command.EntryId, out var entry)) throw new GlobalContentRequestException("entry_not_found");
        var changes = NormalizeFields(state.Metadata.Category, command.Fields); if (changes.ContainsKey("id")) throw new GlobalContentRequestException("immutable_id");
        var clone = (JsonObject)entry.DeepClone(); foreach (var field in changes) clone[field.Key] = field.Value?.DeepClone();
        if (JsonNode.DeepEquals(entry, clone)) return false;
        var name = CanonicalName(clone); if (name.Length > 0 && state.Entries.Any(x => x.Key != command.EntryId && string.Equals(CanonicalName(x.Value), name, StringComparison.OrdinalIgnoreCase))) throw new GlobalContentRequestException("duplicate_canonical_name");
        state.Entries[command.EntryId] = clone; return true;
    }
    private static bool DeleteEntry(DraftState state, GlobalContentDraftCommandDto command)
    { if (!command.ConfirmDelete) throw new GlobalContentRequestException("delete_confirmation_required"); if (!state.Entries.Remove(command.EntryId)) throw new GlobalContentRequestException("entry_not_found"); return true; }

    private static JsonObject NormalizeFields(string category, IReadOnlyDictionary<string, JsonElement>? fields)
    {
        if (fields == null || fields.Count == 0) throw new GlobalContentRequestException("fields_required");
        if (!Fields.TryGetValue(category, out var allowed)) throw new GlobalContentRequestException("unsupported_category");
        var result = new JsonObject();
        foreach (var field in fields)
        {
            if (!allowed.Contains(field.Key) || field.Key.Contains('.') || field.Key.Contains('/') || field.Key.Contains('\\')) throw new GlobalContentRequestException("unknown_field");
            ValidateFieldType(field.Key, field.Value);
            if (field.Value.GetRawText().Length > MaximumFieldLength) throw new GlobalContentRequestException("field_too_large");
            if (field.Value.ValueKind == JsonValueKind.String && Unsafe(field.Value.GetString() ?? "")) throw new GlobalContentRequestException("unsafe_text");
            result[field.Key] = JsonNode.Parse(field.Value.GetRawText());
        }
        return result;
    }

    private static void ValidateFieldType(string field, JsonElement value)
    {
        var expected = field switch
        {
            "isSecret" or "isOneTimeUse" or "requiresTarget" or "hasSeverity" or "isUniversalFallback" => JsonValueKind.True,
            "capacity" or "suppliesMonths" or "round" or "survivalChance" => JsonValueKind.Number,
            "skills" or "items" or "capabilityTags" or "tags" or "facilities" or "resources" or "problems" or "threats" or "requirements" or "apocalypseTags" or "relatedApocalypseIds" or "resourceTags" or "protectionTags" => JsonValueKind.Array,
            "_i18n" or "localization" or "mechanics" or "threatUsage" => JsonValueKind.Object,
            _ => JsonValueKind.String
        };
        var valid = expected == JsonValueKind.True ? value.ValueKind is JsonValueKind.True or JsonValueKind.False : value.ValueKind == expected;
        if (!valid) throw new GlobalContentRequestException("type_mismatch");
    }

    private static List<GlobalContentValidationIssueDto> ValidateEntries(string category, Dictionary<string, JsonObject> entries)
    {
        var issues = new List<GlobalContentValidationIssueDto>(); var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var pair in entries.OrderBy(x => x.Key, StringComparer.Ordinal))
        {
            var entry = pair.Value; var name = CanonicalName(entry);
            if (name.Length == 0) Add("required_name", "name"); else if (!names.Add(name)) Add("duplicate_canonical_name", "name");
            foreach (var value in entry.Where(x => x.Value is JsonValue).Select(x => x.Value!.ToString())) if (Unsafe(value)) Add("unsafe_text", "text");
            if (category is "mental_conditions" or "physical_health")
            {
                if (entry["localization"] is not JsonObject localization || !new[] { "uk", "ru", "en" }.All(localization.ContainsKey)) Add("localization_incomplete", "localization");
                if (category == "mental_conditions" && string.Equals(entry["category"]?.ToString(), "phobia", StringComparison.OrdinalIgnoreCase)) Add("mental_phobia_forbidden", "category");
            }
            if (category == "threats") ValidateThreat(entry, pair.Key, issues);
            if (category == "special_cards" && entry["effectType"]?.ToString() is { Length: > 0 } effect && !new[] { "doubleVotesAgainstTargetAndBlockCasterVote" }.Contains(effect)) Add("unsupported_effect_type", "effectType");
            void Add(string code, string field) => issues.Add(new(code, GlobalContentIssueSeverity.Error, pair.Key, field, code));
        }
        if (Encoding.UTF8.GetByteCount(JsonSerializer.Serialize(entries.Values)) > GlobalContentCatalogService.MaximumFileBytes) issues.Add(new("draft_too_large", GlobalContentIssueSeverity.Error, "", "draft", "draft_too_large"));
        return issues;
    }
    private static void ValidateThreat(JsonObject entry, string id, List<GlobalContentValidationIssueDto> issues)
    {
        var type = entry["mechanics"]?["interactionType"]?.ToString();
        if (!string.IsNullOrEmpty(type) && type is not ("text" or "mini_game" or "plan_choice")) issues.Add(new("unsupported_interaction_type", GlobalContentIssueSeverity.Error, id, "mechanics.interactionType", "unsupported_interaction_type"));
        if (type == "plan_choice")
        {
            var plans = entry["mechanics"]?["planChoice"]?["plans"] as JsonArray;
            if (plans == null || plans.Count == 0) issues.Add(new("plan_choice_required", GlobalContentIssueSeverity.Error, id, "mechanics.planChoice.plans", "plan_choice_required"));
            else if (plans.Select(x => x?["id"]?.ToString()).Where(x => !string.IsNullOrEmpty(x)).GroupBy(x => x).Any(x => x.Count() > 1)) issues.Add(new("duplicate_plan_id", GlobalContentIssueSeverity.Error, id, "mechanics.planChoice.plans", "duplicate_plan_id"));
        }
        foreach (var forbidden in new[] { "effectsApplied", "finalizer", "runtimeScore", "outcome" }) if (entry.ContainsKey(forbidden)) issues.Add(new("runtime_field_forbidden", GlobalContentIssueSeverity.Error, id, forbidden, "runtime_field_forbidden"));
    }

    private bool HasConflict(DraftState state) => _catalog.GetMetadata(state.Metadata.Category).Fingerprint != state.Metadata.BaseFingerprint;
    private static GlobalContentDraftValidationDto Result(DraftState state, bool conflict) { var e = state.Issues.Count(x => x.Severity == GlobalContentIssueSeverity.Error); var w = state.Issues.Count(x => x.Severity == GlobalContentIssueSeverity.Warning); var i = state.Issues.Count - e - w; return new(!conflict && e == 0, e, w, i, state.Issues.ToList(), state.Metadata.DraftFingerprint, conflict, !conflict && e == 0); }
    private static IEnumerable<GlobalContentDraftDiffEntryDto> Diff(DraftState state)
    {
        foreach (var id in state.BaseEntries.Keys.Union(state.Entries.Keys).OrderBy(x => x, StringComparer.Ordinal))
            if (!state.BaseEntries.ContainsKey(id)) yield return new(id, "added", state.Entries[id].Select(x => x.Key).Order().ToList());
            else if (!state.Entries.ContainsKey(id)) yield return new(id, "deleted", []);
            else if (!JsonNode.DeepEquals(state.BaseEntries[id], state.Entries[id])) yield return new(id, "updated", state.BaseEntries[id].Select(x => x.Key).Union(state.Entries[id].Select(x => x.Key)).Where(x => !JsonNode.DeepEquals(state.BaseEntries[id][x], state.Entries[id][x])).Order().ToList());
    }
    private void Cleanup() { var now = _time.GetUtcNow(); foreach (var state in _drafts.Values.Where(x => x.Metadata.Status is not (GlobalContentDraftStatus.Discarded or GlobalContentDraftStatus.Expired) && x.Metadata.ExpiresAtUtc <= now)) { state.Entries.Clear(); state.BaseEntries.Clear(); state.Metadata = state.Metadata with { Status = GlobalContentDraftStatus.Expired, EntryCount = 0, ValidationSummary = "expired" }; } }
    private static bool IsActive(DraftState state) => state.Metadata.Status is not (GlobalContentDraftStatus.Discarded or GlobalContentDraftStatus.Expired or GlobalContentDraftStatus.Committed);
    private DraftState Owned(string id, string actor) { var state = OwnedIncludingDiscarded(id, actor); if (state.Metadata.Status is GlobalContentDraftStatus.Discarded or GlobalContentDraftStatus.Expired) throw new GlobalContentRequestException("draft_inactive"); return state; }
    private DraftState OwnedIncludingDiscarded(string id, string actor) { if (!_drafts.TryGetValue(id, out var state) || state.Metadata.CreatedByPlayerId != actor) throw new GlobalContentRequestException("draft_not_found"); return state; }
    private void Audit(string action, GlobalContentDraftDto draft, string actor, string entry, string result) { _audit.Add(new(++_sequence, _time.GetUtcNow(), action, draft.DraftId, draft.Category, actor, entry, result)); if (_audit.Count > 500) _audit.RemoveAt(0); }
    private static Dictionary<string, JsonObject> ParseEntries(IEnumerable<string> source) => source.Select(x => JsonNode.Parse(x)!.AsObject()).ToDictionary(x => x["id"]!.ToString(), x => x, StringComparer.Ordinal);
    private static Dictionary<string, JsonObject> Clone(Dictionary<string, JsonObject> source) => source.ToDictionary(x => x.Key, x => (JsonObject)x.Value.DeepClone(), StringComparer.Ordinal);
    private static string Fingerprint(Dictionary<string, JsonObject> entries) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(entries.OrderBy(x => x.Key))))).ToLowerInvariant();
    private static string Summary(IEnumerable<GlobalContentValidationIssueDto> issues) { var list = issues.ToList(); return $"errors:{list.Count(x => x.Severity == GlobalContentIssueSeverity.Error)};warnings:{list.Count(x => x.Severity == GlobalContentIssueSeverity.Warning)};info:{list.Count(x => x.Severity == GlobalContentIssueSeverity.Info)}"; }
    private static string CanonicalName(JsonObject entry) => new[] { "name", "profession", "hobby", "trait", "item", "fact" }.Select(x => entry[x]?.ToString()).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x)) ?? "";
    private static bool Unsafe(string value) => value.Any(char.IsControl) || value.Contains("<script", StringComparison.OrdinalIgnoreCase) || value.Contains("javascript:", StringComparison.OrdinalIgnoreCase);
    private static void ValidateEntryId(string id) { if (string.IsNullOrWhiteSpace(id) || id.Length > 100 || !id.All(x => char.IsLetterOrDigit(x) || x is '_' or '-')) throw new GlobalContentRequestException("invalid_entry_id"); }
    private static void ValidateCommandId(string id) { if (string.IsNullOrWhiteSpace(id) || id.Length > 100) throw new GlobalContentRequestException("invalid_command_id"); }
    private static IReadOnlyDictionary<string, HashSet<string>> BuildFields()
    {
        HashSet<string> Set(params string[] values) => new(values, StringComparer.Ordinal);
        return new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["professions"] = Set("profession","type","skills","items","bonus","_i18n","capabilityTags"), ["hobbies"] = Set("hobby","type","item","bonus","_i18n","capabilityTags"),
            ["character_traits"] = Set("trait","type","_i18n"),
            ["mental_conditions"] = Set("category","hasSeverity","localization"), ["physical_health"] = Set("hasSeverity","localization"),
            ["phobias"] = Set("name","description","bunkerEffect","_i18n"), ["facts"] = Set("source","type","category","fact","description","_i18n"),
            ["special_cards"] = Set("name","description","isSecret","isOneTimeUse","phase","effectType","requiresTarget","_i18n"),
            ["apocalypses"] = Set("name","description","severity","survivalChance","duration","threats","requirements","_i18n","tags"),
            ["bunkers"] = Set("name","description","capacity","location","suppliesMonths","facilities","resources","problems","condition","_i18n","tags"),
            ["items"] = Set("item","category","_i18n","resourceTags","protectionTags","threatUsage"),
            ["threats"] = Set("name","description","severity","round","category","apocalypseTags","relatedApocalypseIds","isUniversalFallback","tags","_i18n","mechanics")
        };
    }
}

public sealed record GlobalContentCommitPackage(
    GlobalContentDraftDto Draft,
    IReadOnlyList<string> Entries,
    IReadOnlyList<GlobalContentDraftDiffEntryDto> Diff);
