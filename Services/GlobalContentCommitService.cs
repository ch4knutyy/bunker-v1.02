using System.Collections.Concurrent;
using System.Text.Json.Nodes;
using System.Text;
using System.Text.Json;
using Bunker.Models;

namespace Bunker.Services;

public sealed class GlobalContentCommitService
{
    public const int MaximumBackupsPerCategory = 10;
    private static readonly ConcurrentDictionary<string, object> CategoryLocks = new(StringComparer.OrdinalIgnoreCase);
    private readonly GlobalContentCatalogService _catalog;
    private readonly GlobalContentDraftService _drafts;
    private readonly TimeProvider _time;
    private readonly string _backupRoot;
    private readonly Dictionary<string, List<BackupState>> _backups = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, long> _versions = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, GlobalContentCommitResultDto> _commands = new(StringComparer.Ordinal);
    private readonly Dictionary<string, RollbackPreviewState> _rollbackPreviews = new(StringComparer.Ordinal);
    private readonly Dictionary<string, GlobalContentCommitResultDto> _migrationCommands = new(StringComparer.Ordinal);
    private readonly GlobalContentCommitFaults _faults;

    private sealed record BackupState(GlobalContentBackupDto Metadata, string InternalFile);
    private sealed record RollbackPreviewState(GlobalContentRollbackPreviewDto Preview, string ActorId);

    public GlobalContentCommitService(IHostEnvironment environment, GlobalContentCatalogService catalog, GlobalContentDraftService drafts, TimeProvider time)
        : this(catalog, drafts, Path.Combine(environment.ContentRootPath, ".global-content-backups"), time) { }
    public GlobalContentCommitService(GlobalContentCatalogService catalog, GlobalContentDraftService drafts, string backupRoot, TimeProvider? time = null, GlobalContentCommitFaults? faults = null)
    { _catalog = catalog; _drafts = drafts; _backupRoot = Path.GetFullPath(backupRoot); _time = time ?? TimeProvider.System; _faults = faults ?? new(); }

    public GlobalContentCommitResultDto Commit(string draftId, string actor, string commandId)
    {
        ValidateCommand(commandId);
        lock (_commands) if (_commands.TryGetValue(commandId, out var replay)) return replay;
        var package = _drafts.PrepareCommit(draftId, actor); var category = package.Draft.Category;
        lock (CategoryLocks.GetOrAdd(category, _ => new object()))
        {
            var current = _catalog.GetMetadata(category);
            if (current.Fingerprint != package.Draft.BaseFingerprint || current.FileVersion != package.Draft.BaseVersion) throw Reject("base_content_changed");
            if (package.Diff.Count == 0)
            {
                var noChanges = new GlobalContentCommitResultDto(true, "no_changes", draftId, category, CurrentVersion(category), CurrentVersion(category), Short(current.Fingerprint), Short(current.Fingerprint), "", 0, 0, 0, "restart_required");
                lock (_commands) _commands[commandId] = noChanges; return noChanges;
            }
            var bytes = _catalog.BuildCanonicalBytes(category, package.Entries);
            var preValidation = _catalog.ValidateCanonicalBytes(category, bytes);
            if (!preValidation.IsValid) throw Reject("serialized_content_invalid");
            var oldVersion = CurrentVersion(category); var canonical = _catalog.GetCanonicalPath(category);
            var oldBytes = _catalog.ReadCanonicalBytes(category);
            var backup = CreateBackup(category, oldVersion, current.Fingerprint, oldBytes, actor, "before_commit", draftId);
            var temp = TempPath(canonical);
            try
            {
                WriteAndFlush(temp, bytes);
                if (_faults.FailBeforeReplace) throw new IOException("injected_before_replace");
                var tempValidation = _catalog.ValidateCanonicalBytes(category, File.ReadAllBytes(temp));
                if (!tempValidation.IsValid) throw new InvalidDataException("temp_validation_failed");
                AtomicReplace(temp, canonical);
                if (_faults.CorruptAfterReplace) File.WriteAllText(canonical, "invalid");
                var post = _catalog.ValidateCanonicalBytes(category, _catalog.ReadCanonicalBytes(category));
                if (!post.IsValid || post.EntryCount != preValidation.EntryCount || post.Fingerprint != preValidation.Fingerprint)
                {
                    RestoreBackupAtomic(category, backup);
                    _drafts.RecordExternalAudit("automatic_rollback", draftId, category, actor, "post_write_validation_failed");
                    throw new GlobalContentRequestException("post_write_validation_failed_rolled_back");
                }
                var newVersion = NextVersion(category); _drafts.MarkCommitted(draftId, actor, newVersion, post.Fingerprint);
                var result = new GlobalContentCommitResultDto(true, "committed", draftId, category, oldVersion, newVersion, Short(current.Fingerprint), Short(post.Fingerprint), backup.Metadata.BackupId,
                    package.Diff.Count(x => x.ChangeType == "added"), package.Diff.Count(x => x.ChangeType == "updated"), package.Diff.Count(x => x.ChangeType == "deleted"), "restart_required");
                lock (_commands) _commands[commandId] = result; return result;
            }
            catch (GlobalContentRequestException) { throw; }
            catch
            {
                _drafts.RecordExternalAudit("commit_rejected", draftId, category, actor, "commit_failed");
                throw new GlobalContentRequestException("commit_failed");
            }
            finally { TryDelete(temp); }
        }
        GlobalContentRequestException Reject(string code) { _drafts.RecordExternalAudit(code == "base_content_changed" ? "conflict_detected" : "commit_rejected", draftId, category, actor, code); return new(code); }
    }

