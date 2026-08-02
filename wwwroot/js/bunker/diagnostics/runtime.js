// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function applyDeveloperAccessState(value) {
	const projection = value || {};
	const roomProjection = projection.isDeveloper ?? projection.IsDeveloper;
	isDeveloper = !!roomProjection;
	if (!isDeveloper && !isHost) gmPlayersData = {};
	developerState = isDeveloper ? {
		isDeveloper: true,
		participationMode: projection.participationMode || projection.ParticipationMode || 'player',
		isActiveOperator: !!(projection.isActiveOperator ?? projection.IsActiveOperator),
		canTakeOverOperator: !!(projection.canTakeOverOperator ?? projection.CanTakeOverOperator),
		operatorVersion: projection.operatorVersion ?? projection.OperatorVersion ?? 0,
		capabilities: projection.capabilities || projection.Capabilities || [],
		features: projection.features || projection.Features || {},
		recentAudit: projection.recentAudit || projection.RecentAudit || []
	} : null;
	renderDeveloperAuthorityUi();
	if (typeof renderLobbyGameSetup === 'function') renderLobbyGameSetup();
	renderPostGameCommandState();
}

function applyDeveloperPresence(value) {
	value ||= {};
	developerPresence = {
		developerPresent: !!(value.developerPresent ?? value.DeveloperPresent),
		developerPlayerId: value.developerPlayerId || value.DeveloperPlayerId || null,
		status: value.status || value.Status || 'offline'
	};
	if (currentPostGameTransition) {
		currentPostGameTransition.developerPresent = developerPresence.developerPresent;
		currentPostGameTransition.developerPlayerId = developerPresence.developerPlayerId;
	}
	renderPostGameCommandState();
}

function renderDeveloperAuthorityUi() {
	const toolsEnabled = developerFeatureEnabled('developerTools');
	const button = document.getElementById('developerToolsButton');
	if (button) button.hidden = !(isDeveloper && toolsEnabled && currentRoom);
	const observer = document.getElementById('developerObserverOption');
	if (observer) observer.hidden = !isDeveloper;
	const status = document.getElementById('developerOperatorStatus');
	if (status) status.textContent = developerState?.isActiveOperator ? 'Active developer operator' : developerState?.canTakeOverOperator ? 'Developer authority verified; another tab owns the content-workspace lease.' : 'Developer authority verified.';
	const takeover = document.getElementById('developerTakeoverButton');
	if (takeover) takeover.hidden = !developerState?.canTakeOverOperator;
	const checklist = document.getElementById('developerChecklist');
	if (checklist) checklist.textContent = buildDeveloperChecklist();
	renderDeveloperAudit();
}

function developerFeatureEnabled(key) {
	if (!isDeveloper) return false;
	const features = developerState?.features || {};
	const pascal = key.charAt(0).toUpperCase() + key.slice(1);
	return (features[key] ?? features[pascal]) === true;
}

