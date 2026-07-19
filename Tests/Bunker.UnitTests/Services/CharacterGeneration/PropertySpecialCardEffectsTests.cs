using System.Collections.Concurrent;
using System.Reflection;
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

namespace Bunker.UnitTests.Services.CharacterGeneration;

public sealed class PropertySpecialCardEffectsTests
{
    [Fact]
    public async Task PropertyEditorHostUpdateIsCanonicalAuditedIdempotentAndUndoable()
    {
        var context = CreateContext();
        context.Target.Property = Property("target-property", 3);
        context.Target.Revealed.Property = true;
        var values = new Dictionary<string, int>
        {
            ["capacityLiters"] = 620,
            ["conditionLevel"] = 5
        };

        await context.Hub.UpdatePlayerProperty(
            context.Target.StablePlayerId,
            "medical_industrial_medical_refrigerator",
            values,
            "property-edit-command");

        Assert.Equal(
            "medical_industrial_medical_refrigerator",
            context.Target.Property!.DefinitionId);
        Assert.Equal(620, context.Target.Property.GeneratedValues["capacityLiters"]);
        Assert.True(context.Target.Revealed.Property);
        var definition = Assert.Single(
            context.GameData.Properties,
            item => item.Id == context.Target.Property.DefinitionId);
        Assert.Equal(definition.ResourceTags, context.Target.Property.ResourceTags);
        Assert.Equal(definition.ProtectionTags, context.Target.Property.ProtectionTags);
        var audit = Assert.Single(
            context.Room.GmAuditLog,
            entry => entry.ActionType == "player_property_update" &&
                     entry.Result == GmAuditResult.Success);
        Assert.False(string.IsNullOrWhiteSpace(audit.RelatedSnapshotId));
        Assert.Contains("property-edit-command", context.Room.ProcessedGmPlayerCommandIds);
        Assert.Contains(context.Clients.Calls, call =>
            call.Method == "PlayerStateResynced");
        Assert.Contains(context.Clients.Calls, call =>
            call.Method == "CharacteristicUpdated");
        Assert.Contains(context.Recovery.Snapshots, entry =>
            entry.RoomCode == context.Room.Id &&
            entry.Reason == "public_players");

        values["capacityLiters"] = 700;
        await context.Hub.UpdatePlayerProperty(
            context.Target.StablePlayerId,
            "medical_industrial_medical_refrigerator",
            values,
            "property-edit-command");
        Assert.Equal(620, context.Target.Property.GeneratedValues["capacityLiters"]);
        Assert.Single(
            context.Room.GmAuditLog,
            entry => entry.ActionType == "player_property_update" &&
                     entry.Result == GmAuditResult.Success);

        var serialized = JsonSerializer.Serialize(context.Target.Property);
        var recovered = JsonSerializer.Deserialize<GeneratedProperty>(serialized);
        Assert.Equal(
            context.Target.Property.GeneratedValues,
            Assert.IsType<GeneratedProperty>(recovered).GeneratedValues);

        var restore = context.Snapshots.RestoreSnapshot(
            context.Room,
            audit.RelatedSnapshotId!,
            context.Owner.StablePlayerId,
            "restore-property-edit");
        Assert.True(restore.Success);
        var restoredTarget = context.Room.Players.Values.First(player =>
            player.StablePlayerId == context.Target.StablePlayerId);
        Assert.Equal("target-property", restoredTarget.Property!.DefinitionId);
        Assert.Equal(3, restoredTarget.Property.GeneratedValues["conditionLevel"]);
        Assert.True(restoredTarget.Revealed.Property);
    }

