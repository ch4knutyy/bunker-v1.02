// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function normalizeRoundState(source) {
	if (!source) return null;

	const revealedPlayers = source.revealedPlayers || source.RevealedPlayers || [];
	const readyStatuses = source.readyStatuses || source.ReadyStatuses || [];
	const specialCards = source.specialCards || source.SpecialCards || [];
	const threatRevealed = !!(source.threatRevealed ?? source.ThreatRevealed);
	return {
		currentRound: source.currentRound ?? source.CurrentRound ?? 0,
		state: source.state || source.State || source.roomState || source.RoomState || currentRoom?.state || "Lobby",
		roomState: source.roomState || source.RoomState || currentRoom?.state || "Lobby",
		currentPhase: source.currentPhase || source.CurrentPhase || source.phase || source.Phase || currentRoundState?.phase || "Lobby",
		phase: source.phase || source.Phase || currentRoundState?.phase || "Lobby",
		completion: normalizeGameCompletion(source.completion || source.Completion || null),
		isPaused: source.isPaused ?? source.IsPaused ?? false,
		pauseReason: source.pauseReason || source.PauseReason || null,
		pausedAtUtc: source.pausedAtUtc || source.PausedAtUtc || null,
		gameTimer: normalizeGameTimer(source.gameTimer || source.GameTimer || null),
		activePlayerSeatNumber: source.activePlayerSeatNumber ?? source.ActivePlayerSeatNumber ?? source.currentPlayerSeatNumber ?? source.CurrentPlayerSeatNumber ?? source.turnPlayerSeatNumber ?? source.TurnPlayerSeatNumber ?? 0,
		activePlayerConnectionId: source.activePlayerConnectionId || source.ActivePlayerConnectionId || source.currentPlayerConnectionId || source.CurrentPlayerConnectionId || source.turnPlayerConnectionId || source.TurnPlayerConnectionId || "",
		activePlayerStableId: source.activePlayerStableId || source.ActivePlayerStableId || source.currentPlayerStableId || source.CurrentPlayerStableId || source.turnPlayerStableId || source.TurnPlayerStableId || "",
		activePlayerCount: source.activePlayerCount ?? source.ActivePlayerCount ?? 0,
		revealedCount: source.revealedCount ?? source.RevealedCount ?? 0,
		allPlayersRevealed: source.allPlayersRevealed ?? source.AllPlayersRevealed ?? false,
		canStartVoting: source.canStartVoting ?? source.CanStartVoting ?? false,
		votingStartBlockedCode: source.votingStartBlockedCode || source.VotingStartBlockedCode || null,
		threatRevealed,
		threatRevealedAtRound: source.threatRevealedAtRound ?? source.ThreatRevealedAtRound ?? null,
		threat: threatRevealed ? (source.threat || source.Threat || null) : null,
		threatState: normalizeThreatState(source.threatState || source.ThreatState || null),
		diceRoll: normalizeDiceRoll(source.diceRoll || source.DiceRoll || null),
		diceRolls: (source.diceRolls || source.DiceRolls || []).map(roll => normalizeDiceRoll(roll)).filter(Boolean),
		readyStatuses: readyStatuses.map(player => ({
			connectionId: player.connectionId || player.ConnectionId || "",
			stablePlayerId: player.stablePlayerId || player.StablePlayerId || "",
			name: player.name || player.Name || "",
			seatNumber: player.seatNumber ?? player.SeatNumber ?? 0,
			status: player.status || player.Status || "pending"
		})),
		specialCards: specialCards.map(card => normalizeSpecialCardState(card)),
		revealedPlayers: revealedPlayers.map(player => ({
			connectionId: player.connectionId || player.ConnectionId || "",
			stablePlayerId: player.stablePlayerId || player.StablePlayerId || "",
			name: player.name || player.Name || "",
			characteristicKey: player.characteristicKey || player.CharacteristicKey || ""
		}))
	};
}

