using Bunker.Models;
using Bunker.Models.GameData;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Bunker.Models.ViewModels;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using System.Text.Json;
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
                (room.IsHost(player) || (_activeDirectorCapability != null && IsAuthorizedDirector(player, _activeDirectorCapability.Value)));
        }

        private bool HasGmCapability(Room room, GmCapability capability) =>
            (IsCallerHost() && GmCapabilities.Allows(room.GmMode, capability)) ||
            (_activeDirectorCapability != null && _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var player) && IsAuthorizedDirector(player, _activeDirectorCapability.Value));

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
                    IsSpectatorGm = player.IsSpectatorGm,
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

        private GeneratedProperty? BuildPropertyClientState(GeneratedProperty? property)
        {
            if (property == null)
            {
                return null;
            }

            var clientProperty = JsonSerializer.Deserialize<GeneratedProperty>(
                JsonSerializer.Serialize(property))!;
            clientProperty.LocalizedDisplay = _gameData.FormatPropertyAllLanguages(clientProperty);
            clientProperty.LocalizedPresentation =
                _gameData.BuildPropertyPresentationsAllLanguages(clientProperty);
            return clientProperty;
        }

        private Player BuildPlayerClientState(Player player)
        {
            var clientPlayer = JsonSerializer.Deserialize<Player>(JsonSerializer.Serialize(player))!;
            clientPlayer.Property = BuildPropertyClientState(clientPlayer.Property);
            return clientPlayer;
        }

        private Task SendPersonalPlayerSnapshot(string connectionId, Player player, string reason) =>
            Clients.Client(connectionId).SendAsync(
                "PlayerStateResynced",
                new { player = BuildPlayerClientState(player), reason });

        private async Task SendPublicPlayersUpdate(Room room)
        {
            QueueRoomRecovery(room, "public_players");
            await Clients.Group(room.Id).SendAsync("RoomPlayersUpdated", BuildRoomPlayersPayload(room));
            await BroadcastOmniscientStateToAuthorizedSpectators(room);
        }

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
            if (room.State == RoomState.Finished)
            {
                await Clients.Caller.SendAsync("ReceiveError", "game_finished");
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
                player = BuildPlayerClientState(player)
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
                player = BuildPlayerClientState(player)
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
                player = BuildPlayerClientState(player)
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
            _gameTimerService.Stop(room);
            room.VotingReadyResponses.Clear();

            var configuredThreatDue = ShouldTriggerThreat(room, completedRound);
            var scenarioResult = await TryRunScenarioAfterRound(room, completedRound, configuredThreatDue);
            var scenarioThreat = string.Equals(
                scenarioResult?.Public?.ResolutionMode,
                "existing_threat_flow",
                StringComparison.OrdinalIgnoreCase);
            if (scenarioResult is { Success: true, BlocksVoting: true } && !scenarioThreat)
            {
                return;
            }

            var threatTriggered = false;
            if (configuredThreatDue || scenarioThreat)
            {
                threatTriggered = await StartCanonicalScenarioThreat(room, completedRound);
            }

            var additionalInventory = GrantConfiguredBonusInventory(room, completedRound);
            if (threatTriggered || additionalInventory.Count > 0)
            {
                room.CurrentPhase = GamePhase.ExtraInventory;
                var extraInventoryState = BuildRoundState(room);
                await Clients.Group(roomId).SendAsync("AdditionalInventoryGranted", new
                {
                    completedRound,
                    grants = additionalInventory,
                    roundState = extraInventoryState
                });
                await Clients.Group(roomId).SendAsync("RoundStateUpdated", extraInventoryState);
            }

            if (IsVotingRound(room, completedRound))
            {
                if (!threatTriggered && additionalInventory.Count == 0)
                {
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
                return;
            }

            RestoreExpiredTemporarySpecialCardEffects(room, completedRound);
            room.CurrentRound = completedRound + 1;
            room.CurrentRoundReveals.Clear();
            room.VotingReadyResponses.Clear();
            room.CurrentPhase = GamePhase.RoundReveal;
            StartConfiguredRoundTimer(room);
            var bunkerReveal = _bunkerIntel.RevealNextPublic(room, completedRound);
            if (bunkerReveal.Success)
            {
                await Clients.Group(roomId).SendAsync("BunkerIntelRevealed", bunkerReveal);
                await BroadcastBunkerIntelProjection(room);
            }

            var nextRoundState = BuildRoundState(room);
            await Clients.Group(roomId).SendAsync("RoundAdvanced", new
            {
                completedRound,
                currentRound = room.CurrentRound,
                roundState = nextRoundState
            });
            await Clients.Group(roomId).SendAsync("RoundStateUpdated", nextRoundState);
            _logger.LogInformation("Раунд {CompletedRound} завершено в кімнаті {RoomName}, стартував раунд {CurrentRound}", completedRound, room.Name, room.CurrentRound);
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

            if (room.ScenarioSituations is
                { TriggerPhase: "after_voting", ActiveScenario:
                    { ResolutionMode: "existing_threat_flow", IsResolved: false } afterVotingThreat })
            {
                _scenarioScheduler.MarkResolved(room, "threat_resolved");
                await Clients.Group(room.Id).SendAsync("ScenarioResolved", new
                {
                    scenarioId = afterVotingThreat.ScenarioId,
                    result = "threat_resolved"
                });
                await AdvanceRoundAfterVotingScenario(room, afterVotingThreat.TriggeredAfterRound);
                return;
            }

            room.CurrentPhase = GamePhase.PreVotingReadyCheck;
            if (room.ScenarioSituations?.ActiveScenario is
                { ResolutionMode: "existing_threat_flow", IsResolved: false })
            {
                _scenarioScheduler.MarkResolved(room, "threat_resolved");
                await Clients.Group(room.Id).SendAsync("ScenarioResolved", new
                {
                    scenarioId = room.ScenarioSituations.ActiveScenario.ScenarioId,
                    result = "threat_resolved"
                });
            }
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
            if (room.PendingElimination != null)
            {
                if (!await FinalizePendingEliminationInternal(room, force: false))
                {
                    await Clients.Caller.SendAsync("ReceiveError", "pending_elimination_window");
                    return;
                }
                if (room.State == RoomState.Finished) return;
            }

            if (room.CurrentPhase == GamePhase.VotingResults)
            {
                var postVotingScenario = await TryRunScenarioAfterRound(
                    room,
                    room.CurrentRound,
                    configuredThreatAlreadyDue: false,
                    triggerPhase: "after_voting");
                if (postVotingScenario is { Success: true })
                {
                    if (postVotingScenario.Public?.ResolutionMode == "existing_threat_flow")
                    {
                        await StartCanonicalScenarioThreat(room, room.CurrentRound);
                        room.CurrentPhase = GamePhase.ExtraInventory;
                        await Clients.Group(room.Id).SendAsync("RoundStateUpdated", BuildRoundState(room));
                        return;
                    }
                    if (postVotingScenario.BlocksVoting) return;
                }
                RestoreExpiredTemporarySpecialCardEffects(room, room.CurrentRound);
                room.CurrentRound++;
                room.CurrentRoundReveals.Clear();
                room.VotingReadyResponses.Clear();
                room.CurrentPhase = GamePhase.RoundReveal;
                StartConfiguredRoundTimer(room);
                var bunkerReveal = _bunkerIntel.RevealNextPublic(room, room.CurrentRound - 1);
                if (bunkerReveal.Success)
                {
                    await Clients.Group(room.Id).SendAsync("BunkerIntelRevealed", bunkerReveal);
                    await BroadcastBunkerIntelProjection(room);
                }
                var nextRoundState = BuildRoundState(room);
                await Clients.Group(room.Id).SendAsync("RoundAdvanced", new
                {
                    currentRound = room.CurrentRound,
                    roundState = nextRoundState
                });
                await Clients.Group(room.Id).SendAsync("RoundStateUpdated", nextRoundState);
                return;
            }

            foreach (var player in RoomService.GetGameplayPlayersSnapshot(room).Select(entry => entry.Value))
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
            if (room.State == RoomState.Finished)
            {
                await Clients.Caller.SendAsync("ReceiveError", "game_finished");
                return;
            }

            if (room.Bunker == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Бункер не знайдено");
                return;
            }

            if (!BunkerCapacityPolicy.TryParse(capacityValue, out var newCapacity))
            {
                await AppendGmAudit(room, GetGmActorId(room), "bunker_capacity", GmAuditResult.Rejected,
                    "Bunker capacity change was rejected.", commandId: null, errorCode: "invalid_capacity");
                await Clients.Caller.SendAsync("BunkerCapacityRejected", new
                {
                    capacity = room.Bunker.Capacity,
                    message = "Місткість має бути цілим числом від 1 до 99"
                });
                return;
            }

            var capacitySnapshot = room.Bunker.Capacity == newCapacity ? null :
                CreateMutationSnapshot(room, GetGmActorId(room), "bunker_capacity", null, "Before bunker capacity change");
            room.Bunker.Capacity = newCapacity;

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId)!;
            await Clients.Group(roomId).SendAsync("BunkerCapacityUpdated", new
            {
                capacity = newCapacity,
                bunker = _bunkerIntel.Project(room, null)
            });
            await BroadcastBunkerIntelProjection(room);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "bunker_capacity", capacity = newCapacity });
            await AppendGmAudit(room, GetGmActorId(room), "bunker_capacity", GmAuditResult.Success,
                $"Bunker capacity was set to {newCapacity}.", snapshot: capacitySnapshot);

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

            room.Bunker = CloneBunkerInfo(_gameData.Bunkers[_random.Next(_gameData.Bunkers.Count)]);

            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId)!;
            await BroadcastBunkerIntelProjection(room);

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
                bunker = _bunkerIntel.Project(room, null)
            });

            _logger.LogInformation($"Ефект події {eventId} застосовано в кімнаті {room.Name}");
        }

		/// <summary>
		/// Додати їжу до бункера — тільки для хоста з правом змінювати стан гри.
		/// </summary>
		public Task AddBunkerSupplies(int months, string? commandId = null) =>
			MutateBunkerResource(BunkerResourceKind.Food, add: true, months, commandId);

		/// <summary>
		/// Зменшити запас їжі — тільки для хоста з правом змінювати стан гри.
		/// </summary>
		public Task RemoveBunkerSupplies(int months, string? commandId = null) =>
			MutateBunkerResource(BunkerResourceKind.Food, add: false, months, commandId);

		public Task AddBunkerWater(int months, string? commandId = null) =>
			MutateBunkerResource(BunkerResourceKind.Water, add: true, months, commandId);

		public Task RemoveBunkerWater(int months, string? commandId = null) =>
			MutateBunkerResource(BunkerResourceKind.Water, add: false, months, commandId);

		private async Task MutateBunkerResource(
			BunkerResourceKind resource,
			bool add,
			int months,
			string? commandId)
		{
			if (!TryGetBunkerResourceMutationContext(out var room, out var actor))
			{
				await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав для зміни ресурсів бункера");
				return;
			}
			if (!_bunkerResources.IsValidMutationAmount(months))
			{
				await Clients.Caller.SendAsync("ReceiveError", "Кількість місяців має бути від 1 до 120");
				return;
			}
			if (room.State == RoomState.Finished)
			{
				await Clients.Caller.SendAsync("ReceiveError", "game_finished");
				return;
			}
			if (room.Bunker == null)
			{
				await Clients.Caller.SendAsync("ReceiveError", "Бункер не визначено");
				return;
			}
			if (!RememberPlayerCommand(room, commandId))
			{
				await Clients.Caller.SendAsync("BunkerUpdated", new
				{
					bunker = _bunkerIntel.Project(room, actor),
					idempotent = true
				});
				return;
			}

			var action = resource switch
			{
				BunkerResourceKind.Water when add => "water_added",
				BunkerResourceKind.Water => "water_removed",
				BunkerResourceKind.Food when add => "food_added",
				_ => "food_removed"
			};
			RoomSnapshot? snapshot;
			BunkerResourceMutation mutation;
			lock (room.SnapshotSyncRoot)
			{
				var currentTotal = resource == BunkerResourceKind.Water
					? room.Bunker.WaterMonths
					: room.Bunker.SuppliesMonths;
				var willChange = add
					? currentTotal < BunkerResourceService.MaxMonths
					: currentTotal > 0;
				snapshot = willChange
					? CreateMutationSnapshot(
						room,
						RoomService.GetPlayerKey(actor),
						action,
						commandId,
						$"Before bunker {action.Replace('_', ' ')}")
					: null;
				mutation = add
					? _bunkerResources.Add(room.Bunker, resource, months)
					: _bunkerResources.Remove(room.Bunker, resource, months);
			}

			if (resource == BunkerResourceKind.Water)
			{
				await Clients.Group(room.Id).SendAsync(
					add ? "BunkerWaterAdded" : "BunkerWaterRemoved",
					add
						? new
						{
							addedMonths = mutation.AppliedMonths,
							totalWaterMonths = _bunkerIntel.IsPublic(room, "water") ? mutation.TotalMonths : (int?)null,
							bunker = _bunkerIntel.Project(room, null)
						}
						: (object)new
						{
							removedMonths = mutation.AppliedMonths,
							totalWaterMonths = _bunkerIntel.IsPublic(room, "water") ? mutation.TotalMonths : (int?)null,
							bunker = _bunkerIntel.Project(room, null)
						});
			}
			else
			{
				await Clients.Group(room.Id).SendAsync(
					add ? "BunkerSuppliesAdded" : "BunkerSuppliesRemoved",
					add
						? new
						{
							addedMonths = mutation.AppliedMonths,
							totalSuppliesMonths = _bunkerIntel.IsPublic(room, "food") ? mutation.TotalMonths : (int?)null,
							bunker = _bunkerIntel.Project(room, null)
						}
						: (object)new
						{
							removedMonths = mutation.AppliedMonths,
							totalSuppliesMonths = _bunkerIntel.IsPublic(room, "food") ? mutation.TotalMonths : (int?)null,
							bunker = _bunkerIntel.Project(room, null)
						});
			}

			await Clients.Group(room.Id).SendAsync("BunkerUpdated", new
			{
				bunker = _bunkerIntel.Project(room, null),
				action
			});
			await BroadcastBunkerIntelProjection(room);
			QueueRoomRecovery(room, action);
			await AppendGmAudit(
				room,
				RoomService.GetPlayerKey(actor),
				action,
				GmAuditResult.Success,
				$"Bunker {(resource == BunkerResourceKind.Water ? "water" : "food")} was {(add ? "increased" : "decreased")} by {mutation.AppliedMonths} month(s).",
				commandId: commandId,
				snapshot: snapshot);
			await Clients.Caller.SendAsync("GMActionSuccess", new
			{
				action,
				appliedMonths = mutation.AppliedMonths,
				totalMonths = mutation.TotalMonths
			});
			await BroadcastOmniscientStateToAuthorizedSpectators(room);

			_logger.LogInformation(
				"GM bunker resource mutation {Action} applied {AppliedMonths} month(s) in room {RoomName}. Total: {TotalMonths}",
				action,
				mutation.AppliedMonths,
				room.Name,
				mutation.TotalMonths);
		}

		private bool TryGetBunkerResourceMutationContext(out Room room, out Player actor)
		{
			room = _roomService.GetPlayerRoom(Context.ConnectionId)!;
			actor = null!;
			return room != null &&
				_roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out actor) &&
				room.IsHost(actor) &&
				!actor.IsSpectatorGm &&
				actor.GmRole != GmMode.OmniscientGm &&
				GmCapabilities.Allows(room.GmMode, GmCapability.ManagePublicGameState);
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

            if (room.State == RoomState.Finished)
            {
                await Clients.Caller.SendAsync("ReceiveError", "game_finished");
                return;
            }

            var eliminateSnapshot = CreateMutationSnapshot(room, GetGmActorId(room), "player_eliminate", null, "Before player elimination");
            player.IsEliminated = true;
            player.EliminatedAtRound = room.CurrentRound;
            player.EliminatedByVote = false;
            player.CanRevealAllAfterElimination = true;
            player.HasRevealedAllAfterElimination = false;
            _roomService.UpdatePlayer(targetCurrentConnectionId, player);
            TryMarkGameFinishedAfterElimination(room, "gm", out var gameCompletion);

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
            await AppendGmAudit(room, GetGmActorId(room), "player_eliminate", GmAuditResult.Success,
                "Player was eliminated by GM.", GetSafeAuditPlayerId(player), snapshot: eliminateSnapshot);

            if (gameCompletion != null)
            {
                await PublishGameCompletionAsync(
                    room,
                    gameCompletion,
                    GetGmActorId(room));
            }

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

            if (room.State == RoomState.Finished)
            {
                await Clients.Caller.SendAsync("ReceiveError", "game_finished");
                return;
            }

            var restorePlayerSnapshot = CreateMutationSnapshot(room, GetGmActorId(room), "player_restore", null, "Before player restore");
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
            await AppendGmAudit(room, GetGmActorId(room), "player_restore", GmAuditResult.Success,
                "Player was restored by GM.", GetSafeAuditPlayerId(player), snapshot: restorePlayerSnapshot);

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
            if (room.State == RoomState.Finished)
            {
                await Clients.Caller.SendAsync("ReceiveError", "game_finished");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await Clients.Caller.SendAsync("GamePauseUpdated", BuildPauseState(room)); return; }
            var cleanReason = SanitizePauseReason(reason);
            var hostId = _roomService.TryResolvePlayer(room, Context.ConnectionId, out _, out var host)
                ? RoomService.GetPlayerKey(host) : null;
            var pauseSnapshot = CreateMutationSnapshot(room, hostId ?? "unknown", paused ? "pause_game" : "resume_game", commandId, "Before pause state change");
            RoundVotingAdminService.SetPaused(room, paused, cleanReason, hostId, DateTimeOffset.UtcNow);
            var timerChanged = paused
                ? _gameTimerService.Pause(room, byGamePause: true)
                : _gameTimerService.Resume(room, onlyIfPausedByGame: true);
            await Clients.Group(room.Id).SendAsync("GamePauseUpdated", BuildPauseState(room));
            if (timerChanged) await BroadcastGameTimer(room);
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", BuildRoundState(room));
            await AppendGmAudit(room, hostId ?? "unknown", paused ? "pause_game" : "resume_game", GmAuditResult.Success,
                paused ? "Game was paused." : "Game was resumed.", commandId: commandId, snapshot: pauseSnapshot);
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
            if (room.State == RoomState.Finished)
            {
                await Clients.Caller.SendAsync("ReceiveError", "game_finished");
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
            QueueRoomRecovery(room, "game_timer");
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
            if (room.State == RoomState.Finished)
            {
                await Clients.Caller.SendAsync("ReceiveError", "game_finished");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await Clients.Caller.SendAsync("RoundStateUpdated", BuildRoundState(room)); return; }
            var roundSnapshot = targetRound >= room.CurrentRound && room.CurrentVoting?.State != VotingState.Active
                ? CreateMutationSnapshot(room, GetGmActorId(room), "round_change", commandId, "Before manual round change") : null;
            if (!RoundVotingAdminService.TrySetRound(room, targetRound, out var error))
            {
                await AppendGmAudit(room, GetGmActorId(room), "round_change", GmAuditResult.Rejected,
                    "Manual round change was rejected.", commandId: commandId, errorCode: "round_change_blocked");
                await Clients.Caller.SendAsync("ReceiveError", error);
                return;
            }
            var state = BuildRoundState(room);
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", state);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "round_set", round = targetRound });
            await AppendGmAudit(room, GetGmActorId(room), "round_change", GmAuditResult.Success,
                $"Round was advanced to {targetRound}.", commandId: commandId, snapshot: roundSnapshot);
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
            var readinessSnapshot = room.VotingReadyResponses.Count > 0
                ? CreateMutationSnapshot(room, GetGmActorId(room), "readiness_reset", commandId, "Before readiness reset") : null;
            RoundVotingAdminService.ResetReadiness(room);
            var state = BuildRoundState(room);
            await Clients.Group(room.Id).SendAsync("RoundStateUpdated", state);
            await Clients.Caller.SendAsync("GMActionSuccess", new { action = "readiness_reset" });
            await AppendGmAudit(room, GetGmActorId(room), "readiness_reset", GmAuditResult.Success,
                "Round readiness was reset.", commandId: commandId, snapshot: readinessSnapshot);
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

            var kickSnapshot = CreateMutationSnapshot(callerRoom, GetGmActorId(callerRoom), "player_kick", commandId, "Before player kick");

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
            await AppendGmAudit(callerRoom, GetGmActorId(callerRoom), "player_kick", GmAuditResult.Success,
                "Player was removed from the room.", GetSafeAuditPlayerId(player), commandId, snapshot: kickSnapshot, allowUndo: false);
        }

		public async Task HideRevealedCharacteristic(
			string targetPlayerId,
			string characteristicName,
			string? commandId = null)
		{
			if (!TryGetManagedPlayer(
					targetPlayerId,
					out var room,
					out var connectionId,
					out var player))
			{
				await Clients.Caller.SendAsync(
					"ReceiveError",
					"Недостатньо прав або гравця не знайдено");

				return;
			}

			if (!RememberPlayerCommand(room, commandId))
			{
				await SendPlayerHostControlData(room);
				return;
			}

			characteristicName = NormalizeCharacteristicName(characteristicName);

			if (!GmPlayerStateMutator.CanHideCharacteristic(characteristicName))
			{
				await Clients.Caller.SendAsync(
					"ReceiveError",
					"Невідома характеристика");

				return;
			}

			var hideSnapshot = CreateMutationSnapshot(
				room,
				GetGmActorId(room),
				"characteristic_hide",
				commandId,
				"Before hiding a revealed characteristic");

			if (!TrySetCharacteristicHidden(player, characteristicName))
			{
				await Clients.Caller.SendAsync(
					"ReceiveError",
					"Невідома характеристика");

				return;
			}

			room.CurrentRoundReveals ??= new();

			var playerKey = RoomService.GetPlayerKey(player);

			if (room.CurrentRoundReveals.TryGetValue(
					playerKey,
					out var revealedThisRound)
				&& string.Equals(
					revealedThisRound,
					characteristicName,
					StringComparison.OrdinalIgnoreCase))
			{
				room.CurrentRoundReveals.Remove(playerKey);
			}

			_roomService.UpdatePlayer(connectionId, player);

			await SendPersonalPlayerSnapshot(
				connectionId,
				player,
				"characteristic_hidden");

			await Clients.Group(room.Id).SendAsync(
				"CharacteristicHidden",
				new
				{
					connectionId,
					characteristicKey = characteristicName
				});

			await SendPublicPlayersUpdate(room);
			await SendPlayerHostControlData(room);

			var roundState = BuildRoundState(room);

			await Clients.Group(room.Id).SendAsync(
				"RoundStateUpdated",
				roundState);

			await Clients.Caller.SendAsync(
				"GMActionSuccess",
				new
				{
					action = "hide",
					playerName = player.Name,
					characteristicName
				});

			await AppendGmAudit(
				room,
				GetGmActorId(room),
				"characteristic_hide",
				GmAuditResult.Success,
				"A revealed characteristic was hidden.",
				GetSafeAuditPlayerId(player),
				commandId,
				snapshot: hideSnapshot);
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
            await AppendGmAudit(room, GetGmActorId(room), "player_resync", GmAuditResult.Success,
                "Player public state was resynchronized.", GetSafeAuditPlayerId(player), commandId);
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
            if (!player.IsConnected)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Хоста можна передати лише активному гравцю");
                return;
            }
            var oldHostConnectionId = Context.ConnectionId;
            var oldHostPlayerId = GetGmActorId(room);
            var transferSnapshot = CreateMutationSnapshot(room, oldHostPlayerId, "host_transfer", commandId, "Before host transfer");
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
            await AppendGmAudit(room, oldHostPlayerId, "host_transfer", GmAuditResult.Success,
                "Host role was transferred.", GetSafeAuditPlayerId(player), commandId, snapshot: transferSnapshot, allowUndo: false);
            await BroadcastLobbyState(room);
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
            await AppendGmAudit(room, GetGmActorId(room), fix ? "stale_mapping_repair" : "stale_mapping_check",
                GmAuditResult.Success, fix ? "Stale connection mapping repair was requested." : "Stale connection mapping was checked.");
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
            if (normalized == null || !player.AdditionalConditionEffects.Any(item => item.Id == conditionId || item.ConditionId == conditionId))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Стан або рівень тяжкості не знайдено");
                return;
            }
            var severitySnapshot = CreateMutationSnapshot(room, GetGmActorId(room), "condition_severity_repair", commandId, "Before condition severity repair");
            GmPlayerStateMutator.ChangeConditionSeverity(player, conditionId, normalized, SeverityLabel(normalized));
            _roomService.UpdatePlayer(connectionId, player);
            await BroadcastConditionRepair(room, connectionId, player);
            await AppendGmAudit(room, GetGmActorId(room), "condition_severity_repair", GmAuditResult.Success,
                "Additional physical condition severity was repaired.", GetSafeAuditPlayerId(player), commandId, snapshot: severitySnapshot);
        }

        public async Task RemoveAdditionalCondition(string targetPlayerId, string conditionId, string? commandId = null)
        {
            if (!TryGetManagedPlayer(targetPlayerId, out var room, out var connectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Недостатньо прав або гравця не знайдено");
                return;
            }
            if (!RememberPlayerCommand(room, commandId)) { await SendPlayerHostControlData(room); return; }
            if (!player.AdditionalConditionEffects.Any(item => item.Id == conditionId || item.ConditionId == conditionId))
            {
                await SendPlayerHostControlData(room);
                return;
            }
            var conditionRemoveSnapshot = CreateMutationSnapshot(room, GetGmActorId(room), "condition_remove", commandId, "Before condition removal");
            GmPlayerStateMutator.RemoveCondition(player, conditionId);
            _roomService.UpdatePlayer(connectionId, player);
            await BroadcastConditionRepair(room, connectionId, player);
            await AppendGmAudit(room, GetGmActorId(room), "condition_remove", GmAuditResult.Success,
                "Additional physical condition was removed.", GetSafeAuditPlayerId(player), commandId, snapshot: conditionRemoveSnapshot);
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
                "Property" => player.Revealed.Property,
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
                    case "Property":
                        target.Property = source.Property;
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
            await BroadcastOmniscientStateToAuthorizedSpectators(room);
        }

        #endregion
    }
}


