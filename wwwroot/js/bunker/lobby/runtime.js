// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

async function previewLobbyStart() {
	if (lobbyCommandPending) return; lobbyCommandPending = true; renderLobbyState();
	try { lobbyStartPreview = await connection.invoke('PreviewStartGameFromLobby'); renderLobbyPreviewSummary(); }
	catch (_) { lobbyStartPreview = null; renderLobbyPreviewSummary(true); }
	finally { lobbyCommandPending = false; renderLobbyState(); }
}

async function startGame() {
	if (isStartingGame || lobbyCommandPending) return;
	if (!lobbyStartPreview?.canStart) { await previewLobbyStart(); return; }
	if (!confirm(getCurrentLanguage() === 'en' ? 'Start the game?' : getCurrentLanguage() === 'ru' ? 'Начать игру?' : 'Почати гру?')) return;
	isStartingGame = true; lobbyCommandPending = true; renderLobbyState();
	try { await connection.invoke('StartGameFromLobby', lobbyStartPreview.previewToken, true, crypto.randomUUID()); }
	catch (_) { isStartingGame = false; lobbyStartPreview = null; renderLobbyPreviewSummary(true); }
	finally { lobbyCommandPending = false; renderLobbyState(); }
}

async function toggleLobbyReady() {
	if (lobbyCommandPending) return; const members = lobbyState?.members || lobbyState?.Members || [];
	const me = members.find(member => member.playerId === getMyStablePlayerId() || member.PlayerId === getMyStablePlayerId());
	lobbyCommandPending = true; renderLobbyState();
	try { await connection.invoke('SetLobbyReady', !(me?.isReady ?? me?.IsReady ?? false), crypto.randomUUID()); }
	finally { lobbyCommandPending = false; renderLobbyState(); }
}

async function setLobbyParticipation(playerId, spectator) {
	if (lobbyCommandPending) return; lobbyCommandPending = true; renderLobbyState();
	try { const role = spectator ? 1 : 0; const preview = await connection.invoke('PreviewSetLobbyParticipation', playerId, role); if (!(preview.canApply ?? preview.CanApply) || !confirm(`${preview.targetName || preview.TargetName}: ${preview.requestedRole || preview.RequestedRole}?`)) return; await connection.invoke('SetLobbyParticipation', playerId, role, true, crypto.randomUUID()); }
	finally { lobbyCommandPending = false; renderLobbyState(); }
}

async function transferLobbyHost(playerId) {
	if (lobbyCommandPending || !confirm('Transfer host?')) return; lobbyCommandPending = true;
	try { await connection.invoke('TransferHost', playerId, crypto.randomUUID()); } finally { lobbyCommandPending = false; }
}

function updateScenarioSectionVisibility() {
	const section = document.querySelector('#gameSection > .scenario-immersive-section');
	if (!section) return;
	const anyVisible = ['apocalypsePanel', 'bunkerPanel', 'threatPanel'].some(id => document.getElementById(id)?.style.display !== 'none');
	section.hidden = !anyVisible; section.style.display = anyVisible ? '' : 'none';
}

function lobbyAmCurrentHost(state = lobbyState) {
	const meId = getMyStablePlayerId();
	return (lobbyGet(state, 'members', 'Members') || []).some(member => lobbyGet(member, 'playerId', 'PlayerId') === meId && lobbyGet(member, 'isCurrentHost', 'IsCurrentHost'));
}

function syncLobbySettingsState(state) {
	const hostNow = lobbyAmCurrentHost(state); const ownerId = getMyStablePlayerId();
	const revision = Number(lobbyGet(state, 'settingsRevision', 'SettingsRevision') || 1);
	const canonical = lobbyGet(state, 'settings', 'Settings');
	if (!hostNow) { lobbySettingsDraft = null; lobbySettingsDirty = false; lobbySettingsOwnerId = ''; lobbySettingsBaseRevision = revision; lobbyApocalypseCatalog = null; return; }
	if (!lobbySettingsDraft || lobbySettingsOwnerId !== ownerId || lobbySettingsBaseRevision !== revision) {
		lobbySettingsDraft = normalizeLobbySettings(canonical); lobbySettingsBaseRevision = revision; lobbySettingsDirty = false; lobbySettingsOwnerId = ownerId; lobbyApocalypseCatalog = null;
		if (lobbySettingsActiveTab === 'apocalypse') ensureLobbyApocalypseCatalog();
	}
}

function lobbyPresetLabel(value) { return t({ Classic: 'lobbyPresetClassic', Calm: 'lobbyPresetCalm', Dangerous: 'lobbyPresetDangerous', Hardcore: 'lobbyPresetHardcore', Quick: 'lobbyPresetQuick', Long: 'lobbyPresetLong', Custom: 'lobbyPresetCustom' }[value] || 'lobbyPresetCustom'); }

function lobbyFrequencyLabel(value) { return t({ OncePerGame: 'lobbyOnce', EveryOtherRound: 'lobbyEveryOther', EveryRound: 'lobbyEveryRound', RandomEligibleRounds: 'lobbyRandomRounds', EveryTwoRounds: 'lobbyEveryOther' }[value] || 'lobbyOnce'); }

function lobbyCapacityLabel(settings) {
	if (settings.bunkerCapacityMode === 'Manual') return `${t('lobbyManual')}: ${settings.manualBunkerCapacity ?? '—'}`;
	if (settings.bunkerCapacityMode === 'RandomRange') return `${t('lobbyRandomRange')}: ${settings.randomBunkerCapacityMin ?? '—'}–${settings.randomBunkerCapacityMax ?? '—'}`;
	return t('lobbyAutomatic');
}

function setLobbySettingsFeedback(key, error = false) {
	const element = document.getElementById('lobbySettingsFeedback'); if (!element) return;
	element.textContent = key ? t(key) : ''; element.className = `lobby-settings-feedback${key ? error ? ' error' : ' success' : ''}`;
}

function lobbyWarningText(code) { return t({ bunker_capacity_not_restrictive: 'lobbyWarningCapacity', spectators_present: 'lobbyWarningSpectators', player_count_exceeds_max: 'lobbyWarningPlayers', apocalypse_categories_empty: 'lobbyWarningApocalypseCategoriesEmpty', apocalypse_pool_empty: 'lobbyWarningApocalypsePoolEmpty', apocalypse_specific_missing: 'lobbyWarningApocalypseSpecificMissing', apocalypse_candidate_set_empty: 'lobbyWarningApocalypseCandidateEmpty', apocalypse_interactive_unavailable: 'lobbyWarningApocalypseInteractiveUnavailable', apocalypse_only_interactive_candidates: 'lobbyWarningApocalypseOnlyInteractive', apocalypse_theme_disabled: 'lobbyWarningApocalypseThemeDisabled', apocalypse_custom_pool_small: 'lobbyWarningApocalypsePoolSmall', apocalypse_specific_is_interactive: 'lobbyWarningApocalypseSpecificInteractive', apocalypse_effects_disabled: 'lobbyWarningActivationEffectsDisabled', apocalypse_activation_inactive: 'lobbyWarningActivationInactive', apocalypse_activation_default_mixed: 'lobbyWarningActivationDefaultMixed', apocalypse_activation_candidate_incompatible: 'lobbyWarningActivationCandidateIncompatible', apocalypse_activation_requires_voting: 'lobbyWarningActivationRequiresVoting', apocalypse_activation_unlimited: 'lobbyWarningActivationUnlimited', apocalypse_activation_game_start_once: 'lobbyWarningActivationGameStartOnce', apocalypse_activation_no_interactive_candidates: 'lobbyWarningActivationNoCandidates' }[code] || 'lobbySettingsInvalid'); }

function lobbyAuditLabel(action) { return t({ lobby_settings_applied: 'lobbyAuditSettings', lobby_readiness_changed: 'lobbyAuditReady', lobby_readiness_reset: 'lobbyAuditReadyReset', lobby_role_changed: 'lobbyAuditRole', host_transfer: 'lobbyAuditHost', lobby_player_kicked: 'lobbyAuditKick', lobby_player_joined: 'lobbyAuditJoined', lobby_player_reconnected: 'lobbyAuditReconnected', lobby_player_left: 'lobbyAuditLeft', lobby_password_changed: 'lobbyAuditPassword', game_started_from_lobby: 'lobbyAuditStarted' }[action] || 'lobbyAuditGeneric'); }

