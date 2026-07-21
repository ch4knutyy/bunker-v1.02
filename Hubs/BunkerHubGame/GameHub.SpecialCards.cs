using Bunker.Models;
using Bunker.Services;
using Microsoft.AspNetCore.SignalR;
using System.Text.Json;

namespace Bunker.Hubs
{
	public partial class GameHub
	{
		public Task UseSpecialCard(string? targetConnectionId)
		{
			return UseSpecialCardCore(null, targetConnectionId, null);
		}

		public Task UseSpecialCardById(
			string cardId,
			string? targetConnectionId,
			string? useMode = null,
			string? selectedCharacteristic = null,
			string? commandId = null)
		{
			return UseSpecialCardCore(cardId, targetConnectionId, useMode, selectedCharacteristic, commandId);
		}

		private async Task UseSpecialCardCore(
			string? cardId,
			string? targetConnectionId,
			string? requestedUseMode,
			string? selectedCharacteristic = null,
			string? commandId = null)
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

			var cards = GetPlayerSpecialCards(player);
			var card = string.IsNullOrWhiteSpace(cardId)
				? player.SpecialCard
				: cards.FirstOrDefault(candidate => string.Equals(candidate.Id, cardId, StringComparison.Ordinal));
			if (card == null || string.IsNullOrWhiteSpace(card.Id) || card.Id == "no_special_card")
			{
				await Clients.Caller.SendAsync("ReceiveError", "У вас немає спеціальної карти");
				return;
			}

			if (!string.IsNullOrWhiteSpace(commandId))
			{
				commandId = commandId.Trim();
				if (commandId.Length > 100)
				{
					await Clients.Caller.SendAsync("ReceiveError", "invalid_command_id");
					return;
				}

				lock (room.ProcessedSpecialCardCommandIds)
				{
					if (room.ProcessedSpecialCardCommandIds.Contains(commandId))
					{
						commandId = null;
					}
				}
				if (commandId == null)
				{
					await Clients.Caller.SendAsync("SpecialCardStateUpdated", new
					{
						card,
						cards = GetPlayerSpecialCards(player),
						inventory = player.Inventory,
						property = BuildPropertyClientState(player.Property),
						result = card.EffectResult,
						roundState = BuildRoundState(room),
						idempotent = true
					});
					return;
				}
			}

			if (card.IsUsed || card.IsActive)
			{
				await Clients.Caller.SendAsync("ReceiveError", "Цю спеціальну карту вже використано");
				return;
			}

			if (!CanUseSpecialCardNow(room, card))
			{
				await Clients.Caller.SendAsync("ReceiveError", "Недоступно зараз");
				return;
			}

			var useMode = ResolveSpecialCardUseMode(card, requestedUseMode);

			Player? targetPlayer = null;
			if (card.RequiresTarget)
			{
				if (string.IsNullOrWhiteSpace(targetConnectionId) ||
					!_roomService.TryResolvePlayer(room, targetConnectionId, out _, out targetPlayer) ||
					targetPlayer.IsEliminated)
				{
					await Clients.Caller.SendAsync("ReceiveError", "Оберіть активного гравця для ефекту карти");
					return;
				}

				if (RoomService.GetPlayerKey(targetPlayer) == RoomService.GetPlayerKey(player))
				{
					await Clients.Caller.SendAsync("ReceiveError", "Не можна застосувати цю карту до себе");
					return;
				}
			}

			if (!string.IsNullOrWhiteSpace(commandId))
			{
				bool commandAdded;
				lock (room.ProcessedSpecialCardCommandIds)
				{
					commandAdded = room.ProcessedSpecialCardCommandIds.Add(commandId);
				}
				if (!commandAdded)
				{
					await Clients.Caller.SendAsync("SpecialCardStateUpdated", new
					{
						card,
						cards = GetPlayerSpecialCards(player),
						inventory = player.Inventory,
						property = BuildPropertyClientState(player.Property),
						result = card.EffectResult,
						roundState = BuildRoundState(room),
						idempotent = true
					});
					return;
				}
			}

			var resolution = await ApplySpecialCardEffect(room, player, card, targetPlayer, useMode, selectedCharacteristic);
			if (!resolution.Success)
			{
				if (!string.IsNullOrWhiteSpace(commandId))
				{
					lock (room.ProcessedSpecialCardCommandIds)
					{
						room.ProcessedSpecialCardCommandIds.Remove(commandId);
					}
				}
				await Clients.Caller.SendAsync("ReceiveError", resolution.Error);
				return;
			}

			card.IsUsed = card.IsOneTimeUse;
			card.IsActive = resolution.ActivateForVoting;
			card.UsedAtRound = room.CurrentRound;
			card.ActivatedRound = room.CurrentRound;
			card.TargetPlayerId = targetPlayer == null ? null : RoomService.GetPlayerKey(targetPlayer);
			card.TargetPlayerName = targetPlayer?.Name;
			card.ActivatedVotingId = null;
			card.EffectResult = resolution.OwnerResult;
			card.PublicLog = resolution.PublicLog;
			card.PrivateResult = resolution.OwnerResult;
			card.UseMode = useMode;
			card.WasUsedSilently = card.IsSecret && string.Equals(useMode, "silent", StringComparison.OrdinalIgnoreCase);
			card.IsPubliclyRevealed = !card.IsSecret || string.Equals(useMode, "public", StringComparison.OrdinalIgnoreCase);
			card.EffectDuration = GetSpecialCardEffectDuration(card);
			card.EffectExpiresAtRound = card.EffectDuration == "untilRoundEnd" ? room.CurrentRound : null;
			card.PublicVisibilityExpiresAtRound = card.WasUsedSilently ? room.CurrentRound : null;
			card.PublicDisplayName = card.WasUsedSilently ? "Прихована секретна карта" : card.Name;
			card.PublicDescription = card.WasUsedSilently ? "Деталі приховані" : card.Description;
			card.PublicResult = card.WasUsedSilently ? null : resolution.PublicLog;

			var roundState = BuildRoundState(room);

			await Clients.Caller.SendAsync("SpecialCardStateUpdated", new
			{
				card,
				cards = GetPlayerSpecialCards(player),
				inventory = player.Inventory,
				property = BuildPropertyClientState(player.Property),
				result = resolution.OwnerResult,
				roundState
			});

			await Clients.Caller.SendAsync("SpecialCardPrivateResult", new
			{
				cardId = card.Id,
				cardName = card.Name,
				message = resolution.OwnerResult
			});

			if (targetPlayer != null && !string.IsNullOrWhiteSpace(resolution.TargetResult))
			{
				await Clients.Client(targetPlayer.ConnectionId).SendAsync("SpecialCardTargetStateUpdated", new
				{
					message = resolution.TargetResult,
					inventory = targetPlayer.Inventory,
					property = BuildPropertyClientState(targetPlayer.Property),
					specialCards = GetPlayerSpecialCards(targetPlayer)
				});
			}

			// Повна синхронізація власника карти.
			// Потрібна для reroll/swap професії, здоров'я, хобі та інших характеристик.
			await SendPersonalPlayerSnapshot(
				player.ConnectionId,
				player,
				"special_card_owner_updated");

