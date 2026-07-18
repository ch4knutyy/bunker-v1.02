using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;
using Bunker.Data.Persistence.Identity;
using Bunker.Services.Profile;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bunker.UnitTests;

public sealed class ProfileGameHistoryTests
{
	[Fact]
	public async Task StatisticsAreScopedToUserAndClassifyCompletedActiveAndHostedSessions()
	{
		await using var database = await TestDatabase.CreateAsync();
		var userA = database.UserAId;
		var userB = database.UserBId;

		database.AddSession(userA, "WIN", "Completed", isHost: true, isWinner: true);
		database.AddSession(userA, "LOSS", "Completed", isHost: false, isWinner: false);
		database.AddSession(userA, "ACTIVE", "Started", isHost: true, isWinner: false);
		database.AddSession(userB, "OTHER", "Completed", isHost: true, isWinner: true);
		database.AddSession(null, "GUEST", "Completed", isHost: false, isWinner: true);
		await database.Context.SaveChangesAsync();

		var statistics = await database.Service.GetStatisticsAsync(userA);

		Assert.Equal(2, statistics.CompletedGames);
		Assert.Equal(1, statistics.ActiveGames);
		Assert.Equal(1, statistics.Wins);
		Assert.Equal(1, statistics.Losses);
		Assert.Equal(2, statistics.HostedGames);
		Assert.Equal(50.0m, statistics.WinRatePercent);
	}

	[Fact]
	public async Task StartedAndEmptyHistoriesDoNotCreateLossesOrDivideByZero()
	{
		await using var database = await TestDatabase.CreateAsync();
		database.AddSession(
			database.UserAId,
			"ACTIVE",
			"Started",
			isHost: false,
			isWinner: false);
		await database.Context.SaveChangesAsync();

		var activeStatistics = await database.Service.GetStatisticsAsync(database.UserAId);
		var emptyStatistics = await database.Service.GetStatisticsAsync(database.UserBId);

		Assert.Equal(1, activeStatistics.ActiveGames);
		Assert.Equal(0, activeStatistics.CompletedGames);
		Assert.Equal(0, activeStatistics.Losses);
		Assert.Equal(0, activeStatistics.WinRatePercent);
		Assert.Equal(0, emptyStatistics.CompletedGames);
		Assert.Equal(0, emptyStatistics.WinRatePercent);
	}

	[Fact]
	public async Task HistoryIsNewestFirstPaginatedInSqlAndCalculatesCompletedDurationOnly()
	{
		await using var database = await TestDatabase.CreateAsync();
		var baseline = new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);

		for (var index = 0; index < 22; index++)
		{
			var isActive = index == 21;
			database.AddSession(
				database.UserAId,
				$"ROOM{index:00}",
				isActive ? "Started" : "Completed",
				isHost: false,
				isWinner: false,
				startedAtUtc: baseline.AddDays(index),
				endedAtUtc: isActive ? null : baseline.AddDays(index).AddMinutes(42));
		}

		await database.Context.SaveChangesAsync();

		var firstPage = await database.Service.GetHistoryAsync(database.UserAId, 1, 20);
		var secondPage = await database.Service.GetHistoryAsync(database.UserAId, 2, 20);

