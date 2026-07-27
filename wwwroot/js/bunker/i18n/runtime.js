// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function setText(selector, value) {
	const el = document.querySelector(selector);
	if (el) el.textContent = value;
}

function setPlaceholder(selector, value) {
	const el = document.querySelector(selector);
	if (el) el.placeholder = value;
}

function applyStaticTranslations() {
	document.querySelectorAll('.language-btn').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.lang === getCurrentLanguage());
	});

	setText('.create-room-panel .section-title', t('createRoom'));
	setText('.rooms-list-panel .section-title', t('availableRooms'));
	setText('#createRoomBtn', t('createRoom'));
	setText('#gmPanelBtn', t('gmPanel'));
	setText('#startVotingBtn', t('voting'));
	setText('#startGameBtn', t('startGame'));
	setText('#startReadyCheckBtn', t('allReady'));

	const leaveBtn = document.querySelector('.room-actions .btn-danger');
	if (leaveBtn) leaveBtn.textContent = t('leaveRoom');

	setPlaceholder('#playerNameCreate', t('playerNamePlaceholder'));
	setPlaceholder('#playerNameJoin', t('playerNamePlaceholder'));
	setPlaceholder('#roomName', t('roomNamePlaceholder'));
	setPlaceholder('#maxPlayers', t('maxPlayersPlaceholder'));
	setPlaceholder('#roomPassword', t('passwordOptionalPlaceholder'));
	setPlaceholder('#joinRoomPassword', t('passwordIfAnyPlaceholder'));

	setText('#myPlayerSection > .section-title', t('myCharacteristics'));
	setText('#mySpecialCardsSection > .section-title', t('mySpecialCards'));
	setText('#specialCardsSection > .section-title', t('revealedSpecialCards'));
	setText('.scenario-section-header .section-header-title', t('bunkerAndApocalypse'));
	setText('.events-section-main > .section-title', t('gameEvents'));
	setText('.events-history-title', t('eventsHistory'));

	const apocTitle = document.querySelector('#apocalypsePanel .panel-title');
	if (apocTitle) apocTitle.textContent = `☢️ ${t('apocalypse')}`;
	const bunkerTitle = document.querySelector('#bunkerPanel .panel-title');
	if (bunkerTitle) bunkerTitle.textContent = `🏠 ${t('bunker')}`;
	const threatTitle = document.querySelector('#threatPanel .panel-title');
	if (threatTitle) threatTitle.textContent = `⚠️ ${t('threat')}`;

	const playersInBunkerTitle = document.querySelector('#gameSection > .section-title');
	if (playersInBunkerTitle) {
		const count = document.getElementById('playerCount')?.textContent || '0/6';
		playersInBunkerTitle.innerHTML = `${t('playersInBunker')} <span class="bunker-count" id="playerCount">${count}</span>`;
	}

	const roomLobbyTitle = document.querySelector('#roomLobby .section-title');
	if (roomLobbyTitle) {
		const count = document.getElementById('roomPlayerCount')?.textContent || '0/12';
		roomLobbyTitle.innerHTML = `${t('players')} ${t('room')}: <span id="roomPlayerCount">${count}</span>`;
	}

	const specialCardHeaders = document.querySelectorAll('#specialCardsSection thead th');
	const specialCardHeaderLabels = ['№', t('players'), t('specialCard'), `${t('description')} / ${t('effect')}`, t('target'), t('status')];
	specialCardHeaders.forEach((th, index) => {
		if (specialCardHeaderLabels[index]) th.textContent = specialCardHeaderLabels[index];
	});

	if (typeof initVisualThemePreview === 'function') initVisualThemePreview();
	else if (typeof initApocalypseEffectPreview === 'function') initApocalypseEffectPreview();
}

function rerenderLocalizedUI() {
	renderCurrentGameUI();
	if (currentVoting && document.getElementById('votingPanel')?.style.display !== 'none' && typeof showVotingPanel === "function") showVotingPanel(currentVoting);
	if (currentVoting && document.getElementById('votingResultsPanel')?.style.display !== 'none' && typeof showVotingResults === "function") showVotingResults(currentVoting);
}

function changeLanguage(lang) {
	setCurrentLanguage(lang);
	rerenderLocalizedUI();
}
