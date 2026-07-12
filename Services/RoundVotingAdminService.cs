using Bunker.Models;
using System.Globalization;

namespace Bunker.Services;

public static class RoundVotingAdminService
{
    public sealed record VotingStartAvailability(bool Allowed, string Code, string Message);

    public static VotingStartAvailability CanStartVoting(Room room, bool hasUnresolvedBlockingThreat = false)
    {
        if (room.IsPaused)
            return new(false, "game_paused", "Голосування недоступне, поки гра на паузі");
        if (room.State != RoomState.Playing)
            return new(false, "room_not_playing", "Голосування доступне тільки під час гри");
        if (room.CurrentRound < 3)
            return new(false, "round_not_completed", "Голосування доступне тільки після завершення 3 раунду");
        if (hasUnresolvedBlockingThreat)
            return new(false, "threat_not_resolved", "Спершу завершіть інтерактивну загрозу");
        if (room.CurrentPhase is not (GamePhase.ExtraInventory or GamePhase.PreVotingReadyCheck))
            return new(false, "invalid_phase", "Спершу завершіть поточний раунд");
        if (room.CurrentVoting?.State is VotingState.Active or VotingState.Completed)
            return new(false, "voting_already_started", "Голосування вже розпочато");

        return new(true, "available", "Голосування доступне");
    }

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
        foreach (var player in RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value))
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
