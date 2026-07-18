using Bunker.Models;
using Bunker.Models.Сharacteristics;
using Bunker.Services;
using Bunker.Services.Threats;
using Microsoft.AspNetCore.SignalR;
using System.Numerics;
using static System.Runtime.InteropServices.JavaScript.JSType;

namespace Bunker.Hubs
{
    public partial class GameHub
    {
        #region Helper Methods

        /// <summary>
        /// Sanitize and validate player name
        /// </summary>
        private string SanitizePlayerName(string? name)
        {
            if (string.IsNullOrWhiteSpace(name))
                return "";
            
            // Trim whitespace
            name = name.Trim();
            
            // Limit to 10 characters
            if (name.Length > 10)
                name = name.Substring(0, 10);
            
            return name;
        }

        private object BuildRoundState(Room room)
        {
            room.CurrentRoundReveals ??= new();
            room.RoundDiceRolls ??= new();

            var activePlayers = RoomService.GetGameplayPlayersSnapshot(room).ToList();

            var revealedPlayers = activePlayers
                .Where(entry => room.CurrentRoundReveals.ContainsKey(RoomService.GetPlayerKey(entry.Value)))
                .Select(entry =>
                {
                    var player = entry.Value;
                    var playerKey = RoomService.GetPlayerKey(player);

                    return new
                    {
                        connectionId = string.IsNullOrWhiteSpace(player.ConnectionId) ? entry.Key : player.ConnectionId,
                        stablePlayerId = playerKey,
                        name = player.Name ?? "Unknown",
                        characteristicKey = room.CurrentRoundReveals[playerKey]
                    };
                })
                .ToList();

            var allPlayersRevealed = room.State == RoomState.Playing &&
                room.CurrentPhase == GamePhase.RoundReveal &&
                activePlayers.Count > 0 &&
                activePlayers.All(entry => room.CurrentRoundReveals.ContainsKey(RoomService.GetPlayerKey(entry.Value)));
            var readyStatuses = BuildVotingReadyStatuses(room, activePlayers);
            var specialCards = BuildSpecialCardsPublicState(room);
            var threatState = BuildThreatPublicState(room);
            var currentDiceRoll = room.RoundDiceRolls.TryGetValue(room.CurrentRound, out var diceRoll)
                ? diceRoll
                : null;
            var votingAvailability = GetVotingStartAvailability(room);

            return new
            {
                currentRound = room.CurrentRound,
                state = room.State.ToString(),
                roomState = room.State.ToString(),
                currentPhase = room.CurrentPhase.ToString(),
                phase = room.CurrentPhase.ToString(),
                completion = room.Completion,
                isPaused = room.IsPaused,
                pauseReason = room.PauseReason,
                pausedAtUtc = room.PausedAtUtc,
                gameTimer = _gameTimerService.GetDto(room),
                activePlayerCount = activePlayers.Count,
                revealedCount = revealedPlayers.Count,
                allPlayersRevealed,
                canStartVoting = votingAvailability.Allowed,
                votingStartBlockedCode = votingAvailability.Allowed ? null : votingAvailability.Code,
                revealedPlayers,
                threatRevealed = room.IsThreatRevealed,
                threatRevealedAtRound = room.ThreatRevealedAtRound,
                threat = room.IsThreatRevealed ? room.CurrentThreat : null,
                threatState,
                readyStatuses,
                specialCards,
                diceRoll = currentDiceRoll,
                diceRolls = room.RoundDiceRolls.Values
                    .OrderBy(roll => roll.Round)
                    .ToList()
            };
        }

        private List<object> BuildVotingReadyStatuses(Room room, List<KeyValuePair<string, Player>> activePlayers)
        {
            room.VotingReadyResponses ??= new();

            return activePlayers
                .Select(entry =>
                {
                    var player = entry.Value;
                    var playerKey = RoomService.GetPlayerKey(player);
                    var status = room.VotingReadyResponses.TryGetValue(playerKey, out var storedStatus)
                        ? storedStatus
                        : "pending";

                    return new
                    {
                        connectionId = string.IsNullOrWhiteSpace(player.ConnectionId) ? entry.Key : player.ConnectionId,
                        stablePlayerId = playerKey,
                        name = player.Name ?? "Unknown",
                        seatNumber = player.SeatNumber,
                        eliminationVoteImmunity = player.EliminationVoteImmunity,
                        status
                    };
                })
                .OrderBy(player => player.seatNumber == 0 ? int.MaxValue : player.seatNumber)
                .ThenBy(player => player.name)
                .Cast<object>()
                .ToList();
        }

