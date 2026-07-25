// Characters SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.characters = {
	PlayerStateResynced() {
		connection.off("PlayerStateResynced");

		connection.on("PlayerStateResynced", function (data) {
			const playerPayload = data?.player ?? data?.Player ?? data;

			console.log("[HANDOFF] PlayerStateResynced", {
				hasPayload: Boolean(playerPayload),
				playerId: playerPayload?.id ?? playerPayload?.Id,
				hasProfession: Boolean(
					playerPayload?.profession ?? playerPayload?.Profession
				),
				hasPhysicalHealth: Boolean(
					playerPayload?.physicalHealth ?? playerPayload?.PhysicalHealth
				),
				hasHobby: Boolean(
					playerPayload?.hobby ?? playerPayload?.Hobby
				),
				hasSpecialCards: Array.isArray(
					playerPayload?.specialCards ?? playerPayload?.SpecialCards
				)
			});

			if (!playerPayload) {
				console.error("[HANDOFF] PlayerStateResynced без player payload");
				return;
			}

			const normalizedPlayer = normalizePlayer(playerPayload);

			if (!normalizedPlayer) {
				console.error("[HANDOFF] Не вдалося нормалізувати player snapshot");
				return;
			}

			myPlayerData = normalizedPlayer;
			pendingCharacteristicReveals.clear();

			tryRenderRunningGameState();

			if (!isLobbyRunning()) {
				renderCurrentGameUI();
			}
		});
	},

	CharacteristicRevealed() {
		connection.off("CharacteristicRevealed");
		connection.on("CharacteristicRevealed", function (info) {
			console.log("Characteristic revealed:", info);
			applyRoundState(info.roundState || info.RoundState);
			const characteristicKey = normalizeCharacteristicKey(info.characteristicKey || info.CharacteristicKey || '');
			const charKey = normalizeCharacteristicKey(toCamelCase(characteristicKey));
			pendingCharacteristicReveals.delete(characteristicKey);

			if (roomPlayers[info.connectionId]) {
				if (!roomPlayers[info.connectionId].revealed) {
					roomPlayers[info.connectionId].revealed = {};
				}
				if (!roomPlayers[info.connectionId].revealedData) {
					roomPlayers[info.connectionId].revealedData = {};
				}
				if (!roomPlayers[info.connectionId].revealedTooltips) {
					roomPlayers[info.connectionId].revealedTooltips = {};
				}
				if (!roomPlayers[info.connectionId].revealedSources) {
					roomPlayers[info.connectionId].revealedSources = {};
				}
				roomPlayers[info.connectionId].revealed[charKey] = true;
				roomPlayers[info.connectionId].revealedData[charKey] = info.data.value;
				const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact || null;
				if (source) {
					roomPlayers[info.connectionId].revealedSources[charKey] = source;
				}
				if (charKey === 'physicalHealth') {
					roomPlayers[info.connectionId].additionalConditionEffects = normalizeAdditionalPhysicalConditions(
						info.data.additionalConditionEffects || info.data.AdditionalConditionEffects || []
					);
				}
				if (charKey === 'fact') {
					roomPlayers[info.connectionId].fact = normalizeFactFromPlayer({ fact: source || info.data.fact || info.data.Fact, revealedData: { fact: info.data } });
				}
				if (charKey === 'specialCard' && source) {
					roomPlayers[info.connectionId].specialCard = normalizeSpecialCard(source);
				}
				if (info.data.tooltip && info.data.hasTooltip) {
					const kind = charKey === 'physicalHealth' ? 'physicalHealth' : charKey === 'mentalHealth' ? 'mentalHealth' : charKey;
					roomPlayers[info.connectionId].revealedTooltips[charKey] = buildLocalizedTooltip(source, kind) || cleanTooltipText(info.data.tooltip);
				}
			}

			// Оновлюємо свої картки якщо це я
			if (info.connectionId === myConnectionId && myPlayerData) {
				if (!myPlayerData.revealed) {
					myPlayerData.revealed = {};
				}

				myPlayerData.revealed[charKey] = true;

				if (charKey === "fact") {
					const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact;
					myPlayerData.fact = normalizeFactFromPlayer({ fact: source, revealedData: { fact: info.data } });
				}
				if (charKey === "specialCard") {
					const source = info.data.source || info.data.Source;
					if (source) {
						const revealedCard = normalizeSpecialCard(source);
						myPlayerData.specialCard = revealedCard;
						myPlayerData.specialCards = normalizeSpecialCards(myPlayerData.specialCards, revealedCard)
							.map(card => card.id === revealedCard.id ? revealedCard : card);
					}
				}

				renderCurrentGameUI();
			}

			renderPublicPlayerOverview();
			triggerApocalypseVisualReaction('characteristic-reveal', { duration: 500 });
			addEventMessage(`<span class="event-player">${info.playerName}</span> розкрив: <span class="revealed-label">${info.data.label}</span>`);
		});
	},

	CharacteristicHidden() {
		connection.off("CharacteristicHidden");
		connection.on("CharacteristicHidden", function (data) {
			const connectionId = data.connectionId || data.ConnectionId;
			const hiddenCharacteristic = data.characteristicKey || data.CharacteristicKey || '';
			const charKey = normalizeCharacteristicKey(toCamelCase(hiddenCharacteristic));
			pendingCharacteristicReveals.delete(hiddenCharacteristic);
			const player = roomPlayers[connectionId];
			if (player) {
				if (player.revealed) player.revealed[charKey] = false;
				if (player.revealedData) delete player.revealedData[charKey];
				if (player.revealedSources) delete player.revealedSources[charKey];
			}
			if (connectionId === myConnectionId && myPlayerData?.revealed) {
				myPlayerData.revealed[charKey] = false;
			}
			renderCurrentGameUI();
		});
	},

	CharacteristicUpdated() {
		connection.off("CharacteristicUpdated");
		connection.on("CharacteristicUpdated", function (info) {
			console.log("Characteristic updated by GM:", info);
			const characteristicKey = normalizeCharacteristicKey(info.characteristicKey);
			const charKey = normalizeCharacteristicKey(toCamelCase(characteristicKey));

			if (roomPlayers[info.connectionId]) {
				if (!roomPlayers[info.connectionId].revealedData) {
					roomPlayers[info.connectionId].revealedData = {};
				}
				if (!roomPlayers[info.connectionId].revealedSources) {
					roomPlayers[info.connectionId].revealedSources = {};
				}
				roomPlayers[info.connectionId].revealedData[charKey] = info.data.value;
				const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact || null;
				if (source) {
					roomPlayers[info.connectionId].revealedSources[charKey] = source;
				}
				if (charKey === 'fact') {
					roomPlayers[info.connectionId].fact = normalizeFactFromPlayer({ fact: source || info.data.fact || info.data.Fact, revealedData: { fact: info.data } });
				}
				if (charKey === 'specialCard' && source) {
					roomPlayers[info.connectionId].specialCard = normalizeSpecialCard(source);
				}
			}

			renderPublicPlayerOverview();
			updateSpecialCardsUI();
			addEventMessage(`<span class="event-gm">GM</span> змінив характеристику <span class="event-player">${info.playerName}</span>`);
		});
	},

	CharacteristicEdited() {
		connection.off("CharacteristicEdited");
		connection.on("CharacteristicEdited", function (info) {
			console.log("My characteristic edited:", info);
			myPlayerData = normalizePlayer(info.player);
			renderCurrentGameUI();
			addEventMessage(`<span class="event-gm">GM</span> змінив вашу характеристику: ${info.characteristicName}`);
		});
	},

	CharacteristicCleared() {
		connection.off("CharacteristicCleared");
		connection.on("CharacteristicCleared", function (info) {
			console.log("My characteristic cleared:", info);
			myPlayerData = normalizePlayer(info.player);
			renderCurrentGameUI();
			addEventMessage(`<span class="event-gm">GM</span> очистив вашу характеристику: ${info.characteristicName}`);
		});
	},

	CharacteristicRegenerated() {
		connection.off("CharacteristicRegenerated");
		connection.on("CharacteristicRegenerated", function (info) {
			console.log("My characteristic regenerated:", info);
			myPlayerData = normalizePlayer(info.player);
			renderCurrentGameUI();
			addEventMessage(`<span class="event-gm">GM</span> регенерував вашу характеристику: ${info.characteristicName}`);
		});
	},

	PlayerEliminated() {
		connection.off("PlayerEliminated");
		connection.on("PlayerEliminated", function (info) {
			console.log("Player eliminated:", info);
			if (roomPlayers[info.connectionId]) {
				roomPlayers[info.connectionId].isEliminated = true;
				roomPlayers[info.connectionId].eliminatedAtRound = info.eliminatedAtRound ?? info.EliminatedAtRound ?? getCurrentRoundNumber();
				roomPlayers[info.connectionId].eliminatedByVote = !!(info.eliminatedByVote ?? info.EliminatedByVote);
				roomPlayers[info.connectionId].canRevealAllAfterElimination = !!(info.canRevealAllAfterElimination ?? info.CanRevealAllAfterElimination ?? true);
				roomPlayers[info.connectionId].hasRevealedAllAfterElimination = !!(info.hasRevealedAllAfterElimination ?? info.HasRevealedAllAfterElimination);
			}
			if (info.connectionId === myConnectionId && myPlayerData) {
				myPlayerData.isEliminated = true;
				myPlayerData.eliminatedAtRound = info.eliminatedAtRound ?? info.EliminatedAtRound ?? getCurrentRoundNumber();
				myPlayerData.eliminatedByVote = !!(info.eliminatedByVote ?? info.EliminatedByVote);
				myPlayerData.canRevealAllAfterElimination = !!(info.canRevealAllAfterElimination ?? info.CanRevealAllAfterElimination ?? true);
				myPlayerData.hasRevealedAllAfterElimination = !!(info.hasRevealedAllAfterElimination ?? info.HasRevealedAllAfterElimination);
			}
			renderCurrentGameUI();
			renderPublicPlayerOverview();
			updateGMPlayerSelect();
			addEventMessage(`<span class="event-eliminate">❌ ${info.playerName}</span> елімінований!`);
		});
	},

	PlayerRestored() {
		connection.off("PlayerRestored");
		connection.on("PlayerRestored", function (info) {
			console.log("Player restored:", info);
			if (roomPlayers[info.connectionId]) {
				roomPlayers[info.connectionId].isEliminated = false;
				roomPlayers[info.connectionId].canRevealAllAfterElimination = false;
				roomPlayers[info.connectionId].hasRevealedAllAfterElimination = false;
			}
			if (info.connectionId === myConnectionId && myPlayerData) {
				myPlayerData.isEliminated = false;
				myPlayerData.canRevealAllAfterElimination = false;
				myPlayerData.hasRevealedAllAfterElimination = false;
			}
			renderCurrentGameUI();
			renderPublicPlayerOverview();
			updateGMPlayerSelect();
			addEventMessage(`<span class="event-restore">✅ ${info.playerName}</span> повернено в гру!`);
		});
	},

	EliminatedPlayerRevealedAll() {
		connection.off("EliminatedPlayerRevealedAll");
		connection.on("EliminatedPlayerRevealedAll", function (info) {
			console.log("Eliminated player revealed all:", info);
			applyRoundState(info.roundState || info.RoundState);
			const connectionId = info.connectionId || info.ConnectionId;
			if (roomPlayers[connectionId]) {
				roomPlayers[connectionId].canRevealAllAfterElimination = false;
				roomPlayers[connectionId].hasRevealedAllAfterElimination = true;
			}
			if (connectionId === myConnectionId && myPlayerData) {
				myPlayerData.canRevealAllAfterElimination = false;
				myPlayerData.hasRevealedAllAfterElimination = true;
			}
			renderCurrentGameUI();
			addEventMessage(`<span class="event-player">${t('eliminatedRevealedAllLog')}</span>`);
		});
	}
};
