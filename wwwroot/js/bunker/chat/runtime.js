// Room chat is a classic-script domain, like the rest of the Bunker client.
const roomChatState = { ids: new Set(), aiEnabled: true, roomId: '', historyLoaded: false, open: false, unread: 0, trigger: null, presentation: null, presentationRoomId: '', presentationLoading: false, turnCompletionPending: false };
function updateAiPresentation(data) { roomChatState.presentation = data || null; roomChatState.presentationLoading = false; updateRoomChatControls(); }

function updateRoomChatAiStatus(data) { const status = document.getElementById('roomChatAiStatus'); if (!status) return; const state = data?.state || data?.State; const name = data?.name || data?.Name || 'AI'; const error = data?.error || data?.Error; if (state === 'typing') { status.hidden = false; status.textContent = `${name} ${t('roomChatTyping')}`; return; } if (error) { status.hidden = false; status.textContent = t({ ai_not_configured: 'roomChatAiUnavailable', ai_auth_failed: 'roomChatAiUnavailable', ai_model_not_found: 'roomChatAiUnavailable', ai_rate_limited: 'roomChatAiBusy', ai_timeout: 'roomChatAiBusy', ai_provider_unavailable: 'roomChatAiBusy', ai_network_error: 'roomChatAiBusy' }[error] || 'roomChatAiUnavailable'); return; } status.hidden = true; }

function roomChatElements() { return { drawer: document.getElementById('roomChatDrawer'), trigger: document.getElementById('roomChatButton'), input: document.getElementById('roomChatInput'), list: document.getElementById('roomChatMessages'), badge: document.getElementById('roomChatUnread') }; }
function updateRoomChatUnread() { const { badge } = roomChatElements(); if (!badge) return; badge.hidden = roomChatState.unread === 0; badge.textContent = roomChatState.unread > 9 ? '9+' : String(roomChatState.unread); }
function openRoomChat() { const { drawer, trigger, input } = roomChatElements(); if (!drawer) return; roomChatState.trigger = document.activeElement; roomChatState.open = true; roomChatState.unread = 0; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); trigger?.setAttribute('aria-expanded', 'true'); updateRoomChatUnread(); updateRoomChatControls(); refreshAiPresentationState(true); requestAnimationFrame(() => input?.focus()); }
function closeRoomChat() { const { drawer, trigger } = roomChatElements(); if (!drawer) return; roomChatState.open = false; drawer.classList.remove('is-open'); drawer.setAttribute('aria-hidden', 'true'); trigger?.setAttribute('aria-expanded', 'false'); (roomChatState.trigger || trigger)?.focus?.(); }
function toggleRoomChat() { roomChatState.open ? closeRoomChat() : openRoomChat(); }

function renderRoomChatMessage(message) {
	const id = message?.id || message?.Id;
	if (!id || roomChatState.ids.has(id)) return;
	roomChatState.ids.add(id);
	const { list } = roomChatElements(); if (!list) return;
	const shouldStick = list.scrollTop + list.clientHeight >= list.scrollHeight - 24;
	const item = document.createElement('article');
	const senderType = String(message.senderType ?? message.SenderType ?? 'Human').toLowerCase();
	item.className = `room-chat-message room-chat-message--${senderType === 'ai' ? 'ai' : senderType === 'system' ? 'system' : 'human'}`;
	if ((message.senderId || message.SenderId) === getMyStablePlayerId?.()) item.classList.add('room-chat-message--self');
	const senderName = message.senderName || message.SenderName || 'Unknown';
	const header = document.createElement('strong'); header.textContent = senderType === 'system' ? roomChatNarratorName() : (senderType === 'ai' ? String(senderName).replace(/\s+AI$/i, '') : senderName);
	if (senderType === 'ai') { const badge = document.createElement('span'); badge.className = 'room-chat-ai-badge'; badge.textContent = 'AI'; header.append(' ', badge); }
	const time = document.createElement('time'); const timestamp = message.timestamp || message.Timestamp; time.textContent = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''; time.dateTime = timestamp || '';
	const body = document.createElement('p'); body.textContent = roomChatSystemText(message) || message.text || message.Text || '';
	item.append(header, time, body); list.append(item);
	if (roomChatState.open && shouldStick) list.scrollTop = list.scrollHeight;
	if (!roomChatState.open) { roomChatState.unread++; updateRoomChatUnread(); }
}

