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
            string? targetCurrentConnectionId = null;
            Player? targetPlayer = null;
            var room = _roomService.GetRoom(roomId);
            if (!string.IsNullOrEmpty(targetPlayerId) && room != null)
            {
                if (!_roomService.TryResolvePlayer(room, targetPlayerId, out targetCurrentConnectionId, out targetPlayer))
                {
                    await Clients.Caller.SendAsync("ReceiveError", "Ціль карти не знайдена");
                    return;
                }

                card.TargetPlayerId = RoomService.GetPlayerKey(targetPlayer);
            }
            card.TargetCharacteristic = targetCharacteristic;
            card.RequestedAt = DateTime.UtcNow;
            
            if (card.RequiresApproval)
            {
                card.State = CardState.Pending;
                _roomService.UpdatePlayer(Context.ConnectionId, player);
                
                // Повідомляємо хоста про запит
                await Clients.Client(room!.HostConnectionId).SendAsync("CardApprovalRequest", new
                {
                    card = card.ToClientInfo(),
                    playerName = player.Name,
                    playerConnectionId = RoomService.GetPlayerKey(player),
                    targetPlayerName = targetPlayer?.Name
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
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;
            Player? player = null;
            if (room != null)
            {
                _roomService.TryResolvePlayer(room, playerConnectionId, out playerConnectionId, out player);
            }
            
            if (roomId == null || room == null || player == null)
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
            var room = roomId != null ? _roomService.GetRoom(roomId) : null;
            Player? player = null;
            if (room != null)
            {
                _roomService.TryResolvePlayer(room, playerConnectionId, out playerConnectionId, out player);
            }
            
            if (roomId == null || room == null || player == null)
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
            
            var room = _roomService.GetPlayerRoom(Context.ConnectionId);
            if (room == null || !_roomService.TryResolvePlayer(room, targetConnectionId, out var targetCurrentConnectionId, out var player))
            {
                await Clients.Caller.SendAsync("ReceiveError", "Гравця не знайдено");
                return;
            }
            
            var card = _cardService.CreateCardFromTemplateId(cardTemplateId, RoomService.GetPlayerKey(player));
            if (card == null)
            {
                await Clients.Caller.SendAsync("ReceiveError", "Шаблон карти не знайдено");
                return;
            }
            
            player.Cards.Add(card);
            _roomService.UpdatePlayer(targetCurrentConnectionId, player);
            
            // Повідомляємо гравця про нову карту
            await Clients.Client(targetCurrentConnectionId).SendAsync("CardReceived", card.ToClientInfo());
            
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
                    if (!string.IsNullOrEmpty(card.TargetPlayerId) &&
                        _roomService.TryResolvePlayer(room, card.TargetPlayerId, out var revealTargetConnectionId, out var targetPlayer))
                    {
                        var charName = !string.IsNullOrEmpty(card.EffectValue) ? card.EffectValue : card.TargetCharacteristic;
                        if (!string.IsNullOrEmpty(charName))
                        {
                            SetCharacteristicRevealed(targetPlayer, charName);
                            _roomService.UpdatePlayer(revealTargetConnectionId, targetPlayer);
                            
                            var revealedData = GetRevealedDataForCharacteristic(targetPlayer, charName);
                            await Clients.Group(roomId).SendAsync("CharacteristicRevealed", new
                            {
                                playerName = targetPlayer.Name,
                                connectionId = revealTargetConnectionId,
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
                        player.Fact = tempPlayer.Fact;
						resultMessage = "Всі характеристики регенеровано";
                    }
                    else if (!string.IsNullOrEmpty(card.EffectValue))
                    {
                        CopyCharacteristic(player, tempPlayer, card.EffectValue);
                        resultMessage = $"Регенеровано {card.EffectValue}";
                    }
                    break;
                    
                case CardEffectType.SwapCharacteristic:
                    if (!string.IsNullOrEmpty(card.TargetPlayerId) &&
                        _roomService.TryResolvePlayer(room, card.TargetPlayerId, out var swapTargetConnectionId, out var swapTarget))
                    {
                        var charToSwap = card.EffectValue;
                        if (!string.IsNullOrEmpty(charToSwap))
                        {
                            // Зберігаємо значення для обміну
                            var tempSwap = _generator.Generate("swap");
                            CopyCharacteristic(tempSwap, player, charToSwap);
                            CopyCharacteristic(player, swapTarget, charToSwap);
                            CopyCharacteristic(swapTarget, tempSwap, charToSwap);
                            
                            _roomService.UpdatePlayer(swapTargetConnectionId, swapTarget);
                            
                            // Повідомляємо обох гравців
                            await Clients.Client(swapTargetConnectionId).SendAsync("CharacteristicSwapped", new
                            {
                                characteristicName = charToSwap,
                                withPlayerName = player.Name,
                                player = swapTarget
                            });
                            
                            resultMessage = $"Обміняно {charToSwap} з {swapTarget.Name}";
                        }
                    }
                    break;
                    
                case CardEffectType.ViewFact:
                    if (!string.IsNullOrEmpty(card.TargetPlayerId) &&
                        _roomService.TryResolvePlayer(room, card.TargetPlayerId, out _, out var secretTarget))
                    {
                        var factType = "Fact";
                        string factValue = secretTarget.Fact.Name;
                        
                        // Відправляємо тільки власнику карти
                        await Clients.Caller.SendAsync("FactViewed", new
                        {
                            targetPlayerName = secretTarget.Name,
                            factType = factType,
                            factValue = factValue
                        });
                        
                        resultMessage = $"Переглянуто факт гравця {secretTarget.Name}";
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
			if (!string.IsNullOrEmpty(card.TargetPlayerId) &&
				_roomService.TryResolvePlayer(room, card.TargetPlayerId, out _, out var targetForName))
			{
				targetPlayerName = targetForName.Name;
			}

			room.ActivatedCards.Add(new ActivatedCardInfo
			{
				CardId = card.Id,
				CardName = card.Name,
				Rarity = card.Rarity ?? "common",
				Description = card.Description ?? "",
				PlayerId = RoomService.GetPlayerKey(player),
				PlayerName = player.Name,
				TargetPlayerId = card.TargetPlayerId,
				TargetPlayerName = targetPlayerName,
				TargetCharacteristic = card.TargetCharacteristic,
				ConnectionId = player.ConnectionId ?? "",
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
    }
}


