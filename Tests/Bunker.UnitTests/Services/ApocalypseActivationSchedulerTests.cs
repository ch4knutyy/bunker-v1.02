using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class ApocalypseActivationSchedulerTests
{
    private static readonly Lazy<GameDataService> Data = new(() => new(new TestEnvironment(FindRoot()), NullLogger<GameDataService>.Instance));

    [Fact]
    public void DuplicateOccurrenceExecutesExactlyOnce()
    {
        var room = Room("after_round", "recurring", firstRound: 2, interval: 2);
        var scheduler = Scheduler();

        var first = scheduler.TryActivate(room, "after_round", 2, "round:2");
        var duplicate = scheduler.TryActivate(room, "after_round", 2, "round:2");

        Assert.True(first.Due);
        Assert.True(first.Execution!.Success);
        Assert.True(duplicate.Duplicate);
        Assert.Equal(1, room.ApocalypseEffectRuntime!.SuccessfulActivationCount);
        Assert.Single(room.ApocalypseEffectRuntime.History);
    }

    [Fact]
    public void RecurringHonorsFirstRoundIntervalAndMaximum()
    {
        var room = Room("after_round", "recurring", firstRound: 3, interval: 2, maximum: 2);
        var scheduler = Scheduler();

        Assert.False(scheduler.TryActivate(room, "after_round", 2, "round:2").Due);
        Assert.True(scheduler.TryActivate(room, "after_round", 3, "round:3").Due);
        Assert.False(scheduler.TryActivate(room, "after_round", 4, "round:4").Due);
        Assert.True(scheduler.TryActivate(room, "after_round", 5, "round:5").Due);
        Assert.False(scheduler.TryActivate(room, "after_round", 7, "round:7").Due);
        Assert.Equal(2, room.ApocalypseEffectRuntime!.SuccessfulActivationCount);
    }

    private static ApocalypseActivationScheduler Scheduler()
    {
        var random = new FixedRandom();
        var registry = new ApocalypseEffectHandlerRegistry(Data.Value, random);
        return new(new ApocalypseEffectEngine(registry, Data.Value, random), TimeProvider.System);
    }
    private static Room Room(string trigger, string mode, int firstRound, int? interval, int? maximum = null)
    {
        var apocalypse = Data.Value.GetInteractiveApocalypses().First();
        return new()
        {
            Apocalypse = apocalypse,
            ApocalypseActivationPolicy = new()
            {
                Enabled = true, ApocalypseId = apocalypse.Id, EffectProfileId = apocalypse.Gameplay!.EffectProfileId,
                Trigger = trigger, ScheduleMode = mode, FirstRound = firstRound, IntervalRounds = interval, MaxActivations = maximum
            }
        };
    }
    private sealed class FixedRandom : IApocalypseRandom { public int Next(int minValue, int maxValue) => minValue; }
    private static string FindRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) directory = directory.Parent;
        return directory?.FullName ?? throw new DirectoryNotFoundException();
    }
    private sealed class TestEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot");
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
