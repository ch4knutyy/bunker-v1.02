using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bunker.UnitTests.Data
{
	public class BunkerDbContextTests
	{
		[Fact]
		public async Task CanSaveAndReadGameSession()
		{
			await using var connection =
				new SqliteConnection("Data Source=:memory:");

			await connection.OpenAsync();

			var options =
				new DbContextOptionsBuilder<BunkerDbContext>()
					.UseSqlite(connection)
					.Options;

			Guid sessionId = Guid.NewGuid();

			await using (var writeContext = new BunkerDbContext(options))
			{
				await writeContext.Database.EnsureCreatedAsync();

				var session = new GameSessionEntity
				{
					Id = sessionId,
					RoomCode = "TEST1234",
					CreatedAtUtc = DateTime.UtcNow,
					Status = "Created",
					PlayerCount = 2
				};

				writeContext.GameSessions.Add(session);

				await writeContext.SaveChangesAsync();
			}

			await using (var readContext = new BunkerDbContext(options))
			{
				GameSessionEntity savedSession =
					await readContext.GameSessions.SingleAsync(
						session => session.Id == sessionId);

				Assert.Equal("TEST1234", savedSession.RoomCode);
				Assert.Equal("Created", savedSession.Status);
				Assert.Equal(2, savedSession.PlayerCount);
			}
		}
	}
}