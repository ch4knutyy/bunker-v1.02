using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.Services.Bunker.GameSessions
{
	public sealed class GameSessionHistoryService : IGameSessionHistoryService
	{
		private readonly BunkerDbContext _dbContext;
		private readonly ILogger<GameSessionHistoryService> _logger;

		public GameSessionHistoryService(
			BunkerDbContext dbContext,
			ILogger<GameSessionHistoryService>? logger = null)
		{
			_dbContext = dbContext;
			_logger = logger ?? NullLogger<GameSessionHistoryService>.Instance;
		}

		public async Task<Guid> CreateStartedSessionAsync(
			string roomCode,
			IReadOnlyCollection<GameSessionParticipantSnapshot> participants,
			string? apocalypseId = null,
			string? bunkerId = null,
			CancellationToken cancellationToken = default)
		{
			if (string.IsNullOrWhiteSpace(roomCode))
			{
				throw new ArgumentException(
					"Room code cannot be empty.",
					nameof(roomCode));
			}

			if (participants is null || participants.Count == 0)
			{
				throw new ArgumentException(
					"At least one gameplay participant is required.",
					nameof(participants));
			}

			var duplicateStablePlayerId = participants
				.GroupBy(participant => participant.StablePlayerId, StringComparer.Ordinal)
				.FirstOrDefault(group => group.Count() > 1)
				?.Key;
			if (duplicateStablePlayerId is not null)
			{
				throw new ArgumentException(
					$"Duplicate stable player ID '{duplicateStablePlayerId}'.",
					nameof(participants));
			}

			DateTime nowUtc = DateTime.UtcNow;

			var session = new GameSessionEntity
			{
				Id = Guid.NewGuid(),
				RoomCode = roomCode.Trim(),
				CreatedAtUtc = nowUtc,
				StartedAtUtc = nowUtc,
				EndedAtUtc = null,
				Status = "Started",
				PlayerCount = participants.Count,
				ApocalypseId = apocalypseId,
				BunkerId = bunkerId
			};

			foreach (var participant in participants)
			{
				if (string.IsNullOrWhiteSpace(participant.StablePlayerId) ||
					string.IsNullOrWhiteSpace(participant.PlayerName))
				{
					throw new ArgumentException(
						"Participant stable ID and name are required.",
						nameof(participants));
				}

				session.GameSessionPlayers.Add(new GameSessionPlayerEntity
				{
					Id = Guid.NewGuid(),
					UserId = participant.UserId,
					StablePlayerIdSnapshot = participant.StablePlayerId,
					PlayerNameSnapshot = participant.PlayerName,
					IsHost = participant.IsHost,
					IsWinner = false,
					WasEliminated = false,
					EliminatedAtRound = null
				});
			}

			_dbContext.GameSessions.Add(session);

			await _dbContext.SaveChangesAsync(cancellationToken);

			return session.Id;
		}
		public async Task<bool> CompleteSessionAsync(
			Guid sessionId,
			IReadOnlyCollection<GameSessionParticipantResult> participantResults,
			CancellationToken cancellationToken = default)
		{
			if (sessionId == Guid.Empty)
			{
				throw new ArgumentException(
					"Session ID cannot be empty.",
					nameof(sessionId));
			}

			ArgumentNullException.ThrowIfNull(participantResults);

			GameSessionEntity? session =
				await _dbContext.GameSessions
					.Include(item => item.GameSessionPlayers)
					.SingleOrDefaultAsync(
						item => item.Id == sessionId,
						cancellationToken);

			if (session is null)
			{
				return false;
			}

			if (session.Status == "Completed")
			{
				if (session.EndedAtUtc is null)
				{
					session.EndedAtUtc = DateTime.UtcNow;
					await _dbContext.SaveChangesAsync(cancellationToken);
				}

				return true;
			}

			session.Status = "Completed";
			session.EndedAtUtc ??= DateTime.UtcNow;

			var participantsByStableId = session.GameSessionPlayers
				.ToDictionary(
					participant => participant.StablePlayerIdSnapshot,
					StringComparer.Ordinal);

			foreach (var result in participantResults)
			{
				if (!participantsByStableId.TryGetValue(result.StablePlayerId, out var participant))
				{
					_logger.LogWarning(
						"Participant {StablePlayerId} was not found in game session {GameSessionId} during completion",
						result.StablePlayerId,
						sessionId);
					continue;
				}

				participant.IsWinner = result.IsWinner;
				participant.WasEliminated = result.WasEliminated;
				participant.EliminatedAtRound = result.EliminatedAtRound;
			}

			await _dbContext.SaveChangesAsync(cancellationToken);

			return true;
		}
	}
}
