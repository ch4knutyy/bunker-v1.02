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

            var room = _roomService.GetRoom(roomId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }
            if (await RejectPausedPlayerAction(room)) return;

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
                await Clients.Caller.SendAsync("ReceiveError", "У цьому раунді ви вже розкрили характеристику");
                return;
            }

            characteristicName = NormalizeCharacteristicName(characteristicName?.Trim() ?? "");
            if (string.Equals(characteristicName, "SpecialCard", StringComparison.Ordinal))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Спеціальні карти активуються окремою кнопкою");
                return;
            }

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
                "Inventory" => player.Revealed.Inventory,
                "Property" => player.Revealed.Property,
				"Fact" => player.Revealed.Fact,
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
            room.CurrentRoundReveals[playerKey] = characteristicName;

            // Оновлюємо гравця в сервісі
            _roomService.UpdatePlayer(Context.ConnectionId, player);

            var roundState = BuildRoundState(room);

            // Повідомляємо всіх в кімнаті про розкриту характеристику
            await Clients.Group(roomId).SendAsync("CharacteristicRevealed", new
            {
                playerName = player.Name,
                connectionId = Context.ConnectionId,
                characteristicKey = characteristicName,
                data = revealedData,
                currentRound = room.CurrentRound,
                roundState
            });

            await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);
            await BroadcastOmniscientStateToAuthorizedSpectators(room);
        }

        /// <summary>
        /// Відповідь гравця на перевірку готовності до голосування.
        /// </summary>
        public async Task SubmitVotingReadyStatus(string status)
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var player = _roomService.GetPlayer(Context.ConnectionId);

            if (roomId == null || player == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var room = _roomService.GetRoom(roomId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }
            if (await RejectPausedPlayerAction(room)) return;

            if (room.State != RoomState.Playing || room.CurrentPhase != GamePhase.PreVotingReadyCheck)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Зараз немає активної перевірки готовності");
                return;
            }

            status = (status ?? "").Trim().ToLowerInvariant() switch
            {
                "ready" => "ready",
                "add" => "add",
                "special" => "special",
                _ => "pending"
            };

            if (status == "pending")
            {
                await Clients.Caller.SendAsync("ReceiveError", "Невідомий статус готовності");
                return;
            }

            room.VotingReadyResponses[RoomService.GetPlayerKey(player)] = status;
            var roundState = BuildRoundState(room);

            await Clients.Group(roomId).SendAsync("VotingReadyStatusUpdated", new
            {
                playerName = player.Name,
                status,
                roundState
            });
            await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);
            await BroadcastOmniscientStateToAuthorizedSpectators(room);
        }

        /// <summary>
        /// Вибулий гравець сам розкриває всі свої звичайні характеристики.
        /// </summary>
        public async Task RevealAllEliminatedPlayerCharacteristics()
        {
            var roomId = _roomService.GetPlayerRoomId(Context.ConnectionId);
            var player = _roomService.GetPlayer(Context.ConnectionId);

            if (roomId == null || player == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Ви не в кімнаті");
                return;
            }

            var room = _roomService.GetRoom(roomId);
            if (room == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Кімнату не знайдено");
                return;
            }
            if (await RejectPausedPlayerAction(room)) return;

            if (!player.IsEliminated || !player.CanRevealAllAfterElimination)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Розкрити всі характеристики може тільки вибулий гравець");
                return;
            }

            if (player.HasRevealedAllAfterElimination)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Усі характеристики вже розкрито");
                return;
            }

            var characteristicKeys = new[]
            {
                "Personality",
                "Body",
                "Profession",
                "PhysicalHealth",
                "MentalHealth",
                "Hobby",
                "CharacterTrait",
                "Phobia",
                "Inventory",
                "Property",
                "Fact"
            };

            foreach (var characteristicKey in characteristicKeys)
            {
                var data = GetRevealedDataForCharacteristic(player, characteristicKey);
                if (data == null)
                {
                    continue;
                }

                SetCharacteristicRevealed(player, characteristicKey);

                await Clients.Group(roomId).SendAsync("CharacteristicRevealed", new
                {
                    playerName = player.Name,
                    connectionId = Context.ConnectionId,
                    characteristicKey,
                    data,
                    revealedByEliminatedPlayer = true
                });
            }

            player.HasRevealedAllAfterElimination = true;
            player.CanRevealAllAfterElimination = false;
            _roomService.UpdatePlayer(Context.ConnectionId, player);

            var roundState = BuildRoundState(room);

            await Clients.Group(roomId).SendAsync("EliminatedPlayerRevealedAll", new
            {
                connectionId = Context.ConnectionId,
                playerName = player.Name,
                hasRevealedAllAfterElimination = true,
                canRevealAllAfterElimination = false,
                message = "Вибулий гравець розкрив усі свої характеристики.",
                roundState
            });

            await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);
            await BroadcastOmniscientStateToAuthorizedSpectators(room);
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
                        : $"{player.Profession.Name}{(string.IsNullOrWhiteSpace(player.ProfessionItem?.Name) ? "" : $" + {player.ProfessionItem.Name}")} ({player.Profession.ExperienceYears} р. досвіду)",
                    tooltip = CleanTooltip(player.Profession.Tooltip),
                    hasTooltip = !string.IsNullOrEmpty(CleanTooltip(player.Profession.Tooltip)),
                    source = new
                    {
                        player.Profession.Name,
                        player.Profession.ExperienceYears,
                        player.Profession.Type,
                        player.Profession.Skills,
                        player.Profession.AllItems,
                        player.Profession.SelectedItem,
                        player.Profession.SelectedItemIndex,
                        player.Profession.Bonus,
                        player.Profession.CapabilityTags,
                        player.Profession.Tooltip,
                        player.Profession.I18n,
                        ProfessionItem = player.ProfessionItem
                    },
                    typeClass = "profession"
                },
                "PhysicalHealth" => new
                {
                    label = "Фізичне здоров'я",
                    value = string.IsNullOrEmpty(player.PhysicalHealth.Name) 
                        ? "Здоровий" 
                        : player.PhysicalHealth.Name,
                    tooltip = CleanTooltip(player.PhysicalHealth.Tooltip),
                    hasTooltip = !string.IsNullOrEmpty(CleanTooltip(player.PhysicalHealth.Tooltip)),
                    source = player.PhysicalHealth,
                    additionalConditionEffects = player.AdditionalConditionEffects,
                    typeClass = "physical"
                },
                "MentalHealth" => new
                {
                    label = "Психічне здоров'я",
                    value = string.IsNullOrEmpty(player.MentalHealth.Name) 
                        ? "Стабільний" 
                        : player.MentalHealth.Name,
                    tooltip = CleanTooltip(player.MentalHealth.Tooltip),
                    hasTooltip = !string.IsNullOrEmpty(CleanTooltip(player.MentalHealth.Tooltip)),
                    source = player.MentalHealth,
                    typeClass = "mental"
                },
                "Hobby" => new
                {
                    label = "Хобі",
                    value = string.IsNullOrEmpty(player.Hobby.Name) 
                        ? "Немає хобі" 
                        : player.Hobby.Name,
                    tooltip = CleanTooltip(player.Hobby.Tooltip),
                    hasTooltip = !string.IsNullOrEmpty(CleanTooltip(player.Hobby.Tooltip)),
                    source = player.Hobby,
                    typeClass = "hobby"
                },
                "CharacterTrait" => new
                {
                    label = "Риса характеру",
                    value = string.IsNullOrEmpty(player.CharacterTrait.Name) 
                        ? "Невизначений" 
                        : player.CharacterTrait.Name,
                    source = player.CharacterTrait
                },
                "Phobia" => new
                {
                    label = "Фобія",
                    value = string.IsNullOrEmpty(player.Phobia.Name) || player.Phobia.Name == "Немає фобій"
                        ? "Немає фобій" 
                        : player.Phobia.Name,
                    tooltip = CleanTooltip(player.Phobia.Tooltip),
                    hasTooltip = !string.IsNullOrEmpty(CleanTooltip(player.Phobia.Tooltip)),
                    source = player.Phobia,
                    typeClass = "phobia"
                },
                "Inventory" => new
                {
                    label = "Інвентар",
                    value = player.Inventory.Items.Count > 0 
                        ? string.Join(", ", player.Inventory.Items.Select(i => i.Name)) 
                        : "Порожній",
                    source = player.Inventory
                },
                "Property" => player.Property == null ? null : new
                {
                    label = "Майно",
                    value = _gameData.FormatProperty(player.Property, "uk"),
                    source = player.Property
                },
				"Fact" => new
				{
					label = "Факт",
					value = player.Fact.Name,
					fact = player.Fact,
					tooltip = CleanTooltip(player.Fact.Tooltip),
					hasTooltip = !string.IsNullOrEmpty(CleanTooltip(player.Fact.Tooltip)),
					source = player.Fact,
					typeClass = "fact"
				},
				_ => null
            };
        }

        private Dictionary<string, object?> BuildRevealedSources(Player player)
        {
            var sources = new Dictionary<string, object?>();
            if (player.Revealed.Profession) sources["Profession"] = new
            {
                player.Profession.Name,
                player.Profession.ExperienceYears,
                player.Profession.Type,
                player.Profession.Skills,
                player.Profession.AllItems,
                player.Profession.SelectedItem,
                player.Profession.SelectedItemIndex,
                player.Profession.Bonus,
                player.Profession.CapabilityTags,
                player.Profession.Tooltip,
                player.Profession.I18n,
                ProfessionItem = player.ProfessionItem
            };
            if (player.Revealed.PhysicalHealth) sources["PhysicalHealth"] = player.PhysicalHealth;
            if (player.Revealed.MentalHealth) sources["MentalHealth"] = player.MentalHealth;
            if (player.Revealed.Hobby) sources["Hobby"] = player.Hobby;
            if (player.Revealed.CharacterTrait) sources["CharacterTrait"] = player.CharacterTrait;
            if (player.Revealed.Phobia) sources["Phobia"] = player.Phobia;
            if (player.Revealed.Inventory) sources["Inventory"] = player.Inventory;
            if (player.Revealed.Property && player.Property != null) sources["Property"] = player.Property;
            if (player.Revealed.Fact) sources["Fact"] = player.Fact;
            return sources;
        }

        private static string NormalizeCharacteristicName(string characteristicName)
        {
            return characteristicName switch
            {
                _ => characteristicName
            };
        }

        private static string CleanTooltip(string? tooltip)
        {
            if (string.IsNullOrWhiteSpace(tooltip)) return "";

            var cleaned = tooltip;
            var phrases = new[]
            {
                "Тип: слабка",
                "Тип: середня",
                "Тип: сильна",
                "Тип: дорослий контент",
                "Категорія:",
                "Category:",
                "Source:",
                "source:",
                "type:",
                "category:",
                "Ефект у грі:",
                "Ефект у бункері:",
                "Ефекти у грі:",
                "Ефекти у бункері:",
                "Дорослий контент",
                "Сильна",
                "Слабка"
            };

            foreach (var phrase in phrases)
            {
                cleaned = cleaned.Replace(phrase, "", StringComparison.OrdinalIgnoreCase);
            }

            while (cleaned.Contains("..")) cleaned = cleaned.Replace("..", ".");
            cleaned = System.Text.RegularExpressions.Regex.Replace(
                cleaned,
                @"\s*\((?:міфологія|mythology|adult\s*content|combat|weird|feature|корисна|серйозна|мемна|еротична|креативна|абсурдна|неіснуюча)\)\s*",
                " ",
                System.Text.RegularExpressions.RegexOptions.IgnoreCase);
            cleaned = string.Join(". ", cleaned.Split('.', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries));
            return string.IsNullOrWhiteSpace(cleaned) ? "" : cleaned + ".";
        }

        private void SetCharacteristicRevealed(Player player, string characteristicName)
        {
            characteristicName = NormalizeCharacteristicName(characteristicName);
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
                case "Inventory": player.Revealed.Inventory = true; break;
                case "Property": player.Revealed.Property = true; break;
				case "Fact": player.Revealed.Fact = true; break;
            }
        }

        #endregion
    }
}


