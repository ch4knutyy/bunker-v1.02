using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace Bunker.UnitTests.Services;

public sealed class OmniscientGmRoleServiceTests
{
    [Fact]
    public void PlayerHostAndProductionAreBlockedWhileExplicitDevelopmentKeyAllowsEntry()
    {
        const string key = "omniscient-test-key-123";
        Assert.False(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.EnterOmniscientGm));
        Assert.False(Policy(Environments.Production, true, key).CanEnter(GmMode.PlayerHost, key));
        Assert.False(Policy(Environments.Development, true, key).CanEnter(GmMode.PlayerHost, "wrong"));
        Assert.True(Policy(Environments.Development, true, key).CanEnter(GmMode.PlayerHost, key));
        Assert.False(GmCapabilities.Allows(GmMode.TechnicalGm, GmCapability.ViewHiddenGameState));
    }

    [Fact]
    public void PreviewDoesNotMutateAndEnterCleansEveryGameplayReference()
    {
        var (rooms, room, host, guest) = Setup(); var hostId = RoomService.GetPlayerKey(host); var guestId = RoomService.GetPlayerKey(guest);
        room.CurrentTurnPlayerId = hostId; room.VotingReadyResponses[hostId] = "ready";
        room.CurrentVoting = new VotingSession(); room.CurrentVoting.EligibleVoters.UnionWith([hostId, guestId]); room.CurrentVoting.Votes[hostId] = guestId; room.CurrentVoting.Votes[guestId] = hostId;
        room.ThreatState = new ThreatInteractionState { ParticipantPlayerIds = [hostId], ForcedParticipantPlayerId = hostId };
        room.ThreatState.VolunteerSelection.SelectedPlayerId = hostId; room.ThreatState.MiniGame.LeaderPlayerId = hostId; room.ThreatState.Contributions.Add(new() { PlayerId = hostId, OwnerPlayerId = hostId });
        var service = new OmniscientGmRoleService(rooms); var before = JsonSerializer.Serialize(room.CurrentVoting);
        var preview = service.Preview(room, host); Assert.True(preview.WillRemoveVote); Assert.Equal(before, JsonSerializer.Serialize(room.CurrentVoting)); Assert.False(host.IsSpectatorGm);

        var state = service.Enter(room, host);
        Assert.True(state.IsSpectatorGm); Assert.True(room.IsHost(host)); Assert.True(host.HasSeenOmniscientState); Assert.Contains(hostId, room.IrreversibleOmniscientPlayerIds);
        Assert.Single(RoomService.GetGameplayPlayersSnapshot(room)); Assert.Same(guest, RoomService.GetGameplayPlayersSnapshot(room)[0].Value);
        Assert.Null(room.CurrentTurnPlayerId); Assert.DoesNotContain(hostId, room.VotingReadyResponses.Keys); Assert.DoesNotContain(hostId, room.CurrentVoting.EligibleVoters);
        Assert.DoesNotContain(hostId, room.CurrentVoting.Votes.Keys); Assert.DoesNotContain(hostId, room.CurrentVoting.Votes.Values);
        Assert.Empty(room.ThreatState.ParticipantPlayerIds); Assert.Empty(room.ThreatState.VolunteerSelection.SelectedPlayerId); Assert.Empty(room.ThreatState.MiniGame.LeaderPlayerId); Assert.Empty(room.ThreatState.Contributions);
    }

    [Fact]
    public void SpectatorCannotBeVoterCandidateOrThreatScalingPlayer()
    {
        var (rooms, room, host, guest) = Setup(); new OmniscientGmRoleService(rooms).Enter(room, host);
        Assert.False(RoomService.IsGameplayParticipant(host)); Assert.True(RoomService.IsGameplayParticipant(guest));
        var voting = new VotingSession(); foreach (var player in RoomService.GetGameplayPlayersSnapshot(room).Select(x => x.Value)) voting.EligibleVoters.Add(RoomService.GetPlayerKey(player));
        Assert.DoesNotContain(RoomService.GetPlayerKey(host), voting.EligibleVoters); Assert.Equal(1, voting.RequiredVoterCount);
    }

    [Fact]
    public void ReconnectPreservesSpectatorAndHostTransferDoesNotTransferHiddenMode()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance); var room = rooms.CreateRoom("room", "host-conn", "Host");
        var host = new Player { Name = "Host", ConnectionId = "host-conn", StablePlayerId = "host-stable" }; var guest = new Player { Name = "Guest", ConnectionId = "guest-conn", StablePlayerId = "guest-stable" };
        rooms.JoinRoom(room.Id, "host-conn", host); rooms.JoinRoom(room.Id, "guest-conn", guest); new OmniscientGmRoleService(rooms).Enter(room, host);
        var rejoin = rooms.RejoinRoom(room.Id, "host-new", "Host", "host-stable"); Assert.True(rejoin.success); Assert.True(rejoin.player!.IsSpectatorGm); Assert.True(rejoin.wasHost);
        Assert.True(rooms.TransferHost(room, "guest-conn", out var newHost)); Assert.Same(guest, newHost); Assert.Equal(GmMode.PlayerHost, room.GmMode); Assert.True(rejoin.player.IsSpectatorGm); Assert.False(guest.IsSpectatorGm);
    }

    [Fact]
    public void PublicStateContainsOnlySafeSpectatorMarker()
    {
        var (_, room, host, _) = Setup(); host.IsSpectatorGm = true; var json = JsonSerializer.Serialize(OmniscientGmRoleService.PublicState(room, host));
        Assert.Contains("spectator_gm", json); Assert.DoesNotContain("Capability", json); Assert.DoesNotContain("Hidden", json); Assert.DoesNotContain("Bootstrap", json);
    }

    private static (RoomService Rooms, Room Room, Player Host, Player Guest) Setup()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance); var room = rooms.CreateRoom("room", "host", "Host");
        var host = new Player { Name = "Host", ConnectionId = "host", StablePlayerId = "host-id" }; var guest = new Player { Name = "Guest", ConnectionId = "guest", StablePlayerId = "guest-id" };
        rooms.JoinRoom(room.Id, "host", host); rooms.JoinRoom(room.Id, "guest", guest); return (rooms, room, host, guest);
    }
    private static OmniscientGmAccessPolicy Policy(string environment, bool enabled, string key) => new(new TestEnvironment { EnvironmentName = environment }, Options.Create(new OmniscientGmOptions { Enabled = enabled, DevelopmentBootstrapKey = key }));
    private sealed class TestEnvironment : IHostEnvironment { public string EnvironmentName { get; set; } = Environments.Production; public string ApplicationName { get; set; } = "Tests"; public string ContentRootPath { get; set; } = ""; public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider(); }
}
