using Bunker.Models;
using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class ApocalypseEffectSnapshotTests
{
    [Fact]
    public void RuntimeRoundTripsThroughRoomSnapshotState()
    {
        var room = new Room
        {
            ApocalypseEffectRuntime = new()
            {
                SuccessfulActivationCount = 3,
                FailedActivationCount = 1,
                LastSuccessfulRound = 7,
                ProcessedOccurrenceKeys = ["apocalypse:profile:after_round:round:7"],
                History = [new() { ActivationId = "activation-3", Result = "success", Round = 7 }]
            }
        };

        var state = RoomSnapshotService.CaptureState(room);
        room.ApocalypseEffectRuntime = null;
        RoomSnapshotService.ApplyState(room, state);

        Assert.NotNull(room.ApocalypseEffectRuntime);
        Assert.Equal(3, room.ApocalypseEffectRuntime.SuccessfulActivationCount);
        Assert.Equal(1, room.ApocalypseEffectRuntime.FailedActivationCount);
        Assert.Contains("apocalypse:profile:after_round:round:7", room.ApocalypseEffectRuntime.ProcessedOccurrenceKeys);
        Assert.Equal("activation-3", Assert.Single(room.ApocalypseEffectRuntime.History).ActivationId);
    }
}
