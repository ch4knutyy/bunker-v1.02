using Bunker.Models.Spy;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs.GameHunSpy;

public sealed class SpyHub : Hub
{
    private readonly SpyRoomService _spyRooms;
    private readonly ILogger<SpyHub> _logger;

    public SpyHub(SpyRoomService spyRooms, ILogger<SpyHub> logger)
    {
        _spyRooms = spyRooms;
        _logger = logger;
    }

    public async Task CreateSpyRoom(string playerName, string playerId, string? language = null)
    {
        var room = _spyRooms.CreateRoom(Context.ConnectionId, playerName, playerId, language);
        await Groups.AddToGroupAsync(Context.ConnectionId, room.RoomCode);
        await SendRoomState(room);
    }

    public async Task JoinSpyRoom(string roomCode, string playerName, string playerId, string? language = null)
    {
        var result = _spyRooms.JoinRoom(roomCode, Context.ConnectionId, playerName, playerId, language);
        if (!result.Success || result.Room == null)
        {
            await SendError(result.Error);
            return;
        }
        await Groups.AddToGroupAsync(Context.ConnectionId, result.Room.RoomCode);
        await SendRoomState(result.Room);
    }

    public Task SetSpyReady(bool isReady, string commandId) =>
        SendActionResult(_spyRooms.SetReady(Context.ConnectionId, isReady, commandId), "ready_changed");

    public Task UpdateSpySettings(int roundDurationSeconds, int minimumPlayers, string commandId) =>
        SendActionResult(
            _spyRooms.UpdateSettings(Context.ConnectionId, roundDurationSeconds, minimumPlayers, commandId),
            "settings_changed");

    public Task StartSpyRound(string? commandId = null) =>
        SendActionResult(_spyRooms.StartRound(Context.ConnectionId, EnsureCommandId(commandId, "start")), "round_started");

    public Task EndSpyRound(string? commandId = null) =>
        SendActionResult(_spyRooms.EndRound(Context.ConnectionId, EnsureCommandId(commandId, "end")), "round_ended");

    public Task NewSpyRound(string? commandId = null) =>
        SendActionResult(_spyRooms.StartRound(Context.ConnectionId, EnsureCommandId(commandId, "new")), "round_started");

    public Task RevealSpyRoles(string? commandId = null) =>
        SendActionResult(_spyRooms.EndRound(Context.ConnectionId, EnsureCommandId(commandId, "reveal")), "round_ended");

    public Task VoteSpyPlayer(string targetPlayerId, string commandId) =>
        SendActionResult(_spyRooms.Vote(Context.ConnectionId, targetPlayerId, commandId), "vote_cast");

    public Task GuessSpyLocation(string locationId, string commandId, bool confirmed) =>
        SendActionResult(
            _spyRooms.GuessLocation(Context.ConnectionId, locationId, commandId, confirmed),
            "location_guessed");

    public Task ReturnSpyToLobby(string commandId, bool confirmed) =>
        SendActionResult(
            _spyRooms.ReturnToLobby(Context.ConnectionId, commandId, confirmed),
            "returned_to_lobby");

    public async Task KickSpyPlayer(string targetPlayerId, string commandId)
    {
        var result = _spyRooms.KickPlayer(Context.ConnectionId, targetPlayerId, commandId);
        if (!result.Success)
        {
            await SendError(result.Error);
            if (result.Room != null) await SendRoomState(result.Room);
            return;
        }
        if (!result.IsDuplicate && !string.IsNullOrWhiteSpace(result.TargetConnectionId))
        {
            await Clients.Client(result.TargetConnectionId).SendAsync("SpyPlayerKicked", new
            {
                messageKey = "spyKickedMessage"
            });
            if (result.Room != null)
                await Groups.RemoveFromGroupAsync(result.TargetConnectionId, result.Room.RoomCode);
        }
        if (result.Room != null) await SendRoomState(result.Room);
        await Clients.Caller.SendAsync("SpyActionSuccess", new { action = "kick", result.PlayerName });
    }

    public async Task LeaveSpyRoom(string commandId)
    {
        var result = _spyRooms.LeaveRoom(Context.ConnectionId, commandId);
        if (!result.Success)
        {
            await SendError(result.Error);
            return;
        }
        if (result.Room != null)
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, result.Room.RoomCode);
            await SendRoomState(result.Room);
        }
        await Clients.Caller.SendAsync("SpyRoomLeft", new { result.PlayerName });
    }

    public async Task GetSpySnapshots()
    {
        var room = _spyRooms.GetPlayerRoom(Context.ConnectionId);
        if (room == null)
        {
            await SendError("spyErrorRoomNotFound");
            return;
        }
        await Clients.Caller.SendAsync("SpyStateUpdated", _spyRooms.BuildClientState(room, Context.ConnectionId));
    }

    public async Task PreviewSpySnapshotRestore(string snapshotId)
    {
        var preview = _spyRooms.PreviewRestore(Context.ConnectionId, snapshotId);
        await Clients.Caller.SendAsync("SpySnapshotRestorePreviewed", preview);
    }

    public async Task RestoreSpySnapshot(
        string snapshotId,
        string commandId,
        bool confirmed,
        bool activeRoundConfirmed = false)
    {
        var result = _spyRooms.RestoreSnapshot(
            Context.ConnectionId,
            snapshotId,
            commandId,
            confirmed,
            activeRoundConfirmed);
        var room = _spyRooms.GetPlayerRoom(Context.ConnectionId);
        if (!result.Success)
        {
            await SendError(result.ErrorCode);
            if (room != null) await SendRoomState(room);
            return;
        }
        if (room != null) await SendRoomState(room);
        await Clients.Caller.SendAsync("SpyActionSuccess", new
        {
            action = "snapshot_restored",
            result.RestoredSnapshotId,
            result.SafetySnapshotId,
            result.IsDuplicate
        });
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        var room = _spyRooms.GetPlayerRoom(Context.ConnectionId);
        _spyRooms.MarkDisconnected(Context.ConnectionId);
        if (room != null) await SendRoomState(room);
        if (exception != null)
            _logger.LogDebug(exception, "Spy client disconnected from {ConnectionId}", Context.ConnectionId);
        await base.OnDisconnectedAsync(exception);
    }

    private async Task SendActionResult(SpyActionResult result, string action)
    {
        if (!result.Success)
            await SendError(result.Error);
        if (result.Room != null)
            await SendRoomState(result.Room);
        if (result.Success)
            await Clients.Caller.SendAsync("SpyActionSuccess", new { action, result.IsDuplicate });
    }

    private Task SendError(string? error) =>
        Clients.Caller.SendAsync("SpyError", new { code = error ?? "spyErrorActionFailed" });

    private string EnsureCommandId(string? commandId, string action) =>
        string.IsNullOrWhiteSpace(commandId)
            ? $"spy-legacy-{action}-{Context.ConnectionId}-{Guid.NewGuid():N}"
            : commandId;

    private async Task SendRoomState(SpyRoom room)
    {
        foreach (var connectionId in _spyRooms.GetConnectedConnectionIds(room))
        {
            await Clients.Client(connectionId).SendAsync(
                "SpyStateUpdated",
                _spyRooms.BuildClientState(room, connectionId));
        }
    }
}
