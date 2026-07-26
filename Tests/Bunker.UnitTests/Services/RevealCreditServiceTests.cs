using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class RevealCreditServiceTests
{
    [Theory]
    [InlineData(false, 0, 0)]
    [InlineData(false, 1, 0)]
    [InlineData(false, 2, 1)]
    [InlineData(true, 1, 1)]
    [InlineData(true, 2, 2)]
    public void OnlyActualForcedRevealsBeyondCurrentRequirementBecomeCredits(
        bool requirementCompleted,
        int actualRevealCount,
        int expectedCredits)
    {
        var (room, player) = RoomWithPlayer();
        if (requirementCompleted)
            room.CurrentRoundReveals["player"] = "Health";
        var keys = Enumerable.Range(0, actualRevealCount).Select(index => $"Key{index}").ToArray();

        var result = RevealCreditService.ApplyForcedReveals(room, player, keys);

        Assert.Equal(actualRevealCount, result.ActualRevealed);
        Assert.Equal(expectedCredits, result.CreditsAdded);
        Assert.Equal(expectedCredits, player.FutureRevealCredits);
        Assert.Equal(requirementCompleted || actualRevealCount > 0, player.HasCompletedRevealThisRound);
    }

    [Fact]
    public void NewRoundConsumesAtMostOneCreditAndMarksRequirement()
    {
        var (room, player) = RoomWithPlayer();
        player.FutureRevealCredits = 2;

        var consumed = RevealCreditService.BeginRound(room);

        Assert.Single(consumed);
        Assert.Equal(1, player.FutureRevealCredits);
        Assert.True(player.HasCompletedRevealThisRound);
        Assert.True(player.RevealRequirementSatisfiedByCredit);
        Assert.Equal("RevealCredit", room.CurrentRoundReveals["player"]);
    }

    [Fact]
    public void SnapshotStateRestoresCreditsAndRoundRequirementWithoutReapplyingEffects()
    {
        var (room, player) = RoomWithPlayer();
        player.FutureRevealCredits = 3;
        player.HasCompletedRevealThisRound = true;
        player.RevealRequirementSatisfiedByCredit = true;
        room.CurrentRoundReveals["player"] = "RevealCredit";
        var state = RoomSnapshotService.CaptureState(room);
        player.FutureRevealCredits = 0;
        room.CurrentRoundReveals.Clear();

        RoomSnapshotService.ApplyState(room, state);
        var restored = room.Players["connection"];

        Assert.Equal(3, restored.FutureRevealCredits);
        Assert.True(restored.HasCompletedRevealThisRound);
        Assert.True(restored.RevealRequirementSatisfiedByCredit);
        Assert.Equal("RevealCredit", room.CurrentRoundReveals["player"]);
    }

    private static (Room Room, Player Player) RoomWithPlayer()
    {
        var player = new Player
        {
            ConnectionId = "connection",
            StablePlayerId = "player",
            Name = "Player"
        };
        return (new Room
        {
            State = RoomState.Playing,
            CurrentRound = 1,
            CurrentPhase = GamePhase.RoundReveal,
            Players = new() { ["connection"] = player }
        }, player);
    }
}
