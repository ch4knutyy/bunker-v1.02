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
            var preview = _roomIntegrity.PreviewAutoFix(room, language);
            var snapshot = preview.HasChanges ? CreateMutationSnapshot(room, actorId, "room_auto_fix", commandId, "Before safe room auto-fix") : null;
            var fixedCount = _roomIntegrity.ApplySafeFixes(room);
            await AppendGmAudit(room, actorId, "room_auto_fix", GmAuditResult.Success,
                $"Applied {fixedCount} safe room integrity fix(es).", null, commandId, snapshot: snapshot);
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

    public async Task GetRoomSnapshots()
    {
        if (!TryGetDiagnosticsRoom(out var room)) { await RejectDiagnosticsAccess("snapshot_list"); return; }
        await SendRoomSnapshots(room, Clients.Caller);
    }

    public async Task CreateManualRoomSnapshot(string? reason, string? commandId)
    {
        if (!TryGetDiagnosticsRoom(out var room)) { await RejectDiagnosticsAccess("snapshot_create"); return; }
        if (string.IsNullOrWhiteSpace(commandId)) { await Clients.Caller.SendAsync("ReceiveError", "Некоректний command id"); return; }
        if (!_roomSnapshots.TryRememberManualCommand(room, commandId)) { await SendRoomSnapshots(room, Clients.Caller); return; }
        var actor = GetGmActorId(room);
        var snapshot = _roomSnapshots.CreateSnapshot(room, actor, reason ?? "Manual checkpoint", "manual_snapshot", commandId);
        await AppendGmAudit(room, actor, "snapshot_created", GmAuditResult.Success,
            "Manual room checkpoint was created.", commandId: commandId, snapshot: snapshot, allowUndo: false);
        await SendRoomSnapshots(room, Clients.Caller);
        await Clients.Caller.SendAsync("GMActionSuccess", new { action = "snapshot_created", snapshotId = snapshot.SnapshotId });
    }

    public async Task PreviewRoomSnapshotRestore(string snapshotId)
    {
        if (!TryGetDiagnosticsRoom(out var room)) { await RejectDiagnosticsAccess("snapshot_preview"); return; }
        await Clients.Caller.SendAsync("RoomSnapshotRestorePreviewed", _roomSnapshots.PreviewRestore(room, snapshotId));
    }

    public async Task RestoreRoomSnapshot(string snapshotId, string commandId, bool confirmed, bool activeGameConfirmed = false)
    {
        if (!TryGetDiagnosticsRoom(out var room)) { await RejectDiagnosticsAccess("snapshot_restore"); return; }
        if (!confirmed || string.IsNullOrWhiteSpace(commandId) || (room.State == RoomState.Playing && !activeGameConfirmed))
        {
            await Clients.Caller.SendAsync("ReceiveError", "Потрібне підтвердження restore");
            return;
        }
        var actor = GetGmActorId(room);
        var result = _roomSnapshots.RestoreSnapshot(room, snapshotId, actor, commandId);
        if (result.IsDuplicate) { await SendPostRestoreState(room); return; }
        if (!result.Success)
        {
            await AppendGmAudit(room, actor, "snapshot_restore", GmAuditResult.Failed,
                "Room snapshot restore failed.", commandId: commandId, errorCode: result.ErrorCode);
            await Clients.Caller.SendAsync("ReceiveError", result.Message ?? result.ErrorCode ?? "Restore failed");
            await SendRoomSnapshots(room, Clients.Caller);
            return;
        }
        var audit = _gmAudit.Append(room, actor, "snapshot_restored", GmAuditResult.Success,
            "Room snapshot was restored.", commandId: commandId, relatedSnapshotId: result.SafetySnapshotId, canUndo: true);
        await SendPostRestoreState(room);
        await Clients.Caller.SendAsync("GMActionSuccess", new { action = "snapshot_restored", snapshotId, auditId = audit.Id });
    }

    public async Task UndoLastGmAction(string commandId)
    {
        if (!TryGetDiagnosticsRoom(out var room)) { await RejectDiagnosticsAccess("gm_action_undo"); return; }
        if (string.IsNullOrWhiteSpace(commandId)) { await Clients.Caller.SendAsync("ReceiveError", "Некоректний command id"); return; }
        var actor = GetGmActorId(room);
        var result = _roomSnapshots.UndoLastGmAction(room, actor, commandId, out var original);
        if (result.IsDuplicate) { await SendPostRestoreState(room); return; }
        if (!result.Success || original == null)
        {
            await Clients.Caller.SendAsync("ReceiveError", result.Message ?? result.ErrorCode ?? "Undo unavailable");
            return;
        }
        var undoEntry = _gmAudit.Append(room, actor, "gm_action_undone", GmAuditResult.Success,
            "Last GM action was undone.", commandId: commandId, relatedSnapshotId: result.SafetySnapshotId, canUndo: true);
        _gmAudit.MarkUndone(room, original.Id, undoEntry.Id);
        await SendPostRestoreState(room);
        await Clients.Caller.SendAsync("GMActionSuccess", new { action = "gm_action_undone", originalAuditId = original.Id });
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
        string summary, string? targetPlayerId = null, string? commandId = null, string? errorCode = null,
        RoomSnapshot? snapshot = null, bool allowUndo = true)
    {
        var canUndo = snapshot != null && allowUndo && _roomSnapshots.IsRestorable(room, snapshot.SnapshotId);
        _gmAudit.Append(room, actorPlayerId, actionType, result, summary, targetPlayerId, commandId, errorCode,
            snapshot?.SnapshotId, canUndo);
        if (!string.IsNullOrWhiteSpace(room.HostConnectionId))
            await SendGmAuditLog(room, Clients.Client(room.HostConnectionId));
        if (!string.IsNullOrWhiteSpace(room.HostConnectionId) && snapshot != null)
            await SendRoomSnapshots(room, Clients.Client(room.HostConnectionId));
    }

    private RoomSnapshot CreateMutationSnapshot(Room room, string actorPlayerId, string actionType, string? commandId, string reason) =>
        _roomSnapshots.CreateSnapshot(room, actorPlayerId, reason, actionType, commandId);

    private Task SendGmAuditLog(Room room, IClientProxy client)
    {
        _roomSnapshots.ReconcileAuditUndoAvailability(room);
        return client.SendAsync("GmAuditLogUpdated", new
        {
            entries = _gmAudit.GetRecent(room, 50),
            serverTimestampUtc = DateTimeOffset.UtcNow
        });
    }

    private Task SendDiagnostics(Room room, string? language) =>
        Clients.Caller.SendAsync("RoomDiagnosticsUpdated", _roomIntegrity.Check(room, language));

    private Task SendRoomSnapshots(Room room, IClientProxy client) => client.SendAsync("RoomSnapshotsUpdated", new
    {
        snapshots = _roomSnapshots.GetSafeSnapshotList(room),
        serverTimestampUtc = DateTimeOffset.UtcNow
    });

    private async Task SendSafeRoomResync(Room room)
    {
        foreach (var entry in RoomService.GetPlayersSnapshot(room))
        {
            var connectionId = string.IsNullOrWhiteSpace(entry.Value.ConnectionId) ? entry.Key : entry.Value.ConnectionId;
            await SendPersonalPlayerSnapshot(connectionId, entry.Value, "room_snapshot_restored");
        }
        await Clients.Group(room.Id).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));
        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", BuildRoundState(room));
        await SendVotingAdminState(Clients.Client(room.HostConnectionId), room);
        await SendPlayerHostControlData(room);
        if (room.Bunker != null) await BroadcastBunkerIntelProjection(room);
        if (room.Apocalypse != null) await Clients.Group(room.Id).SendAsync("ApocalypseChanged", new { apocalypse = room.Apocalypse.ToClientInfo() });
        await BroadcastOmniscientStateToAuthorizedSpectators(room);
    }

    private async Task SendPostRestoreState(Room room)
    {
        await SendSafeRoomResync(room);
        await SendDiagnostics(room, null);
        await SendGmAuditLog(room, Clients.Client(room.HostConnectionId));
        await SendRoomSnapshots(room, Clients.Client(room.HostConnectionId));
    }
}
