using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class LobbyStartServiceTests
{
    [Fact]
    public void NewRoomAndJoinedMembersHaveCanonicalLobbyRoles()
    {
        var (service, room, host, guest, _) = Setup(); var state = service.GetState(room);
        Assert.Equal("Lobby", state.Lifecycle); Assert.Equal("HostPlayer", state.Members.Single(x => x.PlayerId == host.StablePlayerId).Role);
        Assert.Equal("Player", state.Members.Single(x => x.PlayerId == guest.StablePlayerId).Role); Assert.False(state.CanStart);
    }

    [Fact]
    public void SpectatorTechnicalAndOmniscientAreExcludedFromGameplayCountAndReadiness()
    {
        var (service, room, host, guest, third) = Setup(); guest.IsLobbySpectator = true; third.GmRole = GmMode.TechnicalGm;
        var omni = new Player { Name = "Omni", ConnectionId = "omni", StablePlayerId = "omni-id", IsSpectatorGm = true, GmRole = GmMode.OmniscientGm };
        room.Players[omni.ConnectionId] = omni; room.IrreversibleOmniscientPlayerIds.Add(omni.StablePlayerId);
        host.IsLobbyReady = true;
        var state = service.GetState(room);
        Assert.Equal(1, state.GameplayPlayerCount); Assert.Equal(3, state.SpectatorCount); Assert.Equal(1, state.TechnicalGmCount); Assert.Equal(1, state.OmniscientGmCount);
        Assert.Equal(1, state.ReadyRequiredCount); Assert.Equal(1, state.ReadyCount);
        Assert.DoesNotContain("connected_members_not_ready", state.Blockers);
        Assert.Contains("minimum_gameplay_players", state.Blockers);
    }

    [Fact]
    public void LobbyReadyIsIndependentFromRoundReadinessAndRoleChangeCanResetOnlyTarget()
    {
        var (_, room, host, guest, third) = Setup(); host.IsLobbyReady = true; guest.IsLobbyReady = true; third.IsLobbyReady = true;
        room.VotingReadyResponses[guest.StablePlayerId] = "ready"; guest.IsLobbySpectator = true; guest.IsLobbyReady = false;
        Assert.True(host.IsLobbyReady); Assert.True(third.IsLobbyReady); Assert.False(guest.IsLobbyReady);
        Assert.Equal("ready", room.VotingReadyResponses[guest.StablePlayerId]);
    }

    [Fact]
    public void PreviewIsReadOnlyAndStartTokenBecomesStaleAfterLobbyMutation()
    {
        var (service, room, host, guest, third) = Setup(); foreach (var player in room.Players.Values) player.IsLobbyReady = true;
        var before = JsonSerializer.Serialize(room); var preview = service.Preview(room, host);
        Assert.True(preview.CanStart); Assert.Equal(before, JsonSerializer.Serialize(room)); Assert.DoesNotContain("Profession", JsonSerializer.Serialize(preview));
        guest.IsLobbyReady = false;
        Assert.False(service.TryConsume(room, host, preview.PreviewToken, out var error)); Assert.Equal("lobby_preview_stale", error);
    }

    [Fact]
    public void MinimumIsTwoGameplayPlayersAndRunningCannotStartAgain()
    {
        var (service, room, host, guest, third) = Setup(); third.IsLobbySpectator = true;
        foreach (var player in room.Players.Values) player.IsLobbyReady = true;
        Assert.Equal(2, LobbyStartService.MinimumGameplayPlayers); Assert.True(service.GetState(room).CanStart);
        room.State = RoomState.Playing; Assert.Equal("Running", service.GetState(room).Lifecycle); Assert.False(service.GetState(room).CanStart);
    }

    [Fact]
    public void ExplicitHostReadinessOverrideAllowsStartWithoutMutatingMemberReadyState()
    {
        var (service, room, host, guest, third) = Setup();
        third.IsLobbySpectator = true;
        host.IsLobbyReady = false; guest.IsLobbyReady = false;
        room.GameSettings.HostCanStartWithoutAllReady = true;

        var state = service.GetState(room);

        Assert.True(state.CanStart);
        Assert.False(host.IsLobbyReady);
        Assert.False(guest.IsLobbyReady);
    }

    [Fact]
    public void LobbyDtoContainsNoHiddenPlayerDataOrTransportSecrets()
    {
        var (service, room, _, guest, _) = Setup(); guest.Profession.Name = "Hidden profession"; guest.Inventory.Items.Add(new() { Name = "Hidden item" });
        var json = JsonSerializer.Serialize(service.GetState(room));
        Assert.DoesNotContain("Hidden profession", json); Assert.DoesNotContain("Hidden item", json); Assert.DoesNotContain("ConnectionId", json); Assert.DoesNotContain("HostToken", json);
    }

    [Fact]
    public void RunningGameplaySnapshotExcludesSpectatorAndTechnicalGm()
    {
        var (_, room, host, guest, third) = Setup();
        guest.IsLobbySpectator = true;
        third.GmRole = GmMode.TechnicalGm;
        room.State = RoomState.Playing;

        var gameplay = RoomService.GetGameplayPlayersSnapshot(room);

        Assert.Single(gameplay);
        Assert.Same(host, gameplay[0].Value);
        Assert.DoesNotContain(gameplay, entry => entry.Value == guest || entry.Value == third);
    }

    private static (LobbyStartService Service, Room Room, Player Host, Player Guest, Player Third) Setup()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance); var room = rooms.CreateRoom("Lobby", "host", "Host");
        var host = new Player { Name = "Host", ConnectionId = "host", StablePlayerId = "host-id" };
        var guest = new Player { Name = "Guest", ConnectionId = "guest", StablePlayerId = "guest-id" };
        var third = new Player { Name = "Third", ConnectionId = "third", StablePlayerId = "third-id" };
        rooms.JoinRoom(room.Id, host.ConnectionId, host); rooms.JoinRoom(room.Id, guest.ConnectionId, guest); rooms.JoinRoom(room.Id, third.ConnectionId, third);
        return (new(TimeProvider.System), room, host, guest, third);
    }
}
