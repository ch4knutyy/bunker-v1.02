using Microsoft.AspNetCore.Mvc;
using Bunker.Services;
using Bunker.Hubs;
using Bunker.Models;
using Microsoft.AspNetCore.SignalR;

namespace Bunker.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class ScenarioImageController : ControllerBase
    {
        private readonly ScenarioImageService _imageService;
        private readonly RoomService _roomService;
        private readonly IHubContext<GameHub> _hubContext;
        private readonly ILogger<ScenarioImageController> _logger;

        public ScenarioImageController(
            ScenarioImageService imageService, 
            RoomService roomService,
            IHubContext<GameHub> hubContext,
            ILogger<ScenarioImageController> logger)
        {
            _imageService = imageService;
            _roomService = roomService;
            _hubContext = hubContext;
            _logger = logger;
        }

        /// <summary>
        /// Завантажити зображення апокаліпсису
        /// </summary>
        [HttpPost("apocalypse")]
        public async Task<IActionResult> UploadApocalypseImage(
            [FromForm] IFormFile file,
            [FromForm] string roomId,
            [FromForm] string connectionId,
            [FromForm] string? hostToken,
            [FromForm] string apocalypseId)
        {
            // Валідація входу
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Файл не вибрано" });
                
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(connectionId) || string.IsNullOrEmpty(apocalypseId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            // Перевірка прав хоста
            var hostRoomResult = GetHostRoom(roomId, hostToken);
            if (hostRoomResult.Failure is { } failure)
                return CreateHostRoomError(failure, "Тільки хост може завантажувати зображення");

            var room = hostRoomResult.Room!;

            // Зберігаємо файл
            using var stream = file.OpenReadStream();
            var (success, error, imageUrl) = await _imageService.SaveApocalypseImage(
                apocalypseId, stream, file.FileName);

            if (!success)
                return BadRequest(new { error });

            // Оновлюємо апокаліпсис в кімнаті
            if (room.Apocalypse != null && room.Apocalypse.Id == apocalypseId)
            {
                room.Apocalypse.ImageUrl = imageUrl;
            }

            // Надсилаємо оновлення всім гравцям в кімнаті
            await _hubContext.Clients.Group(roomId).SendAsync("ApocalypseImageUpdated", new
            {
                apocalypseId = apocalypseId,
                imageUrl = imageUrl
            });

            _logger.LogInformation($"Зображення апокаліпсису {apocalypseId} завантажено для кімнати {roomId}");

            return Ok(new { imageUrl });
        }

        /// <summary>
        /// Завантажити зображення бункера
        /// </summary>
        [HttpPost("bunker")]
        public async Task<IActionResult> UploadBunkerImage(
            [FromForm] IFormFile file,
            [FromForm] string roomId,
            [FromForm] string connectionId,
            [FromForm] string? hostToken,
            [FromForm] string bunkerId)
        {
            // Валідація входу
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Файл не вибрано" });
                
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(connectionId) || string.IsNullOrEmpty(bunkerId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            // Перевірка прав хоста
            var hostRoomResult = GetHostRoom(roomId, hostToken);
            if (hostRoomResult.Failure is { } failure)
                return CreateHostRoomError(failure, "Тільки хост може завантажувати зображення");

            var room = hostRoomResult.Room!;

            // Зберігаємо файл
            using var stream = file.OpenReadStream();
            var (success, error, imageUrl) = await _imageService.SaveBunkerImage(
                bunkerId, stream, file.FileName);

            if (!success)
                return BadRequest(new { error });

            // Оновлюємо бункер в кімнаті
            if (room.Bunker != null && room.Bunker.Id == bunkerId)
            {
                room.Bunker.ImageUrl = imageUrl;
            }

            // Надсилаємо оновлення всім гравцям в кімнаті
            await _hubContext.Clients.Group(roomId).SendAsync("BunkerImageUpdated", new
            {
                bunkerId = bunkerId,
                imageUrl = imageUrl
            });

            _logger.LogInformation($"Зображення бункера {bunkerId} завантажено для кімнати {roomId}");

            return Ok(new { imageUrl });
        }

        /// <summary>
        /// Завантажити зображення розкритої загрози для поточної кімнати
        /// </summary>
        [HttpPost("threat")]
        public async Task<IActionResult> UploadThreatImage(
            [FromForm] IFormFile file,
            [FromForm] string roomId,
            [FromForm] string connectionId,
            [FromForm] string? hostToken,
            [FromForm] string threatId)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Файл не вибрано" });

            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(connectionId) || string.IsNullOrEmpty(threatId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            var hostRoomResult = GetHostRoom(roomId, hostToken);
            if (hostRoomResult.Failure is { } failure)
                return CreateHostRoomError(failure, "Тільки хост може завантажувати зображення");

            var room = hostRoomResult.Room!;

            if (!room.IsThreatRevealed || room.CurrentThreat == null || room.CurrentThreat.Id != threatId)
                return BadRequest(new { error = "Загрозу ще не розкрито" });

            using var stream = file.OpenReadStream();
            var threatImageKey = BuildThreatImageKey(roomId, threatId);
            var (success, error, imageUrl) = await _imageService.SaveThreatImage(
                threatImageKey, stream, file.FileName);

            if (!success)
                return BadRequest(new { error });

            room.CurrentThreat.ImageUrl = imageUrl;
            room.CurrentThreat.UploadedImagePath = imageUrl;

            await _hubContext.Clients.Group(roomId).SendAsync("ThreatImageUpdated", new
            {
                threatId,
                imageUrl
            });

            _logger.LogInformation($"Зображення загрози {threatId} завантажено для кімнати {roomId}");

            return Ok(new { imageUrl });
        }

        /// <summary>
        /// Видалити зображення апокаліпсису
        /// </summary>
        [HttpDelete("apocalypse")]
        public async Task<IActionResult> RemoveApocalypseImage(
            [FromQuery] string roomId,
            [FromQuery] string connectionId,
            [FromQuery] string? hostToken,
            [FromQuery] string apocalypseId)
        {
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(connectionId) || string.IsNullOrEmpty(apocalypseId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            // Перевірка прав хоста
            var hostRoomResult = GetHostRoom(roomId, hostToken);
            if (hostRoomResult.Failure is { } failure)
                return CreateHostRoomError(failure, "Тільки хост може видаляти зображення");

            var room = hostRoomResult.Room!;

            // Видаляємо файл
            _imageService.RemoveApocalypseImage(apocalypseId);

            // Оновлюємо апокаліпсис в кімнаті
            if (room.Apocalypse != null && room.Apocalypse.Id == apocalypseId)
            {
                room.Apocalypse.ImageUrl = null;
            }

            // Надсилаємо оновлення всім гравцям в кімнаті
            await _hubContext.Clients.Group(roomId).SendAsync("ApocalypseImageRemoved", new
            {
                apocalypseId = apocalypseId
            });

            _logger.LogInformation($"Зображення апокаліпсису {apocalypseId} видалено для кімнати {roomId}");

            return Ok(new { success = true });
        }

        /// <summary>
        /// Видалити зображення бункера
        /// </summary>
        [HttpDelete("bunker")]
        public async Task<IActionResult> RemoveBunkerImage(
            [FromQuery] string roomId,
            [FromQuery] string connectionId,
            [FromQuery] string? hostToken,
            [FromQuery] string bunkerId)
        {
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(connectionId) || string.IsNullOrEmpty(bunkerId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            // Перевірка прав хоста
            var hostRoomResult = GetHostRoom(roomId, hostToken);
            if (hostRoomResult.Failure is { } failure)
                return CreateHostRoomError(failure, "Тільки хост може видаляти зображення");

            var room = hostRoomResult.Room!;

            // Видаляємо файл
            _imageService.RemoveBunkerImage(bunkerId);

            // Оновлюємо бункер в кімнаті
            if (room.Bunker != null && room.Bunker.Id == bunkerId)
            {
                room.Bunker.ImageUrl = null;
            }

            // Надсилаємо оновлення всім гравцям в кімнаті
            await _hubContext.Clients.Group(roomId).SendAsync("BunkerImageRemoved", new
            {
                bunkerId = bunkerId
            });

            _logger.LogInformation($"Зображення бункера {bunkerId} видалено для кімнати {roomId}");

            return Ok(new { success = true });
        }

        /// <summary>
        /// Видалити зображення розкритої загрози для поточної кімнати
        /// </summary>
        [HttpDelete("threat")]
        public async Task<IActionResult> RemoveThreatImage(
            [FromQuery] string roomId,
            [FromQuery] string connectionId,
            [FromQuery] string? hostToken,
            [FromQuery] string threatId)
        {
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(connectionId) || string.IsNullOrEmpty(threatId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            var hostRoomResult = GetHostRoom(roomId, hostToken);
            if (hostRoomResult.Failure is { } failure)
                return CreateHostRoomError(failure, "Тільки хост може видаляти зображення");

            var room = hostRoomResult.Room!;

            if (!room.IsThreatRevealed || room.CurrentThreat == null || room.CurrentThreat.Id != threatId)
                return BadRequest(new { error = "Загрозу ще не розкрито" });

            _imageService.RemoveThreatImage(BuildThreatImageKey(roomId, threatId));
            room.CurrentThreat.ImageUrl = null;
            room.CurrentThreat.UploadedImagePath = null;

            await _hubContext.Clients.Group(roomId).SendAsync("ThreatImageRemoved", new
            {
                threatId
            });

            _logger.LogInformation($"Зображення загрози {threatId} видалено для кімнати {roomId}");

            return Ok(new { success = true });
        }

        /// <summary>
        /// Отримати промпт для генерації зображення апокаліпсису
        /// </summary>
        [HttpGet("apocalypse/prompt")]
        public IActionResult GetApocalypsePrompt([FromQuery] string roomId)
        {
            var room = _roomService.GetRoom(roomId);
            if (room?.Apocalypse == null)
                return NotFound(new { error = "Апокаліпсис не знайдено" });

            return Ok(new { prompt = room.Apocalypse.GenerateImagePrompt() });
        }

        /// <summary>
        /// Отримати промпт для генерації зображення бункера
        /// </summary>
        [HttpGet("bunker/prompt")]
        public IActionResult GetBunkerPrompt([FromQuery] string roomId)
        {
            var room = _roomService.GetRoom(roomId);
            if (room?.Bunker == null)
                return NotFound(new { error = "Бункер не знайдено" });

            return Ok(new { prompt = room.Bunker.GenerateImagePrompt() });
        }

        /// <summary>
        /// Отримати промпт для генерації зображення розкритої загрози
        /// </summary>
        [HttpGet("threat/prompt")]
        public IActionResult GetThreatPrompt([FromQuery] string roomId)
        {
            var room = _roomService.GetRoom(roomId);
            if (room?.CurrentThreat == null || !room.IsThreatRevealed)
                return NotFound(new { error = "Загрозу ще не розкрито" });

            return Ok(new
            {
                prompt = room.CurrentThreat.GenerateImagePrompt(room.Apocalypse, room.Bunker)
            });
        }

        private static string BuildThreatImageKey(string roomId, string threatId)
        {
            return $"{roomId}_{threatId}";
        }

        private HostRoomResult GetHostRoom(string roomId, string? hostToken)
        {
            var room = _roomService.GetRoom(roomId);
            if (room == null)
                return new HostRoomResult(null, HostRoomFailure.RoomNotFound);

            if (!IsValidHostRequest(room, hostToken))
                return new HostRoomResult(null, HostRoomFailure.InvalidHostToken);

            return new HostRoomResult(room, null);
        }

        private IActionResult CreateHostRoomError(HostRoomFailure failure, string invalidHostTokenMessage)
        {
            return failure switch
            {
                HostRoomFailure.RoomNotFound => NotFound(new { error = "Кімнату не знайдено" }),
                HostRoomFailure.InvalidHostToken => StatusCode(
                    StatusCodes.Status403Forbidden,
                    new { error = invalidHostTokenMessage }),
                _ => throw new ArgumentOutOfRangeException(nameof(failure), failure, null)
            };
        }

        private static bool IsValidHostRequest(Room room, string? hostToken)
        {
            return !string.IsNullOrWhiteSpace(hostToken) &&
                !string.IsNullOrWhiteSpace(room.HostToken) &&
                string.Equals(room.HostToken, hostToken, StringComparison.Ordinal);
        }

        private sealed record HostRoomResult(Room? Room, HostRoomFailure? Failure);

        private enum HostRoomFailure
        {
            RoomNotFound,
            InvalidHostToken
        }
    }
}

