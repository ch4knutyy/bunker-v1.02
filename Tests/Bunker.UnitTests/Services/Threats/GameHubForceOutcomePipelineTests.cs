using System.Reflection;
using Bunker.Hubs;
using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.Hosting;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;

namespace Bunker.UnitTests.Services.Threats;

public class GameHubForceOutcomePipelineTests
{
    [Fact]
    public void NormalMiniGameFailureUsesCanonicalFinalizerAndPreservesExistingHealthState()
    {
        var (hub, room, player, miniGame) = CreateRadiationHubAndRoom();
        player.PhysicalHealth.Name = "Синдром Дауна";
        player.AdditionalConditionEffects.Add(new PlayerConditionEffect
        {
            Id = "existing", ConditionId = "physical_301", Name = "Опік (середня форма)", SeverityCode = "medium"
        });
        var publicState = miniGame.Start(room, room.ThreatState!, "p1", "uk");
        Assert.NotNull(publicState.CurrentQuestion);
        var answer = miniGame.SubmitAnswer(room, room.ThreatState!, "p1", publicState.CurrentQuestion!.QuestionId, "definitely_wrong", "uk");
        Assert.Equal("completed", answer.PublicState!.Status);
        Assert.Equal("failed", answer.PublicState.ResultStatus);
        Assert.False(room.ThreatState!.Resolution.EffectsApplied);

        Assert.True(InvokeNormalFinalize(hub, room));

        Assert.Equal("Синдром Дауна", player.PhysicalHealth.Name);
        Assert.Contains(player.AdditionalConditionEffects, effect => effect.ConditionId == "physical_301");
        var radiation = Assert.Single(player.AdditionalConditionEffects, effect => effect.ConditionId == "physical_152");
        Assert.Equal("hard", radiation.SeverityCode);
        Assert.True(room.ThreatState.Resolution.EffectsApplied);
        Assert.Equal(1, room.ThreatAuditLog.Count(entry => entry.EventType == ThreatAuditEventType.CompletedFailure));
        Assert.Equal(1, room.ThreatAuditLog.Count(entry => entry.EventType == ThreatAuditEventType.EffectsApplied));

        Assert.True(InvokeNormalFinalize(hub, room));
        Assert.Single(player.AdditionalConditionEffects, effect => effect.ConditionId == "physical_152");
        Assert.Equal(1, room.ThreatAuditLog.Count(entry => entry.EventType == ThreatAuditEventType.CompletedFailure));
    }

    [Fact]
    public void RadiationForceFailureUsesCanonicalEffectPipelineExactlyOnce()
    {
        var (hub, room, player, _) = CreateRadiationHubAndRoom();
        var timer = room.GameTimer.RemainingSecondsWhenPaused;

        Assert.True(InvokeForce(hub, room, "failure", "force-failure"));

        var condition = Assert.Single(player.AdditionalConditionEffects);
        Assert.Equal("physical_152", condition.ConditionId);
        Assert.Equal("hard", condition.SeverityCode);
        Assert.Equal("failed", room.ThreatState!.ThreatStatus);
        Assert.True(room.ThreatState.Resolution.EffectsApplied);
        Assert.Equal(timer, room.GameTimer.RemainingSecondsWhenPaused);
        Assert.Equal(
            [ThreatAuditEventType.ForcedFailure, ThreatAuditEventType.CompletedFailure, ThreatAuditEventType.EffectsApplied],
            room.ThreatAuditLog.Select(entry => entry.EventType));

        Assert.False(InvokeForce(hub, room, "failure", "force-failure-2"));
        Assert.Single(player.AdditionalConditionEffects);
        Assert.Equal(3, room.ThreatAuditLog.Count);
    }