function buildDeveloperChecklist() {
	const roomState = currentRoom?.state || currentRoom?.State || 'none';
	const players = Object.values(typeof roomPlayers === 'object' && roomPlayers ? roomPlayers : {});
	const gameplayPlayers = players.filter(player => !player.isLobbySpectator && !player.IsLobbySpectator && !player.isSpectatorGm && !player.IsSpectatorGm);
	const connected = typeof connection !== 'undefined' && connection.state === signalR.HubConnectionState.Connected;
	const capability = name => developerState?.capabilities?.some(value => String(value).toLowerCase() === name.toLowerCase());
	const rootsValid = document.querySelectorAll('#postGameStoryRoot').length === 1 && document.querySelectorAll('#apocalypseAmbientLayer').length <= 1;
	const stalePostGame = roomState !== 'Finished' && currentPostGameTransition?.phase && currentPostGameTransition.phase !== 'None';
	const line = (status, label, detail) => `[${status}] ${label}${detail ? ` — ${detail}` : ''}`;
	return [
		line(connected ? 'Ready' : 'Critical', 'SignalR', connected ? 'connected' : 'disconnected'),
		line(isDeveloper ? 'Ready' : 'Critical', 'Developer authorization', isDeveloper ? 'server verified' : 'inactive'),
		line(currentRoom ? 'Ready' : 'Critical', 'Correct room', currentRoom?.id || currentRoom?.Id || 'not joined'),
		line(developerState?.isActiveOperator ? 'Ready' : 'Warning', 'Active operator', developerState?.isActiveOperator ? 'acquired' : 'read-only'),
		line((currentRoom?.hostName || currentRoom?.HostName || isHost) ? 'Ready' : 'Warning', 'Host assigned'),
		line(gameplayPlayers.length > 0 ? 'Ready' : 'Warning', 'Gameplay players', String(gameplayPlayers.length)),
		line(currentBunker ? 'Ready' : 'Warning', 'Bunker content', currentBunker ? 'canonical room snapshot' : 'not projected by server'),
		line(currentApocalypse ? 'Ready' : 'Warning', 'Apocalypse content', currentApocalypse ? 'canonical room snapshot' : 'not projected by server'),
		line(document.getElementById('threatPanel') || document.getElementById('threatInfo') ? 'Ready' : 'Warning', 'Threat content', 'UI projection'),
		line(document.querySelector('.scenario-immersive-panel, #scenarioPanel') ? 'Ready' : 'Warning', 'Scenario content', 'UI projection'),
		line(developerFeatureEnabled('scenarioImages') ? 'Ready' : 'Warning', 'Image endpoints', developerFeatureEnabled('scenarioImages') ? 'enabled' : 'disabled'),
		line(developerFeatureEnabled('postGameStory') ? 'Ready' : 'Warning', 'Story Director service', developerFeatureEnabled('postGameStory') ? 'enabled' : 'disabled'),
		line(capability('ManageSnapshots') ? 'Ready' : 'Warning', 'Snapshot service', capability('ManageSnapshots') ? 'available' : 'unavailable'),
		line('Ready', 'Recovery operation', 'none reported'),
		line(stalePostGame ? 'Critical' : 'Ready', 'Post-game state', currentPostGameTransition?.phase || 'None'),
		line(rootsValid ? 'Ready' : 'Critical', 'UI roots', rootsValid ? 'unique' : 'duplicate root detected'),
		line('Ready', 'Environment', document.documentElement.dataset.environment || 'server build')
	].join('\n');
}

function renderDeveloperAudit() {
	const root = document.getElementById('developerAuditList');
	if (!root) return;
	root.replaceChildren();
	const entries = developerState?.recentAudit || [];
	if (!entries.length) {
		const empty = document.createElement('p');
		empty.textContent = 'Привілейованих дій ще немає.';
		root.appendChild(empty);
		return;
	}
	entries.forEach(entry => {
		const row = document.createElement('div');
		row.className = 'developer-audit-entry';
		const timestamp = entry.timestampUtc || entry.TimestampUtc;
		const action = entry.commandType || entry.CommandType || 'developer_action';
		const result = entry.result || entry.Result || 'unknown';
		const target = entry.affectedEntityId || entry.AffectedEntityId;
		const time = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—';
		row.textContent = `${time} · ${action} · ${result}${target ? ` · ${target}` : ''}`;
		root.appendChild(row);
	});
}

function toggleDeveloperTools(force) {
	if (!isDeveloper) return;
	const panel = document.getElementById('developerToolsPanel');
	if (!panel) return;
	panel.hidden = typeof force === 'boolean' ? !force : !panel.hidden;
	renderDeveloperAuthorityUi();
}

async function copyDeveloperChecklist() {
	try { await navigator.clipboard.writeText(buildDeveloperChecklist()); } catch (_) { }
}

function recoverDeveloperUi() {
	document.getElementById('developerToolsPanel')?.setAttribute('hidden', '');
	document.getElementById('promptModal')?.style.setProperty('display', 'none');
	window.PostGameStoryDirector?.hideUi();
	document.body.style.removeProperty('overflow');
	document.body.classList.remove('modal-open', 'story-open');
	document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
	renderCurrentGameUI();
	renderPostGameCommandState();
	if (currentRoom?.id && connection?.state === signalR.HubConnectionState.Connected) {
		connection.invoke('GetRoomState').then(state => {
			currentRoom = { ...currentRoom, ...(state.room || state.Room || {}) };
			const nextPlayers = {};
			(state.players || state.Players || []).forEach(player => {
				const id = player.connectionId || player.ConnectionId;
				if (id) nextPlayers[id] = player;
			});
			roomPlayers = nextPlayers;
			applyRoundState(state.roundState || state.RoundState);
			applyDeveloperPresence(state.developerPresence || state.DeveloperPresence);
			applyPostGameTransition(state.postGameTransition || state.PostGameTransition);
			renderCurrentGameUI();
		}).catch(() => {});
	}
}

async function takeOverDeveloperOperator() {
	if (!isDeveloper || !confirm('Перехопити активний Developer operator у цій вкладці?')) return;
	try { await connection.invoke('TakeOverDeveloperOperator', crypto.randomUUID(), true); }
	catch (error) { alert(localizeServerMessage(error?.message || 'developer_takeover_failed')); }
}
