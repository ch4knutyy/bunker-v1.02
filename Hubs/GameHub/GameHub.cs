using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Bunker.Hubs
{
    public partial class GameHub : Hub
    {
        private readonly CharacterGeneratorService _generator;
        private readonly RoomService _roomService;
        private readonly CardService _cardService;
        private readonly GameDataService _gameData;
        private readonly ScenarioImageService _imageService;
        private readonly ILogger<GameHub> _logger;
        private readonly Random _random = new();

        public GameHub(CharacterGeneratorService generator, RoomService roomService, CardService cardService, GameDataService gameData, ScenarioImageService imageService, ILogger<GameHub> logger)
        {
            _generator = generator;
            _roomService = roomService;
            _cardService = cardService;
            _gameData = gameData;
            _imageService = imageService;
            _logger = logger;
        }
    }
}


