using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.Extensions.FileProviders;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;
using Bunker.Services.Bunker.GameSessions;

namespace Bunker.Hubs
{
    public partial class GameHub : Hub
    {
        private readonly CharacterGeneratorService _generator;
        private readonly RoomService _roomService;
        private readonly PlayerDisconnectCleanupCoordinator _playerDisconnectCleanup;
        private readonly GameDataService _gameData;
        private readonly ScenarioImageService _imageService;
        private readonly ThreatScalingService _threatScaling;
        private readonly ThreatMiniGameRegistry _threatMiniGames;
        private readonly GameTimerService _gameTimerService;
        private readonly ThreatAuditService _threatAudit;
        private readonly RoomIntegrityService _roomIntegrity;
        private readonly GmAuditService _gmAudit;
        private readonly RoomSnapshotService _roomSnapshots;
        private readonly RoomLocalEditorService _roomLocalEditor;
        private readonly GlobalContentCatalogService _globalContentCatalog;
        private readonly GlobalContentAccessPolicy _globalContentAccess;
        private readonly GlobalContentDraftService _globalContentDrafts;
        private readonly GlobalContentCommitService _globalContentCommits;
        private readonly StableIdMigrationService _stableIdMigrations;
        private readonly OmniscientGmAccessPolicy _omniscientAccess;
        private readonly OmniscientGmRoleService _omniscientRoles;
        private readonly OmniscientHiddenStateService _omniscientHiddenState;
        private readonly OmniscientRequestRateLimitService _omniscientRequestRateLimits;
        private readonly DirectorControlService _directorControls;
        private readonly LobbyStartService _lobbyStart;
        private readonly RoomGameSettingsService _roomGameSettings;
        private readonly BunkerResourceService _bunkerResources;
        private readonly GmPanelStateBuilder _gmPanelStateBuilder;
        private readonly ScenarioSchedulerService _scenarioScheduler;
        private readonly ScenarioRunnerService _scenarioRunner;
        private readonly BunkerIntelService _bunkerIntel;
        private readonly EventSpecialCardService _eventSpecialCards;
        private readonly IScenarioContentRegistry _scenarioContent;
        private readonly IAuthorizationService? _authorizationService;
        private GmCapability? _activeDirectorCapability;
        private readonly ILogger<GameHub> _logger;
        private readonly Random _random = new();
		private readonly IGameSessionHistoryService? _gameSessionHistoryService;
		private readonly IRoomRecoveryCoordinator? _roomRecovery;