			// Повна синхронізація гравця, на якого подіяла карта.
			if (targetPlayer != null)
			{
				await SendPersonalPlayerSnapshot(
					targetPlayer.ConnectionId,
					targetPlayer,
					"special_card_target_updated");
			}

			// Оновлюємо відкриті характеристики для решти кімнати.
			await SendPublicPlayersUpdate(room);

			if (IsSpecialCardPublic(room, player, card))
			{
				var isSanitizedPublicEvent = card.WasUsedSilently && !card.IsPubliclyRevealed;
				await Clients.Group(roomId).SendAsync("SpecialCardActivated", new
				{
					ownerPlayerId = RoomService.GetPlayerKey(player),
					ownerConnectionId = player.ConnectionId,
					ownerPlayerName = player.Name,
					targetPlayerId = isSanitizedPublicEvent ? null : card.TargetPlayerId,
					targetPlayerName = isSanitizedPublicEvent ? null : card.TargetPlayerName,
					card = BuildSpecialCardPublicState(room, player, card),
					message = isSanitizedPublicEvent ? null : resolution.PublicLog,
					roundState
				});
			}

			await Clients.Group(roomId).SendAsync("RoundStateUpdated", roundState);
			_gmAudit.Append(
				room,
				RoomService.GetPlayerKey(player),
				$"special_card_{card.EffectType}",
				GmAuditResult.Success,
				"Special card effect applied.",
				targetPlayer == null ? null : RoomService.GetPlayerKey(targetPlayer),
				commandId);
			QueueRoomRecovery(room, "special_card_applied");

			_logger.LogInformation(
				"Гравець {PlayerName} використав спеціальну карту {CardName} у режимі {UseMode} проти {TargetName} у кімнаті {RoomName}",
				player.Name,
				card.Name,
				useMode,
				card.TargetPlayerName,
				room.Name);
		}

		private static string ResolveSpecialCardUseMode(SpecialCard card, string? requestedUseMode)
		{
			if (!card.IsSecret)
			{
				return "public";
			}

			return string.Equals(requestedUseMode, "public", StringComparison.OrdinalIgnoreCase)
				? "public"
				: "silent";
		}

		private static bool CanUseSpecialCardNow(Room room, SpecialCard card)
		{
			if (room.State != RoomState.Playing)
			{
				return false;
			}

			if (string.Equals(card.Phase, "beforeVoting", StringComparison.OrdinalIgnoreCase))
			{
				return room.CurrentPhase == GamePhase.PreVotingReadyCheck;
			}

			return string.Equals(card.Phase, "discussion", StringComparison.OrdinalIgnoreCase) &&
				room.CurrentPhase is GamePhase.RoundReveal
					or GamePhase.RoundEnded
					or GamePhase.Threat
					or GamePhase.ExtraInventory
					or GamePhase.PreVotingReadyCheck
					or GamePhase.VotingResults;
		}

