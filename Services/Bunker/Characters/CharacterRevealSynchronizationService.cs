using Bunker.Hubs;
using Bunker.Models;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Services;

/// <summary>Canonical public post-reveal dispatch. Private projections remain supplied by the authorized caller.</summary>
public sealed class CharacterRevealSynchronizationService(IHubContext<GameHub> hub, RoomService rooms)
{
    public async Task DispatchAsync(Room room, Player actor, CharacterRevealResult result, object publicData, CancellationToken cancellationToken = default)
    {
        if (!result.Success) return;
        rooms.UpdatePlayer(actor.ConnectionId, actor);
        await hub.Clients.Group(room.Id).SendAsync("CharacteristicRevealed", new { playerName = actor.Name, connectionId = actor.ConnectionId, characteristicKey = result.CharacteristicKey, data = publicData, revealRevision = result.RevealRevision }, cancellationToken);
    }
}
