using System.Text.Json;
using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests;

public sealed class GmPanelPermissionsTests
{
	[Fact]
	public void HostDeveloperAndOmniscientModesReceiveDistinctServerPermissions()
	{
		var builder = new GmPanelStateBuilder(TimeProvider.System);

		var normal = CreateRoom(GmMode.PlayerHost);
		var normalState = builder.TryBuild(normal.Room, normal.Host)!;
		Assert.True(normalState.Permissions.CanManageRounds);
		Assert.True(normalState.Permissions.CanManagePlayers);
		Assert.True(normalState.Permissions.CanManageVoting);
		Assert.False(normalState.Permissions.CanUseTechnicalTools);
		Assert.False(normalState.Permissions.CanViewOmniscientData);

		var technical = CreateRoom(GmMode.TechnicalGm);
		var technicalState = builder.TryBuild(technical.Room, technical.Host)!;
		Assert.True(technicalState.Permissions.CanManageRounds);
		Assert.False(technicalState.Permissions.CanUseTechnicalTools);
		Assert.False(technicalState.Permissions.CanRestoreSnapshots);

		var developerState = builder.TryBuild(
			technical.Room,
			technical.Host,
			canOpenContentEditor: true,
			isDeveloper: true)!;
		Assert.Equal("Developer", developerState.Role);
		Assert.True(developerState.Permissions.CanUseTechnicalTools);
		Assert.True(developerState.Permissions.CanRestoreSnapshots);
		Assert.True(developerState.Permissions.CanOpenContentEditor);

		var readOnlyDeveloperState = builder.TryBuild(
			technical.Room,
			technical.Host,
			isDeveloper: true,
			developerCanMutate: false)!;
		Assert.Equal("Developer", readOnlyDeveloperState.Role);
		Assert.False(readOnlyDeveloperState.Permissions.CanManageRounds);
		Assert.False(readOnlyDeveloperState.Permissions.CanUseTechnicalTools);
		Assert.True(readOnlyDeveloperState.Permissions.CanViewOmniscientData);

		var omniscient = CreateRoom(GmMode.OmniscientGm);
		var spectator = new Player
		{
			Name = "Observer",
			ConnectionId = "observer-connection",
			StablePlayerId = "observer",
			GmRole = GmMode.OmniscientGm,
			IsSpectatorGm = true
		};
		omniscient.Room.Players[spectator.ConnectionId] = spectator;
		var omniscientState = builder.TryBuild(omniscient.Room, spectator)!;
		Assert.True(omniscientState.Permissions.CanViewOmniscientData);
		Assert.False(omniscientState.Permissions.CanManageRounds);
		Assert.False(omniscientState.Permissions.CanManagePlayers);
		Assert.False(omniscientState.Permissions.CanUseTechnicalTools);
	}

	[Fact]
	public void PlayersAndOrdinarySpectatorsReceiveNoGmPanelState()
	{
		var builder = new GmPanelStateBuilder(TimeProvider.System);
		var setup = CreateRoom(GmMode.PlayerHost);
		var player = new Player
		{
			Name = "Player",
			ConnectionId = "player-connection",
			StablePlayerId = "player"
		};
		var spectator = new Player
		{
			Name = "Spectator",
			ConnectionId = "spectator-connection",
			StablePlayerId = "spectator",
			IsLobbySpectator = true
		};
		setup.Room.Players[player.ConnectionId] = player;
		setup.Room.Players[spectator.ConnectionId] = spectator;

		Assert.Null(builder.TryBuild(setup.Room, player));
		Assert.Null(builder.TryBuild(setup.Room, spectator));
	}

	[Fact]
	public void OwnerContentFlagIsIndependentOfRoomGmModeAndDtoContainsNoSecrets()
	{
		var builder = new GmPanelStateBuilder(TimeProvider.System);
		var normal = CreateRoom(GmMode.PlayerHost);
		normal.Host.AccountUserId = Guid.NewGuid();
		normal.Room.HostToken = "host-secret";
		normal.Room.Password = "room-secret";

		var ownerState = builder.TryBuild(
			normal.Room,
			normal.Host,
			canOpenContentEditor: true)!;
		var nonOwnerState = builder.TryBuild(
			normal.Room,
			normal.Host,
			canOpenContentEditor: false)!;
		var serialized = JsonSerializer.Serialize(ownerState);

		Assert.True(ownerState.Permissions.CanOpenContentEditor);
		Assert.False(nonOwnerState.Permissions.CanOpenContentEditor);
		Assert.DoesNotContain("AccountUserId", serialized);
		Assert.DoesNotContain("HostToken", serialized);
		Assert.DoesNotContain("Password", serialized);
		Assert.DoesNotContain("ReconnectToken", serialized);
		Assert.DoesNotContain("ConnectionId", serialized);
	}

	private static (Room Room, Player Host) CreateRoom(GmMode mode)
	{
		var host = new Player
		{
			Name = "Host",
			ConnectionId = "host-connection",
			StablePlayerId = "host",
			GmRole = mode == GmMode.PlayerHost ? GmMode.PlayerHost : mode
		};
		var room = new Room
		{
			Id = "ROOMV2",
			HostConnectionId = host.ConnectionId,
			HostPlayerId = host.StablePlayerId,
			GmMode = mode,
			State = RoomState.Playing,
			CurrentPhase = GamePhase.RoundReveal,
			CurrentRound = 2
		};
		room.Players[host.ConnectionId] = host;
		return (room, host);
	}
}
