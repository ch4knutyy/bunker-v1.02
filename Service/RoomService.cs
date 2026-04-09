using Bunker.Models;
using System.Collections.Concurrent;

namespace Bunker.Services
{
    /// <summary>
    /// Сервіс для управління ігровими кімнатами
    /// </summary>
    public class RoomService
    {
        private readonly ConcurrentDictionary<string, Room> _rooms = new();
        private readonly ConcurrentDictionary<string, string> _playerToRoom = new(); // ConnectionId -> RoomId
        private readonly ILogger<RoomService> _logger;

        public RoomService(ILogger<RoomService> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Створити нову кімнату
        /// </summary>
        public Room CreateRoom(string name, string hostConnectionId, string hostName, int maxPlayers = 12, string? password = null)
        {
            var room = new Room
            {
                Name = name,
                HostConnectionId = hostConnectionId,
                HostName = hostName,
                MaxPlayers = Math.Clamp(maxPlayers, 4, 16),
                Password = string.IsNullOrWhiteSpace(password) ? null : password
            };

            if (_rooms.TryAdd(room.Id, room))
            {
                _logger.LogInformation($"Кімната '{room.Name}' (ID: {room.Id}) створена хостом {hostName}");
                return room;
            }

            throw new InvalidOperationException("Не вдалося створити кімнату");
        }

        /// <summary>
        /// Приєднатися до кімнати
        /// </summary>
        public (bool success, string? error, Room? room) JoinRoom(string roomId, string connectionId, Player player, string? password = null)
        {
            if (!_rooms.TryGetValue(roomId, out var room))
            {
                return (false, "Кімнату не знайдено", null);
            }

            if (!room.CanJoin)
            {
                return (false, room.State != RoomState.Lobby ? "Гра вже почалась" : "Кімната заповнена", null);
            }

            if (room.HasPassword && room.Password != password)
            {
                return (false, "Невірний пароль", null);
            }

            if (room.Players.ContainsKey(connectionId))
            {
                return (false, "Ви вже в цій кімнаті", null);
            }

            // Видаляємо з попередньої кімнати якщо був
            LeaveCurrentRoom(connectionId);

            room.Players[connectionId] = player;
            _playerToRoom[connectionId] = roomId;

            _logger.LogInformation($"Гравець {player.Name} приєднався до кімнати {room.Name} (ID: {room.Id})");
            
            return (true, null, room);
        }

        /// <summary>
        /// Покинути кімнату
        /// </summary>
        public (bool success, Room? room, bool roomDeleted, string? newHostConnectionId) LeaveRoom(string connectionId)
        {
            if (!_playerToRoom.TryRemove(connectionId, out var roomId))
            {
                return (false, null, false, null);
            }

            if (!_rooms.TryGetValue(roomId, out var room))
            {
                return (false, null, false, null);
            }

            room.Players.Remove(connectionId, out var player);
            var playerName = player?.Name ?? "Unknown";

            _logger.LogInformation($"Гравець {playerName} покинув кімнату {room.Name} (ID: {room.Id})");

            // Якщо кімната порожня - видаляємо
            if (room.Players.Count == 0)
            {
                _rooms.TryRemove(roomId, out _);
                _logger.LogInformation($"Кімната {room.Name} (ID: {room.Id}) видалена (порожня)");
                return (true, room, true, null);
            }

            // Якщо вийшов хост - передаємо права
            string? newHostConnectionId = null;
            if (room.HostConnectionId == connectionId)
            {
                var newHost = room.Players.First();
                room.HostConnectionId = newHost.Key;
                room.HostName = newHost.Value.Name;
                newHostConnectionId = newHost.Key;
                _logger.LogInformation($"Новий хост кімнати {room.Name}: {room.HostName}");
            }

            return (true, room, false, newHostConnectionId);
        }

        /// <summary>
        /// Покинути поточну кімнату (helper)
        /// </summary>
        private void LeaveCurrentRoom(string connectionId)
        {
            if (_playerToRoom.TryGetValue(connectionId, out var oldRoomId))
            {
                if (_rooms.TryGetValue(oldRoomId, out var oldRoom))
                {
                    oldRoom.Players.Remove(connectionId);
                    
                    if (oldRoom.Players.Count == 0)
                    {
                        _rooms.TryRemove(oldRoomId, out _);
                    }
                    else if (oldRoom.HostConnectionId == connectionId)
                    {
                        var newHost = oldRoom.Players.First();
                        oldRoom.HostConnectionId = newHost.Key;
                        oldRoom.HostName = newHost.Value.Name;
                    }
                }
                _playerToRoom.TryRemove(connectionId, out _);
            }
        }

		/// <summary>
		/// Почати гру в кімнаті
		/// </summary>
		public (bool success, string? error, Room? room) StartGame(string roomId, string connectionId)
		{
			if (!_rooms.TryGetValue(roomId, out var room))
			{
				return (false, "Кімнату не знайдено", null);
			}

			// Перевірка: тільки хост може стартувати
			if (room.HostConnectionId != connectionId)
			{
				return (false, "Тільки хост може почати гру", null);
			}

			// Перевірка: мінімум гравців
			if (room.Players.Count < 2)
			{
				return (false, "Недостатньо гравців для початку", null);
			}

			// Якщо вже запущена
			if (room.State != RoomState.Waiting)
			{
				return (false, "Гра вже запущена", null);
			}

			// Старт гри
			room.State = RoomState.Playing;

			// (опціонально) очистити тимчасові стани
			foreach (var player in room.Players.Values)
			{
				player.IsEliminated = false;
				// можна ще щось скинути якщо треба
			}

			_logger.LogInformation("Гра в кімнаті {RoomId} розпочата", roomId);

			return (true, null, room);
		}
		/// Отримати кімнату за ID
		/// </summary>
		public Room? GetRoom(string roomId)
        {
            _rooms.TryGetValue(roomId, out var room);
            return room;
        }

        /// <summary>
        /// Отримати кімнату гравця
        /// </summary>
        public Room? GetPlayerRoom(string connectionId)
        {
            if (_playerToRoom.TryGetValue(connectionId, out var roomId))
            {
                return GetRoom(roomId);
            }
            return null;
        }

        /// <summary>
        /// Отримати ID кімнати гравця
        /// </summary>
        public string? GetPlayerRoomId(string connectionId)
        {
            _playerToRoom.TryGetValue(connectionId, out var roomId);
            return roomId;
        }

        /// <summary>
        /// Отримати всі публічні кімнати
        /// </summary>
        public IEnumerable<object> GetAllRooms()
        {
            return _rooms.Values
                .Where(r => r.State == RoomState.Lobby)
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => r.ToPublicInfo());
        }

