// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function updateSpecialCardsUI() {
	const section = document.getElementById('specialCardsSection');
	const tbody = document.getElementById('specialCardsTableBody');
	const gmList = document.getElementById('gmSpecialCardsList');
	const shouldShow = currentRoom && currentRoom.state !== 'Lobby';
	const rows = buildSpecialCardRows();

	if (section && tbody) {
		section.style.display = shouldShow ? 'block' : 'none';
		tbody.innerHTML = renderSpecialCardRows(rows, false);
	}

	if (gmList) {
		if (isHost && shouldShow) {
			gmList.style.display = 'grid';
			gmList.innerHTML = renderSpecialCardRows(buildGMSpecialCardRows(), true);
		} else {
			gmList.style.display = 'none';
			gmList.innerHTML = '';
		}
	}
}

function isPublicGameplayPlayer(player) {
	if (!player || player.isSpectatorGm || player.IsSpectatorGm) return false;
	const role = String(player.publicRole || player.PublicRole || 'player').toLowerCase().replace(/[_\s-]/g, '');
	return !['spectator', 'technicalgm', 'omniscientgm'].includes(role);
}

function getCanonicalPublicPlayerModels(options = null) {
	const activeOnly = options?.activeOnly === true;
	const players = Object.values(roomPlayers || {})
		.filter(isPublicGameplayPlayer)
		.filter(player => !activeOnly || (!(player.isEliminated || player.IsEliminated) && (player.isConnected ?? player.IsConnected ?? true)))
		.sort((a, b) => {
			const seatA = Number(a.seatNumber ?? a.SeatNumber) || Number.MAX_SAFE_INTEGER;
			const seatB = Number(b.seatNumber ?? b.SeatNumber) || Number.MAX_SAFE_INTEGER;
			return seatA - seatB;
		});

	return players.map((player, index) => ({
		player,
		seat: Number(player.seatNumber ?? player.SeatNumber) || index + 1
	}));
}

function getPublicActivePlayerSeat(models = getCanonicalPublicPlayerModels()) {
	const directSeat = Number(currentRoundState?.activePlayerSeatNumber || 0);
	if (directSeat > 0 && models.some(model => model.seat === directSeat)) return directSeat;
	const connectionRef = currentRoundState?.activePlayerConnectionId || '';
	const stableRef = currentRoundState?.activePlayerStableId || '';
	return models.find(({ player }) =>
		(connectionRef && (player.connectionId || player.ConnectionId) === connectionRef) ||
		(stableRef && (player.stablePlayerId || player.StablePlayerId) === stableRef)
	)?.seat || null;
}

function resolveSelectedPublicPlayer(models) {
	if (models.length === 0) return null;
	const retained = models.find(model => model.seat === selectedPublicPlayerSeat);
	if (retained) return retained;

	if (Number.isFinite(selectedPublicPlayerSeat)) {
		return models.reduce((nearest, model) =>
			Math.abs(model.seat - selectedPublicPlayerSeat) < Math.abs(nearest.seat - selectedPublicPlayerSeat) ? model : nearest,
			models[0]);
	}

	const self = models.find(({ player }) =>
		!(player.isEliminated || player.IsEliminated) &&
		isMyPlayerRef(player.connectionId || player.ConnectionId, player.stablePlayerId || player.StablePlayerId));
	if (self) return self;
	const activeSeat = getPublicActivePlayerSeat(models);
	return models.find(model => model.seat === activeSeat) ||
		models.find(({ player }) => !(player.isEliminated || player.IsEliminated)) ||
		models[0];
}

function selectPublicPlayerSeat(seat, focusSelector = false) {
	const parsedSeat = Number(seat);
	if (!Number.isInteger(parsedSeat)) return;
	selectedPublicPlayerSeat = parsedSeat;
	renderPublicPlayerOverview();
	if (focusSelector) document.querySelector(`#publicPlayerSelector [data-player-seat="${parsedSeat}"]`)?.focus({ preventScroll: true });
}

