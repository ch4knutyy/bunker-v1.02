using System.Collections.Immutable;
using System.Text.Json;
using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services.Scenarios;

public sealed class ScenarioContentRegistryTests
{
    [Fact]
    public void LoadsExactlyAuthoritativeV3ContentAndAllReferences()
    {
        var registry = new ScenarioContentRegistry(ScenarioTestData.ContentDirectory);

        Assert.Equal(27, registry.Cards.Length);
        Assert.Equal(29, registry.Events.Length);
        Assert.Equal(27, registry.Cards.Select(card => card.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.Equal(29, registry.Events.Select(item => item.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.All(registry.Cards, card => Assert.All(new[] { "uk", "en", "ru" },
            language => Assert.False(string.IsNullOrWhiteSpace(card.Title[language]))));
        Assert.All(registry.Events, item => Assert.All(new[] { "uk", "en", "ru" },
            language => Assert.False(string.IsNullOrWhiteSpace(item.PublicText[language]))));
    }

    [Fact]
    public void UnknownEffectAndOperationFailWithFilePathIdAndReason()
    {
        using var fixture = new ScenarioFixture();
        fixture.WriteCards("""
            {"schemaVersion":3,"cards":[{"id":"bad","enabled":true,"category":"x",
            "title":{"uk":"u","en":"e","ru":"r"},"description":{"uk":"u","en":"e","ru":"r"},
            "actions":[{"id":"a","label":{"uk":"u","en":"e","ru":"r"},"operation":"unknown_operation",
            "targetMode":"self","effects":[{"type":"unknown_effect"}]}]}]}
            """);
        fixture.WriteEvents("""{"schemaVersion":3,"events":[]}""");

        var exception = Assert.Throws<InvalidOperationException>(() =>
            new ScenarioContentRegistry(fixture.Directory));

        Assert.Contains("event_special_cards.json", exception.Message);
        Assert.Contains("$.cards[0].actions[0]", exception.Message);
        Assert.Contains("id=bad", exception.Message);
        Assert.Contains("unknown", exception.Message);
    }

    [Fact]
    public void GlobalNullTargetIsAllowedAndInvalidTargetShapesFailAtStartup()
    {
        using var valid = new ScenarioFixture();
        valid.WriteCards("""{"schemaVersion":3,"cards":[]}""");
        valid.WriteEvents("""
            {"schemaVersion":3,"events":[{
              "id":"global","enabled":true,"type":"event","resolutionMode":"automatic_public_event",
              "title":{"uk":"u","en":"e","ru":"r"},"publicText":{"uk":"u","en":"e","ru":"r"},
              "targetSelection":null,"effects":[{"type":"no_effect","targets":"room"}]
            }]}
            """);
        Assert.Single(new ScenarioContentRegistry(valid.Directory).Events);

        foreach (var invalidShape in new[] { "\"random_active_player\"", "[]" })
        {
            using var invalid = new ScenarioFixture();
            invalid.WriteCards("""{"schemaVersion":3,"cards":[]}""");
            invalid.WriteEvents($$"""
                {"schemaVersion":3,"events":[{
                  "id":"bad_target","enabled":true,"type":"event","resolutionMode":"automatic_public_event",
                  "title":{"uk":"u","en":"e","ru":"r"},"publicText":{"uk":"u","en":"e","ru":"r"},
                  "targetSelection":{{invalidShape}}
                }]}
                """);

            var exception = Assert.Throws<InvalidOperationException>(() =>
                new ScenarioContentRegistry(invalid.Directory));
            Assert.Contains("$.events[0].targetSelection", exception.Message);
            Assert.Contains("id=bad_target", exception.Message);
        }
    }
}

public sealed class ScenarioSchedulerTests
{
    [Fact]
    public void NewScheduleIsDueAfterRoundThreeBeforeVotingAndUsesActualRoundForNextInterval()
    {
        var scheduler = new ScenarioSchedulerService(new FakeRegistry(), TimeProvider.System, new Random(1));
        var room = ScenarioTestData.Room(twoPlayers: true);
        room.ScenarioSituations = scheduler.InitializeForNewGame(new RoomGameSettings
        {
            ScenarioSchedule = new ScenarioScheduleSettings
            {
                Enabled = true,
                FirstScenarioAfterRound = 3,
                IntervalRounds = 4,
                EnabledTypes = new(["event"], StringComparer.OrdinalIgnoreCase)
            }
        });

        Assert.False(scheduler.SelectForCompletedRound(room, 1).IsDue);
        Assert.False(scheduler.SelectForCompletedRound(room, 2).IsDue);
        var due = scheduler.SelectForCompletedRound(room, 3);
        Assert.True(due.IsDue);
        Assert.NotNull(due.Scenario);
        Assert.Equal(3, due.Scenario!.MinRound);
        scheduler.MarkStarted(room, due.Scenario!, 4);
        Assert.Equal(8, room.ScenarioSituations.NextDueAfterRound);
    }

    [Fact]
    public void DisabledLegacyAndCollisionPostponementDoNotStartAnotherSituation()
    {
        var scheduler = new ScenarioSchedulerService(new FakeRegistry(), TimeProvider.System, new Random(1));
        var legacy = ScenarioTestData.Room();
        Assert.Equal("scenario_disabled", scheduler.SelectForCompletedRound(legacy, 9).Reason);

        legacy.ScenarioSituations = new ScenarioSituationState
        {
            Enabled = true,
            NextDueAfterRound = 3,
            ActiveScenario = new ActiveScenarioSituation { IsResolved = false }
        };
        var collision = scheduler.SelectForCompletedRound(legacy, 3);
        Assert.True(collision.IsPostponed);
        Assert.Null(collision.Scenario);
    }

    private sealed class FakeRegistry : IScenarioContentRegistry
    {
        private static readonly JsonElement Source = JsonDocument.Parse(
            """{"eligibility":{"requiresAtLeastActivePlayers":1}}""").RootElement.Clone();
        public ImmutableArray<ScenarioDefinition> Events { get; } =
        [
            new()
            {
                Id = "event_1", Enabled = true, Type = "event",
                ResolutionMode = "automatic_public_event", MinRound = 3, Weight = 1,
                Title = new Dictionary<string, string> { ["uk"] = "u", ["en"] = "e", ["ru"] = "r" },
                PublicText = new Dictionary<string, string> { ["uk"] = "u", ["en"] = "e", ["ru"] = "r" },
                Source = Source
            }
        ];
        public ImmutableArray<EventSpecialCardDefinition> Cards => [];
        public ScenarioDefinition? FindEvent(string id) => Events.FirstOrDefault(item => item.Id == id);
        public EventSpecialCardDefinition? FindCard(string id) => null;
    }
}

public sealed class ScenarioRunnerTests
{
    [Fact]
    public void RoundThreeSelectionReachesRunnerAndAfterVotingCommandRunsOnlyOnce()
    {
        var runtime = ScenarioTestData.Runtime();
        var room = ScenarioTestData.Room(twoPlayers: true);
        room.ScenarioSituations = runtime.Scheduler.InitializeForNewGame(new RoomGameSettings
        {
            ScenarioSchedule = new ScenarioScheduleSettings
            {
                Enabled = true,
                FirstScenarioAfterRound = 3,
                IntervalRounds = 3,
                TriggerPhase = "after_voting",
                EnabledTypes = new(["event"], StringComparer.OrdinalIgnoreCase)
            }
        });

        Assert.False(runtime.Scheduler.SelectForCompletedRound(
            room, 3, "after_round_before_voting").IsDue);
        var selection = runtime.Scheduler.SelectForCompletedRound(room, 3, "after_voting");
        Assert.True(selection.IsDue);
        Assert.NotNull(selection.Scenario);

        var first = runtime.Runner.Run(room, selection.Scenario!, 3, commandId: "round-3-after-voting");
        var duplicate = runtime.Runner.Run(room, selection.Scenario!, 3, commandId: "round-3-after-voting");

        Assert.True(first.Success);
        Assert.True(duplicate.Success);
        Assert.Equal(3, room.ScenarioSituations.ActiveScenario!.TriggeredAfterRound);
        Assert.Single(room.ScenarioSituations.History, item => item.Result == "started");
    }

    [Fact]
    public void ThreatAndGlobalEventsWithoutPlayerTargetsDoNotCrash()
    {
        var runtime = ScenarioTestData.Runtime();
        var threatRoom = ScenarioTestData.Room();
        threatRoom.ScenarioSituations = runtime.Scheduler.InitializeForNewGame(new RoomGameSettings());
        var threat = new ScenarioDefinition
        {
            Id = "__existing_threat_flow__",
            Type = "threat",
            ResolutionMode = "existing_threat_flow",
            Title = ScenarioTestData.Localized(),
            PublicText = ScenarioTestData.Localized()
        };

        var threatResult = runtime.Runner.Run(threatRoom, threat, 3, commandId: "threat-3");
        Assert.True(threatResult.Success);
        Assert.True(threatResult.BlocksVoting);

        foreach (var sourceJson in new[] { "{}", """{"targetSelection":null}""" })
        {
            var room = ScenarioTestData.Room();
            room.ScenarioSituations = runtime.Scheduler.InitializeForNewGame(new RoomGameSettings());
            var global = ScenarioTestData.Definition(
                "global-" + sourceJson.Length,
                JsonDocument.Parse(sourceJson).RootElement.Clone());

            var result = runtime.Runner.Run(room, global, 3);

            Assert.True(result.Success);
            Assert.Null(result.ErrorCode);
        }
    }

    [Theory]
    [InlineData("""{"targetSelection":"random_active_player"}""")]
    [InlineData("""{"targetSelection":[]}""")]
    public void InvalidTargetSelectorFailsBeforeScenarioIsMarkedStarted(string sourceJson)
    {
        var runtime = ScenarioTestData.Runtime();
        var room = ScenarioTestData.Room();
        room.ScenarioSituations = runtime.Scheduler.InitializeForNewGame(new RoomGameSettings());
        var scenario = ScenarioTestData.Definition(
            "invalid-target",
            JsonDocument.Parse(sourceJson).RootElement.Clone());

        Assert.Throws<InvalidDataException>(() =>
            runtime.Runner.Run(room, scenario, 3, commandId: "invalid-target-3"));
        Assert.Null(room.ScenarioSituations.ActiveScenario);
        Assert.Empty(room.ScenarioSituations.History);
        Assert.DoesNotContain("invalid-target-3", room.ScenarioSituations.ProcessedCommandIds);
    }

    [Fact]
    public void InventoryScenarioAppliesOnceAndSnapshotStatePreventsReplay()
    {
        var runtime = ScenarioTestData.Runtime();
        var room = ScenarioTestData.Room(twoPlayers: true);
        room.ScenarioSituations = runtime.Scheduler.InitializeForNewGame(new RoomGameSettings());
        var scenario = runtime.Registry.FindEvent("supply_cache_for_everyone")!;
        var before = room.Players.Values.ToDictionary(
            player => player.Id,
            player => player.Inventory.Items.Count);

        var first = runtime.Runner.Run(room, scenario, 3, commandId: "inventory-round-3");
        Assert.True(first.Success);
        Assert.All(room.Players.Values, player =>
            Assert.Equal(before[player.Id] + 1, player.Inventory.Items.Count));

        var recoveredState = RoomSnapshotService.CaptureState(room);
        RoomSnapshotService.ApplyState(room, recoveredState);
        var duplicate = runtime.Runner.Run(room, scenario, 3, commandId: "inventory-round-3");

        Assert.True(duplicate.Success);
        Assert.All(room.Players.Values, player =>
            Assert.Equal(before[player.Id] + 1, player.Inventory.Items.Count));
        Assert.Single(room.ScenarioSituations!.History, item => item.Result == "started");
    }

    [Fact]
    public void RoundLifecycleHasNoLegacyBonusInventoryTriggerButKeepsStartingInventory()
    {
        var gameMaster = File.ReadAllText(Path.Combine(
            ScenarioTestData.Root, "Hubs", "BunkerHubGame", "GameHub.GameMaster.cs"));
        var scenarios = File.ReadAllText(Path.Combine(
            ScenarioTestData.Root, "Hubs", "BunkerHubGame", "GameHub.Scenarios.cs"));
        var rooms = File.ReadAllText(Path.Combine(
            ScenarioTestData.Root, "Hubs", "BunkerHubGame", "GameHub.Rooms.cs"));

        Assert.DoesNotContain("GrantConfiguredBonusInventory(", gameMaster);
        Assert.DoesNotContain("GrantConfiguredBonusInventory(", scenarios);
        Assert.Contains("StartingInventoryCount", rooms);
        Assert.Contains("ConfigureGeneratedPlayerForLobby", rooms);
    }
}

public sealed class BunkerIntelTests
{
    [Fact]
    public void LegacyIsAllVisibleAndProgressiveUsesScalarThenStableListUnits()
    {
        var service = new BunkerIntelService();
        var legacy = ScenarioTestData.Room();
        legacy.BunkerIntel = null;
        var legacyProjection = JsonSerializer.Serialize(service.Project(legacy, legacy.Players.Values.First()));
        Assert.Contains("\"suppliesMonths\":12", legacyProjection, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("Workshop", legacyProjection);

        var room = ScenarioTestData.Room();
        room.BunkerIntel = service.InitializeForNewGame(new RoomGameSettings
        {
            BunkerIntelMode = BunkerIntelMode.Progressive,
            BunkerIntelIntervalRounds = 2
        });
        var player = room.Players.Values.First();
        var hidden = JsonSerializer.Serialize(service.Project(room, player));
        Assert.Contains("\"suppliesMonths\":null", hidden, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("Workshop", hidden);

        Assert.Equal("condition", service.RevealNextPublic(room, 1).Category);
        Assert.False(service.RevealNextPublic(room, 2).Success);
        Assert.Equal("food", service.RevealNextPublic(room, 3).Category);
        Assert.Equal("water", service.RevealNextPublic(room, 5).Category);
        var listReveal = service.RevealNextPublic(room, 7);
        Assert.Equal("facilities", listReveal.Category);
        Assert.NotNull(listReveal.ItemId);
    }

    [Fact]
    public void PrivateIntelIsBoundToPlayerIdAndNotPresentInPublicProjection()
    {
        var service = new BunkerIntelService();
        var room = ScenarioTestData.Room(twoPlayers: true);
        room.BunkerIntel = service.InitializeForNewGame(new RoomGameSettings());
        var players = room.Players.Values.ToList();

        Assert.True(service.RevealPrivate(room, players[0], "food").Success);
        Assert.Contains("\"suppliesMonths\":12", JsonSerializer.Serialize(service.Project(room, players[0])),
            StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"suppliesMonths\":null", JsonSerializer.Serialize(service.Project(room, players[1])),
            StringComparison.OrdinalIgnoreCase);
        Assert.Contains("\"suppliesMonths\":null", JsonSerializer.Serialize(service.Project(room, null)),
            StringComparison.OrdinalIgnoreCase);
    }
}

public sealed class EventSpecialCardTests
{
    [Fact]
    public void StolenResourceTransfersOwnershipReturnsExactAmountAndDuplicateIsNoOp()
    {
        var registry = new ScenarioContentRegistry(ScenarioTestData.ContentDirectory);
        var intel = new BunkerIntelService();
        var resources = new BunkerResourceService();
        var gameData = new GameDataService(new TestEnvironment(ScenarioTestData.Root),
            NullLogger<GameDataService>.Instance);
        var cards = new EventSpecialCardService(registry, resources, intel,
            new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance),
            TimeProvider.System);
        var room = ScenarioTestData.Room(twoPlayers: true);
        room.Bunker!.SuppliesMonths = 10;
        var owner = room.Players.Values.First();
        var recipient = room.Players.Values.Last();
        var theft = registry.FindEvent("unknown_food_thief_6")!;

        var removed = cards.ApplyEffects(room, owner, owner, null, theft.Source.GetProperty("effects"));
        Assert.True(removed.Success);
        Assert.Equal(4, room.Bunker.SuppliesMonths);
        var runtime = cards.Grant(room, owner, "hidden_food_cache_6", theft.Id);
        Assert.Equal(6, runtime.StoredResource!.Amount);

        var transfer = cards.Transfer(room, owner, runtime.RuntimeCardId, recipient, "transfer-1");
        Assert.True(transfer.Success);
        Assert.Empty(owner.EventSpecialCards);
        Assert.Single(recipient.EventSpecialCards);

        var used = cards.Use(room, recipient, runtime.RuntimeCardId, "return_to_bunker",
            null, null, null, "return-1");
        Assert.True(used.Success);
        Assert.Equal(10, room.Bunker.SuppliesMonths);
        Assert.Equal(0, runtime.RemainingUses);

        var duplicate = cards.Use(room, recipient, runtime.RuntimeCardId, "return_to_bunker",
            null, null, null, "return-1");
        Assert.True(duplicate.Success);
        Assert.True(duplicate.IsDuplicate);
        Assert.Equal(10, room.Bunker.SuppliesMonths);
    }
}

internal static class ScenarioTestData
{
    public static string Root
    {
        get
        {
            var directory = new DirectoryInfo(AppContext.BaseDirectory);
            while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj")))
                directory = directory.Parent;
            return directory?.FullName ?? throw new DirectoryNotFoundException();
        }
    }
    public static string ContentDirectory => Path.Combine(Root, "wwwroot", "data", "scenario");

    public static ScenarioRuntime Runtime()
    {
        var registry = new ScenarioContentRegistry(ContentDirectory);
        var scheduler = new ScenarioSchedulerService(registry, TimeProvider.System, new Random(1));
        var intel = new BunkerIntelService();
        var resources = new BunkerResourceService();
        var gameData = new GameDataService(new TestEnvironment(Root),
            NullLogger<GameDataService>.Instance);
        var cards = new EventSpecialCardService(
            registry,
            resources,
            intel,
            new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance),
            TimeProvider.System);
        return new(registry, scheduler, new ScenarioRunnerService(
            scheduler, cards, intel, TimeProvider.System));
    }

    public static IReadOnlyDictionary<string, string> Localized() =>
        new Dictionary<string, string> { ["uk"] = "u", ["en"] = "e", ["ru"] = "r" };

    public static ScenarioDefinition Definition(string id, JsonElement source) => new()
    {
        Id = id,
        Enabled = true,
        Type = "event",
        ResolutionMode = "automatic_public_event",
        MinRound = 3,
        Weight = 1,
        Title = Localized(),
        PublicText = Localized(),
        Source = source
    };

    public static Room Room(bool twoPlayers = false)
    {
        var room = new Room
        {
            State = RoomState.Playing,
            CurrentPhase = GamePhase.RoundEnded,
            CurrentRound = 3,
            Bunker = new BunkerInfo
            {
                Name = "Bunker", Description = "Safe", Capacity = 4, Location = "Hill",
                Condition = "good", SuppliesMonths = 12, WaterMonths = 8,
                Facilities = ["Workshop", "Clinic"], Resources = ["Tools"], Problems = ["Leak"]
            }
        };
        room.Players["one"] = new Player
        {
            Id = Guid.NewGuid(), Name = "One", ConnectionId = "one", StablePlayerId = "one"
        };
        if (twoPlayers)
            room.Players["two"] = new Player
            {
                Id = Guid.NewGuid(), Name = "Two", ConnectionId = "two", StablePlayerId = "two"
            };
        return room;
    }
}

internal sealed record ScenarioRuntime(
    ScenarioContentRegistry Registry,
    ScenarioSchedulerService Scheduler,
    ScenarioRunnerService Runner);

internal sealed class ScenarioFixture : IDisposable
{
    public string Directory { get; } = Path.Combine(Path.GetTempPath(), "bunker-scenario-" + Guid.NewGuid().ToString("N"));
    public ScenarioFixture() => System.IO.Directory.CreateDirectory(Directory);
    public void WriteCards(string json) => File.WriteAllText(Path.Combine(Directory, "event_special_cards.json"), json);
    public void WriteEvents(string json) => File.WriteAllText(Path.Combine(Directory, "scenario_events.json"), json);
    public void Dispose() => System.IO.Directory.Delete(Directory, true);
}

internal sealed class TestEnvironment(string root) : IWebHostEnvironment
{
    public string ApplicationName { get; set; } = "Bunker.UnitTests";
    public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
    public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot");
    public string EnvironmentName { get; set; } = "Development";
    public string ContentRootPath { get; set; } = root;
    public IFileProvider ContentRootFileProvider { get; set; } = new PhysicalFileProvider(root);
}
