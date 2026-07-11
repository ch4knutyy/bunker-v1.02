using Bunker.Services;

namespace Bunker.UnitTests.Services;

public sealed class BunkerCapacityPolicyTests
{
    [Theory]
    [InlineData("1", 1)]
    [InlineData("4", 4)]
    [InlineData("99", 99)]
    public void AcceptsValidAbsoluteCapacity(string input, int expected)
    {
        Assert.True(BunkerCapacityPolicy.TryParse(input, out var capacity));
        Assert.Equal(expected, capacity);
    }

    [Theory]
    [InlineData("0")]
    [InlineData("-1")]
    [InlineData("100")]
    [InlineData("4.5")]
    [InlineData("")]
    [InlineData(null)]
    [InlineData("NaN")]
    public void RejectsInvalidCapacity(string? input)
    {
        Assert.False(BunkerCapacityPolicy.TryParse(input, out _));
    }

    [Fact]
    public void RepeatedAbsoluteAssignmentIsIdempotentAndDoesNotTouchOtherState()
    {
        var bunker = new Bunker.Models.BunkerInfo { Capacity = 6, SuppliesMonths = 18, Location = "Sector A" };
        var players = new[] { "one", "two", "three", "four", "five" };
        Assert.True(BunkerCapacityPolicy.TryParse("4", out var capacity));

        bunker.Capacity = capacity;
        bunker.Capacity = capacity;

        Assert.Equal(4, bunker.Capacity);
        Assert.Equal(18, bunker.SuppliesMonths);
        Assert.Equal("Sector A", bunker.Location);
        Assert.Equal(5, players.Length);
    }
}