function navigatePublicPlayerOverview(direction) {
	const models = getCanonicalPublicPlayerModels();
	if (models.length === 0) return;
	const current = resolveSelectedPublicPlayer(models) || models[0];
	const index = Math.max(0, models.findIndex(model => model.seat === current.seat));
	const nextIndex = (index + direction + models.length) % models.length;
	selectPublicPlayerSeat(models[nextIndex].seat, true);
}

function ensurePublicPlayerOverviewEvents() {
	const shell = document.getElementById('publicPlayerOverview');
	if (!shell || shell.dataset.overviewEventsBound === 'true') return;
	shell.dataset.overviewEventsBound = 'true';
	shell.addEventListener('click', event => {
		const viewButton = event.target.closest('[data-player-view]');
		if (viewButton && shell.contains(viewButton)) {
			publicPlayerViewMode = viewButton.dataset.playerView === 'single' ? 'single' : 'all';
			renderPublicPlayerOverview();
			return;
		}
		const playerButton = event.target.closest('[data-player-seat]');
		if (playerButton && shell.contains(playerButton)) {
			selectPublicPlayerSeat(playerButton.dataset.playerSeat, true);
			return;
		}
		const navigation = event.target.closest('[data-overview-nav]');
		if (navigation && shell.contains(navigation)) navigatePublicPlayerOverview(navigation.dataset.overviewNav === 'next' ? 1 : -1);
	});
	shell.addEventListener('keydown', event => {
		if (!event.target.closest('#publicPlayerSelector')) return;
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		navigatePublicPlayerOverview(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
	});
	shell.addEventListener('change', event => {
		if (event.target.id !== 'playerComparisonSort') return;
		publicPlayerSortMode = ['seat', 'name', 'revealed-desc', 'revealed-asc'].includes(event.target.value) ? event.target.value : 'seat';
		renderAllPlayersComparison();
	});
}

function renderPublicPlayerBadges(player, seat, activeSeat) {
	const isMe = isMyPlayerRef(player.connectionId || player.ConnectionId, player.stablePlayerId || player.StablePlayerId);
	const eliminated = !!(player.isEliminated || player.IsEliminated);
	const badges = [
		player.isHost || player.IsHost ? `<span class="player-overview-badge badge-host">${t('host')}</span>` : '',
		isMe ? `<span class="player-overview-badge badge-you">${t('you')}</span>` : '',
		seat === activeSeat ? `<span class="player-overview-badge badge-turn">${t('activePlayer')}</span>` : '',
		eliminated ? `<span class="player-overview-badge badge-eliminated">${t('eliminated')}</span>` : `<span class="player-overview-badge badge-active">${t('playerActive')}</span>`
	];
	if (player.isConnected !== undefined || player.IsConnected !== undefined) {
		const connected = player.isConnected ?? player.IsConnected;
		badges.push(`<span class="player-overview-badge ${connected ? 'badge-online' : 'badge-offline'}">${connected ? t('playerOnline') : t('playerOffline')}</span>`);
	}
	return badges.filter(Boolean).join('');
}

function renderPublicPlayerSelectorItem(model, activeSeat) {
	const { player, seat } = model;
	const selected = seat === selectedPublicPlayerSeat;
	const eliminated = !!(player.isEliminated || player.IsEliminated);
	const connected = player.isConnected ?? player.IsConnected ?? true;
	return `<button type="button" class="player-selector-item${selected ? ' is-selected' : ''}${eliminated ? ' is-eliminated' : ''}${connected ? '' : ' is-offline'}" role="option" aria-selected="${selected}" data-player-seat="${seat}">
		<span class="player-selector-seat">#${seat}</span>
		<span class="player-selector-name">${escapeHtml(player.name || player.Name || t('playerLabel'))}</span>
		<span class="player-selector-badges">${renderPublicPlayerBadges(player, seat, activeSeat)}</span>
	</button>`;
}

function getPublicRevealedSource(player, key) {
	return player?.revealedSources?.[key] || null;
}

function getPublicCharacteristicValue(player, key) {
	const source = getPublicRevealedSource(player, key);
	if (key === 'profession' && source) return getProfessionDisplayName(source) || t('noData');
	if (key === 'hobby' && source) return getLocalizedByFields(source, ['hobby', 'name'], source.name || source.Name || t('noData'));
	if (key === 'property' && source) return getPropertyPresentation(source).title || t('propertyUnavailable');
	return player?.revealedData?.[key] || t('noData');
}

function getPublicInfoValue(value, allowZero = false) {
	if (value === null || value === undefined) return '';
	if (!allowZero && typeof value === 'number' && value === 0) return '';
	const text = String(value).trim();
	return text ? text : '';
}

function getPublicCharacteristicInfo(player, key) {
	const source = getPublicRevealedSource(player, key);
	if (!source) return null;
	const details = [];
	let professionBonus = '';
	const add = (label, value, allowZero = false) => {
		const normalizedLabel = getPublicInfoValue(label, true);
		const normalized = getPublicInfoValue(value, allowZero);
		if (normalizedLabel && normalized) details.push({ label: normalizedLabel, value: normalized });
	};

	if (key === 'property') {
		getPropertyPresentation(source).details.forEach(detail => add(detail.label, detail.value, true));
	} else if (key === 'profession') {
		add(t('qualification'), source.professionalLevel ?? source.ProfessionalLevel);
		const experience = Number(source.experienceYears ?? source.ExperienceYears);
		if (Number.isFinite(experience) && experience > 0) add(t('experience'), `${experience} ${t('years')}`);
		const professionItem = source.professionItem?.name || source.professionItem?.Name || source.ProfessionItem?.name || source.ProfessionItem?.Name;
		add(t('professionalItem'), professionItem || source.selectedItem || source.SelectedItem);
		professionBonus = getPublicInfoValue(source.bonus ?? source.Bonus);
		add(t('bonus'), professionBonus);
	} else if (key === 'hobby') {
		add(t('experience'), source.experienceYears ?? source.ExperienceYears ?? source.level ?? source.Level);
		add(t('hobbyRelatedItem'), source.item ?? source.Item ?? source.relatedItem ?? source.RelatedItem);
		add(t('bonus'), source.bonus ?? source.Bonus);
	}

	const tooltip = cleanTooltipText(
		source.tooltip ?? source.Tooltip ?? source.description ?? source.Description ??
		source.gameEffect ?? source.GameEffect ?? source.bunkerEffect ?? source.BunkerEffect ?? '');
	const description = key === 'profession' && professionBonus && tooltip === professionBonus
		? ''
		: tooltip;
	return details.length || description ? { details, description } : null;
}

function renderPublicCharacteristicTooltip(player, definition, context) {
	const info = getPublicCharacteristicInfo(player, definition.key);
	if (!info) return '';
	const identity = String(player.connectionId || player.ConnectionId || player.stablePlayerId || player.StablePlayerId || 'player')
		.replace(/[^a-z0-9_-]/gi, '');
	const tooltipId = `public-info-${context}-${identity}-${definition.key}`;
	const label = t(definition.labelKey);
	const details = info.details.map(detail => `<div class="public-tooltip-detail-row"><span class="public-tooltip-detail-label">${escapeHtml(detail.label)}</span><strong class="public-tooltip-detail-value">${escapeHtml(detail.value)}</strong></div>`).join('');
	return `<span class="characteristic-with-tooltip public-characteristic-tooltip ${context}-tooltip">
		<button type="button" class="tooltip-trigger public-info-trigger" aria-label="${escapeHtml(t('additionalInformationAria').replace('{characteristic}', label))}" aria-expanded="false" aria-controls="${tooltipId}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"></circle><path d="M12 10.5v5M12 7.5h.01"></path></svg><span class="visually-hidden">${escapeHtml(t('additionalInformation'))}</span></button>
		<span id="${tooltipId}" class="tooltip-content public-characteristic-tooltip-content ${details ? 'is-detailed' : 'is-compact'}" role="tooltip"><span class="public-tooltip-header">${escapeHtml(label)}</span>${info.description ? `<p class="public-tooltip-description">${escapeHtml(info.description)}</p>` : ''}${details ? `<div class="public-tooltip-details">${details}</div>` : ''}</span>
	</span>`;
}

function renderPublicCharacteristicCard(player, definition) {
	const { key, labelKey, icon } = definition;
	const label = t(labelKey);
	const revealed = !!player.revealed?.[key];
	if (!revealed) {
		return `<article class="public-characteristic-card is-sealed type-${key}" data-characteristic="${key}" data-revealed="false">
			<header><span class="public-characteristic-icon">${renderCharacteristicIcon(icon)}</span><h4>${escapeHtml(label)}</h4></header>
			<div class="public-characteristic-seal"><span class="public-lock-icon" aria-hidden="true">${renderCharacteristicIcon('lock')}</span><span>${t('notRevealed')}</span></div>
		</article>`;
	}

	const value = getPublicCharacteristicValue(player, key);
	const tooltip = renderPublicCharacteristicTooltip(player, definition, 'card');
	const additional = key === 'physicalHealth'
		? renderAdditionalPhysicalConditionsForOverview(player)
			: '';
	return `<article class="public-characteristic-card is-revealed type-${key}" data-characteristic="${key}" data-revealed="true">
		<header><span class="public-characteristic-icon">${renderCharacteristicIcon(icon)}</span><h4>${escapeHtml(label)}</h4>${tooltip}</header>
		<div class="public-characteristic-value">${escapeHtml(value)}</div>${additional}
	</article>`;
}

function getPublicRevealedCount(player) {
	return publicCharacteristicDefinitions.reduce((count, definition) => count + (player?.revealed?.[definition.key] ? 1 : 0), 0);
}

function sortPublicPlayerModels(models, sortMode = publicPlayerSortMode) {
	const sorted = [...models];
	const bySeat = (a, b) => a.seat - b.seat;
	if (sortMode === 'name') {
		return sorted.sort((a, b) => String(a.player.name || a.player.Name || '').localeCompare(String(b.player.name || b.player.Name || ''), getCurrentLanguage(), { sensitivity: 'base' }) || bySeat(a, b));
	}
	if (sortMode === 'revealed-desc' || sortMode === 'revealed-asc') {
		const direction = sortMode === 'revealed-desc' ? -1 : 1;
		return sorted.sort((a, b) => direction * (getPublicRevealedCount(a.player) - getPublicRevealedCount(b.player)) || bySeat(a, b));
	}
	return sorted.sort(bySeat);
}

function renderComparisonCharacteristic(player, definition) {
	const { key, labelKey, icon } = definition;
	const label = t(labelKey);
	const revealed = !!player?.revealed?.[key];
	if (!revealed) {
		return `<div class="comparison-characteristic is-sealed type-${key}" data-characteristic="${key}" data-revealed="false">
			<span class="comparison-characteristic-icon" aria-hidden="true">${renderCharacteristicIcon(icon)}</span>
			<span class="comparison-characteristic-copy"><strong>${escapeHtml(label)}</strong><span class="comparison-sealed-value"><span class="comparison-lock" aria-hidden="true">${renderCharacteristicIcon('lock')}</span>${t('notRevealed')}</span></span>
		</div>`;
	}

	const value = getPublicCharacteristicValue(player, key);
	const tooltip = renderPublicCharacteristicTooltip(player, definition, 'comparison');
	const additional = key === 'physicalHealth'
		? renderAdditionalPhysicalConditionsForOverview(player)
			: '';
	return `<div class="comparison-characteristic is-revealed type-${key}" data-characteristic="${key}" data-revealed="true">
		<span class="comparison-characteristic-icon" aria-hidden="true">${renderCharacteristicIcon(icon)}</span>
		<span class="comparison-characteristic-copy"><strong>${escapeHtml(label)}</strong><span class="comparison-public-value">${escapeHtml(value)}</span>${additional}</span>${tooltip}
	</div>`;
}

function renderPlayerDossierCard(model, activeSeat) {
	const { player, seat } = model;
	const revealedCount = getPublicRevealedCount(player);
	const progress = t('revealedProgress').replace('{shown}', revealedCount).replace('{total}', publicCharacteristicDefinitions.length);
	return `<article class="player-dossier-card${player.isEliminated || player.IsEliminated ? ' is-eliminated' : ''}" data-canonical-seat="${seat}">
		<header class="player-dossier-header">
			<div class="player-dossier-identity"><span class="player-dossier-seat">#${seat}</span><div><h3>${escapeHtml(player.name || player.Name || t('playerLabel'))}</h3><span class="player-dossier-progress">${escapeHtml(progress)}</span></div></div>
			<div class="player-dossier-badges">${renderPublicPlayerBadges(player, seat, activeSeat)}</div>
		</header>
		<div class="player-dossier-characteristics">${publicCharacteristicDefinitions.map(definition => renderComparisonCharacteristic(player, definition)).join('')}</div>
	</article>`;
}

function renderAllPlayersComparison(state = null) {
	const grid = document.getElementById('playerDossierGrid');
	if (!grid) return;
	const models = state?.models || getCanonicalPublicPlayerModels();
	if (!models.length) {
		grid.innerHTML = `<div class="player-overview-empty">${t('noAvailablePlayers')}</div>`;
		return;
	}
	const activeSeat = state?.activeSeat ?? getPublicActivePlayerSeat(models);
	grid.innerHTML = sortPublicPlayerModels(models).map(model => renderPlayerDossierCard(model, activeSeat)).join('');
	window.reinitTooltips?.();
}

function updatePublicPlayerComparisonToolbar() {
	const shell = document.getElementById('publicPlayerOverview');
	if (!shell) return;
	const labels = { all: t('allPlayersView'), single: t('singlePlayerView') };
	for (const button of shell.querySelectorAll('[data-player-view]')) {
		const active = button.dataset.playerView === publicPlayerViewMode;
		button.textContent = labels[button.dataset.playerView] || labels.all;
		button.classList.toggle('is-active', active);
		button.setAttribute('aria-pressed', String(active));
	}
	const toggle = shell.querySelector('.view-mode-toggle');
	if (toggle) toggle.setAttribute('aria-label', t('playerViewMode'));
	const sortField = shell.querySelector('.comparison-sort-field');
	if (sortField) {
		sortField.hidden = publicPlayerViewMode !== 'all';
		const label = sortField.querySelector('span');
		if (label) label.textContent = t('comparisonSort');
	}
	const sort = document.getElementById('playerComparisonSort');
	if (sort) {
		const labelsByValue = { seat: t('sortBySeat'), name: t('sortByName'), 'revealed-desc': t('sortMostRevealed'), 'revealed-asc': t('sortLeastRevealed') };
		for (const option of sort.options) option.textContent = labelsByValue[option.value] || option.textContent;
		sort.value = publicPlayerSortMode;
	}
}

function renderPublicPlayerOverview() {
	const shell = document.getElementById('publicPlayerOverview');
	const comparison = document.getElementById('allPlayersComparison');
	const singleOverview = document.getElementById('singlePlayerOverview');
	const selector = document.getElementById('publicPlayerSelector');
	const panel = document.getElementById('selectedPlayerPanel');
	if (!shell || !comparison || !singleOverview || !selector || !panel) return;
	ensurePublicPlayerOverviewEvents();
	updatePublicPlayerComparisonToolbar();
	const title = document.getElementById('publicPlayerOverviewTitle');
	if (title) title.textContent = t('playerOverviewTitle');
	selector.setAttribute('aria-label', t('playerOverviewTitle'));
	const roomState = String(currentRoom?.state || currentRoom?.State || '').toLowerCase();
	if (!roomState || roomState === 'lobby') {
		selectedPublicPlayerSeat = null;
		publicPlayerViewMode = 'all';
		selector.innerHTML = '';
		panel.innerHTML = '';
		document.getElementById('playerDossierGrid').innerHTML = '';
		return;
	}

	const models = getCanonicalPublicPlayerModels();
	const activePlayers = models.filter(({ player }) => !(player.isEliminated || player.IsEliminated));
	const count = document.getElementById('playerCount');
	if (count) count.textContent = `${activePlayers.length}/${currentBunkerCapacity || currentRoom?.maxPlayers || 12}`;
	if (models.length === 0) {
		selectedPublicPlayerSeat = null;
		selector.innerHTML = '';
		panel.innerHTML = `<div class="player-overview-empty">${t('noAvailablePlayers')}</div>`;
		renderAllPlayersComparison({ models });
		return;
	}
	const canonicalSeatsReady = models.every(({ player }) => Number(player.seatNumber ?? player.SeatNumber) > 0);
	if (!canonicalSeatsReady) {
		selectedPublicPlayerSeat = null;
		selector.innerHTML = '';
		panel.innerHTML = '';
		document.getElementById('playerDossierGrid').innerHTML = '';
		return;
	}

	const selected = resolveSelectedPublicPlayer(models);
	selectedPublicPlayerSeat = selected.seat;
	const activeSeat = getPublicActivePlayerSeat(models);
	comparison.hidden = publicPlayerViewMode !== 'all';
	singleOverview.hidden = publicPlayerViewMode !== 'single';
	renderAllPlayersComparison({ models, activeSeat });
	selector.innerHTML = models.map(model => renderPublicPlayerSelectorItem(model, activeSeat)).join('');
	const { player, seat } = selected;
	const revealedCount = publicCharacteristicDefinitions.filter(definition => !!player.revealed?.[definition.key]).length;
	const progress = t('revealedProgress').replace('{shown}', revealedCount).replace('{total}', publicCharacteristicDefinitions.length);
	const disableNavigation = models.length < 2 ? ' disabled aria-disabled="true"' : '';
	panel.innerHTML = `<header class="selected-player-header">
		<div class="selected-player-heading"><span class="selected-player-kicker">${t('playerLabel')} #${seat}</span><h3>${escapeHtml(player.name || player.Name || t('playerLabel'))}</h3><div class="selected-player-status">${renderPublicPlayerBadges(player, seat, activeSeat)}</div></div>
		<div class="selected-player-tools"><span class="selected-player-progress">${escapeHtml(progress)}</span><div class="selected-player-navigation" aria-label="${t('playerOverviewTitle')}"><button type="button" data-overview-nav="previous" aria-label="${t('previousPlayer')}"${disableNavigation}>‹</button><button type="button" data-overview-nav="next" aria-label="${t('nextPlayer')}"${disableNavigation}>›</button></div></div>
	</header><div class="public-characteristics-grid">${publicCharacteristicDefinitions.map(definition => renderPublicCharacteristicCard(player, definition)).join('')}</div>`;
	window.reinitTooltips?.();
}

function patchPublicCharacteristicHidden(connectionId, characteristicKey) {
	if (['revealed-desc', 'revealed-asc'].includes(publicPlayerSortMode)) {
		renderPublicPlayerOverview();
		return;
	}

	const model = getCanonicalPublicPlayerModels().find(entry =>
		String(entry.player.connectionId || entry.player.ConnectionId || '') === String(connectionId || ''));
	const definition = publicCharacteristicDefinitions.find(entry => entry.key === characteristicKey);
	if (!model || !definition) {
		renderPublicPlayerOverview();
		return;
	}

	const { player, seat } = model;
	const selector = `[data-characteristic="${characteristicKey}"]`;
	let patched = false;
	for (const card of document.querySelectorAll(`.player-dossier-card[data-canonical-seat="${seat}"] ${selector}`)) {
		card.outerHTML = renderComparisonCharacteristic(player, definition);
		patched = true;
	}

	if (selectedPublicPlayerSeat === seat) {
		const card = document.querySelector(`#selectedPlayerPanel ${selector}`);
		if (card) {
			card.outerHTML = renderPublicCharacteristicCard(player, definition);
			patched = true;
		}
	}

	const revealedCount = getPublicRevealedCount(player);
	const progress = t('revealedProgress').replace('{shown}', revealedCount).replace('{total}', publicCharacteristicDefinitions.length);
	document.querySelectorAll(`.player-dossier-card[data-canonical-seat="${seat}"] .player-dossier-progress`).forEach(node => { node.textContent = progress; });
	if (selectedPublicPlayerSeat === seat) document.querySelectorAll('#selectedPlayerPanel .selected-player-progress').forEach(node => { node.textContent = progress; });

	if (!patched) {
		renderPublicPlayerOverview();
		return;
	}
	window.reinitTooltips?.();
}
