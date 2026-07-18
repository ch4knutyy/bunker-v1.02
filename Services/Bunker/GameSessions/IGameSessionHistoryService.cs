namespace Bunker.Services.Bunker.GameSessions
{
	public interface IGameSessionHistoryService
	{
		Task<Guid> CreateStartedSessionAsync(
			string roomCode,
			IReadOnlyCollection<GameSessionParticipantSnapshot> participants,
			string? apocalypseId = null,
			string? bunkerId = null,
			CancellationToken cancellationToken = default);

		Task<bool> CompleteSessionAsync(
			Guid sessionId,
			IReadOnlyCollection<GameSessionParticipantResult> participantResults,
			CancellationToken cancellationToken = default);
	}
}
