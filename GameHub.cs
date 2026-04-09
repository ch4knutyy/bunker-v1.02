using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Bunker
{
    public class GameHub : Hub
    {
        private readonly CharacterGeneratorService _generator;
        private readonly RoomService _roomService;
        private readonly CardService _cardService;
        private readonly GameDataService _gameData;
        private readonly ILogger<GameHub> _logger;
        private readonly Random _random = new();

        public GameHub(CharacterGeneratorService generator, RoomService roomService, CardService cardService, GameDataService gameData, ILogger<GameHub> logger)
        {
            _generator = generator;
            _roomService = roomService;
            _cardService = cardService;
            _gameData = gameData;
            _logger = logger;
        }

		#region Room Management

		/// <summary>
		/// Створити нову кімнату
		/// </summary>
		public async Task CreateRoom(string roomName, string playerName, int maxPlayers = 12, string? password = null, string? stablePlayerId = null)
		{
			if (string.IsNullOrWhiteSpace(roomName) || string.IsNullOrWhiteSpace(playerName))
			{
				await Clients.Caller.SendAsync("ReceiveError", "Назва кімнати та ім'я гравця обов'язкові");
				return;
			}

			try
			{
				// Створюємо кімнату
				var room = _roomService.CreateRoom(roomName, Context.ConnectionId, playerName, maxPlayers, password);

				// Генеруємо персонажа для хоста
				var player = _generator.Generate(playerName);
				player.ConnectionId = Context.ConnectionId;
				player.StablePlayerId = stablePlayerId ?? "";

				// Генеруємо спеціальні карти
				player.Cards = _cardService.GenerateCardsForPlayer(Context.ConnectionId, 2);

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

				// Повідомляємо клієнта про успішне створення кімнати
				await Clients.Caller.SendAsync("RoomCreated", new
				{
					room = joinedRoom.ToPublicInfo(),
					player = player,
					isHost = true
				});

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
			if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(playerName))
			{
				await Clients.Caller.SendAsync("ReceiveError", "ID кімнати та ім'я гравця обов'язкові");
				return;
			}

			try
			{
				// Генеруємо персонажа
				var player = _generator.Generate(playerName);
				player.ConnectionId = Context.ConnectionId;
				player.StablePlayerId = stablePlayerId ?? "";

				// Генеруємо спеціальні карти
				player.Cards = _cardService.GenerateCardsForPlayer(Context.ConnectionId, 2);

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

				// Відправляємо дані новому гравцю
				await Clients.Caller.SendAsync("RoomJoined", new
				{
					room = room.ToPublicInfo(),
					player = player,
					isHost = room.IsHost(Context.ConnectionId),
					players = room.Players.Values.Select(p => new
					{
						name = p.Name,
						connectionId = p.ConnectionId,
						isHost = room.IsHost(p.ConnectionId),
						revealed = p.Revealed,
						revealedValues = p.Revealed.RevealedValues,
						isEliminated = p.IsEliminated,
						seatNumber = p.SeatNumber
					}).ToList()
				});

				// Повідомляємо інших у кімнаті
				await Clients.OthersInGroup(room.Id).SendAsync("PlayerJoinedRoom", new
				{
					name = player.Name,
					connectionId = Context.ConnectionId,
					isHost = false,
					revealed = player.Revealed
				});

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

            var (success, room, roomDeleted, newHostConnectionId) = _roomService.LeaveRoom(Context.ConnectionId);

            if (!success || room == null) return;

            // Видаляємо з SignalR групи
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, roomId);

            // Повідомляємо гравця
            await Clients.Caller.SendAsync("RoomLeft");

            if (!roomDeleted)
            {
                // Повідомляємо інших в кімнаті
                await Clients.Group(roomId).SendAsync("PlayerLeftRoom", new
                {
                    connectionId = Context.ConnectionId,
                    newHostConnectionId = newHostConnectionId,
                    newHostName = newHostConnectionId != null ? room.Players[newHostConnectionId].Name : null
                });
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
			if (string.IsNullOrWhiteSpace(roomId) || string.IsNullOrWhiteSpace(playerName))
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

				await Groups.AddToGroupAsync(Context.ConnectionId, roomId);

				_logger.LogInformation(
					"REJOIN SEND: RoomId={RoomId}, State={State}, Apocalypse={Apocalypse}, Bunker={Bunker}, ActivatedCards={Count}",
					room.Id,
					room.State,
					room.Apocalypse?.Name,
					room.Bunker?.Name,
					room.ActivatedCards.Count
				);

				_logger.LogInformation("REJOIN DEBUG: room.ActivatedCards count = {Count}", room.ActivatedCards.Count);

				foreach (var card in room.ActivatedCards)
				{
					_logger.LogInformation(
						"REJOIN DEBUG CARD: CardId={CardId}, CardName={CardName}, PlayerId={PlayerId}, PlayerName={PlayerName}, TargetPlayerId={TargetPlayerId}, TargetPlayerName={TargetPlayerName}",
						card.CardId,
						card.CardName,
						card.PlayerId,
						card.PlayerName,
						card.TargetPlayerId,
						card.TargetPlayerName
					);
				}

				foreach (var p in room.Players.Values)
				{
					_logger.LogInformation(
						"REJOIN DEBUG PLAYER: Name={Name}, ConnectionId={ConnectionId}, Seat={Seat}",
						p.Name,
						p.ConnectionId,
						p.SeatNumber
					);
				}


				await Clients.Caller.SendAsync("RejoinSuccess", new
				{
					room = room.ToPublicInfo(),
					player = player,
					isHost = wasHost,
					roomState = room.State.ToString(),
					apocalypse = room.Apocalypse?.ToClientInfo(),
					bunker = room.Bunker?.ToClientInfo(),
						activatedCards = room.ActivatedCards.Select(card => new
						{
							playerId = card.PlayerId,
							name = card.CardName,
							rarity = card.Rarity,
							description = card.Description,
							playerName = card.PlayerName,
							targetPlayerId = card.TargetPlayerId,
							targetPlayerName = card.TargetPlayerName,
							targetCharacteristic = card.TargetCharacteristic,
							activatedAt = card.ActivatedAt
						}).ToList(),
					players = room.Players.Values.Select(p => new
					{
						name = p.Name,
						connectionId = p.ConnectionId,
						isHost = room.IsHost(p.ConnectionId),
						revealed = p.Revealed,
						revealedValues = p.Revealed.RevealedValues,
						isEliminated = p.IsEliminated,
						seatNumber = p.SeatNumber
					}).ToList()
				});

				await Clients.OthersInGroup(roomId).SendAsync("PlayerReconnected", new
				{
					name = player.Name,
					connectionId = Context.ConnectionId,
					isHost = wasHost
				});

				_logger.LogInformation($"Гравець {playerName} перепідключився до кімнати {room.Name}");
			}
			catch (Exception ex)
			{
				_logger.LogError(ex, "Помилка перепідключення");
				await Clients.Caller.SendAsync("RejoinFailed", "Помилка перепідключення");
			}
		}
		
		/// <summary>
		/// Почати гру (тільки хост)
		/// </summary>
		public async Task StartGame()
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            if (roomId == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var (success, error, room) = _roomService.StartGame(roomId, Context.ConnectionId);

            if (!success || room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", error ?? "Помилка старту гри");
                return;
            }

            // Генеруємо апокаліпсис та бункер
            if (_gameData.Apocalypses.Count > 0)
            {
                room.Apocalypse = _gameData.Apocalypses[_random.Next(_gameData.Apocalypses.Count)];
            }
            
            if (_gameData.Bunkers.Count > 0)
            {
                room.Bunker = _gameData.Bunkers[_random.Next(_gameData.Bunkers.Count)];
            }

            // Рандомізація номерів місць гравців
            var seatNumbers = Enumerable.Range(1, room.PlayerCount).ToList();
            // Fisher-Yates shuffle
            for (int i = seatNumbers.Count - 1; i > 0; i--)
            {
                int j = _random.Next(i + 1);
                (seatNumbers[i], seatNumbers[j]) = (seatNumbers[j], seatNumbers[i]);
            }
            int seatIdx = 0;
            foreach (var p in room.Players.Values)
            {
                p.SeatNumber = seatNumbers[seatIdx++];
            }

            // Відправляємо всім в кімнаті сигнал про початок гри
            await Clients.Group(roomId).SendAsync("GameStarted", new
            {
                roomState = room.State.ToString(),
                currentRound = room.CurrentRound,
                currentTurnPlayerId = room.CurrentTurnPlayerId,
                apocalypse = room.Apocalypse?.ToClientInfo(),
                bunker = room.Bunker?.ToClientInfo(),
                players = room.Players.Values.Select(p => new
                {
                    name = p.Name,
                    connectionId = p.ConnectionId,
                    isEliminated = p.IsEliminated,
                    seatNumber = p.SeatNumber
                })
            });

            // Оновлюємо список кімнат (кімната більше не в лобі)
            await Clients.All.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());

            _logger.LogInformation($"Гра почалась в кімнаті {room.Name}. Апокаліпсис: {room.Apocalypse?.Name}, Бункер: {room.Bunker?.Name}");
        }

        #endregion

        #region Game Actions

        /// <summary>
        /// Розкрити характеристику (в контексті кімнати)
        /// </summary>
        public async Task RevealCharacteristic(string characteristicName)
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var player = _roomService.GetPlayer(Context.ConnectionId);

            if (roomId == null || player == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            characteristicName = characteristicName?.Trim() ?? "";

            // Перевіряємо чи характеристика вже відкрита
            bool alreadyRevealed = characteristicName switch
            {
                "Personality" => player.Revealed.Personality,
                "Body" => player.Revealed.Body,
                "Profession" => player.Revealed.Profession,
                "PhysicalHealth" => player.Revealed.PhysicalHealth,
                "MentalHealth" => player.Revealed.MentalHealth,
                "Hobby" => player.Revealed.Hobby,
                "CharacterTrait" => player.Revealed.CharacterTrait,
                "Phobia" => player.Revealed.Phobia,
                "Traits" => player.Revealed.Traits,
                "Inventory" => player.Revealed.Inventory,
                "Secret" => player.Revealed.Secret,
                "SecretGoal" => player.Revealed.SecretGoal,
                _ => true
            };

            if (alreadyRevealed)
            {
                await Clients.Caller.SendAsync("ReceiveError", $"Характеристика '{characteristicName}' вже відкрита або не існує");
                return;
            }

            object? revealedData = GetRevealedDataForCharacteristic(player, characteristicName);

            if (revealedData == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", $"Невідома характеристика: {characteristicName}");
                return;
            }

            // Позначаємо характеристику як відкриту
            SetCharacteristicRevealed(player, characteristicName);

            // Оновлюємо гравця в сервісі
            _roomService.UpdatePlayer(Context.ConnectionId, player);

            // Повідомляємо всіх в кімнаті про розкриту характеристику
            await Clients.Group(roomId).SendAsync("CharacteristicRevealed", new
            {
                playerName = player.Name,
                connectionId = Context.ConnectionId,
                characteristicKey = characteristicName,
                data = revealedData
            });
        }

        private object? GetRevealedDataForCharacteristic(Player player, string characteristicName)
        {
            return characteristicName switch
            {
                "Personality" => new
                {
                    label = "Особистість",
                    value = $"Вік: {player.Personality.Age}, Стать: {player.Personality.Sex}{(player.Personality.IsChildfree ? " (чайлдфрі)" : "")}, Орієнтація: {player.Personality.SexOrientation}"
                },
                "Body" => new
                {
                    label = "Статура",
                    value = $"Зріст: {player.Body.Height} см, Вага: {player.Body.Weight} кг, Тип тіла: {player.Body.BodyType}"
                },
                "Profession" => new
                {
                    label = "Професія",
                    value = string.IsNullOrEmpty(player.Profession.Name) 
                        ? "Безробітний" 
                        : $"{player.Profession.Name}{(!string.IsNullOrEmpty(player.Profession.SelectedItem) ? $" (+{player.Profession.SelectedItem})" : "")} ({player.Profession.ExperienceYears} р. досвіду)",
                    tooltip = player.Profession.Tooltip,
                    hasTooltip = player.Profession.HasTooltip,
                    typeClass = "profession"
                },
                "PhysicalHealth" => new
                {
                    label = "Фізичне здоров'я",
                    value = string.IsNullOrEmpty(player.PhysicalHealth.Name) 
                        ? "Здоровий" 
                        : player.PhysicalHealth.Name,
                    tooltip = player.PhysicalHealth.Tooltip,
                    hasTooltip = player.PhysicalHealth.HasTooltip,
                    typeClass = "physical"
                },
                "MentalHealth" => new
                {
                    label = "Психічне здоров'я",
                    value = string.IsNullOrEmpty(player.MentalHealth.Name) 
                        ? "Стабільний" 
                        : player.MentalHealth.Name,
                    tooltip = player.MentalHealth.Tooltip,
                    hasTooltip = player.MentalHealth.HasTooltip,
                    typeClass = "mental"
                },
                "Hobby" => new
                {
                    label = "Хобі",
                    value = string.IsNullOrEmpty(player.Hobby.Name) 
                        ? "Немає хобі" 
                        : player.Hobby.Name,
                    tooltip = player.Hobby.Tooltip,
                    hasTooltip = player.Hobby.HasTooltip,
                    typeClass = "hobby"
                },
                "CharacterTrait" => new
                {
                    label = "Риса характеру",
                    value = string.IsNullOrEmpty(player.CharacterTrait.Name) 
                        ? "Невизначений" 
                        : player.CharacterTrait.Name
                },
                "Phobia" => new
                {
                    label = "Фобія",
                    value = string.IsNullOrEmpty(player.Phobia.Name) || player.Phobia.Name == "Немає фобій"
                        ? "Немає фобій" 
                        : player.Phobia.Name,
                    tooltip = player.Phobia.Tooltip,
                    hasTooltip = player.Phobia.HasTooltip,
                    typeClass = "phobia"
                },
                "Traits" => new
                {
                    label = "Особливості",
                    value = string.IsNullOrEmpty(player.Traits.Name) 
                        ? "Немає особливостей" 
                        : player.Traits.Name,
                    tooltip = player.Traits.Tooltip,
                    hasTooltip = player.Traits.HasTooltip,
                    typeClass = "trait"
                },
                "Inventory" => new
                {
                    label = "Інвентар",
                    value = player.Inventory.Items.Count > 0 
                        ? string.Join(", ", player.Inventory.Items.Select(i => i.Name)) 
                        : "Порожній"
                },
                "Secret" => new
                {
                    label = "Секрет",
                    value = string.IsNullOrEmpty(player.Secret.Name) 
                        ? "Без секретів" 
                        : player.Secret.Name
                },
                "SecretGoal" => new
                {
                    label = "Таємна ціль",
                    value = string.IsNullOrEmpty(player.SecretGoal.Goal) 
                        ? "Вижити" 
                        : player.SecretGoal.Goal,
                    tooltip = player.SecretGoal.Tooltip,
                    hasTooltip = player.SecretGoal.HasTooltip,
                    typeClass = "secret-goal"
                },
                _ => null
            };
        }

        private void SetCharacteristicRevealed(Player player, string characteristicName)
        {
            // Зберігаємо реальне значення для reconnect
            var data = GetRevealedDataForCharacteristic(player, characteristicName);
            if (data != null)
            {
                // Конвертуємо в RevealedData
                var revealedData = new RevealedData();
                var dataType = data.GetType();
                
                var valueProp = dataType.GetProperty("value");
                var labelProp = dataType.GetProperty("label");
                var tooltipProp = dataType.GetProperty("tooltip");
                var hasTooltipProp = dataType.GetProperty("hasTooltip");
                
                if (valueProp != null) revealedData.Value = valueProp.GetValue(data)?.ToString() ?? "";
                if (labelProp != null) revealedData.Label = labelProp.GetValue(data)?.ToString() ?? "";
                if (tooltipProp != null) revealedData.Tooltip = tooltipProp.GetValue(data)?.ToString();
                if (hasTooltipProp != null) revealedData.HasTooltip = (bool)(hasTooltipProp.GetValue(data) ?? false);
                
                player.Revealed.RevealedValues[characteristicName] = revealedData;
            }
            
            switch (characteristicName)
            {
                case "Personality": player.Revealed.Personality = true; break;
                case "Body": player.Revealed.Body = true; break;
                case "Profession": player.Revealed.Profession = true; break;
                case "PhysicalHealth": player.Revealed.PhysicalHealth = true; break;
                case "MentalHealth": player.Revealed.MentalHealth = true; break;
                case "Hobby": player.Revealed.Hobby = true; break;
                case "CharacterTrait": player.Revealed.CharacterTrait = true; break;
                case "Phobia": player.Revealed.Phobia = true; break;
                case "Traits": player.Revealed.Traits = true; break;
                case "Inventory": player.Revealed.Inventory = true; break;
                case "Secret": player.Revealed.Secret = true; break;
                case "SecretGoal": player.Revealed.SecretGoal = true; break;
            }
        }

        #endregion

        #region Game Master Actions

        /// <summary>
        /// Перевірка чи гравець є хостом
        /// </summary>
        private bool IsCallerHost()
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            return room != null && room.IsHost(Context.ConnectionId);
        }

        /// <summary>
        /// Отримати всіх гравців з повними даними (тільки для хоста)
        /// </summary>
        public async Task GetAllPlayersData()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може бачити дані всіх гравців");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null) return;

            var playersData = room.Players.Values.Select(p => new
            {
                connectionId = p.ConnectionId,
                name = p.Name,
                isEliminated = p.IsEliminated,
                personality = new { p.Personality.Age, p.Personality.Sex, p.Personality.SexOrientation, p.Personality.IsChildfree },
                body = new { p.Body.Height, p.Body.Weight, p.Body.BodyType },
                profession = new { p.Profession.Name, p.Profession.ExperienceYears, p.Profession.SelectedItem },
                physicalHealth = new { p.PhysicalHealth.Name },
                mentalHealth = new { p.MentalHealth.Name },
                hobby = new { p.Hobby.Name },
                characterTrait = new { p.CharacterTrait.Name },
                phobia = new { p.Phobia.Name },
                traits = new { p.Traits.Name },
                inventory = p.Inventory.Items.Select(i => i.Name),
                secret = new { p.Secret.Name },
                secretGoal = new { p.SecretGoal.Goal, p.SecretGoal.Type, p.SecretGoal.Description },
                revealed = p.Revealed
            });

            await Clients.Caller.SendAsync("AllPlayersData", playersData);
        }

        /// <summary>
        /// Редагувати характеристику гравця (тільки хост)
        /// </summary>
        public async Task EditPlayerCharacteristic(string targetConnectionId, string characteristicName, string newValue)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може редагувати характеристики");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !room.Players.TryGetValue(targetConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            // Застосовуємо зміну
            bool success = ApplyCharacteristicChange(player, characteristicName, newValue);
            
            if (!success)
            {
                await Clients.Caller.SendAsync("ReceiveError", $"Не вдалося змінити характеристику: {characteristicName}");
                return;
            }

            _roomService.UpdatePlayer(targetConnectionId, player);

            // Повідомляємо гравця про зміну
            await Clients.Client(targetConnectionId).SendAsync("CharacteristicEdited", new
            {
                characteristicName = characteristicName,
                newValue = newValue,
                player = player
            });

            // Повідомляємо хоста про успіх
            await Clients.Caller.SendAsync("GMActionSuccess", new
            {
                action = "edit",
                playerName = player.Name,
                characteristicName = characteristicName,
                newValue = newValue
            });

            // Якщо характеристика вже була розкрита - оновлюємо для всіх
            if (IsCharacteristicRevealed(player, characteristicName))
            {
                var revealedData = GetRevealedDataForCharacteristic(player, characteristicName);
                await Clients.Group(room.Id).SendAsync("CharacteristicUpdated", new
                {
                    connectionId = targetConnectionId,
                    playerName = player.Name,
                    characteristicKey = characteristicName,
                    data = revealedData
                });
            }

            _logger.LogInformation($"GM редагував {characteristicName} гравця {player.Name}: {newValue}");
        }

        /// <summary>
        /// Видалити/очистити характеристику гравця (тільки хост)
        /// </summary>
        public async Task ClearPlayerCharacteristic(string targetConnectionId, string characteristicName)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може видаляти характеристики");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !room.Players.TryGetValue(targetConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            // Очищаємо характеристику (встановлюємо пусте/дефолтне значення)
            bool success = ClearCharacteristic(player, characteristicName);
            
            if (!success)
            {
                await Clients.Caller.SendAsync("ReceiveError", $"Не вдалося очистити характеристику: {characteristicName}");
                return;
            }

            _roomService.UpdatePlayer(targetConnectionId, player);

            await Clients.Client(targetConnectionId).SendAsync("CharacteristicCleared", new
            {
                characteristicName = characteristicName,
                player = player
            });

            await Clients.Caller.SendAsync("GMActionSuccess", new
            {
                action = "clear",
                playerName = player.Name,
                characteristicName = characteristicName
            });

            // Якщо характеристика вже була розкрита - оновлюємо для всіх
            if (IsCharacteristicRevealed(player, characteristicName))
            {
                var revealedData = GetRevealedDataForCharacteristic(player, characteristicName);
                await Clients.Group(room.Id).SendAsync("CharacteristicUpdated", new
                {
                    connectionId = targetConnectionId,
                    playerName = player.Name,
                    characteristicKey = characteristicName,
                    data = revealedData
                });
            }

            _logger.LogInformation($"GM очистив {characteristicName} гравця {player.Name}");
        }

        /// <summary>
        /// Регенерувати характеристику гравця (тільки хост)
        /// </summary>
        public async Task RegeneratePlayerCharacteristic(string targetConnectionId, string characteristicName)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може регенерувати характеристики");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !room.Players.TryGetValue(targetConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            // Генеруємо нового персонажа для отримання нової характеристики
            var tempPlayer = _generator.Generate("temp");
            
            bool success = CopyCharacteristic(player, tempPlayer, characteristicName);
            
            if (!success)
            {
                await Clients.Caller.SendAsync("ReceiveError", $"Не вдалося регенерувати характеристику: {characteristicName}");
                return;
            }

            _roomService.UpdatePlayer(targetConnectionId, player);

            await Clients.Client(targetConnectionId).SendAsync("CharacteristicRegenerated", new
            {
                characteristicName = characteristicName,
                player = player
            });

            await Clients.Caller.SendAsync("GMActionSuccess", new
            {
                action = "regenerate",
                playerName = player.Name,
                characteristicName = characteristicName
            });

            // Якщо характеристика вже була розкрита - оновлюємо для всіх
            if (IsCharacteristicRevealed(player, characteristicName))
            {
                var revealedData = GetRevealedDataForCharacteristic(player, characteristicName);
                await Clients.Group(room.Id).SendAsync("CharacteristicUpdated", new
                {
                    connectionId = targetConnectionId,
                    playerName = player.Name,
                    characteristicKey = characteristicName,
                    data = revealedData
                });
            }

            _logger.LogInformation($"GM регенерував {characteristicName} гравця {player.Name}");
        }

        /// <summary>
        /// Примусово розкрити характеристику гравця (тільки хост)
        /// </summary>
        public async Task ForceRevealCharacteristic(string targetConnectionId, string characteristicName)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може примусово розкривати характеристики");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !room.Players.TryGetValue(targetConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            if (IsCharacteristicRevealed(player, characteristicName))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Характеристика вже розкрита");
                return;
            }

            SetCharacteristicRevealed(player, characteristicName);
            _roomService.UpdatePlayer(targetConnectionId, player);

            var revealedData = GetRevealedDataForCharacteristic(player, characteristicName);

            await Clients.Group(room.Id).SendAsync("CharacteristicRevealed", new
            {
                playerName = player.Name,
                connectionId = targetConnectionId,
                characteristicKey = characteristicName,
                data = revealedData,
                forcedByGM = true
            });

            _logger.LogInformation($"GM примусово розкрив {characteristicName} гравця {player.Name}");
        }

        /// <summary>
        /// Підглянути приховану характеристику (тільки хост, тільки для себе)
        /// НЕ розкриває характеристику для інших гравців
        /// </summary>
        public async Task PeekCharacteristic(string targetConnectionId, string characteristicName)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може підглядати характеристики");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !room.Players.TryGetValue(targetConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            var revealedData = GetRevealedDataForCharacteristic(player, characteristicName);
            if (revealedData == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", $"Невідома характеристика: {characteristicName}");
                return;
            }

            // Відправляємо ТІЛЬКИ хосту — НЕ розкриваємо для інших
            await Clients.Caller.SendAsync("CharacteristicPeeked", new
            {
                playerName = player.Name,
                connectionId = targetConnectionId,
                characteristicKey = characteristicName,
                data = revealedData,
                isRevealed = IsCharacteristicRevealed(player, characteristicName)
            });

            _logger.LogInformation($"GM підглянув {characteristicName} гравця {player.Name}");
        }

        /// <summary>
        /// Змінити кількість слотів бункера (тільки хост)
        /// </summary>
        public async Task UpdateBunkerCapacity(int newCapacity)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може змінювати слоти бункера");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || room.Bunker == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Бункер не знайдено");
                return;
            }

            newCapacity = Math.Clamp(newCapacity, 1, room.PlayerCount);
            room.Bunker.Capacity = newCapacity;

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId)!;
            await Clients.Group(roomId).SendAsync("BunkerCapacityUpdated", new
            {
                capacity = newCapacity,
                bunker = room.Bunker.ToClientInfo()
            });

            _logger.LogInformation($"GM змінив кількість слотів бункера на {newCapacity} в кімнаті {room.Name}");
        }

        /// <summary>
        /// Змінити бункер на інший (тільки хост)
        /// </summary>
        public async Task RegenerateBunker()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може змінювати бункер");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            if (_gameData.Bunkers.Count == 0)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає доступних бункерів");
                return;
            }

            room.Bunker = _gameData.Bunkers[_random.Next(_gameData.Bunkers.Count)];

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId)!;
            await Clients.Group(roomId).SendAsync("BunkerChanged", new
            {
                bunker = room.Bunker.ToClientInfo()
            });

            _logger.LogInformation($"GM змінив бункер на {room.Bunker.Name} в кімнаті {room.Name}");
        }

        /// <summary>
        /// Змінити апокаліпсис (тільки хост)
        /// </summary>
        public async Task RegenerateApocalypse()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може змінювати апокаліпсис");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            if (_gameData.Apocalypses.Count == 0)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає доступних апокаліпсисів");
                return;
            }

            room.Apocalypse = _gameData.Apocalypses[_random.Next(_gameData.Apocalypses.Count)];

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId)!;
            await Clients.Group(roomId).SendAsync("ApocalypseChanged", new
            {
                apocalypse = room.Apocalypse.ToClientInfo()
            });

            _logger.LogInformation($"GM змінив апокаліпсис на {room.Apocalypse.Name} в кімнаті {room.Name}");
        }

        /// <summary>
        /// Відправити подію гри (тільки хост)
        /// </summary>
        public async Task SendGameEvent(string eventText, string eventType)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може створювати події");
                return;
            }

            if (string.IsNullOrWhiteSpace(eventText))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Текст події не може бути порожнім");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            if (roomId == null) return;

            // Валідуємо тип
            var validTypes = new[] { "info", "warning", "danger", "success", "catastrophe" };
            if (!validTypes.Contains(eventType))
                eventType = "info";

            await Clients.Group(roomId).SendAsync("GameEvent", new
            {
                text = eventText,
                type = eventType,
                timestamp = DateTime.UtcNow.ToString("HH:mm:ss")
            });

            _logger.LogInformation($"GM створив подію типу {eventType} в кімнаті {roomId}");
        }

        /// <summary>
        /// Застосувати ефект події (тільки хост)
        /// </summary>
        public async Task ApplyEventEffect(string eventId)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може застосовувати ефекти подій");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null) return;

            // Тут можна додати логіку для конкретних ефектів
            // Наприклад, зміна ресурсів бункера
            string effectDescription = "Ефект застосовано";
            
            // Приклад: якщо eventId містить інформацію про ефект
            // Можна розширити цю логіку для різних типів ефектів
            
            await Clients.Group(room.Id).SendAsync("EventEffectApplied", new
            {
                eventId = eventId,
                effectDescription = effectDescription,
                bunker = room.Bunker?.ToClientInfo()
            });

            _logger.LogInformation($"Ефект події {eventId} застосовано в кімнаті {room.Name}");
        }

        /// <summary>
        /// Відправити нову подію з ефектом всім гравцям
        /// </summary>
        public async Task TriggerNewEvent(string eventName, string eventDescription, string effectType = null, int? effectValue = null)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може створювати події");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            if (roomId == null) return;

            var eventData = new
            {
                id = Guid.NewGuid().ToString(),
                name = eventName,
                description = eventDescription,
                effect = effectType != null ? new { type = effectType, value = effectValue } : null,
                createdAt = DateTime.UtcNow
            };

            await Clients.Group(roomId).SendAsync("NewGameEvent", eventData);

            _logger.LogInformation($"Нова подія '{eventName}' створена в кімнаті {roomId}");
        }

        /// <summary>
        /// Елімінувати гравця (тільки хост)
        /// </summary>
        public async Task EliminatePlayer(string targetConnectionId)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може елімінувати гравців");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !room.Players.TryGetValue(targetConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            player.IsEliminated = true;
            _roomService.UpdatePlayer(targetConnectionId, player);

            await Clients.Group(room.Id).SendAsync("PlayerEliminated", new
            {
                connectionId = targetConnectionId,
                playerName = player.Name
            });

            _logger.LogInformation($"Гравець {player.Name} елімінований");
        }

        /// <summary>
        /// Повернути елімінованого гравця (тільки хост)
        /// </summary>
        public async Task RestorePlayer(string targetConnectionId)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може повертати гравців");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !room.Players.TryGetValue(targetConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            player.IsEliminated = false;
            _roomService.UpdatePlayer(targetConnectionId, player);

            await Clients.Group(room.Id).SendAsync("PlayerRestored", new
            {
                connectionId = targetConnectionId,
                playerName = player.Name
            });

            _logger.LogInformation($"Гравець {player.Name} повернутий в гру");
        }

        // Допоміжні методи для GM

        private bool IsCharacteristicRevealed(Player player, string characteristicName)
        {
            return characteristicName switch
            {
                "Personality" => player.Revealed.Personality,
                "Body" => player.Revealed.Body,
                "Profession" => player.Revealed.Profession,
                "PhysicalHealth" => player.Revealed.PhysicalHealth,
                "MentalHealth" => player.Revealed.MentalHealth,
                "Hobby" => player.Revealed.Hobby,
                "CharacterTrait" => player.Revealed.CharacterTrait,
                "Phobia" => player.Revealed.Phobia,
                "Traits" => player.Revealed.Traits,
                "Inventory" => player.Revealed.Inventory,
                "Secret" => player.Revealed.Secret,
                "SecretGoal" => player.Revealed.SecretGoal,
                _ => false
            };
        }

        private bool ApplyCharacteristicChange(Player player, string characteristicName, string newValue)
        {
            try
            {
                switch (characteristicName)
                {
                    case "Profession":
                        player.Profession.Name = newValue;
                        break;
                    case "PhysicalHealth":
                        player.PhysicalHealth.Name = newValue;
                        break;
                    case "MentalHealth":
                        player.MentalHealth.Name = newValue;
                        break;
                    case "Hobby":
                        player.Hobby.Name = newValue;
                        break;
                    case "CharacterTrait":
                        player.CharacterTrait.Name = newValue;
                        break;
                    case "Phobia":
                        player.Phobia.Name = newValue;
                        break;
                    case "Traits":
                        player.Traits.Name = newValue;
                        break;
                    case "Secret":
                        player.Secret.Name = newValue;
                        break;
                    case "SecretGoal":
                        player.SecretGoal.Goal = newValue;
                        break;
                    default:
                        return false;
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        private bool ClearCharacteristic(Player player, string characteristicName)
        {
            try
            {
                switch (characteristicName)
                {
                    case "Profession":
                        player.Profession = new Profession();
                        break;
                    case "PhysicalHealth":
                        player.PhysicalHealth = new PhysicalHealth();
                        break;
                    case "MentalHealth":
                        player.MentalHealth = new MentalHealth();
                        break;
                    case "Hobby":
                        player.Hobby = new Hobby();
                        break;
                    case "CharacterTrait":
                        player.CharacterTrait = new CharacterTrait();
                        break;
                    case "Phobia":
                        player.Phobia = new Phobia();
                        break;
                    case "Traits":
                        player.Traits = new Traits();
                        break;
                    case "Secret":
                        player.Secret = new Secret();
                        break;
                    case "SecretGoal":
                        player.SecretGoal = new SecretGoal();
                        break;
                    case "Inventory":
                        player.Inventory = new Inventory();
                        break;
                    default:
                        return false;
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        private bool CopyCharacteristic(Player target, Player source, string characteristicName)
        {
            try
            {
                switch (characteristicName)
                {
                    case "Personality":
                        target.Personality = source.Personality;
                        break;
                    case "Body":
                        target.Body = source.Body;
                        break;
                    case "Profession":
                        target.Profession = source.Profession;
                        break;
                    case "PhysicalHealth":
                        target.PhysicalHealth = source.PhysicalHealth;
                        break;
                    case "MentalHealth":
                        target.MentalHealth = source.MentalHealth;
                        break;
                    case "Hobby":
                        target.Hobby = source.Hobby;
                        break;
                    case "CharacterTrait":
                        target.CharacterTrait = source.CharacterTrait;
                        break;
                    case "Phobia":
                        target.Phobia = source.Phobia;
                        break;
                    case "Traits":
                        target.Traits = source.Traits;
                        break;
                    case "Secret":
                        target.Secret = source.Secret;
                        break;
                    case "SecretGoal":
                        target.SecretGoal = source.SecretGoal;
                        break;
                    case "Inventory":
                        target.Inventory = source.Inventory;
                        break;
                    default:
                        return false;
                }
                return true;
            }
            catch
            {
                return false;
            }
        }

        #endregion

        #region Special Cards

        /// <summary>
        /// Використати карту (запит на підтвердження)
        /// </summary>
        public async Task UseCard(string cardId, string? targetPlayerId = null, string? targetCharacteristic = null)
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var player = _roomService.GetPlayer(Context.ConnectionId);
            
            if (roomId == null || player == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }
            
            var card = player.Cards.FirstOrDefault(c => c.Id == cardId);
            if (card == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Карта не знайдена");
                return;
            }
            
            if (card.State != CardState.Available)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Карта вже використана або очікує підтвердження");
                return;
            }
            
            card.TargetPlayerId = targetPlayerId;
            card.TargetCharacteristic = targetCharacteristic;
            card.RequestedAt = DateTime.UtcNow;
            
            if (card.RequiresApproval)
            {
                card.State = CardState.Pending;
                _roomService.UpdatePlayer(Context.ConnectionId, player);
                
                var room = _roomService.GetRoom(roomId);
                
                // Повідомляємо хоста про запит
                await Clients.Client(room!.HostConnectionId).SendAsync("CardApprovalRequest", new
                {
                    card = card.ToClientInfo(),
                    playerName = player.Name,
                    playerConnectionId = Context.ConnectionId,
                    targetPlayerName = targetPlayerId != null && room.Players.ContainsKey(targetPlayerId) 
                        ? room.Players[targetPlayerId].Name 
                        : null
                });
                
                // Повідомляємо гравця
                await Clients.Caller.SendAsync("CardPending", card.ToClientInfo());
                
                _logger.LogInformation($"Гравець {player.Name} запросив використання карти {card.Name}");
            }
            else
            {
                // Карта не потребує підтвердження - виконуємо одразу
                await ExecuteCard(player, card, roomId);
            }
        }



        /// <summary>
        /// Підтвердити використання карти (тільки хост)
        /// </summary>
        public async Task ApproveCard(string playerConnectionId, string cardId)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може підтверджувати карти");
                return;
            }
            
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var player = _roomService.GetPlayer(playerConnectionId);
            
            if (roomId == null || player == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }
            
            var card = player.Cards.FirstOrDefault(c => c.Id == cardId);
            if (card == null || card.State != CardState.Pending)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Карта не знайдена або не очікує підтвердження");
                return;
            }
            
            await ExecuteCard(player, card, roomId);
            
            _logger.LogInformation($"Хост підтвердив карту {card.Name} гравця {player.Name}");
        }

        /// <summary>
        /// Відхилити використання карти (тільки хост)
        /// </summary>
        public async Task RejectCard(string playerConnectionId, string cardId, string? reason = null)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може відхиляти карти");
                return;
            }
            
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var player = _roomService.GetPlayer(playerConnectionId);
            
            if (roomId == null || player == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }
            
            var card = player.Cards.FirstOrDefault(c => c.Id == cardId);
            if (card == null || card.State != CardState.Pending)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Карта не знайдена або не очікує підтвердження");
                return;
            }
            
            card.State = CardState.Rejected;
            card.ResolvedAt = DateTime.UtcNow;
            _roomService.UpdatePlayer(playerConnectionId, player);
            
            // Повідомляємо гравця про відхилення
            await Clients.Client(playerConnectionId).SendAsync("CardRejected", new
            {
                card = card.ToClientInfo(),
                reason = reason ?? "Хост відхилив карту"
            });
            
            // Повідомляємо хоста
            await Clients.Caller.SendAsync("GMActionSuccess", new
            {
                action = "rejectCard",
                playerName = player.Name,
                cardName = card.Name
            });
            
            _logger.LogInformation($"Хост відхилив карту {card.Name} гравця {player.Name}");
        }

        /// <summary>
        /// Видати карту гравцю (тільки хост)
        /// </summary>
        public async Task GiveCard(string targetConnectionId, string cardTemplateId)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може видавати карти");
                return;
            }
            
            var player = _roomService.GetPlayer(targetConnectionId);
            if (player == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }
            
            var card = _cardService.CreateCardFromTemplateId(cardTemplateId, targetConnectionId);
            if (card == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Шаблон карти не знайдено");
                return;
            }
            
            player.Cards.Add(card);
            _roomService.UpdatePlayer(targetConnectionId, player);
            
            // Повідомляємо гравця про нову карту
            await Clients.Client(targetConnectionId).SendAsync("CardReceived", card.ToClientInfo());
            
            // Повідомляємо хоста
            await Clients.Caller.SendAsync("GMActionSuccess", new
            {
                action = "giveCard",
                playerName = player.Name,
                cardName = card.Name
            });
            
            _logger.LogInformation($"Хост видав карту {card.Name} гравцю {player.Name}");
        }

        /// <summary>
        /// Отримати список всіх шаблонів карт (для хоста)
        /// </summary>
        public async Task GetCardTemplates()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може бачити шаблони карт");
                return;
            }
            
            var templates = _cardService.GetAllTemplates().Select(t => new
            {
                t.Id,
                t.Name,
                t.Description,
                t.EffectType,
                t.Rarity,
                t.RequiresApproval,
                t.RequiresTarget,
                t.RequiresCharacteristic
            });
            
            await Clients.Caller.SendAsync("CardTemplatesReceived", templates);
        }

        /// <summary>
        /// Виконати ефект карти
        /// </summary>
        private async Task ExecuteCard(Player player, SpecialCard card, string roomId)
        {
            
            
            card.State = CardState.Used;
            card.ResolvedAt = DateTime.UtcNow;
            
            var room = _roomService.GetRoom(roomId);
            if (room == null) return;
            
            string resultMessage = "";
            
            switch (card.EffectType)
            {
                case CardEffectType.RevealOther:
                    if (!string.IsNullOrEmpty(card.TargetPlayerId) && room.Players.TryGetValue(card.TargetPlayerId, out var targetPlayer))
                    {
                        var charName = !string.IsNullOrEmpty(card.EffectValue) ? card.EffectValue : card.TargetCharacteristic;
                        if (!string.IsNullOrEmpty(charName))
                        {
                            SetCharacteristicRevealed(targetPlayer, charName);
                            _roomService.UpdatePlayer(card.TargetPlayerId, targetPlayer);
                            
                            var revealedData = GetRevealedDataForCharacteristic(targetPlayer, charName);
                            await Clients.Group(roomId).SendAsync("CharacteristicRevealed", new
                            {
                                playerName = targetPlayer.Name,
                                connectionId = card.TargetPlayerId,
                                characteristicKey = charName,
                                data = revealedData,
                                byCard = card.Name
                            });
                            
                            resultMessage = $"Розкрито {charName} гравця {targetPlayer.Name}";
                        }
                    }
                    break;
                    
                case CardEffectType.RegenerateOwn:
                    var tempPlayer = _generator.Generate("temp");
                    if (card.EffectValue == "all")
                    {
                        // Регенерувати все
                        player.Profession = tempPlayer.Profession;
                        player.PhysicalHealth = tempPlayer.PhysicalHealth;
                        player.MentalHealth = tempPlayer.MentalHealth;
                        player.Hobby = tempPlayer.Hobby;
                        player.CharacterTrait = tempPlayer.CharacterTrait;
                        player.Phobia = tempPlayer.Phobia;
                        player.Traits = tempPlayer.Traits;
                        resultMessage = "Всі характеристики регенеровано";
                    }
                    else if (!string.IsNullOrEmpty(card.EffectValue))
                    {
                        CopyCharacteristic(player, tempPlayer, card.EffectValue);
                        resultMessage = $"Регенеровано {card.EffectValue}";
                    }
                    break;
                    
                case CardEffectType.SwapCharacteristic:
                    if (!string.IsNullOrEmpty(card.TargetPlayerId) && room.Players.TryGetValue(card.TargetPlayerId, out var swapTarget))
                    {
                        var charToSwap = card.EffectValue;
                        if (!string.IsNullOrEmpty(charToSwap))
                        {
                            // Зберігаємо значення для обміну
                            var tempSwap = _generator.Generate("swap");
                            CopyCharacteristic(tempSwap, player, charToSwap);
                            CopyCharacteristic(player, swapTarget, charToSwap);
                            CopyCharacteristic(swapTarget, tempSwap, charToSwap);
                            
                            _roomService.UpdatePlayer(card.TargetPlayerId, swapTarget);
                            
                            // Повідомляємо обох гравців
                            await Clients.Client(card.TargetPlayerId).SendAsync("CharacteristicSwapped", new
                            {
                                characteristicName = charToSwap,
                                withPlayerName = player.Name,
                                player = swapTarget
                            });
                            
                            resultMessage = $"Обміняно {charToSwap} з {swapTarget.Name}";
                        }
                    }
                    break;
                    
                case CardEffectType.ViewSecret:
                    if (!string.IsNullOrEmpty(card.TargetPlayerId) && room.Players.TryGetValue(card.TargetPlayerId, out var secretTarget))
                    {
                        var secretType = card.EffectValue;
                        string secretValue = secretType switch
                        {
                            "Secret" => secretTarget.Secret.Name,
                            "SecretGoal" => secretTarget.SecretGoal.Goal,
                            _ => "Невідомо"
                        };
                        
                        // Відправляємо тільки власнику карти
                        await Clients.Caller.SendAsync("SecretViewed", new
                        {
                            targetPlayerName = secretTarget.Name,
                            secretType = secretType,
                            secretValue = secretValue
                        });
                        
                        resultMessage = $"Переглянуто {secretType} гравця {secretTarget.Name}";
                    }
                    break;
                    
                case CardEffectType.ProtectFromVote:
                    player.IsProtectedFromVote = true;
                    resultMessage = "Захист від голосування активовано";
                    break;
                    
                case CardEffectType.ExtraVote:
                    player.ExtraVotes += 1;
                    resultMessage = "Додатковий голос отримано";
                    break;
                    
                default:
                    resultMessage = $"Карта {card.Name} активована";
                    break;
            }

			_roomService.UpdatePlayer(player.ConnectionId, player);

			// Зберігаємо активовану карту в кімнаті для відновлення після refresh
			string? targetPlayerName = null;
			if (!string.IsNullOrEmpty(card.TargetPlayerId) && room.Players.TryGetValue(card.TargetPlayerId, out var targetForName))
			{
				targetPlayerName = targetForName.Name;
			}

			room.ActivatedCards.Add(new ActivatedCardInfo
			{
				CardId = card.Id,
				CardName = card.Name,
				Rarity = card.Rarity ?? "common",
				Description = card.Description ?? "",
				PlayerId = player.ConnectionId ?? "",
				PlayerName = player.Name,
				TargetPlayerId = card.TargetPlayerId,
				TargetPlayerName = targetPlayerName,
				TargetCharacteristic = card.TargetCharacteristic,
				ActivatedAt = DateTime.UtcNow
			});

			_logger.LogInformation("CARD SAVED TO ROOM. RoomId={RoomId}, Count={Count}, Card={CardName}, Player={PlayerName}",
				roomId,
				room.ActivatedCards.Count,
				card.Name,
				player.Name);

			// Повідомляємо гравця про успішне використання
			await Clients.Client(player.ConnectionId).SendAsync("CardUsed", new
			{
				card = card.ToClientInfo(),
				result = resultMessage
			});

			// Повідомляємо гравця про успішне використання
			await Clients.Client(player.ConnectionId).SendAsync("CardUsed", new
            {
                card = card.ToClientInfo(),
                result = resultMessage
            });

			// Повідомляємо всіх про використання карти (включаючи дані для таблиці)
			await Clients.Group(roomId).SendAsync("CardActivated", new
			{
				connectionId = player.ConnectionId,
				playerName = player.Name,
				card = new
				{
					name = card.Name,
					rarity = card.Rarity,
					description = card.Description
				}
			});
		}

        #endregion

        #region Voting System

        /// <summary>
        /// Почати голосування (тільки хост)
        /// </summary>
        public async Task StartVoting()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може почати голосування");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            if (room.State != RoomState.Playing)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гра не почалась");
                return;
            }

            if (room.CurrentVoting != null && room.CurrentVoting.State == VotingState.Active)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування вже триває");
                return;
            }

            // Створюємо нову сесію голосування
            var voting = new VotingSession
            {
                Round = room.CurrentRound
            };

            // Додаємо всіх не елімінованих гравців як eligible voters
            foreach (var player in room.Players.Values.Where(p => !p.IsEliminated))
            {
                voting.EligibleVoters.Add(player.ConnectionId);
            }

            room.CurrentVoting = voting;
            room.State = RoomState.Voting;

            // Повідомляємо всіх про початок голосування
            await Clients.Group(roomId).SendAsync("VotingStarted", new
            {
                votingId = voting.Id,
                round = voting.Round,
                eligibleVoters = voting.EligibleVoters.Count,
                candidates = room.Players.Values
                    .Where(p => !p.IsEliminated)
                    .Select(p => new { 
                        connectionId = p.ConnectionId, 
                        name = p.Name,
                        isProtected = p.IsProtectedFromVote,
                        extraVotes = p.ExtraVotes
                    })
            });

            _logger.LogInformation($"Голосування почалось в кімнаті {room.Name}, раунд {voting.Round}");
        }

        /// <summary>
        /// Проголосувати за гравця
        /// </summary>
        public async Task Vote(string targetConnectionId)
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null || room.CurrentVoting == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування не активне");
                return;
            }

            var voting = room.CurrentVoting;

            if (voting.State != VotingState.Active)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Голосування вже завершено");
                return;
            }

            if (!voting.EligibleVoters.Contains(Context.ConnectionId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не можете голосувати");
                return;
            }

            if (!room.Players.ContainsKey(targetConnectionId) || room.Players[targetConnectionId].IsEliminated)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недійсний кандидат");
                return;
            }

            // Перевірка захисту від голосування
            if (room.Players[targetConnectionId].IsProtectedFromVote)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Цей гравець захищений від голосування");
                return;
            }

            // Додаємо голос
            var alreadyVoted = voting.HasVoted(Context.ConnectionId);
            voting.AddVote(Context.ConnectionId, targetConnectionId);

            var voterName = room.Players.ContainsKey(Context.ConnectionId) ? room.Players[Context.ConnectionId].Name : "Unknown";

            // Повідомляємо гравця
            await Clients.Caller.SendAsync("VoteCast", new
            {
                targetConnectionId = targetConnectionId,
                targetName = room.Players[targetConnectionId].Name,
                changed = alreadyVoted
            });

            // Повідомляємо всіх про прогрес (без деталей хто за кого)
            await Clients.Group(roomId).SendAsync("VotingProgress", new
            {
                votedCount = voting.Votes.Count,
                totalVoters = voting.EligibleVoters.Count,
                allVoted = voting.AllVoted
            });

            // Якщо всі проголосували - автоматично завершуємо
            if (voting.AllVoted)
            {
                await EndVotingInternal(room, roomId);
            }

            _logger.LogInformation($"Гравець {voterName} проголосував у кімнаті {room.Name}");
        }

        /// <summary>
        /// Завершити голосування достроково (тільки хост)
        /// </summary>
        public async Task EndVoting()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може завершити голосування");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null || room.CurrentVoting == null || room.CurrentVoting.State != VotingState.Active)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає активного голосування");
                return;
            }

            await EndVotingInternal(room, roomId);
        }

        /// <summary>
        /// Внутрішній метод завершення голосування
        /// </summary>
        private async Task EndVotingInternal(Room room, string roomId)
        {
            var voting = room.CurrentVoting!;
            voting.State = VotingState.Completed;
            voting.EndedAt = DateTime.UtcNow;

            // Застосовуємо додаткові голоси від спеціальних карт
            // ExtraVotes додає "фантомні" голоси за того ж кандидата
            foreach (var voter in voting.Votes.ToList())
            {
                if (room.Players.TryGetValue(voter.Key, out var voterPlayer) && voterPlayer.ExtraVotes > 0)
                {
                    // Додаємо фантомні голоси (через окремий лічильник)
                    for (int i = 0; i < voterPlayer.ExtraVotes; i++)
                    {
                        var phantomVoterId = $"_extra_{voter.Key}_{i}";
                        voting.Votes[phantomVoterId] = voter.Value;
                    }
                }
            }

            // Повідомляємо всіх про результати
            await Clients.Group(roomId).SendAsync("VotingEnded", voting.ToClientInfo(room.Players, showVotes: true));

            _logger.LogInformation($"Голосування завершено в кімнаті {room.Name}");
        }

        /// <summary>
        /// Хост приймає рішення після голосування
        /// </summary>
        public async Task ResolveVoting(string? eliminateConnectionId)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може прийняти рішення");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null || room.CurrentVoting == null || room.CurrentVoting.State != VotingState.Completed)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає завершеного голосування для рішення");
                return;
            }

            var voting = room.CurrentVoting;
            voting.State = VotingState.Resolved;

            string resultMessage;
            string? eliminatedName = null;

            if (!string.IsNullOrEmpty(eliminateConnectionId) && room.Players.ContainsKey(eliminateConnectionId))
            {
                // Елімінуємо гравця
                var player = room.Players[eliminateConnectionId];
                player.IsEliminated = true;
                eliminatedName = player.Name;
                _roomService.UpdatePlayer(eliminateConnectionId, player);
                resultMessage = $"Гравець {eliminatedName} елімінований за рішенням ведучого";
            }
            else
            {
                resultMessage = "Ведучий вирішив нікого не елімінувати";
            }

            // Повертаємо стан гри
            room.State = RoomState.Playing;
            room.CurrentRound++;
            room.CurrentVoting = null;

            // Скидаємо одноразові ефекти карт (захист, додаткові голоси)
            foreach (var p in room.Players.Values)
            {
                p.IsProtectedFromVote = false;
                p.ExtraVotes = 0;
            }

            // Повідомляємо всіх
            await Clients.Group(roomId).SendAsync("VotingResolved", new
            {
                eliminatedConnectionId = eliminateConnectionId,
                eliminatedName = eliminatedName,
                message = resultMessage,
                nextRound = room.CurrentRound
            });

            if (!string.IsNullOrEmpty(eliminateConnectionId))
            {
                await Clients.Group(roomId).SendAsync("PlayerEliminated", new
                {
                    connectionId = eliminateConnectionId,
                    playerName = eliminatedName
                });
            }

            _logger.LogInformation($"Голосування вирішено в кімнаті {room.Name}: {resultMessage}");
        }

        /// <summary>
        /// Скасувати голосування (тільки хост)
        /// </summary>
        public async Task CancelVoting()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може скасувати голосування");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;

            if (room == null || room.CurrentVoting == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Немає голосування для скасування");
                return;
            }

            room.CurrentVoting = null;
            room.State = RoomState.Playing;

            await Clients.Group(roomId).SendAsync("VotingCancelled", new
            {
                message = "Голосування скасовано ведучим"
            });

            _logger.LogInformation($"Голосування скасовано в кімнаті {room.Name}");
        }

        #endregion

        #region Connection Lifecycle

        public override async Task OnDisconnectedAsync(Exception? exception)
        {
            var disconnectedId = Context.ConnectionId;
            var roomId = _roomService.GetPlayerRoomId(disconnectedId);
            
            if (roomId != null)
            {
                // Даємо 5 секунд на перепідключення (page refresh)
                _ = Task.Run(async () =>
                {
					await Task.Delay(TimeSpan.FromSeconds(5000));

					// Перевіряємо чи гравець вже перепідключився (connectionId змінився)
					var currentRoomId = _roomService.GetPlayerRoomId(disconnectedId);
                    if (currentRoomId == null)
                    {
                        // Вже видалений або перепідключився з новим connectionId
                        return;
                    }
                    
                    // Гравець не перепідключився — видаляємо
                    var (room, roomDeleted, newHostConnectionId) = _roomService.RemoveDisconnectedPlayer(disconnectedId);
                    
                    if (room != null && !roomDeleted)
                    {
                        await Clients.Group(room.Id).SendAsync("PlayerLeftRoom", new
                        {
                            connectionId = disconnectedId,
                            newHostConnectionId = newHostConnectionId,
                            newHostName = newHostConnectionId != null && room.Players.ContainsKey(newHostConnectionId)
                                ? room.Players[newHostConnectionId].Name
                                : (string?)null
                        });
                        
                        await Clients.All.SendAsync("RoomsListUpdated", _roomService.GetAllRooms());
                    }
                });
            }

            await base.OnDisconnectedAsync(exception);
        }

        #endregion
    }
}
