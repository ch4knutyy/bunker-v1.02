using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Bunker.Models.Spy;

namespace Bunker.Services;

public sealed class SpyRoomService
{
    public const int SnapshotVersion = 1;
    private const int MaxSnapshots = 20;
    private const int MaxJournalEntries = 50;
    private readonly ConcurrentDictionary<string, SpyRoom> _rooms = new(StringComparer.OrdinalIgnoreCase);
    private readonly ConcurrentDictionary<string, string> _playerToRoom = new();
    private readonly List<SpyLocation> _locations;
    private readonly ILogger<SpyRoomService> _logger;
    private readonly TimeProvider _timeProvider;
    private readonly Random _random = new();

    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true
    };

    public SpyRoomService(IWebHostEnvironment env, ILogger<SpyRoomService> logger, TimeProvider timeProvider)
    {
        _logger = logger;
        _timeProvider = timeProvider;
        _locations = LoadLocations(Path.Combine(env.WebRootPath, "data", "Spy_Locations", "spy_locations.json"));
    }

    public SpyRoom CreateRoom(string connectionId, string playerName, string playerId, string? language = null)
    {
        var room = new SpyRoom
        {
            RoomCode = GenerateRoomCode(),
            HostPlayerId = NormalizePlayerId(playerId),
            CreatedAt = UtcNow()
        };
        var host = CreatePlayer(connectionId, playerName, room.HostPlayerId, isHost: true, language: language);
        room.Players[host.PlayerId] = host;
        _rooms[room.RoomCode] = room;
        _playerToRoom[connectionId] = room.RoomCode;
        AppendEvent(room, "room_created", host.PlayerId, "spyEventRoomCreated");
        CreateSnapshot(room, host.PlayerId, "spySnapshotRoomCreated", "room-created");
        return room;
    }

    public SpyActionResult JoinRoom(
        string roomCode,
        string connectionId,
        string playerName,
        string playerId,
        string? language = null)
    {
        roomCode = NormalizeRoomCode(roomCode);
        if (!_rooms.TryGetValue(roomCode, out var room))
            return SpyActionResult.Fail("spyErrorRoomNotFound");

        var normalizedPlayerId = NormalizePlayerId(playerId);
        lock (room)
        {
            if (room.Players.TryGetValue(normalizedPlayerId, out var existing))
            {
                if (!string.IsNullOrWhiteSpace(existing.ConnectionId))
                    _playerToRoom.TryRemove(existing.ConnectionId, out _);
                existing.ConnectionId = connectionId;
                existing.Name = CleanPlayerName(playerName);
                existing.Language = NormalizeLanguage(language);
                existing.IsConnected = true;
                existing.DisconnectedAt = null;
                _playerToRoom[connectionId] = room.RoomCode;
                AppendEvent(room, "player_reconnected", existing.PlayerId, "spyEventPlayerReconnected", playerName: existing.Name);
                return SpyActionResult.Ok(room);
            }

            if (room.IsRoundActive)
                return SpyActionResult.Fail("spyErrorRoundAlreadyActive", room);

            var player = CreatePlayer(
                connectionId,
                playerName,
                normalizedPlayerId,
                isHost: false,
                language: language);
            room.Players[player.PlayerId] = player;
            _playerToRoom[connectionId] = room.RoomCode;
            AppendEvent(room, "player_joined", player.PlayerId, "spyEventPlayerJoined", playerName: player.Name);
            CreateSnapshot(room, player.PlayerId, "spySnapshotParticipants", $"join-{player.PlayerId}");
            return SpyActionResult.Ok(room);
        }
    }

    public SpyActionResult SetReady(string connectionId, bool isReady, string? commandId)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyActionResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var player = FindByConnection(room, connectionId);
            if (player == null) return SpyActionResult.Fail("spyErrorPlayerNotFound", room);
            if (room.IsRoundActive) return SpyActionResult.Fail("spyErrorRoundAlreadyActive", room);
            if (!RememberCommand(room, commandId)) return SpyActionResult.Duplicate(room);
            player.IsReady = isReady;
            AppendEvent(room, "ready_changed", player.PlayerId,
                isReady ? "spyEventPlayerReady" : "spyEventPlayerNotReady", commandId: commandId, playerName: player.Name);
            return SpyActionResult.Ok(room);
        }
    }

    public SpyActionResult UpdateSettings(
        string connectionId,
        int roundDurationSeconds,
        int minimumPlayers,
        string? commandId)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyActionResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var actor = FindByConnection(room, connectionId);
            if (!IsHost(room, actor)) return SpyActionResult.Fail("spyErrorHostOnly", room);
            if (room.IsRoundActive) return SpyActionResult.Fail("spyErrorRoundAlreadyActive", room);
            if (roundDurationSeconds is < 60 or > 3600 || minimumPlayers is < 3 or > 20)
                return SpyActionResult.Fail("spyErrorInvalidSettings", room);
            if (!RememberCommand(room, commandId)) return SpyActionResult.Duplicate(room);
            room.RoundDurationSeconds = roundDurationSeconds;
            room.MinimumPlayers = minimumPlayers;
            foreach (var player in room.Players.Values)
                player.IsReady = false;
            AppendEvent(room, "settings_changed", actor!.PlayerId, "spyEventSettingsChanged", commandId: commandId);
            CreateSnapshot(room, actor.PlayerId, "spySnapshotSettings", commandId);
            return SpyActionResult.Ok(room);
        }
    }

    public SpyActionResult StartRound(string connectionId, string? commandId)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyActionResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var actor = FindByConnection(room, connectionId);
            if (!IsHost(room, actor)) return SpyActionResult.Fail("spyErrorHostOnly", room);
            if (room.IsRoundActive) return SpyActionResult.Fail("spyErrorRoundAlreadyActive", room);
            var activePlayers = room.Players.Values.Where(player => player.IsConnected).ToList();
            if (activePlayers.Count < room.MinimumPlayers)
                return SpyActionResult.Fail("spyErrorMinimumPlayers", room);
            if (activePlayers.Any(player => !player.IsReady))
                return SpyActionResult.Fail("spyErrorEveryoneMustBeReady", room);
            if (!RememberCommand(room, commandId)) return SpyActionResult.Duplicate(room);

            CreateSnapshot(room, actor!.PlayerId, "spySnapshotBeforeRound", $"{commandId}-before");
            var location = _locations.Count > 0
                ? _locations[_random.Next(_locations.Count)]
                : new SpyLocation
                {
                    Id = "fallback_location",
                    Localization = new() { ["uk"] = new() { Name = "Лікарня" } }
                };
            var spy = activePlayers[_random.Next(activePlayers.Count)];
            var now = UtcNow();
            room.CurrentRound++;
            room.RoundId = Guid.NewGuid().ToString("N");
            room.IsRoundActive = true;
            room.RolesRevealed = false;
            room.SelectedLocationId = location.Id;
            room.SelectedLocationName = location.GetName("uk");
            room.SpyPlayerId = spy.PlayerId;
            room.RoundStartedAt = now;
            room.RoundEndsAtUtc = now.AddSeconds(room.RoundDurationSeconds);
            room.SpyGuessUsed = false;
            room.RoundResult = null;
            foreach (var player in room.Players.Values)
            {
                player.VoteTargetPlayerId = null;
                player.IsReady = false;
            }
            AppendEvent(room, "round_started", actor.PlayerId, "spyEventRoundStarted", commandId: commandId);
            CreateSnapshot(room, actor.PlayerId, "spySnapshotRoundStarted", $"{commandId}-after");
            return SpyActionResult.Ok(room);
        }
    }

    public SpyActionResult EndRound(string connectionId, string? commandId)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyActionResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var actor = FindByConnection(room, connectionId);
            if (!IsHost(room, actor)) return SpyActionResult.Fail("spyErrorHostOnly", room);
            if (!room.IsRoundActive) return SpyActionResult.Fail("spyErrorNoActiveRound", room);
            if (!RememberCommand(room, commandId)) return SpyActionResult.Duplicate(room);
            CreateSnapshot(room, actor!.PlayerId, "spySnapshotBeforeRound", $"{commandId}-before");
            CompleteRound(room, "host_ended", "none", actor.PlayerId, commandId);
            CreateSnapshot(room, actor.PlayerId, "spySnapshotRoundEnded", $"{commandId}-after");
            return SpyActionResult.Ok(room);
        }
    }

    public SpyActionResult ReturnToLobby(string connectionId, string? commandId, bool confirmed)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyActionResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var actor = FindByConnection(room, connectionId);
            if (!IsHost(room, actor)) return SpyActionResult.Fail("spyErrorHostOnly", room);
            if (!confirmed) return SpyActionResult.Fail("spyErrorConfirmationRequired", room);
            if (!RememberCommand(room, commandId)) return SpyActionResult.Duplicate(room);
            CreateSnapshot(room, actor!.PlayerId, "spySnapshotBeforeRound", $"{commandId}-before");
            room.IsRoundActive = false;
            room.RolesRevealed = false;
            room.SelectedLocationId = null;
            room.SelectedLocationName = null;
            room.SpyPlayerId = null;
            room.RoundStartedAt = null;
            room.RoundEndsAtUtc = null;
            room.RoundId = null;
            room.SpyGuessUsed = false;
            room.RoundResult = null;
            foreach (var player in room.Players.Values)
            {
                player.IsReady = false;
                player.VoteTargetPlayerId = null;
            }
            AppendEvent(room, "returned_to_lobby", actor.PlayerId, "spyEventReturnedToLobby", commandId: commandId);
            CreateSnapshot(room, actor.PlayerId, "spySnapshotLobby", $"{commandId}-after");
            return SpyActionResult.Ok(room);
        }
    }

    public SpyActionResult Vote(string connectionId, string targetPlayerId, string? commandId)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyActionResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var voter = FindByConnection(room, connectionId);
            if (voter == null || !voter.IsConnected) return SpyActionResult.Fail("spyErrorPlayerNotFound", room);
            if (!room.IsRoundActive) return SpyActionResult.Fail("spyErrorNoActiveRound", room);
            if (!room.Players.TryGetValue(NormalizePlayerId(targetPlayerId), out var target) || !target.IsConnected)
                return SpyActionResult.Fail("spyErrorInvalidVoteTarget", room);
            if (string.Equals(voter.PlayerId, target.PlayerId, StringComparison.OrdinalIgnoreCase))
                return SpyActionResult.Fail("spyErrorCannotVoteSelf", room);
            if (!RememberCommand(room, commandId)) return SpyActionResult.Duplicate(room);
            voter.VoteTargetPlayerId = target.PlayerId;
            AppendEvent(room, "vote_cast", voter.PlayerId, "spyEventVoteCast", target.PlayerId, commandId, voter.Name);

            var activePlayers = room.Players.Values.Where(player => player.IsConnected).ToList();
            var votesForTarget = activePlayers.Count(player =>
                string.Equals(player.VoteTargetPlayerId, target.PlayerId, StringComparison.OrdinalIgnoreCase));
            if (votesForTarget > activePlayers.Count / 2)
            {
                var accusedSpy = string.Equals(target.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase);
                CreateSnapshot(room, voter.PlayerId, "spySnapshotBeforeRound", $"{commandId}-before-complete");
                CompleteRound(room, accusedSpy ? "spy_identified" : "wrong_accusation",
                    accusedSpy ? "agents" : "spy", voter.PlayerId, commandId, target.PlayerId);
                CreateSnapshot(room, voter.PlayerId, "spySnapshotRoundEnded", $"{commandId}-after-complete");
            }
            return SpyActionResult.Ok(room);
        }
    }

    public SpyActionResult GuessLocation(string connectionId, string locationId, string? commandId, bool confirmed)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyActionResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var actor = FindByConnection(room, connectionId);
            if (actor == null || !string.Equals(actor.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase))
                return SpyActionResult.Fail("spyErrorSpyOnly", room);
            if (!room.IsRoundActive) return SpyActionResult.Fail("spyErrorNoActiveRound", room);
            if (!confirmed) return SpyActionResult.Fail("spyErrorConfirmationRequired", room);
            if (room.SpyGuessUsed) return SpyActionResult.Fail("spyErrorGuessAlreadyUsed", room);
            var location = _locations.FirstOrDefault(item =>
                string.Equals(item.Id, locationId, StringComparison.OrdinalIgnoreCase));
            if (location == null) return SpyActionResult.Fail("spyErrorInvalidLocation", room);
            if (!RememberCommand(room, commandId)) return SpyActionResult.Duplicate(room);
            room.SpyGuessUsed = true;
            CreateSnapshot(room, actor.PlayerId, "spySnapshotBeforeRound", $"{commandId}-before");
            var correct = string.Equals(location.Id, room.SelectedLocationId, StringComparison.OrdinalIgnoreCase);
            AppendEvent(room, "spy_guess", actor.PlayerId, "spyEventGuessMade", commandId: commandId, playerName: actor.Name);
            CompleteRound(room, correct ? "spy_guessed_location" : "spy_guess_failed",
                correct ? "spy" : "agents", actor.PlayerId, commandId, guessedLocationId: location.Id);
            CreateSnapshot(room, actor.PlayerId, "spySnapshotRoundEnded", $"{commandId}-after");
            return SpyActionResult.Ok(room);
        }
    }

    public SpyKickResult KickPlayer(string connectionId, string targetPlayerId, string? commandId)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyKickResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var actor = FindByConnection(room, connectionId);
            if (!IsHost(room, actor)) return SpyKickResult.Fail("spyErrorHostOnly", room);
            if (!room.Players.TryGetValue(NormalizePlayerId(targetPlayerId), out var target) || !target.IsConnected)
                return SpyKickResult.Fail("spyErrorPlayerNotFound", room);
            if (target.IsHost || string.Equals(target.PlayerId, actor!.PlayerId, StringComparison.OrdinalIgnoreCase))
                return SpyKickResult.Fail("spyErrorCannotKickSelf", room);
            if (!RememberCommand(room, commandId)) return SpyKickResult.Duplicate(room);

            CreateSnapshot(room, actor.PlayerId, "spySnapshotBeforeKick", $"{commandId}-before");
            var targetConnectionId = target.ConnectionId;
            room.Players.Remove(target.PlayerId);
            _playerToRoom.TryRemove(targetConnectionId, out _);
            foreach (var player in room.Players.Values.Where(player =>
                         string.Equals(player.VoteTargetPlayerId, target.PlayerId, StringComparison.OrdinalIgnoreCase)))
                player.VoteTargetPlayerId = null;
            AppendEvent(room, "player_kicked", actor.PlayerId, "spyEventPlayerKicked",
                target.PlayerId, commandId, target.Name);
            if (room.IsRoundActive &&
                (string.Equals(target.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase) ||
                 room.Players.Values.Count(player => player.IsConnected) < room.MinimumPlayers))
                CompleteRound(room, "insufficient_players", "none", actor.PlayerId, commandId);
            CreateSnapshot(room, actor.PlayerId, "spySnapshotAfterKick", $"{commandId}-after");
            return new(true, false, null, room, targetConnectionId, target.Name);
        }
    }

    public SpyLeaveResult LeaveRoom(string connectionId, string? commandId)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpyLeaveResult.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            var player = FindByConnection(room, connectionId);
            if (player == null) return SpyLeaveResult.Fail("spyErrorPlayerNotFound", room);
            if (!RememberCommand(room, commandId)) return SpyLeaveResult.Duplicate(room);
            room.Players.Remove(player.PlayerId);
            _playerToRoom.TryRemove(connectionId, out _);
            if (player.IsHost && room.Players.Count > 0)
            {
                var nextHost = room.Players.Values
                    .OrderByDescending(item => item.IsConnected)
                    .ThenBy(item => item.Name)
                    .First();
                nextHost.IsHost = true;
                room.HostPlayerId = nextHost.PlayerId;
            }
            foreach (var other in room.Players.Values.Where(other =>
                         string.Equals(other.VoteTargetPlayerId, player.PlayerId, StringComparison.OrdinalIgnoreCase)))
                other.VoteTargetPlayerId = null;
            AppendEvent(room, "player_left", player.PlayerId, "spyEventPlayerLeft", playerName: player.Name);
            if (room.Players.Count == 0)
                _rooms.TryRemove(room.RoomCode, out _);
            else if (room.IsRoundActive &&
                     (string.Equals(player.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase) ||
                      room.Players.Values.Count(item => item.IsConnected) < room.MinimumPlayers))
                CompleteRound(room, "insufficient_players", "none", player.PlayerId, commandId);
            return new(true, false, null, room, player.Name);
        }
    }

    public SpySnapshotPreview PreviewRestore(string connectionId, string snapshotId)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return SpySnapshotPreview.Fail("spyErrorRoomNotFound");
        lock (room)
        {
            if (!IsHost(room, FindByConnection(room, connectionId)))
                return SpySnapshotPreview.Fail("spyErrorHostOnly");
            var snapshot = room.SnapshotHistory.FirstOrDefault(item =>
                string.Equals(item.Id, snapshotId, StringComparison.OrdinalIgnoreCase));
            if (snapshot == null) return SpySnapshotPreview.Fail("spyErrorSnapshotNotFound");
            var validation = ValidateSnapshot(room, snapshot);
            return new(
                snapshot.Id,
                validation.CanRestore,
                validation.ErrorCode,
                BuildSnapshotChanges(room, snapshot.State),
                snapshot.Fingerprint,
                snapshot.Version);
        }
    }

    public SpyRestoreResult RestoreSnapshot(
        string connectionId,
        string snapshotId,
        string? commandId,
        bool confirmed,
        bool activeRoundConfirmed)
    {
        var room = GetPlayerRoom(connectionId);
        if (room == null) return new(false, false, "spyErrorRoomNotFound", null, null);
        lock (room)
        {
            var actor = FindByConnection(room, connectionId);
            if (!IsHost(room, actor))
                return new(false, false, "spyErrorHostOnly", null, null);
            if (!confirmed || string.IsNullOrWhiteSpace(commandId) || (room.IsRoundActive && !activeRoundConfirmed))
                return new(false, false, "spyErrorConfirmationRequired", null, null);
            if (room.RestoreCommandResults.TryGetValue(commandId, out var prior))
                return prior with { IsDuplicate = true };
            if (!RememberCommand(room, commandId))
                return new(false, true, "spyErrorDuplicateCommand", null, null);

            var snapshot = room.SnapshotHistory.FirstOrDefault(item =>
                string.Equals(item.Id, snapshotId, StringComparison.OrdinalIgnoreCase));
            if (snapshot == null)
                return CacheRestore(room, commandId, new(false, false, "spyErrorSnapshotNotFound", null, null));
            var validation = ValidateSnapshot(room, snapshot);
            if (!validation.CanRestore)
                return CacheRestore(room, commandId, new(false, false, validation.ErrorCode, null, null));

            var safety = CreateSnapshot(room, actor!.PlayerId, "spySnapshotSafety", $"{commandId}-safety", snapshot.Id);
            ApplySnapshotState(room, snapshot.State);
            AppendEvent(room, "snapshot_restored", actor.PlayerId, "spyEventSnapshotRestored", commandId: commandId);
            var result = new SpyRestoreResult(true, false, null, snapshot.Id, safety.Id);
            return CacheRestore(room, commandId, result);
        }
    }

    public SpyRoom? GetPlayerRoom(string connectionId) =>
        _playerToRoom.TryGetValue(connectionId, out var roomCode) ? GetRoom(roomCode) : null;

    public SpyRoom? GetRoom(string roomCode)
    {
        _rooms.TryGetValue(NormalizeRoomCode(roomCode), out var room);
        return room;
    }

    public IReadOnlyList<SpyRoom> CompleteExpiredRounds()
    {
        var completed = new List<SpyRoom>();
        var now = UtcNow();
        foreach (var room in _rooms.Values)
        {
            lock (room)
            {
                if (!room.IsRoundActive || room.RoundEndsAtUtc is not { } endsAt || endsAt > now)
                    continue;
                var commandId = $"timer-{room.RoundId}";
                if (!RememberCommand(room, commandId))
                    continue;
                CreateSnapshot(room, "system", "spySnapshotBeforeRound", $"{commandId}-before");
                CompleteRound(room, "time_expired", "spy", "system", commandId);
                CreateSnapshot(room, "system", "spySnapshotRoundEnded", $"{commandId}-after");
                completed.Add(room);
            }
        }
        return completed;
    }

    public void MarkDisconnected(string connectionId)
    {
        if (!_playerToRoom.TryRemove(connectionId, out var roomCode) || !_rooms.TryGetValue(roomCode, out var room))
            return;
        lock (room)
        {
            var player = FindByConnection(room, connectionId);
            if (player == null) return;
            player.IsConnected = false;
            player.DisconnectedAt = UtcNow();
            AppendEvent(room, "player_disconnected", player.PlayerId, "spyEventPlayerDisconnected", playerName: player.Name);
        }
    }

    public object BuildClientState(SpyRoom room, string connectionId)
    {
        lock (room)
        {
            var currentPlayer = FindByConnection(room, connectionId);
            var isCurrentSpy = currentPlayer != null &&
                string.Equals(currentPlayer.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase);
            var showRevealed = room.RolesRevealed || room.RoundResult != null;
            var spyPlayer = showRevealed && !string.IsNullOrWhiteSpace(room.SpyPlayerId) &&
                            room.Players.TryGetValue(room.SpyPlayerId, out var foundSpy)
                ? foundSpy
                : null;
            var activePlayers = room.Players.Values.Where(player => player.IsConnected).ToList();
            var voteProgress = activePlayers
                .Where(player => !string.IsNullOrWhiteSpace(player.VoteTargetPlayerId))
                .GroupBy(player => player.VoteTargetPlayerId!, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(group => group.Key, group => group.Count(), StringComparer.OrdinalIgnoreCase);
            var remainingSeconds = room.IsRoundActive && room.RoundEndsAtUtc is { } endsAt
                ? Math.Max(0, (int)Math.Ceiling((endsAt - UtcNow()).TotalSeconds))
                : 0;

            return new
            {
                roomCode = room.RoomCode,
                inviteUrl = $"/spy/{room.RoomCode}",
                currentRound = room.CurrentRound,
                roundId = room.RoundId,
                isRoundActive = room.IsRoundActive,
                rolesRevealed = showRevealed,
                playerId = currentPlayer?.PlayerId,
                isHost = IsHost(room, currentPlayer),
                isReady = currentPlayer?.IsReady ?? false,
                isSpy = room.IsRoundActive && isCurrentSpy,
                canStart = IsHost(room, currentPlayer) && !room.IsRoundActive &&
                           activePlayers.Count >= room.MinimumPlayers && activePlayers.All(player => player.IsReady),
                locationName = room.IsRoundActive && !isCurrentSpy
                    ? GetLocationName(room.SelectedLocationId, currentPlayer?.Language, room.SelectedLocationName)
                    : null,
                revealedLocationName = showRevealed
                    ? GetLocationName(room.SelectedLocationId, currentPlayer?.Language, room.SelectedLocationName)
                    : null,
                revealedSpyName = spyPlayer?.Name,
                remainingSeconds,
                roundEndsAtUtc = room.RoundEndsAtUtc,
                settings = new { room.RoundDurationSeconds, room.MinimumPlayers },
                availableLocations = room.IsRoundActive && isCurrentSpy && !room.SpyGuessUsed
                    ? _locations.Select(location => new
                    {
                        id = location.Id,
                        name = location.GetName(currentPlayer?.Language ?? "uk")
                    }).ToList()
                    : null,
                spyGuessUsed = room.SpyGuessUsed,
                roundResult = room.RoundResult == null ? null : new
                {
                    room.RoundResult.Reason,
                    room.RoundResult.Winner,
                    accusedPlayerName = room.RoundResult.AccusedPlayerId is { } accusedId &&
                                        room.Players.TryGetValue(accusedId, out var accused)
                        ? accused.Name
                        : null
                },
                voteProgress,
                players = room.Players.Values
                    .OrderByDescending(player => player.IsHost)
                    .ThenBy(player => player.Name)
                    .Select(player => new
                    {
                        playerId = player.PlayerId,
                        name = player.Name,
                        isHost = player.IsHost,
                        isCurrentPlayer = currentPlayer != null &&
                                          string.Equals(player.PlayerId, currentPlayer.PlayerId, StringComparison.OrdinalIgnoreCase),
                        isConnected = player.IsConnected,
                        isReady = player.IsReady,
                        score = player.Score,
                        voteCount = voteProgress.GetValueOrDefault(player.PlayerId),
                        isSpy = showRevealed &&
                                string.Equals(player.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase)
                    })
                    .ToList(),
                journal = room.Journal.OrderByDescending(entry => entry.CreatedAtUtc).Take(20).Select(entry => new
                {
                    entry.Id,
                    entry.CreatedAtUtc,
                    entry.Type,
                    entry.MessageKey,
                    entry.PlayerName
                }),
                snapshots = IsHost(room, currentPlayer)
                    ? GetSnapshotMetadata(room)
                    : null
            };
        }
    }

    public IReadOnlyList<string> GetConnectedConnectionIds(SpyRoom room)
    {
        lock (room)
            return room.Players.Values
                .Where(player => player.IsConnected && !string.IsNullOrWhiteSpace(player.ConnectionId))
                .Select(player => player.ConnectionId)
                .Distinct()
                .ToList();
    }

    private void CompleteRound(
        SpyRoom room,
        string reason,
        string winner,
        string actorPlayerId,
        string? commandId,
        string? accusedPlayerId = null,
        string? guessedLocationId = null)
    {
        if (!room.IsRoundActive || room.RoundResult != null) return;
        room.IsRoundActive = false;
        room.RolesRevealed = true;
        room.RoundEndsAtUtc = null;
        room.RoundResult = new SpyRoundResult
        {
            Reason = reason,
            Winner = winner,
            AccusedPlayerId = accusedPlayerId,
            GuessedLocationId = guessedLocationId,
            CompletedAtUtc = UtcNow()
        };
        if (winner == "spy" && room.SpyPlayerId is { } spyId && room.Players.TryGetValue(spyId, out var spy))
            spy.Score += 2;
        else if (winner == "agents")
            foreach (var player in room.Players.Values.Where(player =>
                         !string.Equals(player.PlayerId, room.SpyPlayerId, StringComparison.OrdinalIgnoreCase)))
                player.Score++;
        AppendEvent(room, "round_completed", actorPlayerId, "spyEventRoundCompleted", commandId: commandId);
    }

    private SpySnapshot CreateSnapshot(
        SpyRoom room,
        string actorPlayerId,
        string description,
        string? relatedCommandId,
        string? protectedSnapshotId = null)
    {
        if (!string.IsNullOrWhiteSpace(relatedCommandId))
        {
            var existing = room.SnapshotHistory.LastOrDefault(snapshot =>
                string.Equals(snapshot.RelatedCommandId, relatedCommandId, StringComparison.OrdinalIgnoreCase));
            if (existing != null) return existing;
        }
        var state = CaptureSnapshotState(room);
        var snapshot = new SpySnapshot
        {
            RoomId = room.RoomCode,
            CreatedAtUtc = UtcNow(),
            CreatedByPlayerId = SafeToken(actorPlayerId),
            Description = description.Length > 120 ? description[..120] : description,
            RelatedCommandId = relatedCommandId,
            HostTopologyPlayerId = room.HostPlayerId,
            PlayerTopologyIds = room.Players.Keys.OrderBy(id => id, StringComparer.OrdinalIgnoreCase).ToList(),
            State = state,
            Fingerprint = Fingerprint(state)
        };
        room.SnapshotHistory.Add(snapshot);
        while (room.SnapshotHistory.Count > MaxSnapshots)
        {
            var removable = room.SnapshotHistory.FirstOrDefault(item =>
                !string.Equals(item.Id, protectedSnapshotId, StringComparison.OrdinalIgnoreCase));
            if (removable == null) break;
            room.SnapshotHistory.Remove(removable);
        }
        return snapshot;
    }

    private SpySnapshotState CaptureSnapshotState(SpyRoom room) => new()
    {
        CurrentRound = room.CurrentRound,
        IsRoundActive = room.IsRoundActive,
        SelectedLocationId = room.SelectedLocationId,
        SelectedLocationName = room.SelectedLocationName,
        SpyPlayerId = room.SpyPlayerId,
        RoundStartedAt = room.RoundStartedAt,
        RoundEndsAtUtc = room.RoundEndsAtUtc,
        RoundRemainingSeconds = room.IsRoundActive && room.RoundEndsAtUtc is { } endsAt
            ? Math.Max(0, (int)Math.Ceiling((endsAt - UtcNow()).TotalSeconds))
            : null,
        RoundDurationSeconds = room.RoundDurationSeconds,
        MinimumPlayers = room.MinimumPlayers,
        RolesRevealed = room.RolesRevealed,
        RoundId = room.RoundId,
        SpyGuessUsed = room.SpyGuessUsed,
        RoundResult = Clone(room.RoundResult),
        Players = room.Players.Values.Select(player => new SpyPlayerSnapshot
        {
            PlayerId = player.PlayerId,
            Name = player.Name,
            IsHost = player.IsHost,
            IsReady = player.IsReady,
            VoteTargetPlayerId = player.VoteTargetPlayerId,
            Score = player.Score
        }).OrderBy(player => player.PlayerId, StringComparer.OrdinalIgnoreCase).ToList()
    };

    private void ApplySnapshotState(SpyRoom room, SpySnapshotState state)
    {
        room.CurrentRound = state.CurrentRound;
        room.IsRoundActive = state.IsRoundActive;
        room.SelectedLocationId = state.SelectedLocationId;
        room.SelectedLocationName = state.SelectedLocationName;
        room.SpyPlayerId = state.SpyPlayerId;
        room.RoundStartedAt = state.RoundStartedAt;
        room.RoundEndsAtUtc = state.IsRoundActive && state.RoundRemainingSeconds is { } remaining
            ? UtcNow().AddSeconds(Math.Max(0, remaining))
            : state.RoundEndsAtUtc;
        room.RoundDurationSeconds = state.RoundDurationSeconds;
        room.MinimumPlayers = state.MinimumPlayers;
        room.RolesRevealed = state.RolesRevealed;
        room.RoundId = state.RoundId;
        room.SpyGuessUsed = state.SpyGuessUsed;
        room.RoundResult = Clone(state.RoundResult);
        foreach (var playerState in state.Players)
        {
            if (!room.Players.TryGetValue(playerState.PlayerId, out var player)) continue;
            player.Name = playerState.Name;
            player.IsHost = playerState.IsHost;
            player.IsReady = playerState.IsReady;
            player.VoteTargetPlayerId = playerState.VoteTargetPlayerId;
            player.Score = playerState.Score;
        }
    }

    private static (bool CanRestore, string? ErrorCode) ValidateSnapshot(SpyRoom room, SpySnapshot snapshot)
    {
        if (snapshot.Version != SnapshotVersion) return (false, "spyErrorSnapshotVersion");
        if (!string.Equals(snapshot.Scope, "Spy", StringComparison.Ordinal) ||
            !string.Equals(snapshot.RoomId, room.RoomCode, StringComparison.OrdinalIgnoreCase))
            return (false, "spyErrorSnapshotScope");
        if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(snapshot.Fingerprint),
                Encoding.UTF8.GetBytes(Fingerprint(snapshot.State))))
            return (false, "spyErrorSnapshotFingerprint");
        if (!string.Equals(snapshot.HostTopologyPlayerId, room.HostPlayerId, StringComparison.OrdinalIgnoreCase))
            return (false, "spyErrorHostTopologyChanged");
        var currentIds = room.Players.Keys.OrderBy(id => id, StringComparer.OrdinalIgnoreCase);
        if (!currentIds.SequenceEqual(snapshot.PlayerTopologyIds.OrderBy(id => id, StringComparer.OrdinalIgnoreCase),
                StringComparer.OrdinalIgnoreCase))
            return (false, "spyErrorPlayerTopologyChanged");
        return (true, null);
    }

    private static IReadOnlyList<string> BuildSnapshotChanges(SpyRoom room, SpySnapshotState state)
    {
        var changes = new List<string>();
        if (room.CurrentRound != state.CurrentRound || room.IsRoundActive != state.IsRoundActive ||
            room.RoundId != state.RoundId) changes.Add("round");
        if (room.RoundStartedAt != state.RoundStartedAt || room.RoundEndsAtUtc != state.RoundEndsAtUtc)
            changes.Add("timer");
        if (room.SelectedLocationId != state.SelectedLocationId || room.SpyPlayerId != state.SpyPlayerId)
            changes.Add("secret_assignment");
        if (room.RoundDurationSeconds != state.RoundDurationSeconds || room.MinimumPlayers != state.MinimumPlayers)
            changes.Add("settings");
        if (room.Players.Values.Any(player =>
        {
            var saved = state.Players.FirstOrDefault(snapshot =>
                string.Equals(snapshot.PlayerId, player.PlayerId, StringComparison.OrdinalIgnoreCase));
            return saved == null || saved.IsReady != player.IsReady ||
                   saved.VoteTargetPlayerId != player.VoteTargetPlayerId || saved.Score != player.Score;
        })) changes.Add("participants");
        if (JsonSerializer.Serialize(room.RoundResult) != JsonSerializer.Serialize(state.RoundResult))
            changes.Add("result");
        return changes;
    }

    private static IReadOnlyList<object> GetSnapshotMetadata(SpyRoom room) =>
        room.SnapshotHistory.OrderByDescending(snapshot => snapshot.CreatedAtUtc).Select(snapshot =>
        {
            var validation = ValidateSnapshot(room, snapshot);
            return (object)new
            {
                snapshot.Id,
                snapshot.Scope,
                snapshot.RoomId,
                snapshot.CreatedAtUtc,
                snapshot.CreatedByPlayerId,
                snapshot.Version,
                snapshot.Description,
                canRestore = validation.CanRestore,
                blockedReason = validation.ErrorCode
            };
        }).ToList();

    private static SpyRestoreResult CacheRestore(SpyRoom room, string commandId, SpyRestoreResult result)
    {
        room.RestoreCommandResults[commandId] = result;
        return result;
    }

    private static string Fingerprint(SpySnapshotState state)
    {
        var json = JsonSerializer.Serialize(state, JsonOptions);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
    }

    private static T? Clone<T>(T? value) =>
        value == null ? default : JsonSerializer.Deserialize<T>(JsonSerializer.Serialize(value, JsonOptions), JsonOptions);

    private void AppendEvent(
        SpyRoom room,
        string type,
        string actorPlayerId,
        string messageKey,
        string? targetPlayerId = null,
        string? commandId = null,
        string? playerName = null)
    {
        room.Journal.Add(new SpyGameEvent
        {
            CreatedAtUtc = UtcNow(),
            Type = type,
            ActorPlayerId = SafeToken(actorPlayerId),
            TargetPlayerId = string.IsNullOrWhiteSpace(targetPlayerId) ? null : SafeToken(targetPlayerId),
            CommandId = string.IsNullOrWhiteSpace(commandId) ? null : commandId,
            MessageKey = messageKey,
            PlayerName = playerName
        });
        if (room.Journal.Count > MaxJournalEntries)
            room.Journal.RemoveRange(0, room.Journal.Count - MaxJournalEntries);
    }

    private List<SpyLocation> LoadLocations(string path)
    {
        try
        {
            if (!File.Exists(path))
            {
                _logger.LogWarning("Spy locations file not found: {Path}", path);
                return [];
            }
            return JsonSerializer.Deserialize<List<SpyLocation>>(File.ReadAllText(path), JsonOptions) ?? [];
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to load spy locations from {Path}", path);
            return [];
        }
    }

    private string GenerateRoomCode()
    {
        const string chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
        for (var attempt = 0; attempt < 20; attempt++)
        {
            var code = new string(Enumerable.Range(0, 5)
                .Select(_ => chars[_random.Next(chars.Length)]).ToArray());
            if (!_rooms.ContainsKey(code)) return code;
        }
        return Guid.NewGuid().ToString("N")[..6].ToUpperInvariant();
    }

    private DateTime UtcNow() => _timeProvider.GetUtcNow().UtcDateTime;

    private string GetLocationName(string? locationId, string? language, string? fallbackName = null) =>
        _locations.FirstOrDefault(location =>
            string.Equals(location.Id, locationId, StringComparison.OrdinalIgnoreCase))
            ?.GetName(NormalizeLanguage(language)) ?? fallbackName ?? "";

    private static SpyPlayer CreatePlayer(
        string connectionId,
        string playerName,
        string playerId,
        bool isHost,
        string? language) => new()
    {
        PlayerId = NormalizePlayerId(playerId),
        ConnectionId = connectionId,
        Name = CleanPlayerName(playerName),
        Language = NormalizeLanguage(language),
        IsHost = isHost,
        IsConnected = true
    };

    private static SpyPlayer? FindByConnection(SpyRoom room, string connectionId) =>
        room.Players.Values.FirstOrDefault(player =>
            string.Equals(player.ConnectionId, connectionId, StringComparison.Ordinal));

    private static bool IsHost(SpyRoom room, SpyPlayer? player) =>
        player != null && player.IsHost &&
        string.Equals(player.PlayerId, room.HostPlayerId, StringComparison.OrdinalIgnoreCase);

    private static bool RememberCommand(SpyRoom room, string? commandId) =>
        !string.IsNullOrWhiteSpace(commandId) && room.ProcessedCommandIds.Add(commandId.Trim());

    private static string NormalizePlayerId(string? playerId) =>
        string.IsNullOrWhiteSpace(playerId) ? Guid.NewGuid().ToString("N") : playerId.Trim();

    private static string NormalizeRoomCode(string? roomCode) => (roomCode ?? "").Trim().ToUpperInvariant();

    private static string NormalizeLanguage(string? language) =>
        language is "en" or "ru" ? language : "uk";

    private static string CleanPlayerName(string? playerName)
    {
        if (string.IsNullOrWhiteSpace(playerName)) return "Гравець";
        var clean = new string(playerName.Trim().Where(character => !char.IsControl(character)).ToArray());
        return clean[..Math.Min(clean.Length, 32)];
    }

    private static string SafeToken(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "unknown";
        var clean = new string(value.Where(character => char.IsLetterOrDigit(character) || character is '-' or '_').ToArray());
        return string.IsNullOrWhiteSpace(clean) ? "unknown" : clean[..Math.Min(clean.Length, 128)];
    }
}

