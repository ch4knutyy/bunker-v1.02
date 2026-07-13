using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    public Task<LobbyStateDto> GetLobbyState()
    {
        var room = RequireLobbyMember(); return Task.FromResult(_lobbyStart.GetState(room));
    }

    public Task<LobbyParticipationPreviewDto> PreviewSetLobbyParticipation(string targetPlayerId, LobbyParticipationRole role)
    {
        var room = RequireLobbyHost(); var target = ResolveStableLobbyTarget(room, targetPlayerId);
        var blockers = ParticipationBlockers(room, target, role);
        return Task.FromResult(new LobbyParticipationPreviewDto(targetPlayerId, target?.Name ?? "Unknown", target?.IsLobbySpectator == true ? "Spectator" : "Player",
            role.ToString(), target?.IsLobbyReady == true, blockers.Count == 0, blockers));
    }

    public async Task SetLobbyParticipation(string targetPlayerId, LobbyParticipationRole role, bool confirmation, string commandId)
    {
        var room = RequireLobbyHost(); var target = ResolveStableLobbyTarget(room, targetPlayerId);
        var blockers = ParticipationBlockers(room, target, role);
        if (!confirmation || blockers.Count > 0) throw new HubException(blockers.FirstOrDefault() ?? "confirmation_required");
        if (!RememberLobbyCommand(room, commandId)) { await BroadcastLobbyState(room); return; }
        var spectator = role == LobbyParticipationRole.Spectator;
        if (target!.IsLobbySpectator != spectator)
        {
            target.IsLobbySpectator = spectator; target.IsLobbyReady = false;
            if (spectator) _roomService.RemoveGameplayParticipation(room, target);
            await AppendGmAudit(room, GetGmActorId(room), "lobby_role_changed", GmAuditResult.Success,
                $"Lobby participation changed to {role}.", RoomService.GetPlayerKey(target), commandId, allowUndo: false);
        }
        await BroadcastLobbyState(room); await SendPublicPlayersUpdate(room);
    }

    public async Task SetLobbyReady(bool isReady, string commandId)
    {
        var room = RequireLobbyMember();
        if (room.State != RoomState.Lobby) throw new HubException("lobby_closed");
        if (!RememberLobbyCommand(room, commandId)) { await BroadcastLobbyState(room); return; }
        var player = _roomService.GetPlayer(Context.ConnectionId)!;
        if (player.IsLobbyReady != isReady)
        {
            player.IsLobbyReady = isReady;
            await AppendGmAudit(room, RoomService.GetPlayerKey(player), "lobby_readiness_changed", GmAuditResult.Success,
                isReady ? "Lobby member is ready." : "Lobby member is not ready.", commandId: commandId, allowUndo: false);
        }
        await BroadcastLobbyState(room);
    }

    public Task<LobbyStartPreviewDto> PreviewStartGameFromLobby()
    {
        var room = RequireLobbyHost(); var host = _roomService.GetPlayer(Context.ConnectionId)!;
        return Task.FromResult(_lobbyStart.Preview(room, host));
    }

    public async Task StartGameFromLobby(string previewToken, bool confirmation, string commandId)
    {
        var room = RequireLobbyHost(); var host = _roomService.GetPlayer(Context.ConnectionId)!;
        if (!confirmation || string.IsNullOrWhiteSpace(commandId)) throw new HubException("lobby_start_confirmation_required");
        lock (room.ProcessedLobbyCommandIds) if (room.ProcessedLobbyCommandIds.Contains(commandId)) { return; }
        if (!_lobbyStart.TryConsume(room, host, previewToken, out var error)) throw new HubException(error ?? "lobby_start_blocked");
        lock (room.ProcessedLobbyCommandIds) if (!room.ProcessedLobbyCommandIds.Add(commandId)) return;
        PrepareLobbyGameplayCharacters(room);
        var result = _roomService.StartGame(room.Id, Context.ConnectionId);
        if (!result.success) throw new HubException(result.error ?? "lobby_start_failed");
        foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value)) player.IsLobbyReady = false;
        await CompleteLobbyStart(room);
        await AppendGmAudit(room, RoomService.GetPlayerKey(host), "game_started_from_lobby", GmAuditResult.Success,
            "Game started after lobby validation.", commandId: commandId, allowUndo: false);
    }

    private Room RequireLobbyMember()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out _)) throw new HubException("lobby_membership_required");
        return room;
    }
    private Room RequireLobbyHost()
    {
        var room = RequireLobbyMember(); var player = _roomService.GetPlayer(Context.ConnectionId);
        if (player == null || !room.IsHost(player)) throw new HubException("lobby_host_required"); return room;
    }
    private Player? ResolveStableLobbyTarget(Room room, string id)
    {
        var player = _roomService.GetPlayerByAnyId(room, id); return player != null && player.StablePlayerId == id ? player : null;
    }
    private static List<string> ParticipationBlockers(Room room, Player? target, LobbyParticipationRole role)
    {
        var blockers = new List<string>();
        if (!Enum.IsDefined(role)) blockers.Add("invalid_lobby_role");
        if (room.State != RoomState.Lobby) blockers.Add("lobby_closed");
        if (target == null) blockers.Add("target_not_found");
        else if (target.IsSpectatorGm || target.GmRole == GmMode.OmniscientGm) blockers.Add("omniscient_role_irreversible");
        else if (role == LobbyParticipationRole.Player && room.IrreversibleOmniscientPlayerIds.Contains(RoomService.GetPlayerKey(target))) blockers.Add("omniscient_role_irreversible");
        return blockers;
    }
    private static bool RememberLobbyCommand(Room room, string commandId)
    {
        if (string.IsNullOrWhiteSpace(commandId)) return false;
        lock (room.ProcessedLobbyCommandIds) return room.ProcessedLobbyCommandIds.Add(commandId);
    }
    private Task BroadcastLobbyState(Room room) => Clients.Group(room.Id).SendAsync("LobbyStateUpdated", _lobbyStart.GetState(room));
}