    public IReadOnlyList<GlobalContentBackupDto> GetBackups(string category)
    { lock (CategoryLocks.GetOrAdd(category, _ => new object())) return GetStates(category).Select(x => x.Metadata).OrderByDescending(x => x.CreatedAtUtc).ToList(); }

    public GlobalContentRollbackPreviewDto PreviewRollback(string category, string backupId, string actor)
    {
        lock (CategoryLocks.GetOrAdd(category, _ => new object()))
        {
            var backup = FindBackup(category, backupId); var backupBytes = File.ReadAllBytes(backup.InternalFile);
            var valid = _catalog.ValidateCanonicalBytes(category, backupBytes, requireStableIds: false); if (!valid.IsValid) throw new GlobalContentRequestException("backup_invalid");
            var currentBytes = _catalog.ReadCanonicalBytes(category); var current = _catalog.ValidateCanonicalBytes(category, currentBytes, requireStableIds: false);
            var diffs = Diff(_catalog.ExtractCanonicalEntries(category, currentBytes), _catalog.ExtractCanonicalEntries(category, backupBytes));
            var token = Guid.NewGuid().ToString("N");
            var preview = new GlobalContentRollbackPreviewDto(token, category, backupId, CurrentVersion(category), current.Fingerprint, backup.Metadata.SourceVersion, backup.Metadata.SourceFingerprint,
                diffs.Count(x => x.ChangeType == "added"), diffs.Count(x => x.ChangeType == "updated"), diffs.Count(x => x.ChangeType == "deleted"), diffs, "valid", true, false);
            _rollbackPreviews[token] = new(preview, actor); _drafts.RecordExternalAudit("manual_rollback_preview", "", category, actor, "success"); return preview;
        }
    }

    public GlobalContentCommitResultDto Rollback(string category, string backupId, string previewToken, bool confirmation, string actor, string commandId)
    {
        if (!confirmation) throw new GlobalContentRequestException("rollback_confirmation_required"); ValidateCommand(commandId);
        lock (_commands) if (_commands.TryGetValue(commandId, out var replay)) return replay;
        lock (CategoryLocks.GetOrAdd(category, _ => new object()))
        {
            if (!_rollbackPreviews.TryGetValue(previewToken, out var state) || state.ActorId != actor || state.Preview.Category != category || state.Preview.BackupId != backupId) throw new GlobalContentRequestException("rollback_preview_required");
            var currentBytes = _catalog.ReadCanonicalBytes(category); var current = _catalog.ValidateCanonicalBytes(category, currentBytes, requireStableIds: false);
            if (current.Fingerprint != state.Preview.CurrentFingerprint) throw new GlobalContentRequestException("rollback_preview_stale");
            var selected = FindBackup(category, backupId); var selectedBytes = File.ReadAllBytes(selected.InternalFile); var selectedValidation = _catalog.ValidateCanonicalBytes(category, selectedBytes, requireStableIds: false);
            if (!selectedValidation.IsValid || selectedValidation.Fingerprint != selected.Metadata.SourceFingerprint) throw new GlobalContentRequestException("backup_integrity_failed");
            var oldVersion = CurrentVersion(category); var safety = CreateBackup(category, oldVersion, current.Fingerprint, currentBytes, actor, "before_manual_rollback", "");
            try
            {
                RestoreBackupAtomic(category, selected);
                var restored = _catalog.ValidateCanonicalBytes(category, _catalog.ReadCanonicalBytes(category), requireStableIds: false); if (!restored.IsValid || restored.Fingerprint != selectedValidation.Fingerprint) { RestoreBackupAtomic(category, safety); throw new GlobalContentRequestException("rollback_validation_failed_restored"); }
                var version = NextVersion(category); var result = new GlobalContentCommitResultDto(true, "rolled_back", "", category, oldVersion, version, Short(current.Fingerprint), Short(restored.Fingerprint), safety.Metadata.BackupId, state.Preview.AddedCount, state.Preview.UpdatedCount, state.Preview.DeletedCount, "restart_required");
                _drafts.RecordExternalAudit("manual_rollback_succeeded", "", category, actor, "success"); lock (_commands) _commands[commandId] = result; return result;
            }
            catch (GlobalContentRequestException) { _drafts.RecordExternalAudit("manual_rollback_failed", "", category, actor, "failed"); throw; }
        }
    }

