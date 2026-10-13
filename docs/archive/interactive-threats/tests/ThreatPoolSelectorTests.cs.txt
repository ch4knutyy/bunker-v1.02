using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services.Threats;

namespace Bunker.UnitTests.Services.Threats;

public class ThreatPoolSelectorTests
{
    private readonly ThreatPoolSelector _selector = new();
    private readonly ThreatData _fallback = Threat("fallback");

    [Fact]
    public void ControlledRngSelectsTextPool()
    {
        var result = Select(new[] { Threat("radiation_leak"), Threat("text") }, true, 42, 0);
        Assert.Equal("text", result.Id);
    }

    [Fact]
    public void ControlledRngSelectsSpecialPool()
    {
        var result = Select(new[] { Threat("radiation_leak"), Threat("text") }, true, 0, 0);
        Assert.Equal("radiation_leak", result.Id);
    }

    [Fact]
    public void ControlledSpecialSelectionChoosesRadiationLeak()
    {
        var result = Select(AllPools(), true, 0, 0);
        Assert.Equal("radiation_leak", result.Id);
    }

    [Fact]
    public void ControlledSpecialSelectionChoosesAirFilterFailure()
    {
        var result = Select(AllPools(), true, 0, 1);
        Assert.Equal("air_filter_failure", result.Id);
    }

    [Fact]
    public void TextPoolNeverContainsExplicitSpecialIds()
    {
        var result = Select(AllPools(), true, 99, 0);
        Assert.Equal("text", result.Id);
    }

    [Fact]
    public void EmptySpecialPoolFallsBackToTextPool()
    {
        var result = Select(new[] { Threat("radiation_leak"), Threat("text") }, false, 0);
        Assert.Equal("text", result.Id);
    }

    [Fact]
    public void EmptyTextPoolFallsBackToSpecialPool()
    {
        var result = Select(new[] { Threat("radiation_leak") }, true, 0);
        Assert.Equal("radiation_leak", result.Id);
    }

    [Fact]
    public void EmptyPoolsUseSafeFallback()
    {
        var result = Select(Array.Empty<ThreatData>(), false, 0);
        Assert.Same(_fallback, result);
    }

    [Fact]
    public void StoredRoomThreatIsNotRedrawnForSnapshotOrReconnect()
    {
        var room = new Room();
        var draws = 0;
        ThreatData Draw()
        {
            draws++;
            return Select(AllPools(), true, 99, 0);
        }

        room.CurrentThreat ??= Draw();
        var first = room.CurrentThreat;
        room.CurrentThreat ??= Draw();

        Assert.Same(first, room.CurrentThreat);
        Assert.Equal(1, draws);
    }

    [Theory]
    [InlineData(0, 0, "text")]
    [InlineData(1, 0, "radiation_leak")]
    [InlineData(10, 9, "radiation_leak")]
    [InlineData(10, 10, "text")]
    [InlineData(25, 24, "radiation_leak")]
    [InlineData(100, 99, "radiation_leak")]
    public void ConfiguredInteractiveRateUsesDeterministicServerRng(int percent, int roll, string expected)
    {
        var values = new Queue<int>(new[] { roll, 0 });
        var result = _selector.Select(AllPools(), _ => true,
            (min, max) => Math.Clamp(values.Dequeue(), min, max - 1), _fallback, percent);
        Assert.Equal(expected, result.Id);
    }

    private ThreatData Select(IEnumerable<ThreatData> threats, bool specialsAvailable, params int[] values)
    {
        var queue = new Queue<int>(values);
        return _selector.Select(threats.ToList(), _ => specialsAvailable,
            (min, max) => Math.Clamp(queue.Dequeue(), min, max - 1), _fallback);
    }

    private static ThreatData[] AllPools() =>
        new[] { Threat("radiation_leak"), Threat("air_filter_failure"), Threat("text") };

    private static ThreatData Threat(string id) => new() { Id = id, Name = id };
}