		private async Task<SpecialCardResolution> ApplySpecialCardEffect(
			Room room,
			Player owner,
			SpecialCard card,
			Player? target,
			string useMode,
			string? selectedCharacteristic = null)
		{
			var publicUse = !card.IsSecret || string.Equals(useMode, "public", StringComparison.OrdinalIgnoreCase)
				? $"{owner.Name} використав карту «{card.Name}»."
				: null;

			switch (card.EffectType)
			{
				case "doubleVotesAgainstTargetAndBlockCasterVote":
					return SpecialCardResolution.Ok(
						$"Карту активовано проти {target!.Name}.",
						publicUse,
						activateForVoting: true);

				case "forceRevealProfession":
					return await RevealCharacteristics(room, owner, card, target!, new[] { "Profession" }, publicUse);
				case "forceRevealPhysicalHealth":
					return await RevealCharacteristics(room, owner, card, target!, new[] { "PhysicalHealth" }, publicUse);
				case "forceRevealMentalHealth":
					return await RevealCharacteristics(room, owner, card, target!, new[] { "MentalHealth" }, publicUse);
				case "forceRevealHobby":
					return await RevealCharacteristics(room, owner, card, target!, new[] { "Hobby" }, publicUse);
				case "forceRevealTrait":
					return await RevealCharacteristics(room, owner, card, target!, new[] { "CharacterTrait" }, publicUse);
				case "forceRevealSecret":
					return await RevealCharacteristics(room, owner, card, target!, new[] { "Fact" }, publicUse);
				case "forceRevealAllInventory":
					return await RevealCharacteristics(room, owner, card, target!, new[] { "Inventory" }, publicUse);
				case "property_reveal":
					return target == null ||
						   !RoomService.IsGameplayParticipant(target) ||
						   target.Property == null
						? SpecialCardResolution.Fail("property_target_not_available")
						: await RevealCharacteristics(room, owner, card, target, new[] { "Property" }, publicUse);
				case "forceRevealRandomCharacteristic":
					return await RevealRandomCharacteristics(room, owner, card, target!, 1, publicUse);
				case "forceRevealTwoRandomCharacteristics":
					return await RevealRandomCharacteristics(room, owner, card, target!, 2, publicUse);

				case "peekTargetSecret":
					return PeekCharacteristics(target!, new[] { "Fact" }, publicUse);
				case "peekTargetInventory":
					return PeekCharacteristics(target!, new[] { "Inventory" }, publicUse);
				case "peekTargetRandomCharacteristic":
					return PeekRandomCharacteristic(target!, publicUse);

				case "stealRandomInventoryItem":
					return TransferInventoryItem(room, owner, target!, InventoryItemKind.Any, publicUse, false);
				case "stealSmallInventoryItem":
					return TransferInventoryItem(room, owner, target!, InventoryItemKind.Small, publicUse, false);
				case "stealBigInventoryItem":
					return TransferInventoryItem(room, owner, target!, InventoryItemKind.Big, publicUse, false);
				case "silentStealRandomInventoryItem":
					return TransferInventoryItem(room, owner, target!, InventoryItemKind.Any, publicUse, true);
				case "forceTargetGiveRandomItemToOwner":
					return TransferInventoryItem(room, owner, target!, InventoryItemKind.Any, publicUse, false);

				case "swapInventoryWithTarget":
					return SwapInventories(owner, target!, publicUse);
				case "property_swap":
					return await SwapProperties(room, owner, target!, publicUse);
				case "swapOneRandomInventoryItem":
					return SwapRandomInventoryItems(owner, target!, publicUse);
				case "stealRandomSpecialCard":
					return TransferRandomSpecialCard(owner, target!, publicUse);
				case "destroyRandomTargetSpecialCard":
					return DestroyRandomSpecialCard(target!, publicUse);

				case "protectInventoryFromStealUntilRoundEnd":
					owner.InventoryProtectedUntilRound = room.CurrentRound;
					return SpecialCardResolution.Ok(
						"Інвентар захищено до кінця поточного раунду.",
						publicUse);
				case "protectCharacteristicsFromRevealUntilRoundEnd":
					owner.CharacteristicsProtectedUntilRound = room.CurrentRound;
					return SpecialCardResolution.Ok(
						"Характеристики захищено від примусового розкриття до кінця поточного раунду.",
						publicUse);
				case "hideOneRevealedCharacteristic":
					return await HideRandomRevealedCharacteristic(room, owner, publicUse);

				case "swapProfessionWithTarget":
					return await SwapCharacteristic(room, owner, target!, "Profession", publicUse);
				case "swapRandomCharacteristicWithTarget":
					return await SwapRandomCharacteristic(room, owner, target!, GetSwappableCharacteristicKeys(), publicUse);
				case "forceUpperPlayerRevealRandomCharacteristic":
					return await RevealRandomCharacteristicsFromKeys(room, owner, card, GetNeighbor(room, owner, -1)!, GetRevealableCharacteristicKeys(), publicUse);
				case "forceLowerPlayerRevealRandomCharacteristic":
					return await RevealRandomCharacteristicsFromKeys(room, owner, card, GetNeighbor(room, owner, 1)!, GetRevealableCharacteristicKeys(), publicUse);
				case "swapPhysicalHealthWithLowerPlayer":
					return await SwapCharacteristic(room, owner, GetNeighbor(room, owner, 1)!, "PhysicalHealth", publicUse);
				case "swapPhysicalHealthWithUpperPlayer":
					return await SwapCharacteristic(room, owner, GetNeighbor(room, owner, -1)!, "PhysicalHealth", publicUse);
				case "swapMentalHealthWithUpperPlayer":
					return await SwapCharacteristic(room, owner, GetNeighbor(room, owner, -1)!, "MentalHealth", publicUse);
				case "swapMentalHealthWithLowerPlayer":
					return await SwapCharacteristic(room, owner, GetNeighbor(room, owner, 1)!, "MentalHealth", publicUse);
				case "swapRandomCharacteristicBetweenNeighbors":
					return await SwapRandomCharacteristicBetweenNeighbors(room, owner, publicUse);
				case "swapSelectedCharacteristicWithTarget":
					return await SwapCharacteristic(room, owner, target!, RequireSelectedCharacteristic(selectedCharacteristic), publicUse);
				case "swapHobbyWithTarget":
					return await SwapCharacteristic(room, owner, target!, "Hobby", publicUse);
				case "swapTraitWithTarget":
					return await SwapCharacteristic(room, owner, target!, "CharacterTrait", publicUse);
				case "swapFactWithTarget":
					return await SwapCharacteristic(room, owner, target!, "Fact", publicUse);
				case "swapBodyWithTarget":
					return await SwapCharacteristic(room, owner, target!, "Body", publicUse);
				case "swapPersonalInfoWithTarget":
					return await SwapCharacteristic(room, owner, target!, "Personality", publicUse);
				case "rerollUpperPlayerRandomCharacteristic":
					return await RerollRandomCharacteristic(room, GetNeighbor(room, owner, -1)!, publicUse);
				case "rerollLowerPlayerRandomCharacteristic":
					return await RerollRandomCharacteristic(room, GetNeighbor(room, owner, 1)!, publicUse);
				case "rerollTargetSelectedCharacteristic":
					return await RerollCharacteristic(room, target!, RequireSelectedCharacteristic(selectedCharacteristic), publicUse);
				case "property_reroll":
					return await RerollProperty(room, owner, publicUse);
				case "copyTargetProfessionUntilRoundEnd":
					return await CopyProfessionUntilRoundEnd(room, owner, card, target!, publicUse);
				case "copyTargetHobby":
					return await CopyCharacteristic(room, owner, target!, "Hobby", publicUse);
				case "copyUpperPlayerTrait":
					return await CopyCharacteristic(room, owner, GetNeighbor(room, owner, -1)!, "CharacterTrait", publicUse);
				case "copyLowerPlayerFact":
					return await CopyCharacteristic(room, owner, GetNeighbor(room, owner, 1)!, "Fact", publicUse);
				case "forceNeighborsSwapInventory":
					return ForceNeighborsSwapInventory(room, owner, publicUse);
				case "stealUpperPlayerRandomInventoryItem":
					return TransferInventoryItemFromNeighbor(room, owner, GetNeighbor(room, owner, -1), publicUse);
				case "stealLowerPlayerRandomInventoryItem":
					return TransferInventoryItemFromNeighbor(room, owner, GetNeighbor(room, owner, 1), publicUse);
				case "forceNeighborsRevealSameRandomCharacteristicType":
					return await ForceNeighborsRevealSameRandomCharacteristicType(room, owner, card, publicUse);
				case "revealUpperAndHideLowerCharacteristic":
					return await RevealOneAndHideOther(room, owner, card, GetNeighbor(room, owner, -1)!, GetNeighbor(room, owner, 1)!, publicUse);
				case "revealLowerAndHideUpperCharacteristic":
					return await RevealOneAndHideOther(room, owner, card, GetNeighbor(room, owner, 1)!, GetNeighbor(room, owner, -1)!, publicUse);
				case "stealRandomCharacteristicAndRerollTarget":
					return await StealRandomCharacteristicAndRerollTarget(room, owner, target!, publicUse);
				case "swapRandomRevealedCharacteristicWithTarget":
					return await SwapRandomCharacteristic(room, owner, target!, GetSwappableCharacteristicKeys().Where(key => IsCharacteristicRevealed(owner, key) && IsCharacteristicRevealed(target!, key)), publicUse);

				default:
					return SpecialCardResolution.Fail("Ефект цієї карти поки не підтримується");
			}
		}

		private async Task<SpecialCardResolution> RevealRandomCharacteristics(
			Room room,
			Player owner,
			SpecialCard card,
			Player target,
			int count,
			string? publicLog)
		{
			var hidden = GetOrdinaryCharacteristicKeys()
				.Where(key => !IsCharacteristicRevealed(target, key))
				.OrderBy(_ => _random.Next())
				.Take(count)
				.ToArray();

			if (hidden.Length == 0)
			{
				return SpecialCardResolution.Fail("У гравця немає прихованих характеристик");
			}

			return await RevealCharacteristics(room, owner, card, target, hidden, publicLog);
		}

		private async Task<SpecialCardResolution> RevealRandomCharacteristicsFromKeys(
			Room room,
			Player owner,
			SpecialCard card,
			Player? target,
			IEnumerable<string> allowedKeys,
			string? publicLog)
		{
			if (target == null || target.IsEliminated)
				return SpecialCardResolution.Fail("Немає активного гравця для ефекту");

			var hidden = allowedKeys
				.Select(NormalizeSpecialCardCharacteristicKey)
				.Where(key => !IsCharacteristicRevealed(target, key))
				.OrderBy(_ => _random.Next())
				.Take(1)
				.ToArray();

			if (hidden.Length == 0)
				return SpecialCardResolution.Fail("У гравця немає прихованих характеристик");

			return await RevealCharacteristics(room, owner, card, target, hidden, publicLog);
		}

