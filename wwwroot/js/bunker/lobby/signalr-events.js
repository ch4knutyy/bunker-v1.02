// Lobby and session SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.lobby = {
	RoomsListUpdated() {
		connection.off("RoomsListUpdated");
		connection.on("RoomsListUpdated", function (rooms) {
			console.log("Rooms updated:", rooms);
			renderRoomsList(rooms);
		});
	},

	RoomCreated() {
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
	},

	RoomJoined() {
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
	},

	PlayerJoinedRoom() {
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
	},

	PlayerLeftRoom() {
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
	},

	RoomPlayersUpdated() {
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
	},

	LobbyStateUpdated() {
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
	},

	GameReturnedToLobby() {
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
	},

	LobbyKicked() {
		connection.off("LobbyKicked");
		connection.on("LobbyKicked", function () {
			lobbySettingsDraft = null; lobbySettingsDirty = false;
			alert(t('lobbyKicked'));
			window.location.reload();
		});
	},

	PlayerKicked() {
		connection.off("PlayerKicked");
		connection.on("PlayerKicked", function (data) {
			alert(data.message || data.Message || 'Вас виключено з кімнати');
			currentRoom = null; myPlayerData = null; isHost = false; roomPlayers = {}; currentApocalypse = null;
			renderApocalypse(null);
			clearSession(); showLobbySection();
		});
	},

	HostChanged() {
		connection.off("HostChanged");
		connection.on("HostChanged", function (data) {
			const oldId = data.oldHostConnectionId || data.OldHostConnectionId;
			const newId = data.newHostConnectionId || data.NewHostConnectionId;
			if (roomPlayers[oldId]) roomPlayers[oldId].isHost = false;
			if (roomPlayers[newId]) roomPlayers[newId].isHost = true;
			isHost = newId === myConnectionId;
			if (oldId === myConnectionId && !isHost && typeof closeGMPanel === 'function') {
				closeGMPanel();
				gmPlayersData = {};
			}
			if (isHost) {
				if (typeof refreshGmPanelV2State === 'function') refreshGmPanelV2State();
				connection.invoke('GetAllPlayersData').catch(() => {});
			}
			renderCurrentGameUI();
		});
	},

	PlayerDisconnecting() {
		connection.off("PlayerDisconnecting");
		connection.on("PlayerDisconnecting", function (info) {
			console.log("Player disconnecting:", info);
			addEventMessage(`Гравець <span class="event-player">${info.playerName}</span> втратив з'єднання (очікування ${info.reconnectTimeout}с)...`);
		});
	},

	RoomLeft() {
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
	},

	GameStarted() {
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
	},

	resetPendingStateBeforeRejoin() {
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
	},

	RejoinSuccess() {
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

			if (isFinishedState) {
				currentApocalypse = data.apocalypse || data.Apocalypse;
				currentBunker = data.bunker || data.Bunker;
				currentVoting = null;
				document.getElementById('roomLobby').style.display = 'none';
				document.getElementById('gameSection').style.display = 'block';
				document.getElementById('myPlayerSection').style.display = 'block';
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
	},

	RejoinFailed() {
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
	},

	PlayerReconnected() {
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
	}
};
