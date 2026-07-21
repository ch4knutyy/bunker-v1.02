using Bunker.Models;

namespace Bunker.Services.Bunker.GameSessions;

internal static class GameSessionLifecycleTransitions
{
	public static async Task ApplyPlayerRemovalAsync(
		IGameSessionHistoryService history,
		Room room,
		string stablePlayerId,
		bool roomDeleted,
		string reason,
		CancellationToken cancellationToken = default)
	{
		if (room.GameSessionId is not Guid sessionId) return;

		if (room.State != RoomState.Lobby && room.State != RoomState.Finished)
		{
			await history.MarkParticipantLeftEarlyAsync(
				sessionId,
				stablePlayerId,
				cancellationToken);
		}

		if (roomDeleted)
		{
			await history.AbandonSessionAsync(
				sessionId,
				reason,
				cancellationToken);
		}
	}
}
