using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;

namespace Bunker.Services.Bunker.GameSessions
{
	public sealed class GameSessionHistoryService
		: IGameSessionHistoryService
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
	}
}