    public GlobalContentCommitResultDto CommitStableIdMigration(string category, IReadOnlyList<string> entries, string expectedVersion, string expectedFingerprint, string actor, string migrationId, int generatedCount, int preservedCount, string commandId)
    {
        ValidateCommand(commandId); lock (_migrationCommands) if (_migrationCommands.TryGetValue(commandId, out var replay)) return replay;
        lock (CategoryLocks.GetOrAdd(category, _ => new object()))
        {
            var current = _catalog.GetMetadata(category); if (current.FileVersion != expectedVersion || current.Fingerprint != expectedFingerprint) throw new GlobalContentRequestException("base_content_changed");
            var bytes = _catalog.BuildCanonicalBytes(category, entries); var validation = _catalog.ValidateCanonicalBytes(category, bytes); if (!validation.IsValid) throw new GlobalContentRequestException("migration_content_invalid");
            var canonical = _catalog.GetCanonicalPath(category); var oldBytes = _catalog.ReadCanonicalBytes(category); var oldVersion = CurrentVersion(category);
            var backup = CreateBackup(category, oldVersion, current.Fingerprint, oldBytes, actor, "before_stable_id_migration", migrationId); var temp = TempPath(canonical);
            try
            {
                WriteAndFlush(temp, bytes); if (_faults.FailBeforeReplace) throw new IOException("injected_before_replace");
                var tempValidation = _catalog.ValidateCanonicalBytes(category, File.ReadAllBytes(temp)); if (!tempValidation.IsValid) throw new InvalidDataException("temp_validation_failed");
                AtomicReplace(temp, canonical); if (_faults.CorruptAfterReplace) File.WriteAllText(canonical, "invalid");
                var post = _catalog.ValidateCanonicalBytes(category, _catalog.ReadCanonicalBytes(category));
                if (!post.IsValid || post.EntryCount != validation.EntryCount || post.Fingerprint != validation.Fingerprint) { RestoreBackupAtomic(category, backup); _drafts.RecordExternalAudit("automatic_rollback", migrationId, category, actor, "migration_post_write_validation_failed"); throw new GlobalContentRequestException("post_write_validation_failed_rolled_back"); }
                var version = NextVersion(category); var result = new GlobalContentCommitResultDto(true, "migrated", migrationId, category, oldVersion, version, Short(current.Fingerprint), Short(post.Fingerprint), backup.Metadata.BackupId, generatedCount, preservedCount, 0, "restart_required");
                _drafts.RecordExternalAudit("stable_id_migration_succeeded", migrationId, category, actor, "success"); lock (_migrationCommands) _migrationCommands[commandId] = result; return result;
            }
            catch (GlobalContentRequestException) { throw; }
            catch { _drafts.RecordExternalAudit("stable_id_migration_failed", migrationId, category, actor, "failed"); throw new GlobalContentRequestException("migration_failed"); }
            finally { TryDelete(temp); }
        }
    }

    internal string MigrationMetadataRoot => Path.Combine(_backupRoot, ".migrations");

