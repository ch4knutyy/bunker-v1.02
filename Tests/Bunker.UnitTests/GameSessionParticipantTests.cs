using Bunker.Data.Persistence;
using Bunker.Data.Persistence.Entities;
using Bunker.Data.Persistence.Identity;
using Bunker.Models;
using Bunker.Services.Bunker.GameSessions;
using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;

namespace Bunker.UnitTests;

public sealed class GameSessionParticipantTests
{
	[Fact]
	public async Task StartedSessionPersistsAuthenticatedAndGuestParticipants()
	{
		await using var database = await TestDatabase.CreateAsync();
		var userId = Guid.NewGuid();

		await using (var setupContext = database.CreateContext())
		{
			setupContext.Users.Add(new ApplicationUser
			{
				Id = userId,
				UserName = "player@example.test",
				NormalizedUserName = "PLAYER@EXAMPLE.TEST",
				Email = "player@example.test",
				NormalizedEmail = "PLAYER@EXAMPLE.TEST",
				DisplayName = "Player",
				CreatedAtUtc = DateTime.UtcNow
			});
			await setupContext.SaveChangesAsync();
		}

		Guid sessionId;
		await using (var writeContext = database.CreateContext())
		{
			var service = new GameSessionHistoryService(writeContext);
			sessionId = await service.CreateStartedSessionAsync(
				"ROOM1234",
				[
					new(userId, "auth-stable", "Auth", true),
					new(null, "guest-stable", "Guest", false)
				]);
		}

		await using var readContext = database.CreateContext();
		var session = await readContext.GameSessions
			.Include(item => item.GameSessionPlayers)
			.SingleAsync(item => item.Id == sessionId);

		Assert.Equal(2, session.PlayerCount);
		Assert.Equal(2, session.GameSessionPlayers.Count);
		Assert.Equal(userId, session.GameSessionPlayers.Single(item => item.IsHost).UserId);
		Assert.Null(session.GameSessionPlayers.Single(item => item.StablePlayerIdSnapshot == "guest-stable").UserId);
	}

	[Fact]
	public async Task ParticipantFactoryExcludesSpectatorAndTechnicalGm()
	{
		var room = new Room
		{
			HostConnectionId = "host",
			HostPlayerId = "host-stable"
		};
		room.Players["host"] = new Player
		{
			Name = "Host",
			ConnectionId = "host",
			StablePlayerId = "host-stable"
		};
		room.Players["spectator"] = new Player
		{
			Name = "Viewer",
			ConnectionId = "spectator",
			StablePlayerId = "viewer-stable",
			IsLobbySpectator = true
		};
		room.Players["gm"] = new Player
		{
			Name = "GM",
			ConnectionId = "gm",
			StablePlayerId = "gm-stable",
			GmRole = GmMode.TechnicalGm
		};

		var snapshots = GameSessionParticipantSnapshotFactory.FromRoom(room);
		var snapshot = Assert.Single(snapshots);

		Assert.Equal("host-stable", snapshot.StablePlayerId);
		Assert.True(snapshot.IsHost);

		await using var database = await TestDatabase.CreateAsync();
		await using var context = database.CreateContext();
		var service = new GameSessionHistoryService(context);
		var sessionId = await service.CreateStartedSessionAsync("ROOM1234", snapshots);

		Assert.Single(await context.GameSessionPlayers
			.Where(item => item.GameSessionId == sessionId)
			.ToListAsync());
	}

	[Fact]
	public async Task UniqueIndexRejectsDuplicateStablePlayerWithinSession()
	{
		await using var database = await TestDatabase.CreateAsync();
		await using var context = database.CreateContext();
		var session = StartedSession();
		session.GameSessionPlayers.Add(Participant(session.Id, "same-stable", "First"));
		session.GameSessionPlayers.Add(Participant(session.Id, "same-stable", "Second"));
		context.GameSessions.Add(session);

		await Assert.ThrowsAsync<DbUpdateException>(() => context.SaveChangesAsync());
	}

