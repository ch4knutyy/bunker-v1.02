// Room chat is a classic-script domain, like the rest of the Bunker client.
const roomChatState = { ids: new Set(), aiEnabled: true, roomId: '', historyLoaded: false, open: false, unread: 0, trigger: null };

function updateRoomChatAiStatus(data) { const status = document.getElementById('roomChatAiStatus'); if (!status) return; const state = data?.state || data?.State; const name = data?.name || data?.Name || 'AI'; const error = data?.error || data?.Error; if (state === 'typing') { status.hidden = false; status.textContent = `${name} ${t('roomChatTyping')}`; return; } if (error) { status.hidden = false; status.textContent = t({ ai_not_configured: 'roomChatAiUnavailable', ai_auth_failed: 'roomChatAiUnavailable', ai_model_not_found: 'roomChatAiUnavailable', ai_rate_limited: 'roomChatAiBusy', ai_timeout: 'roomChatAiBusy', ai_provider_unavailable: 'roomChatAiBusy', ai_network_error: 'roomChatAiBusy' }[error] || 'roomChatAiUnavailable'); return; } status.hidden = true; }

function roomChatElements() { return { drawer: document.getElementById('roomChatDrawer'), trigger: document.getElementById('roomChatButton'), input: document.getElementById('roomChatInput'), list: document.getElementById('roomChatMessages'), badge: document.getElementById('roomChatUnread') }; }
function updateRoomChatUnread() { const { badge } = roomChatElements(); if (!badge) return; badge.hidden = roomChatState.unread === 0; badge.textContent = roomChatState.unread > 9 ? '9+' : String(roomChatState.unread); }
function openRoomChat() { const { drawer, trigger, input } = roomChatElements(); if (!drawer) return; roomChatState.trigger = document.activeElement; roomChatState.open = true; roomChatState.unread = 0; drawer.classList.add('is-open'); drawer.setAttribute('aria-hidden', 'false'); trigger?.setAttribute('aria-expanded', 'true'); updateRoomChatUnread(); updateRoomChatControls(); requestAnimationFrame(() => input?.focus()); }
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
	const header = document.createElement('strong'); header.textContent = message.senderName || message.SenderName || 'Unknown';
	if (senderType === 'ai') { const badge = document.createElement('span'); badge.className = 'room-chat-ai-badge'; badge.textContent = 'AI'; header.append(' ', badge); }
	const time = document.createElement('time'); const timestamp = message.timestamp || message.Timestamp; time.textContent = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''; time.dateTime = timestamp || '';
	const body = document.createElement('p'); body.textContent = message.text || message.Text || '';
	item.append(header, time, body); list.append(item);
	if (roomChatState.open && shouldStick) list.scrollTop = list.scrollHeight;
	if (!roomChatState.open) { roomChatState.unread++; updateRoomChatUnread(); }
}

function replaceRoomChatHistory(messages) {
	roomChatState.ids.clear(); const { list } = roomChatElements(); if (list) list.replaceChildren();
	(messages || []).forEach(renderRoomChatMessage); roomChatState.historyLoaded = true;
}

function updateRoomChatControls() {
	const roomId = currentRoom?.id || currentRoom?.Id || '';
	if (roomId && (roomId !== roomChatState.roomId || !roomChatState.historyLoaded) && connection?.state === signalR.HubConnectionState.Connected) {
		roomChatState.roomId = roomId; roomChatState.historyLoaded = true;
		connection.invoke('GetRoomChatHistory').catch(() => { roomChatState.historyLoaded = false; });
	}
	const add = document.getElementById('addAiChatCompanionsBtn'); const toggle = document.getElementById('toggleAiChatBtn');
	const { trigger } = roomChatElements(); if (trigger) trigger.hidden = !roomId;
	if (trigger) { trigger.textContent = t('roomChatTitle'); trigger.setAttribute('aria-label', t('roomChatTitle')); trigger.title = t('roomChatTitle'); }
	const close = document.getElementById('roomChatCloseButton'); if (close) close.setAttribute('aria-label', t('roomChatClose'));
	const connectionStatus = document.getElementById('roomChatConnection'); if (connectionStatus) connectionStatus.textContent = connection?.state === signalR.HubConnectionState.Connected ? t('roomChatConnected') : t('roomChatReconnecting');
	if (add) add.hidden = !isHost;
	if (toggle) { toggle.hidden = !isHost; toggle.textContent = roomChatState.aiEnabled ? t('roomChatAiOn') : t('roomChatAiOff'); }
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
