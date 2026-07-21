using Bunker.Models;
using Bunker.Services.Bunker.GameSessions;

namespace Bunker.Hubs;

public partial class GameHub
{
	private async Task HandleGameSessionDepartureAsync(
		Room room,
		string stablePlayerId,
		bool roomDeleted,
		string reason)
	{
		if (_gameSessionHistoryService is null || room.GameSessionId is not Guid sessionId)
		{
			return;
		}

		try
		{
			await GameSessionLifecycleTransitions.ApplyPlayerRemovalAsync(
				_gameSessionHistoryService,
				room,
				stablePlayerId,
				roomDeleted,
				reason);
		}
		catch (Exception exception)
		{
			_logger.LogError(
				exception,
				"Failed to persist game-session departure for session {GameSessionId}",
				sessionId);
		}
	}
}
