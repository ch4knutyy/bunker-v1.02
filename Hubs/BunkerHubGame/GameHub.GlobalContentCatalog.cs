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

    private void DemandGlobalContentAccess()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !IsCallerHost() ||
            !GmCapabilities.Allows(room.GmMode, GmCapability.ManageGlobalContent) ||
            !_globalContentAccess.CanAccess(room.GmMode))
            throw new HubException("global_content_access_denied");
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
