using System.Collections.Concurrent;
using System.Text.Json;
using Bunker.Models.Spy;

namespace Bunker.Services
{
    public class SpyRoomService
    {
        private readonly ConcurrentDictionary<string, SpyRoom> _rooms = new(StringComparer.OrdinalIgnoreCase);
        private readonly ConcurrentDictionary<string, string> _playerToRoom = new();
        private readonly List<SpyLocation> _locations;
        private readonly ILogger<SpyRoomService> _logger;
        private readonly Random _random = new();

        private static readonly JsonSerializerOptions JsonOptions = new()
        {
            PropertyNameCaseInsensitive = true
        };

		public SpyRoomService(IWebHostEnvironment env, ILogger<SpyRoomService> logger)
		{
			_logger = logger;
			_locations = LoadLocations(
				Path.Combine(env.WebRootPath, "data", "Spy_Locations", "spy_locations.json"));
		}

		public SpyRoom CreateRoom(string connectionId, string playerName, string playerId)
        {
            var room = new SpyRoom
            {
                RoomCode = GenerateRoomCode(),
                HostPlayerId = NormalizePlayerId(playerId)
            };

            var host = CreatePlayer(connectionId, playerName, playerId, isHost: true);
            room.Players[host.PlayerId] = host;
            _rooms[room.RoomCode] = room;
            _playerToRoom[connectionId] = room.RoomCode;

            return room;
        }

        public (bool Success, string? Error, SpyRoom? Room) JoinRoom(
            string roomCode,
            string connectionId,
            string playerName,
            string playerId)
        {
            roomCode = NormalizeRoomCode(roomCode);
            if (!_rooms.TryGetValue(roomCode, out var room))
                return (false, "Кімнату не знайдено", null);

            var normalizedPlayerId = NormalizePlayerId(playerId);
            lock (room)
            {
                if (room.Players.TryGetValue(normalizedPlayerId, out var existing))
                {
                    if (!string.IsNullOrWhiteSpace(existing.ConnectionId))
                        _playerToRoom.TryRemove(existing.ConnectionId, out _);

                    existing.ConnectionId = connectionId;
                    existing.Name = CleanPlayerName(playerName);
                    existing.IsConnected = true;
                    existing.DisconnectedAt = null;
                    _playerToRoom[connectionId] = room.RoomCode;
                    return (true, null, room);
                }

                var player = CreatePlayer(connectionId, playerName, normalizedPlayerId, isHost: false);
                room.Players[player.PlayerId] = player;
                _playerToRoom[connectionId] = room.RoomCode;
                return (true, null, room);
            }
        }

        public (bool Success, string? Error, SpyRoom? Room) StartRound(string connectionId)
        {
            var room = GetPlayerRoom(connectionId);
            if (room == null) return (false, "Кімнату не знайдено", null);
            if (!IsHost(room, connectionId)) return (false, "Тільки host може почати раунд", room);

            lock (room)
            {
                var activePlayers = room.Players.Values
                    .Where(player => player.IsConnected)
                    .ToList();

                if (activePlayers.Count < 3)
                    return (false, "Потрібно мінімум 3 гравці", room);

                var location = _locations.Count > 0
                    ? _locations[_random.Next(_locations.Count)]
                    : new SpyLocation { Id = "fallback_location", Localization = new() { ["uk"] = new() { Name = "Лікарня" } } };

                var spy = activePlayers[_random.Next(activePlayers.Count)];

                room.CurrentRound++;
                room.IsRoundActive = true;
                room.RolesRevealed = false;
                room.SelectedLocationId = location.Id;
                room.SelectedLocationName = location.GetName("uk");
                room.SpyPlayerId = spy.PlayerId;
                room.RoundStartedAt = DateTime.UtcNow;

                foreach (var player in room.Players.Values)
                    player.VoteTargetPlayerId = null;
            }

            return (true, null, room);
        }

        public (bool Success, string? Error, SpyRoom? Room) EndRound(string connectionId)
        {
            var room = GetPlayerRoom(connectionId);
            if (room == null) return (false, "Кімнату не знайдено", null);
            if (!IsHost(room, connectionId)) return (false, "Тільки host може завершити раунд", room);

            lock (room)
            {
                room.IsRoundActive = false;
            }

            return (true, null, room);
        }

        public (bool Success, string? Error, SpyRoom? Room) RevealRoles(string connectionId)
        {
            var room = GetPlayerRoom(connectionId);
            if (room == null) return (false, "Кімнату не знайдено", null);
            if (!IsHost(room, connectionId)) return (false, "Тільки host може розкрити ролі", room);

            lock (room)
            {
                room.IsRoundActive = false;
                room.RolesRevealed = true;
            }

            return (true, null, room);
        }

        public SpyRoom? GetPlayerRoom(string connectionId)
        {
            return _playerToRoom.TryGetValue(connectionId, out var roomCode)
                ? GetRoom(roomCode)
                : null;
        }

