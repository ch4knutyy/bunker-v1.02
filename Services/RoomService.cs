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

            if (room.HostConnectionId == connectionId && string.IsNullOrWhiteSpace(room.HostPlayerId))
            {
                room.HostPlayerId = GetPlayerKey(player);
            }

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
                room.HostPlayerId = GetPlayerKey(newHost.Value);
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
                        oldRoom.HostPlayerId = GetPlayerKey(newHost.Value);
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

			// Якщо вже запущена (room starts in Lobby state)
			if (room.State != RoomState.Lobby)
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
                .Where(r => r.State == RoomState.Lobby && r.Players.Values.Any(p => p.IsConnected))
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

        public static string GetPlayerKey(Player player)
        {
            return !string.IsNullOrWhiteSpace(player.StablePlayerId)
                ? player.StablePlayerId
                : player.ConnectionId;
        }

        public bool TryResolvePlayer(Room room, string playerIdOrConnectionId, out string currentConnectionId, out Player player)
        {
            currentConnectionId = "";
            player = null!;

            if (string.IsNullOrWhiteSpace(playerIdOrConnectionId))
            {
                return false;
            }

            if (room.Players.TryGetValue(playerIdOrConnectionId, out var directPlayer))
            {
                currentConnectionId = directPlayer.ConnectionId;
                player = directPlayer;
                return true;
            }

            var entry = room.Players.FirstOrDefault(p =>
                p.Value.StablePlayerId == playerIdOrConnectionId ||
                p.Value.Id.ToString() == playerIdOrConnectionId);

            if (entry.Value == null)
            {
                return false;
            }

            currentConnectionId = entry.Key;
            player = entry.Value;
            return true;
        }

        public string? GetCurrentConnectionId(Room room, string playerIdOrConnectionId)
        {
            return TryResolvePlayer(room, playerIdOrConnectionId, out var currentConnectionId, out _)
                ? currentConnectionId
                : null;
        }

        public Player? GetPlayerByAnyId(Room room, string playerIdOrConnectionId)
        {
            return TryResolvePlayer(room, playerIdOrConnectionId, out _, out var player)
                ? player
                : null;
        }

        public bool TryGetCurrentPlayer(string connectionId, out Room room, out Player player)
        {
            room = null!;
            player = null!;

            room = GetPlayerRoom(connectionId)!;
            if (room == null) return false;

            return TryResolvePlayer(room, connectionId, out _, out player);
        }

        /// <summary>
        /// Позначити гравця як тимчасово відключеного без видалення з кімнати.
        /// </summary>
        public void MarkPlayerDisconnected(string connectionId)
        {
            var player = GetPlayer(connectionId);
            if (player == null) return;

            player.IsConnected = false;
            player.DisconnectedAt = DateTime.UtcNow;
            UpdatePlayer(connectionId, player);
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
		/// Шукає гравця за стабільним ID та переносить його на новий connectionId
		/// </summary>
		public (bool success, string? error, Room? room, Player? player, bool wasHost)
			RejoinRoom(string roomId, string newConnectionId, string playerName, string? stablePlayerId = null)
		{
			if (!_rooms.TryGetValue(roomId, out var room))
			{
				return (false, "Кімнату не знайдено", null, null, false);
			}

			if (string.IsNullOrWhiteSpace(stablePlayerId))
			{
				return (false, "Немає стабільного ID гравця", null, null, false);
			}

			var existingEntry = room.Players.FirstOrDefault(p => p.Value.StablePlayerId == stablePlayerId);

			if (existingEntry.Value == null)
			{
				return (false, "Гравця не знайдено в кімнаті", null, null, false);
			}

			var oldConnectionId = existingEntry.Key;
			var player = existingEntry.Value;

			room.Players.Remove(oldConnectionId);
			_playerToRoom.TryRemove(oldConnectionId, out _);

			player.ConnectionId = newConnectionId;
			player.IsConnected = true;
			player.DisconnectedAt = null;
			var playerKey = GetPlayerKey(player);

			foreach (var card in player.Cards)
			{
				card.OwnerConnectionId = playerKey;
				if (card.TargetPlayerId == oldConnectionId || card.TargetPlayerId == newConnectionId)
				{
					card.TargetPlayerId = playerKey;
				}
			}

			room.Players[newConnectionId] = player;
			_playerToRoom[newConnectionId] = roomId;

			bool wasHost = room.HostConnectionId == oldConnectionId;
			if (wasHost || room.HostPlayerId == playerKey)
			{
				room.HostConnectionId = newConnectionId;
				room.HostPlayerId = playerKey;
				wasHost = true;
			}

			if (room.CurrentTurnPlayerId == oldConnectionId)
			{
				room.CurrentTurnPlayerId = newConnectionId;
			}

			// Оновлюємо вже активовані спецкарти на новий connectionId
			foreach (var activatedCard in room.ActivatedCards)
			{
				if (activatedCard.PlayerId == oldConnectionId)
				{
					activatedCard.PlayerId = playerKey;
				}
				if (activatedCard.TargetPlayerId == oldConnectionId || activatedCard.TargetPlayerId == newConnectionId)
				{
					activatedCard.TargetPlayerId = playerKey;
				}
				if (activatedCard.ConnectionId == oldConnectionId)
				{
					activatedCard.ConnectionId = newConnectionId;
				}
			}

			foreach (var otherPlayer in room.Players.Values)
			{
				foreach (var card in otherPlayer.Cards)
				{
					if (card.TargetPlayerId == oldConnectionId || card.TargetPlayerId == newConnectionId)
					{
						card.TargetPlayerId = playerKey;
					}
				}
			}

			RemapVotingConnectionId(room, oldConnectionId, newConnectionId, playerKey);

			_logger.LogInformation(
				"Гравець {PlayerName} перепідключився до кімнати {RoomName} (старий: {OldConnectionId}, новий: {NewConnectionId})",
				player.Name,
				room.Name,
				oldConnectionId,
				newConnectionId
			);

			return (true, null, room, player, wasHost);
		}

		private static void RemapVotingConnectionId(Room room, string oldConnectionId, string newConnectionId, string playerKey)
		{
			var voting = room.CurrentVoting;
			if (voting == null) return;

			if (voting.EligibleVoters.Remove(oldConnectionId))
			{
				voting.EligibleVoters.Add(playerKey);
			}
			if (voting.EligibleVoters.Remove(newConnectionId))
			{
				voting.EligibleVoters.Add(playerKey);
			}

			if (voting.Votes.Remove(oldConnectionId, out var existingTarget))
			{
				voting.Votes[playerKey] = existingTarget == oldConnectionId || existingTarget == newConnectionId
					? playerKey
					: existingTarget;
			}
			if (voting.Votes.Remove(newConnectionId, out var newConnectionTarget))
			{
				voting.Votes[playerKey] = newConnectionTarget == oldConnectionId || newConnectionTarget == newConnectionId
					? playerKey
					: newConnectionTarget;
			}

			foreach (var voterId in voting.Votes.Keys.ToList())
			{
				if (voting.Votes[voterId] == oldConnectionId || voting.Votes[voterId] == newConnectionId)
				{
					voting.Votes[voterId] = playerKey;
				}
			}
		}
	}
}
