// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function getRoomIdFromPath() {
	const match = window.location.pathname.match(/^\/room\/([^/?#]+)/i);
	return match ? decodeURIComponent(match[1]) : null;
}

function renderCurrentGameUI() {
	applyStaticTranslations();
	if (typeof updateRoomUI === "function") updateRoomUI();
	if (typeof renderMyPlayerCards === "function") {
		try {
			renderMyPlayerCards(myPlayerData);
			renderMySpecialCards(myPlayerData);
			renderMyEventCards(myPlayerData);
		} catch (error) {
			console.warn("Failed to render current player character cards", error);
			const container = document.getElementById("myPlayerCards");
			if (container) container.innerHTML = `<p style="color: var(--color-text-muted);">${t('noData')}</p>`;
		}
	}
	if (typeof renderApocalypse === "function") renderApocalypse(currentApocalypse);
	if (currentBunker && typeof renderBunker === "function") renderBunker(currentBunker);
	if (typeof renderThreatPanel === "function") renderThreatPanel(currentThreat);
	if (typeof updateRoundStatusUI === "function") updateRoundStatusUI();
	if (typeof renderPublicPlayerOverview === "function") renderPublicPlayerOverview();
	if (typeof updateSpecialCardsUI === "function") updateSpecialCardsUI();
	if (typeof updateGMPlayerSelect === "function") updateGMPlayerSelect();
	if (selectedPlayerForGM && typeof loadPlayerDataForGM === "function") loadPlayerDataForGM();
	if (currentGameCompletion) setGameFinishedMutationState(true);
	window.gmPanelV2OnStateChanged?.();
}

function resetClientGameStateForNewRoom() {
	clearOmniscientHiddenState();
	lobbyState = null; lobbyStartPreview = null; lobbyCommandPending = false;
	currentRoom = null;
	myPlayerData = null;
	isHost = false;
	roomPlayers = {};
	selectedPublicPlayerSeat = null;
	gmPlayersData = {};
	selectedPlayerForGM = null;
	pendingJoinRoomId = null;
	hostToken = null;
	currentApocalypse = null;
	if (typeof renderApocalypse === "function") renderApocalypse(null);
	currentBunker = null;
	if (typeof clearBunkerVisualTheme === "function") clearBunkerVisualTheme();
	currentThreat = null;
	currentVoting = null;
	currentRoundState = null;
	currentGameCompletion = null;
	returnFinishedGamePending = false;
	myVote = null;
	if (typeof gmRevealedChars !== "undefined") gmRevealedChars = {};
	gmThreatControlData = { threats: [], currentThreat: null, auditLog: [] };
	gmThreatForcePreview = null;
	gmThreatForceRequestedOutcome = '';
	gmThreatCommandPending = false;
	gmThreatForcePending = false;
	gmPlayerCommandPending = false;
	gmRoundCommandPending = false;
	gmVotingAdminState = { active: false, nonVoters: [], eligibleVoters: [] };
	gmDiagnosticsData = null;
	gmAuditData = { entries: [] };
	gmAutoFixPreview = null;
	gmDiagnosticsPending = false;
	gmSnapshotsData = [];
	gmSnapshotRestorePreview = null;
	gmSnapshotCommandPending = false;
	gmRoomLocalEditorData = { bunkerFields: [], apocalypseFields: [], players: [] };
	gmRoomLocalEditPreview = null;
	gmRoomLocalEditorPending = false;
	omniscientPreview = null;
	omniscientCommandPending = false;
	directorPreview = null;
	directorCommandPending = false;
	gmLastCommandError = '';
	bunkerCapacityPending = false;

	['myPlayerCards', 'publicPlayerSelector', 'selectedPlayerPanel', 'roomPlayersList', 'apocalypseContent', 'bunkerContent', 'votingCandidates', 'votingResultsContent', 'specialCardsTableBody', 'gmSpecialCardsList'].forEach(id => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = '';
	});

	['gameSection', 'votingPanel', 'votingResultsPanel', 'gmPanel', 'gmPlayerInfo', 'roundStatusPanel', 'specialCardsSection'].forEach(id => {
		const el = document.getElementById(id);
		if (el) el.style.display = 'none';
	});
}

function clearLegacyRoomStateOnly() {
	const cleanupKey = "bunker_https_cleanup_v1";
	if (localStorage.getItem(cleanupKey) === "done") return;

	[
		"currentRoomId",
		"currentPlayerId",
		"playerCharacter",
		"currentRoom",
		"currentPlayerCharacter"
	].forEach(key => localStorage.removeItem(key));

	[
		"currentRoomId",
		"currentPlayerId",
		"playerCharacter",
		"currentRoom",
		"currentPlayerCharacter"
	].forEach(key => sessionStorage.removeItem(key));

	localStorage.setItem(cleanupKey, "done");
}

function updateConnectionStatus(status, isError = false) {
	const statusEl = document.getElementById('connectionStatus');
	const createBtn = document.getElementById('createRoomBtn');
	if (statusEl) {
		statusEl.style.display = 'block';
		statusEl.style.color = isError ? 'var(--color-red)' : 'var(--color-green)';
		statusEl.textContent = status;
		// Ховаємо статус через 3 секунди якщо успішно
		if (!isError) {
			setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
		}
	}
	if (createBtn) {
		createBtn.disabled = isError;
		createBtn.style.opacity = isError ? '0.5' : '1';
	}
}

function validatePlayerName(name) {
	if (!name || name.trim().length === 0) {
		return { valid: false, error: "Ім'я гравця обов'язкове" };
	}
	name = name.trim();
	if (name.length > 10) {
		return { valid: false, error: "Ім'я гравця не може перевищувати 10 символів" };
	}
	return { valid: true, name: name };
}

function saveSession(roomId, playerName, currentHostToken) {
	try {
		const hostValue = currentHostToken || '';
		const isHostValue = (!!hostValue || isHost).toString();

		sessionStorage.setItem(sessionKeys.roomId, roomId);
		sessionStorage.setItem(sessionKeys.playerName, playerName);
		sessionStorage.setItem(sessionKeys.stablePlayerId, stablePlayerId);
		if (currentHostToken) {
			sessionStorage.setItem(sessionKeys.hostToken, currentHostToken);
		} else {
			sessionStorage.removeItem(sessionKeys.hostToken);
		}
		sessionStorage.setItem(sessionKeys.isHost, isHostValue);

		localStorage.setItem(sessionKeys.roomId, roomId);
		localStorage.setItem(sessionKeys.playerName, playerName);
		localStorage.setItem(sessionKeys.stablePlayerId, stablePlayerId);
		if (reconnectToken) {
			sessionStorage.setItem(sessionKeys.reconnectToken, reconnectToken);
			localStorage.setItem(sessionKeys.reconnectToken, reconnectToken);
		}
		localStorage.setItem(sessionKeys.isHost, isHostValue);
		if (currentHostToken) {
			localStorage.setItem(sessionKeys.hostToken, currentHostToken);
		} else {
			localStorage.removeItem(sessionKeys.hostToken);
		}

		// Також зберігаємо ім'я в localStorage для автозаповнення
		localStorage.setItem('bunker_lastPlayerName', playerName);
	} catch (e) { console.warn('Session save failed:', e); }
}

function getOrCreatePlayerId() {
	let playerId = localStorage.getItem(sessionKeys.stablePlayerId) || localStorage.getItem('bunker_playerId');
	if (!playerId) {
		playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
	}
	localStorage.setItem(sessionKeys.stablePlayerId, playerId);
	localStorage.setItem('bunker_playerId', playerId);
	return playerId;
}

function clearSession() {
	try {
		Object.values(sessionKeys).forEach(key => {
			sessionStorage.removeItem(key);
			if (key !== sessionKeys.stablePlayerId) {
				localStorage.removeItem(key);
			}
		});
	} catch (e) { }
}

function loadSession() {
	try {
		return {
			roomId: sessionStorage.getItem(sessionKeys.roomId) || localStorage.getItem(sessionKeys.roomId),
			playerName: sessionStorage.getItem(sessionKeys.playerName) || localStorage.getItem(sessionKeys.playerName),
			hostToken: sessionStorage.getItem(sessionKeys.hostToken) || localStorage.getItem(sessionKeys.hostToken),
			stablePlayerId: sessionStorage.getItem(sessionKeys.stablePlayerId) || localStorage.getItem(sessionKeys.stablePlayerId)
			, reconnectToken: sessionStorage.getItem(sessionKeys.reconnectToken) || localStorage.getItem(sessionKeys.reconnectToken)
		};
	} catch (e) { return { roomId: null, playerName: null }; }
}

function tryRejoin() {
	var session = loadSession();
	var rejoinStablePlayerId = session.stablePlayerId || stablePlayerId;
	if (session.roomId && session.playerName && rejoinStablePlayerId) {
		hostToken = session.hostToken || null;
		reconnectToken = session.reconnectToken || null;
		console.log('Attempting rejoin with playerId:', rejoinStablePlayerId);
		connection.invoke("RejoinRoom", session.roomId, session.playerName, rejoinStablePlayerId, session.reconnectToken || null)
			.catch(function (err) {
				console.error("RejoinRoom error:", err);
				clearSession();
				connection.invoke("GetRooms").catch(getRoomsErr => console.error("GetRooms after failed rejoin error:", getRoomsErr));
			});
		return true;
	}
	return false;
}

function prefillPlayerName() {
	try {
		var lastPlayerName = localStorage.getItem('bunker_lastPlayerName');
		if (lastPlayerName) {
			var createInput = document.getElementById('playerNameCreate');
			if (createInput && !createInput.value) {
				createInput.value = lastPlayerName;
			}
		}
	} catch (e) { }
}

function createRoom() {
	console.log('[CreateRoom] Function called');

	const playerName = document.getElementById('playerNameCreate').value.trim();
	const roomName = document.getElementById('roomName').value.trim();
	const maxPlayers = parseInt(document.getElementById('maxPlayers').value) || 12;
	const password = document.getElementById('roomPassword').value || null;
	const btn = document.getElementById('createRoomBtn');

	// Валідація
	if (!playerName) {
		alert("Введіть ім’я гравця");
		document.getElementById('playerNameCreate').focus();
		return;
	}

	if (!roomName) {
		alert("Введіть назву кімнати");
		document.getElementById('roomName').focus();
		return;
	}

	// Перевіряємо з'єднання
	if (connection.state !== signalR.HubConnectionState.Connected) {
		updateConnectionStatus("✗ Немає з'єднання. Зачекайте...", true);
		return;
	}

	// Блокуємо кнопку на час запиту
	if (btn) {
		btn.disabled = true;
		btn.textContent = 'Створення...';
	}

	clearSession();
	resetClientGameStateForNewRoom();

	console.log('[CreateRoom] Invoking CreateRoom with:', { roomName, playerName, maxPlayers, hasPassword: !!password, playerId: stablePlayerId });

	connection.invoke("CreateRoom", roomName, playerName, maxPlayers, password, stablePlayerId)
		.then(() => {
			console.log('[CreateRoom] Invoke successful');
		})
		.catch(function (err) {
			console.error("[CreateRoom] Error:", err);
			alert("Помилка створення кімнати: " + (err.message || err));
			// Повертаємо кнопку
			if (btn) {
				btn.disabled = false;
				btn.textContent = 'Створити кімнату';
			}
		});
}

function getInviteLink(roomId) {
	if (!roomId) return '';
	return `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
}

function fallbackCopyText(text) {
	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.top = '-1000px';
	textarea.style.left = '-1000px';
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand('copy');
	textarea.remove();
}

async function copyInviteLink() {
	const inviteLink = getInviteLink(currentRoom?.id);
	if (!inviteLink) return '';

	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(inviteLink);
		} else {
			fallbackCopyText(inviteLink);
		}
	} catch (err) {
		console.warn('Clipboard API failed, using fallback copy:', err);
		fallbackCopyText(inviteLink);
	}

	const btn = document.getElementById('copyInviteLinkBtn');
	if (btn) {
		const originalText = btn.textContent;
		btn.textContent = getCurrentLanguage() === 'en' ? 'Copied' : getCurrentLanguage() === 'ru' ? 'Скопировано' : 'Скопійовано';
		window.setTimeout(() => {
			btn.textContent = originalText;
		}, 1600);
	}

	return inviteLink;
}

function openJoinRoomModal(roomId) {
	const modal = document.getElementById('joinModal');
	const roomInput = document.getElementById('joinRoomId');
	const joinNameInput = document.getElementById('playerNameJoin');
	const createNameInput = document.getElementById('playerNameCreate');

	if (!modal || !roomInput) return;

	roomInput.value = roomId;
	const observerOption = document.getElementById('developerObserverOption');
	if (observerOption) observerOption.hidden = !isDeveloper;
	if (joinNameInput && !joinNameInput.value.trim()) {
		joinNameInput.value = createNameInput?.value?.trim() || localStorage.getItem('bunker_lastPlayerName') || '';
	}
	modal.style.display = 'flex';
	joinNameInput?.focus();
}

function joinRoom(roomId, hasPassword, forceDeveloperObserver = false) {
	if (hasPassword || isDeveloper || forceDeveloperObserver) {
		openJoinRoomModal(roomId);

		const observer = document.getElementById(
			'joinAsDeveloperObserver'
		);

		if (observer) {
			observer.checked = !!forceDeveloperObserver;
		}

		return;
	}

	const typedName =
		document.getElementById('playerNameJoin')?.value?.trim() ||
		document.getElementById('playerNameCreate')?.value?.trim() ||
		'';

	const playerName =
		typedName ||
		prompt('Введіть ваше ім’я (макс. 10 символів):');

	if (!playerName?.trim()) {
		return;
	}

	const validation = validatePlayerName(playerName);

	if (!validation.valid) {
		alert(validation.error);
		return;
	}

	connection.invoke(
		'JoinRoom',
		roomId,
		validation.name,
		null,
		stablePlayerId,
		loadSession().reconnectToken || null,
		false
	).catch(error => {
		console.error('JoinRoom error:', error);
	});
}

function submitJoinRoom() {
	const playerNameRaw = document.getElementById('playerNameJoin').value;
	const password = document.getElementById('joinRoomPassword').value || null;
	const roomId = document.getElementById('joinRoomId').value;
	const developerObserver = isDeveloper && !!document.getElementById('joinAsDeveloperObserver')?.checked;

	// Validate name
	const validation = validatePlayerName(playerNameRaw);
	if (!validation.valid) {
		alert(validation.error);
		document.getElementById('playerNameJoin').focus();
		return;
	}

	const playerName = validation.name;

	// Зберігаємо roomId для перевірки в RoomJoined handler
	pendingJoinRoomId = roomId;

	connection.invoke("JoinRoom", roomId, playerName, password, stablePlayerId, loadSession().reconnectToken || null, developerObserver)
		.catch(err => {
			console.error("JoinRoom error:", err);
			pendingJoinRoomId = null;
		});
	// Модалка закриється автоматично в RoomJoined handler
}

function closeJoinModal() {
	document.getElementById('joinModal').style.display = 'none';
	document.getElementById('playerNameJoin').value = '';
	document.getElementById('joinRoomPassword').value = '';
	const observer = document.getElementById('joinAsDeveloperObserver');
	if (observer) observer.checked = false;
}

function leaveRoom() {
	if (confirm("Ви впевнені, що хочете покинути кімнату?")) {
		connection.invoke("LeaveRoom")
			.catch(err => console.error("LeaveRoom error:", err));
	}
}

function getMyStablePlayerId() {
	return myPlayerData?.stablePlayerId ||
		roomPlayers?.[myConnectionId]?.stablePlayerId ||
		stablePlayerId ||
		"";
}

function isMyPlayerRef(connectionId, stableId) {
	const myStable = getMyStablePlayerId();
	return (!!connectionId && connectionId === myConnectionId) ||
		(!!stableId && !!myStable && stableId === myStable);
}
