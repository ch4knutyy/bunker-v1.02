using System.Security.Claims;
using System.Text.Json;
using Bunker.Hubs;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests;

public sealed class AccountPlayerBindingTests
{
	[Fact]
	public void AuthenticatedNameIdentifierClaimBecomesAccountUserId()
	{
		var userId = Guid.NewGuid();
		var principal = new ClaimsPrincipal(
			new ClaimsIdentity(
				[new Claim(ClaimTypes.NameIdentifier, userId.ToString())],
				"Identity.Application"));

		Assert.Equal(userId, GameHub.ParseAccountUserId(principal));
	}

	[Fact]
	public void GuestHasNoAccountUserId()
	{
		Assert.Null(GameHub.ParseAccountUserId(new ClaimsPrincipal(new ClaimsIdentity())));
	}

	[Fact]
	public void ReconnectCannotReplaceBoundAccount()
	{
		var roomService = new RoomService(NullLogger<RoomService>.Instance);
		var room = roomService.CreateRoom("Room", "old-connection", "Host");
		var originalUserId = Guid.NewGuid();
		var player = new Player
		{
			Name = "Host",
			ConnectionId = "old-connection",
			StablePlayerId = "stable-host",
			AccountUserId = originalUserId
		};
		Assert.True(roomService.JoinRoom(room.Id, player.ConnectionId, player).success);

		var result = roomService.RejoinRoom(
			room.Id,
			"new-connection",
			player.Name,
			player.StablePlayerId,
			Guid.NewGuid());

		Assert.False(result.success);
		Assert.Equal(originalUserId, player.AccountUserId);
		Assert.Equal("old-connection", player.ConnectionId);
	}

	[Fact]
	public void GuestReconnectRemainsUnbound()
	{
		var roomService = new RoomService(NullLogger<RoomService>.Instance);
		var room = roomService.CreateRoom("Room", "old-connection", "Guest");
		var player = new Player
		{
			Name = "Guest",
			ConnectionId = "old-connection",
			StablePlayerId = "stable-guest"
		};
		Assert.True(roomService.JoinRoom(room.Id, player.ConnectionId, player).success);

		var result = roomService.RejoinRoom(
			room.Id,
			"new-connection",
			player.Name,
			player.StablePlayerId);

		Assert.True(result.success);
		Assert.Null(result.player!.AccountUserId);
		Assert.Equal("new-connection", result.player.ConnectionId);
	}

	[Fact]
	public void PublicPlayerJsonDoesNotContainAccountUserId()
	{
		var userId = Guid.NewGuid();
		var json = JsonSerializer.Serialize(new Player
		{
			Name = "Player",
			StablePlayerId = "stable-player",
			AccountUserId = userId
		});

		Assert.DoesNotContain(nameof(Player.AccountUserId), json, StringComparison.Ordinal);
		Assert.DoesNotContain(userId.ToString(), json, StringComparison.OrdinalIgnoreCase);
	}
}
