using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Security.Claims;
using System.Text.Json;
using Bunker.Hubs;
using Bunker.Models;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services.Scenarios;

public sealed class ScenarioEndRoundTests
{
    [Fact]
    public async Task UnexpectedScenarioExceptionIsRolledBackAndRoundStillAdvances()
    {
        var context = CreateHubContext();
        var playerKey = RoomService.GetPlayerKey(context.Host);
        context.Room.CurrentRoundReveals[playerKey] = "Profession";

        await context.Hub.EndRound();

        Assert.Equal(3, context.Room.CurrentRound);
        Assert.Equal(GamePhase.RoundReveal, context.Room.CurrentPhase);
        Assert.Null(context.Room.ScenarioSituations!.ActiveScenario);
        Assert.Empty(context.Room.ScenarioSituations.History);
        Assert.Contains(context.Clients.Calls, call =>
            call.Method == "ReceiveError" &&
            call.Arguments.Contains("scenario_execution_failed"));
        Assert.Contains(context.Clients.Calls, call => call.Method == "RoundAdvanced");
    }

    private static HubContext CreateHubContext()
    {
        var root = FindRepositoryRoot();
        var environment = new TestEnvironment(root);
        var gameData = new GameDataService(environment, NullLogger<GameDataService>.Instance);
        var roomService = new RoomService(NullLogger<RoomService>.Instance);
        var audit = new GmAuditService(TimeProvider.System);
        var timer = new GameTimerService(TimeProvider.System);
        var integrity = new RoomIntegrityService(roomService, gameData, TimeProvider.System);
        var snapshots = new RoomSnapshotService(integrity, audit, TimeProvider.System);
        var registry = new ThrowingScenarioRegistry();
        var scheduler = new ScenarioSchedulerService(registry, TimeProvider.System, new Random(1));
        var intel = new BunkerIntelService();
        var resources = new BunkerResourceService();
        var generator = new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance);
        var cards = new EventSpecialCardService(
            registry,
            resources,
            intel,
            generator,
            TimeProvider.System);
        var runner = new ScenarioRunnerService(scheduler, cards, intel, TimeProvider.System);
        var clients = new RecordingHubCallerClients();
        var hub = new GameHub(
            generator,
            roomService,
            gameData,
            new ScenarioImageService(environment, NullLogger<ScenarioImageService>.Instance),
            new ThreatScalingService(),
            new ThreatMiniGameRegistry([]),
            timer,
            new ThreatAuditService(TimeProvider.System),
            NullLogger<GameHub>.Instance,
            new PlayerDisconnectCleanupCoordinator(
                roomService,
                audit,
                null!,
                TimeProvider.System,
                null!,
                NullLogger<PlayerDisconnectCleanupCoordinator>.Instance),
            roomIntegrity: integrity,
            gmAudit: audit,
            roomSnapshots: snapshots,
            gmPanelStateBuilder: new GmPanelStateBuilder(TimeProvider.System),
            bunkerResources: resources,
            scenarioScheduler: scheduler,
            scenarioRunner: runner,
            bunkerIntel: intel,
            eventSpecialCards: cards,
            scenarioContent: registry)
        {
            Clients = clients,
            Context = new TestHubCallerContext("host-connection")
        };

        var room = roomService.CreateRoom("Scenario", "host-connection", "Host");
        var host = new Player
        {
            Name = "Host",
            ConnectionId = "host-connection",
            StablePlayerId = "host-player",
            IsConnected = true
        };
        Assert.True(roomService.JoinRoom(room.Id, host.ConnectionId, host).success);
        room.State = RoomState.Playing;
        room.CurrentPhase = GamePhase.RoundReveal;
        room.CurrentRound = 2;
        room.Bunker = new BunkerInfo
        {
            Name = "Bunker",
            SuppliesMonths = 12,
            WaterMonths = 12
        };
        room.GameSettings.ThreatsEnabled = false;
        room.GameSettings.VotingEnabled = false;
        room.ScenarioSituations = new ScenarioSituationState
        {
            Enabled = true,
            FirstScenarioAfterRound = 2,
            NextDueAfterRound = 2,
            IntervalRounds = 3,
            EnabledTypes = new(["event"], StringComparer.OrdinalIgnoreCase)
        };