public sealed record SpyActionResult(bool Success, bool IsDuplicate, string? Error, SpyRoom? Room)
{
    public static SpyActionResult Ok(SpyRoom room) => new(true, false, null, room);
    public static SpyActionResult Duplicate(SpyRoom room) => new(true, true, null, room);
    public static SpyActionResult Fail(string error, SpyRoom? room = null) => new(false, false, error, room);
}

public sealed record SpyKickResult(
    bool Success,
    bool IsDuplicate,
    string? Error,
    SpyRoom? Room,
    string? TargetConnectionId,
    string? PlayerName)
{
    public static SpyKickResult Duplicate(SpyRoom room) => new(true, true, null, room, null, null);
    public static SpyKickResult Fail(string error, SpyRoom? room = null) => new(false, false, error, room, null, null);
}

public sealed record SpyLeaveResult(
    bool Success,
    bool IsDuplicate,
    string? Error,
    SpyRoom? Room,
    string? PlayerName)
{
    public static SpyLeaveResult Duplicate(SpyRoom room) => new(true, true, null, room, null);
    public static SpyLeaveResult Fail(string error, SpyRoom? room = null) => new(false, false, error, room, null);
}

public sealed record SpySnapshotPreview(
    string? SnapshotId,
    bool CanRestore,
    string? BlockedReason,
    IReadOnlyList<string> ChangedCategories,
    string? Fingerprint,
    int? Version)
{
    public static SpySnapshotPreview Fail(string error) => new(null, false, error, [], null, null);
}
