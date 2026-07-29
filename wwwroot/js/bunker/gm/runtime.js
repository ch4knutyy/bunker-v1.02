// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function peekCharacteristic(charName) {
	var selectedId = document.getElementById('gmPlayerSelect').value;
	if (!selectedId) {
		alert(getCurrentLanguage() === 'en' ? 'Choose a player first' : getCurrentLanguage() === 'ru' ? 'Сначала выберите игрока' : 'Спочатку виберіть гравця');
		return;
	}

	// Locally reveal the value in GM panel immediately
	revealCharInGMPanel(charName);

	// Also call server to get full data
	connection.invoke("PeekCharacteristic", selectedId, charName)
		.catch(function (err) { console.error("PeekCharacteristic error:", err); });
}

function revealCharInGMPanel(charName) {
	const playerData = gmPlayersData[selectedPlayerForGM];
	if (!playerData) return;

	let value = t('unknown');
	let elementId = '';

	switch (charName) {
		case 'Personality':
			value = formatPersonality(playerData.personality || playerData.Personality);
			elementId = 'gmPersonality';
			break;
		case 'Body':
			value = formatBody(playerData.body || playerData.Body);
			elementId = 'gmBody';
			break;
		case 'Profession':
			value = getCharValue(playerData, 'profession', 'Profession') || t('unknown');
			elementId = 'gmProfession';
			break;
		case 'PhysicalHealth':
			value = getCharValue(playerData, 'physicalHealth', 'PhysicalHealth') || t('unknown');
			elementId = 'gmPhysicalHealth';
			break;
		case 'MentalHealth':
			value = getCharValue(playerData, 'mentalHealth', 'MentalHealth') || t('unknown');
			elementId = 'gmMentalHealth';
			break;
		case 'Hobby':
			value = getCharValue(playerData, 'hobby', 'Hobby') || t('unknown');
			elementId = 'gmHobby';
			break;
		case 'CharacterTrait':
			value = getCharValue(playerData, 'characterTrait', 'CharacterTrait') || t('unknown');
			elementId = 'gmCharacterTrait';
			break;
		case 'Phobia':
			value = getCharValue(playerData, 'phobia', 'Phobia') || t('unknown');
			elementId = 'gmPhobia';
			break;
		case 'Inventory':
			value = getCharValue(playerData, 'inventory', 'Inventory') || t('unknown');
			elementId = 'gmInventory';
			break;
		case 'Property':
			value = getCharValue(playerData, 'property', 'Property') || t('propertyUnavailable');
			elementId = 'gmProperty';
			break;
		case 'Fact':
			const fact = playerData.fact ?? playerData.Fact;
			value = fact ? (getLocalizedValue(fact, 'fact') || getLocalizedValue(fact, 'name') || fact.name || fact.Name || t('unknown')) : t('unknown');
			elementId = 'gmFact';
			break;
	}

	const el = document.getElementById(elementId);
	if (el) {
		el.textContent = value;
		el.classList.remove('gm-char-hidden');
		el.classList.add('gm-char-revealed');
	}

	// Track what's been revealed
	gmRevealedChars[charName] = true;
}

function showPeekModal(playerName, charKey, data, isAlreadyRevealed) {
	var statusText = isAlreadyRevealed ? '(вже розкрита для всіх)' : '(прихована від інших)';
	var content = '<div class="peek-info">' +
		'<p><strong>Гравець:</strong> ' + playerName + '</p>' +
		'<p><strong>' + data.label + ':</strong> ' + data.value + '</p>' +
		(data.tooltip ? '<p class="peek-tooltip"><em>' + data.tooltip + '</em></p>' : '') +
		'<p class="peek-status">' + statusText + '</p>' +
		'</div>';

	document.getElementById('peekModalContent').innerHTML = content;
	document.getElementById('peekModal').style.display = 'flex';
}

function closePeekModal() {
	document.getElementById('peekModal').style.display = 'none';
}

function setBunkerCapacityPending(pending) {
	bunkerCapacityPending = pending;
	const input = document.getElementById('gmBunkerCapacity');
	const button = document.getElementById('gmBunkerCapacitySubmit');
	if (input) input.disabled = pending;
	if (button) button.disabled = pending;
}

function submitBunkerCapacity() {
	if (bunkerCapacityPending) return;
	const input = document.getElementById('gmBunkerCapacity');
	const raw = input?.value?.trim() || '';
	const parsed = Number(raw);
	const feedback = document.getElementById('gmBunkerCapacityFeedback');
	if (!/^\d+$/.test(raw) || !Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
		if (input) input.value = currentBunkerCapacity;
		if (feedback) feedback.textContent = t('gmCapacityInvalid');
		return;
	}
	setBunkerCapacityPending(true);
	if (feedback) feedback.textContent = '';
	connection.invoke("SetBunkerCapacity", raw).catch(function (err) {
		console.error("SetBunkerCapacity error:", err);
		if (input) input.value = currentBunkerCapacity;
		if (feedback) feedback.textContent = localizeServerMessage(err?.message || t('gmCapacityInvalid'));
		setBunkerCapacityPending(false);
	});
}

function handleBunkerCapacityKeydown(event) {
	if (event.key === 'Enter') {
		event.preventDefault();
		submitBunkerCapacity();
	}
}

function regenerateBunker() {
	if (confirm(t('gmRegenerateBunkerConfirm'))) {
		connection.invoke("RegenerateBunker", gmPlayerCommandId())
			.catch(function (err) { console.error("RegenerateBunker error:", err); });
	}
}

function regenerateApocalypse() {
	if (confirm(t('gmRegenerateApocalypseConfirm'))) {
		connection.invoke("RegenerateApocalypse", gmPlayerCommandId())
			.catch(function (err) { console.error("RegenerateApocalypse error:", err); });
	}
}

function setOmniscientPending(pending) {
	omniscientCommandPending = pending;
	document.querySelectorAll('.omniscient-command').forEach(button => button.disabled = pending || (button.id === 'omniscientEnterButton' && !omniscientPreview?.canApply && !omniscientPreview?.CanApply));
}

async function previewEnterOmniscientGm() {
	if (omniscientCommandPending) return; setOmniscientPending(true); const output = document.getElementById('omniscientPreviewResult');
	try { const key = document.getElementById('omniscientBootstrapKey')?.value || ''; omniscientPreview = await connection.invoke('PreviewEnterOmniscientGm', key); if (output) output.textContent = JSON.stringify(omniscientPreview, null, 2); }
	catch (error) { omniscientPreview = null; if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setOmniscientPending(false); }
}

async function enterOmniscientGm() {
	if (omniscientCommandPending || !(omniscientPreview?.canApply ?? omniscientPreview?.CanApply) || !confirm('Enter spectator GM mode?') || !confirm('This cannot be undone in this room. Confirm again.')) return;
	setOmniscientPending(true); const output = document.getElementById('omniscientPreviewResult');
	try { const key = document.getElementById('omniscientBootstrapKey')?.value || ''; await connection.invoke('EnterOmniscientGm', key, crypto.randomUUID(), true); omniscientPreview = null; if (output) output.textContent = t('omniscientPublicBadge'); }
	catch (error) { if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setOmniscientPending(false); }
}

function clearOmniscientHiddenState() {
	omniscientHiddenState = null;
	omniscientHiddenStateVersion = 0;
	directorPreview = null;
	directorCommandPending = false;
	const tab = document.getElementById('omniscientHiddenTab');
	const section = document.getElementById('omniscientHiddenSection');
	if (tab) tab.style.display = 'none';
	if (section) section.style.display = 'none';
	['omniscientRoomSummary', 'omniscientSecretVotes', 'omniscientHiddenPlayers'].forEach(id => { const element = document.getElementById(id); if (element) element.replaceChildren(); });
}

async function resyncOmniscientHiddenState() {
	const status = document.getElementById('omniscientHiddenStatus');
	if (status) status.textContent = t('omniscientHiddenPending');
	try { await connection.invoke('ResyncOmniscientState'); }
	catch (_) { clearOmniscientHiddenState(); if (status) status.textContent = t('omniscientHiddenError'); }
}

function buildDirectorRequest() {
	return {
		actionType: document.getElementById('directorAction')?.value || '',
		targetPlayerId: document.getElementById('directorTargetPlayer')?.value || null,
		category: document.getElementById('directorCategory')?.value || null,
		option: document.getElementById('directorOption')?.value || null
	};
}