async function ensureLobbyApocalypseCatalog() {
	if (lobbyApocalypseCatalog || lobbyApocalypseCatalogPending || !lobbyAmCurrentHost()) return;
	lobbyApocalypseCatalogPending = true;
	try {
		lobbyApocalypseCatalog = await connection.invoke('GetLobbyApocalypseCatalog', getCurrentLanguage());
		const config = lobbyGet(lobbyApocalypseCatalog, 'configuration', 'Configuration');
		if (lobbySettingsDraft && config) {
			lobbySettingsDraft.selectedApocalypseId = lobbyGet(config, 'selectedApocalypseId', 'SelectedApocalypseId');
			lobbySettingsDraft.allowedApocalypseCategoryIds = [...(lobbyGet(config, 'allowedApocalypseCategoryIds', 'AllowedApocalypseCategoryIds') || [])];
			lobbySettingsDraft.apocalypseCustomPoolIds = [...(lobbyGet(config, 'apocalypseCustomPoolIds', 'ApocalypseCustomPoolIds') || [])];
			const activation = lobbyGet(config, 'activation', 'Activation');
			if (activation) lobbySettingsDraft.apocalypseActivation = normalizeLobbySettings({ apocalypseActivation: activation }).apocalypseActivation;
		}
	} catch (_) { setLobbySettingsFeedback('lobbySettingsInvalid', true); }
	finally { lobbyApocalypseCatalogPending = false; renderLobbyGameSetup(); }
}

function markLobbyApocalypseDraftChanged() {
	if (!lobbySettingsDraft) return;
	lobbySettingsDraft.allowedApocalypseCategoryCount = lobbySettingsDraft.allowedApocalypseCategoryIds.length;
	lobbySettingsDraft.apocalypseCustomPoolCount = lobbySettingsDraft.apocalypseCustomPoolIds.length;
	lobbySettingsDraft.preset = 'Custom'; lobbySettingsDirty = true; setLobbySettingsFeedback(''); renderLobbyGameSetup();
}

function updateLobbyActivationDraft(control) {
	if (!lobbySettingsDraft?.apocalypseActivation) return;
	const key = control.dataset.activationSetting;
	let value = control.type === 'checkbox' ? control.checked : control.value;
	if (['firstRound', 'intervalRounds', 'maxActivations'].includes(key)) value = value === '' ? null : Number(value);
	lobbySettingsDraft.apocalypseActivation[key] = value;
	if (key === 'trigger' && value === 'GameStart') {
		lobbySettingsDraft.apocalypseActivation.scheduleMode = 'Once';
		lobbySettingsDraft.apocalypseActivation.intervalRounds = null;
		lobbySettingsDraft.apocalypseActivation.maxActivations = 1;
	}
	if (key === 'scheduleMode' && value === 'Once') {
		lobbySettingsDraft.apocalypseActivation.intervalRounds = null;
		lobbySettingsDraft.apocalypseActivation.maxActivations = 1;
	}
	if (key === 'scheduleMode' && value === 'Recurring' && lobbySettingsDraft.apocalypseActivation.intervalRounds == null)
		lobbySettingsDraft.apocalypseActivation.intervalRounds = 3;
	lobbySettingsDraft.preset = 'Custom'; lobbySettingsDirty = true; setLobbySettingsFeedback(''); renderLobbyGameSetup();
}

function renderLobbyApocalypseActivation(settings, apocalypses) {
	const activation = settings.apocalypseActivation; if (!activation) return;
	const contract = lobbyGet(lobbyApocalypseCatalog, 'activationContract', 'ActivationContract') || {};
	const candidateIds = settings.apocalypseSelectionMode === 'Specific' ? [settings.selectedApocalypseId].filter(Boolean) : settings.apocalypseSelectionMode === 'CustomPool' ? settings.apocalypseCustomPoolIds : settings.apocalypseSelectionMode === 'RandomCategories' ? apocalypses.filter(item => settings.allowedApocalypseCategoryIds.includes(lobbyGet(item, 'categoryId', 'CategoryId'))).map(item => lobbyGet(item, 'id', 'Id')) : apocalypses.map(item => lobbyGet(item, 'id', 'Id'));
	const candidates = apocalypses.filter(item => candidateIds.includes(lobbyGet(item, 'id', 'Id')));
	const interactive = candidates.filter(item => Boolean(lobbyGet(item, 'interactive', 'Interactive')));
	const specific = settings.apocalypseSelectionMode === 'Specific' ? candidates[0] : null;
	const specificOrdinary = specific && !lobbyGet(specific, 'interactive', 'Interactive');
	const activeChance = settings.apocalypseSelectionMode === 'Specific' ? !specificOrdinary : settings.interactiveApocalypseChancePercent > 0;
	const inactive = !settings.apocalypseEnabled || !settings.allowInteractiveApocalypses || !activeChance || interactive.length === 0;
	const effects = document.getElementById('lobbyActivationEffectsEnabled'); if (effects) { effects.checked = activation.effectsEnabled; effects.disabled = lobbySettingsPending || inactive; }
	const policy = document.getElementById('lobbyActivationPolicyMode'); if (policy) { policy.value = activation.policyMode; policy.disabled = lobbySettingsPending || inactive || !activation.effectsEnabled; }
	const unavailable = document.getElementById('lobbyActivationUnavailable');
	if (unavailable) { unavailable.hidden = !inactive; unavailable.textContent = specificOrdinary ? t('lobbyActivationOrdinary') : t('lobbyActivationUnavailable'); }
	const custom = activation.policyMode === 'Custom';
	const controls = document.getElementById('lobbyActivationCustomControls'); if (controls) controls.hidden = !custom;
	const setOptions = (id, values, selected, label) => { const select = document.getElementById(id); if (!select) return; select.replaceChildren(...values.map(value => new Option(label(value), value))); select.value = selected == null ? '' : String(selected); select.disabled = lobbySettingsPending || inactive || !activation.effectsEnabled || !custom; };
	const modes = (lobbyGet(contract, 'supportedModes', 'SupportedModes') || ['once','recurring']).map(value => value === 'once' ? 'Once' : 'Recurring');
	const triggers = (lobbyGet(contract, 'supportedTriggers', 'SupportedTriggers') || ['game_start','after_voting','after_round']).map(value => value === 'game_start' ? 'GameStart' : value === 'after_round' ? 'AfterRound' : 'AfterVoting');
	const firstRounds = lobbyGet(contract, 'allowedFirstRounds', 'AllowedFirstRounds') || [1,2,3,4,5];
	const intervals = lobbyGet(contract, 'allowedIntervalRounds', 'AllowedIntervalRounds') || [1,2,3,4,5];
	setOptions('lobbyActivationScheduleMode', modes, activation.scheduleMode, value => t(value === 'Once' ? 'lobbyActivationOnce' : 'lobbyActivationRecurring'));
	setOptions('lobbyActivationTrigger', triggers, activation.trigger, value => t(value === 'GameStart' ? 'lobbyActivationGameStart' : value === 'AfterRound' ? 'lobbyActivationAfterRound' : 'lobbyActivationAfterVoting'));
	setOptions('lobbyActivationFirstRound', firstRounds, activation.firstRound, value => String(value));
	setOptions('lobbyActivationIntervalRounds', intervals, activation.intervalRounds, value => String(value));
	const maximum = Number(lobbyGet(contract, 'maximumAllowedActivations', 'MaximumAllowedActivations') || 20);
	setOptions('lobbyActivationMaxActivations', ['', ...Array.from({ length: maximum }, (_, index) => index + 1)], activation.maxActivations, value => value === '' ? t('lobbyActivationUnlimited') : String(value));
	const gameStart = activation.trigger === 'GameStart'; const once = activation.scheduleMode === 'Once' || gameStart;
	const firstRow = document.getElementById('lobbyActivationFirstRoundRow'); if (firstRow) firstRow.hidden = gameStart;
	const intervalRow = document.getElementById('lobbyActivationIntervalRow'); if (intervalRow) intervalRow.hidden = once;
	const maxRow = document.getElementById('lobbyActivationMaxRow'); if (maxRow) maxRow.hidden = once;
	const summary = document.getElementById('lobbyActivationSummary');
	if (summary) {
		if (inactive) summary.textContent = t('lobbyActivationInactiveSummary');
		else if (!activation.effectsEnabled) summary.textContent = t('lobbyActivationEffectsOffSummary');
		else if (!custom) {
			const definition = specific ? lobbyGet(specific, 'activation', 'Activation') : null;
			summary.textContent = definition ? `${t('lobbyActivationDefinitionDefault')}: ${lobbyGet(definition, 'defaultTrigger', 'DefaultTrigger')} · ${lobbyGet(definition, 'defaultFirstRound', 'DefaultFirstRound')}` : `${t('lobbyActivationDefinitionDefault')} · ${interactive.length} ${t('lobbyApocalypseInteractive').toLowerCase()}`;
		} else if (gameStart) summary.textContent = t('lobbyActivationGameStartSummary');
		else summary.textContent = `${activation.trigger === 'AfterVoting' ? t('lobbyActivationAfterVoting') : t('lobbyActivationAfterRound')} · ${t('lobbyActivationFromRound')} ${activation.firstRound} · ${once ? t('lobbyActivationOnce') : `${t('lobbyActivationEvery')} ${activation.intervalRounds}`} · ${activation.maxActivations == null ? t('lobbyActivationUnlimited') : activation.maxActivations}`;
		if (custom && activation.trigger === 'AfterVoting' && !settings.votingEnabled) summary.textContent += ` · ${t('lobbyActivationVotingRequired')}`;
	}
}

