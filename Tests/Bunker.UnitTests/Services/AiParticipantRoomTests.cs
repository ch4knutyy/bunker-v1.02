using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class AiParticipantRoomTests
{
    [Fact]
    public void Ai_participants_count_toward_capacity_are_ready_and_cannot_be_host()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance);
        var room = new Room { MaxPlayers = 4 };
        room.Players["human"] = new Player { ConnectionId = "human", StablePlayerId = "human", Name = "Human", IsLobbyReady = true };

        var ai = Enumerable.Range(1, 3).Select(index => new Player
        {
            Name = $"AI {index}", StablePlayerId = $"ai-{index}", IsAi = true
        }).ToList();

        Assert.All(ai, player => Assert.True(rooms.TryAddAiPlayer(room, player)));
        Assert.Equal(4, RoomService.GetGameplayPlayersSnapshot(room).Count);
        Assert.All(ai, player => Assert.True(player.IsLobbyReady));
        Assert.All(ai, player => Assert.True(player.IsConnected));
        Assert.All(ai, player => Assert.NotEqual("", player.ConnectionId));
        Assert.All(ai, player => Assert.False(RoomService.CanReceiveHost(player)));
        Assert.False(rooms.TryAddAiPlayer(room, new Player { IsAi = true, StablePlayerId = "ai-overflow" }));
    }
}
