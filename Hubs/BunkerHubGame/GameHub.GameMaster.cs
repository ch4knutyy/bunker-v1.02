using Bunker.Models;
using Bunker.Models.GameData;
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

            var playersData = RoomService.GetPlayersSnapshot(room).Select(entry =>
            {
                var p = entry.Value;
                RemoveCorruptedAdditionalConditions(room, p);

                return new
                {
                    connectionId = string.IsNullOrWhiteSpace(p.ConnectionId) ? entry.Key : p.ConnectionId,
                    stablePlayerId = RoomService.GetPlayerKey(p),
                    name = p.Name ?? "Unknown",
                    seatNumber = p.SeatNumber,
                    isEliminated = p.IsEliminated,
                    eliminatedAtRound = p.EliminatedAtRound,
                    eliminatedByVote = p.EliminatedByVote,
                    canRevealAllAfterElimination = p.CanRevealAllAfterElimination,
                    hasRevealedAllAfterElimination = p.HasRevealedAllAfterElimination,
                    personality = new { p.Personality.Age, p.Personality.Sex, p.Personality.SexOrientation, p.Personality.IsChildfree },
                    body = new { p.Body.Height, p.Body.Weight, p.Body.BodyType },
                    profession = new { p.Profession.Name, p.Profession.ExperienceYears, p.Profession.SelectedItem, p.Profession.SelectedItemIndex, ProfessionItem = p.ProfessionItem },
                    physicalHealth = p.PhysicalHealth,
                    additionalConditionEffects = p.AdditionalConditionEffects,
                    mentalHealth = p.MentalHealth,
                    hobby = new { p.Hobby.Name },
                    characterTrait = new { p.CharacterTrait.Name },
                    phobia = new { p.Phobia.Name },
                    inventory = p.Inventory.Items.Select(i => i.Name),
				    fact = new { p.Fact.Type, p.Fact.Name, p.Fact.Description, Tooltip = CleanTooltip(p.Fact.Tooltip) },
                    specialCardCount = GetPlayerSpecialCards(p).Count,
				    revealed = p.Revealed
                };
            }).ToList();

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
            if (await RejectHiddenSpecialCardAccess(characteristicName)) return;

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

            await BroadcastRoundStateAfterSpecialCardChange(room, characteristicName);

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
            if (await RejectHiddenSpecialCardAccess(characteristicName)) return;

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

            await BroadcastRoundStateAfterSpecialCardChange(room, characteristicName);

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
            if (await RejectHiddenSpecialCardAccess(characteristicName)) return;

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

            await BroadcastRoundStateAfterSpecialCardChange(room, characteristicName);

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
            if (await RejectHiddenSpecialCardAccess(characteristicName)) return;

            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }

            if (room.State != RoomState.Playing)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гра ще не почалась. Розкривати характеристики можна тільки після старту гри.");
                return;
            }

            if (room.CurrentPhase != GamePhase.RoundReveal)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Зараз не фаза розкриття характеристик");
                return;
            }

            if (room.CurrentRound <= 0)
            {
                room.CurrentRound = 1;
            }

            room.CurrentRoundReveals ??= new();
            var playerKey = RoomService.GetPlayerKey(player);
            if (room.CurrentRoundReveals.ContainsKey(playerKey))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Цей гравець уже розкрив характеристику в поточному раунді");
                return;
            }

            if (IsCharacteristicRevealed(player, characteristicName))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Характеристика вже розкрита");
                return;
            }

            SetCharacteristicRevealed(player, characteristicName);
            room.CurrentRoundReveals[playerKey] = characteristicName;
            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            var revealedData = GetRevealedDataForCharacteristic(player, characteristicName);
            var roundState = BuildRoundState(room);

            await Clients.Group(room.Id).SendAsync("CharacteristicRevealed", new
            {
                playerName = player.Name,
                connectionId = targetCurrentConnectionId,
                characteristicKey = characteristicName,
                data = revealedData,
                forcedByGM = true,
                currentRound = room.CurrentRound,
                roundState
            });

            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", roundState);

            _logger.LogInformation($"GM примусово розкрив {characteristicName} гравця {player.Name}");
        }

        /// <summary>
        /// Завершити поточний reveal-раунд. Голосування відкривається тільки після 3-го раунду.
        /// </summary>
        public async Task EndRound()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може завершити раунд");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            if (string.IsNullOrWhiteSpace(roomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var room = _roomService.GetRoom(roomId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            if (room.State != RoomState.Playing || room.CurrentPhase != GamePhase.RoundReveal)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Раунд можна завершити тільки під час фази розкриття характеристик");
                return;
            }

            if (!HaveAllActivePlayersRevealedThisRound(room))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Не всі активні гравці відкрили характеристику в цьому раунді");
                return;
            }

            var completedRound = room.CurrentRound <= 0 ? 1 : room.CurrentRound;
            room.CurrentPhase = GamePhase.RoundEnded;

            await Clients.Group(roomId).SendAsync("RoundEnded", new
            {
                completedRound,
                roundState = BuildRoundState(room)
            });

            if (completedRound < 3)
            {
                RestoreExpiredTemporarySpecialCardEffects(room, completedRound);
                room.CurrentRound = completedRound + 1;
                room.CurrentRoundReveals.Clear();
                room.VotingReadyResponses.Clear();
                room.CurrentPhase = GamePhase.RoundReveal;

                var nextRoundState = BuildRoundState(room);
                await Clients.Group(roomId).SendAsync("RoundAdvanced", new
                {
                    completedRound,
                    currentRound = room.CurrentRound,
                    roundState = nextRoundState
                });
                await Clients.Group(roomId).SendAsync("RoundStateUpdated", nextRoundState);

                _logger.LogInformation("Раунд {CompletedRound} завершено в кімнаті {RoomName}, стартував раунд {CurrentRound}", completedRound, room.Name, room.CurrentRound);
                return;
            }

            if (completedRound == 3)
            {
                room.VotingReadyResponses.Clear();
                room.CurrentThreat ??= DrawThreatForRound(room, completedRound);
                room.IsThreatRevealed = true;
                room.ThreatRevealedAtRound = completedRound;
                EnsureRadiationThreatState(room);
                room.CurrentPhase = GamePhase.Threat;

                var threatState = BuildRoundState(room);
                await Clients.Group(roomId).SendAsync("ThreatRevealed", new
                {
                    completedRound,
                    threat = room.CurrentThreat,
                    roundState = threatState
                });
                await Clients.Group(roomId).SendAsync("RoundStateUpdated", threatState);

                var additionalInventory = GrantAdditionalInventoryAfterRound3(room);
                room.CurrentPhase = GamePhase.ExtraInventory;

                var extraInventoryState = BuildRoundState(room);
                await Clients.Group(roomId).SendAsync("AdditionalInventoryGranted", new
                {
                    completedRound,
                    grants = additionalInventory,
                    roundState = extraInventoryState
                });
                await Clients.Group(roomId).SendAsync("RoundStateUpdated", extraInventoryState);

                _logger.LogInformation("Раунд 3 завершено в кімнаті {RoomName}: відкрито загрозу та видано додатковий інвентар", room.Name);
                return;
            }

            room.CurrentPhase = GamePhase.PreVotingReadyCheck;
            var postRoundState = BuildRoundState(room);
            await Clients.Group(roomId).SendAsync("VotingReadyCheckStarted", new
            {
                round = room.CurrentRound,
                message = "Всі готові до голосування?",
                roundState = postRoundState
            });
            await Clients.Group(roomId).SendAsync("RoundStateUpdated", postRoundState);
        }

        /// <summary>
        /// Кинути кубик після того, як усі активні гравці відкрили характеристику в раунді.
        /// </summary>
        public async Task RollRoundDice()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може кидати кубик");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            if (string.IsNullOrWhiteSpace(roomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var room = _roomService.GetRoom(roomId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            if (room.State != RoomState.Playing || room.CurrentPhase != GamePhase.RoundReveal)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кубик можна кидати тільки під час фази розкриття характеристик");
                return;
            }

            if (!HaveAllActivePlayersRevealedThisRound(room))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кубик доступний після reveal усіх активних гравців");
                return;
            }

            var round = room.CurrentRound <= 0 ? 1 : room.CurrentRound;
            room.RoundDiceRolls ??= new();
            if (room.RoundDiceRolls.ContainsKey(round))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кубик у цьому раунді вже кинуто");
                return;
            }

            _roomService.TryResolvePlayer(room, Context.ConnectionId, out var hostConnectionId, out var hostPlayer);
            var roll = new RoundDiceRoll
            {
                Round = round,
                Value = _random.Next(1, 7),
                RolledAt = DateTime.UtcNow,
                RolledByConnectionId = hostConnectionId ?? Context.ConnectionId,
                RolledByPlayerId = hostPlayer == null ? "" : RoomService.GetPlayerKey(hostPlayer),
                RolledByPlayerName = hostPlayer?.Name ?? "GM"
            };

            room.RoundDiceRolls[round] = roll;
            var roundState = BuildRoundState(room);

            await Clients.Group(roomId).SendAsync("RoundDiceRolled", new
            {
                roll,
                diceRoll = roll,
                roundState,
                message = $"Кубик: {roll.Value}"
            });
            await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);

            _logger.LogInformation(
                "Хост {HostName} кинув кубик у кімнаті {RoomName}, раунд {Round}: {Value}",
                roll.RolledByPlayerName,
                room.Name,
                roll.Round,
                roll.Value);
        }

        /// <summary>
        /// Позначити, що група готова переходити до голосування.
        /// </summary>
        public async Task StartVotingReadyCheck()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може запускати готовність до голосування");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            if (string.IsNullOrWhiteSpace(roomId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            var room = _roomService.GetRoom(roomId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }

            if (room.State != RoomState.Playing || room.CurrentRound < 3 || room.CurrentPhase != GamePhase.ExtraInventory)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Готовність до голосування доступна тільки після завершення 3 раунду, загрози та додаткового інвентарю");
                return;
            }

            var threatState = EnsureRadiationThreatState(room);
            if (IsRadiationThreatActive(room, threatState) && !threatState.Resolution.EffectsApplied)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Спершу завершіть інтерактивну загрозу");
                return;
            }

            room.CurrentPhase = GamePhase.PreVotingReadyCheck;
            room.VotingReadyResponses.Clear();
            var roundState = BuildRoundState(room);

            await Clients.Group(roomId).SendAsync("VotingReadyCheckStarted", new
            {
                round = room.CurrentRound,
                message = "Всі готові до голосування?",
                roundState
            });
            await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);

            _logger.LogInformation("Хост запустив готовність до голосування в кімнаті {RoomName}", room.Name);
        }

        public async Task MarkAllPlayersReady()
        {
            if (!IsCallerHost())
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тільки хост може підтвердити готовність усіх гравців");
                return;
            }

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var room = string.IsNullOrWhiteSpace(roomId) ? null : _roomService.GetRoom(roomId);
            if (room == null || room.State != RoomState.Playing)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Готовність доступна тільки під час гри");
                return;
            }

            if (room.CurrentPhase == GamePhase.VotingResults)
            {
                RestoreExpiredTemporarySpecialCardEffects(room, room.CurrentRound);
                room.CurrentRound++;
                room.CurrentRoundReveals.Clear();
                room.VotingReadyResponses.Clear();
                room.CurrentPhase = GamePhase.RoundReveal;
                var nextRoundState = BuildRoundState(room);
                await Clients.Group(room.Id).SendAsync("RoundAdvanced", new
                {
                    currentRound = room.CurrentRound,
                    roundState = nextRoundState
                });
                await Clients.Group(room.Id).SendAsync("RoundStateUpdated", nextRoundState);
                return;
            }

            foreach (var player in RoomService.GetPlayersSnapshot(room)
                         .Select(entry => entry.Value)
                         .Where(player => !player.IsEliminated))
            {
                room.VotingReadyResponses[RoomService.GetPlayerKey(player)] = "ready";
            }

            if (room.CurrentPhase == GamePhase.ExtraInventory)
            {
                room.CurrentPhase = GamePhase.PreVotingReadyCheck;
            }

            var roundState = BuildRoundState(room);
            await Clients.Group(room.Id).SendAsync("AllPlayersMarkedReady", new
            {
                round = room.CurrentRound,
                roundState
            });
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", roundState);

            if (room.CurrentPhase == GamePhase.RoundReveal &&
                HaveAllActivePlayersRevealedThisRound(room))
            {
                await EndRound();
            }
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
            if (await RejectHiddenSpecialCardAccess(characteristicName)) return;

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

            var playerCount = RoomService.GetPlayersSnapshot(room).Count;
            newCapacity = Math.Clamp(newCapacity, 1, Math.Max(1, playerCount));
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
        public async Task TriggerNewEvent(string eventName, string eventDescription, string? effectType = null, int? effectValue = null)
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
            player.EliminatedAtRound = room.CurrentRound;
            player.EliminatedByVote = false;
            player.CanRevealAllAfterElimination = true;
            player.HasRevealedAllAfterElimination = false;
            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            await Clients.Group(room.Id).SendAsync("PlayerEliminated", new
            {
                connectionId = targetCurrentConnectionId,
                playerName = player.Name,
                eliminatedAtRound = room.CurrentRound,
                eliminatedByVote = false,
                canRevealAllAfterElimination = true,
                hasRevealedAllAfterElimination = false
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
            player.EliminatedAtRound = null;
            player.EliminatedByVote = false;
            player.CanRevealAllAfterElimination = false;
            player.HasRevealedAllAfterElimination = false;
            _roomService.UpdatePlayer(targetCurrentConnectionId, player);

            await Clients.Group(room.Id).SendAsync("PlayerRestored", new
            {
                connectionId = targetCurrentConnectionId,
                playerName = player.Name,
                canRevealAllAfterElimination = false,
                hasRevealedAllAfterElimination = false
            });

            _logger.LogInformation($"Гравець {player.Name} повернутий в гру");
        }

        // Допоміжні методи для GM

        private async Task<bool> RejectHiddenSpecialCardAccess(string characteristicName)
        {
            if (!string.Equals(characteristicName, "SpecialCard", StringComparison.Ordinal))
            {
                return false;
            }

            await Clients.Caller.SendAsync("ReceiveError", "Нерозкриті спеціальні карти недоступні хосту");
            return true;
        }

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
                "SpecialCard" => player.Revealed.SpecialCard,
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
                    case "SpecialCard":
                        ApplySpecialCardChange(player, newValue);
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
                    case "SpecialCard":
                        var specialCardPlayer = _generator.Generate(player.Name);
                        player.SpecialCard = specialCardPlayer.SpecialCard;
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
                    case "SpecialCard":
                        target.SpecialCard = source.SpecialCard;
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

        private void ApplySpecialCardChange(Player player, string newValue)
        {
            var cardData = FindSpecialCardData(newValue);
            if (cardData == null)
            {
                player.SpecialCard.Name = newValue;
                return;
            }

            player.SpecialCard = CreateSpecialCard(cardData);
        }

        private SpecialCardData? FindSpecialCardData(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return null;
            }

            var query = value.Trim();
            return _gameData.SpecialCards.FirstOrDefault(card =>
                string.Equals(card.Id, query, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(card.Name, query, StringComparison.OrdinalIgnoreCase));
        }

        private static SpecialCard CreateSpecialCard(SpecialCardData data) => new()
        {
            Id = data.Id,
            Name = data.Name,
            Description = data.Description,
            IsSecret = data.IsSecret,
            IsOneTimeUse = data.IsOneTimeUse,
            Phase = data.Phase,
            EffectType = data.EffectType,
            EffectDuration = string.IsNullOrWhiteSpace(data.EffectDuration) ? "instant" : data.EffectDuration,
            RequiresTarget = data.RequiresTarget,
            I18n = data.I18n
        };

        private async Task BroadcastRoundStateAfterSpecialCardChange(Room room, string characteristicName)
        {
            if (!string.Equals(characteristicName, "SpecialCard", StringComparison.Ordinal))
            {
                return;
            }

            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", BuildRoundState(room));
        }

        #endregion
    }
}


