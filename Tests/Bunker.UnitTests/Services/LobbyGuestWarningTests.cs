using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class LobbyGuestWarningTests
{
    [Fact]
    public void LobbyMembersExposeOnlySafeAccountBindingStatus()
    {
        var (service, room, bound, guest, _, _) = Setup();
        var state = service.GetState(room);

        Assert.True(state.Members.Single(member => member.PlayerId == bound.StablePlayerId).IsAccountBound);
        Assert.False(state.Members.Single(member => member.PlayerId == guest.StablePlayerId).IsAccountBound);

        var json = JsonSerializer.Serialize(state);
        Assert.DoesNotContain(nameof(Player.AccountUserId), json);
        Assert.DoesNotContain(bound.AccountUserId!.Value.ToString(), json, StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void PreviewCountsOnlyUnboundGameplayPlayers()
    {
        var (service, room, bound, guest, spectator, technicalGm) = Setup();
        var preview = service.Preview(room, bound);

        Assert.Equal(1, preview.GuestGameplayPlayerCount);
        Assert.False(LobbyStartService.BuildMember(room, spectator).IsGameplayParticipant);
        Assert.False(LobbyStartService.BuildMember(room, technicalGm).IsGameplayParticipant);
    }

    [Fact]
    public void AccountBoundGameplayPlayerIsNotCountedAsGuest()
    {
        var (service, room, bound, _, _, _) = Setup();

        Assert.True(LobbyStartService.BuildMember(room, bound).IsAccountBound);
        Assert.Equal(1, service.Preview(room, bound).GuestGameplayPlayerCount);
    }

    [Fact]
    public void UnboundGameplayPlayerIsCountedAsGuest()
    {
        var (service, room, bound, guest, _, _) = Setup();

        Assert.False(LobbyStartService.BuildMember(room, guest).IsAccountBound);
        Assert.Equal(1, service.Preview(room, bound).GuestGameplayPlayerCount);
    }

    [Fact]
    public void GuestSpectatorAndTechnicalGmAreNotCounted()
    {
        var (service, room, bound, guest, spectator, technicalGm) = Setup();
        guest.AccountUserId = Guid.NewGuid();
        var omniscientGm = new Player
        {
            Name = "Omniscient",
            ConnectionId = "omniscient",
            StablePlayerId = "omniscient-id",
            IsSpectatorGm = true,
            GmRole = GmMode.OmniscientGm
        };
        room.Players[omniscientGm.ConnectionId] = omniscientGm;
        room.IrreversibleOmniscientPlayerIds.Add(omniscientGm.StablePlayerId);

        var preview = service.Preview(room, bound);

        Assert.Equal(0, preview.GuestGameplayPlayerCount);
        Assert.False(LobbyStartService.BuildMember(room, spectator).IsGameplayParticipant);
        Assert.False(LobbyStartService.BuildMember(room, technicalGm).IsGameplayParticipant);
        Assert.False(LobbyStartService.BuildMember(room, omniscientGm).IsGameplayParticipant);
    }

    private static (LobbyStartService Service, Room Room, Player Bound, Player Guest, Player Spectator, Player TechnicalGm) Setup()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance);
        var room = rooms.CreateRoom("Lobby", "host", "Host");
        var bound = new Player { Name = "Bound", ConnectionId = "host", StablePlayerId = "host-id", AccountUserId = Guid.NewGuid() };
        var guest = new Player { Name = "Guest", ConnectionId = "guest", StablePlayerId = "guest-id" };
        var spectator = new Player { Name = "Spectator", ConnectionId = "spectator", StablePlayerId = "spectator-id", IsLobbySpectator = true };
        var technicalGm = new Player { Name = "GM", ConnectionId = "gm", StablePlayerId = "gm-id", GmRole = GmMode.TechnicalGm };
        rooms.JoinRoom(room.Id, bound.ConnectionId, bound);
        rooms.JoinRoom(room.Id, guest.ConnectionId, guest);
        rooms.JoinRoom(room.Id, spectator.ConnectionId, spectator);
        rooms.JoinRoom(room.Id, technicalGm.ConnectionId, technicalGm);
        return (new LobbyStartService(TimeProvider.System), room, bound, guest, spectator, technicalGm);
    }
}
