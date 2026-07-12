using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public Task<OmniscientGmPreviewDto> PreviewEnterOmniscientGm(string bootstrapKey)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        var player = _roomService.GetPlayer(Context.ConnectionId);
        if (room == null || player == null || !room.IsHost(player) || !_omniscientAccess.CanEnter(room.GmMode, bootstrapKey))
            throw new HubException("omniscient_access_denied");
        return Task.FromResult(_omniscientRoles.Preview(room, player));
    }

    public async Task EnterOmniscientGm(string bootstrapKey, string commandId, bool confirmation)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        var player = _roomService.GetPlayer(Context.ConnectionId);
        if (room == null || player == null || !room.IsHost(player) || !_omniscientAccess.CanEnter(room.GmMode, bootstrapKey))
            throw new HubException("omniscient_access_denied");
        if (!confirmation) throw new HubException("omniscient_confirmation_required");
        if (string.IsNullOrWhiteSpace(commandId)) throw new HubException("invalid_command_id");
        lock (room.ProcessedOmniscientCommandIds) if (!room.ProcessedOmniscientCommandIds.Add(commandId)) return;
        if (player.IsSpectatorGm) { await SendOmniscientState(room, player); return; }

        CreateMutationSnapshot(room, RoomService.GetPlayerKey(player), "enter_omniscient_gm", commandId, "Before entering spectator GM mode");
        var preview = _omniscientRoles.Preview(room, player);
        var state = _omniscientRoles.Enter(room, player);
        await AppendGmAudit(room, RoomService.GetPlayerKey(player), "enter_omniscient_gm", GmAuditResult.Success,
            $"Spectator GM enabled; vote:{preview.WillRemoveVote}; readiness:{preview.WillRemoveReadiness}; threat:{preview.WillRemoveThreatParticipation}.",
            RoomService.GetPlayerKey(player), commandId, allowUndo: false);
        await Clients.Group(room.Id).SendAsync("OmniscientGmStateUpdated", state);
        await SendPublicPlayersUpdate(room);
        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", BuildRoundState(room));
        await SendPlayerHostControlData(room);
    }

    public Task<OmniscientGmStateDto> GetOmniscientGmState()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        var spectator = room == null ? null : RoomService.GetPlayersSnapshot(room).Select(x => x.Value).FirstOrDefault(x => x.IsSpectatorGm);
        if (room == null || spectator == null) throw new HubException("spectator_gm_not_found");
        return Task.FromResult(OmniscientGmRoleService.PublicState(room, spectator));
    }

    private Task SendOmniscientState(Room room, Player player) =>
        Clients.Caller.SendAsync("OmniscientGmStateUpdated", OmniscientGmRoleService.PublicState(room, player));
}
