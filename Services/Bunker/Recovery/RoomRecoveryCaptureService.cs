using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization.Metadata;
using Bunker.Models;

namespace Bunker.Services;

public sealed record RoomRecoveryCapture(
	string RoomCode,
	string RoomState,
	string StateJson,
	string Fingerprint,
	Guid? GameSessionId);

public sealed class RoomRecoveryCaptureService
{
	public const int CurrentSchemaVersion = 1;
	public const int MaxAuditEntries = 200;
	private static readonly JsonSerializerOptions JsonOptions = CreateJsonOptions();

	public RoomRecoveryCapture Capture(Room room)
	{
		lock (room.RecoverySyncRoot)
		{
			if (string.IsNullOrWhiteSpace(room.PasswordVerificationHash) && !string.IsNullOrEmpty(room.Password))
			{
				room.PasswordVerificationHash = RoomRecoverySecurity.HashPassword(room.Password);
			}

			var identities = new Dictionary<string, RoomRecoveryPlayerIdentityData>(StringComparer.OrdinalIgnoreCase);
			foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value))
			{
				var stableId = RoomService.GetPlayerKey(player);
				if (string.IsNullOrWhiteSpace(player.RecoveryReconnectTokenHash))
				{
					player.RecoveryReconnectTokenHash = RoomRecoverySecurity.HashReconnectToken(stableId);
				}
				identities[stableId] = new()
				{
					AccountUserId = player.AccountUserId,
					ReconnectTokenHash = player.RecoveryReconnectTokenHash
				};
			}

			var data = new RoomRecoverySnapshotData
			{
				Id = room.Id,
				Name = room.Name,
				PasswordVerificationHash = room.PasswordVerificationHash,
				MaxPlayers = room.MaxPlayers,
				MinPlayers = room.MinPlayers,
				HostPlayerId = room.HostPlayerId,
				HostName = room.HostName,
				CreatedAt = room.CreatedAt,
				GmMode = room.GmMode,
				GameSessionId = room.GameSessionId,
				Completion = Clone(room.Completion),
				GuestWarningRevision = Math.Max(1, room.GuestWarningRevision),
				IrreversibleOmniscientPlayerIds = new(room.IrreversibleOmniscientPlayerIds, StringComparer.OrdinalIgnoreCase),
				State = RoomSnapshotService.CaptureState(room),
				PlayerIdentities = identities,
				GmAuditLog = room.GmAuditLog.TakeLast(MaxAuditEntries).Select(Clone).Where(entry => entry != null).Cast<GmAuditEntry>().ToList(),
				NextGmAuditSequenceId = room.NextGmAuditSequenceId,
				ThreatAuditLog = room.ThreatAuditLog.TakeLast(MaxAuditEntries).Select(Clone).Where(entry => entry != null).Cast<ThreatAuditEntry>().ToList(),
				NextThreatAuditSequenceId = room.NextThreatAuditSequenceId
			};
			var json = JsonSerializer.Serialize(data, JsonOptions);
			var fingerprint = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
			return new(room.Id, room.State.ToString(), json, fingerprint, room.GameSessionId);
		}
	}

	public bool TryRestore(string stateJson, out Room? room, out string? error)
	{
		room = null;
		error = null;
		try
		{
			var data = JsonSerializer.Deserialize<RoomRecoverySnapshotData>(stateJson, JsonOptions);
			if (data == null || string.IsNullOrWhiteSpace(data.Id) || data.State == null)
			{
				error = "invalid_payload";
				return false;
			}

			var restored = new Room
			{
				Id = data.Id,
				Name = data.Name,
				Password = null,
				PasswordVerificationHash = data.PasswordVerificationHash,
				MaxPlayers = data.MaxPlayers,
				MinPlayers = data.MinPlayers,
				HostConnectionId = "",
				HostPlayerId = data.HostPlayerId,
				HostName = data.HostName,
				CreatedAt = data.CreatedAt,
				GmMode = data.GmMode,
				GameSessionId = data.GameSessionId,
				Completion = data.Completion,
				GuestWarningRevision = Math.Max(1, data.GuestWarningRevision),
				IrreversibleOmniscientPlayerIds = new(data.IrreversibleOmniscientPlayerIds ?? [], StringComparer.OrdinalIgnoreCase),
				Players = new()
			};

			foreach (var pair in data.State.PlayersByStableId)
			{
				var player = pair.Value;
				player.ConnectionId = "";
				player.IsConnected = false;
				player.DisconnectedAt = null;
				restored.Players[$"recovery:{pair.Key}"] = player;
			}

			RoomSnapshotService.ApplyState(restored, data.State);
			foreach (var entry in restored.Players)
			{
				var player = entry.Value;
				var stableId = RoomService.GetPlayerKey(player);
				if (data.PlayerIdentities.TryGetValue(stableId, out var identity))
				{
					player.AccountUserId = identity.AccountUserId;
					player.RecoveryReconnectTokenHash = identity.ReconnectTokenHash;
				}
				player.ConnectionId = "";
				player.IsConnected = false;
				player.DisconnectedAt = null;
			}
			restored.HostConnectionId = "";
			restored.GmAuditLog = data.GmAuditLog?.TakeLast(MaxAuditEntries).ToList() ?? [];
			restored.NextGmAuditSequenceId = data.NextGmAuditSequenceId;
			restored.ThreatAuditLog = data.ThreatAuditLog?.TakeLast(MaxAuditEntries).ToList() ?? [];
			restored.NextThreatAuditSequenceId = data.NextThreatAuditSequenceId;
			room = restored;
			return true;
		}
		catch (Exception exception) when (exception is JsonException or NotSupportedException)
		{
			error = exception.GetType().Name;
			return false;
		}
	}

	public static bool FingerprintMatches(string stateJson, string expected)
	{
		try
		{
			var actual = SHA256.HashData(Encoding.UTF8.GetBytes(stateJson));
			var expectedBytes = Convert.FromHexString(expected);
			return expectedBytes.Length == actual.Length &&
				CryptographicOperations.FixedTimeEquals(actual, expectedBytes);
		}
		catch (FormatException)
		{
			return false;
		}
	}

	private static T? Clone<T>(T? value) =>
		value == null ? default : JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, JsonOptions), JsonOptions);

	private static JsonSerializerOptions CreateJsonOptions()
	{
		var resolver = new DefaultJsonTypeInfoResolver();
		resolver.Modifiers.Add(typeInfo =>
		{
			if (typeInfo.Type != typeof(Player)) return;
			var connection = typeInfo.Properties.FirstOrDefault(property => property.Name == nameof(Player.ConnectionId));
			if (connection != null) connection.ShouldSerialize = (_, _) => false;
		});
		return new JsonSerializerOptions
		{
			PropertyNameCaseInsensitive = true,
			TypeInfoResolver = resolver
		};
	}
}
