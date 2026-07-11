using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class GmPlayerControlTests
{
    [Fact]
    public void LeaveRoom_RemovesCanonicalMappingAndPlayerReferences()
    {
        var (service, room, target) = CreateRoom();
        room.CurrentTurnPlayerId = target.StablePlayerId;
        room.CurrentVoting = new VotingSession
        {
            Votes = new() { [target.StablePlayerId] = "host-player", ["host-player"] = target.StablePlayerId },
            EligibleVoters = new() { target.StablePlayerId }
        };
        room.ThreatState = new ThreatInteractionState
        {
            ParticipantPlayerIds = new() { target.StablePlayerId },
            VolunteerSelection = new() { SelectedPlayerId = target.StablePlayerId },
            MiniGame = new() { LeaderPlayerId = target.StablePlayerId }
        };

        var result = service.LeaveRoom(target.ConnectionId);

        Assert.True(result.success);
        Assert.Null(service.GetPlayerRoomId(target.ConnectionId));
        Assert.DoesNotContain(RoomService.GetPlayersSnapshot(room), entry => entry.Key == target.ConnectionId);
        Assert.Null(room.CurrentTurnPlayerId);
        Assert.DoesNotContain(target.StablePlayerId, room.CurrentVoting.Votes.Keys);
        Assert.DoesNotContain(target.StablePlayerId, room.CurrentVoting.Votes.Values);
        Assert.DoesNotContain(target.StablePlayerId, room.ThreatState.ParticipantPlayerIds);
        Assert.Equal("", room.ThreatState.MiniGame.LeaderPlayerId);
    }

    [Fact]
    public void TransferHost_ChangesAuthorityAndDropsElevatedMode()
    {
        var (service, room, target) = CreateRoom();
        room.GmMode = GmMode.OmniscientGm;

        Assert.True(service.TransferHost(room, target.ConnectionId, out var newHost));
        Assert.Same(target, newHost);
        Assert.Equal(target.ConnectionId, room.HostConnectionId);
        Assert.Equal(target.StablePlayerId, room.HostPlayerId);
        Assert.Equal(GmMode.PlayerHost, room.GmMode);
        Assert.False(room.IsHost("host-connection"));
    }

    [Fact]
    public void TransferHost_RejectsDisconnectedTarget()
    {
        var (service, room, target) = CreateRoom();
        target.IsConnected = false;
        Assert.False(service.TransferHost(room, target.ConnectionId, out _));
        Assert.Equal("host-connection", room.HostConnectionId);
    }

    [Fact]
    public void StaleCleanup_DoesNotRemoveActiveMapping()
    {
        var (service, room, target) = CreateRoom();
        var result = service.InspectStaleConnection(room, target.ConnectionId, fix: true);
        Assert.False(result.IsStale);
        Assert.False(result.WasFixed);
        Assert.Equal(room.Id, service.GetPlayerRoomId(target.ConnectionId));
    }

    [Fact]
    public void PlayerHost_HasSafePlayerManagementButNoHiddenCapabilities()
    {
        Assert.True(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.ManagePlayersWithoutHiddenData));
        Assert.False(GmCapabilities.Allows(GmMode.PlayerHost, GmCapability.PeekHiddenCharacteristics));
    }

    [Fact]
    public void HideCharacteristic_ChangesOnlyRevealStateAndKeepsActualValue()
    {
        var player = new Player();
        player.PhysicalHealth.Name = "Original condition";
        player.Revealed.PhysicalHealth = true;
        player.Revealed.RevealedValues["PhysicalHealth"] = new RevealedData { Value = "Original condition" };

        Assert.True(GmPlayerStateMutator.HideCharacteristic(player, "PhysicalHealth"));
        Assert.False(player.Revealed.PhysicalHealth);
        Assert.DoesNotContain("PhysicalHealth", player.Revealed.RevealedValues.Keys);
        Assert.Equal("Original condition", player.PhysicalHealth.Name);
    }

    [Fact]
    public void ConditionRepair_UsesCanonicalCollectionWithoutDuplicates()
    {
        var player = new Player();
        var effect = new PlayerConditionEffect { Id = "effect-1", ConditionId = "physical_152", SeverityCode = "hard" };
        player.AdditionalConditionEffects.Add(effect);

        Assert.True(GmPlayerStateMutator.ChangeConditionSeverity(player, "effect-1", "medium", "Середня форма"));
        Assert.Single(player.AdditionalConditionEffects);
        Assert.Same(effect, player.AdditionalConditionEffects[0]);
        Assert.Equal("medium", effect.SeverityCode);
        Assert.True(GmPlayerStateMutator.RemoveCondition(player, "effect-1"));
        Assert.Empty(player.AdditionalConditionEffects);
    }

    private static (RoomService Service, Room Room, Player Target) CreateRoom()
    {
        var service = new RoomService(NullLogger<RoomService>.Instance);
        var room = service.CreateRoom("test", "host-connection", "Host");
        var host = new Player { Name = "Host", ConnectionId = "host-connection", StablePlayerId = "host-player" };
        var target = new Player { Name = "Target", ConnectionId = "target-connection", StablePlayerId = "target-player" };
        Assert.True(service.JoinRoom(room.Id, host.ConnectionId, host).success);
        Assert.True(service.JoinRoom(room.Id, target.ConnectionId, target).success);
        return (service, room, target);
    }
}
