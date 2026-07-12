using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;

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
        private readonly ILogger<GameHub> _logger;
        private readonly Random _random = new();

        public GameHub(CharacterGeneratorService generator, RoomService roomService, GameDataService gameData, ScenarioImageService imageService, ThreatScalingService threatScaling, ThreatMiniGameRegistry threatMiniGames, GameTimerService gameTimerService, ThreatAuditService threatAudit, ILogger<GameHub> logger, RoomIntegrityService? roomIntegrity = null, GmAuditService? gmAudit = null, RoomSnapshotService? roomSnapshots = null, RoomLocalEditorService? roomLocalEditor = null)
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
            _logger = logger;
        }
    }
}


