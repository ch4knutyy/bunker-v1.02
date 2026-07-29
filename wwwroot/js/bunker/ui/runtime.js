// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function openImageModal(imageUrl, title) {
	let modal = document.getElementById('imageModal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'imageModal';
		modal.className = 'image-modal-overlay';
		modal.onclick = function (e) {
			if (e.target === modal) closeImageModal();
		};
		modal.innerHTML = `
            <div class="image-modal">
                <div class="image-modal-header">
                    <h3 id="imageModalTitle"></h3>
                    <button class="image-modal-close" onclick="closeImageModal()">×</button>
                </div>
                <div class="image-modal-body">
                    <img id="imageModalImg" src="" alt="" />
                </div>
            </div>
        `;
		document.body.appendChild(modal);
	}

	document.getElementById('imageModalTitle').textContent = title;
	document.getElementById('imageModalImg').src = imageUrl;
	document.getElementById('imageModalImg').alt = title;
	modal.style.display = 'flex';
}

function closeImageModal() {
	const modal = document.getElementById('imageModal');
	if (modal) {
		modal.style.display = 'none';
	}
}

function initMobileTooltips() {
	window.reinitTooltips?.();
}

function showRoomSection() {
	document.getElementById('lobbySection').style.display = 'none';
	document.getElementById('roomSection').style.display = 'block';
	document.getElementById('roomLobby').style.display = 'block';
	document.getElementById('gameSection').style.display = 'none';
	document.getElementById('myPlayerSection').style.display = 'block';
}

function updateRoomUI() {
	if (!currentRoom) return;

	if (window.BUNKER_DEBUG === true) {
		console.debug("[updateRoomUI]", {
			roomId: currentRoom.id || currentRoom.Id,
			state: currentRoom.state || currentRoom.State,
			isHost
		});
	}

	const playerCount = Object.keys(roomPlayers).length;

	const roomPlayerCountElement = document.getElementById('roomPlayerCount');

	if (roomPlayerCountElement) {
		roomPlayerCountElement.textContent =
			`${playerCount}/${currentRoom.maxPlayers || 12}`;
	}

	// Показуємо кнопку старту тільки хосту в лобі
	const startBtn = document.getElementById('startGameBtn');
	if (startBtn) {
		if ((isHost || isDeveloper) && currentRoom.state === 'Lobby') {
			startBtn.style.display = 'inline-block';
			startBtn.disabled = playerCount < 2; // Changed from 4 to 2 for testing
			startBtn.title = playerCount < 2 ? (getCurrentLanguage() === 'en' ? 'At least 2 players required' : getCurrentLanguage() === 'ru' ? 'Нужно минимум 2 игрока' : 'Потрібно мінімум 2 гравці') : '';
		} else {
			startBtn.style.display = 'none';
		}
	}

	// Показуємо кнопку голосування тільки хосту під час гри
	const votingBtn = document.getElementById('startVotingBtn');
	if (votingBtn) {
		if (canStartVotingNow()) {
			votingBtn.style.display = 'inline-block';
		} else {
			votingBtn.style.display = 'none';
		}
	}
	updateRoundStatusUI();

	// Показуємо кнопку GM панелі хосту ЗАВЖДИ (і в лобі, і під час гри)
	const gmPanelBtn = document.getElementById('gmPanelBtn');
	if (gmPanelBtn) {
		if (isHost || isDeveloper || !!omniscientHiddenState) {
			gmPanelBtn.style.display = 'inline-block';
		} else {
			gmPanelBtn.style.display = 'none';
		}
	}
	const floatingControls = document.getElementById('roomFloatingControls');
	if (floatingControls) floatingControls.hidden = false;
	const copyInviteLinkButton = document.getElementById('copyInviteLinkBtn');
	if (copyInviteLinkButton) copyInviteLinkButton.hidden = !isHost;

	// Текст очікування
	const waitingText = document.getElementById('waitingText');
	if (waitingText) {
		if (playerCount < 2) {
			waitingText.textContent = getCurrentLanguage() === 'en'
				? `Waiting for players... (${2 - playerCount} more needed)`
				: getCurrentLanguage() === 'ru'
					? `Ожидание игроков... (нужно еще ${2 - playerCount})`
					: `Очікування гравців... (потрібно ще ${2 - playerCount})`;
			waitingText.style.display = 'block';
		} else if (!isHost) {
			waitingText.textContent = getCurrentLanguage() === 'en'
				? 'Waiting for the host to start the game...'
				: getCurrentLanguage() === 'ru'
					? 'Ожидание старта игры от ведущего...'
					: 'Очікування старту гри від хоста...';
			waitingText.style.display = 'block';
		} else {
			waitingText.style.display = 'none';
		}
	}

	// Оновлюємо GM секції якщо гра почалась
	updateGMSections();
	refreshGlobalContentCatalogAccess();
	renderDeveloperAuthorityUi();
	renderPostGameCommandState();

	renderRoomPlayers();
	renderLobbyState();
}

function updateGMSections() {
	updateRoundStatusUI();
	renderGMPanelState();
}