		Assert.Equal(22, firstPage.TotalItems);
		Assert.Equal(2, firstPage.TotalPages);
		Assert.Equal("ROOM21", firstPage.Items[0].RoomCode);
		Assert.Null(firstPage.Items[0].Duration);
		Assert.Equal("ROOM02", firstPage.Items[^1].RoomCode);
		Assert.True(firstPage.HasNextPage);
		Assert.Equal(["ROOM01", "ROOM00"], secondPage.Items.Select(item => item.RoomCode));
		Assert.All(secondPage.Items, item => Assert.Equal(TimeSpan.FromMinutes(42), item.Duration));
		Assert.True(secondPage.HasPreviousPage);
		Assert.False(secondPage.HasNextPage);
	}

	[Fact]
	public async Task OverviewAndHistoryNeverReturnAnotherUsersOrGuestRows()
	{
		await using var database = await TestDatabase.CreateAsync();
		database.AddSession(database.UserAId, "MINE", "Completed", false, true);
		database.AddSession(database.UserBId, "THEIRS", "Completed", false, true);
		database.AddSession(null, "GUEST", "Completed", false, true);
		await database.Context.SaveChangesAsync();

		var overview = await database.Service.GetOverviewAsync(database.UserAId, 8);
		var history = await database.Service.GetHistoryAsync(database.UserAId, 1, 20);

		Assert.Single(overview.RecentGames);
		Assert.Equal("MINE", overview.RecentGames[0].RoomCode);
		Assert.Single(history.Items);
		Assert.Equal("MINE", history.Items[0].RoomCode);
	}

	private sealed class TestDatabase : IAsyncDisposable
	{
		private TestDatabase(
			SqliteConnection connection,
			BunkerDbContext context,
			Guid userAId,
			Guid userBId)
		{
			Connection = connection;
			Context = context;
			UserAId = userAId;
			UserBId = userBId;
			Service = new ProfileGameHistoryService(context);
		}

		private SqliteConnection Connection { get; }
		public BunkerDbContext Context { get; }
		public ProfileGameHistoryService Service { get; }
		public Guid UserAId { get; }
		public Guid UserBId { get; }

		public static async Task<TestDatabase> CreateAsync()
		{
			var connection = new SqliteConnection("Data Source=:memory:");
			await connection.OpenAsync();
			var options = new DbContextOptionsBuilder<BunkerDbContext>()
				.UseSqlite(connection)
				.Options;
			var context = new BunkerDbContext(options);
			await context.Database.EnsureCreatedAsync();

			var userAId = Guid.NewGuid();
			var userBId = Guid.NewGuid();
			context.Users.AddRange(
				CreateUser(userAId, "a@example.com"),
				CreateUser(userBId, "b@example.com"));
			await context.SaveChangesAsync();

			return new TestDatabase(connection, context, userAId, userBId);
		}

		public void AddSession(
			Guid? userId,
			string roomCode,
			string status,
			bool isHost,
			bool isWinner,
			DateTime? startedAtUtc = null,
			DateTime? endedAtUtc = null)
		{
			var sessionId = Guid.NewGuid();
			var start = startedAtUtc ?? new DateTime(2026, 1, 1, 12, 0, 0, DateTimeKind.Utc);
			Context.GameSessions.Add(new GameSessionEntity
			{
				Id = sessionId,
				RoomCode = roomCode,
				CreatedAtUtc = start.AddMinutes(-1),
				StartedAtUtc = start,
				EndedAtUtc = endedAtUtc ?? (status == "Completed" ? start.AddMinutes(30) : null),
				Status = status,
				PlayerCount = 3
			});
			Context.GameSessionPlayers.Add(new GameSessionPlayerEntity
			{
				Id = Guid.NewGuid(),
				GameSessionId = sessionId,
				UserId = userId,
				StablePlayerIdSnapshot = Guid.NewGuid().ToString("N"),
				PlayerNameSnapshot = "Player",
				IsHost = isHost,
				IsWinner = isWinner,
				WasEliminated = status == "Completed" && !isWinner,
				EliminatedAtRound = status == "Completed" && !isWinner ? 2 : null
			});
		}

		public async ValueTask DisposeAsync()
		{
			await Context.DisposeAsync();
			await Connection.DisposeAsync();
		}

		private static ApplicationUser CreateUser(Guid id, string email)
		{
			return new ApplicationUser
			{
				Id = id,
				UserName = email,
				NormalizedUserName = email.ToUpperInvariant(),
				Email = email,
				NormalizedEmail = email.ToUpperInvariant(),
				DisplayName = email,
				CreatedAtUtc = DateTime.UtcNow
			};
		}
	}
}
