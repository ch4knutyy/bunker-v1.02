using System.Text.Json;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class StableIdMigrationServiceTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "bunker-migration-content-" + Guid.NewGuid().ToString("N"));
    private readonly string _backups = Path.Combine(Path.GetTempPath(), "bunker-migration-backup-" + Guid.NewGuid().ToString("N"));
    private readonly GlobalContentCatalogService _catalog;
    private readonly GlobalContentDraftService _drafts;
    private readonly GlobalContentCommitService _commits;
    private readonly StableIdMigrationService _migration;

    public StableIdMigrationServiceTests()
    {
        Directory.CreateDirectory(_root);
        WriteHobbies("""{"_i18n_meta":{"keep":"yes"},"hobbies":[{"hobby":"  Шахи  ","type":"calm","item":"board","bonus":"focus","_i18n":{"uk":{"hobby":"Шахи"}},"capabilityTags":["logic"]},{"hobby":"Біг","type":"sport","item":"shoes","bonus":"speed","_i18n":{"uk":{"hobby":"Біг"}},"capabilityTags":["fit"]}]}""");
        File.WriteAllText(Path.Combine(_root, "character_traits.json"), """{"character_traits":[{"trait":"Сміливий","type":"positive","_i18n":{"uk":{"trait":"Сміливий"}}}]}""");
        _catalog = new(_root); _drafts = new(_catalog, TimeProvider.System); _commits = new(_catalog, _drafts, _backups); _migration = new(_catalog, _commits, _drafts, TimeProvider.System);
    }

    [Fact]
    public void PreviewIsReadOnlyDeterministicAndCreatesNoBackup()
    {
        var path = Path.Combine(_root, "hobbies.json"); var before = File.ReadAllText(path); var timestamp = File.GetLastWriteTimeUtc(path);
        var first = _migration.Preview("hobbies", "actor"); var second = _migration.Preview("hobbies", "actor");
        Assert.Equal(first.Mapping.Select(x => x.StableId), second.Mapping.Select(x => x.StableId));
        Assert.All(first.Mapping, x => Assert.StartsWith("hobby_", x.StableId)); Assert.True(first.CanApply);
        Assert.Equal(before, File.ReadAllText(path)); Assert.Equal(timestamp, File.GetLastWriteTimeUtc(path)); Assert.Empty(_commits.GetBackups("hobbies"));
    }

    [Fact]
    public void ExistingIdIsPreservedAndUnsupportedCategoryBlocked()
    {
        WriteHobbies("""{"hobbies":[{"id":"hobby_existing","hobby":"Шахи","type":"calm"},{"hobby":"Біг","type":"sport"}]}""");
        var preview = _migration.Preview("hobbies", "actor");
        Assert.Equal("hobby_existing", preview.Mapping.Single(x => x.CanonicalName == "Шахи").StableId);
        Assert.Equal("preserved", preview.Mapping.Single(x => x.CanonicalName == "Шахи").Status);
        Assert.Equal("unsupported_migration_category", Assert.Throws<GlobalContentRequestException>(() => _migration.Preview("professions", "actor")).Code);
    }

    [Fact]
    public void DuplicateNormalizedNameAndGeneratedCollisionBlockApply()
    {
        WriteHobbies("""{"hobbies":[{"hobby":"Шахи","type":"a"},{"hobby":"  ШАХИ ","type":"b"}]}""");
        Assert.False(_migration.Preview("hobbies", "actor").CanApply);
        WriteHobbies("""{"hobbies":[{"hobby":"A","type":"a"},{"hobby":"B","type":"b"}]}""");
        var collision = new StableIdMigrationService(_catalog, _commits, _drafts, TimeProvider.System, _ => "samehash00000000");
        var preview = collision.Preview("hobbies", "actor"); Assert.False(preview.CanApply); Assert.True(preview.CollisionCount > 0);
    }

    [Fact]
    public void StalePreviewBlocksWithoutOverwrite()
    {
        var preview = _migration.Preview("hobbies", "actor"); var changed = File.ReadAllText(Path.Combine(_root, "hobbies.json")).Replace("focus", "changed"); WriteHobbies(changed);
        Assert.Equal("base_content_changed", Assert.Throws<GlobalContentRequestException>(() => _migration.Apply("hobbies", preview.PreviewToken, true, "actor", "cmd")).Code);
        Assert.Equal(changed, File.ReadAllText(Path.Combine(_root, "hobbies.json")));
    }

    [Fact]
    public void SuccessfulMigrationChangesOnlyIdsAndEnablesDrafts()
    {
        var original = JsonDocument.Parse(File.ReadAllText(Path.Combine(_root, "hobbies.json"))).RootElement.Clone(); var preview = _migration.Preview("hobbies", "actor");
        var result = _migration.Apply("hobbies", preview.PreviewToken, true, "actor", "cmd"); Assert.True(result.Succeeded); Assert.Equal(2, result.GeneratedCount);
        using var migratedDoc = JsonDocument.Parse(File.ReadAllText(Path.Combine(_root, "hobbies.json"))); var migrated = migratedDoc.RootElement;
        var beforeEntries = original.GetProperty("hobbies").EnumerateArray().ToList(); var afterEntries = migrated.GetProperty("hobbies").EnumerateArray().ToList(); Assert.Equal(beforeEntries.Count, afterEntries.Count);
        for (var i = 0; i < beforeEntries.Count; i++) { var before = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(beforeEntries[i]); var after = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(afterEntries[i]); Assert.True(after!.Remove("id")); Assert.Equal(JsonSerializer.Serialize(before), JsonSerializer.Serialize(after)); }
        Assert.Equal("yes", migrated.GetProperty("_i18n_meta").GetProperty("keep").GetString()); Assert.Single(_commits.GetBackups("hobbies"));
        Assert.Equal(GlobalContentEditableReadiness.Ready, _catalog.GetMetadata("hobbies").EditableReadiness);
        Assert.NotNull(_drafts.Create("hobbies", "actor", "draft")); Assert.True(result.NewVersion > 1);
        Assert.True(File.Exists(Path.Combine(_backups, ".migrations", result.ManifestId + ".manifest.json")));
    }

    [Fact]
    public void DoubleApplyIsIdempotentAndAuditIsSafe()
    {
        var preview = _migration.Preview("character_traits", "actor"); var first = _migration.Apply("character_traits", preview.PreviewToken, true, "actor", "same"); var second = _migration.Apply("character_traits", preview.PreviewToken, true, "actor", "same"); Assert.Equal(first, second);
        var audit = JsonSerializer.Serialize(_drafts.GetAudit()); Assert.DoesNotContain(_root, audit); Assert.DoesNotContain("Сміливий", audit);
    }

    [Fact]
    public void AtomicFailureRestoresOriginal()
    {
        var original = File.ReadAllText(Path.Combine(_root, "hobbies.json")); var faultyCommit = new GlobalContentCommitService(_catalog, _drafts, _backups, TimeProvider.System, new() { CorruptAfterReplace = true }); var migration = new StableIdMigrationService(_catalog, faultyCommit, _drafts, TimeProvider.System); var preview = migration.Preview("hobbies", "actor");
        Assert.Equal("post_write_validation_failed_rolled_back", Assert.Throws<GlobalContentRequestException>(() => migration.Apply("hobbies", preview.PreviewToken, true, "actor", "cmd")).Code); Assert.Equal(original, File.ReadAllText(Path.Combine(_root, "hobbies.json")));
    }

    [Fact]
    public void ExistingRollbackRestoresMissingIdsAndBlockedReadiness()
    {
        var preview = _migration.Preview("hobbies", "actor"); _migration.Apply("hobbies", preview.PreviewToken, true, "actor", "migrate"); var backup = _commits.GetBackups("hobbies").Single(); var rollback = _commits.PreviewRollback("hobbies", backup.BackupId, "actor"); var result = _commits.Rollback("hobbies", backup.BackupId, rollback.PreviewToken, true, "actor", "rollback");
        Assert.Equal("rolled_back", result.Code); Assert.Equal(GlobalContentEditableReadiness.BlockedMissingStableIds, _catalog.GetMetadata("hobbies").EditableReadiness); Assert.DoesNotContain("\"id\"", File.ReadAllText(Path.Combine(_root, "hobbies.json")));
    }

    [Fact]
    public void LoaderModelsAcceptOptionalIdsWithoutGameplayFieldChanges()
    {
        var hobby = JsonSerializer.Deserialize<HobbyData>("""{"id":"hobby_x","hobby":"Шахи","type":"calm"}"""); var trait = JsonSerializer.Deserialize<CharacterTraitData>("""{"id":"trait_x","trait":"Сміливий","type":"positive"}""");
        Assert.Equal("Шахи", hobby!.Hobby); Assert.Equal("calm", hobby.Type); Assert.Equal("Сміливий", trait!.Trait); Assert.Equal("positive", trait.Type);
    }

    private void WriteHobbies(string json) => File.WriteAllText(Path.Combine(_root, "hobbies.json"), json);
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); if (Directory.Exists(_backups)) Directory.Delete(_backups, true); }
}
