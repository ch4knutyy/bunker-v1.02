namespace Bunker.Services.Bunker.GameSessions
{
	public interface IGameSessionHistoryService
	{
		Task<Guid> CreateStartedSessionAsync(
			string roomCode,
			int playerCount,
			string? apocalypseId = null,
			string? bunkerId = null,
			CancellationToken cancellationToken = default);
	}
}