	[Fact]
	public async Task CompletionPersistsResultsAndIsIdempotent()
	{
		await using var database = await TestDatabase.CreateAsync();
		Guid sessionId;

		await using (var createContext = database.CreateContext())
		{
			var service = new GameSessionHistoryService(createContext);
			sessionId = await service.CreateStartedSessionAsync(
				"ROOM1234",
				[
					new(null, "winner", "Winner", true),
					new(null, "out", "Out", false)
				]);
		}

		await using (var completionContext = database.CreateContext())
		{
			var service = new GameSessionHistoryService(completionContext);
			Assert.True(await service.CompleteSessionAsync(
				sessionId,
				[
					new("winner", true, false, null),
					new("out", false, true, 4),
					new("missing", false, true, 3)
				]));
		}

		DateTime firstEndedAtUtc;
		await using (var readContext = database.CreateContext())
		{
			var session = await readContext.GameSessions
				.Include(item => item.GameSessionPlayers)
				.SingleAsync(item => item.Id == sessionId);
			firstEndedAtUtc = Assert.IsType<DateTime>(session.EndedAtUtc);
			Assert.True(session.GameSessionPlayers.Single(item => item.StablePlayerIdSnapshot == "winner").IsWinner);
			var eliminated = session.GameSessionPlayers.Single(item => item.StablePlayerIdSnapshot == "out");
			Assert.True(eliminated.WasEliminated);
			Assert.Equal(4, eliminated.EliminatedAtRound);
		}

		await using (var repeatContext = database.CreateContext())
		{
			var service = new GameSessionHistoryService(repeatContext);
			Assert.True(await service.CompleteSessionAsync(
				sessionId,
				[
					new("winner", false, true, 9),
					new("out", true, false, null)
				]));
		}

		await using var finalContext = database.CreateContext();
		var finalSession = await finalContext.GameSessions
			.Include(item => item.GameSessionPlayers)
			.SingleAsync(item => item.Id == sessionId);
		Assert.Equal(firstEndedAtUtc, finalSession.EndedAtUtc);
		Assert.True(finalSession.GameSessionPlayers.Single(item => item.StablePlayerIdSnapshot == "winner").IsWinner);
		Assert.True(finalSession.GameSessionPlayers.Single(item => item.StablePlayerIdSnapshot == "out").WasEliminated);
	}

	[Fact]
	public async Task CompletionReturnsFalseWhenSessionDoesNotExist()
	{
		await using var database = await TestDatabase.CreateAsync();
		await using var context = database.CreateContext();
		var service = new GameSessionHistoryService(context);

		Assert.False(await service.CompleteSessionAsync(
			Guid.NewGuid(),
			Array.Empty<GameSessionParticipantResult>()));
	}

	private static GameSessionEntity StartedSession()
	{
		return new GameSessionEntity
		{
			Id = Guid.NewGuid(),
			RoomCode = "ROOM1234",
			CreatedAtUtc = DateTime.UtcNow,
			StartedAtUtc = DateTime.UtcNow,
			Status = "Started",
			PlayerCount = 2
		};
	}

	private static GameSessionPlayerEntity Participant(Guid sessionId, string stablePlayerId, string name)
	{
		return new GameSessionPlayerEntity
		{
			Id = Guid.NewGuid(),
			GameSessionId = sessionId,
			StablePlayerIdSnapshot = stablePlayerId,
			PlayerNameSnapshot = name
		};
	}

	private sealed class TestDatabase : IAsyncDisposable
	{
		private readonly SqliteConnection _connection;
		private readonly DbContextOptions<BunkerDbContext> _options;

		private TestDatabase(
			SqliteConnection connection,
			DbContextOptions<BunkerDbContext> options)
		{
			_connection = connection;
			_options = options;
		}

		public static async Task<TestDatabase> CreateAsync()
		{
			var connection = new SqliteConnection("Data Source=:memory:");
			await connection.OpenAsync();
			var options = new DbContextOptionsBuilder<BunkerDbContext>()
				.UseSqlite(connection)
				.Options;
			await using var context = new BunkerDbContext(options);
			await context.Database.EnsureCreatedAsync();
			return new TestDatabase(connection, options);
		}

		public BunkerDbContext CreateContext() => new(_options);

		public ValueTask DisposeAsync() => _connection.DisposeAsync();
	}
}