        private bool HaveAllActivePlayersRevealedThisRound(Room room)
        {
            room.CurrentRoundReveals ??= new();

            var activePlayers = RoomService.GetGameplayPlayersSnapshot(room)
                .Select(entry => entry.Value)
                .ToList();

            return room.State == RoomState.Playing &&
                room.CurrentPhase == GamePhase.RoundReveal &&
                activePlayers.Count > 0 &&
                activePlayers.All(player => room.CurrentRoundReveals.ContainsKey(RoomService.GetPlayerKey(player)));
        }

        private Bunker.Models.GameData.ThreatData? DrawThreatForRound(Room room, int round)
        {
            var settings = _roomGameSettings.GetEffective(room);
            var candidates = _gameData.Threats
                .Where(threat =>
                    threat.RevealRound == round ||
                    threat.Round == round ||
                    (threat.RevealRound <= 0 && threat.Round <= 0))
                .ToList();

            if (settings.InteractiveThreatRate == InteractiveThreatRate.Off)
            {
                candidates = candidates.Where(threat =>
                    !string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase) &&
                    !string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase)).ToList();
                if (candidates.Count == 0)
                    candidates = _gameData.Threats.Where(threat =>
                        !string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase) &&
                        !string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase)).ToList();
            }

            if (settings.AvoidRepeatedThreats)
            {
                var unused = candidates.Where(threat => !room.TriggeredThreatIds.Contains(threat.Id)).ToList();
                if (unused.Count > 0) candidates = unused;
            }

            if (candidates.Count == 0)
            {
                candidates = _gameData.Threats.ToList();
            }

            var safeFallback = candidates.FirstOrDefault() ?? _gameData.Threats.FirstOrDefault() ?? new Bunker.Models.GameData.ThreatData
            {
                Id = "fallback_threat",
                Name = "Невідома загроза",
                Description = "Бункер зіткнувся з непередбаченою небезпекою.",
                Round = round
            };
            var selected = new ThreatPoolSelector().Select(
                candidates,
                threat => settings.InteractiveThreatRate != InteractiveThreatRate.Off &&
                    (string.Equals(threat.Id, RadiationLeakThreatId, StringComparison.OrdinalIgnoreCase)
                    ? _threatMiniGames.TryGet(RadiationLeakThreatId, out _)
                    : string.Equals(threat.Id, AirFilterFailureThreatId, StringComparison.OrdinalIgnoreCase) &&
                      IsPlanChoiceMechanics(threat.Mechanics)),
                _random.Next,
                safeFallback,
                RoomGameSettingsService.InteractivePercent(settings.InteractiveThreatRate));
            return CloneThreatData(selected);
        }

        private bool ShouldTriggerThreat(Room room, int completedRound)
        {
            var settings = _roomGameSettings.GetEffective(room);
            if (!settings.ThreatsEnabled || completedRound < settings.FirstThreatRound || room.ThreatRoundsTriggered.Contains(completedRound)) return false;
            if (settings.MaxThreatsPerGame.HasValue && room.ThreatsTriggeredCount >= settings.MaxThreatsPerGame.Value) return false;
            if (room.ThreatState != null && room.ThreatState.ThreatStatus is not ("hidden" or "aborted" or "resolved_safely" or "resolved_with_casualty" or "failed" or "completed")) return false;
            return settings.ThreatFrequency switch
            {
                ThreatFrequencyMode.OncePerGame => room.ThreatsTriggeredCount == 0,
                ThreatFrequencyMode.EveryRound => true,
                ThreatFrequencyMode.EveryOtherRound => (completedRound - settings.FirstThreatRound) % 2 == 0,
                ThreatFrequencyMode.RandomEligibleRounds => _random.Next(0, 2) == 0,
                _ => false
            };
        }

        private static bool IsVotingRound(Room room, int completedRound)
        {
            var settings = room.SettingsFrozen && room.FrozenGameSettings != null
                ? RoomGameSettingsService.Migrate(room.FrozenGameSettings)
                : RoomGameSettingsService.Migrate(room.GameSettings);
            if (!settings.VotingEnabled || completedRound < settings.VotingStartRound) return false;
            return settings.VotingFrequency == VotingFrequencyMode.EveryRound ||
                   (completedRound - settings.VotingStartRound) % 2 == 0;
        }

        private void StartConfiguredRoundTimer(Room room)
        {
            var settings = _roomGameSettings.GetEffective(room);
            if (settings.RoundTimerEnabled && settings.AutoStartRoundTimer)
                _gameTimerService.Start(room, settings.RoundTimerDurationSeconds, GameTimerPurpose.Round, $"Round {room.CurrentRound}");
        }

        private RoundVotingAdminService.VotingStartAvailability GetVotingStartAvailability(Room room)
        {
            var threatState = EnsureRadiationThreatState(room);
            var hasUnresolvedBlockingThreat = IsRadiationThreatActive(room, threatState) &&
                !threatState.Resolution.EffectsApplied;
            return RoundVotingAdminService.CanStartVoting(room, hasUnresolvedBlockingThreat);
        }

        private static Bunker.Models.GameData.ThreatData CloneThreatData(Bunker.Models.GameData.ThreatData source)
        {
            return new Bunker.Models.GameData.ThreatData
            {
                Id = source.Id,
                Name = source.Name,
                Description = source.Description,
                Severity = source.Severity,
                Round = source.Round,
                RevealRound = source.RevealRound,
                Category = source.Category,
                RelatedApocalypseIds = source.RelatedApocalypseIds.ToList(),
                ApocalypseTags = source.ApocalypseTags.ToList(),
                RelatedBunkerIds = source.RelatedBunkerIds.ToList(),
                BunkerTags = source.BunkerTags.ToList(),
                Tags = source.Tags.ToList(),
                IsUniversalFallback = source.IsUniversalFallback,
                IsRevealedByDefault = source.IsRevealedByDefault,
                ImageUrl = source.ImageUrl,
                ImagePath = source.ImagePath,
                UploadedImagePath = source.UploadedImagePath,
                ImagePrompt = source.ImagePrompt,
                GeneratedImagePrompt = source.GeneratedImagePrompt,
                Requirements = source.Requirements.ToList(),
                Risks = source.Risks.ToList(),
                Consequences = source.Consequences.ToList(),
                Mechanics = source.Mechanics,
                I18n = source.I18n
            };
        }

        private Item? DrawRandomInventoryItem()
        {
            if (_gameData.Items.Count == 0)
            {
                return null;
            }

            var itemData = _gameData.Items[_random.Next(_gameData.Items.Count)];

            return new Item
            {
                Name = itemData.Item,
                Description = $"Категорія: {itemData.Category}",
                Quantity = 1,
                Unit = "шт",
                WeightKg = Math.Round(_random.NextDouble() * 2 + 0.1, 1),
                IsUsefulInBunker = true,
                Rarity = "Звичайний",
                ResourceTags = itemData.ResourceTags.ToList(),
                ProtectionTags = itemData.ProtectionTags.ToList(),
                ThreatUsage = itemData.ThreatUsage,
                I18n = itemData.I18n
            };
        }

        private List<object> GrantConfiguredBonusInventory(Room room, int completedRound)
        {
            var settings = _roomGameSettings.GetEffective(room);
            if (!settings.BonusInventoryEnabled || completedRound != settings.BonusInventoryRound || room.AdditionalInventoryGrantedAfterRound3)
            {
                return new();
            }

            room.AdditionalInventoryGrantedAfterRound3 = true;
            var grants = new List<object>();

            foreach (var entry in RoomService.GetGameplayPlayersSnapshot(room))
            {
                var player = entry.Value;
                if (player == null || player.IsEliminated)
                {
                    continue;
                }

                for (var itemIndex = 0; itemIndex < settings.BonusInventoryCount; itemIndex++)
                {
                    var item = DrawRandomInventoryItem();
                    if (item == null) continue;

                    player.Inventory.Items.Add(item);

					if (player.Revealed.Inventory)
					{
						SetCharacteristicRevealed(player, "Inventory");
					}

                    grants.Add(new
                    {
                        connectionId = string.IsNullOrWhiteSpace(player.ConnectionId) ? entry.Key : player.ConnectionId,
                        stablePlayerId = RoomService.GetPlayerKey(player),
                        playerName = player.Name ?? "Unknown",
                        itemName = item.Name,
                        item,
                        inventory = player.Inventory,
                        isInventoryRevealed = player.Revealed.Inventory
                    });
                }
            }

            return grants;
        }

        #endregion
    }
}