		private async Task<SpecialCardResolution> RevealCharacteristics(
			Room room,
			Player owner,
			SpecialCard card,
			Player target,
			IReadOnlyCollection<string> characteristicKeys,
			string? publicLog)
		{
			if (target.CharacteristicsProtectedUntilRound >= room.CurrentRound)
			{
				return SpecialCardResolution.Fail("Характеристики цього гравця захищені до кінця раунду");
			}

			var revealedLabels = new List<string>();
			foreach (var key in characteristicKeys)
			{
				if (IsCharacteristicRevealed(target, key))
				{
					continue;
				}

				var data = GetRevealedDataForCharacteristic(target, key);
				if (data == null)
				{
					continue;
				}

				SetCharacteristicRevealed(target, key);
				revealedLabels.Add(GetSpecialCardDataLabel(data, key));

				await Clients.Group(room.Id).SendAsync("CharacteristicRevealed", new
				{
					playerName = target.Name,
					connectionId = target.ConnectionId,
					characteristicKey = key,
					data,
					forcedBySpecialCard = true,
					specialCardOwnerName = owner.Name
				});
			}

			if (revealedLabels.Count == 0)
			{
				return SpecialCardResolution.Fail("Вказана характеристика вже розкрита");
			}

			return SpecialCardResolution.Ok(
				$"Розкрито: {string.Join(", ", revealedLabels)}.",
				publicLog);
		}

		private SpecialCardResolution PeekRandomCharacteristic(Player target, string? publicLog)
		{
			var hidden = GetOrdinaryCharacteristicKeys()
				.Where(key => !IsCharacteristicRevealed(target, key))
				.OrderBy(_ => _random.Next())
				.FirstOrDefault();

			return hidden == null
				? SpecialCardResolution.Fail("У гравця немає прихованих характеристик")
				: PeekCharacteristics(target, new[] { hidden }, publicLog);
		}

		private SpecialCardResolution PeekCharacteristics(
			Player target,
			IReadOnlyCollection<string> characteristicKeys,
			string? publicLog)
		{
			var values = characteristicKeys
				.Select(key => new { Key = key, Data = GetRevealedDataForCharacteristic(target, key) })
				.Where(entry => entry.Data != null)
				.Select(entry => $"{GetSpecialCardDataLabel(entry.Data!, entry.Key)}: {GetSpecialCardDataValue(entry.Data!)}")
				.ToList();

			return values.Count == 0
				? SpecialCardResolution.Fail("Немає даних для перегляду")
				: SpecialCardResolution.Ok(string.Join("; ", values), publicLog);
		}

		private SpecialCardResolution TransferInventoryItem(
			Room room,
			Player owner,
			Player target,
			InventoryItemKind kind,
			string? publicLog,
			bool silent)
		{
			if (target.InventoryProtectedUntilRound >= room.CurrentRound)
			{
				return SpecialCardResolution.Fail("Інвентар цього гравця захищений до кінця раунду");
			}

			target.Inventory.Items ??= new List<Item>();
			owner.Inventory.Items ??= new List<Item>();
			var candidates = target.Inventory.Items
				.Where(item => kind switch
				{
					InventoryItemKind.Small => item.WeightKg <= 2,
					InventoryItemKind.Big => item.WeightKg > 2,
					_ => true
				})
				.ToList();

			if (candidates.Count == 0)
			{
				var error = kind switch
				{
					InventoryItemKind.Small => "У гравця немає малого предмета",
					InventoryItemKind.Big => "У гравця немає великого предмета",
					_ => "У гравця немає предметів"
				};
				return SpecialCardResolution.Fail(error);
			}

			var item = candidates[_random.Next(candidates.Count)];
			target.Inventory.Items.Remove(item);
			owner.Inventory.Items.Add(item);
			var ownerResult = $"Отримано предмет: {item.Name}.";

			var isAnonymous =
				silent ||
				string.IsNullOrWhiteSpace(publicLog);

			var targetResult = isAnonymous
				? $"З вашого інвентарю зник предмет «{item.Name}». Винуватець невідомий."
				: $"Гравець {owner.Name} викрав із вашого інвентарю предмет «{item.Name}».";

			return SpecialCardResolution.Ok(
				ownerResult,
				publicLog,
				targetResult
			);
		}

		private static SpecialCardResolution SwapInventories(Player owner, Player target, string? publicLog)
		{
			(owner.Inventory, target.Inventory) = (target.Inventory, owner.Inventory);
			return SpecialCardResolution.Ok(
				$"Інвентар обміняно з гравцем {target.Name}.",
				publicLog,
				$"Ваш інвентар обміняно з гравцем {owner.Name}.");
		}

		private async Task<SpecialCardResolution> SwapProperties(
			Room room,
			Player owner,
			Player target,
			string? publicLog)
		{
			if (owner.Property == null)
			{
				return SpecialCardResolution.Fail("property_not_available");
			}
			if (!RoomService.IsGameplayParticipant(target) || target.Property == null)
			{
				return SpecialCardResolution.Fail("property_target_not_available");
			}

			(owner.Property, target.Property) = (target.Property, owner.Property);
			await BroadcastCharacteristicChangedIfRevealed(room, owner, "Property");
			await BroadcastCharacteristicChangedIfRevealed(room, target, "Property");
			return SpecialCardResolution.Ok(
				$"Майно обміняно з гравцем {target.Name}.",
				publicLog,
				$"Ваше майно обміняно з гравцем {owner.Name}.");
		}

		private async Task<SpecialCardResolution> RerollProperty(
			Room room,
			Player owner,
			string? publicLog)
		{
			var generated = _generator.GenerateProperty(
				RoomService.GetGameplayPlayersSnapshot(room)
					.Select(entry => entry.Value)
					.Where(player => !ReferenceEquals(player, owner)),
				owner.Property?.DefinitionId);
			if (generated == null)
			{
				return SpecialCardResolution.Fail("property_definition_not_found");
			}

			owner.Property = generated;
			await BroadcastCharacteristicChangedIfRevealed(room, owner, "Property");
			return SpecialCardResolution.Ok("Ви отримали нове майно.", publicLog);
		}

		private SpecialCardResolution SwapRandomInventoryItems(Player owner, Player target, string? publicLog)
		{
			owner.Inventory.Items ??= new List<Item>();
			target.Inventory.Items ??= new List<Item>();
			if (owner.Inventory.Items.Count == 0 || target.Inventory.Items.Count == 0)
			{
				return SpecialCardResolution.Fail("Для обміну обидва гравці повинні мати предмети");
			}

			var ownerItem = owner.Inventory.Items[_random.Next(owner.Inventory.Items.Count)];
			var targetItem = target.Inventory.Items[_random.Next(target.Inventory.Items.Count)];
			owner.Inventory.Items.Remove(ownerItem);
			target.Inventory.Items.Remove(targetItem);
			owner.Inventory.Items.Add(targetItem);
			target.Inventory.Items.Add(ownerItem);

			return SpecialCardResolution.Ok(
				$"Ви віддали «{ownerItem.Name}» та отримали «{targetItem.Name}».",
				publicLog,
				$"Ви віддали «{targetItem.Name}» та отримали «{ownerItem.Name}».");
		}

		private SpecialCardResolution TransferRandomSpecialCard(Player owner, Player target, string? publicLog)
		{
			var targetCards = GetPlayerSpecialCards(target);
			var candidates = targetCards
				.Where(card => !card.IsUsed && !card.IsActive && card.Id != "no_special_card")
				.ToList();
			if (candidates.Count == 0)
			{
				return SpecialCardResolution.Fail("У гравця немає спеціальних карт");
			}

			var stolen = candidates[_random.Next(candidates.Count)];
			targetCards.Remove(stolen);
			GetPlayerSpecialCards(owner).Add(stolen);
			SyncPrimarySpecialCard(target);
			SyncPrimarySpecialCard(owner);

			return SpecialCardResolution.Ok(
				$"Викрадено карту «{stolen.Name}».",
				publicLog,
				"У вас викрали одну невикористану спеціальну карту.");
		}