function renderLobbyApocalypseEditor(settings) {
	const pane = document.getElementById('lobbySettingsApocalypse'); if (!pane) return;
	const mode = settings.apocalypseSelectionMode;
	for (const [id, visible] of [['lobbyApocalypseCategories', mode === 'RandomCategories'], ['lobbyApocalypsePicker', mode === 'Specific' || mode === 'CustomPool'], ['lobbyApocalypsePool', mode === 'CustomPool']]) {
		const element = document.getElementById(id); if (element) element.hidden = !visible;
	}
	const chance = document.getElementById('lobbyInteractiveApocalypseChance'); if (chance) chance.disabled = lobbySettingsPending || mode === 'Specific' || !settings.allowInteractiveApocalypses;
	const catalog = lobbyApocalypseCatalog; if (!catalog) { ensureLobbyApocalypseCatalog(); return; }
	const categories = lobbyGet(catalog, 'categories', 'Categories') || [];
	const apocalypses = lobbyGet(catalog, 'apocalypses', 'Apocalypses') || [];
	const categoryContainer = document.getElementById('lobbyApocalypseCategoryChips');
	if (categoryContainer) {
		categoryContainer.replaceChildren(...categories.map(category => {
			const id = lobbyGet(category, 'id', 'Id'); const button = document.createElement('button'); button.type = 'button';
			button.className = 'lobby-apocalypse-category-chip'; button.dataset.apocalypseAction = 'toggle-category'; button.dataset.id = id;
			button.classList.toggle('selected', settings.allowedApocalypseCategoryIds.includes(id));
			button.style.setProperty('--category-swatch', `var(--apocalypse-swatch-${lobbyGet(category, 'visualThemeId', 'VisualThemeId')}, #777)`);
			button.textContent = `${lobbyGet(category, 'name', 'Name')} · ${lobbyGet(category, 'ordinaryCount', 'OrdinaryCount')}/${lobbyGet(category, 'interactiveCount', 'InteractiveCount')}`; return button;
		}));
	}
	const filter = document.getElementById('lobbyApocalypseCategoryFilter');
	if (filter && filter.options.length !== categories.length + 1) {
		filter.replaceChildren(new Option(t('lobbyApocalypseRandomAll'), ''), ...categories.map(category => new Option(lobbyGet(category, 'name', 'Name'), lobbyGet(category, 'id', 'Id'))));
		filter.value = lobbyApocalypseCategoryFilter;
	}
	const normalizedSearch = lobbyApocalypseSearch.trim().toLocaleLowerCase();
	const filtered = apocalypses.filter(item => (!normalizedSearch || `${lobbyGet(item, 'name', 'Name')} ${lobbyGet(item, 'id', 'Id')}`.toLocaleLowerCase().includes(normalizedSearch)) &&
		(!lobbyApocalypseCategoryFilter || lobbyGet(item, 'categoryId', 'CategoryId') === lobbyApocalypseCategoryFilter) &&
		(lobbyApocalypseInteractiveFilter === 'all' || String(Boolean(lobbyGet(item, 'interactive', 'Interactive'))) === lobbyApocalypseInteractiveFilter));
	const selectedIds = mode === 'Specific' ? [settings.selectedApocalypseId].filter(Boolean) : settings.apocalypseCustomPoolIds;
	const groupedModel = buildLobbyApocalypseGroupedModel(categories, apocalypses, filtered, selectedIds, mode, lobbyApocalypseVisibleCount);
	const results = document.getElementById('lobbyApocalypseResults');
	if (results) results.replaceChildren(...groupedModel.map(group => {
		const container = document.createElement('div'); container.className = 'lobby-apocalypse-category-group'; container.dataset.categoryId = group.id;
		for (const [key, value] of Object.entries({ totalCount: group.totalCount, visibleCount: group.visibleCount, renderedCount: group.renderedCount, selectedCount: group.selectedCount })) container.dataset[key] = String(value);
		const collapsed = lobbyApocalypseCollapsedCategoryIds.has(group.id);
		const header = document.createElement('button'); header.type = 'button'; header.className = 'lobby-apocalypse-category-header';
		header.dataset.apocalypseCategoryToggle = group.id; header.setAttribute('aria-expanded', String(!collapsed)); header.title = group.description;
		const icon = document.createElement('span'); icon.className = 'lobby-apocalypse-category-icon'; icon.setAttribute('aria-hidden', 'true'); icon.append(createApocalypseCategoryIcon(group.id));
		const label = document.createElement('span'); label.className = 'lobby-apocalypse-category-name'; label.textContent = group.name;
		const counts = document.createElement('span'); counts.className = 'lobby-apocalypse-category-counts'; counts.textContent = mode === 'CustomPool' ? `${group.selectedCount} · ${group.visibleCount} / ${group.totalCount}` : `${group.visibleCount} / ${group.totalCount}`;
		header.append(icon, label, counts);
		const options = document.createElement('div'); options.className = 'lobby-apocalypse-category-options'; options.hidden = collapsed;
		options.replaceChildren(...group.items.map(item => createLobbyApocalypseOption(item, settings, mode)));
		container.append(header, options); return container;
	}));
	const more = document.getElementById('lobbyApocalypseLoadMore'); if (more) more.hidden = filtered.length <= lobbyApocalypseVisibleCount;
	const selectedList = document.getElementById('lobbyApocalypseSelectedPool');
	if (selectedList) selectedList.replaceChildren(...settings.apocalypseCustomPoolIds.map(id => {
		const item = apocalypses.find(value => lobbyGet(value, 'id', 'Id') === id); const button = document.createElement('button'); button.type = 'button';
		button.dataset.apocalypseAction = 'toggle-pool'; button.dataset.id = id; button.textContent = `${item ? lobbyGet(item, 'name', 'Name') : id} ×`; return button;
	}));
	const preview = document.getElementById('lobbyApocalypsePreview');
	if (preview) {
		const candidateIds = mode === 'Specific' ? [settings.selectedApocalypseId].filter(Boolean) : mode === 'CustomPool' ? settings.apocalypseCustomPoolIds : mode === 'RandomCategories' ? apocalypses.filter(item => settings.allowedApocalypseCategoryIds.includes(lobbyGet(item, 'categoryId', 'CategoryId'))).map(item => lobbyGet(item, 'id', 'Id')) : apocalypses.map(item => lobbyGet(item, 'id', 'Id'));
		const candidates = apocalypses.filter(item => candidateIds.includes(lobbyGet(item, 'id', 'Id'))); const interactive = candidates.filter(item => lobbyGet(item, 'interactive', 'Interactive')).length;
		preview.textContent = `${candidates.length} possible · ${candidates.length - interactive} ${t('lobbyApocalypseOrdinary').toLowerCase()} · ${interactive} ${t('lobbyApocalypseInteractive').toLowerCase()} · ${settings.interactiveApocalypseChancePercent}%`;
	}
	renderLobbyApocalypseActivation(settings, apocalypses);
}

