using Bunker.Hubs;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Services;

public sealed class GameTimerExpiryService(
    RoomService roomService,
    GameTimerService gameTimerService,
    IHubContext<GameHub> hubContext,
    ILogger<GameTimerExpiryService> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var ticker = new PeriodicTimer(TimeSpan.FromSeconds(1));
        while (await ticker.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var room in roomService.GetActiveRoomsSnapshot())
            {
                if (!gameTimerService.TryExpire(room, out var dto)) continue;
                await hubContext.Clients.Group(room.Id).SendAsync("GameTimerUpdated", dto, stoppingToken);
                logger.LogInformation("Game timer expired in room {RoomId}", room.Id);
            }
        }
    }
}
