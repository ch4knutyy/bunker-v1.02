using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Bunker.Hubs;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class ApocalypseActivationPolicyResolverTests
{
    private static readonly Lazy<GameDataService> Data = new(() => new(new TestEnvironment(FindRoot()), NullLogger<GameDataService>.Instance));
    private static ApocalypseSelectionService Selection => new(Data.Value);
    private static ApocalypseActivationPolicyResolver Resolver => new(Data.Value, Selection);

    [Fact]
    public void VersionThreeMigratesToVersionFourDefaultsIdempotently()
    {
        var source = new RoomGameSettings { Version = 3, ApocalypseActivation = null! };
        var migrated = RoomGameSettingsService.Migrate(source); var twice = RoomGameSettingsService.Migrate(migrated);
        Assert.Equal(4, migrated.Version); Assert.True(migrated.ApocalypseActivation.EffectsEnabled);
        Assert.Equal(ApocalypseActivationPolicyMode.DefinitionDefault, migrated.ApocalypseActivation.PolicyMode);
        Assert.Equal(ApocalypseActivationScheduleMode.Recurring, migrated.ApocalypseActivation.ScheduleMode);
        Assert.Equal(ApocalypseActivationTriggerMode.AfterVoting, migrated.ApocalypseActivation.Trigger);
        Assert.Equal(3, migrated.ApocalypseActivation.FirstRound); Assert.Equal(3, migrated.ApocalypseActivation.IntervalRounds);
        Assert.Null(migrated.ApocalypseActivation.MaxActivations);
        Assert.Equal(JsonSerializer.Serialize(migrated), JsonSerializer.Serialize(twice));
    }

    [Fact]
    public void DefinitionDefaultUsesInteractiveApocalypseDefinition()
    {
        var apocalypse = Interactive(); var policy = Resolver.Resolve(apocalypse, Defaults())!; var definition = apocalypse.Gameplay!.Activation!;
        Assert.Equal("definition_default", policy.Source); Assert.Equal(definition.Trigger, policy.Trigger);
        Assert.Equal(definition.Mode, policy.ScheduleMode); Assert.Equal(apocalypse.Gameplay.EffectProfileId, policy.EffectProfileId);
    }

    [Theory]
    [InlineData(ApocalypseActivationScheduleMode.Once, ApocalypseActivationTriggerMode.GameStart, 1, null, 1)]
    [InlineData(ApocalypseActivationScheduleMode.Recurring, ApocalypseActivationTriggerMode.AfterVoting, 3, 3, null)]
    [InlineData(ApocalypseActivationScheduleMode.Recurring, ApocalypseActivationTriggerMode.AfterRound, 3, 3, 5)]
    public void CustomPoliciesResolveCanonicalTiming(ApocalypseActivationScheduleMode mode, ApocalypseActivationTriggerMode trigger,
        int firstRound, int? interval, int? maximum)
    {
        var settings = SpecificInteractive(); settings.ApocalypseActivation = Custom(mode, trigger, firstRound, interval, maximum);
        Assert.Empty(Resolver.ValidateSettings(settings));
        var policy = Resolver.Resolve(Interactive(settings.SelectedApocalypseId), settings)!;
        Assert.Equal("custom", policy.Source); Assert.Equal(trigger == ApocalypseActivationTriggerMode.GameStart ? 1 : firstRound, policy.FirstRound);
        Assert.Equal(interval, policy.IntervalRounds); Assert.Equal(maximum, policy.MaxActivations);
    }

    [Theory]
    [InlineData("missing_interval")]
    [InlineData("once_interval")]
    [InlineData("game_start_recurring")]
    [InlineData("voting_disabled")]
    [InlineData("invalid_enum")]
    [InlineData("first_round")]
    [InlineData("interval")]
    [InlineData("maximum")]
    public void InvalidCustomPoliciesAreRejected(string variant)
    {
        var settings = SpecificInteractive(); settings.ApocalypseActivation = Custom(ApocalypseActivationScheduleMode.Recurring, ApocalypseActivationTriggerMode.AfterVoting, 3, 3, null);
        switch (variant)
        {
            case "missing_interval": settings.ApocalypseActivation.IntervalRounds = null; break;
            case "once_interval": settings.ApocalypseActivation.ScheduleMode = ApocalypseActivationScheduleMode.Once; settings.ApocalypseActivation.IntervalRounds = 3; settings.ApocalypseActivation.MaxActivations = 1; break;
            case "game_start_recurring": settings.ApocalypseActivation.Trigger = ApocalypseActivationTriggerMode.GameStart; break;
            case "voting_disabled": settings.VotingEnabled = false; break;
            case "invalid_enum": settings.ApocalypseActivation.Trigger = (ApocalypseActivationTriggerMode)99; break;
            case "first_round": settings.ApocalypseActivation.FirstRound = 9; break;
            case "interval": settings.ApocalypseActivation.IntervalRounds = 9; break;
            case "maximum": settings.ApocalypseActivation.MaxActivations = 21; break;
        }
        Assert.NotEmpty(Resolver.ValidateSettings(settings));
    }

    [Fact]
    public void DisabledAndOrdinarySelectionsRemainInactiveWithoutEffects()
    {
        var settings = SpecificInteractive(); settings.ApocalypseActivation.EffectsEnabled = false;
        var disabled = Resolver.Resolve(Interactive(settings.SelectedApocalypseId), settings)!;
        Assert.False(disabled.Enabled); Assert.Equal("disabled", disabled.Source);
        Assert.Null(Resolver.Resolve(Data.Value.Apocalypses.First(item => item.Gameplay?.Interactive != true), settings));
        settings.ApocalypseEnabled = false; Assert.Null(Resolver.Resolve(Interactive(), settings));
    }

    [Fact]
    public void NonConfigurableSpecificAndRandomCandidateIncompatibilityAreRejected()
    {
        var target = Interactive(); var definition = target.Gameplay!.Activation!; var configurable = definition.Configurable;
        var firstRounds = definition.AllowedFirstRounds;
        try
        {
            var specific = SpecificInteractive(target.Id); specific.ApocalypseActivation = Custom(ApocalypseActivationScheduleMode.Recurring, ApocalypseActivationTriggerMode.AfterVoting, 3, 3, null);
            definition.Configurable = false;
            Assert.Contains("apocalypse_activation_candidate_not_configurable", Resolver.ValidateSettings(specific));
            definition.Configurable = configurable;
            definition.AllowedFirstRounds = [1, 2];
            var random = Defaults(); random.ApocalypseActivation = Custom(ApocalypseActivationScheduleMode.Recurring, ApocalypseActivationTriggerMode.AfterVoting, 3, 3, null);
            Assert.Contains("apocalypse_activation_candidate_first_round_unsupported", Resolver.ValidateSettings(random));
        }
        finally { definition.Configurable = configurable; definition.AllowedFirstRounds = firstRounds; }
    }

    [Fact]
    public void AllProductionInteractiveDefinitionsSupportStandardCustomThreeThreePolicy()
    {
        var settings = Defaults(); settings.ApocalypseActivation = Custom(ApocalypseActivationScheduleMode.Recurring, ApocalypseActivationTriggerMode.AfterVoting, 3, 3, null);
        Assert.Equal(20, Selection.GetPossibleInteractiveCandidates(settings).Count);
        Assert.Empty(Resolver.ValidateSettings(settings)); Assert.Equal(20, Resolver.CountCompatible(settings));
    }

    [Fact]
    public void ResolvedPolicyIsSafeAndStartRetryKeepsSameInstance()
    {
        var settings = SpecificInteractive(); var room = new Room { Apocalypse = Interactive(settings.SelectedApocalypseId) };
        var first = Resolver.ResolveForStart(room, settings); settings.ApocalypseActivation.PolicyMode = ApocalypseActivationPolicyMode.Custom;
        var second = Resolver.ResolveForStart(room, settings);
        Assert.Same(first, second);
        var json = JsonSerializer.Serialize(first); Assert.DoesNotContain("Effects", json); Assert.DoesNotContain("Parameters", json);
    }

    [Fact]
    public void FailedStartRollbackClearsFrozenAndResolvedActivationState()
    {
        var before = Data.Value.Apocalypses.First(item => item.Gameplay?.Interactive != true);
        var room = new Room
        {
            SettingsFrozen = true,
            FrozenGameSettings = Defaults(),
            ResolvedBunkerCapacity = 2,
            Apocalypse = Interactive(),
            ApocalypseActivationPolicy = new() { Enabled = true, ApocalypseId = "resolved" }
        };
        GameHub.RollbackFailedLobbyStart(room, before);
        Assert.False(room.SettingsFrozen); Assert.Null(room.FrozenGameSettings); Assert.Null(room.ResolvedBunkerCapacity);
        Assert.Null(room.ApocalypseActivationPolicy); Assert.Same(before, room.Apocalypse);
    }

    private static RoomGameSettings Defaults() => RoomGameSettingsService.Preset(GamePreset.Classic);
    private static RoomGameSettings SpecificInteractive(string? id = null) { var settings = Defaults(); settings.ApocalypseSelectionMode = ApocalypseSelectionMode.Specific; settings.SelectedApocalypseId = id ?? Interactive().Id; return settings; }
    private static Apocalypse Interactive(string? id = null) => id == null ? Data.Value.Apocalypses.First(item => item.Gameplay?.Interactive == true) : Data.Value.FindApocalypseById(id)!;
    private static ApocalypseActivationSettings Custom(ApocalypseActivationScheduleMode mode, ApocalypseActivationTriggerMode trigger, int firstRound, int? interval, int? maximum) => new() { PolicyMode = ApocalypseActivationPolicyMode.Custom, ScheduleMode = mode, Trigger = trigger, FirstRound = firstRound, IntervalRounds = interval, MaxActivations = maximum };
    private static string FindRoot() { var directory = new DirectoryInfo(AppContext.BaseDirectory); while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj"))) directory = directory.Parent; return directory?.FullName ?? throw new DirectoryNotFoundException(); }
    private sealed class TestEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests"; public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot"); public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root; public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
    }
}
