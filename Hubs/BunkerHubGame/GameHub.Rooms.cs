using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Bunker.Hubs
{
    public partial class GameHub
    {
		#region Room Management

		/// <summary>
		/// Створити нову кімнату
		/// </summary>
		public async Task CreateRoom(string roomName, string playerName, int maxPlayers = 12, string? password = null, string? stablePlayerId = null)
		{
			// Validate and sanitize inputs
			roomName = roomName?.Trim() ?? "";
			playerName = SanitizePlayerName(playerName);
			
			if (string.IsNullOrWhiteSpace(roomName) || string.IsNullOrWhiteSpace(playerName))
			{
				await Clients.Caller.SendAsync("ReceiveError", "Назва кімнати та ім'я гравця обов'язкові");
				return;
			}
			
			if (playerName.Length > 10)
			{
				await Clients.Caller.SendAsync("ReceiveError", "Ім'я гравця не може перевищувати 10 символів");
				return;
			}

			try
			{
				// Створюємо кімнату
				var room = _roomService.CreateRoom(roomName, Context.ConnectionId, playerName, maxPlayers, password);

				var player = CreateGeneratedPlayer(playerName, stablePlayerId, room);

				// Приєднуємо хоста до створеної кімнати
				var (joinSuccess, joinError, joinedRoom) =
					_roomService.JoinRoom(room.Id, Context.ConnectionId, player, password);

				if (!joinSuccess || joinedRoom == null)
				{
					await Clients.Caller.SendAsync("ReceiveError", joinError ?? "Помилка приєднання");
					return;
				}

				// Додаємо до SignalR групи
				await Groups.AddToGroupAsync(Context.ConnectionId, joinedRoom.Id);
				AppendLobbyPresenceAudit(joinedRoom, RoomService.GetPlayerKey(player), "lobby_player_joined", "A lobby member joined the room.");

				// Повідомляємо клієнта про успішне створення кімнати
				await Clients.Caller.SendAsync("RoomCreated", new
				{
					room = joinedRoom.ToPublicInfo(),
					player = player,
					isHost = true,
					hostToken = joinedRoom.HostToken,
					players = BuildRoomPlayersPayload(joinedRoom),
					roundState = BuildRoundState(joinedRoom)
				});
				await BroadcastLobbyState(joinedRoom);

				// Оновлюємо список кімнат
				await Clients.All.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());

				_logger.LogInformation("Кімната '{RoomName}' створена гравцем {PlayerName}", roomName, playerName);
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Помилка створення кімнати");
				await Clients.Caller.SendAsync("ReceiveError", "Помилка створення кімнати");
			}
		}

		public async Task JoinRoom(string roomId, string playerName, string? password = null, string? stablePlayerId = null)
		{
			// Validate and sanitize inputs
			roomId = roomId?.Trim() ?? "";
			playerName = SanitizePlayerName(playerName);
			
			if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(playerName))
			{
				await Clients.Caller.SendAsync("ReceiveError", "ID кімнати та ім'я гравця обов'язкові");
				return;
			}
			
			if (playerName.Length > 10)
			{
				await Clients.Caller.SendAsync("ReceiveError", "Ім'я гравця не може перевищувати 10 символів");
				return;
			}

			try
			{
				if (!string.IsNullOrWhiteSpace(stablePlayerId))
				{
					var (rejoinSuccess, _, rejoinRoom, rejoinPlayer, wasHost) =
						_roomService.RejoinRoom(roomId, Context.ConnectionId, playerName, stablePlayerId);

					if (rejoinSuccess && rejoinRoom != null && rejoinPlayer != null)
					{
						_playerDisconnectCleanup.Cancel(rejoinRoom.Id, rejoinPlayer.Id);
						EnsurePlayerHasGeneratedData(rejoinPlayer, rejoinRoom);
						AppendLobbyPresenceAudit(rejoinRoom, RoomService.GetPlayerKey(rejoinPlayer), "lobby_player_reconnected", "A lobby member reconnected.");
						await SendRejoinSuccess(roomId, rejoinRoom, rejoinPlayer, wasHost);
						return;
					}
				}

				var existingRoom = _roomService.GetRoom(roomId);
				var player = CreateGeneratedPlayer(playerName, stablePlayerId, existingRoom);

				// Один виклик JoinRoom
				var (joinSuccess, joinError, room) =
					_roomService.JoinRoom(roomId, Context.ConnectionId, player, password);

				if (!joinSuccess || room == null)
				{
					await Clients.Caller.SendAsync("ReceiveError", joinError ?? "Помилка приєднання");
					return;
				}

				// Додаємо до SignalR групи
				await Groups.AddToGroupAsync(Context.ConnectionId, room.Id);
				AppendLobbyPresenceAudit(room, RoomService.GetPlayerKey(player), "lobby_player_joined", "A lobby member joined the room.");

				// Відправляємо дані новому гравцю
				await Clients.Caller.SendAsync("RoomJoined", new
				{
					room = room.ToPublicInfo(),
					player = player,
					isHost = room.IsHost(Context.ConnectionId),
					hostToken = room.IsHost(Context.ConnectionId) ? room.HostToken : null,
					players = BuildRoomPlayersPayload(room),
					roundState = BuildRoundState(room)
				});

				// Повідомляємо інших у кімнаті
				await Clients.OthersInGroup(room.Id).SendAsync("PlayerJoinedRoom", new
				{
					name = player.Name,
					connectionId = Context.ConnectionId,
					stablePlayerId = RoomService.GetPlayerKey(player),
					isHost = false,
					revealed = player.Revealed,
					fact = player.Fact
				});
				await BroadcastOmniscientStateToAuthorizedSpectators(room);
				await BroadcastLobbyState(room);

				// Оновлюємо список кімнат
				await Clients.All.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Помилка приєднання до кімнати {RoomId} для {PlayerName}", roomId, playerName);
				await Clients.Caller.SendAsync("ReceiveError", "Помилка приєднання");
			}
		}
		/// Покинути кімнату
		/// </summary>
		public async Task LeaveRoom()
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            if (roomId == null) return;
			var leavingPlayer = _roomService.GetPlayer(Context.ConnectionId);
			var leavingPlayerId = leavingPlayer == null ? Context.ConnectionId : RoomService.GetPlayerKey(leavingPlayer);

            var (success, room, roomDeleted, newHostConnectionId) = _roomService.LeaveRoom(Context.ConnectionId);

            if (!success || room == null) return;

            // Видаляємо з SignalR групи
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);

            // Повідомляємо гравця
            await Clients.Caller.SendAsync("RoomLeft");

            if (!roomDeleted)
            {
				AppendLobbyPresenceAudit(room, leavingPlayerId, "lobby_player_left", "A lobby member left the room.");
                var playersSnapshot = RoomService.GetPlayersSnapshot(room);
                var newHostName = newHostConnectionId != null
                    ? playersSnapshot.FirstOrDefault(entry => entry.Key == newHostConnectionId).Value?.Name
                    : null;

                // Повідомляємо інших в кімнаті
                await Clients.Group(roomId).SendAsync("PlayerLeftRoom", new
                {
                    connectionId = Context.ConnectionId,
                    newHostConnectionId = newHostConnectionId,
                    newHostName = newHostName
                });
                await BroadcastOmniscientStateToAuthorizedSpectators(room);
                await BroadcastLobbyState(room);
            }

            // Оновлюємо список кімнат
            await Clients.All.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());
        }

        /// <summary>
        /// Отримати список кімнат
        /// </summary>
        public async Task GetRooms()
        {
            await Clients.Caller.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());
        }

		/// <summary>
		/// Спроба повторного приєднання після перезавантаження сторінки
		/// </summary>
		public async Task RejoinRoom(string roomId, string playerName, string? stablePlayerId = null)
		{
			if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(playerName) || string.IsNullOrWhiteSpace(stablePlayerId))
			{
				await Clients.Caller.SendAsync("RejoinFailed", "Невірні дані для перепідключення");
				return;
			}

			try
			{
				var (success, error, room, player, wasHost) =
					_roomService.RejoinRoom(roomId, Context.ConnectionId, playerName, stablePlayerId);

				if (!success || room == null || player == null)
				{
					await Clients.Caller.SendAsync("RejoinFailed", error ?? "Не вдалося перепідключитися");
					return;
				}

				_playerDisconnectCleanup.Cancel(room.Id, player.Id);

				_logger.LogInformation(
					"REJOIN SEND: RoomId={RoomId}, State={State}, Apocalypse={Apocalypse}, Bunker={Bunker}",
					room.Id,
					room.State,
					room.Apocalypse?.Name,
					room.Bunker?.Name
				);

				foreach (var p in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value))
				{
					_logger.LogInformation(
						"REJOIN DEBUG PLAYER: Name={Name}, ConnectionId={ConnectionId}, Seat={Seat}",
						p.Name,
						p.ConnectionId,
						p.SeatNumber
					);
				}

				AppendLobbyPresenceAudit(room, RoomService.GetPlayerKey(player), "lobby_player_reconnected", "A lobby member reconnected.");
				await SendRejoinSuccess(roomId, room, player, wasHost);

				_logger.LogInformation($"Гравець {playerName} перепідключився до кімнати {room.Name}");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Помилка перепідключення");
				await Clients.Caller.SendAsync("RejoinFailed", "Помилка перепідключення");
			}
		}

		private void AppendLobbyPresenceAudit(Room room, string playerId, string action, string summary)
		{
			if (room.State != RoomState.Lobby) return;
			_gmAudit.Append(room, playerId, action, GmAuditResult.Success, summary, playerId);
		}

		private async Task SendRejoinSuccess(string roomId, Room room, Player player, bool wasHost)
		{
			EnsurePlayerHasGeneratedData(player, room);
			RemoveCorruptedAdditionalConditions(room, player);

			// Оновлюємо URL зображень з кешу
			_imageService.UpdateApocalypseImageUrl(room.Apocalypse);
			_imageService.UpdateBunkerImageUrl(room.Bunker);

			await Groups.AddToGroupAsync(Context.ConnectionId, roomId);

			await Clients.Caller.SendAsync("RejoinSuccess", new
			{
				room = room.ToPublicInfo(),
				player = player,
				isHost = wasHost,
				hostToken = wasHost ? room.HostToken : null,
				roomState = room.State.ToString(),
				currentPhase = room.CurrentPhase.ToString(),
				completion = room.Completion,
				apocalypse = room.Apocalypse?.ToClientInfo(),
				bunker = room.Bunker?.ToClientInfo(),
				voting = BuildVotingReconnectInfo(room, player),
				players = BuildRoomPlayersPayload(room),
				roundState = BuildRoundState(room)
			});

			await Clients.OthersInGroup(roomId).SendAsync("PlayerReconnected", new
			{
				name = player.Name,
				connectionId = Context.ConnectionId,
				stablePlayerId = RoomService.GetPlayerKey(player),
				isHost = wasHost
			});
			await BroadcastOmniscientStateToAuthorizedSpectators(room);
			await BroadcastLobbyState(room);
		}

		private object? BuildVotingReconnectInfo(Room room, Player player)
		{
			var voting = room.CurrentVoting;
			if (voting == null) return null;

			var currentPlayerId = RoomService.GetPlayerKey(player);
			voting.Votes.TryGetValue(currentPlayerId, out var myTargetId);
			var myTargetConnectionId = myTargetId != null ? _roomService.GetCurrentConnectionId(room, myTargetId) : null;
			var myTargetPlayer = myTargetId != null ? _roomService.GetPlayerByAnyId(room, myTargetId) : null;
			var playersSnapshot = RoomService.GetPlayersSnapshot(room)
				.ToDictionary(entry => entry.Key, entry => entry.Value);
			var votingInfo = voting.ToClientInfo(playersSnapshot, voting.State != VotingState.Active);
			object? GetVotingProperty(string name) => votingInfo.GetType().GetProperty(name)?.GetValue(votingInfo);

			return new
			{
				id = voting.Id,
				votingId = voting.Id,
				round = voting.Round,
				roundNumber = voting.Round,
				state = voting.State.ToString(),
				phase = voting.State.ToString(),
				eligibleVoters = voting.EligibleVoters.Count,
				votedCount = GetVotingProperty("votedCount"),
				totalVoters = voting.EligibleVoters.Count,
				totalVotes = GetVotingProperty("totalVotes"),
				allVoted = GetVotingProperty("allVoted"),
				candidates = RoomService.GetGameplayPlayersSnapshot(room)
					.Select(entry => entry.Value)
					.Select(p => new
					{
						connectionId = p.ConnectionId,
						stablePlayerId = RoomService.GetPlayerKey(p),
						name = p.Name,
						seatNumber = p.SeatNumber,
						isProtected = p.IsProtectedFromVote,
						extraVotes = p.ExtraVotes
					}).ToList(),
				results = GetVotingProperty("results"),
				topVotedPlayerId = GetVotingProperty("topVotedPlayerId"),
				topVotedStablePlayerId = GetVotingProperty("topVotedStablePlayerId"),
				topVotedPlayerName = GetVotingProperty("topVotedPlayerName"),
				topVotedSeatNumber = GetVotingProperty("topVotedSeatNumber"),
				isTie = GetVotingProperty("isTie"),
				nonVoters = GetVotingProperty("nonVoters"),
				specialCardEffects = GetVotingProperty("specialCardEffects"),
				myVote = myTargetId == null ? null : new
				{
					targetConnectionId = myTargetConnectionId ?? myTargetId,
					targetName = myTargetPlayer?.Name,
					changed = false
				},
				votes = GetVotingProperty("votes")
			};
		}

		private Player CreateGeneratedPlayer(string playerName, string? stablePlayerId, Room? room = null)
		{
			return new Player { Name = playerName, ConnectionId = Context.ConnectionId, StablePlayerId = stablePlayerId ?? "" };
		}

		private void EnsurePlayerHasGeneratedData(Player player, Room? room = null)
		{
			if (player.IsSpectatorGm || player.IsLobbySpectator || player.GmRole == GmMode.TechnicalGm || room?.State == RoomState.Lobby) return;
			var generated = HasCompleteCharacterData(player) ? null : _generator.Generate(player.Name);

			if (!HasPersonality(player)) player.Personality = generated!.Personality;
			if (!HasBody(player)) player.Body = generated!.Body;
			if (!HasNamedCharacteristic(player.Profession)) player.Profession = generated!.Profession;
			if (!HasProfessionItem(player) && !string.IsNullOrWhiteSpace(player.Profession?.SelectedItem))
			{
				player.ProfessionItem = new Item
				{
					Name = player.Profession.SelectedItem,
					Description = "Професійний предмет",
					Quantity = 1,
					Unit = "шт",
					WeightKg = 1,
					IsUsefulInBunker = true,
					Rarity = "Професійний",
					InstanceId = $"profession:{Guid.NewGuid():N}",
					Source = "profession"
				};
			}
			if (!HasInventory(player)) player.Inventory = generated!.Inventory;
			if (!HasNamedCharacteristic(player.PhysicalHealth)) player.PhysicalHealth = generated!.PhysicalHealth;
			if (!HasNamedCharacteristic(player.MentalHealth)) player.MentalHealth = generated!.MentalHealth;
			if (!HasNamedCharacteristic(player.Hobby)) player.Hobby = generated!.Hobby;
			if (!HasNamedCharacteristic(player.CharacterTrait)) player.CharacterTrait = generated!.CharacterTrait;
			if (!HasNamedCharacteristic(player.Phobia)) player.Phobia = generated!.Phobia;
			if (!HasNamedCharacteristic(player.Fact)) player.Fact = generated!.Fact;
			if (!HasSpecialCard(player.SpecialCard)) player.SpecialCard = generated!.SpecialCard;
			GetPlayerSpecialCards(player);
		}

		private void RemoveCorruptedAdditionalConditions(Room room, Player player)
		{
			if (player.AdditionalConditionEffects == null || player.AdditionalConditionEffects.Count == 0)
			{
				return;
			}

			var playerId = RoomService.GetPlayerKey(player);
			var removed = player.AdditionalConditionEffects.RemoveAll(effect =>
				string.IsNullOrWhiteSpace(effect.Name) ||
				string.IsNullOrWhiteSpace(effect.BaseName));

			if (removed > 0)
			{
				_logger.LogWarning(
					"Removed {Count} corrupted additional physical condition(s). RoomId={RoomId}, PlayerId={PlayerId}",
					removed,
					room.Id,
					playerId);
			}
		}

		private static bool HasCompleteCharacterData(Player player)
		{
			return HasPersonality(player)
				&& HasBody(player)
				&& HasNamedCharacteristic(player.Profession)
				&& HasInventory(player)
				&& HasNamedCharacteristic(player.PhysicalHealth)
				&& HasNamedCharacteristic(player.MentalHealth)
				&& HasNamedCharacteristic(player.Hobby)
				&& HasNamedCharacteristic(player.CharacterTrait)
				&& HasNamedCharacteristic(player.Phobia)
				&& HasNamedCharacteristic(player.Fact)
				&& HasSpecialCard(player.SpecialCard);
		}

		private static bool HasPersonality(Player player)
		{
			return player.Personality != null
				&& player.Personality.Age > 0
				&& !string.IsNullOrWhiteSpace(player.Personality.Sex)
				&& !string.IsNullOrWhiteSpace(player.Personality.SexOrientation);
		}

		private static bool HasBody(Player player)
		{
			return player.Body != null
				&& player.Body.Height > 0
				&& player.Body.Weight > 0
				&& !string.IsNullOrWhiteSpace(player.Body.BodyType);
		}

		private static bool HasInventory(Player player)
		{
			return player.Inventory?.Items != null && player.Inventory.Items.Count > 0;
		}

		private static bool HasProfessionItem(Player player)
		{
			return !string.IsNullOrWhiteSpace(player.ProfessionItem?.Name);
		}

		private static bool HasName(string? name)
		{
			return !string.IsNullOrWhiteSpace(name);
		}

		private static bool HasNamedCharacteristic(Profession? characteristic) => HasName(characteristic?.Name);
		private static bool HasNamedCharacteristic(PhysicalHealth? characteristic) => HasName(characteristic?.Name);
		private static bool HasNamedCharacteristic(MentalHealth? characteristic) => HasName(characteristic?.Name);
		private static bool HasNamedCharacteristic(Hobby? characteristic) => HasName(characteristic?.Name);
		private static bool HasNamedCharacteristic(CharacterTrait? characteristic) => HasName(characteristic?.Name);
		private static bool HasNamedCharacteristic(Phobia? characteristic) => HasName(characteristic?.Name);
		private static bool HasNamedCharacteristic(Fact? characteristic) => HasName(characteristic?.Name);
		private static bool HasSpecialCard(SpecialCard? card) =>
			card != null && !string.IsNullOrWhiteSpace(card.Id) && !string.IsNullOrWhiteSpace(card.Name);

		private object BuildRoomPlayersPayload(Room room)
		{
			var playersSnapshot = RoomService.GetPlayersSnapshot(room);

			foreach (var player in playersSnapshot.Select(entry => entry.Value))
			{
				RemoveCorruptedAdditionalConditions(room, player);
			}

			return playersSnapshot.Select(entry =>
			{
				var p = entry.Value;
				var connectionId = string.IsNullOrWhiteSpace(p.ConnectionId) ? entry.Key : p.ConnectionId;

				return new
				{
					name = p.Name ?? "Unknown",
					connectionId = connectionId,
					stablePlayerId = RoomService.GetPlayerKey(p),
					isHost = room.IsHost(connectionId),
					revealed = p.Revealed,
					revealedValues = p.Revealed?.RevealedValues,
					revealedSources = BuildRevealedSources(p),
					additionalConditionEffects = p.Revealed?.PhysicalHealth == true
						? p.AdditionalConditionEffects
						: new List<PlayerConditionEffect>(),
					fact = p.Fact,
					isEliminated = p.IsEliminated,
					isSpectatorGm = p.IsSpectatorGm,
					publicRole = p.IsSpectatorGm ? "spectator_gm" : "player",
					publicRoleLabel = p.IsSpectatorGm ? "GM-спостерігач" : null,
					eliminatedAtRound = p.EliminatedAtRound,
					eliminatedByVote = p.EliminatedByVote,
					canRevealAllAfterElimination = p.CanRevealAllAfterElimination,
					hasRevealedAllAfterElimination = p.HasRevealedAllAfterElimination,
					seatNumber = p.SeatNumber,
					isConnected = p.IsConnected,
					eliminationVoteImmunity = p.EliminationVoteImmunity
				};
			}).ToList();
		}
		
		/// <summary>
		/// Почати гру (тільки хост)
		/// </summary>
		public Task StartGame() => Clients.Caller.SendAsync("ReceiveError", "lobby_preview_required");

		private void PrepareLobbyGameplayCharacters(Room room)
		{
			var settings = _roomGameSettings.GetCanonical(room);
			foreach (var player in RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value))
			{
				EnsurePlayerHasGeneratedData(player);
				ConfigureGeneratedPlayerForLobby(player, settings);
			}
		}

		private void ConfigureGeneratedPlayerForLobby(Player player, RoomGameSettings settings)
		{
			if (!settings.SpecialCardsEnabled || settings.SpecialCardsPerPlayer == 0)
			{
				player.SpecialCards = new();
				player.SpecialCard = new();
			}
			else
			{
				var cards = GetPlayerSpecialCards(player)
					.Where(card => !string.IsNullOrWhiteSpace(card.Id) && card.Id != "no_special_card")
					.Take(settings.SpecialCardsPerPlayer).ToList();
				var attempts = 0;
				while (cards.Count < settings.SpecialCardsPerPlayer && attempts++ < 8)
				{
					var generated = _generator.GenerateSpecialCards(1).FirstOrDefault();
					if (generated == null) break;
					if (cards.Any(card => string.Equals(card.Id, generated.Id, StringComparison.OrdinalIgnoreCase))) continue;
					cards.Add(generated);
				}
				player.SpecialCards = cards;
				player.SpecialCard = cards.FirstOrDefault() ?? new();
			}

			player.Inventory ??= new();
			player.Inventory.Items ??= new();
			while (player.Inventory.Items.Count > settings.StartingInventoryCount)
				player.Inventory.Items.RemoveAt(player.Inventory.Items.Count - 1);
			while (player.Inventory.Items.Count < settings.StartingInventoryCount)
			{
				var item = DrawRandomInventoryItem();
				if (item == null) break;
				player.Inventory.Items.Add(item);
			}
		}

		private async Task CompleteLobbyStart(Room room)
        {
            var roomId = room.Id;

            var settings = _roomGameSettings.GetEffective(room);
            // Генеруємо лише увімкнені room-local сценарії.
            if (!settings.ApocalypseEnabled) room.Apocalypse = null;
            else if (room.Apocalypse == null && _gameData.Apocalypses.Count > 0)
            {
                room.Apocalypse = _gameData.Apocalypses[_random.Next(_gameData.Apocalypses.Count)];
                // Оновлюємо URL зображення з кешу
                _imageService.UpdateApocalypseImageUrl(room.Apocalypse);
            }
            
            if (!settings.BunkerScenarioEnabled) room.Bunker = null;
            else if (room.Bunker == null && _gameData.Bunkers.Count > 0)
            {
                room.Bunker = _gameData.Bunkers[_random.Next(_gameData.Bunkers.Count)];
                // Оновлюємо URL зображення з кешу
                _imageService.UpdateBunkerImageUrl(room.Bunker);
            }

            if (room.Bunker != null)
            {
                room.ResolvedBunkerCapacity ??= room.Bunker.Capacity;
                room.Bunker.Capacity = room.ResolvedBunkerCapacity.Value;
            }

            if (settings.RoundTimerEnabled && settings.AutoStartRoundTimer)
                _gameTimerService.Start(room, settings.RoundTimerDurationSeconds, GameTimerPurpose.Round, $"Round {room.CurrentRound}");
            else
                _gameTimerService.Stop(room);

            // Canonical seats are assigned atomically by RoomService.StartGame.
            var playersSnapshot = RoomService.GetGameplayPlayersSnapshot(room);

            // Canonical lobby -> running handoff. The lifecycle is public first;
            // personal character state is then delivered only to verified current
            // gameplay connections, followed by fresh public/authority state.
            await BroadcastLobbyState(room);

            foreach (var entry in RoomService.GetGameplayPlayersSnapshot(room))
            {
                var player = entry.Value;
                var currentConnectionId = _roomService.GetCurrentConnectionId(room, RoomService.GetPlayerKey(player));
                if (string.IsNullOrWhiteSpace(currentConnectionId) ||
                    !string.Equals(_roomService.GetPlayerRoomId(currentConnectionId), roomId, StringComparison.OrdinalIgnoreCase))
                    continue;

                await SendPersonalPlayerSnapshot(currentConnectionId, player, "lobby_game_started");
            }

            await BroadcastOmniscientStateToAuthorizedSpectators(room);
            await Clients.Group(roomId).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));

            var roundState = BuildRoundState(room);
            await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);
            if (room.Bunker != null)
                await Clients.Group(roomId).SendAsync("BunkerChanged", new { bunker = room.Bunker.ToClientInfo() });
            if (room.Apocalypse != null)
                await Clients.Group(roomId).SendAsync("ApocalypseChanged", new { apocalypse = room.Apocalypse.ToClientInfo() });
            await SendPlayerHostControlData(room);

            // Compatibility aggregate for existing clients; it is built only after
            // every canonical state mutation and granular refresh above.
            await Clients.Group(roomId).SendAsync("GameStarted", new
            {
                roomState = room.State.ToString(),
                currentRound = room.CurrentRound,
                currentTurnPlayerId = room.CurrentTurnPlayerId,
                apocalypse = room.Apocalypse?.ToClientInfo(),
                bunker = room.Bunker?.ToClientInfo(),
                roundState,
                players = playersSnapshot.Select(entry =>
                {
                    var p = entry.Value;

                    return new
                    {
                        name = p.Name ?? "Unknown",
                        connectionId = string.IsNullOrWhiteSpace(p.ConnectionId) ? entry.Key : p.ConnectionId,
                        isEliminated = p.IsEliminated,
                        isSpectatorGm = p.IsSpectatorGm,
                        eliminatedAtRound = p.EliminatedAtRound,
                        eliminatedByVote = p.EliminatedByVote,
                        canRevealAllAfterElimination = p.CanRevealAllAfterElimination,
                        hasRevealedAllAfterElimination = p.HasRevealedAllAfterElimination,
                        seatNumber = p.SeatNumber
                    };
                })
            });

            // Оновлюємо список кімнат (кімната більше не в лобі)
            await Clients.All.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());

            _logger.LogInformation($"Гра почалась в кімнаті {room.Name}. Апокаліпсис: {room.Apocalypse?.Name}, Бункер: {room.Bunker?.Name}");
        }

        #endregion
    }
}


