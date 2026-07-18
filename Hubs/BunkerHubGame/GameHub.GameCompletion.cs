using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Collections.Immutable;

namespace Bunker.Hubs
{
	public partial class GameHub
	{
		internal sealed record GameWinnerSummary(
			string PlayerId,
			string Name);

		internal sealed record GameCompletionSnapshot(
			int BunkerCapacity,
			int SurvivorCount,
			ImmutableArray<GameWinnerSummary> Winners,
			Guid? GameSessionId,
			int CurrentRound);

		internal static bool TryMarkGameFinishedAfterElimination(
			Room room,
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

				ImmutableArray<GameWinnerSummary> winners =
					RoomService.GetPlayersSnapshot(room)
						.Select(entry => entry.Value)
						.Where(player =>
							RoomService.IsGameplayParticipant(player) &&
							!player.IsEliminated)
						.Select(player =>
							new GameWinnerSummary(
								RoomService.GetPlayerKey(player),
								player.Name))
						.ToImmutableArray();

				room.State = RoomState.Finished;
				room.CurrentPhase = GamePhase.Finished;

				completion = new GameCompletionSnapshot(
					bunkerCapacity,
					winners.Length,
					winners,
					room.GameSessionId,
					room.CurrentRound);

				return true;
			}
		}

		private async Task PublishGameCompletionAsync(
			Room room,
			GameCompletionSnapshot completion,
			string actorId,
			string source)
		{
			// Спочатку повідомляємо клієнтів.
			await Clients.Group(room.Id).SendAsync(
				"GameFinished",
				new
				{
					reason = "bunker_capacity_reached",
					source,
					bunkerCapacity = completion.BunkerCapacity,
					survivorCount = completion.SurvivorCount,
					winners = completion.Winners.Select(winner => new
					{
						playerId = winner.PlayerId,
						name = winner.Name
					}),
					currentRound = completion.CurrentRound,
					roundState = BuildRoundState(room)
				});

			await AppendGmAudit(
				room,
				actorId,
				"game_completed",
				GmAuditResult.Success,
				$"Game completed with {completion.SurvivorCount} survivors " +
				$"for bunker capacity {completion.BunkerCapacity}.",
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
						.CompleteSessionAsync(sessionId);

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