        /// <summary>
        /// Отримати гравця в кімнаті
        /// </summary>
        public Player? GetPlayer(string connectionId)
        {
            var room = GetPlayerRoom(connectionId);
            if (room != null && room.Players.TryGetValue(connectionId, out var player))
            {
                return player;
            }
            return null;
        }

        /// <summary>
        /// Оновити гравця в кімнаті
        /// </summary>
        public void UpdatePlayer(string connectionId, Player player)
        {
            var room = GetPlayerRoom(connectionId);
            if (room != null)
            {
                room.Players[connectionId] = player;
            }
        }

        /// <summary>
        /// Видалити гравця при відключенні
        /// </summary>
        public (Room? room, bool roomDeleted, string? newHostConnectionId) RemoveDisconnectedPlayer(string connectionId)
        {
            var result = LeaveRoom(connectionId);
            return (result.room, result.roomDeleted, result.newHostConnectionId);
        }

		/// <summary>
		/// Спроба повторного приєднання до кімнати (після перезавантаження сторінки)
		/// Шукає гравця за ім'ям в кімнаті та переносить його на новий connectionId
		/// </summary>
		public (bool success, string? error, Room? room, Player? player, bool wasHost)
			RejoinRoom(string roomId, string newConnectionId, string playerName, string? stablePlayerId = null)
		{
			if (!_rooms.TryGetValue(roomId, out var room))
			{
				return (false, "Кімнату не знайдено", null, null, false);
			}

			KeyValuePair<string, Player> existingEntry = default;

			if (!string.IsNullOrEmpty(stablePlayerId))
			{
				existingEntry = room.Players.FirstOrDefault(p => p.Value.StablePlayerId == stablePlayerId);
			}

			if (existingEntry.Value == null)
			{
				existingEntry = room.Players.FirstOrDefault(p => p.Value.Name == playerName);
			}

			if (existingEntry.Value == null)
			{
				return (false, "Гравця не знайдено в кімнаті", null, null, false);
			}

			var oldConnectionId = existingEntry.Key;
			var player = existingEntry.Value;

			room.Players.Remove(oldConnectionId);
			_playerToRoom.TryRemove(oldConnectionId, out _);

			player.ConnectionId = newConnectionId;

			room.Players[newConnectionId] = player;
			_playerToRoom[newConnectionId] = roomId;

			bool wasHost = room.HostConnectionId == oldConnectionId;
			if (wasHost)
			{
				room.HostConnectionId = newConnectionId;
			}

			// Оновлюємо вже активовані спецкарти на новий connectionId
			foreach (var activatedCard in room.ActivatedCards.Where(c => c.PlayerId == oldConnectionId))
			{
				activatedCard.PlayerId = newConnectionId;
			}

			_logger.LogInformation(
				"Гравець {PlayerName} перепідключився до кімнати {RoomName} (старий: {OldConnectionId}, новий: {NewConnectionId})",
				player.Name,
				room.Name,
				oldConnectionId,
				newConnectionId
			);

			return (true, null, room, player, wasHost);
		}
	}
}