function applyRoundState(source) {
	const normalized = normalizeRoundState(source);
	if (!normalized) return;

	currentRoundState = normalized;
	if (currentRoom) {
		currentRoom.state = normalized.state || normalized.roomState || currentRoom.state;
		currentRoom.currentRound = normalized.currentRound;
		currentRoom.phase = normalized.currentPhase || normalized.phase;
	}
	if (normalized.completion) currentGameCompletion = normalized.completion;
	applyPostGameTransition(source.postGameTransition || source.PostGameTransition || null);
	currentThreat = normalized.threat || (normalized.threatRevealed ? currentThreat : null);
	currentThreatState = normalized.threatState || currentThreatState;
	if (normalized.gameTimer) syncGameTimer(normalized.gameTimer);
	updateRoundStatusUI();
	renderThreatPanel(currentThreat);
	updateReadyCheckUI();
	updateSpecialCardsUI();
}

function getCurrentRoundNumber() {
	return currentRoundState?.currentRound || currentRoom?.currentRound || currentRoom?.CurrentRound || 0;
}

function getCurrentPhase() {
	return currentRoundState?.phase || currentRoom?.phase || currentRoom?.CurrentPhase || "Lobby";
}

function normalizeDiceRoll(source) {
	if (!source) return null;
	const value = Number(source.value ?? source.Value ?? 0);
	if (!Number.isFinite(value) || value <= 0) return null;

	return {
		round: source.round ?? source.Round ?? 0,
		value,
		rolledAt: source.rolledAt || source.RolledAt || null,
		rolledByPlayerId: source.rolledByPlayerId || source.RolledByPlayerId || "",
		rolledByConnectionId: source.rolledByConnectionId || source.RolledByConnectionId || "",
		rolledByPlayerName: source.rolledByPlayerName || source.RolledByPlayerName || "GM"
	};
}

function hasCurrentPlayerRevealedThisRound() {
	if (!currentRoundState?.revealedPlayers) return false;

	const self = roomPlayers?.[myConnectionId] || {};
	const selfStableId = self.stablePlayerId || stablePlayerId || "";

	return currentRoundState.revealedPlayers.some(player =>
		player.connectionId === myConnectionId ||
		(selfStableId && player.stablePlayerId === selfStableId)
	);
}

function canRevealThisRound() {
	const state = currentRoom?.state;
	return (state === "Playing" || state === "Started") && getCurrentPhase() === "RoundReveal" && !hasCurrentPlayerRevealedThisRound();
}

function getRevealBlockedReason() {
	const state = currentRoom?.state;
	if (state !== "Playing" && state !== "Started") {
		return getCurrentLanguage() === "en"
			? "The game has not started yet"
			: getCurrentLanguage() === "ru"
				? "Игра еще не началась"
				: "Гра ще не почалась";
	}

	if (getCurrentPhase() !== "RoundReveal") {
		return getCurrentLanguage() === "en"
			? "Revealing is not active now"
			: getCurrentLanguage() === "ru"
				? "Сейчас не фаза раскрытия характеристик"
				: "Зараз не фаза розкриття характеристик";
	}

	if (hasCurrentPlayerRevealedThisRound()) {
		return getCurrentLanguage() === "en"
			? "You already revealed a characteristic this round"
			: getCurrentLanguage() === "ru"
				? "Вы уже раскрыли характеристику в этом раунде"
				: "У цьому раунді ви вже розкрили характеристику";
	}

	return "";
}

function getPhaseLabel(phase = getCurrentPhase()) {
	const labels = {
		Lobby: "Лобі",
		RoundReveal: "Розкриття характеристик",
		RoundEnded: "Раунд завершено",
		Threat: "Загроза",
		ExtraInventory: "Додатковий інвентар",
		PreVotingReadyCheck: "Готовність до голосування",
		Voting: "Голосування",
		VotingResults: "Результати голосування",
		Finished: "Гра завершена"
	};
	return labels[phase] || phase || "Лобі";
}

function canEndRoundNow() {
	return (isHost || isDeveloper) &&
		currentRoom?.state === "Playing" &&
		getCurrentPhase() === "RoundReveal" &&
		currentRoundState?.allPlayersRevealed === true;
}

