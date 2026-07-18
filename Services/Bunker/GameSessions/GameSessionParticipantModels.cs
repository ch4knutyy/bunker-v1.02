using Bunker.Models;

namespace Bunker.Services.Bunker.GameSessions;

public sealed record GameSessionParticipantSnapshot(
	Guid? UserId,
	string StablePlayerId,
	string PlayerName,
	bool IsHost);

public sealed record GameSessionParticipantResult(
	string StablePlayerId,
	bool IsWinner,
	bool WasEliminated,
	int? EliminatedAtRound);

internal static class GameSessionParticipantSnapshotFactory
{
	public static IReadOnlyList<GameSessionParticipantSnapshot> FromRoom(Room room)
	{
		return RoomService.GetGameplayPlayersSnapshot(room)
			.Select(entry => entry.Value)
			.Select(player => new GameSessionParticipantSnapshot(
				player.AccountUserId,
				RoomService.GetPlayerKey(player),
				player.Name,
				room.IsHost(player)))
			.ToArray();
	}

	public static IReadOnlyList<GameSessionParticipantResult> ResultsFromRoom(
		Room room,
		IEnumerable<string> winnerPlayerIds)
	{
		var winners = winnerPlayerIds.ToHashSet(StringComparer.Ordinal);

		return RoomService.GetPlayersSnapshot(room)
			.Select(entry => entry.Value)
			.Where(IsCurrentOrEliminatedGameplayParticipant)
			.Select(player =>
			{
				var stablePlayerId = RoomService.GetPlayerKey(player);
				return new GameSessionParticipantResult(
					stablePlayerId,
					winners.Contains(stablePlayerId),
					player.IsEliminated,
					player.EliminatedAtRound);
			})
			.ToArray();
	}

	private static bool IsCurrentOrEliminatedGameplayParticipant(Player player)
	{
		return !player.IsSpectatorGm &&
			!player.IsLobbySpectator &&
			player.GmRole != GmMode.TechnicalGm;
	}
}