		private SpecialCardResolution DestroyRandomSpecialCard(Player target, string? publicLog)
		{
			var targetCards = GetPlayerSpecialCards(target);
			var candidates = targetCards
				.Where(card => !card.IsUsed && !card.IsActive && card.Id != "no_special_card")
				.ToList();
			if (candidates.Count == 0)
			{
				return SpecialCardResolution.Fail("У гравця немає спеціальних карт");
			}

			var destroyed = candidates[_random.Next(candidates.Count)];
			targetCards.Remove(destroyed);
			SyncPrimarySpecialCard(target);
			return SpecialCardResolution.Ok(
				$"Знищено карту «{destroyed.Name}».",
				publicLog,
				"Одну вашу невикористану спеціальну карту знищено.");
		}

		private async Task<SpecialCardResolution> HideRandomRevealedCharacteristic(
			Room room,
			Player owner,
			string? publicLog)
		{
			var revealed = GetOrdinaryCharacteristicKeys()
				.Where(key => IsCharacteristicRevealed(owner, key))
				.ToList();
			if (revealed.Count == 0)
			{
				return SpecialCardResolution.Fail("Немає розкритих характеристик для приховування");
			}

			var key = revealed[_random.Next(revealed.Count)];
			SetCharacteristicHidden(owner, key);
			await Clients.Group(room.Id).SendAsync("CharacteristicHidden", new
			{
				connectionId = owner.ConnectionId,
				playerName = owner.Name,
				characteristicKey = key,
				hiddenBySpecialCard = true
			});

			return SpecialCardResolution.Ok(
				$"Характеристику «{GetCharacteristicLabel(key)}» приховано.",
				publicLog);
		}

		private async Task<SpecialCardResolution> SwapCharacteristic(
			Room room,
			Player owner,
			Player? target,
			string characteristicKey,
			string? publicLog)
		{
			characteristicKey = NormalizeSpecialCardCharacteristicKey(characteristicKey);
			if (target == null || target.IsEliminated)
				return SpecialCardResolution.Fail("Немає активного гравця для ефекту");
			if (!IsSpecialCardCharacteristicKeyAllowed(characteristicKey))
				return SpecialCardResolution.Fail("Недопустима характеристика");

			var ownerValue = GetCharacteristicObject(owner, characteristicKey);
			var targetValue = GetCharacteristicObject(target, characteristicKey);
			if (ownerValue == null || targetValue == null)
				return SpecialCardResolution.Fail("Характеристика недоступна");

			SetCharacteristicObject(owner, characteristicKey, DeepCloneObject(targetValue, targetValue.GetType()));
			SetCharacteristicObject(target, characteristicKey, DeepCloneObject(ownerValue, ownerValue.GetType()));

			SwapRevealState(owner, target, characteristicKey);
			await BroadcastCharacteristicChangedIfRevealed(room, owner, characteristicKey);
			await BroadcastCharacteristicChangedIfRevealed(room, target, characteristicKey);

			return SpecialCardResolution.Ok(
				$"Обміняно характеристику «{GetCharacteristicLabel(characteristicKey)}» з гравцем {target.Name}.",
				publicLog,
				$"Ваша характеристика «{GetCharacteristicLabel(characteristicKey)}» обміняна з гравцем {owner.Name}.");
		}

		private async Task<SpecialCardResolution> SwapRandomCharacteristic(
			Room room,
			Player owner,
			Player target,
			IEnumerable<string> candidateKeys,
			string? publicLog)
		{
			var keys = candidateKeys
				.Select(NormalizeSpecialCardCharacteristicKey)
				.Where(IsSpecialCardCharacteristicKeyAllowed)
				.Where(key => GetCharacteristicObject(owner, key) != null && GetCharacteristicObject(target, key) != null)
				.Distinct()
				.ToList();

			if (keys.Count == 0)
				return SpecialCardResolution.Fail("Немає доступної характеристики для обміну");

			var key = keys[_random.Next(keys.Count)];
			return await SwapCharacteristic(room, owner, target, key, publicLog);
		}

		private async Task<SpecialCardResolution> SwapRandomCharacteristicBetweenNeighbors(Room room, Player owner, string? publicLog)
		{
			if (!TryGetNeighbors(room, owner, out var upper, out var lower))
				return SpecialCardResolution.Fail("Потрібно щонайменше 3 активні гравці");

			return await SwapRandomCharacteristic(room, upper, lower, GetSwappableCharacteristicKeys(), publicLog);
		}

		private async Task<SpecialCardResolution> CopyCharacteristic(
			Room room,
			Player owner,
			Player? source,
			string characteristicKey,
			string? publicLog)
		{
			characteristicKey = NormalizeSpecialCardCharacteristicKey(characteristicKey);
			if (source == null || source.IsEliminated)
				return SpecialCardResolution.Fail("Немає активного гравця для копіювання");
			if (!IsSpecialCardCharacteristicKeyAllowed(characteristicKey))
				return SpecialCardResolution.Fail("Недопустима характеристика");

			var value = GetCharacteristicObject(source, characteristicKey);
			if (value == null)
				return SpecialCardResolution.Fail("Характеристика недоступна");

			SetCharacteristicObject(owner, characteristicKey, DeepCloneObject(value, value.GetType()));
			await BroadcastCharacteristicChangedIfRevealed(room, owner, characteristicKey);

			return SpecialCardResolution.Ok(
				$"Скопійовано характеристику «{GetCharacteristicLabel(characteristicKey)}» гравця {source.Name}.",
				publicLog);
		}

		private async Task<SpecialCardResolution> CopyProfessionUntilRoundEnd(
			Room room,
			Player owner,
			SpecialCard card,
			Player target,
			string? publicLog)
		{
			card.OriginalProfessionBeforeTemporaryCopy = DeepClone(owner.Profession);
			owner.Profession = DeepClone(target.Profession);
			await BroadcastCharacteristicChangedIfRevealed(room, owner, "Profession");

			return SpecialCardResolution.Ok(
				$"Професію гравця {target.Name} скопійовано до кінця раунду.",
				publicLog);
		}

		private async Task<SpecialCardResolution> RerollRandomCharacteristic(Room room, Player? target, string? publicLog)
		{
			if (target == null || target.IsEliminated)
				return SpecialCardResolution.Fail("Немає активного гравця для ефекту");

			var keys = GetRerollableCharacteristicKeys()
				.Where(key => GetCharacteristicObject(target, key) != null)
				.ToList();
			if (keys.Count == 0)
				return SpecialCardResolution.Fail("Немає характеристики для перегенерації");

			return await RerollCharacteristic(room, target, keys[_random.Next(keys.Count)], publicLog);
		}