function syncDirectorControls() {
	directorPreview = null; const apply = document.getElementById('directorApplyButton'); if (apply) apply.disabled = true;
	const labels = {
		uk: { reveal: 'Розкрити характеристику', hide: 'Приховати характеристику', reveal_all: 'Розкрити все', hide_all: 'Приховати все', eliminate: 'Елімінувати', restore: 'Відновити', condition_severity: 'Змінити тяжкість стану', condition_remove: 'Видалити стан', pause: 'Пауза', resume: 'Продовжити', round_forward: 'Раунд уперед', reset_readiness: 'Скинути готовність', clear_votes: 'Очистити голоси', remove_vote: 'Видалити голос', voting_resync: 'Синхронізувати голосування', threat_force_success: 'Force success загрози', threat_force_failure: 'Force failure загрози', threat_cancel: 'Скасувати загрозу', threat_restart: 'Перезапустити загрозу', threat_resync: 'Синхронізувати загрозу' },
		en: { reveal: 'Reveal characteristic', hide: 'Hide characteristic', reveal_all: 'Reveal all', hide_all: 'Hide all', eliminate: 'Eliminate', restore: 'Restore', condition_severity: 'Change condition severity', condition_remove: 'Remove condition', pause: 'Pause', resume: 'Resume', round_forward: 'Forward round', reset_readiness: 'Reset readiness', clear_votes: 'Clear votes', remove_vote: 'Remove vote', voting_resync: 'Voting resync', threat_force_success: 'Force threat success', threat_force_failure: 'Force threat failure', threat_cancel: 'Cancel threat', threat_restart: 'Restart threat', threat_resync: 'Threat resync' },
		ru: { reveal: 'Раскрыть характеристику', hide: 'Скрыть характеристику', reveal_all: 'Раскрыть всё', hide_all: 'Скрыть всё', eliminate: 'Исключить', restore: 'Восстановить', condition_severity: 'Изменить тяжесть состояния', condition_remove: 'Удалить состояние', pause: 'Пауза', resume: 'Продолжить', round_forward: 'Раунд вперёд', reset_readiness: 'Сбросить готовность', clear_votes: 'Очистить голоса', remove_vote: 'Удалить голос', voting_resync: 'Синхронизировать голосование', threat_force_success: 'Force success угрозы', threat_force_failure: 'Force failure угрозы', threat_cancel: 'Отменить угрозу', threat_restart: 'Перезапустить угрозу', threat_resync: 'Синхронизировать угрозу' }
	}[getCurrentLanguage()] || {};
	document.querySelectorAll('#directorAction option').forEach(option => { if (labels[option.value]) option.textContent = labels[option.value]; });
	const action = document.getElementById('directorAction')?.value || '';
	const category = document.getElementById('directorCategory');
	if (category) {
		const previous = category.value;
		if (action === 'condition_severity' || action === 'condition_remove') {
			const get = (object, camel, pascal) => object?.[camel] ?? object?.[pascal];
			const targetId = document.getElementById('directorTargetPlayer')?.value;
			const player = (get(omniscientHiddenState, 'players', 'Players') || []).find(item => get(item, 'playerId', 'PlayerId') === targetId);
			const conditions = get(player, 'additionalPhysicalConditions', 'AdditionalPhysicalConditions') || [];
			category.innerHTML = conditions.map(item => `<option value="${escapeHtml(String(get(item, 'conditionId', 'ConditionId') || ''))}">${escapeHtml(String(get(item, 'name', 'Name') || ''))}</option>`).join('');
		} else if (action === 'reveal' || action === 'hide') {
			const characteristics = ['Personality', 'Body', 'Profession', 'PhysicalHealth', 'MentalHealth', 'Hobby', 'CharacterTrait', 'Phobia', 'Inventory', 'Property', 'Fact', 'SpecialCard'];
			category.innerHTML = characteristics.map(key => `<option value="${key}">${escapeHtml(t(key) || key)}</option>`).join('');
		}
		if ([...category.options].some(option => option.value === previous)) category.value = previous;
	}
}

function setDirectorPending(pending) { directorCommandPending = pending; document.querySelectorAll('.director-command').forEach(button => button.disabled = pending || (button.id === 'directorApplyButton' && !directorPreview?.canApply)); }

async function previewDirectorAction() {
	if (directorCommandPending) return; setDirectorPending(true); const output = document.getElementById('directorPreviewResult');
	try { directorPreview = await connection.invoke('PreviewDirectorAction', buildDirectorRequest()); if (output) output.textContent = JSON.stringify(directorPreview, null, 2); }
	catch (error) { directorPreview = null; if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setDirectorPending(false); }
}

async function applyDirectorAction() {
	if (directorCommandPending || !directorPreview?.canApply) return;
	const irreversible = !!directorPreview.irreversibleWarning;
	if (!confirm('Apply director action?') || (irreversible && !confirm('Undo unavailable. Confirm irreversible threat action.'))) return;
	setDirectorPending(true); const output = document.getElementById('directorPreviewResult');
	try { const result = await connection.invoke('ApplyDirectorAction', buildDirectorRequest(), directorPreview.previewToken, directorPreview.currentStateVersion, crypto.randomUUID(), true); directorPreview = null; if (output) output.textContent = result?.applied ? 'Applied' : 'No change'; }
	catch (error) { directorPreview = null; if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setDirectorPending(false); }
}

function renderOmniscientHiddenState() {
	const state = omniscientHiddenState; if (!state) return;
	const get = (object, camel, pascal) => object?.[camel] ?? object?.[pascal];
	const tab = document.getElementById('omniscientHiddenTab'); if (tab) tab.style.display = '';
	const status = document.getElementById('omniscientHiddenStatus'); if (status) status.textContent = `${get(state, 'updatedAtUtc', 'UpdatedAtUtc') || ''}`;
	const summary = document.getElementById('omniscientRoomSummary');
	if (summary) summary.innerHTML = [
		['Round', get(state, 'round', 'Round')], ['Phase', get(state, 'phase', 'Phase')],
		['Players', get(state, 'activeGameplayPlayerCount', 'ActiveGameplayPlayerCount')],
		['Threat', get(get(state, 'currentThreat', 'CurrentThreat'), 'title', 'Title') || '—']
	].map(([label, value]) => `<div class="gm-status-card"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value ?? '—'))}</strong></div>`).join('');
	const query = (document.getElementById('omniscientHiddenSearch')?.value || '').trim().toLocaleLowerCase();
	const players = get(state, 'players', 'Players') || [];
	const targetSelect = document.getElementById('directorTargetPlayer');
	if (targetSelect) { const selected = targetSelect.value; targetSelect.innerHTML = players.filter(player => !get(player, 'isSpectatorGm', 'IsSpectatorGm')).map(player => `<option value="${escapeHtml(String(get(player, 'playerId', 'PlayerId') || ''))}">${escapeHtml(String(get(player, 'displayName', 'DisplayName') || ''))}</option>`).join(''); if ([...targetSelect.options].some(option => option.value === selected)) targetSelect.value = selected; }
	syncDirectorControls();
	const target = document.getElementById('omniscientHiddenPlayers');
	if (target) target.innerHTML = players.filter(player => {
		const searchable = `${get(player, 'displayName', 'DisplayName')} ${(get(player, 'characteristics', 'Characteristics') || []).map(c => `${get(c, 'key', 'Key')} ${get(c, 'value', 'Value')}`).join(' ')}`.toLocaleLowerCase();
		return !query || searchable.includes(query);
	}).map(player => {
		const characteristics = get(player, 'characteristics', 'Characteristics') || [];
		const inventory = get(player, 'inventory', 'Inventory') || [];
		const cards = get(player, 'specialCards', 'SpecialCards') || [];
		const conditions = get(player, 'additionalPhysicalConditions', 'AdditionalPhysicalConditions') || [];
		const rows = characteristics.map(c => { const key = String(get(c, 'key', 'Key') || ''); return `<li><strong>${escapeHtml(t(key) || key)}</strong> <span class="gm-status-badge">${get(c, 'isRevealed', 'IsRevealed') ? t('revealed') : t('hidden')}</span><br>${escapeHtml(String(get(c, 'value', 'Value') || ''))}${get(c, 'description', 'Description') ? `<br><small>${escapeHtml(String(get(c, 'description', 'Description')))}</small>` : ''}</li>`; }).join('');
		return `<details class="gm-threat-audit"><summary>${escapeHtml(String(get(player, 'displayName', 'DisplayName') || ''))} · ${get(player, 'isEliminated', 'IsEliminated') ? 'eliminated' : get(player, 'isSpectatorGm', 'IsSpectatorGm') ? 'spectator' : 'active'}</summary>
                <ul>${rows}</ul>
                <details><summary>${t('inventory')} (${inventory.length})</summary><ul>${inventory.map(i => `<li>${escapeHtml(String(get(i, 'name', 'Name') || ''))} — ${escapeHtml(String(get(i, 'description', 'Description') || ''))}</li>`).join('')}</ul></details>
                <details><summary>${t('specialCards')} (${cards.length})</summary><ul>${cards.map(c => `<li>${escapeHtml(String(get(c, 'name', 'Name') || ''))} — ${escapeHtml(String(get(c, 'description', 'Description') || ''))}</li>`).join('')}</ul></details>
                <details><summary>Additional conditions (${conditions.length})</summary><ul>${conditions.map(c => `<li>${escapeHtml(String(get(c, 'name', 'Name') || ''))} ${escapeHtml(String(get(c, 'severityLevel', 'SeverityLevel') || ''))}</li>`).join('')}</ul></details>
            </details>`;
	}).join('');
	const voting = get(state, 'currentVoting', 'CurrentVoting'); const votes = get(voting, 'secretVotes', 'SecretVotes');
	const votesTarget = document.getElementById('omniscientSecretVotes');
	if (votesTarget) { votesTarget.style.display = Array.isArray(votes) ? '' : 'none'; votesTarget.innerHTML = Array.isArray(votes) ? `<h5>${t('omniscientSecretVotes')}</h5><ul>${votes.map(v => `<li>${escapeHtml(String(get(v, 'voterName', 'VoterName') || ''))} → ${escapeHtml(String(get(v, 'candidateName', 'CandidateName') || ''))}</li>`).join('')}</ul>` : ''; }
}