function renderRoomsList(rooms) {
	const container = document.getElementById('roomsList');

	if (!rooms || rooms.length === 0) {
		container.innerHTML = `<p class="no-rooms">${t('noRooms')}</p>`;
		return;
	}

	container.innerHTML = rooms.map(room => {
		const canJoin = !!room.canJoin || isDeveloper;
		return `
            <div class="room-card ${!canJoin ? 'room-full' : ''}">
                <div class="room-card-header">
                    <span class="room-card-name">${escapeHtml(room.name)}</span>
                    ${room.hasPassword ? '<span class="room-lock">🔒</span>' : ''}
                </div>
                <div class="room-card-info">
                    <span class="room-host">${t('host')}: ${escapeHtml(room.hostName)}</span>
                    <span class="room-players">${room.playerCount}/${room.maxPlayers} ${t('players')}</span>
                </div>
				<button class="btn-join" onclick="joinRoom('${room.id}', ${room.hasPassword}, ${isDeveloper && !room.canJoin})" ${!canJoin ? 'disabled' : ''}>
					${canJoin ? (isDeveloper && !room.canJoin ? 'Join as Developer Observer' : (getCurrentLanguage() === 'en' ? 'Join' : getCurrentLanguage() === 'ru' ? 'Присоединиться' : 'Приєднатися')) : (getCurrentLanguage() === 'en' ? 'Full' : getCurrentLanguage() === 'ru' ? 'Заполнено' : 'Заповнено')}
                </button>
            </div>
        `;
	}).join('');
}

function renderRoomPlayers() {
	const players = Object.values(roomPlayers);
	const spectator = players.find(p => p.isSpectatorGm || p.IsSpectatorGm);
	const banner = document.getElementById('omniscientGmBanner');
	if (banner) { banner.style.display = spectator ? 'block' : 'none'; banner.textContent = spectator ? `${t('omniscientPublicBadge')}: ${spectator.name}. ${getCurrentLanguage() === 'en' ? 'Does not participate in gameplay or voting.' : getCurrentLanguage() === 'ru' ? 'Не участвует в игре и голосовании.' : 'Не бере участі у грі та голосуванні.'}` : ''; }
}

const lobbyGet = (object, camel, pascal) => object?.[camel] ?? object?.[pascal];