		public GameHub(CharacterGeneratorService generator, 
            RoomService roomService, GameDataService gameData, ScenarioImageService imageService,
            ThreatScalingService threatScaling, ThreatMiniGameRegistry threatMiniGames, 
            GameTimerService gameTimerService, ThreatAuditService threatAudit, ILogger<GameHub> logger, 
            PlayerDisconnectCleanupCoordinator playerDisconnectCleanup, RoomIntegrityService? roomIntegrity = null, 
            GmAuditService? gmAudit = null, RoomSnapshotService? roomSnapshots = null, RoomLocalEditorService? roomLocalEditor = null, 
            GlobalContentCatalogService? globalContentCatalog = null, GlobalContentAccessPolicy? globalContentAccess = null, 
            GlobalContentDraftService? globalContentDrafts = null, GlobalContentCommitService? globalContentCommits = null, 
            StableIdMigrationService? stableIdMigrations = null, OmniscientGmAccessPolicy? omniscientAccess = null, 
            OmniscientGmRoleService? omniscientRoles = null, OmniscientHiddenStateService? omniscientHiddenState = null, 
            DirectorControlService? directorControls = null, LobbyStartService? lobbyStart = null, 
            RoomGameSettingsService? roomGameSettings = null, OmniscientRequestRateLimitService? omniscientRequestRateLimits = null, 
            IGameSessionHistoryService? gameSessionHistoryService = null,
            IRoomRecoveryCoordinator? roomRecovery = null,
            GmPanelStateBuilder? gmPanelStateBuilder = null,
            IAuthorizationService? authorizationService = null,
            BunkerResourceService? bunkerResources = null,
            ScenarioSchedulerService? scenarioScheduler = null,
            ScenarioRunnerService? scenarioRunner = null,
            BunkerIntelService? bunkerIntel = null,
            EventSpecialCardService? eventSpecialCards = null,
            IScenarioContentRegistry? scenarioContent = null)
        {
            _generator = generator;
            _roomService = roomService;
            _playerDisconnectCleanup = playerDisconnectCleanup;
            _gameData = gameData;
            _imageService = imageService;
            _threatScaling = threatScaling;
            _threatMiniGames = threatMiniGames;
            _gameTimerService = gameTimerService;
            _threatAudit = threatAudit;
            _roomIntegrity = roomIntegrity ?? new RoomIntegrityService(roomService, gameData, TimeProvider.System);
            _gmAudit = gmAudit ?? new GmAuditService(TimeProvider.System);
            _roomSnapshots = roomSnapshots ?? new RoomSnapshotService(_roomIntegrity, _gmAudit, TimeProvider.System);
            _roomLocalEditor = roomLocalEditor ?? new RoomLocalEditorService(TimeProvider.System);
            _globalContentCatalog = globalContentCatalog ?? new GlobalContentCatalogService(Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "data"));
            _globalContentAccess = globalContentAccess ?? new GlobalContentAccessPolicy(
                new FallbackDevelopmentEnvironment(),
                Microsoft.Extensions.Options.Options.Create(new GlobalContentCatalogOptions()));
            _globalContentDrafts = globalContentDrafts ?? new GlobalContentDraftService(_globalContentCatalog, TimeProvider.System);
            _globalContentCommits = globalContentCommits ?? new GlobalContentCommitService(_globalContentCatalog, _globalContentDrafts, Path.Combine(Directory.GetCurrentDirectory(), ".global-content-backups"));
            _stableIdMigrations = stableIdMigrations ?? new StableIdMigrationService(_globalContentCatalog, _globalContentCommits, _globalContentDrafts, TimeProvider.System);
            _omniscientAccess = omniscientAccess ?? new OmniscientGmAccessPolicy(new FallbackDevelopmentEnvironment(), Microsoft.Extensions.Options.Options.Create(new OmniscientGmOptions()));
            _omniscientRoles = omniscientRoles ?? new OmniscientGmRoleService(roomService);
            _omniscientHiddenState = omniscientHiddenState ?? new OmniscientHiddenStateService(TimeProvider.System, gameTimerService, roomService);
            _omniscientRequestRateLimits = omniscientRequestRateLimits ?? new OmniscientRequestRateLimitService(TimeProvider.System);
            _directorControls = directorControls ?? new DirectorControlService(TimeProvider.System);
            _roomGameSettings = roomGameSettings ?? new RoomGameSettingsService(_gmAudit);
            _bunkerResources = bunkerResources ?? new BunkerResourceService();
            _lobbyStart = lobbyStart ?? new LobbyStartService(TimeProvider.System, _roomGameSettings, _gmAudit);
			_gameSessionHistoryService = gameSessionHistoryService;
			_roomRecovery = roomRecovery;
			_gmPanelStateBuilder = gmPanelStateBuilder ?? new GmPanelStateBuilder(TimeProvider.System);
			_authorizationService = authorizationService;
            _bunkerIntel = bunkerIntel ?? new BunkerIntelService();
            if (scenarioScheduler == null || scenarioRunner == null || eventSpecialCards == null || scenarioContent == null)
            {
                var fallbackContent = scenarioContent ?? new ScenarioContentRegistry(
                    ResolveDefaultScenarioContentDirectory());
                _scenarioContent = fallbackContent;
                _scenarioScheduler = scenarioScheduler ?? new ScenarioSchedulerService(fallbackContent, TimeProvider.System);
                _eventSpecialCards = eventSpecialCards ?? new EventSpecialCardService(
                    fallbackContent, _bunkerResources, _bunkerIntel, generator, TimeProvider.System);
                _scenarioRunner = scenarioRunner ?? new ScenarioRunnerService(
                    _scenarioScheduler, _eventSpecialCards, _bunkerIntel, TimeProvider.System);
            }
            else
            {
                _scenarioContent = scenarioContent;
                _scenarioScheduler = scenarioScheduler;
                _scenarioRunner = scenarioRunner;
                _eventSpecialCards = eventSpecialCards;
            }
			_logger = logger;
        }

        private static string ResolveDefaultScenarioContentDirectory()
        {
            var workingDirectoryCandidate = Path.Combine(
                Directory.GetCurrentDirectory(),
                "wwwroot",
                "data",
                "scenario");
            if (Directory.Exists(workingDirectoryCandidate))
                return workingDirectoryCandidate;

            for (var directory = new DirectoryInfo(AppContext.BaseDirectory);
                 directory != null;
                 directory = directory.Parent)
            {
                var candidate = Path.Combine(directory.FullName, "wwwroot", "data", "scenario");
                if (Directory.Exists(candidate))
                    return candidate;
            }

            return workingDirectoryCandidate;
        }

		private void QueueRoomRecovery(Room room, string reason) =>
			_roomRecovery?.QueueSnapshot(room.Id, reason);

        private sealed class FallbackDevelopmentEnvironment : IHostEnvironment
        {
            public string EnvironmentName { get; set; } = Environments.Production;
            public string ApplicationName { get; set; } = "Bunker";
            public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
            public IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
        }
    }
}


