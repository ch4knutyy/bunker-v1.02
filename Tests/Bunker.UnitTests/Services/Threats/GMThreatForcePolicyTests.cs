using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services.Threats;

namespace Bunker.UnitTests.Services.Threats;

public class GMThreatForcePolicyTests
{
    [Fact]
    public void ActiveThreatIsEligibleWhileGameIsPausedAndTimerIsUnchanged()
    {
        var room = ActiveRoom();
        room.IsPaused = true;
        room.GameTimer.Status = GameTimerStatus.Running;
        room.GameTimer.RemainingSecondsWhenPaused = 37;
        var timerStatus = room.GameTimer.Status;
        var remaining = room.GameTimer.RemainingSecondsWhenPaused;

        Assert.True(GMThreatStateMutator.CanForceOutcome(room));

        Assert.True(room.IsPaused);
        Assert.Equal(timerStatus, room.GameTimer.Status);
        Assert.Equal(remaining, room.GameTimer.RemainingSecondsWhenPaused);
    }

    [Theory]
    [InlineData("aborted")]
    [InlineData("resolved_safely")]
    [InlineData("resolved_with_casualty")]
    [InlineData("failed")]
    [InlineData("completed")]
    public void TerminalThreatCannotBeForced(string status)
    {
        var room = ActiveRoom();
        room.ThreatState!.ThreatStatus = status;
        Assert.False(GMThreatStateMutator.CanForceOutcome(room));
    }

    [Fact]
    public void EffectsAppliedOrCommittedOutcomeCannotBeForced()
    {
        var effectsRoom = ActiveRoom();
        effectsRoom.ThreatState!.Resolution.EffectsApplied = true;
        Assert.False(GMThreatStateMutator.CanForceOutcome(effectsRoom));

        var outcomeRoom = ActiveRoom();
        outcomeRoom.ThreatState!.MiniGame.Outcome = "failed";
        Assert.False(GMThreatStateMutator.CanForceOutcome(outcomeRoom));
    }

    [Fact]
    public void PreviewFingerprintIsPureAndStableWithoutStateChange()
    {
        var room = ActiveRoom();
        var auditCount = room.ThreatAuditLog.Count;
        var timer = room.GameTimer.RemainingSecondsWhenPaused;

        var first = GMThreatStateMutator.BuildForcePreviewFingerprint(room, "failure");
        var second = GMThreatStateMutator.BuildForcePreviewFingerprint(room, "failure");

        Assert.Equal(first, second);
        Assert.Equal(auditCount, room.ThreatAuditLog.Count);
        Assert.False(room.ThreatState!.Resolution.EffectsApplied);
        Assert.Equal(timer, room.GameTimer.RemainingSecondsWhenPaused);
    }

    [Fact]
    public void RelevantStateChangeMakesPreviewFingerprintStale()
    {
        var room = ActiveRoom();
        var before = GMThreatStateMutator.BuildForcePreviewFingerprint(room, "failure");
        room.ThreatState!.Contributions.Add(new ThreatContributionState { SourceId = "kit", IsAccepted = true });
        var after = GMThreatStateMutator.BuildForcePreviewFingerprint(room, "failure");
        Assert.NotEqual(before, after);
    }

    [Fact]
    public void CommandIdsRemainIdempotent()
    {
        var room = ActiveRoom();
        Assert.True(GMThreatStateMutator.TryRememberCommand(room, "force-1"));
        Assert.False(GMThreatStateMutator.TryRememberCommand(room, "force-1"));
    }

    private static Room ActiveRoom() => new()
    {
        Id = "ROOM",
        CurrentRound = 3,
        IsThreatRevealed = true,
        ThreatRevealedAtRound = 3,
        CurrentThreat = new ThreatData { Id = "radiation_leak", Name = "Radiation leak" },
        ThreatState = new ThreatInteractionState
        {
            CurrentThreatId = "radiation_leak",
            ThreatStatus = "mini_game_active",
            ThreatRevealedRound = 3,
            MiniGame = new ThreatMiniGameState { Status = "active" }
        },
        GameTimer = new GameTimerState { RemainingSecondsWhenPaused = 50 }
    };
}
