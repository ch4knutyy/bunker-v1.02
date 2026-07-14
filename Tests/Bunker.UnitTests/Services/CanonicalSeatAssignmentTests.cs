using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class CanonicalSeatAssignmentTests
{
    [Fact]
    public void StartAssignsUniqueContiguousSeatsOnlyToGameplayPlayers()
    {
        var context = CreateRoom();
        context.Spectator.IsLobbySpectator = true;
        context.Technical.GmRole = GmMode.TechnicalGm;
        context.Omniscient.IsSpectatorGm = true;
        context.Omniscient.GmRole = GmMode.OmniscientGm;

        var result = context.Service.StartGame(context.Room.Id, context.Host.ConnectionId, _ => 0);

        Assert.True(result.success);
        var gameplay = RoomService.GetGameplayPlayersSnapshot(context.Room).Select(entry => entry.Value).ToList();
        Assert.Equal(Enumerable.Range(1, gameplay.Count), gameplay.Select(player => player.SeatNumber).Order());
        Assert.Equal(gameplay.Count, gameplay.Select(player => player.SeatNumber).Distinct().Count());
        Assert.All(new[] { context.Spectator, context.Technical, context.Omniscient }, player => Assert.Equal(0, player.SeatNumber));
    }

    [Fact]
    public void DeterministicShuffleDoesNotForceHostToSeatOneOrUseJoinOrder()
    {
        var context = CreateRoom();
        ExcludeNonGameplay(context);

        Assert.True(context.Service.StartGame(context.Room.Id, context.Host.ConnectionId, _ => 0).success);

        Assert.NotEqual(1, context.Host.SeatNumber);
        Assert.False(new[] { context.Host, context.Guest, context.Third }.Select(player => player.Name).SequenceEqual(
            RoomService.GetGameplayPlayersSnapshot(context.Room).Select(entry => entry.Value).OrderBy(player => player.SeatNumber).Select(player => player.Name)));
    }

    [Fact]
    public void RepeatedStartReconnectAndHostTransferDoNotReshuffle()
    {
        var context = CreateRoom();
        ExcludeNonGameplay(context);
        var calls = 0;
        Assert.True(context.Service.StartGame(context.Room.Id, context.Host.ConnectionId, max => { calls++; return 0; }).success);
        var seats = SeatMap(context.Room);

        Assert.False(context.Service.StartGame(context.Room.Id, context.Host.ConnectionId, max => { calls++; return max - 1; }).success);
        context.Guest.IsConnected = false;
        context.Guest.IsConnected = true;
        Assert.True(context.Service.TransferHost(context.Room, context.Guest.ConnectionId, out _));

        Assert.Equal(2, calls);
        Assert.Equal(seats, SeatMap(context.Room));
    }

    [Fact]
    public void InvalidRngRollsBackBeforeAnySeatOrRoomMutation()
    {
        var context = CreateRoom();
        ExcludeNonGameplay(context);
        var rolls = new Queue<int>(new[] { 0, 5 });

        Assert.Throws<ArgumentOutOfRangeException>(() =>
            context.Service.StartGame(context.Room.Id, context.Host.ConnectionId, _ => rolls.Dequeue()));

        Assert.Equal(RoomState.Lobby, context.Room.State);
        Assert.Equal(0, context.Room.CurrentRound);
        Assert.All(RoomService.GetGameplayPlayersSnapshot(context.Room), entry => Assert.Equal(0, entry.Value.SeatNumber));
    }

    [Theory]
    [InlineData("0,0", 3)]
    [InlineData("1,0", 2)]
    [InlineData("2,1", 1)]
    public void DeterministicRollsProduceDifferentValidHostSeats(string deterministicRolls, int expectedHostSeat)
    {
        var context = CreateRoom();
        ExcludeNonGameplay(context);
        var rolls = new Queue<int>(deterministicRolls.Split(',').Select(int.Parse));

        Assert.True(context.Service.StartGame(context.Room.Id, context.Host.ConnectionId, _ => rolls.Dequeue()).success);

        Assert.Equal(expectedHostSeat, context.Host.SeatNumber);
        Assert.Equal(new[] { 1, 2, 3 }, RoomService.GetGameplayPlayersSnapshot(context.Room).Select(entry => entry.Value.SeatNumber).Order());
    }

    private static void ExcludeNonGameplay(Context context)
    {
        context.Spectator.IsLobbySpectator = true;
        context.Technical.GmRole = GmMode.TechnicalGm;
        context.Omniscient.IsSpectatorGm = true;
        context.Omniscient.GmRole = GmMode.OmniscientGm;
    }

    private static Dictionary<string, int> SeatMap(Room room) => RoomService.GetPlayersSnapshot(room)
        .ToDictionary(entry => entry.Value.StablePlayerId, entry => entry.Value.SeatNumber);

    private static Context CreateRoom()
    {
        var service = new RoomService(NullLogger<RoomService>.Instance);
        var room = service.CreateRoom("Seats", "host", "Host", 12);
        Player Add(string connection, string name)
        {
            var player = new Player { ConnectionId = connection, StablePlayerId = $"{connection}-id", Name = name };
            Assert.True(service.JoinRoom(room.Id, connection, player).success);
            return player;
        }

        return new(service, room, Add("host", "Host"), Add("guest", "Guest"), Add("third", "Third"),
            Add("spectator", "Spectator"), Add("technical", "Technical"), Add("omniscient", "Omniscient"));
    }

    private sealed record Context(RoomService Service, Room Room, Player Host, Player Guest, Player Third,
        Player Spectator, Player Technical, Player Omniscient);
}
