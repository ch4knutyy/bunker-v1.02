using System.Collections.Concurrent;
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

namespace Bunker.UnitTests.Services;

public sealed class BunkerWaterTests
{
    [Fact]
    public void ProductionContentHasCanonicalFoodAndWaterSchema()
    {
        var gameData = LoadGameData();
        Assert.Equal(205, gameData.Bunkers.Count);
        Assert.Equal(205, gameData.Bunkers.Select(bunker => bunker.Id).Distinct(StringComparer.OrdinalIgnoreCase).Count());
        Assert.All(gameData.Bunkers, bunker =>
        {
            Assert.True(bunker.HasExplicitWaterMonths);
            Assert.InRange(bunker.SuppliesMonths, 0, 120);
            Assert.InRange(bunker.WaterMonths, 0, 120);
        });
        foreach (var id in new[]
        {
            "glacial_meltwater_bunker",
            "artesian_aquifer_bunker",
            "hydroelectric_dam_tunnels",
            "rainwater_harvesting_bunker",
            "desalination_plant_bunker"
        })
        {
            Assert.Contains(gameData.Bunkers, bunker => bunker.Id == id);
        }

        var dtoJson = JsonSerializer.Serialize(gameData.Bunkers[0].ToClientInfo());
        Assert.Contains("\"suppliesMonths\":", dtoJson);
        Assert.Contains("\"waterMonths\":", dtoJson);
    }

    [Fact]
    public void LegacyPayloadFallbackDistinguishesMissingWaterFromExplicitZero()
    {
        var legacy = JsonSerializer.Deserialize<BunkerInfo>("""{"suppliesMonths":7}""")!;
        Assert.Equal(7, legacy.WaterMonths);
        Assert.False(legacy.HasExplicitWaterMonths);
        Assert.DoesNotContain("waterMonths", JsonSerializer.Serialize(legacy));

        var explicitZero = JsonSerializer.Deserialize<BunkerInfo>("""{"suppliesMonths":7,"waterMonths":0}""")!;
        Assert.Equal(0, explicitZero.WaterMonths);
        Assert.True(explicitZero.HasExplicitWaterMonths);
        Assert.Contains("\"waterMonths\":0", JsonSerializer.Serialize(explicitZero));
    }

    [Fact]
    public void CanonicalResourceServiceKeepsFoodAndWaterIndependentAndClamped()
    {
        var service = new BunkerResourceService();
        var bunker = new BunkerInfo { SuppliesMonths = 6, WaterMonths = 4 };

        var waterAdded = service.Add(bunker, BunkerResourceKind.Water, 120);
        Assert.Equal(116, waterAdded.AppliedMonths);
        Assert.Equal(120, bunker.WaterMonths);
        Assert.Equal(6, bunker.SuppliesMonths);

        var waterRemoved = service.Remove(bunker, BunkerResourceKind.Water, 120);
        Assert.Equal(120, waterRemoved.AppliedMonths);
        Assert.Equal(0, bunker.WaterMonths);
        Assert.Equal(6, bunker.SuppliesMonths);
        Assert.Throws<ArgumentOutOfRangeException>(() => service.Add(bunker, BunkerResourceKind.Food, 0));
        Assert.Throws<ArgumentOutOfRangeException>(() => service.Remove(bunker, BunkerResourceKind.Water, 121));
    }