function roomChatNarratorName() { return ({ uk: 'Оповідач', en: 'Narrator', ru: 'Рассказчик' })[getCurrentLanguage()] || 'Narrator'; }
function roomChatSystemText(message) {
	const eventType = message.systemEventType || message.SystemEventType;
	if (!eventType) return '';
	const data = message.systemEventData || message.SystemEventData || {};
	const characteristic = data.characteristic ? t(String(data.characteristic).charAt(0).toLowerCase() + String(data.characteristic).slice(1)) : '';
	const name = data.name || data.playerId || '';
	const revealedValue = data.value ? `: ${data.value}` : '';
	const templates = {
		uk: { game_started: `Партію розпочато. Учасників: ${data.playerCount}; місць у бункері: ${data.capacity}.`, round_started: `Розпочато раунд ${data.round}.`, presentation_started: `Починається представлення: ${characteristic}.`, presentation_speaker: `Черга: ${name}.`, ai_characteristic_selected: `${name} обирає: ${characteristic}.`, characteristic_revealed: `${name} розкриває: ${characteristic}${revealedValue}.`, presentation_no_characteristic: `${name} вже не має прихованих характеристик для представлення.`, presentation_skipped: 'Учасника пропущено.', discussion_started: 'Представлення завершено. Починається обговорення.', voting_started: `Почалося голосування${data.round ? ` у раунді ${data.round}` : ''}.`, voting_completed: 'Голосування завершено.' },
		en: { game_started: `The game has started. Participants: ${data.playerCount}; bunker seats: ${data.capacity}.`, round_started: `Round ${data.round} has started.`, presentation_started: `Presentation begins: ${characteristic}.`, presentation_speaker: `Now speaking: ${name}.`, ai_characteristic_selected: `${name} chooses: ${characteristic}.`, characteristic_revealed: `${name} reveals: ${characteristic}${revealedValue}.`, presentation_no_characteristic: `${name} has no hidden characteristics left to present.`, presentation_skipped: 'The participant was skipped.', discussion_started: 'Presentations are complete. Discussion begins.', voting_started: `Voting has started${data.round ? ` in round ${data.round}` : ''}.`, voting_completed: 'Voting has ended.' },
		ru: { game_started: `Партия началась. Участников: ${data.playerCount}; мест в бункере: ${data.capacity}.`, round_started: `Начался раунд ${data.round}.`, presentation_started: `Начинается представление: ${characteristic}.`, presentation_speaker: `Очередь: ${name}.`, ai_characteristic_selected: `${name} выбирает: ${characteristic}.`, characteristic_revealed: `${name} раскрывает: ${characteristic}${revealedValue}.`, presentation_no_characteristic: `${name} больше не имеет скрытых характеристик для представления.`, presentation_skipped: 'Участник пропущен.', discussion_started: 'Представления завершены. Начинается обсуждение.', voting_started: `Началось голосование${data.round ? ` в раунде ${data.round}` : ''}.`, voting_completed: 'Голосование завершено.' }
	};
	return templates[getCurrentLanguage()]?.[eventType] || '';
}

function replaceRoomChatHistory(messages) {
	roomChatState.ids.clear(); const { list } = roomChatElements(); if (list) list.replaceChildren();
	(messages || []).forEach(renderRoomChatMessage); roomChatState.historyLoaded = true;
}

function refreshAiPresentationState(force = false) {
	const roomId = currentRoom?.id || currentRoom?.Id || '';
	if (!roomId || connection?.state !== signalR.HubConnectionState.Connected || roomChatState.presentationLoading || (!force && roomChatState.presentationRoomId === roomId && roomChatState.presentation)) return;
	roomChatState.presentationRoomId = roomId;
	roomChatState.presentationLoading = true;
	connection.invoke('GetAiPresentationState')
		.then(updateAiPresentation)
		.catch(error => { roomChatState.presentationLoading = false; console.warn('Presentation state refresh failed', error); });
}

