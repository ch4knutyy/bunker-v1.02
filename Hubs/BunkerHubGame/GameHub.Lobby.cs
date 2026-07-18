using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs;

public partial class GameHub
{
	public Task<LobbyStateDto> GetLobbyState()
	{
		var room = RequireLobbyMember(); return Task.FromResult(_lobbyStart.GetState(room));
	}

	public Task<LobbyGameSettingsDto> GetLobbyGamePreset(string preset)
	{
		RequireLobbyHost();
		if (!Enum.TryParse<GamePreset>(preset, true, out var parsed) || !Enum.IsDefined(parsed) || parsed == GamePreset.Custom)
			throw new HubException("invalid_preset");
		var temporary = new Room { GameSettings = RoomGameSettingsService.Preset(parsed), SettingsRevision = 1 };
		return Task.FromResult(_roomGameSettings.ToDto(temporary));
	}

	public async Task<LobbySettingsApplyResult> ApplyLobbyGameSettings(LobbySettingsUpdateRequest request)
	{
		var room = RequireLobbyHost();
		var actor = _roomService.GetPlayer(Context.ConnectionId)!;
		var result = _roomGameSettings.Apply(room, actor, request);
		if (result.Success && !result.IsDuplicate) await BroadcastLobbyState(room);
		return result;
	}

	public async Task SetLobbyPassword(string? password, string commandId)
	{
		var room = RequireLobbyHost();
		if (room.State != RoomState.Lobby) throw new HubException("lobby_closed");
		var normalized = string.IsNullOrWhiteSpace(password) ? null : password.Trim();
		if (normalized is { Length: > 64 } || normalized?.Any(char.IsControl) == true) throw new HubException("invalid_room_password");
		if (!RememberLobbyCommand(room, commandId)) { await BroadcastLobbyState(room); return; }
		room.Password = normalized;
		await AppendGmAudit(room, GetGmActorId(room), "lobby_password_changed", GmAuditResult.Success,
			normalized == null ? "Lobby password protection was disabled." : "Lobby password protection was updated.",
			commandId: commandId, allowUndo: false);
		await BroadcastLobbyState(room);
	}

	public async Task ResetLobbyReady(string targetPlayerId, string commandId)
	{
		var room = RequireLobbyHost();
		var target = ResolveStableLobbyTarget(room, targetPlayerId);
		if (room.State != RoomState.Lobby) throw new HubException("lobby_closed");
		if (target == null) throw new HubException("target_not_found");
		if (!RememberLobbyCommand(room, commandId)) { await BroadcastLobbyState(room); return; }
		target.IsLobbyReady = false;
		await AppendGmAudit(room, GetGmActorId(room), "lobby_readiness_reset", GmAuditResult.Success,
			"Lobby readiness was reset by the host.", RoomService.GetPlayerKey(target), commandId, allowUndo: false);
		await BroadcastLobbyState(room);
	}