function normalizeLobbySettings(source) {
	const get = key => source?.[key] ?? source?.[key.charAt(0).toUpperCase() + key.slice(1)];
	const rawActivation = get('apocalypseActivation') || {};
	const activation = key => rawActivation?.[key] ?? rawActivation?.[key.charAt(0).toUpperCase() + key.slice(1)];
	const activationNullable = (key, publicKey, fallback) => {
		const upper = key.charAt(0).toUpperCase() + key.slice(1);
		if (Object.prototype.hasOwnProperty.call(rawActivation, key)) return rawActivation[key];
		if (Object.prototype.hasOwnProperty.call(rawActivation, upper)) return rawActivation[upper];
		const publicValue = get(publicKey); return publicValue === undefined ? fallback : publicValue;
	};
	return {
		version: 4, preset: String(get('preset') ?? 'Classic'),
		maxGameplayPlayers: Number(get('maxGameplayPlayers') ?? 12), minGameplayPlayers: Number(get('minGameplayPlayers') ?? 2),
		spectatorsAllowed: Boolean(get('spectatorsAllowed') ?? true), allowSpectatorsAfterStart: Boolean(get('allowSpectatorsAfterStart') ?? false),
		allowLateGameplayJoin: Boolean(get('allowLateGameplayJoin') ?? false), lockRoomOnStart: Boolean(get('lockRoomOnStart') ?? true), joinsLocked: Boolean(get('joinsLocked') ?? false),
		readyRequirement: String(get('readyRequirement') ?? 'AllPlayers'), hostCanStartWithoutAllReady: Boolean(get('hostCanStartWithoutAllReady') ?? false), resetReadinessAfterSettingsChange: Boolean(get('resetReadinessAfterSettingsChange') ?? true),
		bunkerCapacityMode: String(get('bunkerCapacityMode') ?? 'Automatic'), manualBunkerCapacity: get('manualBunkerCapacity') == null ? null : Number(get('manualBunkerCapacity')), randomBunkerCapacityMin: get('randomBunkerCapacityMin') == null ? null : Number(get('randomBunkerCapacityMin')), randomBunkerCapacityMax: get('randomBunkerCapacityMax') == null ? null : Number(get('randomBunkerCapacityMax')),
		apocalypseEnabled: Boolean(get('apocalypseEnabled') ?? true), apocalypseSelectionMode: String(get('apocalypseSelectionMode') ?? 'RandomAll'),
		selectedApocalypseId: get('selectedApocalypseId') == null ? null : String(get('selectedApocalypseId')),
		allowedApocalypseCategoryIds: Array.isArray(get('allowedApocalypseCategoryIds')) ? [...new Set(get('allowedApocalypseCategoryIds').map(String))] : ['armageddon','weather','biological','geological','cosmic','technology','ecological','social','anomaly','supernatural'],
		apocalypseCustomPoolIds: Array.isArray(get('apocalypseCustomPoolIds')) ? [...new Set(get('apocalypseCustomPoolIds').map(String))] : [],
		allowedApocalypseCategoryCount: Number(get('allowedApocalypseCategoryCount') ?? 10), apocalypseCustomPoolCount: Number(get('apocalypseCustomPoolCount') ?? 0),
		allowInteractiveApocalypses: Boolean(get('allowInteractiveApocalypses') ?? true), interactiveApocalypseChancePercent: Number(get('interactiveApocalypseChancePercent') ?? 10), apocalypseThemeEnabled: Boolean(get('apocalypseThemeEnabled') ?? true),
		apocalypseActivation: {
			effectsEnabled: Boolean(activation('effectsEnabled') ?? get('apocalypseEffectsEnabled') ?? true),
			policyMode: String(activation('policyMode') ?? get('apocalypseActivationPolicyMode') ?? 'DefinitionDefault'),
			scheduleMode: String(activation('scheduleMode') ?? get('apocalypseActivationScheduleMode') ?? 'Recurring'),
			trigger: String(activation('trigger') ?? get('apocalypseActivationTrigger') ?? 'AfterVoting'),
			firstRound: Number(activation('firstRound') ?? get('apocalypseActivationFirstRound') ?? 3),
			intervalRounds: activationNullable('intervalRounds', 'apocalypseActivationIntervalRounds', 3) == null ? null : Number(activationNullable('intervalRounds', 'apocalypseActivationIntervalRounds', 3)),
			maxActivations: activationNullable('maxActivations', 'apocalypseActivationMaxActivations', null) == null ? null : Number(activationNullable('maxActivations', 'apocalypseActivationMaxActivations', null))
		},
		bunkerScenarioEnabled: Boolean(get('bunkerScenarioEnabled') ?? true),
		threatsEnabled: Boolean(get('threatsEnabled') ?? true), interactiveThreatRate: String(get('interactiveThreatRate') ?? 'Rare'), firstThreatRound: Number(get('firstThreatRound') ?? 3), threatFrequency: String(get('threatFrequency') ?? 'OncePerGame'), maxThreatsPerGame: get('maxThreatsPerGame') == null ? null : Number(get('maxThreatsPerGame')), avoidRepeatedThreats: Boolean(get('avoidRepeatedThreats') ?? true),
		roundTimerEnabled: Boolean(get('roundTimerEnabled') ?? false), roundTimerDurationSeconds: Number(get('roundTimerDurationSeconds') ?? 300), autoStartRoundTimer: Boolean(get('autoStartRoundTimer') ?? false), pauseTimerOnHostDisconnect: Boolean(get('pauseTimerOnHostDisconnect') ?? false),
		votingEnabled: Boolean(get('votingEnabled') ?? true), votingStartRound: Number(get('votingStartRound') ?? 3), votingFrequency: String(get('votingFrequency') ?? 'EveryRound'),
		specialCardsEnabled: Boolean(get('specialCardsEnabled') ?? true), specialCardsPerPlayer: Number(get('specialCardsPerPlayer') ?? 1), bonusInventoryEnabled: Boolean(get('bonusInventoryEnabled') ?? true), bonusInventoryRound: Number(get('bonusInventoryRound') ?? 3), bonusInventoryCount: Number(get('bonusInventoryCount') ?? 1), startingInventoryCount: Number(get('startingInventoryCount') ?? 1), characterGenerationMode: String(get('characterGenerationMode') ?? 'Classic'),
		scenarioEnabled: Boolean(get('scenarioEnabled') ?? true), scenarioFirstAfterRound: Number(get('scenarioFirstAfterRound') ?? 2), scenarioIntervalRounds: Number(get('scenarioIntervalRounds') ?? 3), scenarioTriggerPhase: String(get('scenarioTriggerPhase') ?? 'after_round_before_voting'),
		scenarioThreatEnabled: (get('scenarioEnabledTypes') || ['threat', 'event', 'secret_event']).includes('threat'), scenarioEventEnabled: (get('scenarioEnabledTypes') || ['threat', 'event', 'secret_event']).includes('event'), scenarioSecretEventEnabled: (get('scenarioEnabledTypes') || ['threat', 'event', 'secret_event']).includes('secret_event'),
		bunkerIntelMode: 'AllVisible', bunkerIntelIntervalRounds: Number(get('bunkerIntelIntervalRounds') ?? 2)
	};
}

function isLobbyConfiguredSystemEnabled(key) {
	const source = lobbyGet(lobbyState, 'settings', 'Settings');
	return !source || normalizeLobbySettings(source)[key] !== false;
}

function addEventMessage(message) {
	const eventDiv = document.getElementById("events");
	const eventItem = document.createElement("div");
	eventItem.className = "event-item";
	eventItem.innerHTML = message;

	const placeholder = eventDiv.querySelector('p');
	if (placeholder) placeholder.remove();

	eventDiv.insertBefore(eventItem, eventDiv.firstChild);
	while (eventDiv.children.length > 50) {
		eventDiv.removeChild(eventDiv.lastChild);
	}
}
