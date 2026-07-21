using Bunker.Models;
using Bunker.Services.Bunker.GameSessions;

namespace Bunker.UnitTests;

public sealed class GameSessionRoomLifecycleTests
{
	[Fact]
	public async Task OnePlayerLeave_MarksLeftEarlyWithoutAbandoningRoomSession()
	{
		var history = new RecordingHistory();
		var room = StartedRoom();

		await GameSessionLifecycleTransitions.ApplyPlayerRemovalAsync(
			history,
			room,
			"player-1",
			roomDeleted: false,
			"explicit_leave");

		Assert.Equal(["player-1"], history.LeftEarlyPlayers);
		Assert.Empty(history.AbandonedSessions);
	}

	[Fact]
	public async Task LastPlayerLeave_MarksLeftEarlyAndAbandonsRoomSession()
	{
		var history = new RecordingHistory();
		var room = StartedRoom();

		await GameSessionLifecycleTransitions.ApplyPlayerRemovalAsync(
			history,
			room,
			"player-1",
			roomDeleted: true,
			"explicit_leave_removed_room");

		Assert.Equal(["player-1"], history.LeftEarlyPlayers);
		Assert.Equal([room.GameSessionId!.Value], history.AbandonedSessions);
	}

	private static Room StartedRoom() => new()
	{
		State = RoomState.Playing,
		CurrentPhase = GamePhase.RoundReveal,
		GameSessionId = Guid.NewGuid()
	};

	private sealed class RecordingHistory : IGameSessionHistoryService
	{
		public List<string> LeftEarlyPlayers { get; } = [];
		public List<Guid> AbandonedSessions { get; } = [];

		public Task<Guid> CreateStartedSessionAsync(string roomCode, IReadOnlyCollection<GameSessionParticipantSnapshot> participants, string? apocalypseId = null, string? bunkerId = null, CancellationToken cancellationToken = default) =>
			throw new NotSupportedException();

		public Task<bool> CompleteSessionAsync(Guid sessionId, IReadOnlyCollection<GameSessionParticipantResult> participantResults, CancellationToken cancellationToken = default) =>
			throw new NotSupportedException();

		public Task<bool> AbandonSessionAsync(Guid sessionId, string reason, CancellationToken cancellationToken = default)
		{
			AbandonedSessions.Add(sessionId);
			return Task.FromResult(true);
		}

		public Task<bool> MarkParticipantLeftEarlyAsync(Guid sessionId, string stablePlayerId, CancellationToken cancellationToken = default)
		{
			LeftEarlyPlayers.Add(stablePlayerId);
			return Task.FromResult(true);
		}

		public Task<int> AbandonStartedSessionsAsync(DateTime startedBeforeUtc, string reason, CancellationToken cancellationToken = default) =>
			throw new NotSupportedException();
	}
}
