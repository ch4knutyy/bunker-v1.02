using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services.Threats;

namespace Bunker.UnitTests.Services.Threats;

public class GMThreatStateMutatorTests
{
    [Fact]
    public void ReplacementCreatesOneCleanInteractionStateWithoutApplyingOldEffects()
    {
        var room = RoomWithThreat("old");
        room.ThreatState!.Contributions.Add(new ThreatContributionState { SourceId = "secret" });
        var next = new ThreatData { Id = "new", Name = "New" };

        GMThreatStateMutator.Replace(room, next, "revealed");

        Assert.Same(next, room.CurrentThreat);
        Assert.Equal("new", room.ThreatState!.CurrentThreatId);
        Assert.Empty(room.ThreatState.Contributions);
        Assert.False(room.ThreatState.Resolution.EffectsApplied);
    }

    [Fact]
    public void AbortKeepsThreatAndCreatesTerminalStateWithoutApplyingConsequences()
    {
        var room = RoomWithThreat("old");
        var player = new Player { Name = "Player" };
        room.Players["p"] = player;

        room.ThreatState!.Contributions.Add(new ThreatContributionState());
        Assert.True(GMThreatStateMutator.Abort(room));

        Assert.NotNull(room.CurrentThreat);
        Assert.Equal("aborted", room.ThreatState!.ThreatStatus);
        Assert.Equal("aborted", room.ThreatState.MiniGame.Status);
        Assert.Empty(room.ThreatState.Contributions);
        Assert.False(room.ThreatState.Resolution.EffectsApplied);
        Assert.Empty(player.AdditionalConditionEffects);
    }

    [Fact]
    public void RestartKeepsThreatIdAndClearsOnlyInteractionState()
    {
        var room = RoomWithThreat("same");
        room.ThreatState!.Contributions.Add(new ThreatContributionState());

        Assert.True(GMThreatStateMutator.Restart(room));
        Assert.Equal("same", room.CurrentThreat!.Id);
        Assert.Equal("same", room.ThreatState!.CurrentThreatId);
        Assert.Empty(room.ThreatState.Contributions);
    }

    [Fact]
    public void RestartPreservesPlayerDataAndAlreadyAppliedConditions()
    {
        var room = RoomWithThreat("same");
        var player = new Player { Name = "Player" };
        player.Inventory.Items.Add(new Item { Name = "Tool" });
        player.ProfessionItem = new Item { Name = "Profession tool" };
        player.AdditionalConditionEffects.Add(new PlayerConditionEffect { Id = "effect", Name = "Condition", BaseName = "Condition" });
        room.Players["p"] = player;

        Assert.True(GMThreatStateMutator.Restart(room));
        Assert.Single(player.Inventory.Items);
        Assert.Equal("Profession tool", player.ProfessionItem.Name);
        Assert.Single(player.AdditionalConditionEffects);
        Assert.False(room.ThreatState!.Resolution.EffectsApplied);
    }

    [Fact]
    public void RestartRefusesAlreadyAppliedEffects()
    {
        var room = RoomWithThreat("same");
        var original = room.ThreatState;
        original!.Resolution.EffectsApplied = true;

        Assert.False(GMThreatStateMutator.Restart(room));
        Assert.Same(original, room.ThreatState);
    }

    [Theory]
    [InlineData("aborted")]
    [InlineData("completed")]
    [InlineData("failed")]
    public void RestartRefusesTerminalThreat(string status)
    {
        var room = RoomWithThreat("same");
        room.ThreatState!.ThreatStatus = status;
        var original = room.ThreatState;
        Assert.False(GMThreatStateMutator.Restart(room));
        Assert.Same(original, room.ThreatState);
    }

    [Fact]
    public void AbortPreventsSameRoundRedrawByKeepingCurrentThreat()
    {
        var room = RoomWithThreat("same");
        Assert.True(GMThreatStateMutator.Abort(room));
        var draws = 0;
        room.CurrentThreat ??= new ThreatData { Id = $"draw-{++draws}" };
        Assert.Equal(0, draws);
        Assert.Equal("same", room.CurrentThreat.Id);
    }

    [Fact]
    public void RecoveryWorksWhileGameIsPausedAndDoesNotTouchTimer()
    {
        var room = RoomWithThreat("same");
        room.IsPaused = true;
        room.GameTimer.Status = GameTimerStatus.Running;
        Assert.True(GMThreatStateMutator.Restart(room));
        Assert.True(room.IsPaused);
        Assert.Equal(GameTimerStatus.Running, room.GameTimer.Status);
    }

    [Fact]
    public void RepeatedCommandIdIsRememberedOnlyOnce()
    {
        var room = new Room();
        Assert.True(GMThreatStateMutator.TryRememberCommand(room, "command"));
        Assert.False(GMThreatStateMutator.TryRememberCommand(room, "command"));
    }

    private static Room RoomWithThreat(string id) => new()
    {
        CurrentRound = 3,
        IsThreatRevealed = true,
        ThreatRevealedAtRound = 3,
        CurrentThreat = new ThreatData { Id = id, Name = id },
        ThreatState = new ThreatInteractionState { CurrentThreatId = id, ThreatStatus = "active" }
    };
}
