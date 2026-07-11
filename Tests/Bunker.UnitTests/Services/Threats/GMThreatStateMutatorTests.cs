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
    public void CancelDropsInteractionWithoutApplyingConsequences()
    {
        var room = RoomWithThreat("old");
        var player = new Player { Name = "Player" };
        room.Players["p"] = player;

        GMThreatStateMutator.Cancel(room);

        Assert.Null(room.CurrentThreat);
        Assert.Null(room.ThreatState);
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
    public void RestartRefusesAlreadyAppliedEffects()
    {
        var room = RoomWithThreat("same");
        var original = room.ThreatState;
        original!.Resolution.EffectsApplied = true;

        Assert.False(GMThreatStateMutator.Restart(room));
        Assert.Same(original, room.ThreatState);
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
