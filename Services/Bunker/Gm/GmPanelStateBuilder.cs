using Bunker.Models;

namespace Bunker.Services;

public sealed class GmPanelStateBuilder
{
	private readonly TimeProvider _timeProvider;

	public GmPanelStateBuilder(TimeProvider timeProvider)
	{
		_timeProvider = timeProvider;
	}

	public GmPanelStateDto? TryBuild(
		Room room,
		Player caller,
		bool canOpenContentEditor = false)
	{
		var isHost = room.IsHost(caller);
		var isTechnical = isHost &&
			(room.GmMode == GmMode.TechnicalGm ||
			 caller.GmRole == GmMode.TechnicalGm);
		var isOmniscient =
			caller.IsSpectatorGm ||
			caller.GmRole == GmMode.OmniscientGm;
		if (!isHost && !isOmniscient)
		{
			return null;
		}

		var canManageGame = isHost && !isOmniscient;
		var permissions = new GmPanelPermissionsDto(
			CanManageRounds: canManageGame,
			CanManagePlayers: canManageGame,
			CanManageVoting: canManageGame,
			CanManageThreats: canManageGame,
			CanManageBunker: canManageGame,
			CanViewOmniscientData: isOmniscient &&
				GmCapabilities.Allows(room.GmMode, GmCapability.ViewHiddenGameState),
			CanUseTechnicalTools: isTechnical,
			CanRestoreSnapshots: isTechnical,
			CanUseDangerousActions: isTechnical ||
				(isOmniscient &&
				 GmCapabilities.Allows(room.GmMode, GmCapability.UseDirectorPlayerControls)),
			CanOpenContentEditor: canOpenContentEditor);

		var completed = room.State == RoomState.Finished ||
			room.CurrentPhase == GamePhase.Finished;
		var voting = room.CurrentVoting;
		var threat = room.ThreatState;
		var timer = room.GameTimer;
		var players = (room.Players?.Values.AsEnumerable() ??
				Enumerable.Empty<Player>())
			.Where(player => player is not null)
			.DistinctBy(RoomService.GetPlayerKey)
			.Select(player => new GmPanelPlayerSummaryDto(
				RoomService.GetPlayerKey(player),
				player.Name ?? "Unknown",
				player.IsConnected,
				!player.IsEliminated &&
					!player.IsSpectatorGm &&
					!player.IsLobbySpectator &&
					player.GmRole != GmMode.TechnicalGm,
				player.IsEliminated,
				room.IsHost(player),
				CountRevealed(player.Revealed),
				player.IsProtectedFromVote ||
					player.EliminationVoteImmunity?.IsActive == true,
				IsCurrentTurn(room, player)))
			.OrderByDescending(player => player.IsHost)
			.ThenBy(player => player.Name, StringComparer.OrdinalIgnoreCase)
			.ToArray();
		var activePlayerCount = players.Count(player => player.IsActive);

		return new GmPanelStateDto(
			room.Id,
			isOmniscient ? "OmniscientGm" :
				isTechnical ? "TechnicalGm" : "Host",
			room.State.ToString(),
			room.State == RoomState.Lobby
				? "Lobby"
				: room.CurrentPhase.ToString(),
			room.State == RoomState.Lobby ? 0 : room.CurrentRound,
			activePlayerCount,
			room.ResolvedBunkerCapacity ?? room.Bunker?.Capacity,
			room.State == RoomState.Lobby
				? "Inactive"
				: timer?.Status.ToString() ?? "Inactive",
			room.State == RoomState.Lobby ? 0 : RemainingSeconds(timer),
			voting?.State.ToString() ?? "Inactive",
			voting?.RealVoteCount ?? 0,
			voting?.RequiredVoterCount ?? 0,
			voting?.IsTie ?? false,
			threat?.ThreatStatus ?? (room.IsThreatRevealed ? "Revealed" : "Inactive"),
			room.CurrentThreat?.Name,
			completed,
			permissions,
			new GmPanelAvailableActionsDto(
				CanStartGame: canManageGame && room.State == RoomState.Lobby,
				CanAdvanceRound: canManageGame && !completed &&
					room.CurrentVoting is null &&
					room.CurrentPhase is GamePhase.RoundEnded or GamePhase.VotingResults,
				CanEndRound: canManageGame && !completed &&
					room.CurrentPhase == GamePhase.RoundReveal,
				CanEndGame: canManageGame && !completed &&
					room.State is RoomState.Playing or RoomState.Voting),
			players);
	}

	private int RemainingSeconds(GameTimerState? timer)
	{
		if (timer is null)
		{
			return 0;
		}
		if (timer.Status == GameTimerStatus.Paused)
		{
			return Math.Max(0, timer.RemainingSecondsWhenPaused);
		}
		if (timer.Status != GameTimerStatus.Running || !timer.DeadlineUtc.HasValue)
		{
			return timer.Status == GameTimerStatus.Expired
				? 0
				: Math.Max(0, timer.DurationSeconds);
		}

		return Math.Max(
			0,
			(int)Math.Ceiling(
				(timer.DeadlineUtc.Value - _timeProvider.GetUtcNow()).TotalSeconds));
	}

	private static bool IsCurrentTurn(Room room, Player player)
	{
		return !string.IsNullOrWhiteSpace(room.CurrentTurnPlayerId) &&
			(room.CurrentTurnPlayerId == player.ConnectionId ||
			 room.CurrentTurnPlayerId == player.StablePlayerId ||
			 room.CurrentTurnPlayerId == player.Id.ToString());
	}

	private static int CountRevealed(RevealedCharacteristics? revealed)
	{
		if (revealed is null) return 0;
		return new[]
		{
			revealed.Personality,
			revealed.Body,
			revealed.Profession,
			revealed.PhysicalHealth,
			revealed.MentalHealth,
			revealed.Hobby,
			revealed.CharacterTrait,
			revealed.Phobia,
			revealed.Inventory,
			revealed.Property,
			revealed.Fact,
			revealed.SpecialCard
		}.Count(value => value);
	}
}