        return new(hub, room, host, clients);
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj")))
            directory = directory.Parent;
        return directory?.FullName ?? throw new DirectoryNotFoundException("Repository root not found");
    }

    private sealed record HubContext(
        GameHub Hub,
        Room Room,
        Player Host,
        RecordingHubCallerClients Clients);

    private sealed class ThrowingScenarioRegistry : IScenarioContentRegistry
    {
        private static readonly ScenarioDefinition Scenario = new()
        {
            Id = "unexpected-runner-failure",
            Enabled = true,
            Type = "event",
            ResolutionMode = "automatic_public_event",
            MinRound = 2,
            Weight = 1,
            Title = Localized(),
            PublicText = Localized(),
            Source = JsonDocument.Parse(
                """{"targetSelection":null,"effects":{}}""").RootElement.Clone()
        };

        public ImmutableArray<ScenarioDefinition> Events { get; } = [Scenario];
        public ImmutableArray<EventSpecialCardDefinition> Cards => [];
        public ScenarioDefinition? FindEvent(string id) =>
            string.Equals(id, Scenario.Id, StringComparison.OrdinalIgnoreCase) ? Scenario : null;
        public EventSpecialCardDefinition? FindCard(string id) => null;

        private static IReadOnlyDictionary<string, string> Localized() =>
            new Dictionary<string, string> { ["uk"] = "u", ["en"] = "e", ["ru"] = "r" };
    }

    private sealed record HubCall(string Method, IReadOnlyList<object?> Arguments);

    private sealed class RecordingClientProxy(ConcurrentQueue<HubCall> calls) : IClientProxy
    {
        public Task SendCoreAsync(
            string method,
            object?[] args,
            CancellationToken cancellationToken = default)
        {
            calls.Enqueue(new(method, args));
            return Task.CompletedTask;
        }
    }

    private sealed class RecordingHubCallerClients : IHubCallerClients
    {
        private readonly ConcurrentQueue<HubCall> _calls = new();
        private readonly IClientProxy _proxy;

        public RecordingHubCallerClients() => _proxy = new RecordingClientProxy(_calls);
        public IReadOnlyCollection<HubCall> Calls => _calls.ToArray();
        public IClientProxy All => _proxy;
        public IClientProxy Caller => _proxy;
        public IClientProxy Others => _proxy;
        public IClientProxy AllExcept(IReadOnlyList<string> excludedConnectionIds) => _proxy;
        public IClientProxy Client(string connectionId) => _proxy;
        public IClientProxy Clients(IReadOnlyList<string> connectionIds) => _proxy;
        public IClientProxy Group(string groupName) => _proxy;
        public IClientProxy GroupExcept(string groupName, IReadOnlyList<string> excludedConnectionIds) => _proxy;
        public IClientProxy Groups(IReadOnlyList<string> groupNames) => _proxy;
        public IClientProxy OthersInGroup(string groupName) => _proxy;
        public IClientProxy User(string userId) => _proxy;
        public IClientProxy Users(IReadOnlyList<string> userIds) => _proxy;
    }

    private sealed class TestHubCallerContext(string connectionId) : HubCallerContext
    {
        private readonly Dictionary<object, object?> _items = new();
        private readonly CancellationTokenSource _connectionAborted = new();
        public override string ConnectionId { get; } = connectionId;
        public override string? UserIdentifier => null;
        public override ClaimsPrincipal? User { get; } = new(new ClaimsIdentity());
        public override IDictionary<object, object?> Items => _items;
        public override IFeatureCollection Features { get; } = new FeatureCollection();
        public override CancellationToken ConnectionAborted => _connectionAborted.Token;
        public override void Abort() => _connectionAborted.Cancel();
    }

    private sealed class TestEnvironment(string root) : IWebHostEnvironment
    {
        public string ApplicationName { get; set; } = "Bunker.UnitTests";
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string WebRootPath { get; set; } = Path.Combine(root, "wwwroot");
        public string EnvironmentName { get; set; } = "Development";
        public string ContentRootPath { get; set; } = root;
        public IFileProvider ContentRootFileProvider { get; set; } = new PhysicalFileProvider(root);
    }
}
