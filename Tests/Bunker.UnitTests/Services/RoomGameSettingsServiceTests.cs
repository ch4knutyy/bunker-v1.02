using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services;

public sealed class RoomGameSettingsServiceTests
{
    [Fact]
    public void ClassicDefaultsMatchCurrentProductionRules()
    {
        var settings = RoomGameSettingsService.Preset(GamePreset.Classic);
        Assert.Equal(RoomGameSettings.CurrentVersion, settings.Version);
        Assert.Equal(12, settings.MaxGameplayPlayers);
        Assert.Equal(2, settings.MinGameplayPlayers);
        Assert.Equal(BunkerCapacityMode.Automatic, settings.BunkerCapacityMode);
        Assert.True(settings.ThreatsEnabled);
        Assert.Equal(InteractiveThreatRate.Rare, settings.InteractiveThreatRate);
        Assert.Equal(1, RoomGameSettingsService.InteractivePercent(settings.InteractiveThreatRate));
        Assert.Equal(3, settings.FirstThreatRound);
        Assert.Equal(1, settings.MaxThreatsPerGame);
        Assert.False(settings.RoundTimerEnabled);
        Assert.True(settings.VotingEnabled);
        Assert.Equal(3, settings.VotingStartRound);
        Assert.True(settings.SpecialCardsEnabled);
        Assert.Equal(1, settings.SpecialCardsPerPlayer);
        Assert.Equal(3, settings.BonusInventoryRound);
        Assert.Equal(1, settings.BonusInventoryCount);
        Assert.Equal(1, settings.StartingInventoryCount);
        Assert.Equal(ApocalypseSelectionMode.RandomAll, settings.ApocalypseSelectionMode);
        Assert.Equal(10, settings.AllowedApocalypseCategoryIds.Count);
        Assert.True(settings.AllowInteractiveApocalypses);
        Assert.Equal(10, settings.InteractiveApocalypseChancePercent);
        Assert.True(settings.ApocalypseThemeEnabled);
        Assert.True(settings.ApocalypseActivation.EffectsEnabled);
        Assert.Equal(ApocalypseActivationPolicyMode.DefinitionDefault, settings.ApocalypseActivation.PolicyMode);
    }

    [Fact]
    public void VersionTwoMigratesThroughVersionFourDefaultsIdempotently()
    {
        var versionTwo = new RoomGameSettings { Version = 2, ApocalypseSelectionMode = ApocalypseSelectionMode.Specific, SelectedApocalypseId = "legacy" };
        var migrated = RoomGameSettingsService.Migrate(versionTwo);
        var twice = RoomGameSettingsService.Migrate(migrated);
        Assert.Equal(4, migrated.Version); Assert.Equal(ApocalypseSelectionMode.RandomAll, migrated.ApocalypseSelectionMode);
        Assert.Null(migrated.SelectedApocalypseId); Assert.Equal(10, migrated.AllowedApocalypseCategoryIds.Count);
        Assert.Equal(JsonSerializer.Serialize(migrated), JsonSerializer.Serialize(twice));
    }

    [Fact]
    public void FreezeAndClonePreserveApocalypseConfiguration()
    {
        var context = CreateContext(); var settings = RoomGameSettingsService.Clone(context.Room.GameSettings);
        settings.ApocalypseSelectionMode = ApocalypseSelectionMode.CustomPool;
        settings.ApocalypseCustomPoolIds = ["one", "two"]; settings.ApocalypseThemeEnabled = false;
        settings.ApocalypseActivation = new() { PolicyMode = ApocalypseActivationPolicyMode.Custom, Trigger = ApocalypseActivationTriggerMode.AfterRound, IntervalRounds = 2 };
        context.Room.GameSettings = settings; context.Service.FreezeForStart(context.Room, (min, max) => min);
        settings.ApocalypseCustomPoolIds.Clear();
        Assert.Equal(["one", "two"], context.Room.FrozenGameSettings!.ApocalypseCustomPoolIds);
        Assert.False(context.Room.FrozenGameSettings.ApocalypseThemeEnabled);
        Assert.Equal(ApocalypseActivationTriggerMode.AfterRound, context.Room.FrozenGameSettings.ApocalypseActivation.Trigger);
        Assert.Equal(2, context.Room.FrozenGameSettings.ApocalypseActivation.IntervalRounds);
    }