function roomChatMyStablePlayerId() {
	const currentId = typeof getMyStablePlayerId === 'function' ? getMyStablePlayerId() : '';
	return String(currentId || window.myPlayerData?.stablePlayerId || window.myPlayerData?.StablePlayerId || window.stablePlayerId || '');
}

function updateRoomChatControls() {
	const roomId = currentRoom?.id || currentRoom?.Id || '';
	if (roomId !== roomChatState.roomId) {
		roomChatState.roomId = roomId;
		roomChatState.historyLoaded = false;
		roomChatState.presentation = null;
		roomChatState.presentationRoomId = '';
	}
	if (roomId && (roomId !== roomChatState.roomId || !roomChatState.historyLoaded) && connection?.state === signalR.HubConnectionState.Connected) {
		roomChatState.historyLoaded = true;
		connection.invoke('GetRoomChatHistory').catch(() => { roomChatState.historyLoaded = false; });
	}
	if (roomId && !roomChatState.presentation) refreshAiPresentationState();
	const add = document.getElementById('addAiChatCompanionsBtn'); const toggle = document.getElementById('toggleAiChatBtn');
	const { trigger } = roomChatElements(); if (trigger) trigger.hidden = !roomId;
	if (trigger) { trigger.textContent = t('roomChatTitle'); trigger.setAttribute('aria-label', t('roomChatTitle')); trigger.title = t('roomChatTitle'); }
	const close = document.getElementById('roomChatCloseButton'); if (close) close.setAttribute('aria-label', t('roomChatClose'));
	const connectionStatus = document.getElementById('roomChatConnection'); if (connectionStatus) connectionStatus.textContent = connection?.state === signalR.HubConnectionState.Connected ? t('roomChatConnected') : t('roomChatReconnecting');
	if (add) add.hidden = !isHost;
	if (toggle) { toggle.hidden = !isHost; toggle.textContent = roomChatState.aiEnabled ? t('roomChatAiOn') : t('roomChatAiOff'); }
	const current = roomChatState.presentation; const status = String(current?.status ?? current?.Status ?? 'Inactive');
	const speakerId = String(current?.currentSpeakerStablePlayerId ?? current?.CurrentSpeakerStablePlayerId ?? '');
	const isMyHumanTurn = status === 'Running' && !!speakerId && speakerId === roomChatMyStablePlayerId();
	const presentation = document.getElementById('aiPresentationControls'); if (presentation) presentation.hidden = !isHost && !isMyHumanTurn;
	const speaker = roomChatPresentationSpeakerName(speakerId);
	const progress = `${Math.min(Number(current?.currentIndex ?? current?.CurrentIndex ?? 0) + (status === 'Running' || status === 'Paused' ? 1 : 0), Number(current?.participantCount ?? current?.ParticipantCount ?? 0))}/${Number(current?.participantCount ?? current?.ParticipantCount ?? 0)}`;
	const label = document.getElementById('aiPresentationState'); if (label) label.textContent = roomChatPresentationStateText(status, speakerId, speaker, current?.lastGenerationError ?? current?.LastGenerationError, current?.currentSpeakerStatus ?? current?.CurrentSpeakerStatus, progress);
	const turnAction = document.getElementById('aiPresentationTurnAction'); if (turnAction) turnAction.hidden = !isMyHumanTurn;
	const turnSummary = document.getElementById('aiPresentationTurnSummary'); if (turnSummary) turnSummary.textContent = roomChatPresentationTurnText(progress);
	const turnButton = document.getElementById('completeAiPresentationTurnStickyBtn'); if (turnButton) turnButton.disabled = roomChatState.turnCompletionPending;
	const buttons = { start: document.getElementById('startAiPresentationBtn'), pause: document.getElementById('pauseAiPresentationBtn'), resume: document.getElementById('resumeAiPresentationBtn'), next: document.getElementById('nextAiPresentationBtn'), skip: document.getElementById('skipAiPresentationBtn'), end: document.getElementById('endAiPresentationBtn'), retry: document.getElementById('retryAiPresentationBtn'), discussion: document.getElementById('beginAiDiscussionBtn') };
	const characteristic = document.getElementById('aiPresentationCharacteristic'); if (characteristic) characteristic.hidden = status === 'Running' || status === 'Paused';
	const currentRound = Number(currentRoom?.currentRound ?? currentRoom?.CurrentRound ?? 0); const presentationRound = Number(current?.roundNumber ?? current?.RoundNumber ?? 0);
	if (isHost) { buttons.start.hidden = !(status === 'Inactive' || (presentationRound > 0 && presentationRound !== currentRound)); buttons.pause.hidden = status !== 'Running'; buttons.resume.hidden = status !== 'Paused'; buttons.next.hidden = true; buttons.skip.hidden = status !== 'Running'; buttons.end.hidden = status !== 'Running' && status !== 'Paused'; buttons.retry.hidden = status !== 'Running' || !(current?.lastGenerationError ?? current?.LastGenerationError); buttons.discussion.hidden = status !== 'ReadyForDiscussion'; }
	else { [buttons.start, buttons.pause, buttons.resume, buttons.next, buttons.skip, buttons.end, buttons.retry, buttons.discussion].forEach(button => { if (button) button.hidden = true; }); }
}