function buildLobbyApocalypseGroupedModel(categories, apocalypses, filtered, selectedIds, mode, visibleLimit) {
	const selected = new Set(selectedIds); const rendered = filtered.slice(0, visibleLimit);
	const renderedIds = new Set(rendered.map(item => lobbyGet(item, 'id', 'Id')));
	const selectedExtras = mode === 'CustomPool' ? apocalypses.filter(item => selected.has(lobbyGet(item, 'id', 'Id')) && !renderedIds.has(lobbyGet(item, 'id', 'Id'))) : [];
	const displayed = [...rendered, ...selectedExtras];
	return categories.map(category => {
		const id = lobbyGet(category, 'id', 'Id'); const categoryItems = apocalypses.filter(item => lobbyGet(item, 'categoryId', 'CategoryId') === id);
		const visibleItems = filtered.filter(item => lobbyGet(item, 'categoryId', 'CategoryId') === id); const items = displayed.filter(item => lobbyGet(item, 'categoryId', 'CategoryId') === id);
		const selectedCount = categoryItems.filter(item => selected.has(lobbyGet(item, 'id', 'Id'))).length;
		return { id, name: lobbyGet(category, 'name', 'Name'), description: lobbyGet(category, 'description', 'Description') || '', totalCount: Number(lobbyGet(category, 'totalCount', 'TotalCount') ?? categoryItems.length), visibleCount: visibleItems.length, renderedCount: items.length, selectedCount, items };
	}).filter(group => group.visibleCount > 0 || mode === 'CustomPool' && group.selectedCount > 0);
}

function createLobbyApocalypseOption(item, settings, mode) {
	const id = lobbyGet(item, 'id', 'Id'); const interactive = Boolean(lobbyGet(item, 'interactive', 'Interactive'));
	const button = document.createElement('button'); button.type = 'button'; button.className = 'lobby-apocalypse-option'; button.dataset.apocalypseAction = mode === 'Specific' ? 'select-specific' : 'toggle-pool'; button.dataset.id = id;
	button.classList.toggle('selected', mode === 'Specific' ? settings.selectedApocalypseId === id : settings.apocalypseCustomPoolIds.includes(id));
	const title = document.createElement('strong'); title.textContent = lobbyGet(item, 'name', 'Name'); const meta = document.createElement('span'); meta.textContent = interactive ? t('lobbyApocalypseInteractive') : t('lobbyApocalypseOrdinary');
	button.append(title, meta); return button;
}

