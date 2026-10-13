using Bunker.Models;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
    // Threats are narrative announcements. This projection intentionally carries no
    // operation state, player choice, timer, or resolution pipeline.
    private object? BuildThreatPublicState(Room room) => room.IsThreatRevealed && room.CurrentThreat != null
        ? new { currentThreatId = room.CurrentThreat.Id, threatStatus = "revealed" }
        : null;

    private Task BroadcastThreatState(Room room, string roomId) =>
        Clients.Group(roomId).SendAsync("ThreatStateUpdated", new
        {
            threatState = BuildThreatPublicState(room),
            roundState = BuildRoundState(room)
        });
}