    [Fact]
    public void RadiationForceSuccessUsesCanonicalSuccessFinalizationWithoutFailureEffect()
    {
        var (hub, room, player, _) = CreateRadiationHubAndRoom();

        Assert.True(InvokeForce(hub, room, "success", "force-success"));

        Assert.Empty(player.AdditionalConditionEffects);
        Assert.Equal("resolved_safely", room.ThreatState!.ThreatStatus);
        Assert.True(room.ThreatState.Resolution.WasSuccessful);
        Assert.True(room.ThreatState.Resolution.EffectsApplied);
        Assert.Equal(
            [ThreatAuditEventType.ForcedSuccess, ThreatAuditEventType.CompletedSuccess, ThreatAuditEventType.EffectsApplied],
            room.ThreatAuditLog.Select(entry => entry.EventType));
    }

    private static bool InvokeForce(GameHub hub, Room room, string outcome, string commandId)
    {
        var method = typeof(GameHub).GetMethod("ForceFinalizeThreatLocked", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);
        var args = new object?[] { room, outcome, "gm-1", commandId, null };
        return Assert.IsType<bool>(method.Invoke(hub, args));
    }

    private static bool InvokeNormalFinalize(GameHub hub, Room room)
    {
        var method = typeof(GameHub).GetMethod("FinalizeRadiationOperationLocked", BindingFlags.Instance | BindingFlags.NonPublic);
        Assert.NotNull(method);
        return Assert.IsType<bool>(method.Invoke(hub, [room, room.ThreatState!]));
    }

    private static (GameHub Hub, Room Room, Player Player, RadiationLeakMiniGameService MiniGame) CreateRadiationHubAndRoom()
    {
        var root = FindContentRoot();
        var environment = new TestEnvironment(root);
        var gameData = new GameDataService(environment, NullLogger<GameDataService>.Instance);
        var roomService = new RoomService(NullLogger<RoomService>.Instance);
        var miniGame = new RadiationLeakMiniGameService(environment);
        var hub = new GameHub(
            new CharacterGeneratorService(gameData, NullLogger<CharacterGeneratorService>.Instance),
            roomService,
            gameData,
            new ScenarioImageService(environment, NullLogger<ScenarioImageService>.Instance),
            new ThreatScalingService(),
            new ThreatMiniGameRegistry([miniGame]),
            new GameTimerService(TimeProvider.System),
            new ThreatAuditService(TimeProvider.System),
            NullLogger<GameHub>.Instance);

        var player = new Player { Name = "Participant", StablePlayerId = "p1", ConnectionId = "c1", IsConnected = true };
        var room = new Room
        {
            Id = "ROOM",
            CurrentRound = 3,
            IsThreatRevealed = true,
            ThreatRevealedAtRound = 3,
            CurrentThreat = new ThreatData { Id = "radiation_leak", Name = "Radiation leak" },
            ThreatState = new ThreatInteractionState
            {
                CurrentThreatId = "radiation_leak",
                ThreatStatus = "mini_game_active",
                ThreatRevealedRound = 3,
                ParticipantPlayerIds = ["p1"],
                VolunteerSelection = new ThreatVolunteerSelectionState { SelectedPlayerId = "p1" },
                OperationScaling = new ThreatOperationScalingState
                {
                    IsCalculated = true, BaseTaskCount = 1, PlayableTaskCount = 1, RequiredTasksForSuccess = 1,
                    AllowedErrors = 0, TaskTimeSeconds = 60, HintTokens = 0
                },
                MiniGame = new ThreatMiniGameState { ThreatId = "radiation_leak", Status = "not_started" }
            },
            GameTimer = new GameTimerState { RemainingSecondsWhenPaused = 41 }
        };
        room.Players["c1"] = player;
        return (hub, room, player, miniGame);
    }

    private static string FindContentRoot()
    {
        var current = new DirectoryInfo(AppContext.BaseDirectory);
        while (current != null && !Directory.Exists(Path.Combine(current.FullName, "wwwroot", "data")))
            current = current.Parent;
        return current?.FullName ?? throw new DirectoryNotFoundException("Bunker content root not found");
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