async function refreshGlobalContentCatalogAccess() {
	const panel = document.getElementById('globalContentCatalog');
	if (!panel) return;
	const roomId = currentRoom?.id || currentRoom?.Id || null;
	if (!isDeveloper || !roomId) {
		panel.style.display = 'none';
		globalCatalogAllowed = false;
		globalCatalogAccessRoomId = null;
		return;
	}
	if (globalCatalogAccessRoomId === roomId) return;
	globalCatalogAccessRoomId = roomId;
	try {
		const access = await connection.invoke('GetGlobalContentCatalogAccess');
		globalCatalogAllowed = access?.allowed === true || access?.Allowed === true;
		panel.style.display = globalCatalogAllowed ? 'block' : 'none';
		if (globalCatalogAllowed) await loadGlobalContentCategories();
	} catch {
		globalCatalogAllowed = false;
		panel.style.display = 'none';
	}
}

async function loadGlobalContentCategories() {
	if (!globalCatalogAllowed) return;
	try {
		globalCatalogMetadata = await connection.invoke('GetGlobalContentCategories') || [];
		const selector = document.getElementById('globalCatalogCategory');
		if (!selector) return;
		selector.replaceChildren(...globalCatalogMetadata.map(metadata => {
			const option = document.createElement('option');
			option.value = metadata.category || metadata.Category;
			option.textContent = option.value;
			return option;
		}));
		await loadGlobalContentPage(1);
		await loadGlobalContentDrafts();
	} catch (error) {
		renderGlobalCatalogError(error);
	}
}

async function loadGlobalContentPage(page) {
	if (!globalCatalogAllowed) return;
	const category = document.getElementById('globalCatalogCategory')?.value;
	if (!category) return;
	const search = document.getElementById('globalCatalogSearch')?.value || '';
	try {
		const data = await connection.invoke('GetGlobalContentEntries', category, page, 25, search);
		globalCatalogPage = data.page ?? data.Page ?? 1;
		globalCatalogTotal = data.totalEntries ?? data.TotalEntries ?? 0;
		renderGlobalContentPage(data);
	} catch (error) {
		renderGlobalCatalogError(error);
	}
}

function setGmDiagnosticsPending(pending) {
	gmDiagnosticsPending = pending;
	document.querySelectorAll('.gm-diagnostics-command').forEach(button => {
		button.disabled = pending || (button.id === 'gmApplyAutoFix' && !gmAutoFixPreview?.hasChanges);
	});
}

function diagnosticsCommand(method, args = []) {
	if (gmDiagnosticsPending) return;
	setGmDiagnosticsPending(true);
	const feedback = document.getElementById('gmDiagnosticsFeedback');
	if (feedback) feedback.textContent = '';
	let invocation;
	switch (method) {
		case 'RunRoomIntegrityCheck': invocation = connection.invoke('RunRoomIntegrityCheck', args[0]); break;
		case 'PreviewRoomAutoFix': invocation = connection.invoke('PreviewRoomAutoFix', args[0]); break;
		case 'ApplyRoomAutoFix': invocation = connection.invoke('ApplyRoomAutoFix', args[0], args[1], args[2]); break;
		case 'GetGmAuditLog': invocation = connection.invoke('GetGmAuditLog'); break;
		default: setGmDiagnosticsPending(false); return;
	}
	invocation.catch(error => {
		setGmDiagnosticsPending(false);
		if (feedback) feedback.textContent = error?.message || t('unavailableNow');
	});
}

function runRoomIntegrityCheck() {
	diagnosticsCommand('RunRoomIntegrityCheck', [getCurrentLanguage()]);
}

function previewRoomAutoFix() {
	gmAutoFixPreview = null;
	diagnosticsCommand('PreviewRoomAutoFix', [getCurrentLanguage()]);
}

function applyRoomAutoFix() {
	if (gmDiagnosticsPending || !gmAutoFixPreview?.hasChanges || !confirm(t('gmAutoFixConfirm'))) return;
	diagnosticsCommand('ApplyRoomAutoFix', [gmRoundCommandId(), true, getCurrentLanguage()]);
}

function refreshGmAudit() {
	diagnosticsCommand('GetGmAuditLog');
}

function setGmSnapshotPending(pending) {
	gmSnapshotCommandPending = pending;
	document.querySelectorAll('.gm-snapshot-command').forEach(button => button.disabled = pending);
	document.querySelectorAll('[data-snapshot-action]').forEach(button => button.disabled = pending || button.dataset.snapshotBlocked === 'true');
}

function invokeSnapshotCommand(method, args = []) {
	if (gmSnapshotCommandPending) return;
	setGmSnapshotPending(true);
	const feedback = document.getElementById('gmSnapshotFeedback');
	if (feedback) feedback.textContent = '';
	let invocation;
	switch (method) {
		case 'GetRoomSnapshots': invocation = connection.invoke('GetRoomSnapshots'); break;
		case 'CreateManualRoomSnapshot': invocation = connection.invoke('CreateManualRoomSnapshot', args[0], args[1]); break;
		case 'PreviewRoomSnapshotRestore': invocation = connection.invoke('PreviewRoomSnapshotRestore', args[0]); break;
		case 'RestoreRoomSnapshot': invocation = connection.invoke('RestoreRoomSnapshot', args[0], args[1], args[2], args[3]); break;
		case 'UndoLastGmAction': invocation = connection.invoke('UndoLastGmAction', args[0]); break;
		default: setGmSnapshotPending(false); return;
	}
	invocation.catch(error => {
		setGmSnapshotPending(false);
		if (feedback) feedback.textContent = error?.message || t('unavailableNow');
	});
}

function refreshRoomSnapshots() {
	invokeSnapshotCommand('GetRoomSnapshots');
}

function createManualRoomSnapshot() {
	const reason = (document.getElementById('gmSnapshotReason')?.value || '').trim().slice(0, 120);
	invokeSnapshotCommand('CreateManualRoomSnapshot', [reason, gmRoundCommandId()]);
}

function previewRoomSnapshot(snapshotId) {
	gmSnapshotRestorePreview = null;
	invokeSnapshotCommand('PreviewRoomSnapshotRestore', [snapshotId]);
}

function restoreRoomSnapshot(snapshotId) {
	const previewId = gmSnapshotRestorePreview?.snapshot?.snapshotId || gmSnapshotRestorePreview?.snapshot?.SnapshotId;
	if (gmSnapshotCommandPending || previewId !== snapshotId || !gmSnapshotRestorePreview?.canRestore) return;
	if (!confirm(t('gmSnapshotConfirm'))) return;
	const active = String(currentRoundState?.roomState || currentRoom?.state || '').toLowerCase() === 'playing';
	if (active && !confirm(t('gmSnapshotActiveConfirm'))) return;
	invokeSnapshotCommand('RestoreRoomSnapshot', [snapshotId, gmRoundCommandId(), true, active]);
}

function undoLastGmAction() {
	if (gmSnapshotCommandPending || !confirm(t('gmUndoLastAction'))) return;
	invokeSnapshotCommand('UndoLastGmAction', [gmRoundCommandId()]);
}

function setRoomLocalEditorPending(pending) {
	gmRoomLocalEditorPending = pending;
	document.querySelectorAll('.gm-editor-command').forEach(button => button.disabled = pending || (button.id === 'gmEditorApplyButton' && !gmRoomLocalEditPreview?.canApply));
}

function currentRoomLocalEditorSelection() {
	return {
		category: document.getElementById('gmEditorCategory')?.value || 'bunker',
		target: document.getElementById('gmEditorPlayer')?.value || null,
		field: document.getElementById('gmEditorField')?.value || '',
		value: document.getElementById('gmEditorValue')?.value || ''
	};
}

function previewRoomLocalEdit() {
	if (gmRoomLocalEditorPending) return;
	const selection = currentRoomLocalEditorSelection();
	setRoomLocalEditorPending(true);
	connection.invoke('PreviewRoomLocalEdit', selection.category, selection.target, selection.field, selection.value).catch(error => {
		setRoomLocalEditorPending(false);
		const feedback = document.getElementById('gmEditorFeedback'); if (feedback) feedback.textContent = error?.message || t('unavailableNow');
	});
}

