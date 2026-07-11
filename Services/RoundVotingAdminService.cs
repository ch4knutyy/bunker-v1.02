using Bunker.Models;
using System.Globalization;

namespace Bunker.Services;

public static class RoundVotingAdminService
{
    public static void SetPaused(Room room, bool paused, string? reason, string? playerId, DateTimeOffset now)
    {
        room.IsPaused = paused;
        room.PauseReason = paused ? reason : null;
        room.PausedAtUtc = paused ? room.PausedAtUtc ?? now : null;
        room.PausedByPlayerId = paused ? playerId : null;
    }

    public static bool TryParseRound(string? value, out int round)
    {
        round = 0;
        return !string.IsNullOrWhiteSpace(value) &&
               int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out round) &&
               round is >= 1 and <= 99;
    }

    public static bool TrySetRound(Room room, int round, out string? error)
    {
        error = null;
        if (round < room.CurrentRound)
        {
            error = "Повернення до попереднього раунду потребує окремого transition refactor";
            return false;
        }
        if (room.CurrentVoting?.State == VotingState.Active)
        {
            error = "Спочатку завершіть або скасуйте активне голосування";
            return false;
        }
        room.CurrentRound = round;
        room.State = RoomState.Playing;
        room.CurrentPhase = GamePhase.RoundReveal;
        room.CurrentRoundReveals.Clear();
        room.VotingReadyResponses.Clear();
        return true;
    }

    public static void ResetReadiness(Room room)
    {
        foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value).Where(player => !player.IsEliminated))
            room.VotingReadyResponses.Remove(RoomService.GetPlayerKey(player));
    }

    public static void ClearVotes(VotingSession voting)
    {
        if (voting.State == VotingState.Active) voting.Votes.Clear();
    }

    public static bool RemoveVote(VotingSession voting, string voterId)
    {
        if (voting.State != VotingState.Active) return false;
        return voting.Votes.Remove(voterId);
    }

    public static IReadOnlyList<string> GetTiedCandidateIds(VotingSession voting)
    {
        var counts = voting.VoteCounts;
        if (counts.Count == 0) return [];
        var maximum = counts.Values.Max();
        return counts.Where(entry => entry.Value == maximum).Select(entry => entry.Key).ToList();
    }
}