        public SpyRoom? GetRoom(string roomCode)
        {
            _rooms.TryGetValue(NormalizeRoomCode(roomCode), out var room);
            return room;
        }

        public void MarkDisconnected(string connectionId)
        {
            if (!_playerToRoom.TryRemove(connectionId, out var roomCode)) return;
            if (!_rooms.TryGetValue(roomCode, out var room)) return;

            lock (room)
            {
                var player = room.Players.Values.FirstOrDefault(item => item.ConnectionId == connectionId);
                if (player == null) return;

                player.IsConnected = false;
                player.DisconnectedAt = DateTime.UtcNow;
            }
        }

        public object BuildClientState(SpyRoom room, string connectionId)
        {
            SpyPlayer? currentPlayer;
            lock (room)
            {
                currentPlayer = room.Players.Values.FirstOrDefault(player => player.ConnectionId == connectionId);
                var isCurrentSpy = currentPlayer != null &&
                    !string.IsNullOrWhiteSpace(room.SpyPlayerId) &&
                    string.Equals(currentPlayer.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase);

                var showRevealed = room.RolesRevealed;
                var spyPlayer = showRevealed && !string.IsNullOrWhiteSpace(room.SpyPlayerId) &&
                    room.Players.TryGetValue(room.SpyPlayerId, out var foundSpy)
                        ? foundSpy
                        : null;

                return new
                {
                    roomCode = room.RoomCode,
                    inviteUrl = $"/spy/{room.RoomCode}",
                    currentRound = room.CurrentRound,
                    isRoundActive = room.IsRoundActive,
                    rolesRevealed = room.RolesRevealed,
                    playerId = currentPlayer?.PlayerId,
                    isHost = currentPlayer != null && currentPlayer.IsHost,
                    isSpy = room.IsRoundActive && isCurrentSpy,
                    locationName = room.IsRoundActive && !isCurrentSpy ? room.SelectedLocationName : null,
                    revealedLocationName = showRevealed ? room.SelectedLocationName : null,
                    revealedSpyName = spyPlayer?.Name,
                    players = room.Players.Values
                        .OrderByDescending(player => player.IsHost)
                        .ThenBy(player => player.Name)
                        .Select(player => new
                        {
                            playerId = player.PlayerId,
                            name = player.Name,
                            isHost = player.IsHost,
                            isConnected = player.IsConnected,
                            isSpy = showRevealed &&
                                string.Equals(player.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase)
                        })
                        .ToList()
                };
            }
        }

        public IReadOnlyList<string> GetConnectedConnectionIds(SpyRoom room)
        {
            lock (room)
            {
                return room.Players.Values
                    .Where(player => player.IsConnected && !string.IsNullOrWhiteSpace(player.ConnectionId))
                    .Select(player => player.ConnectionId)
                    .Distinct()
                    .ToList();
            }
        }

        private List<SpyLocation> LoadLocations(string path)
        {
            try
            {
                if (!File.Exists(path))
                {
                    _logger.LogWarning("Spy locations file not found: {Path}", path);
                    return new();
                }

                var json = File.ReadAllText(path);
                return JsonSerializer.Deserialize<List<SpyLocation>>(json, JsonOptions) ?? new();
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to load spy locations from {Path}", path);
                return new();
            }
        }

        private string GenerateRoomCode()
        {
            const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
            for (var attempt = 0; attempt < 20; attempt++)
            {
                var code = new string(Enumerable.Range(0, 5)
                    .Select(_ => chars[_random.Next(chars.Length)])
                    .ToArray());

                if (!_rooms.ContainsKey(code))
                    return code;
            }

            return Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
        }

        private static SpyPlayer CreatePlayer(string connectionId, string playerName, string playerId, bool isHost)
        {
            return new SpyPlayer
            {
                PlayerId = NormalizePlayerId(playerId),
                ConnectionId = connectionId,
                Name = CleanPlayerName(playerName),
                IsHost = isHost,
                IsConnected = true
            };
        }

        private static string NormalizePlayerId(string? playerId)
        {
            return string.IsNullOrWhiteSpace(playerId)
                ? Guid.NewGuid().ToString("N")
                : playerId.Trim();
        }

        private static string NormalizeRoomCode(string? roomCode)
        {
            return (roomCode ?? "").Trim().ToUpperInvariant();
        }

        private static string CleanPlayerName(string? playerName)
        {
            return string.IsNullOrWhiteSpace(playerName)
                ? "Гравець"
                : playerName.Trim()[..Math.Min(playerName.Trim().Length, 32)];
        }

        private static bool IsHost(SpyRoom room, string connectionId)
        {
            var player = room.Players.Values.FirstOrDefault(item => item.ConnectionId == connectionId);
            return player != null && player.IsHost;
        }
    }
}