function renderLobbyGameSetup() {
	const state = lobbyState; const setup = document.getElementById('lobbyGameSetup'); if (!state || !setup) return;
	const host = lobbyAmCurrentHost(state); const canonical = normalizeLobbySettings(lobbyGet(state, 'settings', 'Settings'));
	if (host && !lobbySettingsDraft) syncLobbySettingsState(state);
	const displayed = host && lobbySettingsDraft ? lobbySettingsDraft : canonical;
	const revision = Number(lobbyGet(state, 'settingsRevision', 'SettingsRevision') || 1);
	const revisionElement = document.getElementById('lobbySettingsRevision'); if (revisionElement) revisionElement.textContent = `${t('lobbyRevision')}: ${revision}`;
	const dirty = document.getElementById('lobbySettingsDirty'); if (dirty) dirty.textContent = host && lobbySettingsDirty ? t('lobbyUnsaved') : '';
	const editor = document.getElementById('lobbySettingsHostEditor'); const readOnly = document.getElementById('lobbySettingsReadOnly');
	if (editor) editor.hidden = !host; if (readOnly) readOnly.hidden = host;
	const chipValues = [
		`${lobbyPresetLabel(displayed.preset)}`,
		`${displayed.minGameplayPlayers}–${displayed.maxGameplayPlayers} ${t('players').toLowerCase()}`,
		`${t('lobbySummaryBunker')}: ${lobbyCapacityLabel(displayed)}`,
		`${t('lobbySummaryThreats')}: ${displayed.threatsEnabled ? `${displayed.interactiveThreatRate} ${displayed.firstThreatRound}+` : t('lobbyOff')}`,
		`${t('lobbySummaryTimer')}: ${displayed.roundTimerEnabled ? `${Math.round(displayed.roundTimerDurationSeconds / 60)} min` : t('lobbyOff')}`,
		`${t('lobbySummaryVoting')}: ${displayed.votingEnabled ? `${t('lobbyFromRound')} ${displayed.votingStartRound}` : t('lobbyOff')}`,
		`${t('lobbySummaryCards')}: ${displayed.specialCardsEnabled ? displayed.specialCardsPerPlayer : 0}`
		,`${t('apocalypse')}: ${displayed.apocalypseEnabled ? `${displayed.apocalypseSelectionMode} · ${displayed.interactiveApocalypseChancePercent}%` : t('lobbyOff')}`
	];
	const chips = document.getElementById('lobbySettingsChips'); if (chips) chips.innerHTML = chipValues.map(value => `<span class="lobby-settings-chip">${escapeHtml(String(value))}</span>`).join('');
	const warnings = lobbyGet(state, 'settingsWarnings', 'SettingsWarnings') || []; const warningsElement = document.getElementById('lobbySettingsWarnings');
	if (warningsElement) warningsElement.innerHTML = warnings.map(warning => `<div class="lobby-settings-warning">${escapeHtml(lobbyWarningText(lobbyGet(warning, 'code', 'Code')))}</div>`).join('');

	if (host) {
		const preset = document.getElementById('lobbyPresetSelect');
		if (preset && preset.dataset.language !== getCurrentLanguage()) {
			preset.innerHTML = ['Classic', 'Calm', 'Dangerous', 'Hardcore', 'Quick', 'Long', 'Custom'].map(value => `<option value="${value}">${escapeHtml(lobbyPresetLabel(value))}</option>`).join(''); preset.dataset.language = getCurrentLanguage();
		}
		setup.querySelectorAll('.lobby-setting-input[data-setting]').forEach(control => {
			const key = control.dataset.setting; const value = displayed[key];
			if (control.type === 'checkbox') control.checked = Boolean(value); else control.value = value ?? '';
			control.disabled = lobbySettingsPending;
		});
		const mode = displayed.bunkerCapacityMode;
		for (const [id, visible] of [['lobbyManualCapacityRow', mode === 'Manual'], ['lobbyRandomCapacityMinRow', mode === 'RandomRange'], ['lobbyRandomCapacityMaxRow', mode === 'RandomRange']]) { const row = document.getElementById(id); if (row) row.hidden = !visible; }
		renderLobbyApocalypseEditor(displayed);
		setup.querySelectorAll('[data-settings-tab]').forEach(button => { const active = button.dataset.settingsTab === lobbySettingsActiveTab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
		setup.querySelectorAll('[data-settings-pane]').forEach(pane => { const active = pane.dataset.settingsPane === lobbySettingsActiveTab; pane.classList.toggle('active', active); pane.hidden = !active; });
		for (const id of ['lobbySettingsApply', 'lobbySettingsReset', 'lobbySettingsClassic', 'lobbyPresetSave', 'lobbyPresetLoad', 'lobbyPresetDelete', 'lobbyPresetExport', 'lobbyPresetImport', 'lobbyPasswordApply']) { const button = document.getElementById(id); if (button) button.disabled = lobbySettingsPending || (id === 'lobbySettingsApply' && !lobbySettingsDirty); }
		renderLobbyLocalPresetOptions();
	} else if (readOnly) {
		const activation = canonical.apocalypseActivation;
		const activationTiming = `${activation.policyMode} · ${activation.scheduleMode} · ${activation.trigger} · ${t('lobbyActivationFromRound')} ${activation.firstRound}${activation.intervalRounds == null ? '' : ` · ${t('lobbyActivationEvery')} ${activation.intervalRounds}`}`;
		const activationSummary = activation.effectsEnabled ? activationTiming : `${t('lobbyActivationEffectsOffSummary')} · ${activationTiming}`;
		const rows = [[t('lobbyPreset'), lobbyPresetLabel(canonical.preset)], [t('apocalypse'), canonical.apocalypseEnabled ? `${canonical.apocalypseSelectionMode} · ${canonical.allowedApocalypseCategoryCount} categories · ${canonical.apocalypseCustomPoolCount} pool · ${canonical.interactiveApocalypseChancePercent}%` : t('lobbyOff')], [t('lobbyActivationTitle'), activationSummary], [t('lobbyBunkerCapacityMode'), lobbyCapacityLabel(canonical)], [t('lobbySummaryThreats'), canonical.threatsEnabled ? `${canonical.interactiveThreatRate}, ${t('lobbyFromRound')} ${canonical.firstThreatRound}` : t('lobbyOff')], [t('lobbySummaryTimer'), canonical.roundTimerEnabled ? `${canonical.roundTimerDurationSeconds / 60} min` : t('lobbyOff')], [t('lobbySummaryVoting'), canonical.votingEnabled ? `${t('lobbyFromRound')} ${canonical.votingStartRound}` : t('lobbyOff')], [t('lobbySpecialCardsCount'), canonical.specialCardsEnabled ? canonical.specialCardsPerPlayer : 0]];
		readOnly.innerHTML = rows.map(([label, value]) => `<article><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></article>`).join('');
	}
	const events = lobbyGet(state, 'recentEvents', 'RecentEvents') || []; const audit = document.getElementById('lobbyAuditEvents');
	if (audit) audit.innerHTML = events.length ? events.map(event => `<div class="lobby-audit-event"><time>${escapeHtml(new Date(lobbyGet(event, 'occurredAtUtc', 'OccurredAtUtc')).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))}</time><span>${escapeHtml(lobbyAuditLabel(lobbyGet(event, 'actionType', 'ActionType')))}</span></div>`).join('') : `<p>${escapeHtml(t('lobbyNoAudit'))}</p>`;
}

function updateLobbySettingsDraft(control) {
	if (!lobbySettingsDraft || !control?.dataset?.setting) return;
	const key = control.dataset.setting;
	if (key === 'preset') { loadLobbyServerPreset(control.value); return; }
	let value = control.type === 'checkbox' ? control.checked : control.value;
	if (lobbySettingNumberKeys.has(key)) value = value === '' && lobbySettingNullableNumberKeys.has(key) ? null : Number(value);
	lobbySettingsDraft[key] = value;
	if (key === 'specialCardsPerPlayer') lobbySettingsDraft.specialCardsEnabled = Number(value) > 0;
	lobbySettingsDraft.preset = 'Custom'; lobbySettingsDirty = true; setLobbySettingsFeedback(''); renderLobbyGameSetup();
}

async function loadLobbyServerPreset(preset) {
	if (lobbySettingsPending || preset === 'Custom') return;
	lobbySettingsPending = true; renderLobbyGameSetup();
	try { lobbySettingsDraft = normalizeLobbySettings(await connection.invoke('GetLobbyGamePreset', preset)); lobbySettingsDirty = true; setLobbySettingsFeedback('lobbyPresetLoaded'); }
	catch (_) { setLobbySettingsFeedback('lobbySettingsInvalid', true); }
	finally { lobbySettingsPending = false; renderLobbyGameSetup(); }
}

function lobbySettingsHubPayload(settings) {
	const enumValue = (value, values) => Math.max(0, values.indexOf(value));
	return {
		...settings,
		preset: enumValue(settings.preset, ['Classic', 'Calm', 'Dangerous', 'Hardcore', 'Quick', 'Long', 'Custom']),
		readyRequirement: enumValue(settings.readyRequirement, ['AllPlayers', 'HostDecision']),
		bunkerCapacityMode: enumValue(settings.bunkerCapacityMode, ['Automatic', 'Manual', 'RandomRange']),
		apocalypseSelectionMode: enumValue(settings.apocalypseSelectionMode, ['RandomAll', 'RandomCategories', 'Specific', 'CustomPool']),
		apocalypseActivation: {
			...settings.apocalypseActivation,
			policyMode: enumValue(settings.apocalypseActivation.policyMode, ['DefinitionDefault', 'Custom']),
			scheduleMode: enumValue(settings.apocalypseActivation.scheduleMode, ['Once', 'Recurring']),
			trigger: enumValue(settings.apocalypseActivation.trigger, ['GameStart', 'AfterVoting', 'AfterRound'])
		},
		interactiveThreatRate: enumValue(settings.interactiveThreatRate, ['Off', 'Rare', 'Standard', 'Often', 'Always']),
		threatFrequency: enumValue(settings.threatFrequency, ['OncePerGame', 'EveryOtherRound', 'EveryRound', 'RandomEligibleRounds']),
		votingFrequency: enumValue(settings.votingFrequency, ['EveryRound', 'EveryTwoRounds']), characterGenerationMode: 0,
		scenarioSchedule: {
			enabled: settings.scenarioEnabled,
			firstScenarioAfterRound: settings.scenarioFirstAfterRound,
			intervalRounds: settings.scenarioIntervalRounds,
			triggerPhase: settings.scenarioTriggerPhase,
			enabledTypes: ['threat', 'event', 'secret_event'].filter(type => settings[type === 'threat' ? 'scenarioThreatEnabled' : type === 'event' ? 'scenarioEventEnabled' : 'scenarioSecretEventEnabled'])
		},
		bunkerIntelMode: enumValue(settings.bunkerIntelMode, ['AllVisible', 'Progressive', 'EventsOnly'])
	};
}

async function applyLobbySettings() {
	if (!lobbySettingsDraft || !lobbySettingsDirty || lobbySettingsPending) return;
	lobbySettingsPending = true; renderLobbyGameSetup();
	try {
		const result = await connection.invoke('ApplyLobbyGameSettings', { expectedRevision:lobbySettingsBaseRevision, commandId:crypto.randomUUID(), settings:lobbySettingsHubPayload(lobbySettingsDraft) });
		if (!(result?.success ?? result?.Success)) {
			const code = result?.errorCode ?? result?.ErrorCode; setLobbySettingsFeedback(code === 'settings_revision_conflict' ? 'lobbySettingsConflict' : 'lobbySettingsInvalid', true);
			lobbySettingsDraft = normalizeLobbySettings(result?.settings ?? result?.Settings); lobbySettingsBaseRevision = Number(result?.settingsRevision ?? result?.SettingsRevision ?? lobbySettingsBaseRevision); lobbySettingsDirty = false;
		} else { lobbySettingsDirty = false; lobbyApocalypseCatalog = null; setLobbySettingsFeedback('lobbySettingsApplied'); if (lobbySettingsActiveTab === 'apocalypse') ensureLobbyApocalypseCatalog(); }
	} catch (_) { setLobbySettingsFeedback('lobbySettingsInvalid', true); }
	finally { lobbySettingsPending = false; renderLobbyGameSetup(); }
}

function readLobbyLocalPresets() { try { const value = JSON.parse(localStorage.getItem(lobbyLocalPresetStorageKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } }

function writeLobbyLocalPresets(value) { localStorage.setItem(lobbyLocalPresetStorageKey, JSON.stringify(value)); }

function renderLobbyLocalPresetOptions() { const select = document.getElementById('lobbyLocalPresetSelect'); if (!select) return; const value = select.value; const presets = readLobbyLocalPresets(); select.innerHTML = Object.keys(presets).sort().map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join(''); if (presets[value]) select.value = value; }

function saveLobbyLocalPreset() { const input = document.getElementById('lobbyLocalPresetName'); const name = String(input?.value || '').trim().slice(0, 40); if (!name || !lobbySettingsDraft) return setLobbySettingsFeedback('lobbySettingsInvalid', true); const presets = readLobbyLocalPresets(); presets[name] = { version:1, settings:normalizeLobbySettings(lobbySettingsDraft) }; writeLobbyLocalPresets(presets); renderLobbyLocalPresetOptions(); setLobbySettingsFeedback('lobbyPresetSaved'); }

function loadLobbyLocalPreset() { const name = document.getElementById('lobbyLocalPresetSelect')?.value; const entry = readLobbyLocalPresets()[name]; if (!entry || entry.version !== 1) return setLobbySettingsFeedback('lobbyPresetImportError', true); lobbySettingsDraft = normalizeLobbySettings(entry.settings); lobbySettingsDraft.preset = 'Custom'; lobbySettingsDirty = true; setLobbySettingsFeedback('lobbyPresetLoaded'); renderLobbyGameSetup(); }

function deleteLobbyLocalPreset() { const name = document.getElementById('lobbyLocalPresetSelect')?.value; if (!name) return; const presets = readLobbyLocalPresets(); delete presets[name]; writeLobbyLocalPresets(presets); renderLobbyLocalPresetOptions(); setLobbySettingsFeedback('lobbyPresetDeleted'); }

function exportLobbyPreset() { if (!lobbySettingsDraft) return; const name = String(document.getElementById('lobbyLocalPresetName')?.value || 'bunker-preset').trim() || 'bunker-preset'; const data = { schema:'bunker-room-game-settings', version:1, name, settings:normalizeLobbySettings(lobbySettingsDraft) }; const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^a-z0-9_-]+/gi, '-')}.json`; link.click(); URL.revokeObjectURL(url); }

async function importLobbyPresetFile(file) { try { const data = JSON.parse(await file.text()); if (data?.schema !== 'bunker-room-game-settings' || data?.version !== 1 || ![1, 2, 3, 4].includes(Number(data?.settings?.version))) throw new Error('version'); lobbySettingsDraft = normalizeLobbySettings(data.settings); lobbySettingsDraft.version = 4; lobbySettingsDraft.preset = 'Custom'; lobbySettingsDirty = true; setLobbySettingsFeedback('lobbyPresetImportOk'); renderLobbyGameSetup(); } catch (_) { setLobbySettingsFeedback('lobbyPresetImportError', true); } }

async function updateLobbyPassword() { if (lobbySettingsPending) return; lobbySettingsPending = true; renderLobbyGameSetup(); try { await connection.invoke('SetLobbyPassword', document.getElementById('lobbyPasswordInput')?.value || null, crypto.randomUUID()); document.getElementById('lobbyPasswordInput').value = ''; setLobbySettingsFeedback('lobbyPasswordUpdated'); } catch (_) { setLobbySettingsFeedback('lobbySettingsInvalid', true); } finally { lobbySettingsPending = false; renderLobbyGameSetup(); } }

async function resetLobbyMemberReady(playerId) { if (lobbyCommandPending) return; lobbyCommandPending = true; try { await connection.invoke('ResetLobbyReady', playerId, crypto.randomUUID()); } finally { lobbyCommandPending = false; } }

async function kickLobbyMember(playerId) { if (lobbyCommandPending || !confirm(t('lobbyKickMember') + '?')) return; lobbyCommandPending = true; try { await connection.invoke('KickLobbyPlayer', playerId, crypto.randomUUID()); } finally { lobbyCommandPending = false; } }

function bindLobbySettingsControls() {
	const setup = document.getElementById('lobbyGameSetup'); if (!setup || setup.dataset.bound === 'true') return; setup.dataset.bound = 'true';
	setup.onclick = event => {
		const header = event.target.closest('[data-apocalypse-category-toggle]'); if (!header) return;
		const id = header.dataset.apocalypseCategoryToggle;
		lobbyApocalypseCollapsedCategoryIds.has(id) ? lobbyApocalypseCollapsedCategoryIds.delete(id) : lobbyApocalypseCollapsedCategoryIds.add(id);
		renderLobbyApocalypseEditor(lobbySettingsDraft);
	};
	setup.addEventListener('input', event => { if (event.target.id === 'lobbyApocalypseSearch') { lobbyApocalypseSearch = event.target.value; lobbyApocalypseVisibleCount = 30; renderLobbyApocalypseEditor(lobbySettingsDraft); return; } if (event.target.matches('.lobby-setting-input') && event.target.tagName === 'INPUT' && event.target.type !== 'checkbox') updateLobbySettingsDraft(event.target); });
	setup.addEventListener('change', event => { if (event.target.id === 'lobbyApocalypseCategoryFilter') { lobbyApocalypseCategoryFilter = event.target.value; lobbyApocalypseVisibleCount = 30; renderLobbyApocalypseEditor(lobbySettingsDraft); return; } if (event.target.id === 'lobbyApocalypseInteractiveFilter') { lobbyApocalypseInteractiveFilter = event.target.value; renderLobbyApocalypseEditor(lobbySettingsDraft); return; } if (event.target.matches('[data-activation-setting]')) { updateLobbyActivationDraft(event.target); return; } if (event.target.matches('.lobby-setting-input')) updateLobbySettingsDraft(event.target); if (event.target.id === 'lobbyPresetFile' && event.target.files?.[0]) { importLobbyPresetFile(event.target.files[0]); event.target.value = ''; } });
	setup.addEventListener('click', event => { const tab = event.target.closest('[data-settings-tab]'); if (tab) { lobbySettingsActiveTab = tab.dataset.settingsTab; if (lobbySettingsActiveTab === 'apocalypse') ensureLobbyApocalypseCatalog(); renderLobbyGameSetup(); return; } const apocalypseAction = event.target.closest('[data-apocalypse-action]'); if (apocalypseAction && lobbySettingsDraft) { const id = apocalypseAction.dataset.id; const action = apocalypseAction.dataset.apocalypseAction; if (action === 'toggle-category') lobbySettingsDraft.allowedApocalypseCategoryIds = lobbySettingsDraft.allowedApocalypseCategoryIds.includes(id) ? lobbySettingsDraft.allowedApocalypseCategoryIds.filter(value => value !== id) : [...lobbySettingsDraft.allowedApocalypseCategoryIds, id]; if (action === 'select-specific') lobbySettingsDraft.selectedApocalypseId = id; if (action === 'toggle-pool') lobbySettingsDraft.apocalypseCustomPoolIds = lobbySettingsDraft.apocalypseCustomPoolIds.includes(id) ? lobbySettingsDraft.apocalypseCustomPoolIds.filter(value => value !== id) : [...lobbySettingsDraft.apocalypseCustomPoolIds, id]; if (action === 'all-categories') lobbySettingsDraft.allowedApocalypseCategoryIds = (lobbyGet(lobbyApocalypseCatalog, 'categories', 'Categories') || []).map(item => lobbyGet(item, 'id', 'Id')); if (action === 'clear-categories') lobbySettingsDraft.allowedApocalypseCategoryIds = []; if (action === 'clear-pool') lobbySettingsDraft.apocalypseCustomPoolIds = []; if (action === 'load-more') { lobbyApocalypseVisibleCount += 30; renderLobbyApocalypseEditor(lobbySettingsDraft); return; } markLobbyApocalypseDraftChanged(); return; } const actions = { lobbySettingsApply: applyLobbySettings, lobbySettingsReset: () => { lobbySettingsDraft = normalizeLobbySettings(lobbyGet(lobbyState, 'settings', 'Settings')); lobbySettingsDirty = false; setLobbySettingsFeedback(''); renderLobbyGameSetup(); }, lobbySettingsClassic: () => loadLobbyServerPreset('Classic'), lobbyPresetSave: saveLobbyLocalPreset, lobbyPresetLoad: loadLobbyLocalPreset, lobbyPresetDelete: deleteLobbyLocalPreset, lobbyPresetExport: exportLobbyPreset, lobbyPresetImport: () => document.getElementById('lobbyPresetFile')?.click(), lobbyPasswordApply: updateLobbyPassword }; const action = actions[event.target.closest('button')?.id]; if (action) action(); });
}

function isLobbyRunning() {
	const lifecycle = lobbyGet(lobbyState, 'lifecycle', 'Lifecycle');
	const roomState = currentRoom?.state || currentRoom?.State;
	return lifecycle === 'Running' || roomState === 'Playing' || roomState === 'Started' || roomState === 'Voting';
}

function tryRenderRunningGameState() {
	if (!isLobbyRunning()) return false;

	if (currentRoom && (currentRoom.state === 'Lobby' || currentRoom.State === 'Lobby')) {
		currentRoom.state = 'Playing';
	}

	renderLobbyState();
	renderCurrentGameUI();
	return true;
}

function localizeLobbyLifecycle(value) { return t({ Lobby: 'lobbyLifecycleLobby', Running: 'lobbyLifecycleRunning', Finished: 'lobbyLifecycleFinished' }[value] || 'lobbyLifecycleLobby'); }

function localizeLobbyRole(value) { return t({ HostPlayer: 'lobbyRoleHostPlayer', Player: 'lobbyRolePlayer', Spectator: 'lobbyRoleSpectator', TechnicalGm: 'lobbyRoleTechnicalGm', OmniscientGm: 'lobbyRoleOmniscientGm' }[value] || 'lobbyRolePlayer'); }

function lobbyRoleHelp(value) { return t(value === 'Spectator' ? 'lobbyRoleSpectatorHelp' : value === 'TechnicalGm' ? 'lobbyRoleTechnicalHelp' : value === 'OmniscientGm' ? 'lobbyRoleOmniscientHelp' : 'lobbyRolePlayerHelp'); }

function localizeLobbyBlocker(code) {
	const key = { minimum_gameplay_players: 'lobbyBlockMinimum', maximum_gameplay_players: 'lobbyWarningPlayers', connected_members_not_ready: 'lobbyBlockReady', invalid_lobby_role: 'lobbyBlockRole', active_voting: 'lobbyBlockVoting', active_threat: 'lobbyBlockThreat', not_current_host: 'lobbyBlockHost', host_missing: 'lobbyBlockHost', bunker_capacity_exceeds_players: 'lobbyWarningCapacity', settings_revision_conflict: 'lobbySettingsConflict' }[code];
	return t(key || 'lobbyBlockFallback');
}

function renderLobbyPreviewSummary(failed = false) {
	const output = document.getElementById('lobbyStartPreview'); if (!output) return;
	if (failed) { output.textContent = t('lobbyBlockFallback'); return; }
	if (!lobbyStartPreview) { output.textContent = ''; return; }
	const status = lobbyStartPreview.canStart ? t('lobbyPreviewReady') : t('lobbyPreviewBlocked');
	const guestCount = Number(lobbyStartPreview.guestGameplayPlayerCount ?? lobbyStartPreview.GuestGameplayPlayerCount ?? 0);
	const warning = guestCount > 0
		? `<div class="lobby-guest-warning"><strong>${escapeHtml(t('lobbyGuestCount').replace('{count}', String(guestCount)))}</strong><p>${escapeHtml(t('lobbyGuestRisk'))}</p></div>`
		: '';
	output.innerHTML = `<span>${escapeHtml(status)}</span>${warning}`;
}

function isGuestGameplayLobbyMember(member) {
	return Boolean(member &&
		lobbyGet(member, 'isGameplayParticipant', 'IsGameplayParticipant') &&
		!lobbyGet(member, 'isAccountBound', 'IsAccountBound') &&
		!lobbyGet(member, 'isSpectator', 'IsSpectator') &&
		!lobbyGet(member, 'isTechnicalGm', 'IsTechnicalGm') &&
		!lobbyGet(member, 'isOmniscientGm', 'IsOmniscientGm'));
}

function guestWarningStorageKey(roomCode, playerId, revision) {
	return `bunker:guest-warning:${roomCode}:${playerId}:${revision}`;
}

function showGuestWarningIfEligible(revision) {
	const members = lobbyGet(lobbyState, 'members', 'Members') || [];
	const playerId = getMyStablePlayerId();
	const member = members.find(item => lobbyGet(item, 'playerId', 'PlayerId') === playerId);
	const roomCode = currentRoom?.id || currentRoom?.Id || '';
	const numericRevision = Number(revision);
	if (!isGuestGameplayLobbyMember(member) || !roomCode || !playerId || !Number.isSafeInteger(numericRevision) || numericRevision < 1) return false;
	const key = guestWarningStorageKey(roomCode, playerId, numericRevision);
	if (localStorage.getItem(key) === 'acknowledged') return false;
	pendingGuestWarningStorageKey = key;
	const modal = document.getElementById('guestAccountWarningModal');
	if (!modal) return false;
	modal.hidden = false;
	document.getElementById('guestWarningContinueButton')?.focus();
	return true;
}

function hideGuestWarningModal(acknowledge = true) {
	if (acknowledge && pendingGuestWarningStorageKey) {
		localStorage.setItem(pendingGuestWarningStorageKey, 'acknowledged');
	}
	pendingGuestWarningStorageKey = '';
	const modal = document.getElementById('guestAccountWarningModal');
	if (modal) modal.hidden = true;
}

function continueAsGuest() {
	hideGuestWarningModal(true);
}

function registerFromGuestWarning() {
	window.open('/account/register', '_blank', 'noopener');
	hideGuestWarningModal(true);
}

function handleGuestWarningKeydown(event) {
	if (event.key === 'Escape') {
		event.preventDefault();
		hideGuestWarningModal(true);
		return;
	}
	if (event.key !== 'Tab') return;
	const modal = document.getElementById('guestAccountWarningModal');
	const controls = [...(modal?.querySelectorAll('button:not([disabled])') || [])];
	if (!controls.length) return;
	const first = controls[0];
	const last = controls[controls.length - 1];
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

function renderLobbyState() {
	const state = lobbyState; if (!state) return;
	document.querySelectorAll('[data-lobby-i18n]').forEach(element => { element.textContent = t(element.dataset.lobbyI18n); });
	document.querySelectorAll('[data-lobby-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.lobbyI18nPlaceholder); });
	const lifecycle = lobbyGet(state, 'lifecycle', 'Lifecycle') || 'Lobby';
	const members = lobbyGet(state, 'members', 'Members') || []; const connectedCount = lobbyGet(state, 'totalConnectedMembers', 'TotalConnectedMembers') || 0;
	const readyCount = lobbyGet(state, 'readyCount', 'ReadyCount') || 0; const readyRequiredCount = lobbyGet(state, 'readyRequiredCount', 'ReadyRequiredCount') || 0; const gameplayCount = lobbyGet(state, 'gameplayPlayerCount', 'GameplayPlayerCount') || 0;
	const meId = getMyStablePlayerId(); const me = members.find(member => lobbyGet(member, 'playerId', 'PlayerId') === meId);
	isHost = Boolean(lobbyGet(me, 'isCurrentHost', 'IsCurrentHost'));
	const canManageLobby = isHost || isDeveloper;
	const focusedKey = document.activeElement?.dataset?.lobbyFocus || null;
	const summary = document.getElementById('lobbySummary');
	const countSeparator = getCurrentLanguage() === 'en' ? 'of' : getCurrentLanguage() === 'ru' ? 'из' : 'із';
	if (summary) summary.innerHTML = [
		[t('lobbyActivePlayers'), gameplayCount], [t('lobbySpectators'), lobbyGet(state, 'spectatorCount', 'SpectatorCount') || 0],
		[t('lobbyReadySummary'), `${readyCount} ${countSeparator} ${readyRequiredCount}`, 'lobby-summary-ready-legacy']
	].map(([label, value, className = '']) => `<article class="lobby-summary-card ${className}"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></article>`).join('');
	const list = document.getElementById('lobbyMembers');
	if (list) list.innerHTML = members.map(member => {
		const id = lobbyGet(member, 'playerId', 'PlayerId'); const role = lobbyGet(member, 'role', 'Role'); const host = lobbyGet(member, 'isCurrentHost', 'IsCurrentHost');
		const developer = !!lobbyGet(member, 'isDeveloper', 'IsDeveloper');
		const ready = lobbyGet(member, 'isReady', 'IsReady'); const connected = lobbyGet(member, 'isConnected', 'IsConnected'); const self = id === meId; const gameplay = lobbyGet(member, 'isGameplayParticipant', 'IsGameplayParticipant');
		const gmRole = lobbyGet(member, 'isTechnicalGm', 'IsTechnicalGm') || lobbyGet(member, 'isOmniscientGm', 'IsOmniscientGm');
		const displayName = String(lobbyGet(member, 'displayName', 'DisplayName') || '');
		const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || '?';
		return `<article class="lobby-member-card ${ready ? 'is-ready' : ''} ${connected ? '' : 'is-offline'} ${role === 'Spectator' ? 'is-spectator' : ''}" data-player-id="${escapeHtml(String(id))}">
                <header class="lobby-member-header">
					<div class="lobby-member-identity"><span class="lobby-member-avatar" aria-hidden="true">${escapeHtml(initials)}</span><div class="lobby-member-name"><strong>${escapeHtml(displayName)}</strong><div class="lobby-badges"><span class="lobby-role-badge">${escapeHtml(localizeLobbyRole(role))}</span>${host ? `<span class="lobby-host-badge">${t('lobbyHostBadge')}</span>` : ''}${developer ? `<span class="player-role-developer" title="${escapeHtml(t('developerBadgeTitle'))}" aria-label="${escapeHtml(t('developerBadgeTitle'))}">DEVELOPER</span>` : ''}</div></div></div>
                    <div class="lobby-member-state"><span class="lobby-connection-state"><span class="lobby-connection-indicator ${connected ? 'online' : 'offline'}" aria-hidden="true"></span>${connected ? t('lobbyConnected') : t('lobbyDisconnected')}</span><span class="${ready ? 'lobby-ready-status' : 'lobby-not-ready-status'}">${ready ? t('lobbyReady') : t('lobbyNotReady')}</span></div>
                </header>
                ${self && gameplay ? `<button id="lobbyReadyButton" type="button" class="btn-success lobby-self-ready lobby-command" data-lobby-focus="ready-${escapeHtml(String(id))}" onclick="toggleLobbyReady()" ${lobbyCommandPending || lifecycle !== 'Lobby' ? 'disabled' : ''}>${ready ? t('lobbyCancelReady') : t('lobbyIAmReady')}</button>` : ''}
                ${isHost && lifecycle === 'Lobby' && !gmRole ? `<div class="lobby-host-controls"><div class="lobby-role-control"><span>${t('lobbyRoleLabel')}</span><span class="characteristic-with-tooltip"><button type="button" class="tooltip-trigger" aria-label="${escapeHtml(lobbyRoleHelp(role))}">?</button><span class="tooltip-content">${escapeHtml(lobbyRoleHelp(role))}</span></span></div><div class="lobby-segmented"><button class="lobby-command ${role === 'Player' || role === 'HostPlayer' ? 'active' : ''}" data-lobby-focus="player-${escapeHtml(String(id))}" onclick="setLobbyParticipation('${escapeHtml(String(id))}', false)">${t('lobbyRolePlayer')}</button><button class="lobby-command ${role === 'Spectator' ? 'active' : ''}" data-lobby-focus="spectator-${escapeHtml(String(id))}" onclick="setLobbyParticipation('${escapeHtml(String(id))}', true)">${t('lobbyRoleSpectator')}</button></div>${!host ? `<details class="lobby-player-menu"><summary aria-label="${escapeHtml(t('lobbyRoleLabel'))}">⋯</summary><div class="lobby-player-menu-panel"><button class="btn-secondary lobby-command" data-lobby-focus="reset-${escapeHtml(String(id))}" onclick="resetLobbyMemberReady('${escapeHtml(String(id))}')">${t('lobbyResetMemberReady')}</button><button class="btn-danger lobby-command" data-lobby-focus="kick-${escapeHtml(String(id))}" onclick="kickLobbyMember('${escapeHtml(String(id))}')">${t('lobbyKickMember')}</button><button class="btn-secondary lobby-transfer-host lobby-command" data-lobby-focus="host-${escapeHtml(String(id))}" onclick="transferLobbyHost('${escapeHtml(String(id))}')">${t('lobbyTransferHost')}</button></div></details>` : ''}</div>` : ''}
            </article>`;
	}).join('');
	if (focusedKey) [...document.querySelectorAll('[data-lobby-focus]')].find(element => element.dataset.lobbyFocus === focusedKey)?.focus({ preventScroll: true });
	window.reinitTooltips?.();
	const blockers = lobbyGet(state, 'blockers', 'Blockers') || []; const blockersEl = document.getElementById('lobbyBlockers');
	const waitingMembers = members.filter(member => lobbyGet(member, 'isGameplayParticipant', 'IsGameplayParticipant') && !lobbyGet(member, 'isReady', 'IsReady'));
	const waitingNames = waitingMembers.map(member => String(lobbyGet(member, 'displayName', 'DisplayName') || '')).filter(Boolean);
	const allReady = readyRequiredCount > 0 && readyCount >= readyRequiredCount && waitingMembers.length === 0;
	const validationBlockers = blockers.filter(blocker => blocker !== 'connected_members_not_ready');
	if (blockersEl) {
		const readinessMessage = allReady ? t('lobbyPreviewReady') : `${t('lobbyBlockReady')}${waitingNames.length ? `: ${waitingNames.join(', ')}` : ''}`;
		blockersEl.innerHTML = `<div class="lobby-waiting-row ${allReady ? 'is-ready' : ''}"><span aria-hidden="true">${allReady ? '✓' : '…'}</span><p>${escapeHtml(readinessMessage)}</p></div>${validationBlockers.map(blocker => `<div class="lobby-blocker-row"><span aria-hidden="true">!</span><p>${escapeHtml(localizeLobbyBlocker(blocker))}</p></div>`).join('')}`;
	}
	const readyProgress = document.getElementById('lobbyReadyProgress'); if (readyProgress) readyProgress.textContent = `${t('lobbyReadyProgress')}: ${readyCount} ${countSeparator} ${readyRequiredCount}`;
	const gameplayProgress = document.getElementById('lobbyGameplayProgress'); if (gameplayProgress) gameplayProgress.textContent = allReady ? t('lobbyPreviewReady') : t('lobbyHint');
	const readyMeter = document.getElementById('lobbyReadyMeter'); if (readyMeter) { readyMeter.max = Math.max(readyRequiredCount, 1); readyMeter.value = Math.min(readyCount, readyMeter.max); }
	const startSection = document.getElementById('lobbyStartSection'); if (startSection) startSection.classList.toggle('is-ready', allReady);
	const roomCode = document.getElementById('lobbyRoomCode'); if (roomCode) roomCode.textContent = `${t('lobbyRoomCode')}: ${currentRoom?.id || currentRoom?.Id || '—'}`;
	const capacity = document.getElementById('lobbyMemberCapacity'); if (capacity) capacity.textContent = `${t('lobbyParticipants')}: ${gameplayCount}`;
	const previewButton = document.getElementById('lobbyStartPreviewButton'); if (previewButton) { previewButton.style.display = canManageLobby && lifecycle === 'Lobby' ? '' : 'none'; previewButton.disabled = lobbyCommandPending; }
	const canApplyStart = !!lobbyStartPreview?.canStart && !!lobbyGet(state, 'canStart', 'CanStart');
	['startGameBtn', 'lobbyStartPrimaryButton'].forEach(id => { const button = document.getElementById(id); if (!button) return; button.style.display = canManageLobby && lifecycle === 'Lobby' ? 'inline-flex' : 'none'; button.disabled = lobbyCommandPending || !canApplyStart; button.style.pointerEvents = button.disabled ? 'none' : 'auto'; button.textContent = t('startGame'); });
	const copy = document.getElementById('copyInviteLinkBtn'); if (copy && lifecycle === 'Lobby') copy.textContent = t('lobbyCopyLink');
	const gm = document.getElementById('gmPanelBtn'); if (gm && lifecycle === 'Lobby') gm.textContent = t('lobbyGmPanel');
	const leave = document.querySelector('#roomSection .room-actions .btn-danger'); if (leave && lifecycle === 'Lobby') leave.textContent = t('lobbyLeave');
	document.getElementById('roomPlayersList').style.display = lifecycle === 'Lobby' ? 'none' : '';
	const waiting = document.getElementById('waitingText'); if (waiting) waiting.style.display = 'none';
	const roomLobby = document.getElementById('roomLobby'); const game = document.getElementById('gameSection'); const mine = document.getElementById('myPlayerSection');
	if (lifecycle === 'Lobby') { if (roomLobby) roomLobby.style.display = 'block'; if (game) game.style.display = 'none'; if (mine) mine.style.display = 'none'; }
	else if (lifecycle === 'Running') { if (roomLobby) roomLobby.style.display = 'none'; if (game) game.style.display = 'block'; if (mine) mine.style.display = lobbyGet(me, 'isGameplayParticipant', 'IsGameplayParticipant') ? 'block' : 'none'; }
	bindLobbySettingsControls(); renderLobbyGameSetup();
	renderLobbyPreviewSummary();
}
