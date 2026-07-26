using Bunker.Models;

namespace Bunker.Services;

public sealed record ForcedRevealCreditResult(
    int ActualRevealed,
    int UsedForCurrentRound,
    int CreditsAdded,
    int FutureRevealCredits);

public static class RevealCreditService
{
    public static ForcedRevealCreditResult ApplyForcedReveals(
        Room room,
        Player player,
        IReadOnlyCollection<string> actualCharacteristicKeys)
    {
        var actualKeys = actualCharacteristicKeys
            .Where(key => !string.IsNullOrWhiteSpace(key))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
        if (actualKeys.Length == 0)
            return new(0, 0, 0, player.FutureRevealCredits);

        var playerKey = RoomService.GetPlayerKey(player);
        var requirementAlreadyCompleted =
            player.HasCompletedRevealThisRound ||
            room.CurrentRoundReveals.ContainsKey(playerKey);
        if (requirementAlreadyCompleted)
            player.HasCompletedRevealThisRound = true;

        var remainingRequirement = requirementAlreadyCompleted ? 0 : 1;
        var usedForCurrentRound = Math.Min(actualKeys.Length, remainingRequirement);
        var creditsAdded = actualKeys.Length - usedForCurrentRound;

        if (usedForCurrentRound > 0)
        {
            player.HasCompletedRevealThisRound = true;
            player.RevealRequirementSatisfiedByCredit = false;
            room.CurrentRoundReveals[playerKey] = actualKeys[0];
        }

        player.FutureRevealCredits = Math.Max(0, player.FutureRevealCredits + creditsAdded);
        return new(actualKeys.Length, usedForCurrentRound, creditsAdded, player.FutureRevealCredits);
    }

    public static IReadOnlyList<Player> BeginRound(Room room)
    {
        room.CurrentRoundReveals.Clear();
        var consumed = new List<Player>();
        foreach (var player in RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value))
        {
            player.HasCompletedRevealThisRound = false;
            player.RevealRequirementSatisfiedByCredit = false;
            if (player.FutureRevealCredits <= 0) continue;

            player.FutureRevealCredits--;
            player.HasCompletedRevealThisRound = true;
            player.RevealRequirementSatisfiedByCredit = true;
            room.CurrentRoundReveals[RoomService.GetPlayerKey(player)] = "RevealCredit";
            consumed.Add(player);
        }
        return consumed;
    }

    public static void ResetForNewGame(Room room)
    {
        room.CurrentRoundReveals.Clear();
        foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value))
        {
            player.FutureRevealCredits = 0;
            player.HasCompletedRevealThisRound = false;
            player.RevealRequirementSatisfiedByCredit = false;
        }
    }
}
