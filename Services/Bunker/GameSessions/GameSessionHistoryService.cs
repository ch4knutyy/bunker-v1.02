using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;
using Microsoft.EntityFrameworkCore;

namespace Bunker.Services.Bunker.GameSessions
{
	public sealed class GameSessionHistoryService : IGameSessionHistoryService
	{
		private readonly BunkerDbContext _dbContext;

		public GameSessionHistoryService(BunkerDbContext dbContext)
		{
			_dbContext = dbContext;
		}

		public async Task<Guid> CreateStartedSessionAsync(
			string roomCode,
			int playerCount,
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

			if (playerCount <= 0)
			{
				throw new ArgumentOutOfRangeException(
					nameof(playerCount),
					"Player count must be greater than zero.");
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
				PlayerCount = playerCount,
				ApocalypseId = apocalypseId,
				BunkerId = bunkerId
			};

			_dbContext.GameSessions.Add(session);

			await _dbContext.SaveChangesAsync(cancellationToken);

			return session.Id;
		}
		public async Task<bool> CompleteSessionAsync(Guid sessionId, CancellationToken cancellationToken = default)
		{
			if (sessionId == Guid.Empty)
			{
				throw new ArgumentException(
					"Session ID cannot be empty.",
					nameof(sessionId));
			}

			GameSessionEntity? session =
				await _dbContext.GameSessions
					.SingleOrDefaultAsync(
						item => item.Id == sessionId,
						cancellationToken);

			if (session is null)
			{
				return false;
			}

			if (session.Status == "Completed")
			{
				return true;
			}

			session.Status = "Completed";
			session.EndedAtUtc = DateTime.UtcNow;

			await _dbContext.SaveChangesAsync(cancellationToken);

			return true;
		}
	}
}