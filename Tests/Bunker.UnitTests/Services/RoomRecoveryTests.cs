using System.Security.Cryptography;
using System.Text;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class RoomRecoveryTests
{
	[Fact]
	public void CaptureAndRestorePreserveGameplayAndIdentityWithoutRawSecrets()
	{
		var rooms = new RoomService(NullLogger<RoomService>.Instance);
		var room = rooms.CreateRoom("Recovery", "host-connection-secret", "Host", password: "room-password-secret");
		var accountId = Guid.NewGuid();
		var host = new Player
		{
			Name = "Host",
			ConnectionId = "host-connection-secret",
			StablePlayerId = "host-stable",
			AccountUserId = accountId
		};
		var guest = new Player
		{
			Name = "Guest",
			ConnectionId = "guest-connection-secret",
			StablePlayerId = "guest-stable",
			RecoveryReconnectTokenHash = Hash("guest-reconnect-secret")
		};
		guest.Profession.Name = "Engineer";
		guest.Inventory.Items.Add(new() { Name = "Recovery item" });
		Assert.True(rooms.JoinRoom(room.Id, host.ConnectionId, host, "room-password-secret").success);
		Assert.True(rooms.JoinRoom(room.Id, guest.ConnectionId, guest, "room-password-secret").success);
		room.State = RoomState.Playing;
		room.CurrentPhase = GamePhase.RoundReveal;
		room.CurrentRound = 4;
		room.GameSessionId = Guid.NewGuid();

		var captureService = new RoomRecoveryCaptureService();
		var capture = captureService.Capture(room);

		Assert.True(RoomRecoveryCaptureService.FingerprintMatches(capture.StateJson, capture.Fingerprint));
		Assert.DoesNotContain("room-password-secret", capture.StateJson);
		Assert.DoesNotContain("guest-reconnect-secret", capture.StateJson);
		Assert.DoesNotContain(room.HostToken, capture.StateJson);
		Assert.DoesNotContain("host-connection-secret", capture.StateJson);
		Assert.DoesNotContain("guest-connection-secret", capture.StateJson);
		Assert.DoesNotContain("\"ConnectionId\"", capture.StateJson);
		Assert.DoesNotContain("\"HostToken\"", capture.StateJson);
		Assert.Contains(accountId.ToString(), capture.StateJson, StringComparison.OrdinalIgnoreCase);

		Assert.True(captureService.TryRestore(capture.StateJson, out var restored, out var error), error);
		Assert.NotNull(restored);
		Assert.Equal(RoomState.Playing, restored.State);
		Assert.Equal(GamePhase.RoundReveal, restored.CurrentPhase);
		Assert.Equal(4, restored.CurrentRound);
		Assert.Equal(room.GameSessionId, restored.GameSessionId);
		Assert.Empty(restored.HostConnectionId);
		Assert.NotEqual(room.HostToken, restored.HostToken);
		Assert.All(restored.Players.Values, player =>
		{
			Assert.False(player.IsConnected);
			Assert.Empty(player.ConnectionId);
		});
		var restoredHost = restored.Players.Values.Single(player => player.StablePlayerId == host.StablePlayerId);
		var restoredGuest = restored.Players.Values.Single(player => player.StablePlayerId == guest.StablePlayerId);
		Assert.Equal(accountId, restoredHost.AccountUserId);
		Assert.Equal("Engineer", restoredGuest.Profession.Name);
		Assert.Contains(restoredGuest.Inventory.Items, item => item.Name == "Recovery item");
	}

	[Fact]
	public void RecoveredGuestRequiresMatchingReconnectTokenAndHostReceivesNewRuntimeBinding()
	{
		var rooms = new RoomService(NullLogger<RoomService>.Instance);
		var source = rooms.CreateRoom("Recovery", "old-host", "Host");
		var guest = new Player
		{
			Name = "Guest",
			ConnectionId = "old-host",
			StablePlayerId = "guest-stable",
			RecoveryReconnectTokenHash = Hash("correct-token")
		};
		Assert.True(rooms.JoinRoom(source.Id, guest.ConnectionId, guest).success);
		var captureService = new RoomRecoveryCaptureService();
		var capture = captureService.Capture(source);
		Assert.True(captureService.TryRestore(capture.StateJson, out var restored, out _));

		var recoveredRooms = new RoomService(NullLogger<RoomService>.Instance);
		Assert.True(recoveredRooms.TryRegisterRecoveredRoom(restored!));
		var rejected = recoveredRooms.RejoinRoom(restored!.Id, "new-connection", "Guest", "guest-stable", null, "wrong-token");
		Assert.False(rejected.success);

		var accepted = recoveredRooms.RejoinRoom(restored.Id, "new-connection", "Guest", "guest-stable", null, "correct-token");
		Assert.True(accepted.success);
		Assert.True(accepted.wasHost);
		Assert.Equal("new-connection", restored.HostConnectionId);
		Assert.True(accepted.player!.IsConnected);
	}

	[Fact]
	public void PropertyGeneratedValuesSurvivePersistentRecoveryExactly()
	{
		var rooms = new RoomService(NullLogger<RoomService>.Instance);
		var room = rooms.CreateRoom("Property recovery", "host-connection", "Host");
		var player = new Player
		{
			Name = "Host",
			ConnectionId = "host-connection",
			StablePlayerId = "host-stable",
			Property = new GeneratedProperty
			{
				DefinitionId = "property-recovery",
				GeneratedValues = new() { ["area"] = 42 },
				LocalizedDisplay = new() { ["uk"] = "Ділянка 42 м²", ["en"] = "Lot 42 m²" },
				Category = "land",
				SizeClass = "large",
				ResourceTags = ["land"],
				ProtectionTags = ["shelter"]
			}
		};
		player.Revealed.Property = true;
		Assert.True(rooms.JoinRoom(room.Id, player.ConnectionId, player).success);

		var captureService = new RoomRecoveryCaptureService();
		var capture = captureService.Capture(room);
		Assert.True(captureService.TryRestore(capture.StateJson, out var restored, out var error), error);

		var restoredPlayer = Assert.Single(restored!.Players.Values);
		Assert.Equal("property-recovery", restoredPlayer.Property!.DefinitionId);
		Assert.Equal(42, restoredPlayer.Property.GeneratedValues["area"]);
		Assert.Equal("Ділянка 42 м²", restoredPlayer.Property.GetDisplayText("uk"));
		Assert.True(restoredPlayer.Revealed.Property);
	}

	[Fact]
	public void CorruptFingerprintIsRejected()
	{
		var json = "{\"id\":\"ROOM\"}";
		Assert.False(RoomRecoveryCaptureService.FingerprintMatches(json + "x", Hash(json)));
	}

	private static string Hash(string value) =>
		Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value))).ToLowerInvariant();
}