    [Fact]
    public async Task PropertyEditorRejectsNonHostOmniscientUnknownAndInvalidValues()
    {
        var context = CreateContext();
        context.Hub.Context = new TestHubCallerContext(context.Target.ConnectionId);

        var nonHost = await Assert.ThrowsAsync<HubException>(() =>
            context.Hub.UpdatePlayerProperty(
                context.Target.StablePlayerId,
                "medical_industrial_medical_refrigerator",
                new Dictionary<string, int>
                {
                    ["capacityLiters"] = 620,
                    ["conditionLevel"] = 5
                },
                "non-host-property-edit"));
        Assert.Contains("gm_panel_access_denied", nonHost.Message);

        context.Hub.Context = new TestHubCallerContext(context.Owner.ConnectionId);
        context.Owner.GmRole = GmMode.OmniscientGm;
        var omniscient = await Assert.ThrowsAsync<HubException>(() =>
            context.Hub.UpdatePlayerProperty(
                context.Target.StablePlayerId,
                "medical_industrial_medical_refrigerator",
                new Dictionary<string, int>
                {
                    ["capacityLiters"] = 620,
                    ["conditionLevel"] = 5
                },
                "omniscient-property-edit"));
        Assert.Contains("gm_panel_access_denied", omniscient.Message);
        context.Owner.GmRole = GmMode.PlayerHost;

        var unknown = await Assert.ThrowsAsync<HubException>(() =>
            context.Hub.UpdatePlayerProperty(
                context.Target.StablePlayerId,
                "missing-property-definition",
                new Dictionary<string, int>(),
                "unknown-property-edit"));
        Assert.Contains("property_definition_not_found", unknown.Message);

        var invalidSets = new[]
        {
            new Dictionary<string, int>
            {
                ["capacityLiters"] = 620
            },
            new Dictionary<string, int>
            {
                ["capacityLiters"] = 620,
                ["conditionLevel"] = 5,
                ["clientControlledTag"] = 1
            },
            new Dictionary<string, int>
            {
                ["capacityLiters"] = 2001,
                ["conditionLevel"] = 5
            },
            new Dictionary<string, int>
            {
                ["capacityLiters"] = 620,
                ["conditionLevel"] = 1
            }
        };
        for (var index = 0; index < invalidSets.Length; index++)
        {
            var invalid = await Assert.ThrowsAsync<HubException>(() =>
                context.Hub.UpdatePlayerProperty(
                    context.Target.StablePlayerId,
                    "medical_industrial_medical_refrigerator",
                    invalidSets[index],
                    $"invalid-property-edit-{index}"));
            Assert.Contains("property_values_invalid", invalid.Message);
        }
    }

    [Fact]
    public async Task PropertySwapMovesWholeRuntimeValueButKeepsRevealFlagsOnPlayerSlots()
    {
        var context = CreateContext();
        context.Owner.Property = Property("owner-property", 11);
        context.Target.Property = Property("target-property", 22);
        context.Owner.Revealed.Property = true;
        context.Target.Revealed.Property = false;

        var result = await InvokeEffect(
            context.Hub,
            context.Room,
            context.Owner,
            Card("property_swap", requiresTarget: true),
            context.Target);

        Assert.True(ResultSuccess(result));
        Assert.Equal("target-property", context.Owner.Property!.DefinitionId);
        Assert.Equal(22, context.Owner.Property.GeneratedValues["conditionLevel"]);
        Assert.Equal("owner-property", context.Target.Property!.DefinitionId);
        Assert.Equal(11, context.Target.Property.GeneratedValues["conditionLevel"]);
        Assert.True(context.Owner.Revealed.Property);
        Assert.False(context.Target.Revealed.Property);
        Assert.Empty(context.Room.CurrentRoundReveals);
    }

