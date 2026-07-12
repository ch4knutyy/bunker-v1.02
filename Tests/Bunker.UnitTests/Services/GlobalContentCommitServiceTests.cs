using System.Text.Json;
using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class GlobalContentCommitServiceTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "bunker-commit-content-" + Guid.NewGuid().ToString("N"));
    private readonly string _backupRoot = Path.Combine(Path.GetTempPath(), "bunker-commit-backups-" + Guid.NewGuid().ToString("N"));
    private readonly GlobalContentCatalogService _catalog;
    private readonly GlobalContentDraftService _drafts;

    public GlobalContentCommitServiceTests()
    {
        Directory.CreateDirectory(_root);
        File.WriteAllText(Path.Combine(_root, "professions.json"), """{"_i18n_meta":{"keep":true},"professions":[{"id":"p1","profession":"Doctor","type":"medical"}]}""");
        _catalog = new(_root); _drafts = new(_catalog, TimeProvider.System);
    }

    [Fact]
    public void UnvalidatedConflictAndBlockedCategoryCannotCommit()
    {
        var commit = Writer(); var draft = _drafts.Create("professions", "actor", "create");
        Assert.Equal("draft_not_validated", Assert.Throws<GlobalContentRequestException>(() => commit.Commit(draft.DraftId, "actor", "commit1")).Code);
        _drafts.Validate(draft.DraftId, "actor");
        File.WriteAllText(Path.Combine(_root, "professions.json"), """{"professions":[{"id":"p1","profession":"Changed"}]}""");
        Assert.Equal("base_content_changed", Assert.Throws<GlobalContentRequestException>(() => commit.Commit(draft.DraftId, "actor", "commit2")).Code);
        Assert.Equal("category_missing_stable_ids", Assert.Throws<GlobalContentRequestException>(() => _drafts.Create("hobbies", "actor", "blocked")).Code);
    }

    [Fact]
    public void NoOpDoesNotWriteOrCreateBackup()
    {
        var commit = Writer(); var path = Path.Combine(_root, "professions.json"); var before = File.ReadAllText(path); var timestamp = File.GetLastWriteTimeUtc(path);
        var draft = _drafts.Create("professions", "actor", "create"); _drafts.Validate(draft.DraftId, "actor");
        var result = commit.Commit(draft.DraftId, "actor", "commit");
        Assert.Equal("no_changes", result.Code); Assert.Empty(commit.GetBackups("professions"));
        Assert.Equal(before, File.ReadAllText(path)); Assert.Equal(timestamp, File.GetLastWriteTimeUtc(path));
    }

    [Fact]
    public void SuccessfulCommitBacksUpAtomicallyValidatesAndIncrementsVersion()
    {
        var commit = Writer(); var draft = ChangedDraft("Engineer");
        var result = commit.Commit(draft.DraftId, "actor", "commit");
        Assert.True(result.Succeeded); Assert.Equal(2, result.NewVersion); Assert.Single(commit.GetBackups("professions"));
        var content = File.ReadAllText(Path.Combine(_root, "professions.json"));
        Assert.Contains("Engineer", content); Assert.Contains("_i18n_meta", content);
        Assert.StartsWith("Valid", _catalog.GetMetadata("professions").SchemaStatus);
        Assert.Equal(GlobalContentDraftStatus.Committed, _drafts.GetDraft(draft.DraftId, "actor").Status);
        Assert.Equal("draft_not_validated", Assert.Throws<GlobalContentRequestException>(() => commit.Commit(draft.DraftId, "actor", "again")).Code);
    }

    [Fact]
    public void FailureBeforeReplaceLeavesOriginalUntouched()
    {
        var before = File.ReadAllText(Path.Combine(_root, "professions.json")); var draft = ChangedDraft("Engineer");
        var commit = Writer(new() { FailBeforeReplace = true });
        Assert.Equal("commit_failed", Assert.Throws<GlobalContentRequestException>(() => commit.Commit(draft.DraftId, "actor", "commit")).Code);
        Assert.Equal(before, File.ReadAllText(Path.Combine(_root, "professions.json")));
        Assert.Empty(Directory.GetFiles(_root, "*.tmp", SearchOption.AllDirectories));
    }

    [Fact]
    public void PostWriteFailureAutomaticallyRestoresBackup()
    {
        var before = File.ReadAllText(Path.Combine(_root, "professions.json")); var draft = ChangedDraft("Engineer");
        var commit = Writer(new() { CorruptAfterReplace = true });
        Assert.Equal("post_write_validation_failed_rolled_back", Assert.Throws<GlobalContentRequestException>(() => commit.Commit(draft.DraftId, "actor", "commit")).Code);
        Assert.Equal(before, File.ReadAllText(Path.Combine(_root, "professions.json")));
        Assert.Contains(_drafts.GetAudit(), x => x.Action == "automatic_rollback");
    }

    [Fact]
    public void RollbackPreviewIsReadOnlyAndStalePreviewIsBlocked()
    {
        var commit = Writer(); var first = ChangedDraft("Engineer"); commit.Commit(first.DraftId, "actor", "commit1");
        var backup = Assert.Single(commit.GetBackups("professions")); var before = File.ReadAllText(Path.Combine(_root, "professions.json"));
        var preview = commit.PreviewRollback("professions", backup.BackupId, "actor"); Assert.Equal(before, File.ReadAllText(Path.Combine(_root, "professions.json")));
        File.WriteAllText(Path.Combine(_root, "professions.json"), before.Replace("Engineer", "ExternallyChanged"));
        Assert.Equal("rollback_preview_stale", Assert.Throws<GlobalContentRequestException>(() => commit.Rollback("professions", backup.BackupId, preview.PreviewToken, true, "actor", "rollback")).Code);
    }

    [Fact]
    public void ManualRollbackCreatesSafetyBackupAndNewVersion()
    {
        var commit = Writer(); var first = ChangedDraft("Engineer"); var committed = commit.Commit(first.DraftId, "actor", "commit1");
        var originalBackup = commit.GetBackups("professions").Single(); var preview = commit.PreviewRollback("professions", originalBackup.BackupId, "actor");
        var result = commit.Rollback("professions", originalBackup.BackupId, preview.PreviewToken, true, "actor", "rollback");
        Assert.Equal("rolled_back", result.Code); Assert.True(result.NewVersion > committed.NewVersion); Assert.Equal(2, commit.GetBackups("professions").Count);
        Assert.Contains("Doctor", File.ReadAllText(Path.Combine(_root, "professions.json")));
    }

    [Fact]
    public void BackupRootIsSeparateCappedAndAuditContainsNoPayloadOrPath()
    {
        Assert.False(Path.GetFullPath(_backupRoot).StartsWith(Path.GetFullPath(_root) + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase));
        var commit = Writer();
        for (var index = 0; index < 11; index++) { var actor = "actor" + index; var draft = ChangedDraft("Name" + index, actor); commit.Commit(draft.DraftId, actor, "commit" + index); }
        Assert.Equal(10, commit.GetBackups("professions").Count);
        var audit = JsonSerializer.Serialize(_drafts.GetAudit()); Assert.DoesNotContain(_root, audit); Assert.DoesNotContain("Name10", audit);
    }

    private GlobalContentDraftDto ChangedDraft(string name, string actor = "actor")
    {
        var draft = _drafts.Create("professions", actor, Guid.NewGuid().ToString("N"));
        var fields = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(JsonSerializer.Serialize(new { profession = name }));
        _drafts.Apply(new(draft.DraftId, draft.Category, GlobalContentDraftCommandType.UpdateEntry, "p1", fields, false, Guid.NewGuid().ToString("N")), actor);
        _drafts.Validate(draft.DraftId, actor); return draft;
    }
    private GlobalContentCommitService Writer(GlobalContentCommitFaults? faults = null) => new(_catalog, _drafts, _backupRoot, TimeProvider.System, faults);
    public void Dispose() { if (Directory.Exists(_root)) Directory.Delete(_root, true); if (Directory.Exists(_backupRoot)) Directory.Delete(_backupRoot, true); }
}