    [Fact]
    public void MissingOrLegacySettingsMigrateToVersionedClassicWithoutDatabaseMigration()
    {
        var missing = RoomGameSettingsService.Migrate(null);
        var legacy = RoomGameSettingsService.Migrate(new RoomGameSettings { Version = 0, MaxGameplayPlayers = 3 });
        Assert.Equal(RoomGameSettings.CurrentVersion, missing.Version);
        Assert.Equal(12, legacy.MaxGameplayPlayers);
        Assert.Equal(GamePreset.Classic, legacy.Preset);
    }

    [Fact]
    public void ApplyIsHostOnlyLobbyOnlyAtomicAndResetsReadiness()
    {
        var context = CreateContext();
        context.Host.IsLobbyReady = true; context.Guest.IsLobbyReady = true;
        var settings = RoomGameSettingsService.Clone(context.Room.GameSettings);
        settings.MaxGameplayPlayers = 6;

        var blocked = context.Service.Apply(context.Room, context.Guest, Request(context.Room, settings, "guest"));
        Assert.False(blocked.Success); Assert.Equal("lobby_host_required", blocked.ErrorCode);

        var applied = context.Service.Apply(context.Room, context.Host, Request(context.Room, settings, "host"));
        Assert.True(applied.Success); Assert.Equal(2, context.Room.SettingsRevision);
        Assert.Equal(6, context.Room.MaxPlayers); Assert.False(context.Host.IsLobbyReady); Assert.False(context.Guest.IsLobbyReady);
        Assert.Equal(GamePreset.Custom, context.Room.GameSettings.Preset);

        context.Room.State = RoomState.Playing;
        settings.MaxGameplayPlayers = 7;
        var frozen = context.Service.Apply(context.Room, context.Host, Request(context.Room, settings, "running"));
        Assert.False(frozen.Success); Assert.Equal("settings_frozen", frozen.ErrorCode); Assert.Equal(6, context.Room.MaxPlayers);
    }

    [Fact]
    public void ManualActivationChangeMakesPresetCustom()
    {
        var context = CreateContext(); var settings = RoomGameSettingsService.Clone(context.Room.GameSettings);
        settings.ApocalypseActivation.PolicyMode = ApocalypseActivationPolicyMode.Custom;
        settings.ApocalypseActivation.Trigger = ApocalypseActivationTriggerMode.AfterRound;
        var result = context.Service.Apply(context.Room, context.Host, Request(context.Room, settings, "activation-custom"));
        Assert.True(result.Success); Assert.Equal(GamePreset.Custom, context.Room.GameSettings.Preset);
    }

    [Fact]
    public void InvalidRequestCommitsNothingAndStaleRevisionReturnsCanonicalState()
    {
        var context = CreateContext();
        var before = JsonSerializer.Serialize(context.Room.GameSettings);
        var invalid = RoomGameSettingsService.Clone(context.Room.GameSettings); invalid.MinGameplayPlayers = 4; invalid.MaxGameplayPlayers = 3;
        var rejected = context.Service.Apply(context.Room, context.Host, Request(context.Room, invalid, "invalid"));
        Assert.False(rejected.Success); Assert.Contains("invalid_min_players", rejected.Errors);
        Assert.Equal(before, JsonSerializer.Serialize(context.Room.GameSettings)); Assert.Equal(1, context.Room.SettingsRevision);

        var stale = Request(context.Room, RoomGameSettingsService.Preset(GamePreset.Calm), "stale"); stale.ExpectedRevision = 0;
        var conflict = context.Service.Apply(context.Room, context.Host, stale);
        Assert.False(conflict.Success); Assert.Equal("settings_revision_conflict", conflict.ErrorCode);
        Assert.Equal("Classic", conflict.Settings.Preset);
    }

    [Fact]
    public void ConcurrentUpdatesWithSameRevisionCommitExactlyOnce()
    {
        var context = CreateContext();
        var first = RoomGameSettingsService.Clone(context.Room.GameSettings); first.MaxGameplayPlayers = 6;
        var second = RoomGameSettingsService.Clone(context.Room.GameSettings); second.MaxGameplayPlayers = 7;
        var firstRequest = new LobbySettingsUpdateRequest { ExpectedRevision = 1, CommandId = "parallel-1", Settings = first };
        var secondRequest = new LobbySettingsUpdateRequest { ExpectedRevision = 1, CommandId = "parallel-2", Settings = second };
        LobbySettingsApplyResult? firstResult = null, secondResult = null;

        Parallel.Invoke(
            () => firstResult = context.Service.Apply(context.Room, context.Host, firstRequest),
            () => secondResult = context.Service.Apply(context.Room, context.Host, secondRequest));

        Assert.Equal(1, new[] { firstResult!, secondResult! }.Count(result => result.Success));
        Assert.Equal(1, new[] { firstResult!, secondResult! }.Count(result => result.ErrorCode == "settings_revision_conflict"));
        Assert.Equal(2, context.Room.SettingsRevision);
    }

