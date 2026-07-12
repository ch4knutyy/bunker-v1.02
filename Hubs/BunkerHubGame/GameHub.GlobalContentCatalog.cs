using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public Task<GlobalContentAccessDto> EnableDevelopmentGlobalContentCatalog(string bootstrapKey)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !IsCallerHost() || !_globalContentAccess.ValidateDevelopmentBootstrap(bootstrapKey))
            throw new HubException("global_content_bootstrap_denied");
        room.GmMode = GmMode.TechnicalGm;
        _logger.LogWarning("Development global content catalog capability enabled for room {RoomId}", room.Id);
        return Task.FromResult(_globalContentAccess.GetAccess(room.GmMode));
    }

    public Task<GlobalContentAccessDto> GetGlobalContentCatalogAccess()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !IsCallerHost())
            return Task.FromResult(new GlobalContentAccessDto(false, false, false, "host_required"));
        return Task.FromResult(_globalContentAccess.GetAccess(room.GmMode));
    }

    public Task<IReadOnlyList<GlobalContentMetadataDto>> GetGlobalContentCategories()
    {
        DemandGlobalContentAccess();
        ConsumeGlobalContentRead();
        return Task.FromResult<IReadOnlyList<GlobalContentMetadataDto>>(
            _globalContentCatalog.GetCategories().Select(_globalContentCatalog.GetMetadata).ToList());
    }

    public Task<GlobalContentPageDto> GetGlobalContentEntries(string category, int page, int pageSize, string? search)
    {
        DemandGlobalContentAccess();
        ConsumeGlobalContentRead();
        return Task.FromResult(SafeRequest(() => _globalContentCatalog.GetEntries(category, page, pageSize, search)));
    }

    public Task<GlobalContentEntryDto> GetGlobalContentEntry(string category, string stableId)
    {
        DemandGlobalContentAccess();
        ConsumeGlobalContentRead();
        return Task.FromResult(SafeRequest(() => _globalContentCatalog.GetEntry(category, stableId)));
    }

    public Task<IReadOnlyList<GlobalContentDraftDto>> GetGlobalContentDrafts()
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentRead();
        return Task.FromResult(_globalContentDrafts.GetDrafts(GetGmActorId(room)));
    }

    public Task<GlobalContentDraftDto> GetGlobalContentDraft(string draftId)
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentRead();
        return Task.FromResult(SafeRequest(() => _globalContentDrafts.GetDraft(draftId, GetGmActorId(room))));
    }

    public Task<GlobalContentDraftDto> CreateGlobalContentDraft(string category, string commandId)
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentMutation(GetGmActorId(room));
        return Task.FromResult(SafeRequest(() => _globalContentDrafts.Create(category, GetGmActorId(room), commandId)));
    }

    public Task<GlobalContentDraftDto> ApplyGlobalContentDraftCommand(GlobalContentDraftCommandDto command)
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentMutation(GetGmActorId(room));
        return Task.FromResult(SafeRequest(() => _globalContentDrafts.Apply(command, GetGmActorId(room))));
    }

    public Task<GlobalContentDraftValidationDto> ValidateGlobalContentDraft(string draftId)
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentMutation(GetGmActorId(room));
        return Task.FromResult(SafeRequest(() => _globalContentDrafts.Validate(draftId, GetGmActorId(room))));
    }

    public Task<GlobalContentDraftDiffDto> PreviewGlobalContentDraftDiff(string draftId, int page = 1, int pageSize = 100)
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentRead();
        return Task.FromResult(SafeRequest(() => _globalContentDrafts.Preview(draftId, GetGmActorId(room), page, pageSize)));
    }

    public Task<GlobalContentDraftDto> DiscardGlobalContentDraft(string draftId, string commandId)
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentMutation(GetGmActorId(room));
        if (string.IsNullOrWhiteSpace(commandId)) throw new HubException("invalid_command_id");
        return Task.FromResult(SafeRequest(() => _globalContentDrafts.Discard(draftId, GetGmActorId(room))));
    }

    public Task<IReadOnlyList<GlobalContentDraftAuditDto>> GetGlobalContentDraftAudit()
    {
        DemandGlobalContentAccess(); ConsumeGlobalContentRead();
        return Task.FromResult(_globalContentDrafts.GetAudit());
    }

    public Task<GlobalContentCommitResultDto> CommitGlobalContentDraft(string draftId, string commandId)
    {
        var room = DemandGlobalContentAccess(); var actor = GetGmActorId(room); ConsumeGlobalContentMutation(actor);
        return Task.FromResult(SafeRequest(() => _globalContentCommits.Commit(draftId, actor, commandId)));
    }

    public Task<IReadOnlyList<GlobalContentBackupDto>> GetGlobalContentBackups(string category)
    {
        DemandGlobalContentAccess(); ConsumeGlobalContentRead();
        return Task.FromResult(_globalContentCommits.GetBackups(category));
    }

    public Task<GlobalContentRollbackPreviewDto> PreviewGlobalContentRollback(string category, string backupId)
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentRead();
        return Task.FromResult(SafeRequest(() => _globalContentCommits.PreviewRollback(category, backupId, GetGmActorId(room))));
    }

    public Task<GlobalContentCommitResultDto> RollbackGlobalContent(string category, string backupId, string previewToken, bool confirmation, string commandId)
    {
        var room = DemandGlobalContentAccess(); var actor = GetGmActorId(room); ConsumeGlobalContentMutation(actor);
        return Task.FromResult(SafeRequest(() => _globalContentCommits.Rollback(category, backupId, previewToken, confirmation, actor, commandId)));
    }

    public Task<StableIdMigrationPreviewDto> PreviewStableIdMigration(string category, int page = 1, int pageSize = 100)
    {
        var room = DemandGlobalContentAccess(); ConsumeGlobalContentRead();
        return Task.FromResult(SafeRequest(() => _stableIdMigrations.Preview(category, GetGmActorId(room), page, pageSize)));
    }

    public Task<StableIdMigrationResultDto> ApplyStableIdMigration(string category, string previewToken, bool confirmation, string commandId)
    {
        var room = DemandGlobalContentAccess(); var actor = GetGmActorId(room); ConsumeGlobalContentMutation(actor);
        return Task.FromResult(SafeRequest(() => _stableIdMigrations.Apply(category, previewToken, confirmation, actor, commandId)));
    }

    private Room DemandGlobalContentAccess()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !IsCallerHost() ||
            !GmCapabilities.Allows(room.GmMode, GmCapability.ManageGlobalContent) ||
            !_globalContentAccess.CanAccess(room.GmMode))
            throw new HubException("global_content_access_denied");
        return room;
    }

    private void ConsumeGlobalContentMutation(string actor)
    {
        if (!_globalContentDrafts.TryConsumeMutation(actor)) throw new HubException("global_content_mutation_rate_limited");
    }

    private void ConsumeGlobalContentRead()
    {
        if (!_globalContentCatalog.TryConsumeRead(Context.ConnectionId))
            throw new HubException("global_content_rate_limited");
    }

    private static T SafeRequest<T>(Func<T> request)
    {
        try { return request(); }
        catch (GlobalContentRequestException exception) { throw new HubException(exception.Code); }
    }
}