function roomChatPresentationSpeakerName(stableId) {
	if (!stableId) return '';
	const players = Object.values(window.roomPlayers || roomPlayers || {}).concat(currentRoom?.players || currentRoom?.Players || []);
	const list = Array.isArray(players) ? players : Object.values(players);
	const player = list.find(item => (item?.stablePlayerId || item?.StablePlayerId || item?.id || item?.Id) === stableId);
	return player?.name || player?.Name || stableId;
}
function roomChatPresentationStateText(status, speakerId, speaker, error, speakerStatus, progress) {
	const labels = { uk: { Inactive: 'Представлення не розпочато', Running: 'Представлення триває', Paused: 'Представлення призупинено', ReadyForDiscussion: 'Представлення завершено — очікується GM', Discussion: 'Обговорення' }, en: { Inactive: 'Presentation has not started', Running: 'Presentation in progress', Paused: 'Presentation paused', ReadyForDiscussion: 'Presentations complete — waiting for GM', Discussion: 'Discussion' }, ru: { Inactive: 'Представление не начато', Running: 'Представление продолжается', Paused: 'Представление приостановлено', ReadyForDiscussion: 'Представления завершены — ожидается GM', Discussion: 'Обсуждение' } };
	const text = labels[getCurrentLanguage()]?.[status] || status;
	const isMyTurn = speaker && speakerId === roomChatMyStablePlayerId();
	const myTurn = ({ uk: 'Ваша черга', en: 'Your turn', ru: 'Ваша очередь' })[getCurrentLanguage()] || 'Your turn';
	const speakerLabels = { uk: { WaitingForHuman: 'очікується виступ людини', Revealing: 'розкриває характеристику', Generating: 'генерує репліку', Finished: 'завершено', Failed: 'помилка', Paused: 'пауза' }, en: { WaitingForHuman: 'waiting for the human speaker', Revealing: 'revealing a characteristic', Generating: 'generating speech', Finished: 'finished', Failed: 'failed', Paused: 'paused' }, ru: { WaitingForHuman: 'ожидается выступление человека', Revealing: 'раскрывает характеристику', Generating: 'генерирует реплику', Finished: 'завершено', Failed: 'ошибка', Paused: 'пауза' } };
	const localizedSpeakerStatus = speakerLabels[getCurrentLanguage()]?.[speakerStatus] || '';
	return `${text}${progress && progress !== '0/0' ? ` · ${progress}` : ''}${speaker ? ` · ${isMyTurn ? myTurn : speaker}` : ''}${localizedSpeakerStatus ? ` · ${localizedSpeakerStatus}` : ''}${error ? ` · ${t('roomChatAiUnavailable')}` : ''}`;
}