	public async Task KickLobbyPlayer(string targetPlayerId, string commandId)
	{
		var room = RequireLobbyHost();
		var target = ResolveStableLobbyTarget(room, targetPlayerId);
		if (room.State != RoomState.Lobby) throw new HubException("lobby_closed");
		if (target == null) throw new HubException("target_not_found");
		if (room.IsHost(target)) throw new HubException("cannot_kick_host");
		if (!RememberLobbyCommand(room, commandId)) { await BroadcastLobbyState(room); return; }
		var targetConnectionId = _roomService.GetCurrentConnectionId(room, RoomService.GetPlayerKey(target));
		await AppendGmAudit(room, GetGmActorId(room), "lobby_player_kicked", GmAuditResult.Success,
			"A lobby member was removed by the host.", RoomService.GetPlayerKey(target), commandId, allowUndo: false);
		if (!string.IsNullOrWhiteSpace(targetConnectionId))
		{
			await Clients.Client(targetConnectionId).SendAsync("LobbyKicked", new { reason = "removed_by_host" });
			_roomService.LeaveRoom(targetConnectionId);
			await Groups.RemoveFromGroupAsync(targetConnectionId, room.Id);
		}
		await BroadcastLobbyState(room);
		await Clients.All.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());
	}

	public Task<LobbyParticipationPreviewDto> PreviewSetLobbyParticipation(string targetPlayerId, LobbyParticipationRole role)
	{
		var room = RequireLobbyHost(); var target = ResolveStableLobbyTarget(room, targetPlayerId);
		var blockers = ParticipationBlockers(room, target, role);
		return Task.FromResult(new LobbyParticipationPreviewDto(targetPlayerId, target?.Name ?? "Unknown", target?.IsLobbySpectator == true ? "Spectator" : "Player",
			role.ToString(), target?.IsLobbyReady == true, blockers.Count == 0, blockers));
	}

	public async Task SetLobbyParticipation(string targetPlayerId, LobbyParticipationRole role, bool confirmation, string commandId)
	{
		var room = RequireLobbyHost(); var target = ResolveStableLobbyTarget(room, targetPlayerId);
		var blockers = ParticipationBlockers(room, target, role);
		if (!confirmation || blockers.Count > 0) throw new HubException(blockers.FirstOrDefault() ?? "confirmation_required");
		if (!RememberLobbyCommand(room, commandId)) { await BroadcastLobbyState(room); return; }
		var spectator = role == LobbyParticipationRole.Spectator;
		if (target!.IsLobbySpectator != spectator)
		{
			target.IsLobbySpectator = spectator; target.IsLobbyReady = false;
			if (spectator) _roomService.RemoveGameplayParticipation(room, target);
			await AppendGmAudit(room, GetGmActorId(room), "lobby_role_changed", GmAuditResult.Success,
				$"Lobby participation changed to {role}.", RoomService.GetPlayerKey(target), commandId, allowUndo: false);
		}
		await BroadcastLobbyState(room); await SendPublicPlayersUpdate(room);
	}

	public async Task SetLobbyReady(bool isReady, string commandId)
	{
		var room = RequireLobbyMember();
		if (room.State != RoomState.Lobby) throw new HubException("lobby_closed");
		var player = _roomService.GetPlayer(Context.ConnectionId)!;
		if (!RoomService.IsGameplayParticipant(player)) throw new HubException("spectators_not_ready_participants");
		if (!RememberLobbyCommand(room, commandId)) { await BroadcastLobbyState(room); return; }
		if (player.IsLobbyReady != isReady)
		{
			player.IsLobbyReady = isReady;
			await AppendGmAudit(room, RoomService.GetPlayerKey(player), "lobby_readiness_changed", GmAuditResult.Success,
				isReady ? "Lobby member is ready." : "Lobby member is not ready.", commandId: commandId, allowUndo: false);
		}
		await BroadcastLobbyState(room);
	}

	public Task<LobbyStartPreviewDto> PreviewStartGameFromLobby()
	{
		var room = RequireLobbyHost(); var host = _roomService.GetPlayer(Context.ConnectionId)!;
		return Task.FromResult(_lobbyStart.Preview(room, host));
	}

	public async Task StartGameFromLobby(
	string previewToken,
	bool confirmation,
	string commandId)
	{
		var room = RequireLobbyHost();

		var host =
			_roomService.GetPlayer(Context.ConnectionId)!;

		if (!confirmation || string.IsNullOrWhiteSpace(commandId))
		{
			throw new HubException(
				"lobby_start_confirmation_required");
		}

		bool readinessOverrideUsed = false;

		string roomCode = room.Id;
		int playerCount = 0;

		lock (room.GameSettingsSyncRoot)
		{
			lock (room.ProcessedLobbyCommandIds)
			{
				if (room.ProcessedLobbyCommandIds.Contains(commandId))
				{
					return;
				}
			}

			if (!_lobbyStart.TryConsume(
				room,
				host,
				previewToken,
				out var error))
			{
				throw new HubException(
					error ?? "lobby_start_blocked");
			}

			lock (room.ProcessedLobbyCommandIds)
			{
				if (!room.ProcessedLobbyCommandIds.Add(commandId))
				{
					return;
				}
			}

			var settings =
				_roomGameSettings.GetCanonical(room);

			readinessOverrideUsed =
				(settings.HostCanStartWithoutAllReady ||
				 settings.ReadyRequirement ==
				 ReadyRequirementMode.HostDecision) &&
				RoomService
					.GetGameplayPlayersSnapshot(room)
					.Any(entry =>
						entry.Value.IsConnected &&
						!entry.Value.IsLobbyReady);

			var result =
				_roomService.StartGame(
					room.Id,
					Context.ConnectionId,
					_random.Next);

			if (!result.success)
			{
				throw new HubException(
					result.error ?? "lobby_start_failed");
			}

			_roomGameSettings.FreezeForStart(
				room,
				_random.Next);

			PrepareLobbyGameplayCharacters(room);

			playerCount =
				RoomService
					.GetGameplayPlayersSnapshot(room)
					.Count;

			foreach (var player in RoomService
				.GetPlayersSnapshot(room)
				.Select(entry => entry.Value))
			{
				player.IsLobbyReady = false;
			}
		}

		// Спочатку повідомляємо клієнтів про старт.
		await CompleteLobbyStart(room);

		await AppendGmAudit(
			room,
			RoomService.GetPlayerKey(host),
			"game_started_from_lobby",
			GmAuditResult.Success,
			readinessOverrideUsed
				? "Game started after an explicit host readiness override."
				: "Game started after lobby validation.",
			commandId: commandId,
			allowUndo: false);

		// Потім зберігаємо історію в БД.
		if (_gameSessionHistoryService is not null &&
			room.GameSessionId is null)
		{
			try
			{
				Guid sessionId =
					await _gameSessionHistoryService
						.CreateStartedSessionAsync(
							roomCode: roomCode,
							playerCount: playerCount,
							apocalypseId: null,
							bunkerId: null);

				lock (room.GameSettingsSyncRoot)
				{
					room.GameSessionId ??= sessionId;
				}

				_logger.LogInformation(
					"Game session {GameSessionId} linked to room {RoomCode}",
					sessionId,
					roomCode);
			}
			catch (Exception exception)
			{
				_logger.LogError(
					exception,
					"Failed to save started game session for room {RoomCode}",
					roomCode);
			}
		}
	}

	private Room RequireLobbyMember()
	{
		var room = _roomService.GetPlayerRoom(Context.ConnectionId);
		if (room == null || !_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out _)) throw new HubException("lobby_membership_required");
		return room;
	}
	private Room RequireLobbyHost()
	{
		var room = RequireLobbyMember(); var player = _roomService.GetPlayer(Context.ConnectionId);
		if (player == null || !room.IsHost(player)) throw new HubException("lobby_host_required"); return room;
	}
	private Player? ResolveStableLobbyTarget(Room room, string id)
	{
		var player = _roomService.GetPlayerByAnyId(room, id); return player != null && player.StablePlayerId == id ? player : null;
	}
	private static List<string> ParticipationBlockers(Room room, Player? target, LobbyParticipationRole role)
	{
		var blockers = new List<string>();
		var settings = RoomGameSettingsService.Migrate(room.GameSettings);
		if (!Enum.IsDefined(role)) blockers.Add("invalid_lobby_role");
		if (room.State != RoomState.Lobby) blockers.Add("lobby_closed");
		if (target == null) blockers.Add("target_not_found");
		else if (target.IsSpectatorGm || target.GmRole == GmMode.OmniscientGm) blockers.Add("omniscient_role_irreversible");
		else if (role == LobbyParticipationRole.Player && room.IrreversibleOmniscientPlayerIds.Contains(RoomService.GetPlayerKey(target))) blockers.Add("omniscient_role_irreversible");
		else if (role == LobbyParticipationRole.Spectator && !settings.SpectatorsAllowed) blockers.Add("spectators_disabled");
		else if (role == LobbyParticipationRole.Spectator && room.IsHost(target)) blockers.Add("host_cannot_be_spectator");
		else if (role == LobbyParticipationRole.Player && target.IsLobbySpectator &&
				 RoomService.GetGameplayPlayersSnapshot(room).Count >= settings.MaxGameplayPlayers) blockers.Add("maximum_gameplay_players");
		return blockers;
	}
	private static bool RememberLobbyCommand(Room room, string commandId)
	{
		if (string.IsNullOrWhiteSpace(commandId)) return false;
		lock (room.ProcessedLobbyCommandIds) return room.ProcessedLobbyCommandIds.Add(commandId);
	}
	private Task BroadcastLobbyState(Room room) => Clients.Group(room.Id).SendAsync("LobbyStateUpdated", _lobbyStart.GetState(room));
}
