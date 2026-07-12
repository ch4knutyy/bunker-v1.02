using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public async Task GetRoomLocalEditorData()
    {
        if (!TryGetDiagnosticsRoom(out var room)) { await RejectDiagnosticsAccess("room_local_editor_data"); return; }
        await SendRoomLocalEditorData(room);
    }

    public async Task PreviewRoomLocalEdit(string category, string? targetPlayerId, string fieldId, string? proposedValue)
    {
        if (!TryGetDiagnosticsRoom(out var room)) { await RejectDiagnosticsAccess("room_local_edit_preview"); return; }
        await Clients.Caller.SendAsync("RoomLocalEditPreviewed", _roomLocalEditor.Preview(room, category, targetPlayerId, fieldId, proposedValue));
    }

    public async Task ApplyRoomLocalEdit(string category, string? targetPlayerId, string fieldId, string? proposedValue, string commandId)
    {
        if (!TryGetDiagnosticsRoom(out var room)) { await RejectDiagnosticsAccess("room_local_edit_apply"); return; }
        var preview = _roomLocalEditor.Preview(room, category, targetPlayerId, fieldId, proposedValue);
        if (!preview.CanApply || string.IsNullOrWhiteSpace(commandId))
        {
            await Clients.Caller.SendAsync("ReceiveError", preview.Warning ?? "Edit blocked");
            return;
        }
        bool isNewCommand;
        lock (room.ProcessedRoomEditorCommandIds) isNewCommand = room.ProcessedRoomEditorCommandIds.Add(commandId);
        if (!isNewCommand) { await SendRoomLocalEditorData(room); return; }

        var actor = GetGmActorId(room);
        _logger.LogInformation("Applying room-local edit {FieldId} in room {RoomId}", fieldId, room.Id);
        var snapshot = CreateMutationSnapshot(room, actor, "room_local_edit", commandId, $"Before room-local edit: {preview.FieldId}");
        var result = _roomLocalEditor.Apply(room, category, targetPlayerId, fieldId, proposedValue);
        if (!result.Success || !result.Changed)
        {
            await Clients.Caller.SendAsync("ReceiveError", result.ErrorCode ?? "Edit blocked");
            return;
        }
        var integrity = _roomIntegrity.Check(room, "en");
        if (integrity.ErrorCount > 0)
        {
            _roomSnapshots.RestoreSnapshot(room, snapshot.SnapshotId, actor, commandId + "-editor-rollback");
            await AppendGmAudit(room, actor, "room_local_edit", GmAuditResult.Failed,
                $"Room-local edit failed integrity validation for {preview.FieldId}.", targetPlayerId, commandId, "integrity_failed");
            await Clients.Caller.SendAsync("ReceiveError", "Edit failed integrity validation");
            return;
        }

        await AppendGmAudit(room, actor, "room_local_edit", GmAuditResult.Success,
            $"Public room-local field {preview.FieldId} was edited.", targetPlayerId, commandId, snapshot: snapshot);
        await BroadcastRoomLocalEdit(room, preview.Category, targetPlayerId, preview.FieldId);
        await SendDiagnostics(room, null);
        await SendRoomLocalEditorData(room);
        await Clients.Caller.SendAsync("GMActionSuccess", new { action = "room_local_edit", fieldId = preview.FieldId });
        _logger.LogInformation("Applied room-local edit {FieldId} in room {RoomId}", fieldId, room.Id);
    }

    public async Task ResetRoomLocalField(string category, string? targetPlayerId, string fieldId, string commandId)
    {
        if (!TryGetDiagnosticsRoom(out _)) { await RejectDiagnosticsAccess("room_local_edit_reset"); return; }
        await Clients.Caller.SendAsync("ReceiveError", "reset_unavailable_use_snapshot");
    }

    private Task SendRoomLocalEditorData(Room room) =>
        Clients.Caller.SendAsync("RoomLocalEditorUpdated", _roomLocalEditor.GetSafeData(room));

    private async Task BroadcastRoomLocalEdit(Room room, string category, string? targetPlayerId, string fieldId)
    {
        if (category == RoomLocalEditorCategories.Bunker && room.Bunker != null)
            await Clients.Group(room.Id).SendAsync("BunkerChanged", new { bunker = room.Bunker.ToClientInfo() });
        else if (category == RoomLocalEditorCategories.Apocalypse && room.Apocalypse != null)
            await Clients.Group(room.Id).SendAsync("ApocalypseChanged", new { apocalypse = room.Apocalypse.ToClientInfo() });
        else if (category == RoomLocalEditorCategories.Player && !string.IsNullOrWhiteSpace(targetPlayerId) &&
                 _roomService.TryResolvePlayer(room, targetPlayerId, out var connectionId, out var player))
        {
            await SendPersonalPlayerSnapshot(connectionId, player, "room_local_edit");
            await Clients.Group(room.Id).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));
            await SendPlayerHostControlData(room);
            var characteristic = fieldId switch
            {
                "player_profession" => "Profession", "player_physical_health" => "PhysicalHealth",
                "player_mental_health" => "MentalHealth", "player_hobby" => "Hobby",
                "player_character_trait" => "CharacterTrait", "player_phobia" => "Phobia", "player_fact" => "Fact", _ => null
            };
            if (characteristic != null)
                await Clients.Group(room.Id).SendAsync("CharacteristicUpdated", new
                {
                    connectionId, playerName = player.Name, characteristicKey = characteristic,
                    data = GetRevealedDataForCharacteristic(player, characteristic)
                });
        }
    }
}