    private BackupState CreateBackup(string category, long version, string fingerprint, byte[] bytes, string actor, string reason, string draftId)
    {
        Directory.CreateDirectory(_backupRoot); var categoryDir = Path.Combine(_backupRoot, category); Directory.CreateDirectory(categoryDir);
        var list = GetStates(category);
        var id = Guid.NewGuid().ToString("N"); var file = Path.Combine(categoryDir, id + ".backup"); WriteAndFlush(file, bytes);
        var validation = _catalog.ValidateCanonicalBytes(category, bytes); var metadata = new GlobalContentBackupDto(id, category, version, fingerprint, _time.GetUtcNow(), actor, reason, draftId, bytes.LongLength, validation.Status);
        WriteAndFlush(Path.Combine(categoryDir, id + ".meta.json"), Encoding.UTF8.GetBytes(JsonSerializer.Serialize(metadata)));
        var state = new BackupState(metadata, file); list.Add(state);
        foreach (var stale in list.OrderByDescending(x => x.Metadata.CreatedAtUtc).Skip(MaximumBackupsPerCategory).ToList()) { TryDelete(stale.InternalFile); TryDelete(Path.ChangeExtension(stale.InternalFile, ".meta.json")); list.Remove(stale); }
        return state;
    }
    private void RestoreBackupAtomic(string category, BackupState backup) { var canonical = _catalog.GetCanonicalPath(category); var temp = TempPath(canonical); try { WriteAndFlush(temp, File.ReadAllBytes(backup.InternalFile)); var validation = _catalog.ValidateCanonicalBytes(category, File.ReadAllBytes(temp), requireStableIds: false); if (!validation.IsValid) throw new GlobalContentRequestException("backup_invalid"); AtomicReplace(temp, canonical); } finally { TryDelete(temp); } }
    private static void AtomicReplace(string temp, string canonical) => File.Replace(temp, canonical, null, true);
    private static void WriteAndFlush(string path, byte[] bytes) { using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 4096, FileOptions.WriteThrough); stream.Write(bytes); stream.Flush(flushToDisk: true); }
    private static string TempPath(string canonical) => Path.Combine(Path.GetDirectoryName(canonical)!, "." + Path.GetFileName(canonical) + "." + Guid.NewGuid().ToString("N") + ".tmp");
    private List<BackupState> GetStates(string category)
    {
        if (_backups.TryGetValue(category, out var list)) return list;
        list = []; var directory = Path.Combine(_backupRoot, category);
        if (Directory.Exists(directory)) foreach (var metadataFile in Directory.GetFiles(directory, "*.meta.json"))
            try { var metadata = JsonSerializer.Deserialize<GlobalContentBackupDto>(File.ReadAllText(metadataFile)); var backupFile = Path.Combine(directory, metadata!.BackupId + ".backup"); if (File.Exists(backupFile)) list.Add(new(metadata, backupFile)); } catch { }
        return _backups[category] = list;
    }
    private BackupState FindBackup(string category, string id) => GetStates(category).FirstOrDefault(x => x.Metadata.BackupId == id) ?? throw new GlobalContentRequestException("backup_not_found");
    private long CurrentVersion(string category)
    {
        if (_versions.TryGetValue(category, out var cached)) return cached;
        var file = VersionPath(category); long version = 1;
        if (File.Exists(file) && long.TryParse(File.ReadAllText(file), out var stored) && stored > 0) version = stored;
        return _versions[category] = version;
    }
    private long NextVersion(string category)
    {
        var version = CurrentVersion(category) + 1; Directory.CreateDirectory(Path.GetDirectoryName(VersionPath(category))!);
        var target = VersionPath(category); var temp = target + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try { WriteAndFlush(temp, Encoding.UTF8.GetBytes(version.ToString(System.Globalization.CultureInfo.InvariantCulture))); File.Move(temp, target, true); }
        finally { TryDelete(temp); }
        return _versions[category] = version;
    }
    private string VersionPath(string category) => Path.Combine(_backupRoot, ".versions", category + ".version");
    private static string Short(string value) => value.Length <= 12 ? value : value[..12];
    private static void ValidateCommand(string id) { if (string.IsNullOrWhiteSpace(id) || id.Length > 100) throw new GlobalContentRequestException("invalid_command_id"); }
    private static void TryDelete(string path) { try { if (File.Exists(path)) File.Delete(path); } catch { } }
    private static List<GlobalContentDraftDiffEntryDto> Diff(IReadOnlyDictionary<string, JsonObject> current, IReadOnlyDictionary<string, JsonObject> target)
    {
        var result = new List<GlobalContentDraftDiffEntryDto>(); foreach (var id in current.Keys.Union(target.Keys).Order())
            if (!current.ContainsKey(id)) result.Add(new(id, "added", target[id].Select(x => x.Key).Order().ToList()));
            else if (!target.ContainsKey(id)) result.Add(new(id, "deleted", []));
            else if (!JsonNode.DeepEquals(current[id], target[id])) result.Add(new(id, "updated", current[id].Select(x => x.Key).Union(target[id].Select(x => x.Key)).Where(x => !JsonNode.DeepEquals(current[id][x], target[id][x])).Order().ToList()));
        return result;
    }
}

public sealed class GlobalContentCommitFaults { public bool FailBeforeReplace { get; set; } public bool CorruptAfterReplace { get; set; } }
