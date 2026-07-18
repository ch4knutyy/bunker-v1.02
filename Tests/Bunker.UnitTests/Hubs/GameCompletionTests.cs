using Bunker.Hubs;
using Bunker.Models;

namespace Bunker.UnitTests.Hubs;

public class GameCompletionTests
{
    [Fact]
    public void AboveCapacityDoesNotFinishGame()
    {
        var room = CreatePlayingRoom(capacity: 1, GameplayPlayer("p1"), GameplayPlayer("p2"));

        var completed = GameHub.TryMarkGameFinishedAfterElimination(room, out var completion);

        Assert.False(completed);
        Assert.Null(completion);
        Assert.Equal(RoomState.Playing, room.State);
        Assert.Equal(GamePhase.VotingResults, room.CurrentPhase);
    }

    [Fact]
    public void EqualCapacityFinishesGameWithStableWinnerSnapshot()
    {
        var room = CreatePlayingRoom(capacity: 2,
            GameplayPlayer("winner-1", "Winner One"),
            GameplayPlayer("winner-2", "Winner Two"),
            new Player
            {
                StablePlayerId = "eliminated",
                ConnectionId = "c-eliminated",
                Name = "Eliminated",
                IsEliminated = true
            });
        room.CurrentRound = 4;
        room.GameSessionId = Guid.Parse("11111111-2222-3333-4444-555555555555");

        var completed = GameHub.TryMarkGameFinishedAfterElimination(room, out var completion);

        Assert.True(completed);
        Assert.NotNull(completion);
        Assert.Equal(RoomState.Finished, room.State);
        Assert.Equal(GamePhase.Finished, room.CurrentPhase);
        Assert.Equal(2, completion.BunkerCapacity);
        Assert.Equal(2, completion.SurvivorCount);
        Assert.Equal(4, completion.CurrentRound);
        Assert.Equal(room.GameSessionId, completion.GameSessionId);
        Assert.Equal(
            ["winner-1", "winner-2"],
            completion.Winners.Select(winner => winner.PlayerId).OrderBy(id => id));
    }

    [Fact]
    public void SpectatorsAndGmDoNotBlockCapacityCompletionOrBecomeWinners()
    {
        var room = CreatePlayingRoom(capacity: 1,
            GameplayPlayer("winner"),
            new Player
            {
                StablePlayerId = "spectator",
                ConnectionId = "c-spectator",
                Name = "Spectator",
                IsLobbySpectator = true
            },
            new Player
            {
                StablePlayerId = "gm",
                ConnectionId = "c-gm",
                Name = "GM",
                IsSpectatorGm = true,
                GmRole = GmMode.OmniscientGm
            });

        var completed = GameHub.TryMarkGameFinishedAfterElimination(room, out var completion);

        Assert.True(completed);
        Assert.NotNull(completion);
        var winner = Assert.Single(completion.Winners);
        Assert.Equal("winner", winner.PlayerId);
    }

    [Fact]
    public void RepeatedCheckDoesNotProduceSecondCompletionSnapshot()
    {
        var room = CreatePlayingRoom(capacity: 1, GameplayPlayer("winner"));

        Assert.True(GameHub.TryMarkGameFinishedAfterElimination(room, out var firstCompletion));
        Assert.NotNull(firstCompletion);

        Assert.False(GameHub.TryMarkGameFinishedAfterElimination(room, out var repeatedCompletion));
        Assert.Null(repeatedCompletion);
        Assert.Equal(RoomState.Finished, room.State);
        Assert.Equal(GamePhase.Finished, room.CurrentPhase);
    }

    private static Room CreatePlayingRoom(int capacity, params Player[] players)
    {
        var room = new Room
        {
            State = RoomState.Playing,
            CurrentPhase = GamePhase.VotingResults,
            ResolvedBunkerCapacity = capacity
        };

        foreach (var player in players)
        {
            room.Players[player.ConnectionId] = player;
        }

        return room;
    }

    private static Player GameplayPlayer(string stablePlayerId, string? name = null) =>
        new()
        {
            StablePlayerId = stablePlayerId,
            ConnectionId = $"connection-{stablePlayerId}",
            Name = name ?? stablePlayerId
        };
}
