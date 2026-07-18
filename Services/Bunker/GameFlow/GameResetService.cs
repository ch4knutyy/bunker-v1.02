using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services.Bunker.GameSessions;

namespace Bunker.Services;

internal sealed record GameResetResult(
	bool Success,
	bool IsDuplicate,
	string? ErrorCode,
	Guid? PreviousGameSessionId,
	IReadOnlyCollection<GameSessionParticipantResult> ParticipantResults);

internal static class GameResetService
{
	public static GameResetResult TryReturnFinishedGameToLobby(
		Room room,
		string commandId)
	{
		lock (room.GameSettingsSyncRoot)
		{
			lock (room.ProcessedGameResetCommandIds)
			{
				if (room.ProcessedGameResetCommandIds.Contains(commandId))
				{
					return new GameResetResult(
						false,
						true,
						null,
						null,
						Array.Empty<GameSessionParticipantResult>());
				}
			}

			if (room.State != RoomState.Finished ||
				room.CurrentPhase != GamePhase.Finished)
			{
				return new GameResetResult(
					false,
					false,
					"game_not_finished",
					null,
					Array.Empty<GameSessionParticipantResult>());
			}

			lock (room.ProcessedGameResetCommandIds)
			{
				if (!room.ProcessedGameResetCommandIds.Add(commandId))
				{
					return new GameResetResult(
						false,
						true,
						null,
						null,
						Array.Empty<GameSessionParticipantResult>());
				}
			}

			var previousGameSessionId = room.GameSessionId;
			var participantResults =
				GameSessionParticipantSnapshotFactory.ResultsFromRoom(
					room,
					room.Completion?.Winners.Select(winner => winner.PlayerId) ??
						Array.Empty<string>());

			room.State = RoomState.Lobby;
			room.CurrentPhase = GamePhase.Lobby;
			room.CurrentRound = 0;
			room.CurrentTurnPlayerId = null;
			room.Completion = null;
			room.GameSessionId = null;
			room.CurrentVoting = null;
			room.VotingReadyResponses = new();
			room.CurrentRoundReveals = new();
			room.RoundDiceRolls = new();
			room.AdditionalInventoryGrantedAfterRound3 = false;
			room.CurrentThreat = null;
			room.ThreatState = null;
			room.IsThreatRevealed = false;
			room.ThreatRevealedAtRound = null;
			room.TriggeredThreatIds = new(StringComparer.OrdinalIgnoreCase);
			room.ThreatRoundsTriggered = new();
			room.ThreatsTriggeredCount = 0;
			room.GameTimer = new();
			room.IsPaused = false;
			room.PauseReason = null;
			room.PausedAtUtc = null;
			room.PausedByPlayerId = null;
			room.Bunker = null;
			room.Apocalypse = null;
			room.ResolvedBunkerCapacity = null;
			room.SettingsFrozen = false;
			room.FrozenGameSettings = null;

			room.ProcessedOmniscientCommandIds = new(StringComparer.OrdinalIgnoreCase);
			room.ProcessedLobbyCommandIds = new(StringComparer.OrdinalIgnoreCase);
			room.ProcessedGmThreatCommandIds = new(StringComparer.OrdinalIgnoreCase);
			room.ProcessedGmPlayerCommandIds = new(StringComparer.OrdinalIgnoreCase);
			room.ProcessedRoomIntegrityCommandIds = new(StringComparer.OrdinalIgnoreCase);
			room.ProcessedSnapshotCommandIds = new(StringComparer.OrdinalIgnoreCase);
			room.ProcessedRoomEditorCommandIds = new(StringComparer.OrdinalIgnoreCase);
			room.ThreatAuditLog = new();
			room.NextThreatAuditSequenceId = 0;
			room.GmAuditLog = new();
			room.NextGmAuditSequenceId = 0;
			room.SnapshotHistory = new();
			room.SnapshotCommandResults = new(StringComparer.OrdinalIgnoreCase);

			foreach (var player in RoomService
				.GetPlayersSnapshot(room)
				.Select(entry => entry.Value))
			{
				ResetPlayerForLobby(player);
			}

			return new GameResetResult(
				true,
				false,
				null,
				previousGameSessionId,
				participantResults);
		}
	}

	private static void ResetPlayerForLobby(Player player)
	{
		player.IsLobbyReady = false;
		player.Profession = new Profession();
		player.ProfessionItem = new Item();
		player.Inventory = new Inventory();
		player.PersonalInfo = new PersonalInfo();
		player.CharacterTrait = new CharacterTrait();
		player.Phobia = new Phobia();
		player.PhysicalHealth = new PhysicalHealth();
		player.MentalHealth = new MentalHealth();
		player.Hobby = new Hobby();
		player.Personality = new Personality();
		player.Body = new Body();
		player.Fact = new Fact();
		player.SpecialCard = new SpecialCard();
		player.SpecialCards = new();
		player.Revealed = new RevealedCharacteristics();
		player.IsEliminated = false;
		player.EliminatedAtRound = null;
		player.EliminatedByVote = false;
		player.CanRevealAllAfterElimination = false;
		player.HasRevealedAllAfterElimination = false;
		player.SeatNumber = 0;
		player.IsProtectedFromVote = false;
		player.ExtraVotes = 0;
		player.InventoryProtectedUntilRound = null;
		player.CharacteristicsProtectedUntilRound = null;
		player.EliminationVoteImmunity = new EliminationVoteImmunity();
		player.AdditionalConditionEffects = new();
	}
}