function applyRoomLocalEdit() {
	const selection = currentRoomLocalEditorSelection();
	if (gmRoomLocalEditorPending || !gmRoomLocalEditPreview?.canApply || gmRoomLocalEditPreview.fieldId !== selection.field || !confirm(t('gmEditorApply'))) return;
	setRoomLocalEditorPending(true);
	connection.invoke('ApplyRoomLocalEdit', selection.category, selection.target, selection.field, selection.value, gmRoundCommandId()).catch(error => {
		setRoomLocalEditorPending(false);
		const feedback = document.getElementById('gmEditorFeedback'); if (feedback) feedback.textContent = error?.message || t('unavailableNow');
	});
}

function renderRoomLocalEditor() {
	const category = document.getElementById('gmEditorCategory');
	const players = document.getElementById('gmEditorPlayer');
	const fields = document.getElementById('gmEditorField');
	if (!category || !players || !fields) return;
	const previousPlayer = players.value, previousField = fields.value;
	players.innerHTML = gmRoomLocalEditorData.players.map(player => `<option value="${escapeHtml(player.playerId || player.PlayerId)}">${escapeHtml(player.name || player.Name)}</option>`).join('');
	if ([...players.options].some(option => option.value === previousPlayer)) players.value = previousPlayer;
	players.style.display = category.value === 'player' ? '' : 'none';
	const player = gmRoomLocalEditorData.players.find(item => (item.playerId || item.PlayerId) === players.value);
	const available = category.value === 'bunker' ? gmRoomLocalEditorData.bunkerFields : category.value === 'apocalypse' ? gmRoomLocalEditorData.apocalypseFields : (player?.fields || player?.Fields || []);
	fields.innerHTML = available.map(field => `<option value="${escapeHtml(field.fieldId || field.FieldId)}">${escapeHtml(field.label || field.Label)}</option>`).join('');
	if ([...fields.options].some(option => option.value === previousField)) fields.value = previousField;
	gmRoomLocalEditPreview = null;
	syncRoomLocalEditorField();
}

function syncRoomLocalEditorField() {
	const selection = currentRoomLocalEditorSelection();
	const player = gmRoomLocalEditorData.players.find(item => (item.playerId || item.PlayerId) === selection.target);
	const available = selection.category === 'bunker' ? gmRoomLocalEditorData.bunkerFields : selection.category === 'apocalypse' ? gmRoomLocalEditorData.apocalypseFields : (player?.fields || player?.Fields || []);
	const field = available.find(item => (item.fieldId || item.FieldId) === selection.field);
	const current = document.getElementById('gmEditorCurrent'); if (current) current.value = field?.currentPublicValue || field?.CurrentPublicValue || '';
	const value = document.getElementById('gmEditorValue'); if (value) { value.value = ''; value.maxLength = field?.maxLength || field?.MaxLength || 80; }
	const apply = document.getElementById('gmEditorApplyButton'); if (apply) apply.disabled = true;
}