function canRollRoundDiceNow() {
	return canEndRoundNow() && !currentRoundState?.diceRoll;
}

function canStartVotingNow() {
	return (isHost || isDeveloper) && currentRoundState?.canStartVoting === true;
}

function getRoomStateLabel() {
	if (!currentRoom) return t('lobby');

	if (currentRoom.state === 'Lobby') return t('lobby');
	if (currentRoom.state === 'Finished') return t('gameFinishedTitle');
	if (currentRoom.state === 'Voting') {
		return getCurrentLanguage() === 'en' ? 'Voting' : getCurrentLanguage() === 'ru' ? 'Голосование' : 'Голосування';
	}

	const round = getCurrentRoundNumber();
	if (currentRoom.state === 'Playing' || currentRoom.state === 'Started') {
		return round > 0 ? `${t('game')} · Раунд ${round} · ${getPhaseLabel()}` : t('game');
	}

	return t('game');
}

function updateRoundStatusUI() {
	const round = getCurrentRoundNumber();
	const phase = getCurrentPhase();
	const shouldShow = currentRoom && currentRoom.state !== "Lobby" && round > 0;
	const panel = document.getElementById('roundStatusPanel');

	if (panel) {
		panel.style.display = shouldShow ? 'grid' : 'none';
		panel.classList.toggle('is-paused', shouldShow && currentRoundState?.isPaused === true);
		panel.classList.toggle('is-running', shouldShow && currentRoundState?.isPaused !== true);
	}

	const roundText = round > 0 ? `Раунд ${round}` : 'Раунд -';
	setText('#roundStatusNumber', roundText);
	setText('#roundStatusPhase', getPhaseLabel(phase));
	setText('#roundStatusProgress', `${currentRoundState?.revealedCount ?? 0}/${currentRoundState?.activePlayerCount ?? 0} відкрили`);
	setText('#gmCurrentRound', roundText);
	setText('#gmCurrentPhase', getPhaseLabel(phase));
	setText('#gmRoundProgress', `${currentRoundState?.revealedCount ?? 0}/${currentRoundState?.activePlayerCount ?? 0} відкрили`);
	const pauseBadge = document.getElementById('gmPauseBadge');
	if (pauseBadge) pauseBadge.textContent = currentRoundState?.isPaused ? t('gmStatusPaused') : t('gmStatusRunning');
	const pauseReasonSummary = document.getElementById('gmPauseReasonSummary');
	if (pauseReasonSummary) {
		const pauseReason = currentRoundState?.isPaused ? (currentRoundState.pauseReason || '') : '';
		pauseReasonSummary.textContent = pauseReason;
		pauseReasonSummary.style.display = pauseReason ? '' : 'none';
	}
	const manualRound = document.getElementById('gmManualRound');
	if (manualRound && document.activeElement !== manualRound) manualRound.value = round || 1;
	const diceRoll = currentRoundState?.diceRoll || null;
	const diceText = diceRoll ? `Кубик: ${diceRoll.value}` : '';
	setText('#roundDiceResult', diceText);
	setText('#gmDiceResult', diceText);
	const roundDiceResult = document.getElementById('roundDiceResult');
	if (roundDiceResult) roundDiceResult.style.display = diceRoll ? 'inline-flex' : 'none';
	const gmDiceResult = document.getElementById('gmDiceResult');
	if (gmDiceResult) gmDiceResult.style.display = diceRoll ? 'inline-flex' : 'none';

	const rollDiceBtn = document.getElementById('rollDiceBtn');
	if (rollDiceBtn) {
		rollDiceBtn.style.display = isHost && currentRoom?.state !== "Lobby" ? 'inline-flex' : 'none';
		rollDiceBtn.disabled = !canRollRoundDiceNow();
		rollDiceBtn.title = diceRoll
			? 'Кубик у цьому раунді вже кинуто'
			: canRollRoundDiceNow()
				? ''
				: 'Кубик доступний після reveal усіх активних гравців';
	}

	const endRoundBtn = document.getElementById('endRoundBtn');
	if (endRoundBtn) {
		endRoundBtn.disabled = !canEndRoundNow();
		endRoundBtn.title = endRoundBtn.disabled
			? 'Раунд можна завершити після reveal усіх активних гравців'
			: '';
	}

	const readyBtn = document.getElementById('startReadyCheckBtn');
	if (readyBtn) {
		const canMarkReady = isHost &&
			currentRoom?.state === "Playing" &&
			['RoundReveal', 'ExtraInventory', 'PreVotingReadyCheck', 'VotingResults'].includes(phase);
		readyBtn.style.display = isHost && currentRoom?.state !== "Lobby" ? 'inline-flex' : 'none';
		readyBtn.disabled = !canMarkReady;
		readyBtn.title = canMarkReady ? '' : t('unavailableNow');
	}

	const gmStartVotingBtn = document.getElementById('gmStartVotingBtn');
	if (gmStartVotingBtn) {
		gmStartVotingBtn.style.display = isHost && shouldShow ? 'inline-flex' : 'none';
		gmStartVotingBtn.disabled = !canStartVotingNow();
	}

	const hint = document.getElementById('gmVotingLockedHint');
	if (hint) {
		if (!shouldShow) {
			hint.textContent = 'Голосування відкриється після старту гри.';
		} else if (round < 3) {
			hint.textContent = 'Голосування відкриється після завершення 3 раунду.';
		} else if (phase === "RoundReveal") {
			hint.textContent = 'Завершіть 3 раунд після reveal усіх активних гравців.';
		} else if (canStartVotingNow()) {
			hint.textContent = 'Можна починати голосування.';
		} else if (phase === "Voting" || phase === "VotingResults") {
			hint.textContent = getPhaseLabel(phase);
		} else {
			hint.textContent = getPhaseLabel(phase);
		}
	}

	const topVotingBtn = document.getElementById('startVotingBtn');
	if (topVotingBtn) {
		topVotingBtn.style.display = canStartVotingNow() ? 'inline-block' : 'none';
	}
}

