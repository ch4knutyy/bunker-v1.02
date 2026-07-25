// Scenario and game events SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.gameEvents = {
	GameEvent() {
		connection.off("GameEvent");
		connection.on("GameEvent", function (data) {
			console.log("Game event:", data);
			var typeClass = 'event-' + data.type;
			addEventMessage(`<span class="${typeClass}"><strong>[Подія ${data.timestamp}]</strong> ${data.text}</span>`);
		});
	},

	NewGameEvent() {
		connection.off("NewGameEvent");
		connection.on("NewGameEvent", function (eventData) {
			console.log("New game event:", eventData);
			showCurrentEvent(eventData);
			addEventToHistory(`<strong>${eventData.name || eventData.Name}</strong>: ${eventData.description || eventData.Description}`, 'game');
		});
	},

	ScenarioStarted() {
		connection.off("ScenarioStarted");
		connection.on("ScenarioStarted", function (data) {
			const scenario = data.scenario || data.Scenario;
			if (!scenario) return;
			const modal = document.getElementById('scenarioPublicModal');
			document.getElementById('scenarioPublicType').textContent = scenarioTypeLabel(scenario.type || scenario.Type);
			document.getElementById('scenarioPublicTitle').textContent = scenario.title || scenario.Title || '';
			document.getElementById('scenarioPublicText').textContent = scenario.text || scenario.Text || '';
			if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
			addEventToHistory(`<strong>${escapeHtml(scenario.title || scenario.Title || '')}</strong>: ${escapeHtml(scenario.text || scenario.Text || '')}`, 'special');
		});
	},

	ScenarioPrivateOpened() {
		connection.off("ScenarioPrivateOpened");
		connection.on("ScenarioPrivateOpened", function (data) {
			currentPendingScenarioChoice = data.choice || data.Choice || null;
			const modal = document.getElementById('scenarioPrivateModal');
			document.getElementById('scenarioPrivateType').textContent = scenarioTypeLabel('secret_event');
			document.getElementById('scenarioPrivateTitle').textContent = data.title || data.Title || scenarioUiText('privateEvent');
			document.getElementById('scenarioPrivateMessage').textContent = data.message || data.Message || '';
			const card = data.card || data.Card;
			document.getElementById('scenarioPrivateCard').textContent = card ? eventCardLocalized(card.title || card.Title) : '';
			renderScenarioPrivateChoices();
			const expiry = data.expiresAtUtc || data.ExpiresAtUtc;
			document.getElementById('scenarioPrivateExpiry').textContent = expiry ? `До ${new Date(expiry).toLocaleTimeString()}` : '';
			if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
		});
	},

	EventCardPublicNotice() {
		connection.off("EventCardPublicNotice");
		connection.on("EventCardPublicNotice", function (data) {
			const modal = document.getElementById('scenarioPublicModal');
			const code = data?.code || data?.Code || '';
			const accused = data?.accusedPlayerName || data?.AccusedPlayerName || '';
			document.getElementById('scenarioPublicType').textContent = scenarioTypeLabel('event');
			document.getElementById('scenarioPublicTitle').textContent = scenarioUiText('supplyIncident');
			document.getElementById('scenarioPublicText').textContent = eventCardPublicNoticeText(code, accused);
			if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
		});
	},

	ScenarioResolved() {
		connection.off("ScenarioResolved");
		connection.on("ScenarioResolved", function () {
			currentPendingScenarioChoice = null;
			closeScenarioPrivateModal();
		});
	},

	EventEffectApplied() {
		connection.off("EventEffectApplied");
		connection.on("EventEffectApplied", function (data) {
			console.log("Event effect applied:", data);
			// Оновлюємо бункер якщо потрібно
			const bunker = data.bunker || data.Bunker;
			if (bunker) {
				currentBunker = bunker;
				currentBunkerCapacity = getBunkerCapacityValue(bunker, currentBunkerCapacity);
				renderBunker(currentBunker);
			}
			addEventToHistory(`<span class="event-special">Застосовано ефект: ${data.effectDescription}</span>`, 'special');
		});
	}
};
