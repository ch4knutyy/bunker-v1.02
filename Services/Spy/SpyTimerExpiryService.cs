using Bunker.Hubs.GameHunSpy;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Services;

public sealed class SpyTimerExpiryService : BackgroundService
{
    private readonly SpyRoomService _spyRooms;
    private readonly IHubContext<SpyHub> _hub;
    private readonly ILogger<SpyTimerExpiryService> _logger;

    public SpyTimerExpiryService(
        SpyRoomService spyRooms,
        IHubContext<SpyHub> hub,
        ILogger<SpyTimerExpiryService> logger)
    {
        _spyRooms = spyRooms;
        _hub = hub;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                foreach (var room in _spyRooms.CompleteExpiredRounds())
                {
                    foreach (var connectionId in _spyRooms.GetConnectedConnectionIds(room))
                    {
                        await _hub.Clients.Client(connectionId).SendAsync(
                            "SpyStateUpdated",
                            _spyRooms.BuildClientState(room, connectionId),
                            stoppingToken);
                    }
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                _logger.LogError(exception, "Spy timer expiry coordinator failed");
            }
        }
    }
}