		private async Task<SpecialCardResolution> RerollCharacteristic(
			Room room,
			Player? target,
			string characteristicKey,
			string? publicLog)
		{
			if (target == null || target.IsEliminated)
				return SpecialCardResolution.Fail("Немає активного гравця для ефекту");

			characteristicKey = NormalizeSpecialCardCharacteristicKey(characteristicKey);
			if (!GetRerollableCharacteristicKeys().Contains(characteristicKey))
				return SpecialCardResolution.Fail("Недопустима характеристика для перегенерації");

			var generated = _generator.GenerateCharacteristicForSpecialCard(
				characteristicKey,
				RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value));
			if (generated == null)
				return SpecialCardResolution.Fail("Не вдалося згенерувати характеристику");

			SetCharacteristicObject(target, characteristicKey, DeepCloneObject(generated, generated.GetType()));
			await BroadcastCharacteristicChangedIfRevealed(room, target, characteristicKey);

			return SpecialCardResolution.Ok(
				$"Гравець {target.Name} отримав нову характеристику «{GetCharacteristicLabel(characteristicKey)}».",
				publicLog);
		}

		private SpecialCardResolution ForceNeighborsSwapInventory(Room room, Player owner, string? publicLog)
		{
			if (!TryGetNeighbors(room, owner, out var upper, out var lower))
				return SpecialCardResolution.Fail("Потрібно щонайменше 3 активні гравці");
			if (upper.InventoryProtectedUntilRound >= room.CurrentRound || lower.InventoryProtectedUntilRound >= room.CurrentRound)
				return SpecialCardResolution.Fail("Інвентар одного із сусідів захищений до кінця раунду");

			return SwapInventories(upper, lower, publicLog);
		}

		private async Task<SpecialCardResolution> ForceNeighborsRevealSameRandomCharacteristicType(
			Room room,
			Player owner,
			SpecialCard card,
			string? publicLog)
		{
			if (!TryGetNeighbors(room, owner, out var upper, out var lower))
				return SpecialCardResolution.Fail("Потрібно щонайменше 3 активні гравці");

			var keys = GetRevealableCharacteristicKeys()
				.Where(key => !IsCharacteristicRevealed(upper, key) && !IsCharacteristicRevealed(lower, key))
				.ToList();
			if (keys.Count == 0)
				return SpecialCardResolution.Fail("Немає спільної прихованої характеристики у сусідів");

			var key = keys[_random.Next(keys.Count)];
			var upperResult = await RevealCharacteristics(room, owner, card, upper, new[] { key }, null);
			if (!upperResult.Success) return upperResult;
			var lowerResult = await RevealCharacteristics(room, owner, card, lower, new[] { key }, null);
			if (!lowerResult.Success) return lowerResult;

			return SpecialCardResolution.Ok(
				$"Сусіди розкрили одну характеристику: {GetCharacteristicLabel(key)}.",
				publicLog);
		}

		private async Task<SpecialCardResolution> RevealOneAndHideOther(
			Room room,
			Player owner,
			SpecialCard card,
			Player? revealTarget,
			Player? hideTarget,
			string? publicLog)
		{
			if (revealTarget == null || hideTarget == null || revealTarget.IsEliminated || hideTarget.IsEliminated)
				return SpecialCardResolution.Fail("Потрібно щонайменше 3 активні гравці");

			var revealCandidates = GetRevealableCharacteristicKeys()
				.Where(key => !IsCharacteristicRevealed(revealTarget, key))
				.ToList();
			var hideCandidates = GetRevealableCharacteristicKeys()
				.Where(key => IsCharacteristicRevealed(hideTarget, key))
				.ToList();

			if (revealCandidates.Count == 0 || hideCandidates.Count == 0)
				return SpecialCardResolution.Fail("Неможливо одночасно розкрити і приховати характеристики");

			var revealKey = revealCandidates[_random.Next(revealCandidates.Count)];
			var hideKey = hideCandidates[_random.Next(hideCandidates.Count)];
			var revealResult = await RevealCharacteristics(room, owner, card, revealTarget, new[] { revealKey }, null);
			if (!revealResult.Success) return revealResult;

			SetCharacteristicHidden(hideTarget, hideKey);
			await Clients.Group(room.Id).SendAsync("CharacteristicHidden", new
			{
				connectionId = hideTarget.ConnectionId,
				playerName = hideTarget.Name,
				characteristicKey = hideKey,
				hiddenBySpecialCard = true
			});

			return SpecialCardResolution.Ok(
				$"{revealTarget.Name} розкрив «{GetCharacteristicLabel(revealKey)}», а {hideTarget.Name} приховав «{GetCharacteristicLabel(hideKey)}».",
				publicLog);
		}

		private async Task<SpecialCardResolution> StealRandomCharacteristicAndRerollTarget(
			Room room,
			Player owner,
			Player target,
			string? publicLog)
		{
			var keys = GetRerollableCharacteristicKeys()
				.Where(key => GetCharacteristicObject(target, key) != null)
				.ToList();
			if (keys.Count == 0)
				return SpecialCardResolution.Fail("У цілі немає характеристики для викрадення");

			var key = keys[_random.Next(keys.Count)];
			var stolen = GetCharacteristicObject(target, key);
			if (stolen == null)
				return SpecialCardResolution.Fail("Характеристика недоступна");

			SetCharacteristicObject(owner, key, DeepCloneObject(stolen, stolen.GetType()));
			var reroll = await RerollCharacteristic(room, target, key, null);
			if (!reroll.Success) return reroll;

			SetRevealState(owner, key, IsCharacteristicRevealed(target, key));
			await BroadcastCharacteristicChangedIfRevealed(room, owner, key);

			return SpecialCardResolution.Ok(
				$"Викрадено характеристику «{GetCharacteristicLabel(key)}», ціль отримала нове значення.",
				publicLog);
		}

		private SpecialCardResolution TransferInventoryItemFromNeighbor(
			Room room,
			Player owner,
			Player? neighbor,
			string? publicLog)
		{
			return neighbor == null || neighbor.IsEliminated
				? SpecialCardResolution.Fail("Немає активного сусіда для ефекту")
				: TransferInventoryItem(room, owner, neighbor, InventoryItemKind.Any, publicLog, false);
		}

		private Player? GetNeighbor(Room room, Player owner, int direction)
		{
			var active = GetActivePlayersInStableOrder(room);
			if (active.Count < 2) return null;
			var ownerKey = RoomService.GetPlayerKey(owner);
			var index = active.FindIndex(player => RoomService.GetPlayerKey(player) == ownerKey);
			if (index < 0) return null;
			var next = (index + direction + active.Count) % active.Count;
			return active[next];
		}

		private bool TryGetNeighbors(Room room, Player owner, out Player upper, out Player lower)
		{
			upper = null!;
			lower = null!;
			var active = GetActivePlayersInStableOrder(room);
			if (active.Count < 3) return false;
			upper = GetNeighbor(room, owner, -1)!;
			lower = GetNeighbor(room, owner, 1)!;
			return upper != null && lower != null && RoomService.GetPlayerKey(upper) != RoomService.GetPlayerKey(lower);
		}

		private static List<Player> GetActivePlayersInStableOrder(Room room)
		{
			return RoomService.GetPlayersSnapshot(room)
				.Select(entry => entry.Value)
				.Where(player => player.IsConnected && !player.IsEliminated)
				.OrderBy(player => player.SeatNumber == 0 ? int.MaxValue : player.SeatNumber)
				.ThenBy(player => RoomService.GetPlayerKey(player))
				.ToList();
		}

		private static IReadOnlyList<string> GetSwappableCharacteristicKeys() => new[]
		{
			"Personality",
			"Body",
			"Profession",
			"PhysicalHealth",
			"MentalHealth",
			"Hobby",
			"CharacterTrait",
			"Property",
			"Fact"
		};

		private static IReadOnlyList<string> GetRerollableCharacteristicKeys() => GetSwappableCharacteristicKeys();

		private static IReadOnlyList<string> GetRevealableCharacteristicKeys() => GetSwappableCharacteristicKeys();

		private static string RequireSelectedCharacteristic(string? selectedCharacteristic)
		{
			return NormalizeSpecialCardCharacteristicKey(selectedCharacteristic ?? "");
		}

		private static string NormalizeSpecialCardCharacteristicKey(string key)
		{
			return key switch
			{
				"PersonalInfo" => "Personality",
				"Trait" => "CharacterTrait",
				"Secret" => "Fact",
				_ => key
			};
		}

		private static bool IsSpecialCardCharacteristicKeyAllowed(string key) =>
			GetSwappableCharacteristicKeys().Contains(key);

		private static object? GetCharacteristicObject(Player player, string key)
		{
			return key switch
			{
				"Personality" => player.Personality,
				"Body" => player.Body,
				"Profession" => player.Profession,
				"PhysicalHealth" => player.PhysicalHealth,
				"MentalHealth" => player.MentalHealth,
				"Hobby" => player.Hobby,
				"CharacterTrait" => player.CharacterTrait,
				"Property" => player.Property,
				"Fact" => player.Fact,
				_ => null
			};
		}

		private static void SetCharacteristicObject(Player player, string key, object value)
		{
			switch (key)
			{
				case "Personality": player.Personality = (Bunker.Models.Сharacteristics.Personality)value; break;
				case "Body": player.Body = (Bunker.Models.Сharacteristics.Body)value; break;
				case "Profession": player.Profession = (Profession)value; break;
				case "PhysicalHealth": player.PhysicalHealth = (Bunker.Models.Сharacteristics.PhysicalHealth)value; break;
				case "MentalHealth": player.MentalHealth = (Bunker.Models.Сharacteristics.MentalHealth)value; break;
				case "Hobby": player.Hobby = (Bunker.Models.Сharacteristics.Hobby)value; break;
				case "CharacterTrait": player.CharacterTrait = (Bunker.Models.Сharacteristics.CharacterTrait)value; break;
				case "Property": player.Property = (GeneratedProperty)value; break;
				case "Fact": player.Fact = (Bunker.Models.Сharacteristics.Fact)value; break;
			}
		}

		private static object DeepCloneObject(object value, Type type)
		{
			var json = JsonSerializer.Serialize(value, type);
			return JsonSerializer.Deserialize(json, type) ?? value;
		}

		private static T DeepClone<T>(T value)
		{
			var json = JsonSerializer.Serialize(value);
			return JsonSerializer.Deserialize<T>(json) ?? value;
		}

		private void SwapRevealState(Player owner, Player target, string key)
		{
			var ownerRevealed = IsCharacteristicRevealed(owner, key);
			var targetRevealed = IsCharacteristicRevealed(target, key);
			SetRevealState(owner, key, targetRevealed);
			SetRevealState(target, key, ownerRevealed);
		}

		private void SetRevealState(Player player, string key, bool isRevealed)
		{
			if (isRevealed) SetCharacteristicRevealed(player, key);
			else SetCharacteristicHidden(player, key);
		}

		private async Task BroadcastCharacteristicChangedIfRevealed(Room room, Player player, string key)
		{
			if (!IsCharacteristicRevealed(player, key)) return;
			var data = GetRevealedDataForCharacteristic(player, key);
			if (data == null) return;

			SetCharacteristicRevealed(player, key);
			await Clients.Group(room.Id).SendAsync("CharacteristicUpdated", new
			{
				connectionId = player.ConnectionId,
				playerName = player.Name,
				characteristicKey = key,
				data,
				forcedBySpecialCard = true
			});
		}

		private void RestoreExpiredTemporarySpecialCardEffects(Room room, int completedRound)
		{
			foreach (var player in RoomService.GetPlayersSnapshot(room).Select(entry => entry.Value))
			{
				foreach (var card in GetPlayerSpecialCards(player))
				{
					if (card.OriginalProfessionBeforeTemporaryCopy == null ||
						card.UsedAtRound != completedRound ||
						!string.Equals(card.EffectType, "copyTargetProfessionUntilRoundEnd", StringComparison.Ordinal))
					{
						continue;
					}

					player.Profession = card.OriginalProfessionBeforeTemporaryCopy;
					card.OriginalProfessionBeforeTemporaryCopy = null;
					if (IsCharacteristicRevealed(player, "Profession"))
					{
						SetCharacteristicRevealed(player, "Profession");
					}
				}
			}
		}

		private static IReadOnlyList<string> GetOrdinaryCharacteristicKeys() => new[]
		{
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

		private static string GetCharacteristicLabel(string key) => key switch
		{
			"Personality" => "Особистість",
			"PersonalInfo" => "Особистість",
			"Body" => "Статура",
			"Profession" => "Професія",
			"PhysicalHealth" => "Фізичне здоров'я",
			"MentalHealth" => "Психічне здоров'я",
			"Hobby" => "Хобі",
			"CharacterTrait" => "Риса характеру",
			"Phobia" => "Фобія",
			"Inventory" => "Інвентар",
			"Property" => "Майно",
			"Fact" => "Факт",
			_ => key
		};

		private static string GetSpecialCardDataLabel(object data, string fallback)
		{
			return data.GetType().GetProperty("label")?.GetValue(data)?.ToString()
				?? GetCharacteristicLabel(fallback);
		}

		private static string GetSpecialCardDataValue(object data)
		{
			return data.GetType().GetProperty("value")?.GetValue(data)?.ToString() ?? "";
		}

		private static void SetCharacteristicHidden(Player player, string key)
			=> GmPlayerStateMutator.HideCharacteristic(player, key);

		private static void SyncPrimarySpecialCard(Player player)
		{
			var cards = player.SpecialCards
				.Where(card => card.Id != "no_special_card")
				.ToList();
			player.SpecialCards = cards;
			player.SpecialCard = cards.FirstOrDefault() ?? new SpecialCard
			{
				Id = "no_special_card",
				Name = "Без спеціальної карти",
				Description = "Спеціальна карта не видана.",
				IsSecret = false
			};
		}

		private enum InventoryItemKind
		{
			Any,
			Small,
			Big
		}

		private sealed record SpecialCardResolution(
			bool Success,
			string Error,
			string OwnerResult,
			string? PublicLog,
			string? TargetResult,
			bool ActivateForVoting)
		{
			public static SpecialCardResolution Ok(
				string ownerResult,
				string? publicLog,
				string? targetResult = null,
				bool activateForVoting = false) =>
				new(true, "", ownerResult, publicLog, targetResult, activateForVoting);

			public static SpecialCardResolution Fail(string error) =>
				new(false, error, "", null, null, false);
		}

		private static string GetSpecialCardEffectDuration(SpecialCard card)
		{
			if (!string.IsNullOrWhiteSpace(card.EffectDuration) &&
				!string.Equals(card.EffectDuration, "instant", StringComparison.OrdinalIgnoreCase))
			{
				return card.EffectDuration;
			}

			return card.EffectType switch
			{
				"protectInventoryFromStealUntilRoundEnd" => "untilRoundEnd",
				"protectCharacteristicsFromRevealUntilRoundEnd" => "untilRoundEnd",
				"doubleVotesAgainstTargetAndBlockCasterVote" => "untilRoundEnd",
				"copyTargetProfessionUntilRoundEnd" => "untilRoundEnd",
				_ => "instant"
			};
		}

		private static bool IsSpecialCardEffectActive(Room room, SpecialCard card)
		{
			if (card.EffectDuration == "untilRoundEnd")
			{
				return card.EffectExpiresAtRound >= room.CurrentRound;
			}

			return card.IsActive;
		}

		private void ApplySpecialCardEffectsToVoting(Room room, VotingSession voting)
		{
			foreach (var player in RoomService.GetPlayersSnapshot(room)
						 .Select(entry => entry.Value)
						 .Where(player => !player.IsEliminated))
			{
				foreach (var card in GetPlayerSpecialCards(player))
				{
					if (!card.IsActive ||
						card.ActivatedRound != room.CurrentRound ||
						string.IsNullOrWhiteSpace(card.TargetPlayerId))
					{
						continue;
					}

					if (!string.Equals(
						card.EffectType,
						"doubleVotesAgainstTargetAndBlockCasterVote",
						StringComparison.Ordinal))
					{
						continue;
					}

					var ownerPlayerId = RoomService.GetPlayerKey(player);
					var currentMultiplier = voting.VoteMultipliers.TryGetValue(card.TargetPlayerId, out var storedMultiplier)
						? Math.Max(1, storedMultiplier)
						: 1;

					voting.BlockedVoterIds.Add(ownerPlayerId);
					voting.VoteMultipliers[card.TargetPlayerId] = currentMultiplier * 2;
					voting.AppliedSpecialCardEffects.Add(new AppliedSpecialCardEffect
					{
						CardId = card.WasUsedSilently ? "" : card.Id,
						CardName = card.WasUsedSilently ? "Прихована секретна карта" : card.Name,
						EffectType = card.WasUsedSilently ? "" : card.EffectType,
						OwnerPlayerId = ownerPlayerId,
						OwnerPlayerName = player.Name,
						TargetPlayerId = card.WasUsedSilently ? null : card.TargetPlayerId,
						TargetPlayerName = card.WasUsedSilently ? null : card.TargetPlayerName,
						WasUsedSilently = card.WasUsedSilently,
						BlocksOwnerVote = true,
						VoteMultiplier = 2,
						Round = room.CurrentRound
					});

					card.ActivatedVotingId = voting.Id;
				}
			}
		}

		private List<object> BuildSpecialCardsPublicState(Room room)
		{
			return RoomService.GetPlayersSnapshot(room)
				.SelectMany(entry => GetPlayerSpecialCards(entry.Value)
					.Where(card => IsSpecialCardPublic(room, entry.Value, card))
					.Select(card => BuildSpecialCardPublicState(room, entry.Value, card)))
				.OrderBy(state => GetAnonymousInt(state, "seatNumber"))
				.Cast<object>()
				.ToList();
		}

		private object BuildSpecialCardPublicState(Room room, Player player)
		{
			var card = player.SpecialCard ?? new SpecialCard();
			return BuildSpecialCardPublicState(room, player, card);
		}

		private object BuildSpecialCardPublicState(Room room, Player player, SpecialCard card)
		{
			var isEffectActive = IsSpecialCardEffectActive(room, card);
			var status = isEffectActive
				? "active"
				: card.IsUsed || card.UsedAtRound.HasValue
					? "used"
					: "revealed";
			var shouldRevealSilentCard = card.WasUsedSilently &&
				card.UsedAtRound.HasValue &&
				card.UsedAtRound.Value < room.CurrentRound;
			var isSanitized = card.WasUsedSilently &&
				!card.IsPubliclyRevealed &&
				!shouldRevealSilentCard;
			var shouldHideSecretActionDetails = card.WasUsedSilently && !card.IsPubliclyRevealed;
			var publicName = isSanitized ? "Прихована секретна карта" : card.Name;
			var publicDescription = isSanitized ? "Деталі приховані" : card.Description;
			var isPubliclyRevealed = card.IsPubliclyRevealed || shouldRevealSilentCard;

			return new
			{
				connectionId = player.ConnectionId,
				stablePlayerId = RoomService.GetPlayerKey(player),
				playerName = player.Name,
				seatNumber = player.SeatNumber,
				isOwnerHost = room.IsHost(player),
				isHidden = false,
				status,
				cardId = shouldHideSecretActionDetails ? null : card.Id,
				cardName = publicName,
				name = publicName,
				description = publicDescription,
				effectType = shouldHideSecretActionDetails ? null : card.EffectType,
				isSecret = card.IsSecret,
				wasUsedSilently = card.WasUsedSilently,
				isPubliclyRevealed,
				isEffectActive,
				isOneTimeUse = card.IsOneTimeUse,
				requiresTarget = card.RequiresTarget,
				usedAtRound = card.UsedAtRound,
				activatedRound = card.ActivatedRound,
				effectDuration = card.EffectDuration,
				effectExpiresAtRound = card.EffectExpiresAtRound,
				targetPlayerId = shouldHideSecretActionDetails ? null : card.TargetPlayerId,
				targetPlayerName = shouldHideSecretActionDetails ? null : card.TargetPlayerName,
				publicResult = shouldHideSecretActionDetails ? null : card.PublicResult,
				_i18n = isSanitized ? null : card.I18n
			};
		}

		private static bool IsSpecialCardPublic(Room room, Player player, SpecialCard card)
		{
			return player.Revealed.SpecialCard ||
				card.WasUsedSilently ||
				card.IsPubliclyRevealed ||
				!string.IsNullOrWhiteSpace(card.PublicLog) ||
				(!card.IsSecret && (card.IsUsed || card.IsActive || card.UsedAtRound.HasValue));
		}

		private static List<SpecialCard> GetPlayerSpecialCards(Player player)
		{
			player.SpecialCards ??= new List<SpecialCard>();

			if (player.SpecialCards.Count == 0 &&
				player.SpecialCard != null &&
				!string.IsNullOrWhiteSpace(player.SpecialCard.Id))
			{
				player.SpecialCards.Add(player.SpecialCard);
			}

			if ((player.SpecialCard == null || string.IsNullOrWhiteSpace(player.SpecialCard.Id)) &&
				player.SpecialCards.Count > 0)
			{
				player.SpecialCard = player.SpecialCards[0];
			}

			return player.SpecialCards;
		}

		private static int GetAnonymousInt(object source, string propertyName)
		{
			return (int?)source.GetType().GetProperty(propertyName)?.GetValue(source) ?? int.MaxValue;
		}
	}
}
