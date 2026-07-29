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
		bool canOpenContentEditor = false,
		bool isDeveloper = false,
		bool developerToolsEnabled = true,
		bool recoveryToolsEnabled = true,
		bool developerCanMutate = true)
	{
		var isHost = room.IsHost(caller);
		var isTechnical = isDeveloper && developerToolsEnabled && developerCanMutate;
		var isOmniscient =
			caller.IsSpectatorGm ||
			caller.GmRole == GmMode.OmniscientGm;
		if (!isHost && !isOmniscient && !isDeveloper)
		{
			return null;
		}

		var canManageGame = isDeveloper ? developerCanMutate : isHost && !isOmniscient;
		var permissions = new GmPanelPermissionsDto(
			CanManageRounds: canManageGame,
			CanManagePlayers: canManageGame,
			CanManageVoting: canManageGame,
			CanManageThreats: canManageGame,
			CanManageBunker: canManageGame,
			CanViewOmniscientData: isDeveloper || isOmniscient &&
				GmCapabilities.Allows(room.GmMode, GmCapability.ViewHiddenGameState),
			CanUseTechnicalTools: isTechnical,
			CanRestoreSnapshots: isTechnical && recoveryToolsEnabled,
			CanUseDangerousActions: isTechnical ||
				(isOmniscient &&
				 GmCapabilities.Allows(room.GmMode, GmCapability.UseDirectorPlayerControls)),
			CanOpenContentEditor: canOpenContentEditor);

		var completed = room.State == RoomState.Finished ||
			room.CurrentPhase == GamePhase.Finished;
		var voting = room.CurrentVoting;
		var threat = room.ThreatState;
		var timer = room.GameTimer;
		var roomPlayers = (room.Players?.Values.AsEnumerable() ??
				Enumerable.Empty<Player>())
			.Where(player => player is not null)
			.DistinctBy(RoomService.GetPlayerKey)
			.ToArray();
		var gameplayPlayers = roomPlayers
			.Where(player =>
				!player.IsEliminated &&
				!player.IsSpectatorGm &&
				!player.IsLobbySpectator &&
				player.GmRole != GmMode.TechnicalGm)
			.ToArray();
		var players = roomPlayers
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
		var readyPlayerCount = room.State == RoomState.Lobby
			? gameplayPlayers.Count(player => player.IsConnected && player.IsLobbyReady)
			: gameplayPlayers.Count(player =>
				room.VotingReadyResponses.TryGetValue(
					RoomService.GetPlayerKey(player),
					out var response) &&
				string.Equals(response, "ready", StringComparison.OrdinalIgnoreCase));
		var readyRequiredCount = gameplayPlayers.Count(player => player.IsConnected);
		var activeVoting = voting?.State == VotingState.Active;
		var unresolvedThreat = threat is not null &&
			threat.ThreatStatus is not ("hidden" or "aborted" or "resolved_safely" or
				"resolved_with_casualty" or "failed" or "completed" or "success" or "failure");
		var canStartVoting = canManageGame &&
			RoundVotingAdminService.CanStartVoting(room, unresolvedThreat).Allowed;
		var canEndRound = canManageGame && !completed &&
			room.CurrentPhase == GamePhase.RoundReveal;
		var canStartGame = canManageGame && room.State == RoomState.Lobby;
		var canEndVoting = canManageGame && !completed && activeVoting;
		var canResumeTimer = canManageGame && !completed &&
			timer?.Status == GameTimerStatus.Paused;
		var canManageActiveThreat = canManageGame && !completed && unresolvedThreat;
		var canFinishPostGameDiscussion = canManageGame &&
			room.PostGamePhase == PostGamePhase.FinalDiscussion;
		var primaryAction = canFinishPostGameDiscussion ? "finish-discussion" :
			canStartGame ? "start-game" :
			canResumeTimer ? "resume-timer" :
			canEndVoting ? "end-voting" :
			canManageActiveThreat ? "open-threat" :
			canEndRound ? "end-round" :
			canStartVoting ? "start-voting" :
			"none";

		return new GmPanelStateDto(
			room.Id,
			isDeveloper ? "Developer" :
			isOmniscient ? "OmniscientGm" :
				isTechnical ? "TechnicalGm" : "Host",
			room.State.ToString(),
			room.State == RoomState.Lobby
				? "Lobby"
				: room.CurrentPhase.ToString(),
			room.State == RoomState.Lobby ? 0 : room.CurrentRound,
			activePlayerCount,
			readyPlayerCount,
			readyRequiredCount,
			room.ResolvedBunkerCapacity ?? room.Bunker?.Capacity,
			room.State == RoomState.Lobby
				? "Inactive"
				: timer?.Status.ToString() ?? "Inactive",
			room.State == RoomState.Lobby ? 0 : RemainingSeconds(timer),
			voting?.State.ToString() ?? "Inactive",
			voting?.RealVoteCount ?? 0,
			voting?.RequiredVoterCount ?? 0,
			voting?.IsTie ?? false,
			VotingSession.RecommendedStartRound,
			voting?.VotingStartedAtRound,
			voting?.IsEarlyVoting ??
				(canStartVoting &&
				 room.CurrentRound < VotingSession.RecommendedStartRound),
			threat?.ThreatStatus ?? (room.IsThreatRevealed ? "Revealed" : "Inactive"),
			room.CurrentThreat?.Name,
			completed,
			room.PostGamePhase.ToString(),
			permissions,
			new GmPanelAvailableActionsDto(
				CanStartGame: canStartGame,
				CanAdvanceRound: canManageGame && !completed &&
					room.CurrentVoting is null &&
					room.CurrentPhase is GamePhase.RoundEnded or GamePhase.VotingResults,
				CanEndRound: canEndRound,
				CanEndGame: canManageGame && !completed &&
					room.State is RoomState.Playing or RoomState.Voting,
				CanStartVoting: canStartVoting,
				CanEndVoting: canEndVoting,
				CanCancelVoting: canEndVoting,
				CanStartTimer: canManageGame && !completed &&
					room.State is RoomState.Playing or RoomState.Voting &&
					timer?.Status is not (GameTimerStatus.Running or GameTimerStatus.Paused),
				CanPauseTimer: canManageGame && !completed &&
					timer?.Status == GameTimerStatus.Running,
				CanResumeTimer: canResumeTimer,
				CanAdjustTimer: canManageGame && !completed && timer is not null &&
					room.State is RoomState.Playing or RoomState.Voting,
				CanManageActiveThreat: canManageActiveThreat,
				CanFinishPostGameDiscussion: canFinishPostGameDiscussion,
				PrimaryAction: primaryAction),
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
