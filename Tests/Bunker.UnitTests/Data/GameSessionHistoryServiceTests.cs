using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;
using Bunker.Services.Bunker.GameSessions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bunker.UnitTests.Data
{
	public class GameSessionHistoryServiceTests
	{
		[Fact]
		public async Task CreateStartedSessionAsync_SavesStartedSession()
		{
			await using var connection =
				new SqliteConnection("Data Source=:memory:");

			await connection.OpenAsync();

			var options =
				new DbContextOptionsBuilder<BunkerDbContext>()
					.UseSqlite(connection)
					.Options;

			await using (var setupContext =
				new BunkerDbContext(options))
			{
				await setupContext.Database.EnsureCreatedAsync();
			}

			Guid sessionId;

			await using (var writeContext =
				new BunkerDbContext(options))
			{
				var service =
					new GameSessionHistoryService(writeContext);

				sessionId =
					await service.CreateStartedSessionAsync(
						roomCode: "ROOM1234",
						playerCount: 2,
						apocalypseId: "apocalypse-1",
						bunkerId: "bunker-1");
			}

			await using var readContext =
				new BunkerDbContext(options);

			GameSessionEntity savedSession =
				await readContext.GameSessions.SingleAsync(
					session => session.Id == sessionId);

			Assert.Equal("ROOM1234", savedSession.RoomCode);
			Assert.Equal("Started", savedSession.Status);
			Assert.Equal(2, savedSession.PlayerCount);
			Assert.Equal(
				"apocalypse-1",
				savedSession.ApocalypseId);
			Assert.Equal("bunker-1", savedSession.BunkerId);

			Assert.NotEqual(
				default,
				savedSession.CreatedAtUtc);

			Assert.NotNull(savedSession.StartedAtUtc);

			Assert.Equal(
				savedSession.CreatedAtUtc,
				savedSession.StartedAtUtc!.Value);

			Assert.Null(savedSession.EndedAtUtc);
		}

		[Fact]
		public async Task CompleteSessionAsync_UpdatesExistingSession()
		{
			await using var connection =
				new SqliteConnection("Data Source=:memory:");

			await connection.OpenAsync();

			var options =
				new DbContextOptionsBuilder<BunkerDbContext>()
					.UseSqlite(connection)
					.Options;

			await using (var setupContext = new BunkerDbContext(options))
			{
				await setupContext.Database.EnsureCreatedAsync();

				setupContext.GameSessions.Add(
					new GameSessionEntity
					{
						Id = Guid.Parse(
							"11111111-2222-3333-4444-555555555555"),
						RoomCode = "ROOM1234",
						CreatedAtUtc = DateTime.UtcNow,
						StartedAtUtc = DateTime.UtcNow,
						Status = "Started",
						PlayerCount = 2
					});

				await setupContext.SaveChangesAsync();
			}

			Guid sessionId =
				Guid.Parse("11111111-2222-3333-4444-555555555555");

			await using (var updateContext = new BunkerDbContext(options))
			{
				var service =
					new GameSessionHistoryService(updateContext);

				bool completed =
					await service.CompleteSessionAsync(sessionId);

				Assert.True(completed);
			}

			await using var readContext =
				new BunkerDbContext(options);

			GameSessionEntity savedSession =
				await readContext.GameSessions
					.SingleAsync(item => item.Id == sessionId);

			Assert.Equal("Completed", savedSession.Status);
			Assert.NotNull(savedSession.EndedAtUtc);
		}
	}
}