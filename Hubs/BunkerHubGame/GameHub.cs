using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;
using Microsoft.Extensions.FileProviders;

namespace Bunker.Hubs
{
    public partial class GameHub : Hub
    {
        private readonly CharacterGeneratorService _generator;
        private readonly RoomService _roomService;
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
        private readonly DirectorControlService _directorControls;
        private readonly LobbyStartService _lobbyStart;
        private GmCapability? _activeDirectorCapability;
        private readonly ILogger<GameHub> _logger;
        private readonly Random _random = new();

        public GameHub(CharacterGeneratorService generator, RoomService roomService, GameDataService gameData, ScenarioImageService imageService, ThreatScalingService threatScaling, ThreatMiniGameRegistry threatMiniGames, GameTimerService gameTimerService, ThreatAuditService threatAudit, ILogger<GameHub> logger, RoomIntegrityService? roomIntegrity = null, GmAuditService? gmAudit = null, RoomSnapshotService? roomSnapshots = null, RoomLocalEditorService? roomLocalEditor = null, GlobalContentCatalogService? globalContentCatalog = null, GlobalContentAccessPolicy? globalContentAccess = null, GlobalContentDraftService? globalContentDrafts = null, GlobalContentCommitService? globalContentCommits = null, StableIdMigrationService? stableIdMigrations = null, OmniscientGmAccessPolicy? omniscientAccess = null, OmniscientGmRoleService? omniscientRoles = null, OmniscientHiddenStateService? omniscientHiddenState = null, DirectorControlService? directorControls = null, LobbyStartService? lobbyStart = null)
        {
            _generator = generator;
            _roomService = roomService;
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
            _directorControls = directorControls ?? new DirectorControlService(TimeProvider.System);
            _lobbyStart = lobbyStart ?? new LobbyStartService(TimeProvider.System);
            _logger = logger;
        }

        private sealed class FallbackDevelopmentEnvironment : IHostEnvironment
        {
            public string EnvironmentName { get; set; } = Environments.Production;
            public string ApplicationName { get; set; } = "Bunker";
            public string ContentRootPath { get; set; } = Directory.GetCurrentDirectory();
            public IFileProvider ContentRootFileProvider { get; set; } = new Microsoft.Extensions.FileProviders.NullFileProvider();
        }
    }
}


