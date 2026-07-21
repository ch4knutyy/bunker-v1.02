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
						participants:
						[
							new(null, "player-1", "Player 1", true),
							new(null, "player-2", "Player 2", false)
						],
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
					await service.CompleteSessionAsync(
						sessionId,
						Array.Empty<GameSessionParticipantResult>());

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

		[Fact]
		public async Task AbandonSessionAsync_OnlyTransitionsStartedAndIsIdempotent()
		{
			await using var connection = new SqliteConnection("Data Source=:memory:");
			await connection.OpenAsync();
			var options = new DbContextOptionsBuilder<BunkerDbContext>().UseSqlite(connection).Options;

			await using (var setup = new BunkerDbContext(options))
			{
				await setup.Database.EnsureCreatedAsync();
				setup.GameSessions.AddRange(
					Session(Guid.Parse("10000000-0000-0000-0000-000000000001"), GameSessionStatuses.Started),
					Session(Guid.Parse("10000000-0000-0000-0000-000000000002"), GameSessionStatuses.Completed));
				await setup.SaveChangesAsync();
			}

			await using (var update = new BunkerDbContext(options))
			{
				var service = new GameSessionHistoryService(update);
				Assert.True(await service.AbandonSessionAsync(
					Guid.Parse("10000000-0000-0000-0000-000000000001"), "last_player_left"));
				Assert.True(await service.AbandonSessionAsync(
					Guid.Parse("10000000-0000-0000-0000-000000000001"), "retry"));
				Assert.False(await service.AbandonSessionAsync(
					Guid.Parse("10000000-0000-0000-0000-000000000002"), "must_not_overwrite"));
			}

			await using var read = new BunkerDbContext(options);
			var abandoned = await read.GameSessions.FindAsync(Guid.Parse("10000000-0000-0000-0000-000000000001"));
			var completed = await read.GameSessions.FindAsync(Guid.Parse("10000000-0000-0000-0000-000000000002"));
			Assert.Equal(GameSessionStatuses.Abandoned, abandoned!.Status);
			Assert.NotNull(abandoned.EndedAtUtc);
			Assert.Equal(GameSessionStatuses.Completed, completed!.Status);
		}

		[Fact]
		public async Task AbandonStartedSessionsAsync_ClosesOnlySessionsFromBeforeStartup()
		{
			await using var connection = new SqliteConnection("Data Source=:memory:");
			await connection.OpenAsync();
			var options = new DbContextOptionsBuilder<BunkerDbContext>().UseSqlite(connection).Options;
			var startupUtc = new DateTime(2026, 7, 21, 12, 0, 0, DateTimeKind.Utc);

			await using (var setup = new BunkerDbContext(options))
			{
				await setup.Database.EnsureCreatedAsync();
				var stale = Session(Guid.NewGuid(), GameSessionStatuses.Started);
				stale.CreatedAtUtc = startupUtc.AddMinutes(-1);
				var current = Session(Guid.NewGuid(), GameSessionStatuses.Started);
				current.CreatedAtUtc = startupUtc.AddMinutes(1);
				setup.GameSessions.AddRange(stale, current);
				await setup.SaveChangesAsync();
			}

			await using (var update = new BunkerDbContext(options))
			{
				var count = await new GameSessionHistoryService(update)
					.AbandonStartedSessionsAsync(startupUtc, "startup_recovery");
				Assert.Equal(1, count);
			}

			await using var read = new BunkerDbContext(options);
			Assert.Equal(1, await read.GameSessions.CountAsync(item => item.Status == GameSessionStatuses.Abandoned));
			Assert.Equal(1, await read.GameSessions.CountAsync(item => item.Status == GameSessionStatuses.Started));
		}

		private static GameSessionEntity Session(Guid id, string status) => new()
		{
			Id = id,
			RoomCode = id.ToString("N")[..8],
			CreatedAtUtc = DateTime.UtcNow.AddMinutes(-5),
			StartedAtUtc = DateTime.UtcNow.AddMinutes(-5),
			EndedAtUtc = status == GameSessionStatuses.Completed ? DateTime.UtcNow : null,
			Status = status,
			PlayerCount = 2
		};
	}
}
