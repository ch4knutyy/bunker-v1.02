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
        private readonly DeveloperAuthorityService _developerAuthority;

        public ScenarioImageController(
            ScenarioImageService imageService, 
            RoomService roomService,
            IHubContext<GameHub> hubContext,
            ILogger<ScenarioImageController> logger,
            DeveloperAuthorityService developerAuthority)
        {
            _imageService = imageService;
            _roomService = roomService;
            _hubContext = hubContext;
            _logger = logger;
            _developerAuthority = developerAuthority;
        }

        /// <summary>
        /// Завантажити зображення апокаліпсису
        /// </summary>
        [HttpPost("apocalypse")]
        public async Task<IActionResult> UploadApocalypseImage(
            [FromForm] IFormFile file,
            [FromForm] string roomId,
            [FromForm] string apocalypseId)
        {
            // Валідація входу
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Файл не вибрано" });
                
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(apocalypseId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            // Серверна перевірка Developer authority
            var hostRoomResult = GetDeveloperRoom(roomId);
            if (hostRoomResult.Failure is { } failure)
                return CreateDeveloperRoomError(failure);

            var room = hostRoomResult.Room!;
            if (room.Apocalypse == null || !string.Equals(room.Apocalypse.Id, apocalypseId, StringComparison.Ordinal))
                return BadRequest(new { error = "scenario_target_not_current" });

            // Зберігаємо файл
            using var stream = file.OpenReadStream();
            var (success, error, imageUrl) = await _imageService.SaveApocalypseImage(
                apocalypseId, stream, file.FileName);

            if (!success)
            {
                _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                    "scenario_image_upload", "failed", apocalypseId, failureCode: "image_save_failed");
                return BadRequest(new { error });
            }

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
            _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_upload", "success", apocalypseId);

            return Ok(new { imageUrl });
        }

        /// <summary>
        /// Завантажити зображення бункера
        /// </summary>
        [HttpPost("bunker")]
        public async Task<IActionResult> UploadBunkerImage(
            [FromForm] IFormFile file,
            [FromForm] string roomId,
            [FromForm] string bunkerId)
        {
            // Валідація входу
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Файл не вибрано" });
                
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(bunkerId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            // Серверна перевірка Developer authority
            var hostRoomResult = GetDeveloperRoom(roomId);
            if (hostRoomResult.Failure is { } failure)
                return CreateDeveloperRoomError(failure);

            var room = hostRoomResult.Room!;
            if (room.Bunker == null || !string.Equals(room.Bunker.Id, bunkerId, StringComparison.Ordinal))
                return BadRequest(new { error = "scenario_target_not_current" });

            // Зберігаємо файл
            using var stream = file.OpenReadStream();
            var (success, error, imageUrl) = await _imageService.SaveBunkerImage(
                bunkerId, stream, file.FileName);

            if (!success)
            {
                _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                    "scenario_image_upload", "failed", bunkerId, failureCode: "image_save_failed");
                return BadRequest(new { error });
            }

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
            _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_upload", "success", bunkerId);

            return Ok(new { imageUrl });
        }

        /// <summary>
        /// Завантажити зображення розкритої загрози для поточної кімнати
        /// </summary>
        [HttpPost("threat")]
        public async Task<IActionResult> UploadThreatImage(
            [FromForm] IFormFile file,
            [FromForm] string roomId,
            [FromForm] string threatId)
        {
            if (file == null || file.Length == 0)
                return BadRequest(new { error = "Файл не вибрано" });

            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(threatId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            var hostRoomResult = GetDeveloperRoom(roomId);
            if (hostRoomResult.Failure is { } failure)
                return CreateDeveloperRoomError(failure);

            var room = hostRoomResult.Room!;

            if (!room.IsThreatRevealed || room.CurrentThreat == null || room.CurrentThreat.Id != threatId)
                return BadRequest(new { error = "Загрозу ще не розкрито" });

            using var stream = file.OpenReadStream();
            var threatImageKey = BuildThreatImageKey(roomId, threatId);
            var (success, error, imageUrl) = await _imageService.SaveThreatImage(
                threatImageKey, stream, file.FileName);

            if (!success)
            {
                _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                    "scenario_image_upload", "failed", threatId, failureCode: "image_save_failed");
                return BadRequest(new { error });
            }

            room.CurrentThreat.ImageUrl = imageUrl;
            room.CurrentThreat.UploadedImagePath = imageUrl;

            await _hubContext.Clients.Group(roomId).SendAsync("ThreatImageUpdated", new
            {
                threatId,
                imageUrl
            });

            _logger.LogInformation($"Зображення загрози {threatId} завантажено для кімнати {roomId}");
            _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_upload", "success", threatId);

            return Ok(new { imageUrl });
        }

        /// <summary>
        /// Видалити зображення апокаліпсису
        /// </summary>
        [HttpDelete("apocalypse")]
        public async Task<IActionResult> RemoveApocalypseImage(
            [FromQuery] string roomId,
            [FromQuery] string apocalypseId)
        {
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(apocalypseId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            // Серверна перевірка Developer authority
            var hostRoomResult = GetDeveloperRoom(roomId);
            if (hostRoomResult.Failure is { } failure)
                return CreateDeveloperRoomError(failure);

            var room = hostRoomResult.Room!;
            if (room.Apocalypse == null || !string.Equals(room.Apocalypse.Id, apocalypseId, StringComparison.Ordinal))
                return BadRequest(new { error = "scenario_target_not_current" });

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
            _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_remove", "success", apocalypseId);

            return Ok(new { success = true });
        }

        /// <summary>
        /// Видалити зображення бункера
        /// </summary>
        [HttpDelete("bunker")]
        public async Task<IActionResult> RemoveBunkerImage(
            [FromQuery] string roomId,
            [FromQuery] string bunkerId)
        {
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(bunkerId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            // Серверна перевірка Developer authority
            var hostRoomResult = GetDeveloperRoom(roomId);
            if (hostRoomResult.Failure is { } failure)
                return CreateDeveloperRoomError(failure);

            var room = hostRoomResult.Room!;
            if (room.Bunker == null || !string.Equals(room.Bunker.Id, bunkerId, StringComparison.Ordinal))
                return BadRequest(new { error = "scenario_target_not_current" });

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
            _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_remove", "success", bunkerId);

            return Ok(new { success = true });
        }

        /// <summary>
        /// Видалити зображення розкритої загрози для поточної кімнати
        /// </summary>
        [HttpDelete("threat")]
        public async Task<IActionResult> RemoveThreatImage(
            [FromQuery] string roomId,
            [FromQuery] string threatId)
        {
            if (string.IsNullOrEmpty(roomId) || string.IsNullOrEmpty(threatId))
                return BadRequest(new { error = "Відсутні обов'язкові параметри" });

            var hostRoomResult = GetDeveloperRoom(roomId);
            if (hostRoomResult.Failure is { } failure)
                return CreateDeveloperRoomError(failure);

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
            _developerAuthority.Audit(room, hostRoomResult.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_remove", "success", threatId);

            return Ok(new { success = true });
        }

        /// <summary>
        /// Отримати промпт для генерації зображення апокаліпсису
        /// </summary>
        [HttpGet("apocalypse/prompt")]
        public IActionResult GetApocalypsePrompt([FromQuery] string roomId)
        {
            var result = GetDeveloperRoom(roomId);
            if (result.Failure is { } failure) return CreateDeveloperRoomError(failure);
            var room = result.Room!;
            if (room.Apocalypse == null)
                return NotFound(new { error = "Апокаліпсис не знайдено" });

            _developerAuthority.Audit(room, result.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_prompt", "success", room.Apocalypse.Id);
            return Ok(new { prompt = room.Apocalypse.GenerateImagePrompt() });
        }

        /// <summary>
        /// Отримати промпт для генерації зображення бункера
        /// </summary>
        [HttpGet("bunker/prompt")]
        public IActionResult GetBunkerPrompt([FromQuery] string roomId)
        {
            var result = GetDeveloperRoom(roomId);
            if (result.Failure is { } failure) return CreateDeveloperRoomError(failure);
            var room = result.Room!;
            if (room.Bunker == null)
                return NotFound(new { error = "Бункер не знайдено" });

            _developerAuthority.Audit(room, result.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_prompt", "success", room.Bunker.Id);
            return Ok(new { prompt = room.Bunker.GenerateImagePrompt() });
        }

        /// <summary>
        /// Отримати промпт для генерації зображення розкритої загрози
        /// </summary>
        [HttpGet("threat/prompt")]
        public IActionResult GetThreatPrompt([FromQuery] string roomId)
        {
            var result = GetDeveloperRoom(roomId);
            if (result.Failure is { } failure) return CreateDeveloperRoomError(failure);
            var room = result.Room!;
            if (room.CurrentThreat == null || !room.IsThreatRevealed)
                return NotFound(new { error = "Загрозу ще не розкрито" });

            _developerAuthority.Audit(room, result.Actor!, RoomActorCapability.ManageScenarioImages,
                "scenario_image_prompt", "success", room.CurrentThreat.Id);
            return Ok(new
            {
                prompt = room.CurrentThreat.GenerateImagePrompt(room.Apocalypse, room.Bunker)
            });
        }

        private static string BuildThreatImageKey(string roomId, string threatId)
        {
            return $"{roomId}_{threatId}";
        }

        private DeveloperRoomResult GetDeveloperRoom(string roomId)
        {
            var room = _roomService.GetRoom(roomId);
            if (room == null)
                return new DeveloperRoomResult(null, null, DeveloperRoomFailure.RoomNotFound);

            if (!_developerAuthority.FeatureAllows(RoomActorCapability.ManageScenarioImages))
                return new DeveloperRoomResult(null, null, DeveloperRoomFailure.FeatureDisabled);
            if (!_developerAuthority.TryGetDeveloperRoomActor(room, User, out var actor))
                return new DeveloperRoomResult(null, null, DeveloperRoomFailure.DeveloperRequired);
            if (!_developerAuthority.EnsureActiveOperator(room, actor, actor.ConnectionId) ||
                !_developerAuthority.IsActiveOperator(room, actor, actor.ConnectionId))
                return new DeveloperRoomResult(null, null, DeveloperRoomFailure.OperatorRequired);

            return new DeveloperRoomResult(room, actor, null);
        }

        private IActionResult CreateDeveloperRoomError(DeveloperRoomFailure failure)
        {
            return failure switch
            {
                DeveloperRoomFailure.RoomNotFound => NotFound(new { error = "room_not_found" }),
                DeveloperRoomFailure.FeatureDisabled => StatusCode(StatusCodes.Status403Forbidden, new { error = "feature_disabled" }),
                DeveloperRoomFailure.DeveloperRequired => StatusCode(StatusCodes.Status403Forbidden, new { error = "developer_required" }),
                DeveloperRoomFailure.OperatorRequired => StatusCode(StatusCodes.Status409Conflict, new { error = "developer_operator_required" }),
                _ => throw new ArgumentOutOfRangeException(nameof(failure), failure, null)
            };
        }

        private sealed record DeveloperRoomResult(Room? Room, Player? Actor, DeveloperRoomFailure? Failure);

        private enum DeveloperRoomFailure
        {
            RoomNotFound,
            FeatureDisabled,
            DeveloperRequired,
            OperatorRequired
        }
    }
}