    [Fact]
    public void CommandIdAndStartFreezeAreIdempotentAndRandomCapacityResolvesOnce()
    {
        var context = CreateContext();
        var settings = RoomGameSettingsService.Clone(context.Room.GameSettings);
        settings.BunkerCapacityMode = BunkerCapacityMode.RandomRange;
        settings.RandomBunkerCapacityMin = 1; settings.RandomBunkerCapacityMax = 2;
        var request = Request(context.Room, settings, "same-command");
        Assert.True(context.Service.Apply(context.Room, context.Host, request).Success);
        Assert.True(context.Service.Apply(context.Room, context.Host, request).IsDuplicate);
        Assert.Equal(2, context.Room.SettingsRevision);

        var draws = 0;
        context.Service.FreezeForStart(context.Room, (min, max) => { draws++; return max - 1; });
        context.Service.FreezeForStart(context.Room, (min, max) => { draws++; return min; });
        Assert.True(context.Room.SettingsFrozen); Assert.Equal(2, context.Room.ResolvedBunkerCapacity); Assert.Equal(1, draws);
        settings.RandomBunkerCapacityMax = 1;
        Assert.Equal(2, context.Room.FrozenGameSettings!.RandomBunkerCapacityMax);
    }

    [Theory]
    [InlineData(GamePreset.Calm, 0, false, 3)]
    [InlineData(GamePreset.Dangerous, 10, true, 2)]
    [InlineData(GamePreset.Hardcore, 25, true, 2)]
    [InlineData(GamePreset.Quick, 1, true, 2)]
    [InlineData(GamePreset.Long, 1, true, 4)]
    public void PresetsOnlyFillExplicitCanonicalValues(GamePreset preset, int interactivePercent, bool timer, int votingRound)
    {
        var settings = RoomGameSettingsService.Preset(preset);
        Assert.Equal(preset, settings.Preset);
        Assert.Equal(interactivePercent, RoomGameSettingsService.InteractivePercent(settings.InteractiveThreatRate));
        Assert.Equal(timer, settings.RoundTimerEnabled);
        Assert.Equal(votingRound, settings.VotingStartRound);
    }

    [Fact]
    public void SafeDtoContainsRulesButNoPasswordPlayersOrGeneratedContent()
    {
        var context = CreateContext(); context.Room.Password = "secret-value";
        context.Guest.Profession.Name = "hidden-profession";
        var json = JsonSerializer.Serialize(context.Service.ToDto(context.Room));
        Assert.Contains("InteractiveThreatPercent", json);
        Assert.DoesNotContain("secret-value", json); Assert.DoesNotContain("hidden-profession", json);
        Assert.DoesNotContain("Password", json); Assert.DoesNotContain("DisplayName", json);
    }

    private static SettingsContext CreateContext()
    {
        var rooms = new RoomService(NullLogger<RoomService>.Instance);
        var room = rooms.CreateRoom("settings", "host", "Host");
        var host = new Player { Name = "Host", ConnectionId = "host", StablePlayerId = "host-id" };
        var guest = new Player { Name = "Guest", ConnectionId = "guest", StablePlayerId = "guest-id" };
        Assert.True(rooms.JoinRoom(room.Id, host.ConnectionId, host).success);
        Assert.True(rooms.JoinRoom(room.Id, guest.ConnectionId, guest).success);
        var audit = new GmAuditService(TimeProvider.System);
        return new(new RoomGameSettingsService(audit), room, host, guest);
    }

    private static LobbySettingsUpdateRequest Request(Room room, RoomGameSettings settings, string commandId) => new()
    {
        ExpectedRevision = room.SettingsRevision,
        CommandId = commandId,
        Settings = settings
    };

    private sealed record SettingsContext(RoomGameSettingsService Service, Room Room, Player Host, Player Guest);
}
