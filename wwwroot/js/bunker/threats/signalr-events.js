// Threats SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.threats = (() => {
	function mergeThreatPlayerSnapshots(data) {
		const players = data.players || data.Players || [];
		players.forEach(player => {
			const connectionId = player.connectionId || player.ConnectionId;
			if (!connectionId) return;

			const previous = roomPlayers[connectionId] || {};
			const revealedValues = normalizeRevealedValues(player.revealedValues || player.RevealedValues || {});
			roomPlayers[connectionId] = {
				...previous,
				...player,
				connectionId,
				revealed: normalizeRevealedState(player.revealed || player.Revealed || previous.revealed || {}),
				revealedData: revealedValues.revealedData,
				revealedTooltips: revealedValues.revealedTooltips,
				revealedSources: normalizeRevealedSources(player.revealedSources || player.RevealedSources || {}),
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(
					player.additionalPhysicalConditions || player.AdditionalPhysicalConditions ||
					player.additionalConditionEffects || player.AdditionalConditionEffects || []
				),
				additionalPhysicalConditions: normalizeAdditionalPhysicalConditions(
					player.additionalPhysicalConditions || player.AdditionalPhysicalConditions ||
					player.additionalConditionEffects || player.AdditionalConditionEffects || []
				)
			};
		});

		const privatePlayer = data.player || data.Player;
		if (privatePlayer) myPlayerData = normalizePlayer(privatePlayer);
	}

	return {
		ThreatRevealed() {
			connection.off("ThreatRevealed");
			connection.on("ThreatRevealed", function (data) {
				currentThreat = data.threat || data.Threat || null;
				applyRoundState(data.roundState || data.RoundState);
				renderCurrentGameUI();
				triggerApocalypseVisualReaction('threat-reveal');
				const threatName = currentThreat ? (getLocalizedValue(currentThreat, 'name') || currentThreat.name || currentThreat.Name) : 'нова загроза';
				addEventMessage(`<span class="event-warning">${t('threatRevealed')}:</span> ${escapeHtml(threatName)}`);
			});
		},

		ThreatStateUpdated() {
			connection.off("ThreatStateUpdated");
			connection.on("ThreatStateUpdated", function (data) {
				currentThreatState = normalizeThreatState(data.threatState || data.ThreatState || currentThreatState);
				applyRoundState(data.roundState || data.RoundState);
				mergeThreatPlayerSnapshots(data);
				if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
					renderThreatOperationModal();
					document.getElementById('threatOperationModal').style.display = 'flex';
				}
				renderCurrentGameUI();
				markGMServerUpdate();
				markGMServerUpdate();
			});
		},

		ThreatSupportDiceRolled() {
			connection.off("ThreatSupportDiceRolled");
			connection.on("ThreatSupportDiceRolled", function (data) {
				addEventMessage(`<span class="event-success">${escapeHtml(data.message || 'Кубик кинуто. Предмет підтримки видано.')}</span>`);
			});
		},

		ThreatSupportDropAnnounced() {
			connection.off("ThreatSupportDropAnnounced");
			connection.on("ThreatSupportDropAnnounced", function (data) {
				addEventMessage(`<span class="event-special">${escapeHtml(data.message || 'Один із гравців отримав предмет підтримки.')}</span>`);
			});
		},

		ThreatSupportItemReceived() {
			connection.off("ThreatSupportItemReceived");
			connection.on("ThreatSupportItemReceived", function (data) {
				if (myPlayerData && data.inventory) {
					myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
				}
				addEventMessage(`<span class="event-success">${escapeHtml(data.message || 'Ви отримали предмет підтримки.')}</span>`);
				renderCurrentGameUI();
			});
		},

		ThreatPrivateMessage() {
			connection.off("ThreatPrivateMessage");
			connection.on("ThreatPrivateMessage", function (data) {
				addEventMessage(`<span class="event-special">${escapeHtml(data.message || data.Message || '')}</span>`);
			});
		},

		ThreatContributionWithdrawn() {
			connection.off("ThreatContributionWithdrawn");
			connection.on("ThreatContributionWithdrawn", function (data) {
				addEventMessage(`<span class="event-warning">${escapeHtml(data.message || data.Message || 'Внесок оновлено.')}</span>`);
			});
		},

		ThreatVolunteerSelected() {
			connection.off("ThreatVolunteerSelected");
			connection.on("ThreatVolunteerSelected", function (data) {
				addEventMessage(`<span class="event-special">${escapeHtml(data.message || data.Message || 'Добровольця вибрано.')}</span>`);
			});
		},

		ThreatVolunteerVoteStarted() {
			connection.off("ThreatVolunteerVoteStarted");
			connection.on("ThreatVolunteerVoteStarted", function (data) {
				addEventMessage(`<span class="event-voting">${escapeHtml(data.message || data.Message || 'Голосування загрози почалось.')}</span>`);
			});
		},

		ThreatVolunteerVoteProgress() {
			connection.off("ThreatVolunteerVoteProgress");
			connection.on("ThreatVolunteerVoteProgress", function (data) {
				if (currentThreatState) {
					currentThreatState.threatVolunteerVote = normalizeThreatState({ threatVolunteerVote: data }).threatVolunteerVote;
					renderThreatPanel(currentThreat);
				}
			});
		},

		ThreatVolunteerVoteCompleted() {
			connection.off("ThreatVolunteerVoteCompleted");
			connection.on("ThreatVolunteerVoteCompleted", function (data) {
				addEventMessage(`<span class="event-voting">${escapeHtml(data.message || data.Message || 'Голосування загрози завершено.')}</span>`);
			});
		},

		ThreatVolunteerVoteClosed() {
			connection.off("ThreatVolunteerVoteClosed");
			connection.on("ThreatVolunteerVoteClosed", function (data) {
				addEventMessage(`<span class="event-warning">${escapeHtml(data.message || data.Message || 'Голосування загрози закрито.')}</span>`);
			});
		},

		ThreatResolved() {
			connection.off("ThreatResolved");
			connection.on("ThreatResolved", function (data) {
				const results = data.results || data.Results || [];
				addEventMessage(`<span class="event-success">${results.map(escapeHtml).join(' ') || 'Загрозу завершено.'}</span>`);
			});
		},

		ThreatMiniGameStarted() {
			connection.off("ThreatMiniGameStarted");
			connection.on("ThreatMiniGameStarted", function (data) {
				if (currentThreatState) {
					currentThreatState.miniGame = normalizeThreatState({ miniGame: data }).miniGame;
				}
				renderThreatPanel(currentThreat);
				if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
					renderThreatOperationModal();
					document.getElementById('threatOperationModal').style.display = 'flex';
				}
				addEventMessage(`<span class="event-special">${escapeHtml(t('startOperation'))}</span>`);
			});
		},

		ThreatMiniGameUpdated() {
			connection.off("ThreatMiniGameUpdated");
			connection.on("ThreatMiniGameUpdated", function (data) {
				if (currentThreatState) {
					currentThreatState.miniGame = normalizeThreatState({ miniGame: data }).miniGame;
				}
				renderThreatPanel(currentThreat);
				if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
					renderThreatOperationModal();
					document.getElementById('threatOperationModal').style.display = 'flex';
				}
			});
		},

		ThreatImageUpdated() {
			connection.off("ThreatImageUpdated");
			connection.on("ThreatImageUpdated", function (data) {
				console.log("[ThreatImageUpdated]", data);
				const currentThreatId = currentThreat?.id || currentThreat?.Id;
				if (currentThreat && currentThreatId === data.threatId) {
					currentThreat.imageUrl = data.imageUrl;
					currentThreat.uploadedImagePath = data.imageUrl;
					renderThreatPanel(currentThreat);
					addEventMessage(`<span class="event-image">🖼️</span> Зображення загрози оновлено`);
				}
			});
		},

		ThreatImageRemoved() {
			connection.off("ThreatImageRemoved");
			connection.on("ThreatImageRemoved", function (data) {
				console.log("[ThreatImageRemoved]", data);
				const currentThreatId = currentThreat?.id || currentThreat?.Id;
				if (currentThreat && currentThreatId === data.threatId) {
					currentThreat.imageUrl = null;
					currentThreat.uploadedImagePath = null;
					renderThreatPanel(currentThreat);
					addEventMessage(`<span class="event-image">🗑️</span> Зображення загрози видалено`);
				}
			});
		}
	};
})();
