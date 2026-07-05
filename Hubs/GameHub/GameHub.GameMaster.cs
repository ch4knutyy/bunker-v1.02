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
        #region Game Master Actions

        /// <summary>
        /// Перевірка чи гравець є хостом
        /// </summary>
        private bool IsCallerHost()
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            return room != null &&
                _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var player) &&
                room.IsHost(player);
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
                physicalHealth = p.PhysicalHealth,
                mentalHealth = p.MentalHealth,
                hobby = new { p.Hobby.Name },
                characterTrait = new { p.CharacterTrait.Name },
                phobia = new { p.Phobia.Name },
                inventory = p.Inventory.Items.Select(i => i.Name),
				fact = new { p.Fact.Type, p.Fact.Name, p.Fact.Description, Tooltip = CleanTooltip(p.Fact.Tooltip) },
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

            characteristicName = NormalizeCharacteristicName(characteristicName);

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
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

            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            // Повідомляємо гравця про зміну
            await Clients.Client(targetCurrentConnectionId).SendAsync("CharacteristicEdited", new
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
                    connectionId = targetCurrentConnectionId,
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

            characteristicName = NormalizeCharacteristicName(characteristicName);

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
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

            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            await Clients.Client(targetCurrentConnectionId).SendAsync("CharacteristicCleared", new
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
                    connectionId = targetCurrentConnectionId,
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

            characteristicName = NormalizeCharacteristicName(characteristicName);

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
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

            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            await Clients.Client(targetCurrentConnectionId).SendAsync("CharacteristicRegenerated", new
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
                    connectionId = targetCurrentConnectionId,
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

            characteristicName = NormalizeCharacteristicName(characteristicName);

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
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
            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            var revealedData = GetRevealedDataForCharacteristic(player, characteristicName);

            await Clients.Group(room.Id).SendAsync("CharacteristicRevealed", new
            {
                playerName = player.Name,
                connectionId = targetCurrentConnectionId,
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

            characteristicName = NormalizeCharacteristicName(characteristicName);

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
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
                connectionId = targetCurrentConnectionId,
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
        /// Додати випадкову кількість запасів до бункера (тільки хост)
        /// </summary>
        public async Task AddBunkerSupplies()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може додавати запаси");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null) return;

            if (room.Bunker == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Бункер не визначено");
                return;
            }

            // Генеруємо випадкову кількість місяців 1-12
            int addedMonths = _random.Next(1, 13);
            
            // Додаємо до поточних запасів
            room.Bunker.SuppliesMonths += addedMonths;

            _logger.LogInformation($"GM додав {addedMonths} місяців запасів до бункера в кімнаті {room.Name}. Всього: {room.Bunker.SuppliesMonths}");

            // Надсилаємо оновлення всім гравцям
            await Clients.Group(room.Id).SendAsync("BunkerSuppliesAdded", new
            {
                addedMonths = addedMonths,
                totalSuppliesMonths = room.Bunker.SuppliesMonths,
                bunker = room.Bunker.ToClientInfo()
            });
        }

        /// <summary>
        /// Зменшити запаси бункера (тільки хост)
        /// </summary>
        public async Task RemoveBunkerSupplies(int months)
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може змінювати запаси");
                return;
            }

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null) return;

            if (room.Bunker == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Бункер не визначено");
                return;
            }

            // Забираємо місяці (мінімум 0)
            int removedMonths = Math.Min(months, room.Bunker.SuppliesMonths);
            room.Bunker.SuppliesMonths = Math.Max(0, room.Bunker.SuppliesMonths - months);

            _logger.LogInformation($"GM зняв {removedMonths} місяців запасів з бункера в кімнаті {room.Name}. Залишилось: {room.Bunker.SuppliesMonths}");

            // Надсилаємо оновлення всім гравцям
            await Clients.Group(room.Id).SendAsync("BunkerSuppliesRemoved", new
            {
                removedMonths = removedMonths,
                totalSuppliesMonths = room.Bunker.SuppliesMonths,
                bunker = room.Bunker.ToClientInfo()
            });
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
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            player.IsEliminated = true;
            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            await Clients.Group(room.Id).SendAsync("PlayerEliminated", new
            {
                connectionId = targetCurrentConnectionId,
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
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            player.IsEliminated = false;
            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            await Clients.Group(room.Id).SendAsync("PlayerRestored", new
            {
                connectionId = targetCurrentConnectionId,
                playerName = player.Name
            });

            _logger.LogInformation($"Гравець {player.Name} повернутий в гру");
        }

        // Допоміжні методи для GM

        private bool IsCharacteristicRevealed(Player player, string characteristicName)
        {
            characteristicName = NormalizeCharacteristicName(characteristicName);
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
                "Inventory" => player.Revealed.Inventory,
                "Fact" => player.Revealed.Fact,
				_ => false
            };
        }

        private bool ApplyCharacteristicChange(Player player, string characteristicName, string newValue)
        {
            characteristicName = NormalizeCharacteristicName(characteristicName);
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
                    case "Fact":
						player.Fact.Name = newValue;
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
            characteristicName = NormalizeCharacteristicName(characteristicName);
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
                    case "Inventory":
                        player.Inventory = new Inventory();
                        break;
                    case "Fact":
						var tempPlayer = _generator.Generate(player.Name);
						player.Fact = tempPlayer.Fact;
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
            characteristicName = NormalizeCharacteristicName(characteristicName);
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
                    case "Inventory":
                        target.Inventory = source.Inventory;
                        break;
                    case "Fact":
						target.Fact = source.Fact;
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
    }
}


