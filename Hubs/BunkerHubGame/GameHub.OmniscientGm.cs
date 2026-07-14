using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    private readonly Dictionary<string, Queue<DateTimeOffset>> _omniscientRequestWindows = new(StringComparer.Ordinal);
	public Task<OmniscientGmPreviewDto> PreviewEnterOmniscientGm(
		string bootstrapKey)
	{
		var connectionId = Context.ConnectionId;

		var room = _roomService.GetPlayerRoom(connectionId);

		if (room == null)
		{
			throw new HubException("omniscient_room_not_found");
		}

		var player = _roomService.GetPlayer(connectionId);

		if (player == null)
		{
			throw new HubException("omniscient_player_not_found");
		}

		if (!room.IsHost(player))
		{
			throw new HubException("omniscient_host_required");
		}

		if (string.IsNullOrWhiteSpace(bootstrapKey))
		{
			throw new HubException("omniscient_bootstrap_key_missing");
		}

		if (!_omniscientAccess.CanEnter(room.GmMode, bootstrapKey))
		{
			throw new HubException("omniscient_invalid_bootstrap_key");
		}

		return Task.FromResult(
			_omniscientRoles.Preview(room, player));
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
        await SendPrivateOmniscientState(room, player);
        await BroadcastLobbyState(room);
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

    public async Task<OmniscientRoomStateDto> GetOmniscientRoomState()
    {
        Room room; Player player;
        try { (room, player) = RequireOmniscientCaller(GmCapability.ViewHiddenRoomState); }
        catch (HubException) { await AuditRejectedOmniscientRequest(); throw; }
        EnsureOmniscientRateLimit();
        var dto = BuildOmniscientHiddenState(room, player);
        await AppendGmAudit(room, RoomService.GetPlayerKey(player), "omniscient_hidden_state_requested", GmAuditResult.Success,
            "Omniscient hidden state access granted.", allowUndo: false);
        return dto;
    }

    public async Task ResyncOmniscientState()
    {
        Room room; Player player;
        try { (room, player) = RequireOmniscientCaller(GmCapability.ViewHiddenRoomState); }
        catch (HubException) { await AuditRejectedOmniscientRequest(); throw; }
        EnsureOmniscientRateLimit();
        await SendPrivateOmniscientState(room, player);
    }

    private (Room Room, Player Player) RequireOmniscientCaller(GmCapability capability)
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room == null || !_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var player) ||
            string.IsNullOrWhiteSpace(player.StablePlayerId) ||
            !room.IrreversibleOmniscientPlayerIds.Contains(player.StablePlayerId) ||
            !_omniscientAccess.CanViewHidden(player, capability))
            throw new HubException("omniscient_hidden_access_denied");
        return (room, player);
    }

    private async Task AuditRejectedOmniscientRequest()
    {
        var room = _roomService.GetPlayerRoom(Context.ConnectionId);
        if (room != null && _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var player))
            await AppendGmAudit(room, RoomService.GetPlayerKey(player), "omniscient_hidden_state_requested", GmAuditResult.Rejected,
                "Omniscient hidden state access rejected.", errorCode: "not_authorized", allowUndo: false);
    }

    private void EnsureOmniscientRateLimit()
    {
        var now = DateTimeOffset.UtcNow;
        lock (_omniscientRequestWindows)
        {
            if (!_omniscientRequestWindows.TryGetValue(Context.ConnectionId, out var requests))
                _omniscientRequestWindows[Context.ConnectionId] = requests = new();
            while (requests.Count > 0 && now - requests.Peek() > TimeSpan.FromSeconds(5)) requests.Dequeue();
            if (requests.Count >= 12) throw new HubException("omniscient_rate_limited");
            requests.Enqueue(now);
        }
    }

    private OmniscientRoomStateDto BuildOmniscientHiddenState(Room room, Player player) =>
        _omniscientHiddenState.Build(room, _omniscientAccess.CanViewHidden(player, GmCapability.ViewSecretVotes));

    private Task SendPrivateOmniscientState(Room room, Player player) =>
        Clients.Client(player.ConnectionId).SendAsync("OmniscientHiddenStateUpdated", BuildOmniscientHiddenState(room, player));

    private async Task BroadcastOmniscientStateToAuthorizedSpectators(Room room)
    {
        foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value))
        {
            if (string.IsNullOrWhiteSpace(player.ConnectionId) || !player.IsConnected ||
                !room.IrreversibleOmniscientPlayerIds.Contains(RoomService.GetPlayerKey(player)) ||
                !_omniscientAccess.CanViewHidden(player, GmCapability.ViewHiddenRoomState) ||
                !string.Equals(_roomService.GetPlayerRoomId(player.ConnectionId), room.Id, StringComparison.OrdinalIgnoreCase)) continue;
            await SendPrivateOmniscientState(room, player);
        }
    }
}