function gmRoundCommandId() {
	return globalThis.crypto?.randomUUID?.() || `gm-round-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setGmRoundCommandPending(pending) {
	gmRoundCommandPending = pending;
	document.querySelectorAll('.gm-round-command').forEach(button => button.disabled = pending || button.dataset.permanentlyDisabled === 'true');
}

function finishGmRoundCommand(message) {
	setGmRoundCommandPending(false);
	const result = document.getElementById('gmRoundCommandResult');
	if (result && message) result.textContent = message;
}

function handleGmRoundCommandError(error) {
	finishGmRoundCommand(error?.message || t('unavailableNow'));
}

function invokeGmRoundCommand(method, args = []) {
	if (gmRoundCommandPending) return;
	setGmRoundCommandPending(true);
	const commandId = gmRoundCommandId();
	let invocation;
	switch (method) {
		case 'SetGamePaused': invocation = connection.invoke('SetGamePaused', args[0], args[1], commandId); break;
		case 'ResetRoundReadiness': invocation = connection.invoke('ResetRoundReadiness', commandId); break;
		case 'ClearCurrentVotes': invocation = connection.invoke('ClearCurrentVotes', commandId); break;
		case 'RemoveCurrentVote': invocation = connection.invoke('RemoveCurrentVote', args[0], commandId); break;
		default: finishGmRoundCommand(); return;
	}
	invocation.catch(handleGmRoundCommandError);
}

function setGamePause(paused) {
	const reason = document.getElementById('gmPauseReason')?.value || '';
	invokeGmRoundCommand('SetGamePaused', [paused, reason]);
}

function previewManualRoundChange() {
	if (gmRoundCommandPending) return;
	const raw = document.getElementById('gmManualRound')?.value?.trim() || '';
	if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 99) {
		finishGmRoundCommand(t('gmCapacityInvalid'));
		return;
	}
	setGmRoundCommandPending(true);
	connection.invoke('PreviewRoundChange', raw).catch(handleGmRoundCommandError);
}

function resetRoundReadiness() {
	if (confirm(t('gmResetReadiness'))) invokeGmRoundCommand('ResetRoundReadiness');
}

function clearCurrentVotes() {
	if (confirm(t('gmClearVotes'))) invokeGmRoundCommand('ClearCurrentVotes');
}

function removeSelectedVote() {
	const voterId = document.getElementById('gmRemoveVoterSelect')?.value;
	if (voterId && confirm(t('gmRemoveVote'))) invokeGmRoundCommand('RemoveCurrentVote', [voterId]);
}

function resyncVotingAdmin() {
	if (gmRoundCommandPending) return;
	setGmRoundCommandPending(true);
	connection.invoke('ResyncVotingState').catch(handleGmRoundCommandError);
}

function gameTimerDurationValue() {
	const minutes = Number(document.getElementById('gmTimerMinutes')?.value || 0);
	const seconds = Number(document.getElementById('gmTimerSeconds')?.value || 0);
	if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || minutes > 120 || seconds < 0 || seconds > 59) return null;
	const total = minutes * 60 + seconds;
	return total >= 10 && total <= 7200 ? String(total) : null;
}

function gameTimerCommandId() {
	return globalThis.crypto?.randomUUID?.() || `gm-timer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function invokeGameTimerCommand(method, args = []) {
	if (gameTimerCommandPending) return;
	gameTimerCommandPending = true;
	document.querySelectorAll('.gm-timer-command').forEach(button => button.disabled = true);
	const feedback = document.getElementById('gmTimerFeedback');
	if (feedback) feedback.textContent = '';
	const commandId = gameTimerCommandId();
	let invocation;
	switch (method) {
		case 'StartGameTimer': invocation = connection.invoke('StartGameTimer', args[0], args[1], args[2], commandId); break;
		case 'SetGameTimer': invocation = connection.invoke('SetGameTimer', args[0], commandId); break;
		case 'AdjustGameTimer': invocation = connection.invoke('AdjustGameTimer', args[0], commandId); break;
		case 'PauseGameTimer': invocation = connection.invoke('PauseGameTimer', commandId); break;
		case 'ResumeGameTimer': invocation = connection.invoke('ResumeGameTimer', commandId); break;
		case 'RestartGameTimer': invocation = connection.invoke('RestartGameTimer', commandId); break;
		case 'StopGameTimer': invocation = connection.invoke('StopGameTimer', commandId); break;
		default: gameTimerCommandPending = false; return;
	}
	invocation.catch(error => {
		gameTimerCommandPending = false;
		if (feedback) feedback.textContent = error?.message || t('unavailableNow');
		renderGameTimer();
	});
}

function startGameTimer() {
	const duration = gameTimerDurationValue();
	if (!duration) { const feedback = document.getElementById('gmTimerFeedback'); if (feedback) feedback.textContent = '10..7200'; return; }
	invokeGameTimerCommand('StartGameTimer', [duration, document.getElementById('gmTimerPurpose')?.value || 'Round', document.getElementById('gmTimerLabel')?.value || '']);
}

function setGameTimer() {
	const duration = gameTimerDurationValue();
	if (!duration) { const feedback = document.getElementById('gmTimerFeedback'); if (feedback) feedback.textContent = '10..7200'; return; }
	invokeGameTimerCommand('SetGameTimer', [duration]);
}

function adjustGameTimer(delta) { invokeGameTimerCommand('AdjustGameTimer', [delta]); }

function restartGameTimer() {
	if (currentGameTimer?.status?.toLowerCase() === 'running' && !confirm(t('gmTimerRestart'))) return;
	invokeGameTimerCommand('RestartGameTimer');
}

function stopGameTimer() {
	if (currentGameTimer?.status?.toLowerCase() !== 'stopped' && !confirm(t('gmTimerStop'))) return;
	invokeGameTimerCommand('StopGameTimer');
}

function handleGameTimerKeydown(event) {
	if (event.key === 'Enter') { event.preventDefault(); startGameTimer(); }
}

function renderGmVotingAdmin() {
	const select = document.getElementById('gmRemoveVoterSelect');
	if (select) select.innerHTML = `<option value="">—</option>` + gmVotingAdminState.eligibleVoters.map(voter => {
		const id = voter.playerId || voter.PlayerId || voter.connectionId || voter.ConnectionId;
		return `<option value="${escapeHtml(id)}">${escapeHtml(voter.name || voter.Name || '')}</option>`;
	}).join('');
	const list = document.getElementById('gmNonVotersList');
	if (list) list.innerHTML = gmVotingAdminState.nonVoters.map(voter =>
		`<div>${escapeHtml(voter.name || voter.Name || '')}</div>`).join('');
}

function markGMServerUpdate() {
	renderGMPanelState();
}

function renderGMPanelState() {
	document.querySelectorAll('[data-gm-i18n]').forEach(element => {
		element.textContent = t(element.dataset.gmI18n);
	});
	document.querySelectorAll('[data-gm-i18n-placeholder]').forEach(element => {
		element.placeholder = t(element.dataset.gmI18nPlaceholder);
	});
	document.querySelectorAll('[data-gm-i18n-aria-label]').forEach(element => {
		element.setAttribute('aria-label', t(element.dataset.gmI18nAriaLabel));
	});
	const round = getCurrentRoundNumber();
	const capacityInput = document.getElementById('gmBunkerCapacity');
	if (capacityInput && !bunkerCapacityPending && currentBunker?.capacity != null) {
		currentBunkerCapacity = currentBunker.capacity;
		capacityInput.value = currentBunker.capacity;
	}
	renderRoomDiagnostics();
	const error = document.getElementById('gmLastCommandError');
	if (error) {
		error.textContent = gmLastCommandError;
		error.style.display = gmLastCommandError ? 'block' : 'none';
	}
	renderRoomSnapshots();
	renderUnifiedGmAudit();
}

function renderGMThreatControl() {
	const current = document.getElementById('gmThreatCurrent');
	const select = document.getElementById('gmThreatSelect');
	const specificControls = document.getElementById('gmSpecificThreatControls');
	if (specificControls) specificControls.style.display = gmThreatControlData.canBrowseFutureThreatCatalog ? '' : 'none';
	if (current) {
		const threat = gmThreatControlData.currentThreat;
		current.textContent = threat
			? `${threat.name || threat.Name} — ${getThreatStatusLabel(threat.status || threat.Status || '—')}`
			: t('gmThreatNone');
	}
	if (select) {
		const previous = select.value;
		select.innerHTML = gmThreatControlData.threats.map(threat => {
			const id = threat.id || threat.Id;
			const name = threat.name || threat.Name;
			const type = threat.type || threat.Type || 'text';
			const available = threat.available ?? threat.Available ?? true;
			return `<option value="${escapeHtml(id)}" data-search="${escapeHtml(`${name} ${id} ${type}`.toLowerCase())}" ${available ? '' : 'disabled'}>${escapeHtml(name)} — ${escapeHtml(type)}</option>`;
		}).join('');
		if ([...select.options].some(option => option.value === previous)) select.value = previous;
	}
	const currentThreat = gmThreatControlData.currentThreat;
	const canRecover = currentThreat?.canRecoverAttempt ?? currentThreat?.CanRecoverAttempt ?? false;
	const canForce = currentThreat?.canForceOutcome ?? currentThreat?.CanForceOutcome ?? false;
	const hasThreat = !!currentThreat;
	const resync = document.getElementById('gmThreatResync');
	const reset = document.getElementById('gmThreatReset');
	const abort = document.getElementById('gmThreatAbort');
	const forceSuccess = document.getElementById('gmThreatForceSuccess');
	const forceFailure = document.getElementById('gmThreatForceFailure');
	const emergency = document.getElementById('gmThreatEmergencyBlock');
	if (resync) resync.style.display = hasThreat ? '' : 'none';
	if (reset) reset.style.display = canRecover ? '' : 'none';
	if (abort) abort.style.display = canRecover ? '' : 'none';
	if (forceSuccess) forceSuccess.style.display = canForce ? '' : 'none';
	if (forceFailure) forceFailure.style.display = canForce ? '' : 'none';
	if (emergency) emergency.hidden = !hasThreat;
	renderUnifiedGmAudit();
}

function renderGMThreatAudit() {
	renderUnifiedGmAudit();
}

function renderRoomDiagnostics() {
	const summary = document.getElementById('gmDiagnosticsSummary');
	const issuesList = document.getElementById('gmDiagnosticsIssues');
	if (!summary || !issuesList) return;
	if (!gmDiagnosticsData) {
		summary.innerHTML = `<div class="gm-status-card"><span>${escapeHtml(t('gmDiagnostics'))}</span><strong>—</strong></div>`;
		issuesList.innerHTML = '';
		return;
	}
	const status = gmDiagnosticsData.errorCount > 0 ? 'error' : gmDiagnosticsData.warningCount > 0 ? 'warning' : 'healthy';
	const statusLabel = t(status === 'error' ? 'gmError' : status === 'warning' ? 'gmWarning' : 'gmHealthy');
	const checked = gmDiagnosticsData.checkedAtUtc ? new Date(gmDiagnosticsData.checkedAtUtc) : null;
	summary.innerHTML = [
		[t('status'), statusLabel],
		[t('gmRunDiagnostics'), checked && !Number.isNaN(checked.getTime()) ? checked.toLocaleString() : '—'],
		['Errors', gmDiagnosticsData.errorCount], ['Warnings', gmDiagnosticsData.warningCount], ['Info', gmDiagnosticsData.infoCount]
	].map(([label, value]) => `<div class="gm-status-card"><span>${escapeHtml(label)}</span><strong class="gm-status-badge">${escapeHtml(value)}</strong></div>`).join('');
	const severityFilter = document.getElementById('gmIssueSeverity')?.value || 'all';
	const issues = gmDiagnosticsData.issues.filter(issue => {
		const severity = (issue.severity || issue.Severity || '').toLowerCase();
		return severityFilter === 'all' || severity === severityFilter;
	});
	issuesList.innerHTML = issues.length ? issues.map(issue => {
		const severity = (issue.severity || issue.Severity || 'info').toLowerCase();
		const message = issue.message || issue.Message || '';
		const playerName = issue.affectedPlayerName || issue.AffectedPlayerName || '';
		const canFix = issue.canAutoFix ?? issue.CanAutoFix ?? false;
		return `<div class="gm-diagnostic-issue">
                <span class="gm-diagnostic-severity ${escapeHtml(severity)}">${escapeHtml(severity)}</span>
                <span>${escapeHtml(message)}${playerName ? ` · ${escapeHtml(playerName)}` : ''}</span>
                ${canFix ? `<span class="gm-diagnostic-autofix">${escapeHtml(t('gmAutoFixAvailable'))}</span>` : ''}
            </div>`;
	}).join('') : `<p class="gm-threat-audit-empty">${escapeHtml(t('gmNoIssues'))}</p>`;
}

function renderRoomSnapshots() {
	const list = document.getElementById('gmSnapshotsList');
	const previewBox = document.getElementById('gmSnapshotPreview');
	if (!list || !previewBox) return;
	const snapshots = Array.isArray(gmSnapshotsData) ? gmSnapshotsData.slice(0, 20) : [];
	if (!snapshots.length) list.innerHTML = `<p class="gm-threat-audit-empty">${escapeHtml(t('gmSnapshotEmpty'))}</p>`;
	else list.innerHTML = snapshots.map(snapshot => {
		const id = snapshot.snapshotId || snapshot.SnapshotId || '';
		const reason = snapshot.reason || snapshot.Reason || '';
		const action = snapshot.relatedActionType || snapshot.RelatedActionType || '';
		const round = snapshot.roundNumber ?? snapshot.RoundNumber ?? 0;
		const phase = snapshot.phase || snapshot.Phase || '';
		const status = (snapshot.restoreStatus || snapshot.RestoreStatus || 'blocked').toLowerCase();
		const blocked = snapshot.blockedReason || snapshot.BlockedReason || '';
		const dateValue = snapshot.createdAtUtc || snapshot.CreatedAtUtc;
		const date = dateValue ? new Date(dateValue) : null;
		const time = date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '';
		const selectedPreviewId = gmSnapshotRestorePreview?.snapshot?.snapshotId || gmSnapshotRestorePreview?.snapshot?.SnapshotId;
		const canRestore = status === 'restorable' && gmSnapshotRestorePreview?.canRestore && selectedPreviewId === id;
		return `<article class="gm-snapshot-entry">
                <header><strong>${escapeHtml(reason)}</strong><span class="gm-snapshot-badge ${escapeHtml(status)}">${escapeHtml(status)}</span></header>
                <p>${escapeHtml(time)} · ${escapeHtml(action || 'manual_snapshot')} · ${escapeHtml(t('round'))} ${escapeHtml(round)} / ${escapeHtml(phase)}</p>
                ${blocked ? `<p>${escapeHtml(t('gmSnapshotBlocked'))}: ${escapeHtml(blocked)}</p>` : ''}
                <div class="gm-snapshot-actions">
                    <button type="button" class="btn-gm-action" data-snapshot-action onclick="previewRoomSnapshot('${escapeHtml(id)}')">${escapeHtml(t('gmSnapshotPreview'))}</button>
                    <button type="button" class="btn-gm-action" data-snapshot-action data-snapshot-blocked="${canRestore ? 'false' : 'true'}" onclick="restoreRoomSnapshot('${escapeHtml(id)}')" ${canRestore ? '' : 'disabled'}>${escapeHtml(t('gmSnapshotRestore'))}</button>
                </div>
            </article>`;
	}).join('');

	if (!gmSnapshotRestorePreview) previewBox.innerHTML = '';
	else {
		const changes = gmSnapshotRestorePreview.changes.map(change => {
			const category = change.category || change.Category || '';
			const count = change.changedCount ?? change.ChangedCount ?? 0;
			return `${category}: ${count}`;
		});
		previewBox.innerHTML = `<strong>${escapeHtml(t('gmSnapshotChanges'))}</strong><p>${escapeHtml(changes.join(' · ') || '0')}</p>${gmSnapshotRestorePreview.blockedReason ? `<p>${escapeHtml(t('gmSnapshotBlocked'))}: ${escapeHtml(gmSnapshotRestorePreview.blockedReason)}</p>` : ''}`;
	}
}

function renderUnifiedGmAudit() {
	const list = document.getElementById('gmThreatAuditList');
	if (!list) return;
	const render = () => {
	const general = (Array.isArray(gmAuditData.entries) ? gmAuditData.entries : []).map(entry => ({
		source: 'gm',
		time: entry.occurredAtUtc || entry.OccurredAtUtc,
		action: entry.actionType || entry.ActionType || '',
		result: (entry.result || entry.Result || '').toLowerCase(),
		target: entry.targetPlayerId || entry.TargetPlayerId || '',
		summary: entry.summary || entry.Summary || '',
		errorCode: entry.errorCode || entry.ErrorCode || '',
		canUndo: entry.canUndo ?? entry.CanUndo ?? false,
		wasUndone: entry.wasUndone ?? entry.WasUndone ?? false
	}));
	const threat = (Array.isArray(gmThreatControlData.auditLog) ? gmThreatControlData.auditLog : []).map(entry => ({
		source: 'threat',
		time: entry.timestampUtc || entry.TimestampUtc,
		action: `threat_${entry.eventType || entry.EventType || ''}`,
		result: 'success',
		target: entry.threatId || entry.ThreatId || '',
		summary: `${entry.threatName || entry.ThreatName || entry.threatId || entry.ThreatId || ''} · ${t('gmThreatRound')} ${entry.round ?? entry.Round ?? 0}`,
		threatType: entry.eventType || entry.EventType || ''
	}));
	const query = (document.getElementById('gmAuditSearch')?.value || '').trim().toLowerCase();
	const resultFilter = document.getElementById('gmAuditResult')?.value || 'all';
	const events = [...general, ...threat]
		.filter(entry => (resultFilter === 'all' || entry.result === resultFilter) &&
			(!query || `${entry.action} ${entry.summary} ${entry.target}`.toLowerCase().includes(query)))
		.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 50);
	if (!events.length) {
		list.innerHTML = `<p class="gm-threat-audit-empty">${escapeHtml(t('gmThreatHistoryEmpty'))}</p>`;
		return;
	}
	const eventKeys = {
		revealed: 'gmThreatEventRevealed', attempt_started: 'gmThreatEventAttemptStarted',
		attempt_reset: 'gmThreatEventAttemptReset', aborted: 'gmThreatEventAborted',
		forced_success: 'gmThreatEventForcedSuccess', forced_failure: 'gmThreatEventForcedFailure',
		completed_success: 'gmThreatEventCompletedSuccess', completed_failure: 'gmThreatEventCompletedFailure',
		effects_applied: 'gmThreatEventEffectsApplied'
	};
	const locale = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-GB' }[getCurrentLanguage()] || 'uk-UA';
	list.innerHTML = events.map(entry => {
		const type = entry.threatType || '';
		const rawTime = entry.time;
		const parsedTime = rawTime ? new Date(rawTime) : null;
		const time = parsedTime && !Number.isNaN(parsedTime.getTime())
			? parsedTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
			: '';
		const title = entry.source === 'threat' ? t(eventKeys[type] || type) : entry.action;
		const undoState = entry.wasUndone ? ' · undone' : entry.canUndo ? ' · undo available' : '';
		return `<details class="gm-threat-audit-entry">
                <summary><time>${escapeHtml(time)}</time><strong>${escapeHtml(title)}</strong><span class="gm-audit-result ${escapeHtml(entry.result)}">${escapeHtml(entry.result)}</span></summary>
                <div><span>${escapeHtml(entry.summary + undoState)}</span>${entry.target ? `<span>${escapeHtml(t('target'))}: ${escapeHtml(entry.target)}</span>` : ''}${entry.errorCode ? `<span>${escapeHtml(entry.errorCode)}</span>` : ''}</div>
            </details>`;
	}).join('');
	};
	if (typeof window.preserveGmPanelScroll === 'function') {
		window.preserveGmPanelScroll(render);
	} else {
		render();
	}
}