    [Fact]
    public async Task PropertyRerollAvoidsCurrentAndOtherActiveDefinitionsAndPreservesRevealState()
    {
        var context = CreateContext();
        context.Owner.Property = Property("property_001", 1);
        context.Target.Property = Property("property_002", 2);
        context.Owner.Revealed.Property = true;
        var before = context.Owner.Property.DefinitionId;

        var result = await InvokeEffect(
            context.Hub,
            context.Room,
            context.Owner,
            Card("property_reroll"),
            null);

        Assert.True(ResultSuccess(result));
        Assert.NotNull(context.Owner.Property);
        Assert.NotEqual(before, context.Owner.Property.DefinitionId);
        Assert.NotEqual(context.Target.Property.DefinitionId, context.Owner.Property.DefinitionId);
        var definition = Assert.Single(
            context.GameData.Properties,
            property => property.Id == context.Owner.Property.DefinitionId);
        var conditionField = Assert.Single(
            definition.RandomProperties,
            field => field.Key == "conditionLevel");
        Assert.InRange(
            context.Owner.Property.GeneratedValues["conditionLevel"],
            conditionField.Min,
            conditionField.Max);
        Assert.True(context.Owner.Revealed.Property);
        Assert.Empty(context.Room.CurrentRoundReveals);
    }

    [Fact]
    public async Task PropertyRevealValidatesMissingTargetDataAndDoesNotUseNormalRoundRevealCounter()
    {
        var context = CreateContext();
        var card = Card("property_reveal", requiresTarget: true);

        var missing = await InvokeEffect(
            context.Hub,
            context.Room,
            context.Owner,
            card,
            context.Target);
        Assert.False(ResultSuccess(missing));
        Assert.Equal("property_target_not_available", ResultError(missing));

        context.Target.Property = Property("target-property", 31);
        var revealed = await InvokeEffect(
            context.Hub,
            context.Room,
            context.Owner,
            card,
            context.Target);

        Assert.True(ResultSuccess(revealed));
        Assert.True(context.Target.Revealed.Property);
        Assert.Empty(context.Room.CurrentRoundReveals);
        Assert.Contains(context.Clients.Calls, call => call.Method == "CharacteristicRevealed");
    }

    [Fact]
    public async Task PropertyCardCommandIsAuditedAndDuplicateCommandDoesNotApplySwapTwice()
    {
        var context = CreateContext();
        context.Owner.Property = Property("owner-property", 1);
        context.Target.Property = Property("target-property", 2);
        var card = Card("property_swap", requiresTarget: true);
        context.Owner.SpecialCard = card;
        context.Owner.SpecialCards = [card];

        await context.Hub.UseSpecialCardById(
            card.Id,
            context.Target.ConnectionId,
            "public",
            null,
            "property-command");
        var ownerAfterFirst = context.Owner.Property!.DefinitionId;
        var targetAfterFirst = context.Target.Property!.DefinitionId;

        await context.Hub.UseSpecialCardById(
            card.Id,
            context.Target.ConnectionId,
            "public",
            null,
            "property-command");

        Assert.Equal("target-property", ownerAfterFirst);
        Assert.Equal("owner-property", targetAfterFirst);
        Assert.Equal(ownerAfterFirst, context.Owner.Property.DefinitionId);
        Assert.Equal(targetAfterFirst, context.Target.Property.DefinitionId);
        Assert.Single(context.Room.GmAuditLog, entry => entry.ActionType == "special_card_property_swap");
        Assert.Contains("property-command", context.Room.ProcessedSpecialCardCommandIds);
        Assert.Contains(
            context.Clients.Calls,
            call => call.Method == "SpecialCardStateUpdated" &&
                    call.Arguments.Any(argument =>
                        argument?.GetType().GetProperty("idempotent")?.GetValue(argument) as bool? == true));
    }

    [Fact]
    public async Task PublicEntryPointRejectsEliminatedPropertyTarget()
    {
        var context = CreateContext();
        context.Owner.Property = Property("owner-property", 1);
        context.Target.Property = Property("target-property", 2);
        context.Target.IsEliminated = true;
        var card = Card("property_swap", requiresTarget: true);
        context.Owner.SpecialCard = card;
        context.Owner.SpecialCards = [card];

        await context.Hub.UseSpecialCardById(
            card.Id,
            context.Target.ConnectionId,
            "public",
            null,
            "eliminated-target");

        Assert.False(card.IsUsed);
        Assert.DoesNotContain("eliminated-target", context.Room.ProcessedSpecialCardCommandIds);
        Assert.Contains(
            context.Clients.Calls,
            call => call.Method == "ReceiveError" &&
                    call.Arguments.Any(argument =>
                        string.Equals(
                            argument?.ToString(),
                            "Оберіть активного гравця для ефекту карти",
                            StringComparison.Ordinal)));
    }

