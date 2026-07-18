using Bunker.Models;
using System.Collections.Concurrent;

namespace Bunker.Services
{
    public sealed record DisconnectedPlayerFinalizationResult(
        bool Removed,
        bool RoomDeleted,
        string RoomId,
        string ConnectionId,
        string? NewHostConnectionId,
        string? NewHostName,
        string? NewHostPlayerId,
        bool WasLobby,
        Room? Room);

    /// <summary>
    /// Сервіс для управління ігровими кімнатами
    /// </summary>
    public class RoomService
    {
        internal const string AccountReconnectMismatchError = "Обліковий запис не відповідає гравцю";
        internal const string ReconnectTokenMismatchError = "Невірні дані для перепідключення";
        private readonly ConcurrentDictionary<string, Room> _rooms = new();
        private readonly ConcurrentDictionary<string, string> _playerToRoom = new(); // ConnectionId -> RoomId
        private readonly ILogger<RoomService> _logger;
        public event Action<string>? RoomRemoved;

        public RoomService(ILogger<RoomService> logger)
        {
            _logger = logger;
        }

        /// <summary>
        /// Створити нову кімнату
        /// </summary>
        public Room CreateRoom(string name, string hostConnectionId, string hostName, int maxPlayers = 12, string? password = null)
        {
            var normalizedMaxPlayers = Math.Clamp(maxPlayers, 2, 12);
            var gameSettings = RoomGameSettingsService.Preset(GamePreset.Classic);
            gameSettings.MaxGameplayPlayers = normalizedMaxPlayers;
            if (gameSettings.MaxGameplayPlayers != 12) gameSettings.Preset = GamePreset.Custom;
            var room = new Room
            {
                Name = name,
                HostConnectionId = hostConnectionId,
                HostName = hostName,
                MaxPlayers = normalizedMaxPlayers,
                MinPlayers = gameSettings.MinGameplayPlayers,
                GameSettings = gameSettings,
                Password = string.IsNullOrWhiteSpace(password) ? null : password,
                PasswordVerificationHash = string.IsNullOrWhiteSpace(password) ? null : RoomRecoverySecurity.HashPassword(password)
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

            if (player == null)
            {
                return (false, "Некоректний гравець", null);
            }

            EnsureRoomIdentity(room, roomId);
            if (string.IsNullOrWhiteSpace(player.ConnectionId)) player.ConnectionId = connectionId;
            if (string.IsNullOrWhiteSpace(player.Name)) player.Name = "Unknown";
            if (string.IsNullOrWhiteSpace(player.StablePlayerId)) player.StablePlayerId = "";

            var playersSnapshot = GetPlayersSnapshot(room, "JoinRoom", cleanupInvalid: true);

            if (RoomGameSettingsService.Migrate(room.GameSettings).JoinsLocked)
            {
                return (false, "Приєднання до кімнати заблоковано", null);
            }

            if (room.State != RoomState.Lobby || GetGameplayPlayersSnapshot(room).Count >= room.MaxPlayers)
            {
                return (false, room.State != RoomState.Lobby ? "Гра вже почалась" : "Кімната заповнена", null);
            }

            if (room.HasPassword && !VerifyRoomPassword(room, password))
            {
                return (false, "Невірний пароль", null);
            }

            if (playersSnapshot.Any(entry => entry.Key == connectionId))
            {
                return (false, "Ви вже в цій кімнаті", null);
            }
            if (!string.IsNullOrWhiteSpace(player.StablePlayerId) &&
                playersSnapshot.Any(entry => string.Equals(entry.Value.StablePlayerId, player.StablePlayerId, StringComparison.Ordinal)))
            {
                return (false, ReconnectTokenMismatchError, null);
            }

            // Видаляємо з попередньої кімнати якщо був
            LeaveCurrentRoom(connectionId);

            AddOrUpdatePlayer(room, connectionId, player);
            _playerToRoom[connectionId] = roomId;
            if (room.IrreversibleOmniscientPlayerIds.Contains(GetPlayerKey(player)))
            {
                player.IsSpectatorGm = true;
                player.HasSeenOmniscientState = true;
                player.GmRole = GmMode.OmniscientGm;
                CleanupPlayerReferences(room, connectionId, GetPlayerKey(player));
            }

            if (room.HostConnectionId == connectionId && string.IsNullOrWhiteSpace(room.HostPlayerId))
            {
                room.HostPlayerId = GetPlayerKey(player);
            }

            _logger.LogInformation($"Гравець {player.Name ?? "Unknown"} приєднався до кімнати {room.Name} (ID: {room.Id})");
            
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

            TryRemovePlayer(room, connectionId, out var player);
            var playerName = player?.Name ?? "Unknown";
            if (player != null)
            {
                CleanupPlayerReferences(room, connectionId, GetPlayerKey(player));
            }

            _logger.LogInformation($"Гравець {playerName} покинув кімнату {room.Name} (ID: {room.Id})");

            // Якщо кімната порожня - видаляємо
            var playersSnapshot = GetPlayersSnapshot(room, "LeaveRoom", cleanupInvalid: true);

            if (playersSnapshot.Count == 0)
            {
                RemoveRoom(roomId);
                _logger.LogInformation($"Кімната {room.Name} (ID: {room.Id}) видалена (порожня)");
                return (true, room, true, null);
            }

            // Якщо вийшов хост - передаємо права
            string? newHostConnectionId = null;
            if (room.HostConnectionId == connectionId)
            {
                if (!TryAssignNewHost(room, "LeaveRoom", out newHostConnectionId))
                {
                    RemoveRoom(roomId);
                    _logger.LogWarning("Кімната {RoomId} видалена: не вдалося призначити нового хоста", roomId);
                    return (true, room, true, null);
                }
                _logger.LogInformation($"Новий хост кімнати {room.Name}: {room.HostName}");
            }

            return (true, room, false, newHostConnectionId);
        }

        public bool TransferHost(Room room, string targetConnectionId, out Player? newHost)
        {
            newHost = null;
            if (!TryResolvePlayer(room, targetConnectionId, out var currentConnectionId, out var player) ||
                !player.IsConnected)
            {
                return false;
            }

            room.HostConnectionId = currentConnectionId;
            room.HostPlayerId = GetPlayerKey(player);
            room.HostName = player.Name ?? "Unknown";
            room.GmMode = GmMode.PlayerHost;
            newHost = player;
            return true;
        }

        public StaleConnectionResult InspectStaleConnection(Room room, string connectionId, bool fix)
        {
            if (string.IsNullOrWhiteSpace(connectionId))
                return new(false, false, "Не вказано connection mapping");

            var hasMapping = _playerToRoom.TryGetValue(connectionId, out var mappedRoomId);
            var hasActivePlayer = room.Players != null && room.Players.TryGetValue(connectionId, out var player) &&
                                  player != null && player.IsConnected;
            var stale = hasMapping && string.Equals(mappedRoomId, room.Id, StringComparison.OrdinalIgnoreCase) && !hasActivePlayer;
            if (!stale)
                return new(false, false, "Активне або відсутнє mapping не змінено");

            var fixedMapping = fix && _playerToRoom.TryRemove(connectionId, out _);
            return new(true, fixedMapping, fixedMapping ? "Застаріле mapping очищено" : "Застаріле mapping знайдено");
        }

        public IReadOnlyDictionary<string, string> GetConnectionMappingsSnapshot(string roomId) =>
            _playerToRoom
                .Where(entry => string.Equals(entry.Value, roomId, StringComparison.OrdinalIgnoreCase))
                .ToDictionary(entry => entry.Key, entry => entry.Value, StringComparer.OrdinalIgnoreCase);

        public bool RemoveStaleConnectionMapping(Room room, string connectionId)
        {
            if (string.IsNullOrWhiteSpace(connectionId) ||
                !_playerToRoom.TryGetValue(connectionId, out var mappedRoomId) ||
                !string.Equals(mappedRoomId, room.Id, StringComparison.OrdinalIgnoreCase))
                return false;

            var hasPlayer = room.Players != null && room.Players.TryGetValue(connectionId, out var player) && player != null;
            return !hasPlayer && _playerToRoom.TryRemove(connectionId, out _);
        }

        private static void CleanupPlayerReferences(Room room, string connectionId, string playerId)
        {
            if (room.CurrentTurnPlayerId == connectionId || room.CurrentTurnPlayerId == playerId)
                room.CurrentTurnPlayerId = null;
            room.CurrentRoundReveals.Remove(playerId);
            room.CurrentRoundReveals.Remove(connectionId);
            room.VotingReadyResponses.Remove(playerId);
            room.VotingReadyResponses.Remove(connectionId);

            var voting = room.CurrentVoting;
            if (voting != null)
            {
                voting.Votes.Remove(playerId);
                voting.Votes.Remove(connectionId);
                foreach (var voter in voting.Votes.Where(vote => vote.Value == playerId || vote.Value == connectionId).Select(vote => vote.Key).ToList())
                    voting.Votes.Remove(voter);
                voting.EligibleVoters.Remove(playerId);
                voting.EligibleVoters.Remove(connectionId);
                voting.BlockedVoterIds.Remove(playerId);
                voting.BlockedVoterIds.Remove(connectionId);
                voting.VoteMultipliers.Remove(playerId);
                voting.VoteMultipliers.Remove(connectionId);
            }

            var threat = room.ThreatState;
            if (threat == null) return;
            threat.ParticipantPlayerIds.RemoveAll(id => id == playerId || id == connectionId);
            threat.Contributions.RemoveAll(item => item.PlayerId == playerId || item.PlayerId == connectionId || item.OwnerPlayerId == playerId || item.OwnerPlayerId == connectionId);
            threat.ThreatVolunteerVote.Votes.Remove(playerId);
            threat.ThreatVolunteerVote.Votes.Remove(connectionId);
            foreach (var voter in threat.ThreatVolunteerVote.Votes.Where(vote => vote.Value == playerId || vote.Value == connectionId).Select(vote => vote.Key).ToList())
                threat.ThreatVolunteerVote.Votes.Remove(voter);
            if (threat.VolunteerSelection.SelectedPlayerId == playerId || threat.VolunteerSelection.SelectedPlayerId == connectionId)
                threat.VolunteerSelection = new ThreatVolunteerSelectionState();
            if (threat.ForcedParticipantPlayerId == playerId || threat.ForcedParticipantPlayerId == connectionId)
                threat.ForcedParticipantPlayerId = "";
            if (threat.MiniGame.LeaderPlayerId == playerId || threat.MiniGame.LeaderPlayerId == connectionId)
                threat.MiniGame.LeaderPlayerId = "";
        }

        public static bool IsGameplayParticipant(Player? player) => player != null && !player.IsEliminated && !player.IsSpectatorGm &&
            !player.IsLobbySpectator && player.GmRole != GmMode.TechnicalGm;

        public static IReadOnlyList<KeyValuePair<string, Player>> GetGameplayPlayersSnapshot(Room room) =>
            GetPlayersSnapshot(room).Where(entry => IsGameplayParticipant(entry.Value)).ToList();

        public void RemoveGameplayParticipation(Room room, Player player) =>
            CleanupPlayerReferences(room, player.ConnectionId, GetPlayerKey(player));
        public static void RemoveGameplayParticipationReferences(Room room, Player player) =>
            CleanupPlayerReferences(room, player.ConnectionId, GetPlayerKey(player));

        /// <summary>
        /// Покинути поточну кімнату (helper)
        /// </summary>
        private void LeaveCurrentRoom(string connectionId)
        {
            if (_playerToRoom.TryGetValue(connectionId, out var oldRoomId))
            {
                if (_rooms.TryGetValue(oldRoomId, out var oldRoom))
                {
                    TryRemovePlayer(oldRoom, connectionId, out _);
                    var playersSnapshot = GetPlayersSnapshot(oldRoom, "LeaveCurrentRoom", cleanupInvalid: true);

                    if (playersSnapshot.Count == 0)
                    {
                        RemoveRoom(oldRoomId);
                    }
                    else if (oldRoom.HostConnectionId == connectionId)
                    {
                        TryAssignNewHost(oldRoom, "LeaveCurrentRoom", out _);
                    }
                }
                _playerToRoom.TryRemove(connectionId, out _);
            }
        }

		/// <summary>
		/// Почати гру в кімнаті
		/// </summary>
		public (bool success, string? error, Room? room) StartGame(string roomId, string connectionId, Func<int, int>? nextRandom = null)
		{
			if (!_rooms.TryGetValue(roomId, out var room))
			{
				return (false, "Кімнату не знайдено", null);
			}

			lock (room.Players)
			{
				// The validated lobby transition and canonical seat assignment share one lock.
				// The complete permutation is prepared before any room/player mutation.
				if (room.HostConnectionId != connectionId)
					return (false, "Тільки хост може почати гру", null);

				var playersSnapshot = GetGameplayPlayersSnapshot(room);
				var gameSettings = RoomGameSettingsService.Migrate(room.GameSettings);
				if (playersSnapshot.Count < gameSettings.MinGameplayPlayers)
					return (false, "Недостатньо гравців для початку", null);
				if (playersSnapshot.Count > gameSettings.MaxGameplayPlayers)
					return (false, "Забагато гравців для поточних налаштувань", null);
				if (room.State != RoomState.Lobby)
					return (false, "Гра вже запущена", null);

				var random = nextRandom ?? Random.Shared.Next;
				var randomizedPlayers = playersSnapshot.Select(entry => entry.Value).ToList();
				for (var index = randomizedPlayers.Count - 1; index > 0; index--)
				{
					var swapIndex = random(index + 1);
					if (swapIndex < 0 || swapIndex > index)
						throw new ArgumentOutOfRangeException(nameof(nextRandom), "Seat RNG returned an invalid index.");
					(randomizedPlayers[index], randomizedPlayers[swapIndex]) = (randomizedPlayers[swapIndex], randomizedPlayers[index]);
				}

				for (var index = 0; index < randomizedPlayers.Count; index++)
					randomizedPlayers[index].SeatNumber = index + 1;

			// Старт гри
			room.State = RoomState.Playing;
			room.CurrentRound = 1;
			room.CurrentPhase = GamePhase.RoundReveal;
			room.CurrentTurnPlayerId = null;
			room.CurrentVoting = null;
			room.CurrentRoundReveals.Clear();
			room.RoundDiceRolls.Clear();
			room.AdditionalInventoryGrantedAfterRound3 = false;
			room.CurrentThreat = null;
			room.IsThreatRevealed = false;
			room.ThreatRevealedAtRound = null;
			room.ThreatsTriggeredCount = 0;
			room.TriggeredThreatIds.Clear();
			room.ThreatRoundsTriggered.Clear();
			room.VotingReadyResponses.Clear();

			// (опціонально) очистити тимчасові стани
			foreach (var player in playersSnapshot.Select(entry => entry.Value))
			{
				player.IsEliminated = false;
				player.EliminatedAtRound = null;
				player.EliminatedByVote = false;
				player.CanRevealAllAfterElimination = false;
				player.HasRevealedAllAfterElimination = false;
                player.IsProtectedFromVote = false;
                player.ExtraVotes = 0;
				player.InventoryProtectedUntilRound = null;
				player.CharacteristicsProtectedUntilRound = null;
				var specialCards = player.SpecialCards?.Count > 0
					? player.SpecialCards
					: player.SpecialCard == null
						? new List<SpecialCard>()
						: new List<SpecialCard> { player.SpecialCard };
				foreach (var specialCard in specialCards)
				{
					specialCard.IsUsed = false;
					specialCard.IsActive = false;
					specialCard.UsedAtRound = null;
					specialCard.ActivatedRound = null;
					specialCard.TargetPlayerId = null;
					specialCard.TargetPlayerName = null;
					specialCard.ActivatedVotingId = null;
					specialCard.EffectResult = null;
					specialCard.PublicLog = null;
					specialCard.PrivateResult = null;
					specialCard.UseMode = "";
					specialCard.WasUsedSilently = false;
					specialCard.IsPubliclyRevealed = false;
					specialCard.EffectDuration = "instant";
					specialCard.EffectExpiresAtRound = null;
					specialCard.PublicVisibilityExpiresAtRound = null;
					specialCard.PublicDisplayName = null;
					specialCard.PublicDescription = null;
					specialCard.PublicResult = null;
				}
			}
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

        public bool TryRegisterRecoveredRoom(Room room)
        {
            if (room == null || string.IsNullOrWhiteSpace(room.Id)) return false;
            room.HostConnectionId = "";
            foreach (var player in GetPlayersSnapshot(room).Select(entry => entry.Value))
            {
                player.ConnectionId = "";
                player.IsConnected = false;
                player.DisconnectedAt = null;
            }
            return _rooms.TryAdd(room.Id, room);
        }

        private void EnsureRoomIdentity(Room room, string fallbackRoomId)
        {
            if (string.IsNullOrWhiteSpace(room.Id))
            {
                room.Id = fallbackRoomId;
                _logger.LogWarning("Кімната без Id отримала fallback Id {RoomId}", fallbackRoomId);
            }

            if (string.IsNullOrWhiteSpace(room.Name))
            {
                room.Name = "Кімната";
                _logger.LogWarning("Кімната {RoomId} мала порожню назву", room.Id);
            }

            room.HostConnectionId ??= "";
            room.HostPlayerId ??= "";
            room.HostName ??= "";
        }

        private List<KeyValuePair<string, Player>> GetPlayersSnapshot(Room? room, string operation, bool cleanupInvalid = false)
        {
            if (room == null)
            {
                _logger.LogWarning("{Operation}: знайдено null room", operation);
                return new();
            }

            if (room.Players == null)
            {
                _logger.LogWarning("{Operation}: кімната {RoomId} має null Players, створюю порожню колекцію", operation, room.Id);
                room.Players = new();
                return new();
            }

            lock (room.Players)
            {
                var invalidKeys = room.Players
                    .Where(entry => string.IsNullOrWhiteSpace(entry.Key) || entry.Value == null)
                    .Select(entry => entry.Key)
                    .ToList();

                if (invalidKeys.Count > 0)
                {
                    _logger.LogWarning(
                        "{Operation}: кімната {RoomId} має {InvalidPlayersCount} некоректних гравців",
                        operation,
                        room.Id,
                        invalidKeys.Count
                    );

                    if (cleanupInvalid)
                    {
                        foreach (var key in invalidKeys)
                        {
                            room.Players.Remove(key);

                            if (!string.IsNullOrWhiteSpace(key))
                            {
                                _playerToRoom.TryRemove(key, out _);
                            }
                        }
                    }
                }

                return room.Players
                    .Where(entry => !string.IsNullOrWhiteSpace(entry.Key) && entry.Value != null)
                    .ToList();
            }
        }

        public static List<KeyValuePair<string, Player>> GetPlayersSnapshot(Room? room)
        {
            if (room?.Players == null)
            {
                return new();
            }

            lock (room.Players)
            {
                return room.Players
                    .Where(entry => !string.IsNullOrWhiteSpace(entry.Key) && entry.Value != null)
                    .ToList();
            }
        }

        private bool TryRemovePlayer(Room room, string connectionId, out Player? player)
        {
            player = null;

            if (room.Players == null)
            {
                return false;
            }

            lock (room.Players)
            {
                var removed = room.Players.Remove(connectionId, out var removedPlayer);
                player = removedPlayer;
                return removed;
            }
        }

        private void AddOrUpdatePlayer(Room room, string connectionId, Player player)
        {
            if (room.Players == null)
            {
                room.Players = new();
            }

            lock (room.Players)
            {
                room.Players[connectionId] = player;
            }
        }

        private bool TryGetRoomPlayer(Room room, string connectionId, out Player? player)
        {
            player = null;

            if (room.Players == null)
            {
                return false;
            }

            lock (room.Players)
            {
                var found = room.Players.TryGetValue(connectionId, out var foundPlayer);
                player = foundPlayer;
                return found;
            }
        }

        private bool TryAssignNewHost(Room room, string operation, out string? newHostConnectionId)
        {
            var playersSnapshot = GetPlayersSnapshot(room, operation, cleanupInvalid: true);
            var newHost = playersSnapshot.FirstOrDefault();

            if (newHost.Value == null)
            {
                newHostConnectionId = null;
                return false;
            }

            newHostConnectionId = newHost.Key;
            room.HostConnectionId = newHost.Key;
            room.HostPlayerId = GetPlayerKey(newHost.Value);
            room.HostName = newHost.Value.Name ?? "Unknown";

            return true;
        }

        /// <summary>
        /// Отримати всі публічні кімнати
        /// </summary>
        public IEnumerable<object> GetAllRooms()
        {
            var publicRooms = new List<(DateTime CreatedAt, object Info)>();

            foreach (var entry in _rooms.ToArray())
            {
                var roomId = entry.Key;
                var room = entry.Value;

                try
                {
                    if (room == null)
                    {
                        _logger.LogWarning("GetAllRooms: словник містить null room для ключа {RoomId}", roomId);
                        continue;
                    }

                    EnsureRoomIdentity(room, roomId);

                    var playersSnapshot = GetPlayersSnapshot(room, "GetAllRooms", cleanupInvalid: true);
                    var hasConnectedPlayers = playersSnapshot.Any(playerEntry => playerEntry.Value?.IsConnected == true);

                    if (room.State != RoomState.Lobby || !hasConnectedPlayers)
                    {
                        continue;
                    }

                    publicRooms.Add((
                        room.CreatedAt,
                        new
                        {
                            id = room.Id,
                            name = room.Name,
                            hasPassword = room.HasPassword,
                            playerCount = playersSnapshot.Count,
                            maxPlayers = room.MaxPlayers,
                            hostName = room.HostName ?? "",
                            state = room.State.ToString(),
                            canJoin = room.State == RoomState.Lobby && playersSnapshot.Count < room.MaxPlayers
                        }
                    ));
                }
                catch (Exception ex)
                {
                    _logger.LogWarning(ex, "GetAllRooms: пропускаю пошкоджену кімнату {RoomId}", roomId);
                }
            }

            return publicRooms
                .OrderByDescending(room => room.CreatedAt)
                .Select(room => room.Info)
                .ToList();
        }

        public IReadOnlyList<Room> GetActiveRoomsSnapshot() =>
            _rooms.Values.Where(room => room != null).ToList();

        /// <summary>
        /// Отримати гравця в кімнаті
        /// </summary>
        public Player? GetPlayer(string connectionId)
        {
            var room = GetPlayerRoom(connectionId);
            if (room != null && TryGetRoomPlayer(room, connectionId, out var player))
            {
                return player;
            }
            return null;
        }

        public static string GetPlayerKey(Player player)
        {
            return !string.IsNullOrWhiteSpace(player.StablePlayerId)
                ? player.StablePlayerId
                : player.ConnectionId ?? "";
        }

        public bool TryResolvePlayer(Room room, string playerIdOrConnectionId, out string currentConnectionId, out Player player)
        {
            currentConnectionId = "";
            player = null!;

            if (string.IsNullOrWhiteSpace(playerIdOrConnectionId))
            {
                return false;
            }

            if (TryGetRoomPlayer(room, playerIdOrConnectionId, out var directPlayer) && directPlayer != null)
            {
                currentConnectionId = directPlayer.ConnectionId ?? "";
                player = directPlayer;
                return true;
            }

            var playersSnapshot = GetPlayersSnapshot(room, "TryResolvePlayer", cleanupInvalid: true);
            var entry = playersSnapshot.FirstOrDefault(p =>
                p.Value != null &&
                (p.Value.StablePlayerId == playerIdOrConnectionId ||
                p.Value.Id.ToString() == playerIdOrConnectionId));

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
            if (room != null && player != null)
            {
                AddOrUpdatePlayer(room, connectionId, player);
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

        public DisconnectedPlayerFinalizationResult TryFinalizeDisconnectedPlayer(
            string roomId,
            Guid playerId,
            string expectedConnectionId)
        {
            DisconnectedPlayerFinalizationResult NotRemoved() =>
                new(false, false, roomId, expectedConnectionId, null, null, null, false, null);

            if (!_rooms.TryGetValue(roomId, out var room) || room.Players == null)
            {
                return NotRemoved();
            }

            lock (room.Players)
            {
                if (!_rooms.TryGetValue(roomId, out var currentRoom) || !ReferenceEquals(currentRoom, room))
                {
                    return NotRemoved();
                }

                var playerEntry = room.Players.FirstOrDefault(entry => entry.Value?.Id == playerId);
                var player = playerEntry.Value;
                if (player == null ||
                    player.IsConnected ||
                    !string.Equals(player.ConnectionId, expectedConnectionId, StringComparison.Ordinal) ||
                    !string.Equals(playerEntry.Key, expectedConnectionId, StringComparison.Ordinal) ||
                    !_playerToRoom.TryGetValue(expectedConnectionId, out var mappedRoomId) ||
                    !string.Equals(mappedRoomId, roomId, StringComparison.OrdinalIgnoreCase))
                {
                    return NotRemoved();
                }

                var removal = LeaveRoom(expectedConnectionId);
                if (!removal.success || removal.room == null)
                {
                    return NotRemoved();
                }

                var finalizedRoom = removal.room;
                string? newHostName = null;
                string? newHostPlayerId = null;
                if (!removal.roomDeleted && !string.IsNullOrWhiteSpace(removal.newHostConnectionId))
                {
                    var newHost = GetPlayersSnapshot(finalizedRoom)
                        .FirstOrDefault(entry => entry.Key == removal.newHostConnectionId).Value;
                    newHostName = newHost?.Name;
                    newHostPlayerId = newHost == null ? null : GetPlayerKey(newHost);
                }

                return new(
                    true,
                    removal.roomDeleted,
                    finalizedRoom.Id,
                    expectedConnectionId,
                    removal.newHostConnectionId,
                    newHostName,
                    newHostPlayerId,
                    finalizedRoom.State == RoomState.Lobby,
                    finalizedRoom);
            }
        }

		/// <summary>
		/// Спроба повторного приєднання до кімнати (після перезавантаження сторінки)
		/// Шукає гравця за стабільним ID та переносить його на новий connectionId
		/// </summary>
		public (bool success, string? error, Room? room, Player? player, bool wasHost)
			RejoinRoom(
				string roomId,
				string newConnectionId,
				string playerName,
				string? stablePlayerId = null,
				Guid? accountUserId = null,
				string? reconnectToken = null)
		{
			if (!_rooms.TryGetValue(roomId, out var room))
			{
				return (false, "Кімнату не знайдено", null, null, false);
			}

			if (string.IsNullOrWhiteSpace(stablePlayerId))
			{
				return (false, "Немає стабільного ID гравця", null, null, false);
			}

			EnsureRoomIdentity(room, roomId);

            lock (room.Players)
            {
            if (!_rooms.TryGetValue(roomId, out var currentRoom) || !ReferenceEquals(currentRoom, room))
            {
                return (false, "Кімнату не знайдено", null, null, false);
            }

			var existingEntry = GetPlayersSnapshot(room, "RejoinRoom", cleanupInvalid: true)
				.FirstOrDefault(p => p.Value != null && p.Value.StablePlayerId == stablePlayerId);

			if (existingEntry.Value == null)
			{
				return (false, "Гравця не знайдено в кімнаті", null, null, false);
			}

			var oldConnectionId = existingEntry.Key;
			var player = existingEntry.Value;

			if (player.AccountUserId is Guid boundAccountUserId &&
				boundAccountUserId != accountUserId)
			{
				return (false, AccountReconnectMismatchError, null, null, false);
			}
			if (player.AccountUserId == null &&
				!string.IsNullOrWhiteSpace(player.RecoveryReconnectTokenHash) &&
				!RoomRecoverySecurity.VerifyReconnectToken(reconnectToken ?? "", player.RecoveryReconnectTokenHash))
			{
				return (false, ReconnectTokenMismatchError, null, null, false);
			}

			TryRemovePlayer(room, oldConnectionId, out _);
			_playerToRoom.TryRemove(oldConnectionId, out _);

			player.ConnectionId = newConnectionId;
			if (string.IsNullOrWhiteSpace(player.Name)) player.Name = playerName;
			if (string.IsNullOrWhiteSpace(player.StablePlayerId)) player.StablePlayerId = stablePlayerId;
			player.IsConnected = true;
			player.DisconnectedAt = null;
			var playerKey = GetPlayerKey(player);
			if (room.IrreversibleOmniscientPlayerIds.Contains(playerKey))
			{
				player.IsSpectatorGm = true;
				player.HasSeenOmniscientState = true;
				player.GmRole = GmMode.OmniscientGm;
				CleanupPlayerReferences(room, oldConnectionId, playerKey);
			}

			AddOrUpdatePlayer(room, newConnectionId, player);
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
		}

        private static bool VerifyRoomPassword(Room room, string? password)
        {
            if (!string.IsNullOrEmpty(room.Password))
            {
                return string.Equals(room.Password, password, StringComparison.Ordinal);
            }
            return RoomRecoverySecurity.VerifyPassword(password, room.PasswordVerificationHash);
        }

        private bool RemoveRoom(string roomId)
        {
            if (!_rooms.TryRemove(roomId, out _)) return false;
            RoomRemoved?.Invoke(roomId);
            return true;
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