function filterGMThreatOptions() {
	const query = (document.getElementById('gmThreatSearch')?.value || '').trim().toLowerCase();
	document.querySelectorAll('#gmThreatSelect option').forEach(option => {
		option.hidden = !!query && !option.dataset.search.includes(query);
	});
}

function gmThreatCommandId() {
	return globalThis.crypto?.randomUUID?.() || `gm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function confirmGMThreatReplacement(message) {
	if (!gmThreatControlData.currentThreat) return true;
	return confirm(message) && confirm('Підтвердіть ще раз: стара interaction state буде закрита без застосування її наслідків.');
}

function invokeGMThreatCommand(method, args, confirmationMessage) {
	if (gmThreatCommandPending) return;
	const confirmed = confirmationMessage ? confirmGMThreatReplacement(confirmationMessage) : true;
	if (!confirmed) return;
	gmThreatCommandPending = true;
	document.querySelectorAll('#gmThreatControlSection button').forEach(button => button.disabled = true);
	let invocation;
	switch (method) {
		case 'GMGenerateRandomRareThreat':
			invocation = connection.invoke('GMGenerateRandomRareThreat', args[0], confirmed);
			break;
		case 'GMGenerateTextThreat':
			invocation = connection.invoke('GMGenerateTextThreat', args[0], confirmed);
			break;
		case 'GMSelectThreat':
			invocation = connection.invoke('GMSelectThreat', args[0], args[1], confirmed);
			break;
		default:
			gmThreatCommandPending = false;
			return;
	}
	invocation
		.catch(err => {
			const result = document.getElementById('gmThreatCommandResult');
			if (result) result.textContent = err?.message || 'Помилка GM-команди';
		})
		.finally(() => {
			gmThreatCommandPending = false;
			document.querySelectorAll('#gmThreatControlSection button').forEach(button => button.disabled = false);
		});
}

function gmGenerateRareThreat() {
	invokeGMThreatCommand('GMGenerateRandomRareThreat', [gmThreatCommandId()], 'Замінити поточну загрозу випадковою рідкісною?');
}

function gmGenerateTextThreat() {
	invokeGMThreatCommand('GMGenerateTextThreat', [gmThreatCommandId()], 'Замінити поточну загрозу випадковою текстовою?');
}

function gmSelectSpecificThreat() {
	const id = document.getElementById('gmThreatSelect')?.value;
	if (id) invokeGMThreatCommand('GMSelectThreat', [id, gmThreatCommandId()], 'Замінити поточну загрозу обраною?');
}

function gmCancelThreat() {
	invokeGMThreatEmergency('GMCancelCurrentThreat', 'Загрозу буде завершено без застосування нових наслідків. Уже застосовані наслідки залишаться.');
}

function gmRestartThreat() {
	invokeGMThreatEmergency('GMRestartCurrentThreat', 'Поточний прогрес спроби буде очищено. Уже застосовані наслідки не буде скасовано.');
}

function gmResyncThreatRoom() {
	invokeGMThreatEmergency('GMResyncThreatRoom');
}

function setGMThreatForcePending(pending) {
	gmThreatForcePending = pending;
	document.querySelectorAll('#gmThreatEmergencyBlock button, #gmThreatForceModal button').forEach(button => {
		button.disabled = pending;
	});
	if (!pending) {
		const confirmButton = document.getElementById('gmThreatForceConfirm');
		if (confirmButton) confirmButton.disabled = !gmThreatForcePreview;
	}
}

function requestGMThreatForcePreview(outcome) {
	if (gmThreatForcePending || !['success', 'failure'].includes(outcome)) return;
	gmThreatForceRequestedOutcome = outcome;
	gmThreatForcePreview = null;
	const error = document.getElementById('gmThreatForceError');
	if (error) error.textContent = '';
	const refresh = document.getElementById('gmThreatForceRefresh');
	if (refresh) refresh.style.display = 'none';
	setGMThreatForcePending(true);
	connection.invoke('GMPreviewForceThreat', outcome, getCurrentLanguage()).catch(err => {
		if (error) error.textContent = err?.message || t('unavailableNow');
		setGMThreatForcePending(false);
	});
}

function refreshGMThreatForcePreview() {
	if (gmThreatForceRequestedOutcome) requestGMThreatForcePreview(gmThreatForceRequestedOutcome);
}

function renderGMThreatForcePreview() {
	const preview = gmThreatForcePreview;
	const content = document.getElementById('gmThreatForcePreviewContent');
	if (!content || !preview) return;
	const value = key => preview[key] ?? preview[key[0].toUpperCase() + key.slice(1)];
	const outcome = value('requestedOutcome');
	const effects = !!value('effectsWillBeApplied');
	content.innerHTML = `<div class="gm-threat-force-preview">
            <strong>${escapeHtml(value('threatName') || value('threatId') || '')}</strong>
            <dl>
                <div><dt>${escapeHtml(t('gmThreatForceOutcome'))}</dt><dd>${escapeHtml(t(outcome === 'success' ? 'gmThreatForceSuccess' : 'gmThreatForceFailure'))}</dd></div>
                <div><dt>${escapeHtml(t('gmThreatForceEffects'))}</dt><dd>${escapeHtml(t(effects ? 'gmThreatForceWillApply' : 'gmThreatForceWillNotApply'))}</dd></div>
                <div><dt>${escapeHtml(t('gmThreatForceScope'))}</dt><dd>${escapeHtml(value('consequenceScope') || '')}</dd></div>
                <div><dt>${escapeHtml(t('gmThreatForceAffected'))}</dt><dd>${escapeHtml(value('potentiallyAffectedPlayers') ?? 0)}</dd></div>
            </dl>
            <p>${escapeHtml(value('description') || '')}</p>
            <p class="gm-threat-force-warning">${escapeHtml(value('irreversibleWarning') || '')}</p>
        </div>`;
	const error = document.getElementById('gmThreatForceError');
	if (error) error.textContent = '';
	const refresh = document.getElementById('gmThreatForceRefresh');
	if (refresh) refresh.style.display = 'none';
	setGMThreatForcePending(false);
}

function confirmGMThreatForce() {
	if (gmThreatForcePending || !gmThreatForcePreview) return;
	const fingerprint = gmThreatForcePreview.fingerprint || gmThreatForcePreview.Fingerprint;
	if (!fingerprint) return;
	setGMThreatForcePending(true);
	connection.invoke('GMConfirmForceThreat', gmThreatForceRequestedOutcome, fingerprint, gmThreatCommandId(), getCurrentLanguage())
		.catch(err => {
			const error = document.getElementById('gmThreatForceError');
			if (error) error.textContent = err?.message || t('unavailableNow');
			setGMThreatForcePending(false);
		});
}

function closeGMThreatForceModal() {
	if (gmThreatForcePending) return;
	const modal = document.getElementById('gmThreatForceModal');
	if (modal) modal.style.display = 'none';
	gmThreatForcePreview = null;
}

function invokeGMThreatEmergency(method, confirmationMessage) {
	if (gmThreatCommandPending) return;
	if (confirmationMessage && !confirm(confirmationMessage)) return;
	gmThreatCommandPending = true;
	document.querySelectorAll('#gmThreatEmergencyBlock button').forEach(button => button.disabled = true);
	const commandId = gmThreatCommandId();
	let invocation;
	switch (method) {
		case 'GMCancelCurrentThreat':
			invocation = connection.invoke('GMCancelCurrentThreat', commandId);
			break;
		case 'GMRestartCurrentThreat':
			invocation = connection.invoke('GMRestartCurrentThreat', commandId);
			break;
		case 'GMResyncThreatRoom':
			invocation = connection.invoke('GMResyncThreatRoom', commandId);
			break;
		default:
			gmThreatCommandPending = false;
			return;
	}
	invocation.catch(error => {
		const result = document.getElementById('gmThreatCommandResult');
		if (result) result.textContent = error?.message || t('unavailableNow');
	}).finally(() => {
		gmThreatCommandPending = false;
		document.querySelectorAll('#gmThreatEmergencyBlock button').forEach(button => button.disabled = false);
		renderGMThreatControl();
	});
}

function updateGMPlayerSelect() {
	const select = document.getElementById('gmPlayerSelect');
	if (!select) return;

	const players = Object.values(roomPlayers);
	select.innerHTML = `<option value="">-- ${getCurrentLanguage() === 'en' ? 'Choose player' : getCurrentLanguage() === 'ru' ? 'Выберите игрока' : 'Виберіть гравця'} --</option>` +
		players.map(p => `<option value="${p.connectionId}" ${p.isEliminated ? 'class="eliminated-option"' : ''}>
                ${escapeHtml(p.name)}${p.isEliminated ? ` (${t('eliminated').toLowerCase()})` : ''}${p.connectionId === myConnectionId ? ` (${t('you')})` : ''}
            </option>`).join('');
	if (selectedPlayerForGM && [...select.options].some(option => option.value === selectedPlayerForGM)) {
		select.value = selectedPlayerForGM;
	}
}

function loadPlayerDataForGM() {
	const select = document.getElementById('gmPlayerSelect');
	const connectionId = select.value;

	if (!connectionId) {
		document.getElementById('gmPlayerInfo').style.display = 'none';
		selectedPlayerForGM = null;
		// Reset all revealed states
		gmRevealedChars = {};
		return;
	}

	selectedPlayerForGM = connectionId;
	const playerData = gmPlayersData[connectionId];

	if (!playerData) {
		document.getElementById('gmPlayerInfo').style.display = 'none';
		return;
	}
	const transferHostButton = document.getElementById('gmTransferHostButton');
	if (transferHostButton) {
		transferHostButton.disabled = !(playerData.canReceiveHost ?? playerData.CanReceiveHost);
		transferHostButton.title = transferHostButton.disabled ? t('gmHostTransferIneligible') : '';
	}

	// Reset revealed characteristics for new player
	gmRevealedChars = {};

	document.getElementById('gmPlayerInfo').style.display = 'block';

	// Get player name with elimination status
	const playerName = playerData.name || playerData.Name || t('players');
	const isEliminated = playerData.isEliminated ?? playerData.IsEliminated ?? false;
	document.getElementById('gmPlayerName').textContent = playerName + (isEliminated ? ` (${t('eliminated')})` : '');

	// Заповнюємо характеристики - приховано по дефолту
	const hiddenText = t('hidden');
	const hiddenClass = 'gm-char-hidden';

	// Всі характеристики
	const charElements = ['gmPersonality', 'gmBody', 'gmProfession', 'gmPhysicalHealth', 'gmMentalHealth',
		'gmHobby', 'gmCharacterTrait', 'gmPhobia', 'gmInventory', 'gmProperty', 'gmFact'];
	charElements.forEach(id => {
		const el = document.getElementById(id);
		if (el) {
			el.textContent = hiddenText;
			el.classList.add(hiddenClass);
			el.classList.remove('gm-char-revealed');
		}
	});

	// Оновлюємо кнопки елімінації
	const eliminateBtn = document.querySelector('.btn-eliminate');
	const restoreBtn = document.querySelector('.btn-restore');
	if (isEliminated) {
		if (eliminateBtn) eliminateBtn.style.display = 'none';
		if (restoreBtn) restoreBtn.style.display = 'inline-block';
	} else {
		if (eliminateBtn) eliminateBtn.style.display = 'inline-block';
		if (restoreBtn) restoreBtn.style.display = 'none';
	}
	renderGMAdditionalConditions(playerData);
}

function renderGMAdditionalConditions(playerData) {
	const container = document.getElementById('gmAdditionalConditions');
	if (!container) return;
	const conditions = playerData.additionalPhysicalConditions || playerData.AdditionalPhysicalConditions || [];
	container.innerHTML = conditions.map(condition => {
		const id = condition.id || condition.Id;
		const name = condition.name || condition.Name || '';
		const severity = condition.severityCode || condition.SeverityCode || 'medium';
		const source = condition.sourceId || condition.SourceId || '';
		const round = condition.appliedRound ?? condition.AppliedRound;
		return `<div class="gm-condition-repair" data-condition-id="${escapeHtml(id)}">
                <strong>${escapeHtml(name)}</strong>
                <small>${source ? `${escapeHtml(source)}${round != null ? ` · ${round}` : ''}` : ''}</small>
                <select class="gm-select gm-condition-severity">
                    ${['light', 'medium', 'hard', 'veryHard', 'critical'].map(code => `<option value="${code}" ${code === severity ? 'selected' : ''}>${escapeHtml(code)}</option>`).join('')}
                </select>
                <button class="btn-gm-action gm-player-command" onclick="changeSelectedConditionSeverity('${escapeHtml(id)}', this)">✓</button>
                <button class="btn-gm-action btn-danger gm-player-command" onclick="removeSelectedCondition('${escapeHtml(id)}')">×</button>
            </div>`;
	}).join('');
}

function formatPersonality(personality) {
	if (!personality) return t('unknown');
	const p = personality;
	const age = p.age ?? p.Age ?? '?';
	const sex = p.sex ?? p.Sex ?? '?';
	const sexOrientation = p.sexOrientation ?? p.SexOrientation ?? '';
	const isChildfree = p.isChildfree ?? p.IsChildfree ?? false;

	let result = `${age} років, ${sex}`;
	if (sexOrientation && sexOrientation !== 'Гетеросексуал') {
		result += `, ${sexOrientation}`;
	}
	if (isChildfree) {
		result += ', Чайлдфрі';
	}
	return result;
}

function formatBody(body) {
	if (!body) return t('unknown');
	const height = body.height ?? body.Height ?? '?';
	const weight = body.weight ?? body.Weight ?? '?';
	const bodyType = body.bodyType ?? body.BodyType ?? '';
	return `${height} см, ${weight} кг${bodyType ? ', ' + bodyType : ''}`;
}

function getCharValue(obj, camelKey, pascalKey) {
	const src = obj?.[camelKey] || obj?.[pascalKey];
	if (!src) return null;
	if (camelKey === 'profession') return getLocalizedValue(src, 'profession') || getLocalizedValue(src, 'name') || src.name || src.Name || src;
	if (camelKey === 'hobby') return getLocalizedValue(src, 'hobby') || getLocalizedValue(src, 'name') || src.name || src.Name || src;
	if (camelKey === 'characterTrait') return getLocalizedValue(src, 'trait') || getLocalizedValue(src, 'name') || src.name || src.Name || src;
	if (camelKey === 'physicalHealth' || camelKey === 'mentalHealth') return getConditionDisplayName(src) || src.name || src.Name || src;
	if (camelKey === 'phobia') return getLocalizedValue(src, 'name') || src.name || src.Name || src;
	if (camelKey === 'inventory') {
		const items = src.items ?? src.Items ?? [];
		if (Array.isArray(items)) return items.map(item => getLocalizedValue(item, 'item') || item.name || item.Name || '').filter(Boolean).join(', ');
	}
	if (camelKey === 'property') return getPropertyDisplay(src);
	return src.name ?? src.Name ?? src.goal ?? src.Goal ?? src;
}

function editCharacteristic(charName) {
	if (!selectedPlayerForGM) {
		alert('Виберіть гравця');
		return;
	}
	if (typeof openCatalogItemPicker === 'function') {
		openCatalogItemPicker(charName, selectedPlayerForGM);
	}
}

function regenerateCharacteristic(charName) {
	executeHostCharacteristicOverride('regenerate', charName);
}

function forceReveal(charName) {
	executeHostCharacteristicOverride('reveal', charName);
}

function executeHostCharacteristicOverride(operation, selectedCharacteristic) {
	const characteristic = selectedCharacteristic || document.getElementById('gmCharacteristicOverrideSelect')?.value;
	const player = gmPlayersData[selectedPlayerForGM];
	if (!selectedPlayerForGM || !player || !characteristic || gmPlayerCommandPending) {
		if (!selectedPlayerForGM) alert(t('gmSelectPlayerFirst'));
		return;
	}
	const label = t(toCamelCase(characteristic)) || characteristic;
	const playerName = player.name || player.Name || t('unknown');
	const revealedKey = `${characteristic.charAt(0).toLowerCase()}${characteristic.slice(1)}`;
	const remainsRevealed = player.revealed?.[revealedKey] ?? player.Revealed?.[characteristic];
	const messages = {
		reveal: t('gmForceRevealConfirm').replace('{characteristic}', label).replace('{player}', playerName),
		hide: t('gmHideConfirm').replace('{characteristic}', label).replace('{player}', playerName),
		regenerate: t('gmRegenerateConfirm').replace('{characteristic}', label).replace('{player}', playerName) +
			(remainsRevealed ? `\n\n${t('gmRegenerateRevealedNotice')}` : '')
	};
	if (!messages[operation] || !confirm(messages[operation])) return;

	gmPlayerCommandPending = true;
	document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = true);
	const commandId = gmPlayerCommandId();
	const method = { reveal: 'ForceRevealCharacteristic', hide: 'HideRevealedCharacteristic', regenerate: 'RegeneratePlayerCharacteristic' }[operation];
	connection.invoke(method, selectedPlayerForGM, characteristic, commandId).catch(error => {
		gmPlayerCommandPending = false;
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
		const result = document.getElementById('gmPlayerCommandResult');
		if (result) result.textContent = error?.message || t('gmCharacteristicOverrideFailed');
	});
}

function eliminateSelectedPlayer() {
	if (!selectedPlayerForGM) {
		alert('Виберіть гравця');
		return;
	}

	const playerData = gmPlayersData[selectedPlayerForGM];
	if (confirm(`Елімінувати гравця ${playerData?.name}?`)) {
		connection.invoke("EliminatePlayer", selectedPlayerForGM)
			.catch(err => console.error(err));
	}
}

function restoreSelectedPlayer() {
	if (!selectedPlayerForGM) {
		alert('Виберіть гравця');
		return;
	}

	const playerData = gmPlayersData[selectedPlayerForGM];
	if (confirm(`Повернути гравця ${playerData?.name} в гру?`)) {
		connection.invoke("RestorePlayer", selectedPlayerForGM)
			.catch(err => console.error(err));
	}
}

function gmPlayerCommandId() {
	return globalThis.crypto?.randomUUID?.() || `gm-player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function invokeGMPlayerCommand(method, args) {
	if (gmPlayerCommandPending || !selectedPlayerForGM) return;
	gmPlayerCommandPending = true;
	document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = true);
	const commandId = gmPlayerCommandId();
	let invocation;
	switch (method) {
		case 'ResyncPlayer': invocation = connection.invoke('ResyncPlayer', args[0], commandId); break;
		case 'HideRevealedCharacteristic': invocation = connection.invoke('HideRevealedCharacteristic', args[0], args[1], commandId); break;
		case 'KickPlayer': invocation = connection.invoke('KickPlayer', args[0], commandId); break;
		case 'ChangeAdditionalConditionSeverity': invocation = connection.invoke('ChangeAdditionalConditionSeverity', args[0], args[1], args[2], commandId); break;
		case 'RemoveAdditionalCondition': invocation = connection.invoke('RemoveAdditionalCondition', args[0], args[1], commandId); break;
		default: gmPlayerCommandPending = false; return;
	}
	invocation.catch(error => {
		gmPlayerCommandPending = false;
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
		const result = document.getElementById('gmPlayerCommandResult');
		if (result) result.textContent = error?.message || 'Помилка команди';
	});
}

