using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public async Task RunRoomIntegrityCheck(string? language = null)
    {
        if (!TryGetDiagnosticsRoom(out var room))
        {
            await RejectDiagnosticsAccess("diagnostics_check");
            return;
        }
        await SendDiagnostics(room, language);
    }

    public async Task PreviewRoomAutoFix(string? language = null)
    {
        if (!TryGetDiagnosticsRoom(out var room))
        {
            await RejectDiagnosticsAccess("diagnostics_preview");
            return;
        }
        await Clients.Caller.SendAsync("RoomAutoFixPreviewed", _roomIntegrity.PreviewAutoFix(room, language));
    }

    public async Task ApplyRoomAutoFix(string? commandId, bool confirmed, string? language = null)
    {
        if (!TryGetDiagnosticsRoom(out var room))
        {
            await RejectDiagnosticsAccess("diagnostics_apply");
            return;
        }
        var actorId = GetGmActorId(room);
        if (!confirmed || string.IsNullOrWhiteSpace(commandId))
        {
            await AppendGmAudit(room, actorId, "room_auto_fix", GmAuditResult.Rejected,
                "Safe room repair was rejected: confirmation or command ID is missing.", null, commandId, "confirmation_required");
            await Clients.Caller.SendAsync("ReceiveError", "Потрібне підтвердження та command id");
            return;
        }

        bool isNewCommand;
        lock (room.ProcessedRoomIntegrityCommandIds)
            isNewCommand = room.ProcessedRoomIntegrityCommandIds.Add(commandId);
        if (!isNewCommand)
        {
            await SendDiagnostics(room, language);
            await SendGmAuditLog(room, Clients.Caller);
            return;
        }

        try
        {
            var fixedCount = _roomIntegrity.ApplySafeFixes(room);
            await AppendGmAudit(room, actorId, "room_auto_fix", GmAuditResult.Success,
                $"Applied {fixedCount} safe room integrity fix(es).", null, commandId);
            await SendSafeRoomResync(room);
            await SendDiagnostics(room, language);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "room_auto_fix", fixedCount });
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Safe room auto-fix failed for room {RoomId}", room.Id);
            await AppendGmAudit(room, actorId, "room_auto_fix", GmAuditResult.Failed,
                "Safe room integrity repair failed.", null, commandId, "auto_fix_failed");
            await Clients.Caller.SendAsync("ReceiveError", "Безпечне виправлення не виконано");
            await SendDiagnostics(room, language);
        }
    }

    public async Task GetGmAuditLog()
    {
        if (!TryGetDiagnosticsRoom(out var room))
        {
            await RejectDiagnosticsAccess("audit_refresh");
            return;
        }
        await SendGmAuditLog(room, Clients.Caller);
    }

    private bool TryGetDiagnosticsRoom(out Room room)
    {
        room = _roomService.GetPlayerRoom(Context.ConnectionId)!;
        return room != null && _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var caller) &&
            room.IsHost(caller) && GmCapabilities.Allows(room.GmMode, GmCapability.ManagePublicGameState);
    }

    private async Task RejectDiagnosticsAccess(string actionType)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room != null && _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var caller))
            await AppendGmAudit(room, GetSafeAuditPlayerId(caller), actionType, GmAuditResult.Rejected,
                "GM diagnostics access was rejected.", errorCode: "not_authorized");
        await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для діагностики кімнати");
    }

    private string GetGmActorId(Room room) =>
        _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var actor)
            ? GetSafeAuditPlayerId(actor) : "unknown";

    private static string GetSafeAuditPlayerId(Player player) =>
        !string.IsNullOrWhiteSpace(player.StablePlayerId) ? player.StablePlayerId : player.Id.ToString("N");

    private async Task AppendGmAudit(Room room, string actorPlayerId, string actionType, GmAuditResult result,
        string summary, string? targetPlayerId = null, string? commandId = null, string? errorCode = null)
    {
        _gmAudit.Append(room, actorPlayerId, actionType, result, summary, targetPlayerId, commandId, errorCode);
        if (!string.IsNullOrWhiteSpace(room.HostConnectionId))
            await SendGmAuditLog(room, Clients.Client(room.HostConnectionId));
    }

    private Task SendGmAuditLog(Room room, IClientProxy client) =>
        client.SendAsync("GmAuditLogUpdated", new
        {
            entries = _gmAudit.GetRecent(room, 50),
            serverTimestampUtc = DateTimeOffset.UtcNow
        });

    private Task SendDiagnostics(Room room, string? language) =>
        Clients.Caller.SendAsync("RoomDiagnosticsUpdated", _roomIntegrity.Check(room, language));

    private async Task SendSafeRoomResync(Room room)
    {
        await Clients.Group(room.Id).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));
        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", BuildRoundState(room));
        await SendVotingAdminState(Clients.Client(room.HostConnectionId), room);
        await SendPlayerHostControlData(room);
    }
}
