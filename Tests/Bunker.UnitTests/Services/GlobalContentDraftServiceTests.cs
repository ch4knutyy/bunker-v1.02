using System.Text.Json;
using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class GlobalContentDraftServiceTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "bunker-drafts-" + Guid.NewGuid().ToString("N"));
    private readonly TestTime _time = new(DateTimeOffset.Parse("2026-01-01T00:00:00Z"));
    private readonly GlobalContentDraftService _drafts;

    public GlobalContentDraftServiceTests()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "professions.json"), """{"professions":[{"id":"p1","profession":"Doctor","type":"medical"}]}""");
        _drafts = new(new GlobalContentCatalogService(_root), _time);
    }

    [Fact]
    public void CreateStoresBaseAndNeverChangesCanonicalFile()
    {
        var path = Path.Combine(_root, "professions.json"); var content = File.ReadAllText(path); var timestamp = File.GetLastWriteTimeUtc(path);
        var draft = _drafts.Create("professions", "actor", "create-1");
        Assert.NotEmpty(draft.BaseFingerprint); Assert.NotEmpty(draft.BaseVersion); Assert.Equal(1, draft.EntryCount);
        Assert.Equal(content, File.ReadAllText(path)); Assert.Equal(timestamp, File.GetLastWriteTimeUtc(path));
    }

    [Fact]
    public void BlockedAndUnknownCategoriesCannotCreateDraft()
    {
        Assert.Equal("category_missing_stable_ids", Assert.Throws<GlobalContentRequestException>(() => _drafts.Create("hobbies", "a", "1")).Code);
        Assert.Equal("unsupported_category", Assert.Throws<GlobalContentRequestException>(() => _drafts.Create("../facts", "a", "2")).Code);
    }

    [Fact]
    public void CreateUpdateDeleteAndNoOpAffectDraftOnly()
    {
        var canonical = File.ReadAllText(Path.Combine(_root, "professions.json"));
        var draft = _drafts.Create("professions", "actor", "create");
        _drafts.Apply(Command(draft, GlobalContentDraftCommandType.CreateEntry, "p2", "c1", new { profession = "Engineer", type = "technical" }), "actor");
        var updated = _drafts.Apply(Command(draft, GlobalContentDraftCommandType.UpdateEntry, "p1", "c2", new { profession = "Medic" }), "actor");
        var noOp = _drafts.Apply(Command(draft, GlobalContentDraftCommandType.UpdateEntry, "p1", "c3", new { profession = "Medic" }), "actor");
        Assert.Equal(updated.DraftFingerprint, noOp.DraftFingerprint);
        _drafts.Apply(Command(draft, GlobalContentDraftCommandType.DeleteEntry, "p2", "c4", null, true), "actor");
        Assert.Equal(canonical, File.ReadAllText(Path.Combine(_root, "professions.json")));
    }

    [Fact]
    public void UnknownFieldDuplicateIdAndUnsafeTextAreBlocked()
    {
        var draft = _drafts.Create("professions", "actor", "create");
        Assert.Equal("unknown_field", Assert.Throws<GlobalContentRequestException>(() => _drafts.Apply(Command(draft, GlobalContentDraftCommandType.UpdateEntry, "p1", "x1", new { arbitrary_path = "x" }), "actor")).Code);
        Assert.Equal("duplicate_id", Assert.Throws<GlobalContentRequestException>(() => _drafts.Apply(Command(draft, GlobalContentDraftCommandType.CreateEntry, "p1", "x2", new { profession = "X" }), "actor")).Code);
        Assert.Equal("unsafe_text", Assert.Throws<GlobalContentRequestException>(() => _drafts.Apply(Command(draft, GlobalContentDraftCommandType.UpdateEntry, "p1", "x3", new { profession = "<script>x" }), "actor")).Code);
        Assert.Equal("type_mismatch", Assert.Throws<GlobalContentRequestException>(() => _drafts.Apply(Command(draft, GlobalContentDraftCommandType.UpdateEntry, "p1", "x4", new { profession = 42 }), "actor")).Code);
    }

    [Fact]
    public void DiffCountsAddedUpdatedDeletedWithoutMutation()
    {
        var draft = _drafts.Create("professions", "actor", "create");
        _drafts.Apply(Command(draft, GlobalContentDraftCommandType.CreateEntry, "p2", "1", new { profession = "Engineer" }), "actor");
        _drafts.Apply(Command(draft, GlobalContentDraftCommandType.UpdateEntry, "p1", "2", new { type = "doctor" }), "actor");
        var before = _drafts.GetDraft(draft.DraftId, "actor").DraftFingerprint;
        var diff = _drafts.Preview(draft.DraftId, "actor");
        Assert.Equal(1, diff.AddedCount); Assert.Equal(1, diff.UpdatedCount); Assert.Equal(0, diff.DeletedCount);
        Assert.Equal(before, _drafts.GetDraft(draft.DraftId, "actor").DraftFingerprint);
    }

    [Fact]
    public void CanonicalChangeMarksConflictWithoutMerge()
    {
        var draft = _drafts.Create("professions", "actor", "create");
        File.WriteAllText(Path.Combine(_root, "professions.json"), """{"professions":[{"id":"p1","profession":"Changed"}]}""");
        var validation = _drafts.Validate(draft.DraftId, "actor");
        Assert.True(validation.HasBaseConflict); Assert.False(validation.CanProceedToCommit);
        Assert.Equal(GlobalContentDraftStatus.Conflict, _drafts.GetDraft(draft.DraftId, "actor").Status);
    }

    [Fact]
    public void CapsTtlDiscardAndAuditAreSafe()
    {
        var first = _drafts.Create("professions", "actor", "1");
        _drafts.Create("professions", "actor", "2"); _drafts.Create("professions", "actor", "3");
        Assert.Equal("actor_draft_limit", Assert.Throws<GlobalContentRequestException>(() => _drafts.Create("professions", "actor", "4")).Code);
        var discarded = _drafts.Discard(first.DraftId, "actor"); Assert.Equal(discarded, _drafts.Discard(first.DraftId, "actor"));
        _time.Advance(TimeSpan.FromHours(3)); _drafts.GetDrafts("actor");
        Assert.Contains(_drafts.GetAudit(), x => x.Action == "draft_discarded");
        var auditJson = JsonSerializer.Serialize(_drafts.GetAudit());
        Assert.DoesNotContain(_root, auditJson); Assert.DoesNotContain("Doctor", auditJson, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void HealthLocalizationAndMentalPhobiaValidationAreDeterministic()
    {
        Directory.CreateDirectory(Path.Combine(_root, "Mental_conditions"));
        File.WriteAllText(Path.Combine(_root, "Mental_conditions", "mental_conditions.uk.json"), """[{"id":"m1","category":"mood","localization":{"uk":{"name":"Стан"},"ru":{"name":"Состояние"},"en":{"name":"Condition"}}}]""");
        var service = new GlobalContentDraftService(new GlobalContentCatalogService(_root), _time);
        var draft = service.Create("mental_conditions", "actor", "1");
        service.Apply(Command(draft, GlobalContentDraftCommandType.UpdateEntry, "m1", "2", new { category = "phobia", localization = new { uk = new { name = "X" } } }), "actor");
        var result = service.Validate(draft.DraftId, "actor");
        Assert.Contains(result.Issues, x => x.Code == "mental_phobia_forbidden");
        Assert.Contains(result.Issues, x => x.Code == "localization_incomplete");
    }

    [Fact]
    public void ThreatDuplicatePlanIdsAreDetected()
    {
        File.WriteAllText(Path.Combine(_root, "threats.json"), """{"threats":[{"id":"t1","name":"Threat","mechanics":{"interactionType":"plan_choice","planChoice":{"plans":[{"id":"a"},{"id":"a"}]}}}]}""");
        var service = new GlobalContentDraftService(new GlobalContentCatalogService(_root), _time);
        var draft = service.Create("threats", "actor", "1");
        Assert.Contains(service.Validate(draft.DraftId, "actor").Issues, x => x.Code == "duplicate_plan_id");
    }

    private static GlobalContentDraftCommandDto Command(GlobalContentDraftDto draft, GlobalContentDraftCommandType type, string id, string commandId, object? fields, bool confirm = false) =>
        new(draft.DraftId, draft.Category, type, id, fields == null ? null : JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(fields)), confirm, commandId);
    public void Dispose() => Directory.Delete(_root, true);
    private sealed class TestTime(DateTimeOffset now) : TimeProvider { private DateTimeOffset _now = now; public override DateTimeOffset GetUtcNow() => _now; public void Advance(TimeSpan value) => _now += value; }
}