function resyncSelectedPlayer() {
	invokeGMPlayerCommand('ResyncPlayer', [selectedPlayerForGM]);
}

function inspectSelectedConnection() {
	if (gmPlayerCommandPending || !selectedPlayerForGM) return;
	gmPlayerCommandPending = true;
	document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = true);
	connection.invoke('InspectStalePlayerConnection', selectedPlayerForGM, false).catch(() => {
		gmPlayerCommandPending = false;
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
	});
}

function hideSelectedCharacteristic() {
	executeHostCharacteristicOverride('hide');
}

async function transferHostToSelectedPlayer() {
	const player = gmPlayersData[selectedPlayerForGM];
	const canReceiveHost = player?.canReceiveHost ?? player?.CanReceiveHost;
	const result = document.getElementById('gmPlayerCommandResult');
	if (!selectedPlayerForGM || !player || canReceiveHost === false) {
		if (result) result.textContent = t('gmHostTransferIneligible');
		return;
	}
	if (gmPlayerCommandPending) return;
	gmPlayerCommandPending = true;
	document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = true);
	try {
		const preview = await connection.invoke('PreviewHostTransfer', selectedPlayerForGM);
		const allowed = preview?.allowed ?? preview?.Allowed;
		if (!allowed) {
			if (result) result.textContent = t('gmHostTransferIneligible');
			return;
		}
		const currentHost = preview?.currentHostName ?? preview?.CurrentHostName ?? '';
		const target = preview?.targetPlayerName ?? preview?.TargetPlayerName ?? '';
		const warning = t('gmHostTransferRestoreWarning');
		if (!confirm(`${t('gmHostTransferConfirm')}\n${currentHost} → ${target}\n${warning}`)) return;
		const fingerprint = preview?.fingerprint ?? preview?.Fingerprint;
		await connection.invoke('TransferHost', selectedPlayerForGM, gmPlayerCommandId(), fingerprint);
	} catch (error) {
		if (result) result.textContent = error?.message || t('unavailableNow');
	} finally {
		gmPlayerCommandPending = false;
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
	}
}

function kickSelectedPlayer() {
	const player = gmPlayersData[selectedPlayerForGM];
	if (confirm(`${t('gmKickPlayer')}: ${player?.name || player?.Name || ''}?`))
		invokeGMPlayerCommand('KickPlayer', [selectedPlayerForGM]);
}

function changeSelectedConditionSeverity(conditionId, button) {
	const severity = button.closest('.gm-condition-repair')?.querySelector('.gm-condition-severity')?.value;
	if (severity) invokeGMPlayerCommand('ChangeAdditionalConditionSeverity', [selectedPlayerForGM, conditionId, severity]);
}

function removeSelectedCondition(conditionId) {
	if (confirm(t('remove'))) invokeGMPlayerCommand('RemoveAdditionalCondition', [selectedPlayerForGM, conditionId]);
}

function showLobbySection() {
	document.getElementById('lobbySection').style.display = 'block';
	document.getElementById('roomSection').style.display = 'none';
}