    private static async Task<object> InvokeEffect(
        GameHub hub,
        Room room,
        Player owner,
        SpecialCard card,
        Player? target)
    {
        var method = typeof(GameHub).GetMethod(
            "ApplySpecialCardEffect",
            BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);
        var task = Assert.IsAssignableFrom<Task>(
            method!.Invoke(hub, [room, owner, card, target, "public", null]));
        await task;
        return task.GetType().GetProperty("Result")!.GetValue(task)!;
    }

    private static bool ResultSuccess(object result) =>
        Assert.IsType<bool>(result.GetType().GetProperty("Success")!.GetValue(result));

    private static string ResultError(object result) =>
        Assert.IsType<string>(result.GetType().GetProperty("Error")!.GetValue(result));

    private static GeneratedProperty Property(string id, int conditionLevel) =>
        new()
        {
            DefinitionId = id,
            GeneratedValues = new() { ["conditionLevel"] = conditionLevel },
            LocalizedDisplay = new() { ["uk"] = $"{id} — {conditionLevel}" },
            ResourceTags = ["transport"],
            ProtectionTags = ["shelter"]
        };

    private static SpecialCard Card(string effectType, bool requiresTarget = false) =>
        new()
        {
            Id = effectType,
            Name = effectType,
            Description = effectType,
            EffectType = effectType,
            Phase = "discussion",
            RequiresTarget = requiresTarget,
            IsOneTimeUse = true
        };

    private static PropertyCardContext CreateContext()
    {
        var root = FindRepositoryRoot();
        var environment = new TestEnvironment(root);
        var gameData = new GameDataService(environment, NullLogger<GameDataService>.Instance);
        var roomService = new RoomService(NullLogger<RoomService>.Instance);
        var audit = new GmAuditService(TimeProvider.System);
        var timer = new GameTimerService(TimeProvider.System);
        var integrity = new RoomIntegrityService(roomService, gameData, TimeProvider.System);
        var snapshots = new RoomSnapshotService(
            integrity,
            audit,
            TimeProvider.System);
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
            gmPanelStateBuilder: new GmPanelStateBuilder(TimeProvider.System))
        {
            Clients = clients,
            Context = new TestHubCallerContext("owner-connection")
        };

        var room = roomService.CreateRoom("Property cards", "owner-connection", "Owner");
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
        return new(hub, room, owner, target, clients, gameData, snapshots, recovery);
    }

    private static string FindRepositoryRoot()
    {
        var directory = new DirectoryInfo(AppContext.BaseDirectory);
        while (directory != null && !File.Exists(Path.Combine(directory.FullName, "Bunker.csproj")))
        {
            directory = directory.Parent;
        }

        return directory?.FullName ?? throw new DirectoryNotFoundException("Repository root not found");
    }

    private sealed record PropertyCardContext(
        GameHub Hub,
        Room Room,
        Player Owner,
        Player Target,
        RecordingHubCallerClients Clients,
        GameDataService GameData,
        RoomSnapshotService Snapshots,
        RecordingRoomRecoveryCoordinator Recovery);

    private sealed class RecordingRoomRecoveryCoordinator : IRoomRecoveryCoordinator
    {
        public List<(string RoomCode, string Reason)> Snapshots { get; } = [];
        public void QueueSnapshot(string roomCode, string reason) =>
            Snapshots.Add((roomCode, reason));
        public void QueueDelete(string roomCode)
        {
        }
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
