using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Bunker.Models.ViewModels;
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

        private bool HasGmCapability(Room room, GmCapability capability) =>
            IsCallerHost() && GmCapabilities.Allows(room.GmMode, capability);

        private List<PlayerHostControlDto> BuildPlayerHostControlData(Room room) =>
            RoomService.GetPlayersSnapshot(room).Select(entry =>
            {
                var player = entry.Value;
                return new PlayerHostControlDto
                {
                    ConnectionId = string.IsNullOrWhiteSpace(player.ConnectionId) ? entry.Key : player.ConnectionId,
                    StablePlayerId = RoomService.GetPlayerKey(player),
                    Name = player.Name ?? "Unknown",
                    SeatNumber = player.SeatNumber,
                    IsHost = room.IsHost(player),
                    IsConnected = player.IsConnected,
                    IsEliminated = player.IsEliminated,
                    EliminatedAtRound = player.EliminatedAtRound,
                    EliminatedByVote = player.EliminatedByVote,
                    CanRevealAllAfterElimination = player.CanRevealAllAfterElimination,
                    HasRevealedAllAfterElimination = player.HasRevealedAllAfterElimination,
                    Revealed = player.Revealed ?? new RevealedCharacteristics(),
                    AdditionalPhysicalConditions = player.Revealed?.PhysicalHealth == true
                        ? player.AdditionalConditionEffects.Select(effect => new PlayerHostConditionDto
                        {
                            Id = effect.Id,
                            Name = effect.Name,
                            SeverityCode = effect.SeverityCode,
                            SeverityLevel = effect.SeverityLevel,
                            SourceType = string.IsNullOrWhiteSpace(effect.SourceThreatId) ? "" : "threat",
                            SourceId = effect.SourceThreatId,
                            AppliedRound = effect.AppliedAtRound
                        }).ToList()
                        : []
                };
            }).ToList();

        private Task SendPlayerHostControlData(Room room) =>
            Clients.Caller.SendAsync("AllPlayersData", BuildPlayerHostControlData(room));

        private bool TryGetManagedPlayer(string targetId, out Room room, out string connectionId, out Player player)
        {
            room = _roomService.GetPlayerRoom(Context.ConnectionId)!;
            connectionId = "";
            player = null!;
            return room != null &&
                   HasGmCapability(room, GmCapability.ManagePlayersWithoutHiddenData) &&
                   _roomService.TryResolvePlayer(room, targetId, out connectionId, out player);
        }

        private bool RememberPlayerCommand(Room room, string? commandId)
        {
            if (string.IsNullOrWhiteSpace(commandId)) return true;
            lock (room.ProcessedGmPlayerCommandIds)
                return room.ProcessedGmPlayerCommandIds.Add(commandId);
        }

        private Task SendPersonalPlayerSnapshot(string connectionId, Player player, string reason) =>
            Clients.Client(connectionId).SendAsync("PlayerStateResynced", new { player, reason });

        private async Task SendPublicPlayersUpdate(Room room) =>
            await Clients.Group(room.Id).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));

        private async Task<bool> RejectPausedPlayerAction(Room room)
        {
            if (!room.IsPaused) return false;
            await Clients.Caller.SendAsync("ReceiveError", "Гру призупинено хостом");
            return true;
        }

        /// <summary>
        /// Отримати безпечні технічні дані гравців (тільки для хоста)
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

            await SendPlayerHostControlData(room);
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
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !HasGmCapability(room, GmCapability.PeekHiddenCharacteristics))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Поточний режим GM не дозволяє перегляд прихованих характеристик");
                return;
            }

            characteristicName = NormalizeCharacteristicName(characteristicName);
            if (await RejectHiddenSpecialCardAccess(characteristicName)) return;

            if (!_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
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
        public async Task SetBunkerCapacity(string? capacityValue)
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для зміни місткості бункера");
                return;
            }

            if (room.Bunker == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Бункер не знайдено");
                return;
            }

            if (!BunkerCapacityPolicy.TryParse(capacityValue, out var newCapacity))
            {
                await Clients.Caller.SendAsync("BunkerCapacityRejected", new
                {
                    capacity = room.Bunker.Capacity,
                    message = "Місткість має бути цілим числом від 1 до 99"
                });
                return;
            }

            room.Bunker.Capacity = newCapacity;

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId)!;
            await Clients.Group(roomId).SendAsync("BunkerCapacityUpdated", new
            {
                capacity = newCapacity,
                bunker = room.Bunker.ToClientInfo()
            });
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "bunker_capacity", capacity = newCapacity });

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
            await SendPlayerHostControlData(room);

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
            await SendPlayerHostControlData(room);

            _logger.LogInformation($"Гравець {player.Name} повернутий в гру");
        }

        public async Task SetGamePaused(bool paused, string? reason, string? commandId = null)
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для pause/resume");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await Clients.Caller.SendAsync("GamePauseUpdated", BuildPauseState(room)); return; }
            var cleanReason = SanitizePauseReason(reason);
            var hostId = _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var host)
                ? RoomService.GetPlayerKey(host) : null;
            RoundVotingAdminService.SetPaused(room, paused, cleanReason, hostId, DateTimeOffset.UtcNow);
            var timerChanged = paused
                ? _gameTimerService.Pause(room, byGamePause: true)
                : _gameTimerService.Resume(room, onlyIfPausedByGame: true);
            await Clients.Group(room.Id).SendAsync("GamePauseUpdated", BuildPauseState(room));
            if (timerChanged) await BroadcastGameTimer(room);
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", BuildRoundState(room));
        }

        public async Task PreviewRoundChange(string? roundValue)
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState) ||
                !RoundVotingAdminService.TryParseRound(roundValue, out var targetRound))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Некоректний номер раунду");
                return;
            }
            var blockedReason = targetRound < room.CurrentRound
                ? "Повернення назад заблоковано"
                : room.CurrentVoting?.State == VotingState.Active ? "Активне голосування потрібно завершити або скасувати" : null;
            await Clients.Caller.SendAsync("RoundChangePreview", new
            {
                currentRound = room.CurrentRound,
                targetRound,
                allowed = blockedReason == null,
                blockedReason,
                clears = new[] { "currentRoundReveals", "votingReadyResponses" },
                preserves = new[] { "characteristics", "threatEffects", "bunker" }
            });
        }

        public async Task StartGameTimer(string? durationValue, string? purpose, string? label, string commandId)
        {
            if (await GetTimerHostRoom(commandId) is not { } room) return;
            if (!GameTimerService.TryParseDuration(durationValue, out var seconds) || !GameTimerService.TryParsePurpose(purpose, out var parsedPurpose))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тривалість має бути цілим числом 10..7200 секунд");
                return;
            }
            _gameTimerService.Start(room, seconds, parsedPurpose, label);
            if (room.IsPaused) _gameTimerService.Pause(room, byGamePause: true);
            await BroadcastGameTimer(room);
        }

        public async Task PauseGameTimer(string commandId)
        {
            if (await GetTimerHostRoom(commandId) is not { } room) return;
            if (!_gameTimerService.Pause(room)) { await Clients.Caller.SendAsync("ReceiveError", "Таймер не запущено"); return; }
            await BroadcastGameTimer(room);
        }

        public async Task ResumeGameTimer(string commandId)
        {
            if (await GetTimerHostRoom(commandId) is not { } room) return;
            if (room.IsPaused) { await Clients.Caller.SendAsync("ReceiveError", "Спочатку продовжіть гру"); return; }
            if (!_gameTimerService.Resume(room)) { await Clients.Caller.SendAsync("ReceiveError", "Таймер не перебуває на паузі"); return; }
            await BroadcastGameTimer(room);
        }

        public async Task RestartGameTimer(string commandId)
        {
            if (await GetTimerHostRoom(commandId) is not { } room) return;
            if (!_gameTimerService.Restart(room)) { await Clients.Caller.SendAsync("ReceiveError", "Немає коректної тривалості для restart"); return; }
            if (room.IsPaused) _gameTimerService.Pause(room, byGamePause: true);
            await BroadcastGameTimer(room);
        }

        public async Task SetGameTimer(string? durationValue, string commandId)
        {
            if (await GetTimerHostRoom(commandId) is not { } room) return;
            if (!GameTimerService.TryParseDuration(durationValue, out var seconds))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Тривалість має бути цілим числом 10..7200 секунд");
                return;
            }
            _gameTimerService.Set(room, seconds);
            await BroadcastGameTimer(room);
        }

        public async Task AdjustGameTimer(int deltaSeconds, string commandId)
        {
            if (await GetTimerHostRoom(commandId) is not { } room) return;
            if (!_gameTimerService.Adjust(room, deltaSeconds))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Після зміни час має залишатися в межах 0..7200 секунд");
                return;
            }
            await BroadcastGameTimer(room);
        }

        public async Task StopGameTimer(string commandId)
        {
            if (await GetTimerHostRoom(commandId) is not { } room) return;
            _gameTimerService.Stop(room);
            await BroadcastGameTimer(room);
        }

        private async Task<Room?> GetTimerHostRoom(string? commandId)
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для керування таймером");
                return null;
            }
            if (string.IsNullOrWhiteSpace(commandId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Некоректний command id");
                return null;
            }
            if (!RememberPlayerCommand(room, commandId))
            {
                await Clients.Caller.SendAsync("GameTimerUpdated", _gameTimerService.GetDto(room));
                return null;
            }
            return room;
        }

        private async Task BroadcastGameTimer(Room room)
        {
            await Clients.Group(room.Id).SendAsync("GameTimerUpdated", _gameTimerService.GetDto(room));
        }

        public async Task SetRoundNumber(string? roundValue, string? commandId = null)
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState) ||
                !RoundVotingAdminService.TryParseRound(roundValue, out var targetRound))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Некоректний номер раунду");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await Clients.Caller.SendAsync("RoundStateUpdated", BuildRoundState(room)); return; }
            if (!RoundVotingAdminService.TrySetRound(room, targetRound, out var error))
            {
                await Clients.Caller.SendAsync("ReceiveError", error);
                return;
            }
            var state = BuildRoundState(room);
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", state);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "round_set", round = targetRound });
        }

        public async Task ResetRoundReadiness(string? commandId = null)
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !HasGmCapability(room, GmCapability.ManagePublicGameState))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для скидання готовності");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await Clients.Caller.SendAsync("RoundStateUpdated", BuildRoundState(room)); return; }
            RoundVotingAdminService.ResetReadiness(room);
            var state = BuildRoundState(room);
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", state);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "readiness_reset" });
        }

        private static object BuildPauseState(Room room) => new
        {
            isPaused = room.IsPaused,
            reason = room.PauseReason,
            pausedAtUtc = room.PausedAtUtc
        };

        private static string? SanitizePauseReason(string? reason)
        {
            if (string.IsNullOrWhiteSpace(reason)) return null;
            var clean = new string(reason.Where(character => !char.IsControl(character)).ToArray())
                .Replace("<", "").Replace(">", "").Trim();
            return clean.Length > 160 ? clean[..160] : clean;
        }

        public async Task KickPlayer(string targetPlayerId, string? commandId = null)
        {
            var callerRoom = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (callerRoom == null || !HasGmCapability(callerRoom, GmCapability.ManagePlayersWithoutHiddenData))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для керування гравцями");
                return;
            }
            if (!RememberPlayerCommand(callerRoom, commandId))
            {
                await SendPlayerHostControlData(callerRoom);
                return;
            }
            if (!_roomService.TryResolvePlayer(callerRoom, targetPlayerId, out var targetConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }
            if (targetConnectionId == Context.ConnectionId || callerRoom.IsHost(player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Хост не може виключити себе");
                return;
            }

            await Clients.Client(targetConnectionId).SendAsync("PlayerKicked", new { message = "Вас виключено хостом із кімнати" });
            var result = _roomService.LeaveRoom(targetConnectionId);
            if (!result.success)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Не вдалося виключити гравця");
                return;
            }
            await Groups.RemoveFromGroupAsync(targetConnectionId, callerRoom.Id);
            await Clients.Group(callerRoom.Id).SendAsync("PlayerLeftRoom", new { connectionId = targetConnectionId, kicked = true });
            await SendPublicPlayersUpdate(callerRoom);
            await SendPlayerHostControlData(callerRoom);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "kick", playerName = player.Name });
        }

        public async Task HideRevealedCharacteristic(string targetPlayerId, string characteristicName, string? commandId = null)
        {
            if (!TryGetManagedPlayer(targetPlayerId, out var room, out var connectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав або гравця не знайдено");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await SendPlayerHostControlData(room); return; }
            characteristicName = NormalizeCharacteristicName(characteristicName);
            if (!TrySetCharacteristicHidden(player, characteristicName))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Невідома характеристика");
                return;
            }
            _roomService.UpdatePlayer(connectionId, player);
            await SendPersonalPlayerSnapshot(connectionId, player, "characteristic_hidden");
            await Clients.Group(room.Id).SendAsync("CharacteristicHidden", new { connectionId, characteristicKey = characteristicName });
            await SendPublicPlayersUpdate(room);
            await SendPlayerHostControlData(room);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "hide", playerName = player.Name, characteristicName });
        }

        public async Task ResyncPlayer(string targetPlayerId, string? commandId = null)
        {
            if (!TryGetManagedPlayer(targetPlayerId, out var room, out var connectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав або гравця не знайдено");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await SendPlayerHostControlData(room); return; }
            await SendPersonalPlayerSnapshot(connectionId, player, "host_resync");
            await SendPlayerHostControlData(room);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "resync", playerName = player.Name });
        }

        public async Task TransferHost(string targetPlayerId, string? commandId = null)
        {
            if (!TryGetManagedPlayer(targetPlayerId, out var room, out var connectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав або гравця не знайдено");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) return;
            if (room.IsHost(player))
            {
                await SendPlayerHostControlData(room);
                return;
            }
            var oldHostConnectionId = Context.ConnectionId;
            if (!_roomService.TransferHost(room, connectionId, out _))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Хоста можна передати лише активному гравцю");
                return;
            }
            await Clients.Group(room.Id).SendAsync("HostChanged", new
            {
                oldHostConnectionId,
                newHostConnectionId = connectionId,
                newHostName = player.Name,
                gmMode = GmMode.PlayerHost.ToString()
            });
            await Clients.Client(connectionId).SendAsync("AllPlayersData", BuildPlayerHostControlData(room));
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "transfer_host", playerName = player.Name });
            await SendPublicPlayersUpdate(room);
        }

        public async Task InspectStalePlayerConnection(string targetConnectionId, bool fix = false)
        {
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !HasGmCapability(room, GmCapability.ManagePlayersWithoutHiddenData))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для діагностики");
                return;
            }
            var result = _roomService.InspectStaleConnection(room, targetConnectionId, fix);
            await Clients.Caller.SendAsync("StaleConnectionInspected", result);
            if (result.WasFixed) await SendPlayerHostControlData(room);
        }

        public async Task ChangeAdditionalConditionSeverity(string targetPlayerId, string conditionId, string severityCode, string? commandId = null)
        {
            if (!TryGetManagedPlayer(targetPlayerId, out var room, out var connectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав або гравця не знайдено");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await SendPlayerHostControlData(room); return; }
            var normalized = NormalizeSeverityCode(severityCode);
            if (normalized == null || !GmPlayerStateMutator.ChangeConditionSeverity(player, conditionId, normalized, SeverityLabel(normalized)))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Стан або рівень тяжкості не знайдено");
                return;
            }
            _roomService.UpdatePlayer(connectionId, player);
            await BroadcastConditionRepair(room, connectionId, player);
        }

        public async Task RemoveAdditionalCondition(string targetPlayerId, string conditionId, string? commandId = null)
        {
            if (!TryGetManagedPlayer(targetPlayerId, out var room, out var connectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав або гравця не знайдено");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await SendPlayerHostControlData(room); return; }
            if (!GmPlayerStateMutator.RemoveCondition(player, conditionId))
            {
                await SendPlayerHostControlData(room);
                return;
            }
            _roomService.UpdatePlayer(connectionId, player);
            await BroadcastConditionRepair(room, connectionId, player);
        }

        private async Task BroadcastConditionRepair(Room room, string connectionId, Player player)
        {
            await SendPersonalPlayerSnapshot(connectionId, player, "condition_repaired");
            if (player.Revealed.PhysicalHealth)
            {
                await Clients.Group(room.Id).SendAsync("CharacteristicUpdated", new
                {
                    connectionId,
                    playerName = player.Name,
                    characteristicKey = "PhysicalHealth",
                    data = GetRevealedDataForCharacteristic(player, "PhysicalHealth")
                });
            }
            await SendPublicPlayersUpdate(room);
            await SendPlayerHostControlData(room);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "condition_repair", playerName = player.Name });
        }

        private static string? NormalizeSeverityCode(string? code) => code?.Trim().ToLowerInvariant() switch
        {
            "light" => "light", "medium" => "medium", "hard" => "hard",
            "veryhard" => "veryHard", "critical" => "critical", _ => null
        };

        private static string SeverityLabel(string code) => code switch
        {
            "light" => "Легка форма", "medium" => "Середня форма", "hard" => "Важка форма",
            "veryHard" => "Дуже важка форма", "critical" => "Критична форма", _ => ""
        };

        private static bool TrySetCharacteristicHidden(Player player, string characteristicName)
            => GmPlayerStateMutator.HideCharacteristic(player, characteristicName);

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