function getReadyStatusLabel(status) {
	const labels = {
		pending: 'Не відповів',
		ready: 'Готовий',
		add: 'Хоче щось додати',
		special: 'Хоче використати карту'
	};
	return labels[status] || labels.pending;
}

function getReadyStatusClass(status) {
	return ['ready', 'add', 'special'].includes(status) ? status : 'pending';
}

function updateReadyCheckUI() {
	const statuses = currentRoundState?.readyStatuses || [];
	const phase = getCurrentPhase();
	const isReadyPhase = currentRoom?.state === 'Playing' && phase === 'PreVotingReadyCheck';
	const hasRoundReadyStatus = statuses.some(player => player.status && player.status !== 'pending');
	const panel = document.getElementById('readyCheckPanel');
	const summary = document.getElementById('readyCheckSummary');
	const gmList = document.getElementById('gmReadyStatusList');

	if (panel) {
		panel.style.display = isReadyPhase ? 'block' : 'none';
	}

	const answered = statuses.filter(player => player.status && player.status !== 'pending').length;
	if (summary) {
		summary.textContent = statuses.length > 0
			? `${answered}/${statuses.length} відповіли`
			: 'Очікуємо відповіді гравців';
	}

	if (gmList) {
		if (isHost && currentRoom?.state === 'Playing' && hasRoundReadyStatus && statuses.length > 0) {
			gmList.style.display = 'grid';
			gmList.innerHTML = statuses.map(player => {
				const seat = player.seatNumber ? `#${player.seatNumber} ` : '';
				const statusClass = getReadyStatusClass(player.status);
				return `
                        <div class="gm-ready-status ${statusClass}">
                            <span>${seat}${escapeHtml(player.name || t('unknown'))}</span>
                            <strong>${getReadyStatusLabel(player.status)}</strong>
                        </div>
                    `;
			}).join('');
		} else {
			gmList.style.display = 'none';
			gmList.innerHTML = '';
		}
	}
}