    [Fact]
    public async Task HostWaterMutationCreatesAuditSnapshotRecoveryAndCanBeUndone()
    {
        var context = CreateHubContext();
        context.Room.Bunker = new() { SuppliesMonths = 9, WaterMonths = 12 };

        await context.Hub.AddBunkerWater(3, "water-command");

        Assert.Equal(15, context.Room.Bunker.WaterMonths);
        Assert.Equal(9, context.Room.Bunker.SuppliesMonths);
        var audit = Assert.Single(context.Room.GmAuditLog, entry => entry.ActionType == "water_added");
        Assert.True(audit.CanUndo);
        Assert.NotNull(audit.RelatedSnapshotId);
        Assert.Contains(context.Clients.Calls, call => call.Method == "BunkerWaterAdded");
        Assert.Contains(context.Clients.Calls, call => call.Method == "BunkerUpdated");
        Assert.Contains(context.Recovery.Snapshots, item => item.Reason == "water_added");

        var recoveryCapture = new RoomRecoveryCaptureService();
        var persisted = recoveryCapture.Capture(context.Room);
        Assert.True(recoveryCapture.TryRestore(persisted.StateJson, out var recovered, out var recoveryError), recoveryError);
        Assert.Equal(15, recovered!.Bunker!.WaterMonths);
        Assert.Equal(9, recovered.Bunker.SuppliesMonths);

        var undo = context.Snapshots.UndoLastGmAction(
            context.Room,
            context.Owner.StablePlayerId,
            "undo-water",
            out var original);
        Assert.True(undo.Success);
        Assert.Equal(audit.Id, original!.Id);
        Assert.Equal(12, context.Room.Bunker.WaterMonths);
        Assert.Equal(9, context.Room.Bunker.SuppliesMonths);
    }

    [Fact]
    public async Task NonHostAndOmniscientCannotMutateBunkerResources()
    {
        var context = CreateHubContext();
        context.Room.Bunker = new() { SuppliesMonths = 9, WaterMonths = 12 };

        context.Hub.Context = new TestHubCallerContext(context.Target.ConnectionId);
        await context.Hub.RemoveBunkerWater(3, "non-host");
        Assert.Equal(12, context.Room.Bunker.WaterMonths);

        context.Owner.IsSpectatorGm = true;
        context.Owner.GmRole = GmMode.OmniscientGm;
        context.Hub.Context = new TestHubCallerContext(context.Owner.ConnectionId);
        await context.Hub.AddBunkerWater(3, "omniscient");
        Assert.Equal(12, context.Room.Bunker.WaterMonths);
        Assert.DoesNotContain(context.Room.ProcessedGmPlayerCommandIds, command => command is "non-host" or "omniscient");
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
        var recovery = new RecordingRoomRecoveryCoordinator();
        var clients = new RecordingHubCallerClients();
        var hub = new GameHub(
            new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance),
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
            roomRecovery: recovery,
            gmPanelStateBuilder: new GmPanelStateBuilder(TimeProvider.System),
            bunkerResources: new BunkerResourceService())
        {
            Clients = clients,
            Context = new TestHubCallerContext("owner-connection")
        };

        var room = roomService.CreateRoom("Water", "owner-connection", "Owner");
        var owner = new Player
        {
            Name = "Owner",
            ConnectionId = "owner-connection",
            StablePlayerId = "owner-player",
            IsConnected = true
        };
        var target = new Player
        {
            Name = "Target",
            ConnectionId = "target-connection",
            StablePlayerId = "target-player",
            IsConnected = true
        };
        Assert.True(roomService.JoinRoom(room.Id, owner.ConnectionId, owner).success);
        Assert.True(roomService.JoinRoom(room.Id, target.ConnectionId, target).success);
        room.State = RoomState.Playing;
        room.CurrentPhase = GamePhase.RoundReveal;
        room.CurrentRound = 1;
        return new(hub, room, owner, target, clients, snapshots, recovery);
    }

    private static GameDataService LoadGameData()
    {
        var root = FindRepositoryRoot();
        return new GameDataService(new TestEnvironment(root), NullLogger<GameDataService>.Instance);
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
        Player Owner,
        Player Target,
        RecordingHubCallerClients Clients,
        RoomSnapshotService Snapshots,
        RecordingRoomRecoveryCoordinator Recovery);

    private sealed class RecordingRoomRecoveryCoordinator : IRoomRecoveryCoordinator
    {
        public List<(string RoomCode, string Reason)> Snapshots { get; } = [];
        public void QueueSnapshot(string roomCode, string reason) => Snapshots.Add((roomCode, reason));
        public void QueueDelete(string roomCode)
        {
        }
    }

    private sealed record HubCall(string Method, IReadOnlyList<object?> Arguments);

    private sealed class RecordingClientProxy(ConcurrentQueue<HubCall> calls) : IClientProxy
    {
        public Task SendCoreAsync(string method, object?[] args, CancellationToken cancellationToken = default)
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