function roomChatPresentationTurnText(progress) {
	const templates = { uk: `Ваша черга · Виступ ${progress.replace('/', ' із ')}`, en: `Your turn · Speaker ${progress}`, ru: `Ваша очередь · Выступление ${progress.replace('/', ' из ')}` };
	return templates[getCurrentLanguage()] || templates.en;
}

async function completeAiPresentationHumanTurn() {
	if (roomChatState.turnCompletionPending || !connection) return;
	roomChatState.turnCompletionPending = true;
	updateRoomChatControls();
	try {
		const completed = await connection.invoke('CompleteAiPresentationHumanTurn');
		if (!completed) updateRoomChatAiStatus({ error: 'presentation_turn_rejected' });
	} catch (error) {
		console.warn('Presentation turn completion failed', error);
		updateRoomChatAiStatus({ error: 'presentation_turn_rejected' });
	} finally {
		roomChatState.turnCompletionPending = false;
		refreshAiPresentationState(true);
		updateRoomChatControls();
	}
}

document.addEventListener('DOMContentLoaded', () => {
	const { drawer, trigger } = roomChatElements();
	trigger?.addEventListener('click', toggleRoomChat);
	document.getElementById('roomChatCloseButton')?.addEventListener('click', closeRoomChat);
	document.getElementById('roomChatForm')?.addEventListener('submit', async event => {
		event.preventDefault(); const input = document.getElementById('roomChatInput'); const text = input?.value?.trim(); if (!text || !connection) return;
		try { await connection.invoke('SendRoomChatMessage', text, crypto.randomUUID()); input.value = ''; } catch (error) { console.warn('Chat send failed', error); }
	});
	document.getElementById('addAiChatCompanionsBtn')?.addEventListener('click', () => connection.invoke('AddDefaultAiCompanions').catch(console.warn));
	document.getElementById('toggleAiChatBtn')?.addEventListener('click', () => connection.invoke('SetAiChatResponsesEnabled', !roomChatState.aiEnabled).catch(console.warn));
	document.getElementById('startAiPresentationBtn')?.addEventListener('click', () => connection.invoke('StartAiPresentation', document.getElementById('aiPresentationCharacteristic')?.value).catch(console.warn));
	document.getElementById('pauseAiPresentationBtn')?.addEventListener('click', () => connection.invoke('PauseAiPresentation').catch(console.warn));
	document.getElementById('resumeAiPresentationBtn')?.addEventListener('click', () => connection.invoke('ResumeAiPresentation').catch(console.warn));
	document.getElementById('nextAiPresentationBtn')?.addEventListener('click', () => connection.invoke('NextAiPresentationSpeaker', false).catch(console.warn));
	document.getElementById('skipAiPresentationBtn')?.addEventListener('click', () => connection.invoke('NextAiPresentationSpeaker', true).catch(console.warn));
	document.getElementById('completeAiPresentationTurnStickyBtn')?.addEventListener('click', completeAiPresentationHumanTurn);
	document.getElementById('endAiPresentationBtn')?.addEventListener('click', () => connection.invoke('EndAiPresentation').catch(console.warn));
	document.getElementById('retryAiPresentationBtn')?.addEventListener('click', () => connection.invoke('RetryAiPresentationSpeaker').catch(console.warn));
	document.getElementById('beginAiDiscussionBtn')?.addEventListener('click', () => connection.invoke('BeginAiDiscussion').catch(console.warn));
	connection?.onreconnected?.(() => {
		roomChatState.historyLoaded = false;
		roomChatState.presentation = null;
		roomChatState.presentationRoomId = '';
		refreshAiPresentationState(true);
		updateRoomChatControls();
	});
	document.addEventListener('keydown', event => {
		if (!roomChatState.open) return;
		if (event.key === 'Escape') { event.preventDefault(); closeRoomChat(); return; }
		if (event.key !== 'Tab' || !drawer) return;
		const focusable = [...drawer.querySelectorAll('button:not([hidden]), input:not([disabled])')].filter(item => !item.disabled);
		if (!focusable.length) return;
		const first = focusable[0], last = focusable.at(-1);
		if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
		else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
	});
});
