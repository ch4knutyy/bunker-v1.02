using Bunker.Models;
using Bunker.Services;
using Bunker.Services.Bunker.GameSessions;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Hubs
{
	public partial class GameHub
	{
		internal sealed record GameCompletionSnapshot(
			GameCompletionState State,
			Guid? GameSessionId,
			IReadOnlyCollection<GameSessionParticipantResult> ParticipantResults);

		internal static bool TryMarkGameFinishedAfterElimination(
			Room room,
			string source,
			out GameCompletionSnapshot? completion)
		{
			completion = null;

			lock (room.GameSettingsSyncRoot)
			{
				// Повторно завершувати гру не можна.
				if (room.State == RoomState.Finished ||
					room.CurrentPhase == GamePhase.Finished)
				{
					return false;
				}

				if (room.ResolvedBunkerCapacity is not int bunkerCapacity ||
					bunkerCapacity <= 0)
				{
					return false;
				}

				// Поки живих більше, ніж місць у бункері,
				// гра продовжується.
				if (room.GameplayPlayerCount > bunkerCapacity)
				{
					return false;
				}

				GameWinnerState[] winners =
					RoomService.GetPlayersSnapshot(room)
						.Select(entry => entry.Value)
						.Where(player =>
							RoomService.IsGameplayParticipant(player) &&
							!player.IsEliminated)
						.Select(player =>
							new GameWinnerState(
								RoomService.GetPlayerKey(player),
								player.Name))
						.ToArray();

				var completionState = new GameCompletionState(
					"bunker_capacity_reached",
					source,
					bunkerCapacity,
					winners.Length,
					room.CurrentRound,
					DateTime.UtcNow,
					Array.AsReadOnly(winners));

				room.State = RoomState.Finished;
				room.CurrentPhase = GamePhase.Finished;
				room.Completion = completionState;
				room.PostGamePhase = PostGamePhase.FinalDiscussion;

				completion = new GameCompletionSnapshot(
					completionState,
					room.GameSessionId,
					GameSessionParticipantSnapshotFactory.ResultsFromRoom(
						room,
						winners.Select(winner => winner.PlayerId)));

				return true;
			}
		}

		private async Task PublishGameCompletionAsync(
			Room room,
			GameCompletionSnapshot completion,
			string actorId)
		{
			var state = completion.State;
			_gameTimerService.Stop(room);

			// Спочатку повідомляємо клієнтів.
			await Clients.Group(room.Id).SendAsync(
				"GameFinished",
				new
				{
					reason = state.Reason,
					source = state.Source,
					bunkerCapacity = state.BunkerCapacity,
					survivorCount = state.SurvivorCount,
					winners = state.Winners,
					completedAtRound = state.CompletedAtRound,
					completedAtUtc = state.CompletedAtUtc,
					roundState = BuildRoundState(room),
					postGameTransition = BuildPostGameTransition(room)
				});

			await AppendGmAudit(
				room,
				actorId,
				"game_completed",
				GmAuditResult.Success,
				$"Game completed with {state.SurvivorCount} survivors " +
				$"for bunker capacity {state.BunkerCapacity}.",
				allowUndo: false);

			// База не повинна блокувати завершення гри в UI.
			if (_gameSessionHistoryService is null ||
				completion.GameSessionId is not Guid sessionId)
			{
				if (completion.GameSessionId is null)
				{
					_logger.LogWarning(
						"Completed room {RoomCode} has no linked game session",
						room.Id);
				}

				return;
			}

			try
			{
				bool completed =
					await _gameSessionHistoryService
						.CompleteSessionAsync(
							sessionId,
							completion.ParticipantResults);

				if (!completed)
				{
					_logger.LogWarning(
						"Game session {GameSessionId} was not found for room {RoomCode}",
						sessionId,
						room.Id);
				}
			}
			catch (Exception exception)
			{
				_logger.LogError(
					exception,
					"Failed to complete game session {GameSessionId} for room {RoomCode}",
					sessionId,
					room.Id);
			}
		}
	}
}
