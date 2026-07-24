// ==================== SIGNALR EVENT REGISTRATIONS ====================
// registerSignalREvents() — registers all 110 incoming SignalR event handlers.
// Relocated from game.js; callback logic unchanged.

function registerSignalREvents() {
	connection.off("ApocalypseEffectActivated");
	connection.on("ApocalypseEffectActivated", function (data) {
		if (showApocalypseEffectBanner(data)) triggerApocalypseVisualReaction('apocalypse-effect');
	});

	connection.off("ApocalypseEffectPersonalChanged");
	connection.on("ApocalypseEffectPersonalChanged", function (data) {
		showApocalypseEffectPersonalChanges(data);
		const safeFields = new Set(['Personality', 'Body', 'Profession', 'PhysicalHealth', 'MentalHealth', 'Hobby', 'CharacterTrait', 'Phobia', 'Fact', 'Inventory', 'Property']);
		for (const change of (data?.changes ?? data?.Changes ?? [])) {
			const field = String(change?.field ?? change?.Field ?? '');
			if (!safeFields.has(field)) continue;
			const card = document.querySelector(`#myPlayerCards [data-characteristic-type="${field}"]`);
			if (card) {
				card.classList.remove('apocalypse-personal-change');
				void card.offsetWidth;
				card.classList.add('apocalypse-personal-change');
				window.setTimeout(() => card.classList.remove('apocalypse-personal-change'), 700);
			}
		}
	});

	connection.off("RoomsListUpdated");
	connection.on("RoomsListUpdated", function (rooms) {
		console.log("Rooms updated:", rooms);
		renderRoomsList(rooms);
	});

	connection.off("RoomCreated");
	connection.on("RoomCreated", function (data) {
		console.log("[RoomCreated] Room creation payload received");

		resetClientGameStateForNewRoom();

		currentRoom = data.room || data.Room;
		myPlayerData = normalizePlayer(data.player || data.Player);
		isHost = data.isHost ?? data.IsHost ?? true;
		applyDeveloperAccessState(data.developer || data.Developer || null);
		applyDeveloperPresence(data.developerPresence || data.DeveloperPresence || null);
		applyPostGameTransition(data.postGameTransition || data.PostGameTransition || null);
		hostToken = data.hostToken || data.HostToken || null;
		reconnectToken = data.reconnectToken || data.ReconnectToken || reconnectToken;
		myConnectionId = myPlayerData.connectionId;

		if (currentRoom) {
			currentRoom.state = currentRoom.state || currentRoom.State || "Lobby";
			currentRoom.name = currentRoom.name || currentRoom.Name || "Кімната";
			currentRoom.id = currentRoom.id || currentRoom.Id;
			currentRoom.maxPlayers = currentRoom.maxPlayers || currentRoom.MaxPlayers || 12;
		}
		applyRoundState(data.roundState || data.RoundState);

		console.log("[RoomCreated] Normalized myPlayerData:", myPlayerData);
		console.log("[RoomCreated] myConnectionId:", myConnectionId);
		console.log("[RoomCreated] isHost:", isHost);

		const btn = document.getElementById('createRoomBtn');
		if (btn) {
			btn.disabled = false;
			btn.textContent = 'Створити кімнату';
		}

		saveSession(currentRoom.id, myPlayerData.name, hostToken);

		roomPlayers = {};
		const players = data.players || data.Players || [];
		players.forEach(p => {
			const connId = p.connectionId || p.ConnectionId;
			if (!connId) return;

			const revealedValues = normalizeRevealedValues(p.revealedValues || p.RevealedValues || {});
			const revealedSources = normalizeRevealedSources(p.revealedSources || p.RevealedSources || {});
			roomPlayers[connId] = {
				name: p.name || p.Name,
				connectionId: connId,
				stablePlayerId: p.stablePlayerId || p.StablePlayerId || "",
				isHost: p.isHost ?? p.IsHost ?? false,
				isDeveloper: !!(p.isDeveloper ?? p.IsDeveloper),
				developerParticipationMode: p.developerParticipationMode || p.DeveloperParticipationMode || null,
				isSpectatorGm: !!(p.isSpectatorGm ?? p.IsSpectatorGm),
				publicRole: p.publicRole || p.PublicRole || '',
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				revealedData: revealedValues.revealedData,
				fact: normalizeFactFromPlayer({ ...p, fact: revealedSources.fact || p.fact || p.Fact, revealedData: revealedValues.revealedData, revealedTooltips: revealedValues.revealedTooltips }),
				revealedSources: revealedSources,
				revealedTooltips: revealedValues.revealedTooltips,
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(p.additionalConditionEffects || p.AdditionalConditionEffects || []),
				isEliminated: p.isEliminated ?? p.IsEliminated ?? false,
				eliminatedAtRound: p.eliminatedAtRound ?? p.EliminatedAtRound ?? null,
				eliminatedByVote: !!(p.eliminatedByVote ?? p.EliminatedByVote),
				canRevealAllAfterElimination: !!(p.canRevealAllAfterElimination ?? p.CanRevealAllAfterElimination),
				hasRevealedAllAfterElimination: !!(p.hasRevealedAllAfterElimination ?? p.HasRevealedAllAfterElimination),
				seatNumber: p.seatNumber ?? p.SeatNumber ?? 0,
				isConnected: p.isConnected ?? p.IsConnected ?? true
			};
		});

		if (!roomPlayers[myConnectionId]) {
			roomPlayers[myConnectionId] = {
				name: myPlayerData.name,
				connectionId: myConnectionId,
				stablePlayerId: stablePlayerId,
				isHost: isHost,
				revealed: normalizeRevealedState(myPlayerData.revealed || {}),
				revealedData: {},
				fact: myPlayerData.fact,
				revealedSources: {},
				revealedTooltips: {},
				additionalConditionEffects: myPlayerData.additionalConditionEffects || [],
				isEliminated: myPlayerData.isEliminated || false,
				eliminatedAtRound: myPlayerData.eliminatedAtRound || null,
				eliminatedByVote: !!myPlayerData.eliminatedByVote,
				canRevealAllAfterElimination: !!myPlayerData.canRevealAllAfterElimination,
				hasRevealedAllAfterElimination: !!myPlayerData.hasRevealedAllAfterElimination,
				seatNumber: myPlayerData.seatNumber || 0,
				isConnected: true
			};
		}

		console.log("[RoomCreated] roomPlayers:", roomPlayers);

		showRoomSection();
		renderCurrentGameUI();

		addEventMessage(`Ви створили кімнату <span class="event-room">${currentRoom.name}</span>`);
	});

	// Приєднались до кімнати
	connection.off("RoomJoined");
	connection.on("RoomJoined", function (data) {
		console.log("[RoomJoined] Room join payload received");

		currentRoom = data.room || data.Room;
		myPlayerData = normalizePlayer(data.player || data.Player);
		isHost = data.isHost ?? data.IsHost ?? false;
		applyDeveloperAccessState(data.developer || data.Developer || null);
		applyDeveloperPresence(data.developerPresence || data.DeveloperPresence || null);
		applyPostGameTransition(data.postGameTransition || data.PostGameTransition || null);
		hostToken = data.hostToken || data.HostToken || null;
		reconnectToken = data.reconnectToken || data.ReconnectToken || reconnectToken;
		myConnectionId = myPlayerData.connectionId;

		if (currentRoom) {
			currentRoom.state = currentRoom.state || currentRoom.State || "Lobby";
			currentRoom.name = currentRoom.name || currentRoom.Name || "Кімната";
			currentRoom.id = currentRoom.id || currentRoom.Id;
			currentRoom.maxPlayers = currentRoom.maxPlayers || currentRoom.MaxPlayers || 12;
		}
		applyRoundState(data.roundState || data.RoundState);

		console.log("[RoomJoined] Normalized myPlayerData:", myPlayerData);
		console.log("[RoomJoined] myConnectionId:", myConnectionId);

		// Закриваємо модалку join якщо була відкрита
		pendingJoinRoomId = null;
		closeJoinModal();

		// Зберігаємо сесію в localStorage
		saveSession(currentRoom.id, myPlayerData.name, hostToken);

		roomPlayers = {};
		const players = data.players || data.Players || [];
		players.forEach(p => {
			const connId = p.connectionId || p.ConnectionId;
			const revealedValues = normalizeRevealedValues(p.revealedValues || p.RevealedValues || {});
			const revealedSources = normalizeRevealedSources(p.revealedSources || p.RevealedSources || {});
			roomPlayers[connId] = {
				name: p.name || p.Name,
				connectionId: connId,
				stablePlayerId: p.stablePlayerId || p.StablePlayerId || "",
				isHost: p.isHost ?? p.IsHost ?? false,
				isDeveloper: !!(p.isDeveloper ?? p.IsDeveloper),
				developerParticipationMode: p.developerParticipationMode || p.DeveloperParticipationMode || null,
				isSpectatorGm: !!(p.isSpectatorGm ?? p.IsSpectatorGm),
				publicRole: p.publicRole || p.PublicRole || '',
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				fact: normalizeFactFromPlayer({ ...p, fact: revealedSources.fact || p.fact || p.Fact, revealedData: revealedValues.revealedData, revealedTooltips: revealedValues.revealedTooltips }),
				revealedData: revealedValues.revealedData,
				revealedSources: revealedSources,
				revealedTooltips: revealedValues.revealedTooltips,
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(p.additionalConditionEffects || p.AdditionalConditionEffects || []),
				isEliminated: p.isEliminated ?? p.IsEliminated ?? false,
				eliminatedAtRound: p.eliminatedAtRound ?? p.EliminatedAtRound ?? null,
				eliminatedByVote: !!(p.eliminatedByVote ?? p.EliminatedByVote),
				canRevealAllAfterElimination: !!(p.canRevealAllAfterElimination ?? p.CanRevealAllAfterElimination),
				hasRevealedAllAfterElimination: !!(p.hasRevealedAllAfterElimination ?? p.HasRevealedAllAfterElimination),
				seatNumber: p.seatNumber ?? p.SeatNumber ?? 0
			};
		});

		console.log("[RoomJoined] roomPlayers:", roomPlayers);

		showRoomSection();
		renderCurrentGameUI();
		addEventMessage(`Ви приєднались до кімнати <span class="event-room">${currentRoom.name}</span>`);
	});

	// Гравець приєднався до кімнати
	connection.off("PlayerJoinedRoom");
	connection.on("PlayerJoinedRoom", function (info) {
		console.log("Player joined room:", info);
		roomPlayers[info.connectionId] = {
			name: info.name,
			connectionId: info.connectionId,
			stablePlayerId: info.stablePlayerId || info.StablePlayerId || "",
			isHost: info.isHost,
			isDeveloper: !!(info.isDeveloper ?? info.IsDeveloper),
			developerParticipationMode: info.developerParticipationMode || info.DeveloperParticipationMode || null,
			revealed: normalizeRevealedState(info.revealed || {}),
			fact: normalizeFactFromPlayer(info),
			revealedData: {},
			revealedSources: normalizeRevealedSources(info.revealedSources || info.RevealedSources || {}),
			revealedTooltips: {}
		};
		renderCurrentGameUI();
		addEventMessage(`Гравець <span class="event-player">${info.name}</span> приєднався`);
	});

	connection.off('DeveloperPresenceChanged');
	connection.on('DeveloperPresenceChanged', applyDeveloperPresence);
	connection.off('DeveloperAuthorityChanged');
	connection.on('DeveloperAuthorityChanged', applyDeveloperAccessState);
	connection.off('PostGameTransitionChanged');
	connection.on('PostGameTransitionChanged', applyPostGameTransition);

	// Гравець покинув кімнату
	connection.off("PlayerLeftRoom");
	connection.on("PlayerLeftRoom", function (info) {
		console.log("Player left room:", info);
		const leftPlayer = roomPlayers[info.connectionId];
		const leftName = leftPlayer?.name || info.playerName || 'Гравець';
		delete roomPlayers[info.connectionId];

		// Якщо змінився хост
		if (info.newHostConnectionId) {
			if (roomPlayers[info.newHostConnectionId]) {
				roomPlayers[info.newHostConnectionId].isHost = true;
			}
			if (info.newHostConnectionId === myConnectionId) {
				isHost = true;
				addEventMessage(`Ви тепер хост кімнати!`);
			} else {
				addEventMessage(`<span class="event-player">${info.newHostName}</span> тепер хост`);
			}
		}

		renderCurrentGameUI();
		const reason = info.reason === 'timeout' ? ' (timeout)' : '';
		addEventMessage(`Гравець <span class="event-player">${leftName}</span> покинув кімнату${reason}`);
	});

	connection.off("RoomPlayersUpdated");
	connection.on("RoomPlayersUpdated", function (players) {
		const next = {};
		(players || []).forEach(p => {
			const connectionId = p.connectionId || p.ConnectionId;
			if (!connectionId) return;
			next[connectionId] = {
				...(roomPlayers[connectionId] || {}), ...p, connectionId,
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				revealedData: normalizeRevealedValues(p.revealedValues || p.RevealedValues || {}).revealedData,
				revealedSources: normalizeRevealedSources(p.revealedSources || p.RevealedSources || {}),
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(p.additionalConditionEffects || p.AdditionalConditionEffects || [])
			};
		});
		roomPlayers = next;
		renderCurrentGameUI();
		updateGMPlayerSelect();
		const me = Object.values(roomPlayers).find(p => isMyPlayerRef(p.connectionId, p.stablePlayerId));
		if (me && !(me.isSpectatorGm || me.IsSpectatorGm)) clearOmniscientHiddenState();
	});

	connection.off("LobbyStateUpdated");
	connection.on("LobbyStateUpdated", function (state) {
		const version = Number(state?.stateVersion ?? state?.StateVersion ?? 0);
		const currentVersion = Number(lobbyState?.stateVersion ?? lobbyState?.StateVersion ?? 0);
		if (currentVersion && version < currentVersion) return;
		syncLobbySettingsState(state);
		lobbyState = state; lobbyStartPreview = null; renderLobbyState();
		const guestWarningRevision = Number(state?.guestWarningRevision ?? state?.GuestWarningRevision ?? 0);
		const requestedRevision = Number(state?.guestWarningRequestedRevision ?? state?.GuestWarningRequestedRevision ?? 0);
		if (guestWarningRevision > 0 && requestedRevision === guestWarningRevision) {
			showGuestWarningIfEligible(guestWarningRevision);
		}
		tryRenderRunningGameState();
	});

	connection.off("GameReturnedToLobby");
	connection.on("GameReturnedToLobby", function (data) {
		clearGameFinishedStateForLobby();
		if (currentRoom) {
			currentRoom.state = data?.state || data?.State || 'Lobby';
			currentRoom.phase = data?.currentPhase || data?.CurrentPhase || 'Lobby';
			currentRoom.currentRound = 0;
		}
		const nextLobbyState = data?.lobbyState || data?.LobbyState || null;
		if (nextLobbyState) {
			syncLobbySettingsState(nextLobbyState);
			lobbyState = nextLobbyState;
		}
		showRoomSection();
		renderLobbyState();
	});

	connection.off("LobbyKicked");
	connection.on("LobbyKicked", function () {
		lobbySettingsDraft = null; lobbySettingsDirty = false;
		alert(t('lobbyKicked'));
		window.location.reload();
	});

	connection.off("OmniscientHiddenStateUpdated");
	connection.on("OmniscientHiddenStateUpdated", function (state) {
		const version = Number(state?.stateVersion ?? state?.StateVersion ?? 0);
		if (!version || version <= omniscientHiddenStateVersion) return;
		omniscientHiddenStateVersion = version;
		omniscientHiddenState = state;
		renderOmniscientHiddenState();
		renderCurrentGameUI();
	});

	connection.off("PlayerStateResynced");

	connection.on("PlayerStateResynced", function (data) {
		const playerPayload = data?.player ?? data?.Player ?? data;

		console.log("[HANDOFF] PlayerStateResynced", {
			hasPayload: Boolean(playerPayload),
			playerId: playerPayload?.id ?? playerPayload?.Id,
			hasProfession: Boolean(
				playerPayload?.profession ?? playerPayload?.Profession
			),
			hasPhysicalHealth: Boolean(
				playerPayload?.physicalHealth ?? playerPayload?.PhysicalHealth
			),
			hasHobby: Boolean(
				playerPayload?.hobby ?? playerPayload?.Hobby
			),
			hasSpecialCards: Array.isArray(
				playerPayload?.specialCards ?? playerPayload?.SpecialCards
			)
		});

		if (!playerPayload) {
			console.error("[HANDOFF] PlayerStateResynced без player payload");
			return;
		}

		const normalizedPlayer = normalizePlayer(playerPayload);

		if (!normalizedPlayer) {
			console.error("[HANDOFF] Не вдалося нормалізувати player snapshot");
			return;
		}

		myPlayerData = normalizedPlayer;
		pendingCharacteristicReveals.clear();

		tryRenderRunningGameState();

		if (!isLobbyRunning()) {
			renderCurrentGameUI();
		}
	});

	connection.off("EventSpecialCardsUpdated");
	connection.on("EventSpecialCardsUpdated", function (data) {
		if (!myPlayerData) return;
		myPlayerData.eventSpecialCards = data?.cards || data?.Cards || [];
		renderMyEventCards(myPlayerData);
	});

	connection.off("PlayerKicked");
	connection.on("PlayerKicked", function (data) {
		alert(data.message || data.Message || 'Вас виключено з кімнати');
		currentRoom = null; myPlayerData = null; isHost = false; roomPlayers = {}; currentApocalypse = null;
		renderApocalypse(null);
		clearSession(); showLobbySection();
	});

	connection.off("HostChanged");
	connection.on("HostChanged", function (data) {
		const oldId = data.oldHostConnectionId || data.OldHostConnectionId;
		const newId = data.newHostConnectionId || data.NewHostConnectionId;
		if (roomPlayers[oldId]) roomPlayers[oldId].isHost = false;
		if (roomPlayers[newId]) roomPlayers[newId].isHost = true;
		isHost = newId === myConnectionId;
		renderCurrentGameUI();
	});

	connection.off("StaleConnectionInspected");
	connection.on("StaleConnectionInspected", function (data) {
		gmPlayerCommandPending = false;
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
		const result = document.getElementById('gmPlayerCommandResult');
		if (result) result.textContent = data.message || data.Message || '';
	});

	// Гравець відключився (може перепідключитись)
	connection.off("PlayerDisconnecting");
	connection.on("PlayerDisconnecting", function (info) {
		console.log("Player disconnecting:", info);
		addEventMessage(`Гравець <span class="event-player">${info.playerName}</span> втратив з'єднання (очікування ${info.reconnectTimeout}с)...`);
	});

	// Покинув кімнату
	connection.off("RoomLeft");
	connection.on("RoomLeft", function () {
		console.log("Left room");
		clearOmniscientHiddenState();
		lobbyState = null; lobbyStartPreview = null; lobbyCommandPending = false;
		currentRoom = null;
		myPlayerData = null;
		isHost = false;
		roomPlayers = {};
		currentApocalypse = null;
		renderApocalypse(null);
		gmThreatControlData = { threats: [], currentThreat: null, auditLog: [] };
		gmThreatForcePreview = null;
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
		selectedPlayerForGM = null;
		clearSession();
		showLobbySection();
		addEventMessage(`Ви покинули кімнату`);
	});

	// Гра почалась
	connection.off("GameStarted");
	connection.on("GameStarted", function (data) {
		console.log("=== GAME STARTED ===");
		console.log("[GameStarted] Raw data:", data);
		console.log("[GameStarted] data.roomState:", data.roomState);
		console.log("[GameStarted] data.apocalypse:", data.apocalypse);
		console.log("[GameStarted] data.bunker:", data.bunker);
		console.log("[GameStarted] data.players:", data.players);

		isStartingGame = false;
		hideGuestWarningModal(false);
		clearGameFinishedStateForLobby();
		console.log("[GameStarted] Reset isStartingGame = false");

		// Normalize room state (handle both camelCase and PascalCase)
		const roomState = data.roomState || data.RoomState || "Playing";

		if (currentRoom) {
			currentRoom.state = roomState;
			console.log("[GameStarted] Updated currentRoom.state:", currentRoom.state);
		}
		applyRoundState(data.roundState || data.RoundState);

		syncPublicGameSettings(data);
		// Keep the complete canonical snapshot. The renderer localizes and normalizes it on every render.
		const apocalypse = data.apocalypse || data.Apocalypse;
		currentApocalypse = apocalypse || null;
		console.log("[GameStarted] Normalized apocalypse:", currentApocalypse);

		// Keep the complete canonical bunker snapshot; the renderer normalizes it per language.
		const bunker = data.bunker || data.Bunker;
		currentBunker = bunker || null;
		console.log("[GameStarted] Normalized bunker:", currentBunker);

		// Update players with seat numbers
		const players = data.players || data.Players || [];
		console.log("[GameStarted] Players to update:", players);

		players.forEach(function (p) {
			const connId = p.connectionId || p.ConnectionId;
			const seatNum = p.seatNumber ?? p.SeatNumber ?? 0;

			if (roomPlayers[connId]) {
				roomPlayers[connId].seatNumber = seatNum;
				roomPlayers[connId].isEliminated = p.isEliminated ?? p.IsEliminated ?? false;
				roomPlayers[connId].eliminatedAtRound = p.eliminatedAtRound ?? p.EliminatedAtRound ?? null;
				roomPlayers[connId].eliminatedByVote = !!(p.eliminatedByVote ?? p.EliminatedByVote);
				roomPlayers[connId].canRevealAllAfterElimination = !!(p.canRevealAllAfterElimination ?? p.CanRevealAllAfterElimination);
				roomPlayers[connId].hasRevealedAllAfterElimination = !!(p.hasRevealedAllAfterElimination ?? p.HasRevealedAllAfterElimination);
				console.log(`[GameStarted] Updated player ${connId} seat: ${seatNum}`);
			}
		});

		// Update UI visibility
		console.log("[GameStarted] Updating UI visibility...");

		const roomLobby = document.getElementById('roomLobby');
		const gameSection = document.getElementById('gameSection');
		const myPlayerSection = document.getElementById('myPlayerSection');
		const currentRoomState = document.getElementById('currentRoomState');

		if (roomLobby) {
			roomLobby.style.display = 'none';
			console.log("[GameStarted] roomLobby hidden");
		}
		if (gameSection) {
			gameSection.style.display = 'block';
			console.log("[GameStarted] gameSection shown");
		}
		if (myPlayerSection) {
			myPlayerSection.style.display = 'block';
			console.log("[GameStarted] myPlayerSection shown");
		}
		if (currentRoomState) {
			currentRoomState.textContent = getRoomStateLabel();
			currentRoomState.classList.add('state-playing');
			console.log("[GameStarted] currentRoomState updated");
		}

		const startBtn = document.getElementById('startGameBtn');
		if (startBtn) {
			startBtn.style.display = 'none';
			startBtn.disabled = true;
			startBtn.style.pointerEvents = 'none';
			console.log("[GameStarted] startBtn hidden");
		}

		updateRoundStatusUI();

		// Show GM sections for host using the dedicated function
		console.log("[GameStarted] Calling updateGMSections...");
		updateGMSections();

		// Update bunker capacity display
		if (currentBunker) {
			currentBunkerCapacity = getBunkerCapacityValue(currentBunker, currentBunkerCapacity);
			const gmBunkerCapacity = document.getElementById('gmBunkerCapacity');
			if (isHost && gmBunkerCapacity) {
				gmBunkerCapacity.value = currentBunkerCapacity;
			}
		}

		// Render apocalypse and bunker
		console.log("[GameStarted] Rendering apocalypse...");
		renderApocalypse(currentApocalypse);

		console.log("[GameStarted] Rendering bunker...");
		renderBunker(currentBunker);

		console.log("[GameStarted] Rendering current game UI...");
		tryRenderRunningGameState();

		// Add event messages
		const currentRound = data.currentRound || data.CurrentRound || getCurrentRoundNumber() || 1;
		addEventMessage(`Гра почалась! Раунд ${currentRound}`);

		if (currentApocalypse) {
			addEventMessage(`<span class="event-apocalypse">☢️ ${escapeHtml(t('apocalypse'))}:</span> ${escapeHtml(getLocalizedValue(currentApocalypse, 'name'))}`);
		}

		if (currentBunker) {
			addEventMessage(`<span class="event-bunker">🏠 ${escapeHtml(t('bunker'))}:</span> ${escapeHtml(getLocalizedValue(currentBunker, 'name'))}`);
		}

		console.log("=== GAME STARTED END ===");
	});

	// Характеристику розкрито
	connection.off("CharacteristicRevealed");
	connection.on("CharacteristicRevealed", function (info) {
		console.log("Characteristic revealed:", info);
		applyRoundState(info.roundState || info.RoundState);
		const characteristicKey = normalizeCharacteristicKey(info.characteristicKey || info.CharacteristicKey || '');
		const charKey = normalizeCharacteristicKey(toCamelCase(characteristicKey));
		pendingCharacteristicReveals.delete(characteristicKey);

		if (roomPlayers[info.connectionId]) {
			if (!roomPlayers[info.connectionId].revealed) {
				roomPlayers[info.connectionId].revealed = {};
			}
			if (!roomPlayers[info.connectionId].revealedData) {
				roomPlayers[info.connectionId].revealedData = {};
			}
			if (!roomPlayers[info.connectionId].revealedTooltips) {
				roomPlayers[info.connectionId].revealedTooltips = {};
			}
			if (!roomPlayers[info.connectionId].revealedSources) {
				roomPlayers[info.connectionId].revealedSources = {};
			}
			roomPlayers[info.connectionId].revealed[charKey] = true;
			roomPlayers[info.connectionId].revealedData[charKey] = info.data.value;
			const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact || null;
			if (source) {
				roomPlayers[info.connectionId].revealedSources[charKey] = source;
			}
			if (charKey === 'physicalHealth') {
				roomPlayers[info.connectionId].additionalConditionEffects = normalizeAdditionalPhysicalConditions(
					info.data.additionalConditionEffects || info.data.AdditionalConditionEffects || []
				);
			}
			if (charKey === 'fact') {
				roomPlayers[info.connectionId].fact = normalizeFactFromPlayer({ fact: source || info.data.fact || info.data.Fact, revealedData: { fact: info.data } });
			}
			if (charKey === 'specialCard' && source) {
				roomPlayers[info.connectionId].specialCard = normalizeSpecialCard(source);
			}
			if (info.data.tooltip && info.data.hasTooltip) {
				const kind = charKey === 'physicalHealth' ? 'physicalHealth' : charKey === 'mentalHealth' ? 'mentalHealth' : charKey;
				roomPlayers[info.connectionId].revealedTooltips[charKey] = buildLocalizedTooltip(source, kind) || cleanTooltipText(info.data.tooltip);
			}
		}

		// Оновлюємо свої картки якщо це я
		if (info.connectionId === myConnectionId && myPlayerData) {
			if (!myPlayerData.revealed) {
				myPlayerData.revealed = {};
			}

			myPlayerData.revealed[charKey] = true;

			if (charKey === "fact") {
				const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact;
				myPlayerData.fact = normalizeFactFromPlayer({ fact: source, revealedData: { fact: info.data } });
			}
			if (charKey === "specialCard") {
				const source = info.data.source || info.data.Source;
				if (source) {
					const revealedCard = normalizeSpecialCard(source);
					myPlayerData.specialCard = revealedCard;
					myPlayerData.specialCards = normalizeSpecialCards(myPlayerData.specialCards, revealedCard)
						.map(card => card.id === revealedCard.id ? revealedCard : card);
				}
			}

			renderCurrentGameUI();
		}

		renderPublicPlayerOverview();
		triggerApocalypseVisualReaction('characteristic-reveal', { duration: 500 });
		addEventMessage(`<span class="event-player">${info.playerName}</span> розкрив: <span class="revealed-label">${info.data.label}</span>`);
	});

	connection.off("RoundStateUpdated");
	connection.on("RoundStateUpdated", function (data) {
		const wasComplete = currentRoundState?.allPlayersRevealed;
		applyRoundState(data);
		renderCurrentGameUI();
		if (isFinishedGameState(data, currentGameCompletion)) {
			renderGameFinished(currentGameCompletion || data?.completion || data?.Completion, { source: 'round-state' });
			return;
		}

		if (isHost && currentRoundState?.allPlayersRevealed && !wasComplete) {
			addEventMessage(`Усі активні гравці відкрили характеристику в раунді ${getCurrentRoundNumber()}. Можна завершити раунд.`);
		}
	});

	connection.off("RoundEnded");
	connection.on("RoundEnded", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		addEventMessage(`Раунд ${data.completedRound || data.CompletedRound} завершено.`);
	});

	connection.off("RoundAdvanced");
	connection.on("RoundAdvanced", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		triggerApocalypseVisualReaction('round-change');
		addEventMessage(`Почався раунд ${data.currentRound || data.CurrentRound || getCurrentRoundNumber()}.`);
	});

	connection.off("RoundDiceRolled");
	connection.on("RoundDiceRolled", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		const roll = normalizeDiceRoll(data.diceRoll || data.DiceRoll || data.roll || data.Roll);
		const value = roll?.value || '?';
		const round = roll?.round || getCurrentRoundNumber();
		const roller = roll?.rolledByPlayerName || 'GM';
		addEventMessage(`${escapeHtml(roller)} кинув кубик у раунді ${round}: <strong>${value}</strong>`);
	});

	connection.off("ThreatRevealed");
	connection.on("ThreatRevealed", function (data) {
		currentThreat = data.threat || data.Threat || null;
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		triggerApocalypseVisualReaction('threat-reveal');
		const threatName = currentThreat ? (getLocalizedValue(currentThreat, 'name') || currentThreat.name || currentThreat.Name) : 'нова загроза';
		addEventMessage(`<span class="event-warning">${t('threatRevealed')}:</span> ${escapeHtml(threatName)}`);
	});

	connection.off("VotingReadyCheckStarted");
	connection.on("VotingReadyCheckStarted", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		addEventMessage(data.message || data.Message || 'Всі готові до голосування?');
	});

	connection.off("AllPlayersMarkedReady");
	connection.on("AllPlayersMarkedReady", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		addEventMessage(t('allPlayersReady'));
	});

	connection.off("VotingReadyStatusUpdated");
	connection.on("VotingReadyStatusUpdated", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		const playerName = data.playerName || data.PlayerName || t('unknown');
		const status = data.status || data.Status || 'pending';
		addEventMessage(`${playerName}: ${getReadyStatusLabel(status)}`);
	});

	connection.off("SpecialCardStateUpdated");
	connection.on("SpecialCardStateUpdated", function (data) {
		const card = data.card || data.Card;
		const cards = data.cards || data.Cards;
		if (myPlayerData) {
			myPlayerData.specialCards = normalizeSpecialCards(cards, card);
			myPlayerData.specialCard = myPlayerData.specialCards[0] || normalizeSpecialCard(card);
			myPlayerData.specialCards.filter(item => item.isUsed || item.isActive || item.isEffectActive).forEach(item => pendingSpecialCardUses.delete(item.id));
			if (data.inventory || data.Inventory) {
				myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
			}
			if (data.property || data.Property) {
				myPlayerData.property = normalizePropertyData(data.property || data.Property);
			}
		}
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
	});

	connection.off("SpecialCardActivated");
	connection.on("SpecialCardActivated", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		const message = data.message || data.Message;
		const ownerName = data.ownerPlayerName || data.OwnerPlayerName || t('unknown');
		addEventMessage(escapeHtml(message || `${ownerName} використав спеціальну карту.`));
	});

	connection.off("SpecialCardPrivateResult");
	connection.on("SpecialCardPrivateResult", function (data) {
		const message = data.message || data.Message || t('cardUsedSuccessfully');
		addEventMessage(`<span class="event-success">${escapeHtml(message)}</span>`);
	});

	window.showSpecialCardImpactToast = function (message) {
		const normalizedMessage = String(message || '').trim();
		if (!normalizedMessage) return;

		let container = document.getElementById('specialCardImpactToasts');

		if (!container) {
			container = document.createElement('div');
			container.id = 'specialCardImpactToasts';
			container.className = 'special-card-impact-toasts';
			container.setAttribute('aria-live', 'assertive');
			document.body.appendChild(container);
		}

		const toast = document.createElement('article');
		toast.className = 'special-card-impact-toast';

		toast.innerHTML = `
		<div class="special-card-impact-icon" aria-hidden="true">!</div>

		<div class="special-card-impact-content">
			<strong class="special-card-impact-title">
				${escapeHtml(t('specialCardAffectedYou'))}
			</strong>

			<p class="special-card-impact-message">
				${escapeHtml(normalizedMessage)}
			</p>
		</div>

		<button
			type="button"
			class="special-card-impact-close"
			aria-label="Закрити">
			×
		</button>
	`;

		container.appendChild(toast);

		const removeToast = () => {
			if (toast.classList.contains('is-removing')) return;

			toast.classList.add('is-removing');

			setTimeout(() => {
				toast.remove();

				if (container.children.length === 0) {
					container.remove();
				}
			}, 260);
		};

		toast
			.querySelector('.special-card-impact-close')
			?.addEventListener('click', removeToast);

		requestAnimationFrame(() => {
			toast.classList.add('is-visible');
		});

		setTimeout(removeToast, 7500);
	};

	connection.off("SpecialCardTargetStateUpdated");
	connection.on("SpecialCardTargetStateUpdated", function (data) {
		if (myPlayerData) {
			if (data.inventory || data.Inventory) {
				myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
			}
			if (data.property || data.Property) {
				myPlayerData.property = normalizePropertyData(data.property || data.Property);
			}
			const cards = data.specialCards || data.SpecialCards;
			if (cards) {
				myPlayerData.specialCards = normalizeSpecialCards(cards);
				myPlayerData.specialCard = myPlayerData.specialCards[0] || normalizeSpecialCard(null);
			}
		}
		renderCurrentGameUI();
		const message = data.message || data.Message;
		if (message) {
			addEventMessage(
				`<span class="event-warning">${escapeHtml(message)}</span>`
			);

			window.showSpecialCardImpactToast(message);
		}
	});

	connection.off("CharacteristicHidden");
	connection.on("CharacteristicHidden", function (data) {
		const connectionId = data.connectionId || data.ConnectionId;
		const hiddenCharacteristic = data.characteristicKey || data.CharacteristicKey || '';
		const charKey = normalizeCharacteristicKey(toCamelCase(hiddenCharacteristic));
		pendingCharacteristicReveals.delete(hiddenCharacteristic);
		const player = roomPlayers[connectionId];
		if (player) {
			if (player.revealed) player.revealed[charKey] = false;
			if (player.revealedData) delete player.revealedData[charKey];
			if (player.revealedSources) delete player.revealedSources[charKey];
		}
		if (connectionId === myConnectionId && myPlayerData?.revealed) {
			myPlayerData.revealed[charKey] = false;
		}
		renderCurrentGameUI();
	});

	// Характеристику оновлено (GM змінив)
	connection.off("CharacteristicUpdated");
	connection.on("CharacteristicUpdated", function (info) {
		console.log("Characteristic updated by GM:", info);
		const characteristicKey = normalizeCharacteristicKey(info.characteristicKey);
		const charKey = normalizeCharacteristicKey(toCamelCase(characteristicKey));

		if (roomPlayers[info.connectionId]) {
			if (!roomPlayers[info.connectionId].revealedData) {
				roomPlayers[info.connectionId].revealedData = {};
			}
			if (!roomPlayers[info.connectionId].revealedSources) {
				roomPlayers[info.connectionId].revealedSources = {};
			}
			roomPlayers[info.connectionId].revealedData[charKey] = info.data.value;
			const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact || null;
			if (source) {
				roomPlayers[info.connectionId].revealedSources[charKey] = source;
			}
			if (charKey === 'fact') {
				roomPlayers[info.connectionId].fact = normalizeFactFromPlayer({ fact: source || info.data.fact || info.data.Fact, revealedData: { fact: info.data } });
			}
			if (charKey === 'specialCard' && source) {
				roomPlayers[info.connectionId].specialCard = normalizeSpecialCard(source);
			}
		}

		renderPublicPlayerOverview();
		updateSpecialCardsUI();
		addEventMessage(`<span class="event-gm">GM</span> змінив характеристику <span class="event-player">${info.playerName}</span>`);
	});

	// Мої характеристики відредаговані GM
	connection.off("CharacteristicEdited");
	connection.on("CharacteristicEdited", function (info) {
		console.log("My characteristic edited:", info);
		myPlayerData = normalizePlayer(info.player);
		renderCurrentGameUI();
		addEventMessage(`<span class="event-gm">GM</span> змінив вашу характеристику: ${info.characteristicName}`);
	});

	// Характеристику очищено
	connection.off("CharacteristicCleared");
	connection.on("CharacteristicCleared", function (info) {
		console.log("My characteristic cleared:", info);
		myPlayerData = normalizePlayer(info.player);
		renderCurrentGameUI();
		addEventMessage(`<span class="event-gm">GM</span> очистив вашу характеристику: ${info.characteristicName}`);
	});

	// Характеристику регенеровано
	connection.off("CharacteristicRegenerated");
	connection.on("CharacteristicRegenerated", function (info) {
		console.log("My characteristic regenerated:", info);
		myPlayerData = normalizePlayer(info.player);
		renderCurrentGameUI();
		addEventMessage(`<span class="event-gm">GM</span> регенерував вашу характеристику: ${info.characteristicName}`);
	});

	// Гравця елімінівано
	connection.off("PlayerEliminated");
	connection.on("PlayerEliminated", function (info) {
		console.log("Player eliminated:", info);
		if (roomPlayers[info.connectionId]) {
			roomPlayers[info.connectionId].isEliminated = true;
			roomPlayers[info.connectionId].eliminatedAtRound = info.eliminatedAtRound ?? info.EliminatedAtRound ?? getCurrentRoundNumber();
			roomPlayers[info.connectionId].eliminatedByVote = !!(info.eliminatedByVote ?? info.EliminatedByVote);
			roomPlayers[info.connectionId].canRevealAllAfterElimination = !!(info.canRevealAllAfterElimination ?? info.CanRevealAllAfterElimination ?? true);
			roomPlayers[info.connectionId].hasRevealedAllAfterElimination = !!(info.hasRevealedAllAfterElimination ?? info.HasRevealedAllAfterElimination);
		}
		if (info.connectionId === myConnectionId && myPlayerData) {
			myPlayerData.isEliminated = true;
			myPlayerData.eliminatedAtRound = info.eliminatedAtRound ?? info.EliminatedAtRound ?? getCurrentRoundNumber();
			myPlayerData.eliminatedByVote = !!(info.eliminatedByVote ?? info.EliminatedByVote);
			myPlayerData.canRevealAllAfterElimination = !!(info.canRevealAllAfterElimination ?? info.CanRevealAllAfterElimination ?? true);
			myPlayerData.hasRevealedAllAfterElimination = !!(info.hasRevealedAllAfterElimination ?? info.HasRevealedAllAfterElimination);
		}
		renderCurrentGameUI();
		renderPublicPlayerOverview();
		updateGMPlayerSelect();
		addEventMessage(`<span class="event-eliminate">❌ ${info.playerName}</span> елімінований!`);
	});

	connection.off("GameFinished");
	connection.on("GameFinished", function (data) {
		applyRoundState(data?.roundState || data?.RoundState);
		applyPostGameTransition(data?.postGameTransition || data?.PostGameTransition || null);
		const completion = normalizeGameCompletion(data);
		renderCurrentGameUI();
		renderGameFinished(completion, { source: 'live' });
	});

	// Гравця повернено
	connection.off("PlayerRestored");
	connection.on("PlayerRestored", function (info) {
		console.log("Player restored:", info);
		if (roomPlayers[info.connectionId]) {
			roomPlayers[info.connectionId].isEliminated = false;
			roomPlayers[info.connectionId].canRevealAllAfterElimination = false;
			roomPlayers[info.connectionId].hasRevealedAllAfterElimination = false;
		}
		if (info.connectionId === myConnectionId && myPlayerData) {
			myPlayerData.isEliminated = false;
			myPlayerData.canRevealAllAfterElimination = false;
			myPlayerData.hasRevealedAllAfterElimination = false;
		}
		renderCurrentGameUI();
		renderPublicPlayerOverview();
		updateGMPlayerSelect();
		addEventMessage(`<span class="event-restore">✅ ${info.playerName}</span> повернено в гру!`);
	});

	connection.off("EliminatedPlayerRevealedAll");
	connection.on("EliminatedPlayerRevealedAll", function (info) {
		console.log("Eliminated player revealed all:", info);
		applyRoundState(info.roundState || info.RoundState);
		const connectionId = info.connectionId || info.ConnectionId;
		if (roomPlayers[connectionId]) {
			roomPlayers[connectionId].canRevealAllAfterElimination = false;
			roomPlayers[connectionId].hasRevealedAllAfterElimination = true;
		}
		if (connectionId === myConnectionId && myPlayerData) {
			myPlayerData.canRevealAllAfterElimination = false;
			myPlayerData.hasRevealedAllAfterElimination = true;
		}
		renderCurrentGameUI();
		addEventMessage(`<span class="event-player">${t('eliminatedRevealedAllLog')}</span>`);
	});

	// GM отримав дані всіх гравців
	connection.off("AllPlayersData");
	connection.on("AllPlayersData", function (data) {
		console.log("All players data received:", data);
		gmPlayersData = {};
		data.forEach(p => {
			const connectionId = p.connectionId || p.ConnectionId;
			gmPlayersData[connectionId] = {
				...p,
				connectionId: connectionId,
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				fact: normalizeFactFromPlayer(p)
			};
		});
		updateGMPlayerSelect();
		updateSpecialCardsUI();
		if (selectedPlayerForGM && !gmPlayersData[selectedPlayerForGM]) {
			selectedPlayerForGM = null;
		}
		if (selectedPlayerForGM) loadPlayerDataForGM();
	});

	// GM дія успішна
	connection.off("GMActionSuccess");
	connection.on("GMActionSuccess", function (info) {
		console.log("GM action success:", info);
		const action = info.action || info.Action || 'Дію виконано';
		addEventMessage(`<span class="event-gm">GM</span> ${escapeHtml(action)}`);
		const result = document.getElementById('gmThreatCommandResult');
		if (result) result.textContent = action;
		gmLastCommandError = '';
		gmPlayerCommandPending = false;
		setGmSnapshotPending(false);
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
		const playerResult = document.getElementById('gmPlayerCommandResult');
		if (playerResult) playerResult.textContent = action;
		markGMServerUpdate();
		// Оновлюємо дані гравців
		if (isHost) {
			connection.invoke("GetAllPlayersData").catch(err => console.error(err));
		}
	});

	// Помилка
	connection.off("ReceiveError");
	connection.on("ReceiveError", function (message) {
		if (message === "Гра вже запущена") {
			console.warn("ReceiveError ignored:", message);
			return;
		}

		console.error("ReceiveError:", message);
		addEventMessage("Помилка: " + localizeServerMessage(message));
		const gmThreatResult = document.getElementById('gmThreatCommandResult');
		if (gmThreatResult && gmThreatCommandPending) gmThreatResult.textContent = localizeServerMessage(message);
		if (gmThreatCommandPending) {
			gmLastCommandError = localizeServerMessage(message);
			renderGMPanelState();
		}
		if (gmThreatForcePending) {
			setGMThreatForcePending(false);
			const forceError = document.getElementById('gmThreatForceError');
			if (forceError) forceError.textContent = localizeServerMessage(message);
		}
		if (gmPlayerCommandPending) {
			gmPlayerCommandPending = false;
			document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
			const playerResult = document.getElementById('gmPlayerCommandResult');
			if (playerResult) playerResult.textContent = localizeServerMessage(message);
		}
		if (bunkerCapacityPending) {
			const input = document.getElementById('gmBunkerCapacity');
			if (input) input.value = currentBunker?.capacity ?? currentBunkerCapacity;
			const feedback = document.getElementById('gmBunkerCapacityFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
			setBunkerCapacityPending(false);
		}
		if (gmRoundCommandPending) finishGmRoundCommand(localizeServerMessage(message));
		if (gmDiagnosticsPending) {
			setGmDiagnosticsPending(false);
			const feedback = document.getElementById('gmDiagnosticsFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
		}
		if (gmSnapshotCommandPending) {
			setGmSnapshotPending(false);
			const feedback = document.getElementById('gmSnapshotFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
		}
		if (gmRoomLocalEditorPending) {
			setRoomLocalEditorPending(false);
			const feedback = document.getElementById('gmEditorFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
		}
		if (gameTimerCommandPending) {
			gameTimerCommandPending = false;
			const feedback = document.getElementById('gmTimerFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
			renderGameTimer();
		}
	});

	// ==================== SESSION RESTORE HANDLERS ====================

	// Успішне перепідключення
	// Успішне перепідключення — очищуємо pending-флаги GM commands,
	// оскільки серверний стан є авторитетним після reconnect
	gmThreatCommandPending = false;
	gmThreatForcePending = false;
	gmPlayerCommandPending = false;
	gmRoundCommandPending = false;
	gmSnapshotCommandPending = false;
	gmRoomLocalEditorPending = false;
	gmDiagnosticsPending = false;
	bunkerCapacityPending = false;

	connection.off("RejoinSuccess");
	connection.on("RejoinSuccess", function (data) {
		console.log("=== REJOIN SUCCESS START ===");
		console.log("[RejoinSuccess] raw data:", data);
		console.log("[RejoinSuccess] data.players:", data.players);

		currentRoom = data.room || data.Room;
		syncPublicGameSettings(data);
		myPlayerData = normalizePlayer(data.player || data.Player);
		isHost = data.isHost ?? data.IsHost ?? false;
		hostToken = data.hostToken || data.HostToken || null;
		myConnectionId = myPlayerData.connectionId;
		applyDeveloperAccessState(data.developer || data.Developer || null);
		applyDeveloperPresence(data.developerPresence || data.DeveloperPresence || null);
		applyPostGameTransition(data.postGameTransition || data.PostGameTransition || null);

		// Normalize room
		if (currentRoom) {
			currentRoom.state = data.roomState || currentRoom.state || currentRoom.State || "Lobby";
			currentRoom.name = currentRoom.name || currentRoom.Name || "Кімната";
			currentRoom.id = currentRoom.id || currentRoom.Id;
			currentRoom.maxPlayers = currentRoom.maxPlayers || currentRoom.MaxPlayers || 12;
		}
		applyRoundState(data.roundState || data.RoundState);
		const rejoinCompletion = normalizeGameCompletion(
			data.completion || data.Completion ||
			data.roundState?.completion || data.RoundState?.Completion ||
			currentGameCompletion);
		if (rejoinCompletion) currentGameCompletion = rejoinCompletion;

		console.log("[RejoinSuccess] currentRoom:", currentRoom);
		console.log("[RejoinSuccess] myPlayerData:", myPlayerData);
		console.log("[RejoinSuccess] myConnectionId:", myConnectionId);

		saveSession(currentRoom.id, myPlayerData.name, hostToken);

		roomPlayers = {};
		(data.players || data.Players || []).forEach(function (p, index) {
			var revealedSources = normalizeRevealedSources(p.revealedSources || p.RevealedSources || {});
			var revealedValues = normalizeRevealedValues(p.revealedValues || p.RevealedValues || {});
			var revealedData = revealedValues.revealedData;
			var revealedTooltips = revealedValues.revealedTooltips;

			const connId = p.connectionId || p.ConnectionId;

			roomPlayers[connId] = {
				name: p.name || p.Name,
				connectionId: connId,
				stablePlayerId: p.stablePlayerId || p.StablePlayerId || "",
				isHost: p.isHost ?? p.IsHost ?? false,
				isDeveloper: !!(p.isDeveloper ?? p.IsDeveloper),
				developerParticipationMode: p.developerParticipationMode || p.DeveloperParticipationMode || null,
				isSpectatorGm: !!(p.isSpectatorGm ?? p.IsSpectatorGm),
				publicRole: p.publicRole || p.PublicRole || '',
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				revealedData: revealedData,
				revealedSources: revealedSources,
				revealedTooltips: revealedTooltips,
				fact: normalizeFactFromPlayer({ ...p, fact: revealedSources.fact || p.fact || p.Fact, revealedData: revealedData, revealedTooltips: revealedTooltips }),
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(p.additionalConditionEffects || p.AdditionalConditionEffects || []),
				isEliminated: p.isEliminated ?? p.IsEliminated ?? false,
				eliminatedAtRound: p.eliminatedAtRound ?? p.EliminatedAtRound ?? null,
				eliminatedByVote: !!(p.eliminatedByVote ?? p.EliminatedByVote),
				canRevealAllAfterElimination: !!(p.canRevealAllAfterElimination ?? p.CanRevealAllAfterElimination),
				hasRevealedAllAfterElimination: !!(p.hasRevealedAllAfterElimination ?? p.HasRevealedAllAfterElimination),
				seatNumber: p.seatNumber ?? p.SeatNumber ?? 0
			};

			console.log(`[RejoinSuccess] roomPlayers[${index}]`, roomPlayers[connId]);
		});

		console.log("[RejoinSuccess] roomPlayers final:", roomPlayers);

		console.log("[RejoinSuccess] Object.keys(roomPlayers):", Object.keys(roomPlayers));

		const isFinishedState = isFinishedGameState(
			data.roundState || data.RoundState || data,
			rejoinCompletion);
		const isGameState =
			currentRoom.state === 'Playing' ||
			currentRoom.state === 'Voting' ||
			currentRoom.state === 'Started';

		showRoomSection();
		renderCurrentGameUI();

		if (isFinishedState) {
			currentApocalypse = data.apocalypse || data.Apocalypse;
			currentBunker = data.bunker || data.Bunker;
			currentVoting = null;
			document.getElementById('roomLobby').style.display = 'none';
			document.getElementById('gameSection').style.display = 'block';
			document.getElementById('myPlayerSection').style.display = 'block';
			renderCurrentGameUI();
			renderGameFinished(rejoinCompletion, { source: 'rejoin' });
			window.PostGameStoryDirector?.applyState(data.postGameStory || data.PostGameStory, true);
		} else if (isGameState) {
			currentApocalypse = data.apocalypse || data.Apocalypse;
			currentBunker = data.bunker || data.Bunker;
			currentVoting = data.voting || data.Voting || null;

			document.getElementById('roomLobby').style.display = 'none';
			document.getElementById('gameSection').style.display = 'block';
			document.getElementById('myPlayerSection').style.display = 'block';

			document.getElementById('currentRoomState').textContent =
				getRoomStateLabel();

			const startBtn = document.getElementById('startGameBtn');
			if (startBtn) {
				startBtn.style.display = 'none';
				startBtn.disabled = true;
			}

			updateRoundStatusUI();

			if (currentApocalypse) renderApocalypse(currentApocalypse);
			if (currentBunker) renderBunker(currentBunker);
			if (currentThreat) renderThreatPanel(currentThreat);

			if (currentVoting) {
				const votingState = currentVoting.state || currentVoting.State || currentRoom.state;
				if (votingState === 'Active' || currentRoom.state === 'Voting') {
					showVotingPanel(currentVoting);
					const rejoinedVote = currentVoting.myVote || currentVoting.MyVote;
					if (rejoinedVote) {
						myVote = rejoinedVote;
						const voteStatus = document.getElementById('myVoteStatus');
						const voteTarget = document.getElementById('myVoteTarget');
						if (voteStatus) voteStatus.style.display = 'block';
						if (voteTarget) voteTarget.textContent = rejoinedVote.targetName || rejoinedVote.TargetName || '';
						updateVotingCandidates();
}


				} else if (votingState === 'Completed' || votingState === 'Resolved') {
					document.getElementById('votingPanel').style.display = 'none';
					showVotingResults(currentVoting);
				}
			}
		} else {
			document.getElementById('roomLobby').style.display = 'block';
			document.getElementById('gameSection').style.display = 'none';
			document.getElementById('myPlayerSection').style.display = 'block';
		}

		renderCurrentGameUI();

		console.log("=== REJOIN SUCCESS END ===");

		addEventMessage(`Сесію відновлено! Ви знову в кімнаті <span class="event-room">${currentRoom.name}</span>`);
	});

	// Перепідключення не вдалося
	connection.off("RejoinFailed");
	connection.on("RejoinFailed", function (message) {
		console.log("Rejoin failed:", message);
		clearSession();
		currentRoom = null;
		myPlayerData = null;
		isHost = false;
		roomPlayers = {};
		showLobbySection();
		connection.invoke("GetRooms").catch(err => console.error("GetRooms after RejoinFailed error:", err));
		// Не показуємо alert — просто залишаємо в лобі
	});

	// Інший гравець перепідключився
	connection.off("PlayerReconnected");
	connection.on("PlayerReconnected", function (info) {
		console.log("Player reconnected:", info);
		// Оновлюємо connectionId гравця
		var oldKey = null;
		var reconnectedStableId = info.stablePlayerId || info.StablePlayerId || "";
		for (var key in roomPlayers) {
			if (reconnectedStableId && roomPlayers[key].stablePlayerId === reconnectedStableId) {
				oldKey = key;
				break;
			}
		}
		if (!oldKey) {
			for (var key in roomPlayers) {
				if (roomPlayers[key].name === info.name) {
					oldKey = key;
					break;
				}
			}
		}
		if (oldKey && oldKey !== info.connectionId) {
			var playerData = roomPlayers[oldKey];
			delete roomPlayers[oldKey];
			playerData.connectionId = info.connectionId;
			playerData.stablePlayerId = reconnectedStableId || playerData.stablePlayerId || "";
			playerData.isHost = info.isHost;
			playerData.isDeveloper = !!(info.isDeveloper ?? info.IsDeveloper);
			playerData.developerParticipationMode = info.developerParticipationMode || info.DeveloperParticipationMode || playerData.developerParticipationMode;
			roomPlayers[info.connectionId] = playerData;
		}
		renderCurrentGameUI();
		addEventMessage(`Гравець <span class="event-player">${info.name}</span> перепідключився`);
	});

	// ==================== PEEK CHARACTERISTIC HANDLER ====================

	// Хост підглянув приховану характеристику
	connection.off("CharacteristicPeeked");
	connection.on("CharacteristicPeeked", function (info) {
		console.log("Characteristic peeked:", info);
		showPeekModal(info.playerName, info.characteristicKey, info.data, info.isRevealed);
	});

	// ==================== SCENARIO & EVENT SIGNALR HANDLERS ====================

	// Кількість слотів бункера змінено
	connection.off("BunkerCapacityUpdated");
	connection.on("BunkerCapacityUpdated", function (data) {
		console.log("Bunker capacity updated:", data);
		const bunker = data.bunker || data.Bunker;
		const capacity = data.capacity ?? data.Capacity ?? getBunkerCapacityValue(bunker, currentBunkerCapacity);
		if (bunker) currentBunker = bunker;
		else if (currentBunker) {
			currentBunker.capacity = capacity;
			if ('Capacity' in currentBunker) currentBunker.Capacity = capacity;
		}
		currentBunkerCapacity = capacity;
		const input = document.getElementById('gmBunkerCapacity');
		if (input) input.value = capacity;
		setBunkerCapacityPending(false);
		const feedback = document.getElementById('gmBunkerCapacityFeedback');
		if (feedback) feedback.textContent = t('gmCapacitySaved');
		renderBunker(currentBunker);
		addEventMessage(`<span class="event-gm">GM</span> ${escapeHtml(t('capacity'))}: <strong>${escapeHtml(capacity)}</strong>`);
	});

	connection.off("GamePauseUpdated");
	connection.on("GamePauseUpdated", function (data) {
		currentRoundState = currentRoundState || {};
		currentRoundState.isPaused = data.isPaused ?? data.IsPaused ?? false;
		currentRoundState.pauseReason = data.reason || data.Reason || null;
		finishGmRoundCommand(currentRoundState.isPaused ? t('gmPause') : t('gmResume'));
		renderCurrentGameUI();
		if (gmRoundCommandPending) finishGmRoundCommand('');
	});

	connection.off("GameTimerUpdated");
	connection.on("GameTimerUpdated", function (data) {
		syncGameTimer(data);
		gameTimerCommandPending = false;
		document.querySelectorAll('.gm-timer-command').forEach(button => button.disabled = false);
		const feedback = document.getElementById('gmTimerFeedback');
		if (feedback) feedback.textContent = data.status || data.Status || '';
		renderGameTimer();
	});

	connection.off("RoundChangePreview");
	connection.on("RoundChangePreview", function (data) {
		if (!(data.allowed ?? data.Allowed)) {
			finishGmRoundCommand(data.blockedReason || data.BlockedReason || t('unavailableNow'));
			return;
		}
		const target = data.targetRound ?? data.TargetRound;
		const clears = data.clears || data.Clears || [];
		if (confirm(`${t('gmSetRound')} ${target}? ${clears.join(', ')}`)) {
			connection.invoke('SetRoundNumber', String(target), gmRoundCommandId()).catch(handleGmRoundCommandError);
		} else finishGmRoundCommand('');
	});

	connection.off("BunkerCapacityRejected");
	connection.on("BunkerCapacityRejected", function (data) {
		currentBunkerCapacity = data.capacity ?? data.Capacity ?? currentBunkerCapacity;
		const input = document.getElementById('gmBunkerCapacity');
		if (input) input.value = currentBunkerCapacity;
		setBunkerCapacityPending(false);
		const feedback = document.getElementById('gmBunkerCapacityFeedback');
		if (feedback) feedback.textContent = t('gmCapacityInvalid');
	});

	// Бункер змінено
	connection.off("BunkerChanged");
	connection.on("BunkerChanged", function (data) {
		console.log("Bunker changed:", data);
		const bunker = data.bunker || data.Bunker || data;
		currentBunker = bunker;
		currentBunkerCapacity = getBunkerCapacityValue(bunker, currentBunkerCapacity);
		const capacityInput = document.getElementById('gmBunkerCapacity');
		if (capacityInput) capacityInput.value = currentBunkerCapacity;
		renderBunker(currentBunker);
		addEventMessage(`<span class="event-bunker">🏠 ${escapeHtml(t('bunker'))}:</span> ${escapeHtml(getLocalizedValue(bunker, 'name'))}`);
	});

	connection.off("BunkerUpdated");
	connection.on("BunkerUpdated", function (data) {
		const bunker = data.bunker || data.Bunker;
		if (!bunker) return;
		currentBunker = bunker;
		currentBunkerCapacity = getBunkerCapacityValue(bunker, currentBunkerCapacity);
		renderBunker(currentBunker);
	});

	// Апокаліпсис змінено
	connection.off("ApocalypseChanged");
	connection.on("ApocalypseChanged", function (data) {
		console.log("Apocalypse changed:", data);
		syncPublicGameSettings(data);
		const apocalypse = data.apocalypse || data.Apocalypse || data;
		currentApocalypse = apocalypse;
		renderApocalypse(currentApocalypse);
		if (triggerApocalypseCardRevealWave(apocalypse))
			triggerApocalypseVisualReaction('apocalypse-reveal', { duration: 900 });
		addEventMessage(`<span class="event-apocalypse">☢️ ${escapeHtml(t('apocalypse'))}:</span> ${escapeHtml(getLocalizedValue(apocalypse, 'name'))}`);
	});

	// Ігрова подія від GM
	connection.off("GameEvent");
	connection.on("GameEvent", function (data) {
		console.log("Game event:", data);
		var typeClass = 'event-' + data.type;
		addEventMessage(`<span class="${typeClass}"><strong>[Подія ${data.timestamp}]</strong> ${data.text}</span>`);
	});

	// Нова подія з ефектом (показується всім)
	connection.off("NewGameEvent");
	connection.on("NewGameEvent", function (eventData) {
		console.log("New game event:", eventData);
		showCurrentEvent(eventData);
		addEventToHistory(`<strong>${eventData.name || eventData.Name}</strong>: ${eventData.description || eventData.Description}`, 'game');
	});

	connection.off("ScenarioStarted");
	connection.on("ScenarioStarted", function (data) {
		const scenario = data.scenario || data.Scenario;
		if (!scenario) return;
		const modal = document.getElementById('scenarioPublicModal');
		document.getElementById('scenarioPublicType').textContent = scenarioTypeLabel(scenario.type || scenario.Type);
		document.getElementById('scenarioPublicTitle').textContent = scenario.title || scenario.Title || '';
		document.getElementById('scenarioPublicText').textContent = scenario.text || scenario.Text || '';
		if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
		addEventToHistory(`<strong>${escapeHtml(scenario.title || scenario.Title || '')}</strong>: ${escapeHtml(scenario.text || scenario.Text || '')}`, 'special');
	});

	connection.off("ScenarioPrivateOpened");
	connection.on("ScenarioPrivateOpened", function (data) {
		currentPendingScenarioChoice = data.choice || data.Choice || null;
		const modal = document.getElementById('scenarioPrivateModal');
		document.getElementById('scenarioPrivateType').textContent = scenarioTypeLabel('secret_event');
		document.getElementById('scenarioPrivateTitle').textContent = data.title || data.Title || scenarioUiText('privateEvent');
		document.getElementById('scenarioPrivateMessage').textContent = data.message || data.Message || '';
		const card = data.card || data.Card;
		document.getElementById('scenarioPrivateCard').textContent = card ? eventCardLocalized(card.title || card.Title) : '';
		renderScenarioPrivateChoices();
		const expiry = data.expiresAtUtc || data.ExpiresAtUtc;
		document.getElementById('scenarioPrivateExpiry').textContent = expiry ? `До ${new Date(expiry).toLocaleTimeString()}` : '';
		if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
	});

	connection.off("EventCardPublicNotice");
	connection.on("EventCardPublicNotice", function (data) {
		const modal = document.getElementById('scenarioPublicModal');
		const code = data?.code || data?.Code || '';
		const accused = data?.accusedPlayerName || data?.AccusedPlayerName || '';
		document.getElementById('scenarioPublicType').textContent = scenarioTypeLabel('event');
		document.getElementById('scenarioPublicTitle').textContent = scenarioUiText('supplyIncident');
		document.getElementById('scenarioPublicText').textContent = eventCardPublicNoticeText(code, accused);
		if (modal) { modal.hidden = false; modal.style.display = 'flex'; }
	});

	connection.off("ScenarioResolved");
	connection.on("ScenarioResolved", function () {
		currentPendingScenarioChoice = null;
		closeScenarioPrivateModal();
	});

	connection.off("BunkerIntelRevealed");
	connection.on("BunkerIntelRevealed", function (data) {
		const panel = document.getElementById('bunkerPanel');
		panel?.classList.add('bunker-intel-highlight');
		setTimeout(() => panel?.classList.remove('bunker-intel-highlight'), 2200);
		addEventMessage(`🔎 Відкрито нові дані бункера: ${escapeHtml(data.category || data.Category || '')}`);
	});

	// Ефект події застосовано
	connection.off("EventEffectApplied");
	connection.on("EventEffectApplied", function (data) {
		console.log("Event effect applied:", data);
		// Оновлюємо бункер якщо потрібно
		const bunker = data.bunker || data.Bunker;
		if (bunker) {
			currentBunker = bunker;
			currentBunkerCapacity = getBunkerCapacityValue(bunker, currentBunkerCapacity);
			renderBunker(currentBunker);
		}
		addEventToHistory(`<span class="event-special">Застосовано ефект: ${data.effectDescription}</span>`, 'special');
	});

	connection.off("AdditionalInventoryGranted");
	connection.on("AdditionalInventoryGranted", function (data) {
		console.log("Additional inventory granted:", data);
		const grants = data.grants || data.Grants || [];
		const receivedItems = [];

		grants.forEach(grant => {
			const connId = grant.connectionId || grant.ConnectionId;
			const stableId = grant.stablePlayerId || grant.StablePlayerId || "";
			const inventory = grant.inventory || grant.Inventory;
			const item = grant.item || grant.Item || {};
			const itemName = getLocalizedValue(item, 'item') || getLocalizedValue(item, 'name') || grant.itemName || grant.ItemName || item.name || item.Name || t('unknown');
			const normalizedInventory = normalizeInventoryData(inventory);

			let playerKey = connId;
			if (!roomPlayers[playerKey] && stableId) {
				playerKey = Object.keys(roomPlayers).find(key => roomPlayers[key]?.stablePlayerId === stableId) || connId;
			}

			if (roomPlayers[playerKey]) {
				roomPlayers[playerKey].revealedSources = roomPlayers[playerKey].revealedSources || {};
				roomPlayers[playerKey].revealedData = roomPlayers[playerKey].revealedData || {};
				roomPlayers[playerKey].revealedTooltips = roomPlayers[playerKey].revealedTooltips || {};

				if (grant.isInventoryRevealed || grant.IsInventoryRevealed) {
					roomPlayers[playerKey].revealedSources.inventory = inventory;
					roomPlayers[playerKey].revealedData.inventory = normalizedInventory.items
						.map(inventoryItem => getLocalizedValue(inventoryItem, 'item') || getLocalizedValue(inventoryItem, 'name') || inventoryItem.name)
						.filter(Boolean)
						.join(', ');
				}
			}

			const isMine = connId === myConnectionId || (stableId && roomPlayers[myConnectionId]?.stablePlayerId === stableId);
			if (isMine && myPlayerData) {
				myPlayerData.inventory = normalizedInventory;
				receivedItems.push(itemName);
			}
		});

		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();

		if (receivedItems.length > 0) {
			addEventMessage(`<span class="event-success">📦 Ви отримали додатковий інвентар:</span> ${receivedItems.join(', ')}`);
		} else if (grants.length > 0) {
			addEventMessage(`<span class="event-success">📦 Активні гравці отримали додатковий інвентар після 3 раунду.</span>`);
		}
	});

	connection.off("ThreatStateUpdated");
	connection.on("ThreatStateUpdated", function (data) {
		currentThreatState = normalizeThreatState(data.threatState || data.ThreatState || currentThreatState);
		applyRoundState(data.roundState || data.RoundState);
		mergeThreatPlayerSnapshots(data);
		if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
			renderThreatOperationModal();
			document.getElementById('threatOperationModal').style.display = 'flex';
		}
		renderCurrentGameUI();
		markGMServerUpdate();
		markGMServerUpdate();
	});

	connection.off("RoomDiagnosticsUpdated");
	connection.on("RoomDiagnosticsUpdated", function (data) {
		gmDiagnosticsData = {
			isHealthy: data.isHealthy ?? data.IsHealthy ?? false,
			checkedAtUtc: data.checkedAtUtc || data.CheckedAtUtc,
			errorCount: data.errorCount ?? data.ErrorCount ?? 0,
			warningCount: data.warningCount ?? data.WarningCount ?? 0,
			infoCount: data.infoCount ?? data.InfoCount ?? 0,
			issues: data.issues || data.Issues || [],
			serverTimestampUtc: data.serverTimestampUtc || data.ServerTimestampUtc
		};
		gmAutoFixPreview = null;
		gmDiagnosticsPending = false;
		setGmDiagnosticsPending(false);
		renderRoomDiagnostics();
		markGMServerUpdate();
	});

	connection.off("RoomAutoFixPreviewed");
	connection.on("RoomAutoFixPreviewed", function (data) {
		gmAutoFixPreview = {
			changes: data.changes || data.Changes || [],
			changeCount: data.changeCount ?? data.ChangeCount ?? 0,
			hasChanges: data.hasChanges ?? data.HasChanges ?? false
		};
		setGmDiagnosticsPending(false);
		const feedback = document.getElementById('gmDiagnosticsFeedback');
		if (feedback) feedback.textContent = gmAutoFixPreview.hasChanges
			? `${gmAutoFixPreview.changeCount} safe fix(es)` : t('gmNoAutoFix');
		const apply = document.getElementById('gmApplyAutoFix');
		if (apply) apply.disabled = !gmAutoFixPreview.hasChanges;
	});

	connection.off("RoomSnapshotsUpdated");
	connection.on("RoomSnapshotsUpdated", function (data) {
		gmSnapshotsData = data.snapshots || data.Snapshots || [];
		setGmSnapshotPending(false);
		renderRoomSnapshots();
	});

	connection.off("RoomSnapshotRestorePreviewed");
	connection.on("RoomSnapshotRestorePreviewed", function (data) {
		gmSnapshotRestorePreview = {
			snapshot: data.snapshot || data.Snapshot || null,
			canRestore: data.canRestore ?? data.CanRestore ?? false,
			blockedReason: data.blockedReason || data.BlockedReason || '',
			changes: data.changes || data.Changes || []
		};
		setGmSnapshotPending(false);
		renderRoomSnapshots();
	});

	connection.off("RoomLocalEditorUpdated");
	connection.on("RoomLocalEditorUpdated", function (data) {
		gmRoomLocalEditorData = {
			bunkerFields: data.bunkerFields || data.BunkerFields || [],
			apocalypseFields: data.apocalypseFields || data.ApocalypseFields || [],
			players: data.players || data.Players || []
		};
		setRoomLocalEditorPending(false);
		renderRoomLocalEditor();
	});

	connection.off("RoomLocalEditPreviewed");
	connection.on("RoomLocalEditPreviewed", function (data) {
		gmRoomLocalEditPreview = {
			category: data.category || data.Category || '', targetPlayerId: data.targetPlayerId || data.TargetPlayerId || null,
			fieldId: data.fieldId || data.FieldId || '', sanitizedProposedValue: data.sanitizedProposedValue || data.SanitizedProposedValue || '',
			canApply: data.canApply ?? data.CanApply ?? false, warning: data.warning || data.Warning || ''
		};
		setRoomLocalEditorPending(false);
		const feedback = document.getElementById('gmEditorFeedback');
		if (feedback) feedback.textContent = gmRoomLocalEditPreview.canApply ? gmRoomLocalEditPreview.sanitizedProposedValue : gmRoomLocalEditPreview.warning;
		const apply = document.getElementById('gmEditorApplyButton');
		if (apply) apply.disabled = !gmRoomLocalEditPreview.canApply;
	});

	connection.off("GmAuditLogUpdated");
	connection.on("GmAuditLogUpdated", function (data) {
		gmAuditData = { entries: data.entries || data.Entries || [] };
		setGmDiagnosticsPending(false);
		renderUnifiedGmAudit();
	});

	connection.off("GMThreatControlData");
	connection.on("GMThreatControlData", function (data) {
		gmThreatControlData = {
			threats: data.threats || data.Threats || [],
			currentThreat: data.currentThreat || data.CurrentThreat || null,
			auditLog: data.auditLog || data.AuditLog || [],
			canBrowseFutureThreatCatalog: data.canBrowseFutureThreatCatalog ?? data.CanBrowseFutureThreatCatalog ?? false
		};
		if (!(gmThreatControlData.currentThreat?.canForceOutcome ?? gmThreatControlData.currentThreat?.CanForceOutcome ?? false)) {
			setGMThreatForcePending(false);
			closeGMThreatForceModal();
		}
		renderGMThreatControl();
		markGMServerUpdate();
	});

	connection.off("GMThreatForcePreview");
	connection.on("GMThreatForcePreview", function (data) {
		gmThreatForcePreview = data;
		gmThreatForceRequestedOutcome = data.requestedOutcome || data.RequestedOutcome || '';
		setGMThreatForcePending(false);
		renderGMThreatForcePreview();
		const modal = document.getElementById('gmThreatForceModal');
		if (modal) modal.style.display = 'flex';
	});

	connection.off("GMThreatForceRejected");
	connection.on("GMThreatForceRejected", function (data) {
		setGMThreatForcePending(false);
		gmThreatForcePreview = null;
		const error = document.getElementById('gmThreatForceError');
		if (error) error.textContent = t('gmThreatForceStale');
		const refresh = document.getElementById('gmThreatForceRefresh');
		if (refresh) refresh.style.display = '';
		const confirmButton = document.getElementById('gmThreatForceConfirm');
		if (confirmButton) confirmButton.disabled = true;
	});

	function mergeThreatPlayerSnapshots(data) {
		const players = data.players || data.Players || [];
		players.forEach(player => {
			const connectionId = player.connectionId || player.ConnectionId;
			if (!connectionId) return;

			const previous = roomPlayers[connectionId] || {};
			const revealedValues = normalizeRevealedValues(player.revealedValues || player.RevealedValues || {});
			roomPlayers[connectionId] = {
				...previous,
				...player,
				connectionId,
				revealed: normalizeRevealedState(player.revealed || player.Revealed || previous.revealed || {}),
				revealedData: revealedValues.revealedData,
				revealedTooltips: revealedValues.revealedTooltips,
				revealedSources: normalizeRevealedSources(player.revealedSources || player.RevealedSources || {}),
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(
					player.additionalPhysicalConditions || player.AdditionalPhysicalConditions ||
					player.additionalConditionEffects || player.AdditionalConditionEffects || []
				),
				additionalPhysicalConditions: normalizeAdditionalPhysicalConditions(
					player.additionalPhysicalConditions || player.AdditionalPhysicalConditions ||
					player.additionalConditionEffects || player.AdditionalConditionEffects || []
				)
			};
		});

		const privatePlayer = data.player || data.Player;
		if (privatePlayer) myPlayerData = normalizePlayer(privatePlayer);
	}

	connection.off("ThreatSupportDiceRolled");
	connection.on("ThreatSupportDiceRolled", function (data) {
		addEventMessage(`<span class="event-success">${escapeHtml(data.message || 'Кубик кинуто. Предмет підтримки видано.')}</span>`);
	});

	connection.off("ThreatSupportDropAnnounced");
	connection.on("ThreatSupportDropAnnounced", function (data) {
		addEventMessage(`<span class="event-special">${escapeHtml(data.message || 'Один із гравців отримав предмет підтримки.')}</span>`);
	});

	connection.off("ThreatSupportItemReceived");
	connection.on("ThreatSupportItemReceived", function (data) {
		if (myPlayerData && data.inventory) {
			myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
		}
		addEventMessage(`<span class="event-success">${escapeHtml(data.message || 'Ви отримали предмет підтримки.')}</span>`);
		renderCurrentGameUI();
	});

	connection.off("ThreatPrivateMessage");
	connection.on("ThreatPrivateMessage", function (data) {
		addEventMessage(`<span class="event-special">${escapeHtml(data.message || data.Message || '')}</span>`);
	});

	connection.off("ThreatContributionWithdrawn");
	connection.on("ThreatContributionWithdrawn", function (data) {
		addEventMessage(`<span class="event-warning">${escapeHtml(data.message || data.Message || 'Внесок оновлено.')}</span>`);
	});

	connection.off("ThreatVolunteerSelected");
	connection.on("ThreatVolunteerSelected", function (data) {
		addEventMessage(`<span class="event-special">${escapeHtml(data.message || data.Message || 'Добровольця вибрано.')}</span>`);
	});

	connection.off("ThreatVolunteerVoteStarted");
	connection.on("ThreatVolunteerVoteStarted", function (data) {
		addEventMessage(`<span class="event-voting">${escapeHtml(data.message || data.Message || 'Голосування загрози почалось.')}</span>`);
	});

	connection.off("ThreatVolunteerVoteProgress");
	connection.on("ThreatVolunteerVoteProgress", function (data) {
		if (currentThreatState) {
			currentThreatState.threatVolunteerVote = normalizeThreatState({ threatVolunteerVote: data }).threatVolunteerVote;
			renderThreatPanel(currentThreat);
		}
	});

	connection.off("ThreatVolunteerVoteCompleted");
	connection.on("ThreatVolunteerVoteCompleted", function (data) {
		addEventMessage(`<span class="event-voting">${escapeHtml(data.message || data.Message || 'Голосування загрози завершено.')}</span>`);
	});

	connection.off("ThreatVolunteerVoteClosed");
	connection.on("ThreatVolunteerVoteClosed", function (data) {
		addEventMessage(`<span class="event-warning">${escapeHtml(data.message || data.Message || 'Голосування загрози закрито.')}</span>`);
	});

	connection.off("ThreatResolved");
	connection.on("ThreatResolved", function (data) {
		const results = data.results || data.Results || [];
		addEventMessage(`<span class="event-success">${results.map(escapeHtml).join(' ') || 'Загрозу завершено.'}</span>`);
	});

	connection.off("ThreatMiniGameStarted");
	connection.on("ThreatMiniGameStarted", function (data) {
		if (currentThreatState) {
			currentThreatState.miniGame = normalizeThreatState({ miniGame: data }).miniGame;
		}
		renderThreatPanel(currentThreat);
		if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
			renderThreatOperationModal();
			document.getElementById('threatOperationModal').style.display = 'flex';
		}
		addEventMessage(`<span class="event-special">${escapeHtml(t('startOperation'))}</span>`);
	});

	connection.off("ThreatMiniGameUpdated");
	connection.on("ThreatMiniGameUpdated", function (data) {
		if (currentThreatState) {
			currentThreatState.miniGame = normalizeThreatState({ miniGame: data }).miniGame;
		}
		renderThreatPanel(currentThreat);
		if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
			renderThreatOperationModal();
			document.getElementById('threatOperationModal').style.display = 'flex';
		}
	});

	// ==================== VOTING SIGNALR HANDLERS ====================

	// Голосування почалось
	connection.off("VotingStarted");
	connection.on("VotingStarted", function (data) {
		console.log("Voting started:", data);
		currentVoting = data;
		if (currentRoom) currentRoom.state = "Voting";
		applyRoundState(data.roundState || data.RoundState);
		myVote = null;
		showVotingPanel(data);
		renderCurrentGameUI();
		triggerApocalypseVisualReaction('voting-start');
		addEventMessage(`<span class="event-voting">🗳️ Голосування почалось!</span> Раунд ${data.round || data.Round || getCurrentRoundNumber()}`);
	});

	// Голос зараховано
	connection.off("VoteCast");
	connection.on("VoteCast", function (data) {
		console.log("Vote cast:", data);
		myVote = data;
		document.getElementById('myVoteStatus').style.display = 'block';
		document.getElementById('myVoteTarget').textContent = data.targetName;
		updateVotingCandidates();
		addEventMessage(`Ви проголосували за ${data.targetName}${data.changed ? ' (змінено)' : ''}`);
	});

	// Прогрес голосування
	connection.off("VotingProgress");
	connection.on("VotingProgress", function (data) {
		console.log("Voting progress:", data);
		document.getElementById('votingProgressText').textContent = `${data.votedCount}/${data.totalVoters} проголосували`;
	});

	// Голосування завершено
	connection.off("VotingEnded");
	connection.on("VotingEnded", function (data) {
		console.log("Voting ended:", data);
		currentVoting = data;

		// Ховаємо панель голосування
		document.getElementById('votingPanel').style.display = 'none';

		// Показуємо результати (тільки хосту показуємо кнопки)
		showVotingResults(data);

		addEventMessage(`<span class="event-voting">🗳️ Голосування завершено!</span> Лідер: ${data.topVotedPlayerName || 'Нічия'}`);
	});

	// Рішення по голосуванню прийнято
	connection.off("VotingResolved");
	connection.on("VotingResolved", function (data) {
		console.log("Voting resolved:", data);
		currentVoting = data.voting || data.Voting || currentVoting;
		if (currentRoom) {
			currentRoom.state = "Playing";
			currentRoom.currentRound = data.currentRound || data.CurrentRound || data.nextRound || data.NextRound || currentRoom.currentRound;
		}
		applyRoundState(data.roundState || data.RoundState);
		document.getElementById('votingPanel').style.display = 'none';
		if (currentVoting) {
			showVotingResults(currentVoting);
		}

		// Оновлюємо UI
		renderCurrentGameUI();
		triggerApocalypseVisualReaction('voting-result');

		addEventMessage(`<span class="event-voting">⚖️</span> ${data.message}`);
	});

	// Голосування скасовано
	connection.off("VotingCancelled");
	connection.on("VotingCancelled", function (data) {
		console.log("Voting cancelled:", data);
		currentVoting = null;
		if (currentRoom) currentRoom.state = "Playing";
		applyRoundState(data.roundState || data.RoundState);

		document.getElementById('votingPanel').style.display = 'none';
		document.getElementById('votingResultsPanel').style.display = 'none';

		addEventMessage(`<span class="event-warning">⚠️ ${data.message}</span>`);
	});

	connection.off("VotingAdminUpdated");
	connection.on("VotingAdminUpdated", function (data) {
		gmVotingAdminState = {
			active: data.active ?? data.Active ?? false,
			state: data.state || data.State || 'none',
			votedCount: data.votedCount ?? data.VotedCount ?? 0,
			totalVoters: data.totalVoters ?? data.TotalVoters ?? 0,
			nonVoters: data.nonVoters || data.NonVoters || [],
			eligibleVoters: data.eligibleVoters || data.EligibleVoters || []
		};
		renderGmVotingAdmin();
		finishGmRoundCommand('');
	});

	// ==================== SCENARIO IMAGE HANDLERS ====================

	// Зображення апокаліпсису оновлено
	connection.off("ApocalypseImageUpdated");
	connection.on("ApocalypseImageUpdated", function (data) {
		console.log("[ApocalypseImageUpdated]", data);
		if (currentApocalypse && (currentApocalypse.id || currentApocalypse.Id) === (data.apocalypseId || data.ApocalypseId)) {
			const imageUrl = data.imageUrl || data.ImageUrl || null;
			currentApocalypse.imageUrl = imageUrl;
			if ('ImageUrl' in currentApocalypse) currentApocalypse.ImageUrl = imageUrl;
			renderApocalypse(currentApocalypse);
			addEventMessage(`<span class="event-image">🖼️</span> Зображення апокаліпсису оновлено`);
		}
	});

	// Зображення бункера оновлено
	connection.off("BunkerImageUpdated");
	connection.on("BunkerImageUpdated", function (data) {
		console.log("[BunkerImageUpdated]", data);
		if (currentBunker && (currentBunker.id || currentBunker.Id) === (data.bunkerId || data.BunkerId)) {
			const imageUrl = data.imageUrl || data.ImageUrl || null;
			currentBunker.imageUrl = imageUrl;
			if ('ImageUrl' in currentBunker) currentBunker.ImageUrl = imageUrl;
			renderBunker(currentBunker);
			addEventMessage(`<span class="event-image">🖼️</span> Зображення бункера оновлено`);
		}
	});

	connection.off("ThreatImageUpdated");
	connection.on("ThreatImageUpdated", function (data) {
		console.log("[ThreatImageUpdated]", data);
		const currentThreatId = currentThreat?.id || currentThreat?.Id;
		if (currentThreat && currentThreatId === data.threatId) {
			currentThreat.imageUrl = data.imageUrl;
			currentThreat.uploadedImagePath = data.imageUrl;
			renderThreatPanel(currentThreat);
			addEventMessage(`<span class="event-image">🖼️</span> Зображення загрози оновлено`);
		}
	});

	// Зображення апокаліпсису видалено
	connection.off("ApocalypseImageRemoved");
	connection.on("ApocalypseImageRemoved", function (data) {
		console.log("[ApocalypseImageRemoved]", data);
		if (currentApocalypse && (currentApocalypse.id || currentApocalypse.Id) === (data.apocalypseId || data.ApocalypseId)) {
			currentApocalypse.imageUrl = null;
			if ('ImageUrl' in currentApocalypse) currentApocalypse.ImageUrl = null;
			renderApocalypse(currentApocalypse);
			addEventMessage(`<span class="event-image">🗑️</span> Зображення апокаліпсису видалено`);
		}
	});

	// Зображення бункера видалено
	connection.off("BunkerImageRemoved");
	connection.on("BunkerImageRemoved", function (data) {
		console.log("[BunkerImageRemoved]", data);
		if (currentBunker && (currentBunker.id || currentBunker.Id) === (data.bunkerId || data.BunkerId)) {
			currentBunker.imageUrl = null;
			if ('ImageUrl' in currentBunker) currentBunker.ImageUrl = null;
			renderBunker(currentBunker);
			addEventMessage(`<span class="event-image">🗑️</span> Зображення бункера видалено`);
		}
	});

	connection.off("ThreatImageRemoved");
	connection.on("ThreatImageRemoved", function (data) {
		console.log("[ThreatImageRemoved]", data);
		const currentThreatId = currentThreat?.id || currentThreat?.Id;
		if (currentThreat && currentThreatId === data.threatId) {
			currentThreat.imageUrl = null;
			currentThreat.uploadedImagePath = null;
			renderThreatPanel(currentThreat);
			addEventMessage(`<span class="event-image">🗑️</span> Зображення загрози видалено`);
		}
	});

	// ==================== BUNKER FOOD/WATER HANDLERS ====================

	connection.off("BunkerSuppliesAdded");
	connection.on("BunkerSuppliesAdded", function (data) {
		console.log("[BunkerSuppliesAdded]", data);

		if (currentBunker) {
			const supplies = data.totalSuppliesMonths ?? data.TotalSuppliesMonths;
			currentBunker.suppliesMonths = supplies;
			if ('SuppliesMonths' in currentBunker) currentBunker.SuppliesMonths = supplies;
			renderBunker(currentBunker);
		}

		addEventMessage(`<span class="event-success">📦 ${escapeHtml(t('supplies'))}: +${data.addedMonths} ${escapeHtml(t('bunkerMonths'))}</span>`);
	});

	connection.off("BunkerSuppliesRemoved");
	connection.on("BunkerSuppliesRemoved", function (data) {
		console.log("[BunkerSuppliesRemoved]", data);

		if (currentBunker) {
			const supplies = data.totalSuppliesMonths ?? data.TotalSuppliesMonths;
			currentBunker.suppliesMonths = supplies;
			if ('SuppliesMonths' in currentBunker) currentBunker.SuppliesMonths = supplies;
			renderBunker(currentBunker);
		}

		addEventMessage(`<span class="event-warning">📦 ${escapeHtml(t('supplies'))}: −${data.removedMonths} ${escapeHtml(t('bunkerMonths'))}</span>`);
	});

	connection.off("BunkerWaterAdded");
	connection.on("BunkerWaterAdded", function (data) {
		if (currentBunker) {
			const water = data.totalWaterMonths ?? data.TotalWaterMonths;
			currentBunker.waterMonths = water;
			if ('WaterMonths' in currentBunker) currentBunker.WaterMonths = water;
			renderBunker(currentBunker);
		}
		addEventMessage(`<span class="event-success">💧 ${escapeHtml(t('water'))}: +${data.addedMonths} ${escapeHtml(t('bunkerMonths'))}</span>`);
	});

	connection.off("BunkerWaterRemoved");
	connection.on("BunkerWaterRemoved", function (data) {
		if (currentBunker) {
			const water = data.totalWaterMonths ?? data.TotalWaterMonths;
			currentBunker.waterMonths = water;
			if ('WaterMonths' in currentBunker) currentBunker.WaterMonths = water;
			renderBunker(currentBunker);
		}
		addEventMessage(`<span class="event-warning">💧 ${escapeHtml(t('water'))}: −${data.removedMonths} ${escapeHtml(t('bunkerMonths'))}</span>`);
	});

} // End of registerSignalREvents()