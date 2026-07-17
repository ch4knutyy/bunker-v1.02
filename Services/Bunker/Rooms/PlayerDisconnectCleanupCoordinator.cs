using System.Collections.Concurrent;
using Bunker.Hubs;
using Bunker.Models;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Services;

public sealed class PlayerDisconnectCleanupCoordinator
{
    private static readonly TimeSpan GracePeriod = TimeSpan.FromMinutes(5);

    private readonly record struct CleanupKey(string RoomId, Guid PlayerId);

    private sealed record ScheduledCleanup(
        string ExpectedConnectionId,
        string AuditPlayerId,
        CancellationTokenSource Cancellation);

    private readonly ConcurrentDictionary<CleanupKey, ScheduledCleanup> _scheduled = new();
    private readonly RoomService _roomService;
    private readonly GmAuditService _gmAudit;
    private readonly IHubContext<GameHub> _hubContext;
    private readonly TimeProvider _timeProvider;
    private readonly IHostApplicationLifetime _applicationLifetime;
    private readonly ILogger<PlayerDisconnectCleanupCoordinator> _logger;

    public PlayerDisconnectCleanupCoordinator(
        RoomService roomService,
        GmAuditService gmAudit,
        IHubContext<GameHub> hubContext,
        TimeProvider timeProvider,
        IHostApplicationLifetime applicationLifetime,
        ILogger<PlayerDisconnectCleanupCoordinator> logger)
    {
        _roomService = roomService;
        _gmAudit = gmAudit;
        _hubContext = hubContext;
        _timeProvider = timeProvider;
        _applicationLifetime = applicationLifetime;
        _logger = logger;
    }

    public void Schedule(string roomId, Guid playerId, string expectedConnectionId, string auditPlayerId)
    {
        var key = new CleanupKey(roomId, playerId);
        var cancellation = CancellationTokenSource.CreateLinkedTokenSource(
            _applicationLifetime.ApplicationStopping);
        var scheduled = new ScheduledCleanup(expectedConnectionId, auditPlayerId, cancellation);

        while (true)
        {
            if (_scheduled.TryGetValue(key, out var previous))
            {
                if (!_scheduled.TryUpdate(key, scheduled, previous))
                {
                    continue;
                }

                previous.Cancellation.Cancel();
                break;
            }

            if (_scheduled.TryAdd(key, scheduled))
            {
                break;
            }
        }

        _ = RunCleanupAsync(key, scheduled);
    }

    public bool Cancel(string roomId, Guid playerId)
    {
        if (!_scheduled.TryRemove(new CleanupKey(roomId, playerId), out var scheduled))
        {
            return false;
        }

        scheduled.Cancellation.Cancel();
        return true;
    }

    private async Task RunCleanupAsync(CleanupKey key, ScheduledCleanup scheduled)
    {
        try
        {
            await Task.Delay(GracePeriod, _timeProvider, scheduled.Cancellation.Token);

            if (!((ICollection<KeyValuePair<CleanupKey, ScheduledCleanup>>)_scheduled)
                    .Remove(new(key, scheduled)))
            {
                return;
            }

            scheduled.Cancellation.Token.ThrowIfCancellationRequested();

            var result = _roomService.TryFinalizeDisconnectedPlayer(
                key.RoomId,
                key.PlayerId,
                scheduled.ExpectedConnectionId);

            if (!result.Removed || result.RoomDeleted || result.Room == null)
            {
                return;
            }

            if (result.WasLobby)
            {
                _gmAudit.Append(
                    result.Room,
                    scheduled.AuditPlayerId,
                    "lobby_player_left",
                    GmAuditResult.Success,
                    "A disconnected lobby member left after the reconnect grace period.",
                    scheduled.AuditPlayerId);
            }

            if (result.WasLobby &&
                !string.IsNullOrWhiteSpace(result.NewHostConnectionId) &&
                !string.IsNullOrWhiteSpace(result.NewHostPlayerId))
            {
                _gmAudit.Append(
                    result.Room,
                    scheduled.AuditPlayerId,
                    "host_transfer",
                    GmAuditResult.Success,
                    "Host role was transferred after the reconnect grace period.",
                    result.NewHostPlayerId);
            }

            await _hubContext.Clients.Group(result.RoomId).SendAsync(
                "PlayerLeftRoom",
                new
                {
                    connectionId = result.ConnectionId,
                    newHostConnectionId = result.NewHostConnectionId,
                    newHostName = result.NewHostName
                },
                scheduled.Cancellation.Token);

            await _hubContext.Clients.All.SendAsync(
                "RoomsListUpdated",
                _roomService.GetAllRooms(),
                scheduled.Cancellation.Token);
        }
        catch (OperationCanceledException) when (scheduled.Cancellation.IsCancellationRequested)
        {
        }
        catch (Exception exception)
        {
            _logger.LogError(
                exception,
                "Delayed disconnect cleanup failed for room {RoomId}, player {PlayerId}, connection {ConnectionId}",
                key.RoomId,
                key.PlayerId,
                scheduled.ExpectedConnectionId);
        }
        finally
        {
            ((ICollection<KeyValuePair<CleanupKey, ScheduledCleanup>>)_scheduled)
                .Remove(new(key, scheduled));
            scheduled.Cancellation.Dispose();
        }
    }
}
