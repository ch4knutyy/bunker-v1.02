// Room chat is a classic-script domain, like the rest of the Bunker client.
const roomChatState = { ids: new Set(), aiEnabled: true, roomId: '' };

function renderRoomChatMessage(message) {
	const id = message?.id || message?.Id;
	if (!id || roomChatState.ids.has(id)) return;
	roomChatState.ids.add(id);
	const list = document.getElementById('roomChatMessages'); if (!list) return;
	const item = document.createElement('article');
	const senderType = String(message.senderType ?? message.SenderType ?? 'Human').toLowerCase();
	item.className = `room-chat-message room-chat-message--${senderType === 'ai' ? 'ai' : 'human'}`;
	const header = document.createElement('strong'); header.textContent = message.senderName || message.SenderName || 'Unknown';
	const body = document.createElement('p'); body.textContent = message.text || message.Text || '';
	item.append(header, body); list.append(item); list.scrollTop = list.scrollHeight;
}

function replaceRoomChatHistory(messages) {
	roomChatState.ids.clear(); const list = document.getElementById('roomChatMessages'); if (list) list.replaceChildren();
	(messages || []).forEach(renderRoomChatMessage);
}

function updateRoomChatControls() {
	const roomId = currentRoom?.id || currentRoom?.Id || '';
	if (roomId && roomId !== roomChatState.roomId && connection?.state === signalR.HubConnectionState.Connected) {
		roomChatState.roomId = roomId;
		connection.invoke('GetRoomChatHistory').catch(() => {});
	}
	const add = document.getElementById('addAiChatCompanionsBtn'); const toggle = document.getElementById('toggleAiChatBtn');
	if (add) add.hidden = !isHost;
	if (toggle) { toggle.hidden = !isHost; toggle.textContent = roomChatState.aiEnabled ? 'AI: увімкнено' : 'AI: вимкнено'; }
}

document.addEventListener('DOMContentLoaded', () => {
	document.getElementById('roomChatForm')?.addEventListener('submit', async event => {
		event.preventDefault(); const input = document.getElementById('roomChatInput'); const text = input?.value?.trim(); if (!text || !connection) return;
		try { await connection.invoke('SendRoomChatMessage', text, crypto.randomUUID()); input.value = ''; } catch (error) { console.warn('Chat send failed', error); }
	});
	document.getElementById('addAiChatCompanionsBtn')?.addEventListener('click', () => connection.invoke('AddDefaultAiCompanions').catch(console.warn));
	document.getElementById('toggleAiChatBtn')?.addEventListener('click', () => connection.invoke('SetAiChatResponsesEnabled', !roomChatState.aiEnabled).catch(console.warn));
});
