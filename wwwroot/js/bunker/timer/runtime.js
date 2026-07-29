// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function normalizeGameTimer(source) {
	if (!source) return null;
	return {
		status: source.status || source.Status || 'Stopped',
		purpose: source.purpose || source.Purpose || 'Round',
		label: source.label || source.Label || '',
		durationSeconds: source.durationSeconds ?? source.DurationSeconds ?? 300,
		deadlineUtc: source.deadlineUtc || source.DeadlineUtc || null,
		remainingSeconds: Math.max(0, source.remainingSeconds ?? source.RemainingSeconds ?? 0),
		serverTimestampUtc: source.serverTimestampUtc || source.ServerTimestampUtc || new Date().toISOString(),
		updatedAtUtc: source.updatedAtUtc || source.UpdatedAtUtc || null
	};
}

function syncGameTimer(source) {
	currentGameTimer = normalizeGameTimer(source);
	if (!currentGameTimer) return;
	gameTimerClockAnchor = {
		serverMs: Date.parse(currentGameTimer.serverTimestampUtc),
		performanceMs: performance.now(),
		deadlineMs: currentGameTimer.deadlineUtc ? Date.parse(currentGameTimer.deadlineUtc) : null
	};
	const minutes = document.getElementById('gmTimerMinutes');
	const seconds = document.getElementById('gmTimerSeconds');
	if (minutes && seconds && !gameTimerCommandPending) {
		minutes.value = Math.floor(currentGameTimer.remainingSeconds / 60);
		seconds.value = currentGameTimer.remainingSeconds % 60;
	}
	renderGameTimer();
}

function getGameTimerRemaining() {
	if (!currentGameTimer) return 0;
	if (currentGameTimer.status.toLowerCase() !== 'running' || !gameTimerClockAnchor?.deadlineMs) {
		return Math.max(0, currentGameTimer.remainingSeconds);
	}
	const serverNow = gameTimerClockAnchor.serverMs + (performance.now() - gameTimerClockAnchor.performanceMs);
	return Math.max(0, Math.ceil((gameTimerClockAnchor.deadlineMs - serverNow) / 1000));
}

function renderGameTimer() {
	const publicTimer = document.getElementById('publicGameTimer');
	if (!currentGameTimer) {
		if (publicTimer) publicTimer.hidden = true;
		return;
	}
	const remaining = getGameTimerRemaining();
	const value = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
	const effectiveStatus = currentGameTimer.status.toLowerCase() === 'running' && remaining === 0 ? 'Expired' : currentGameTimer.status;
	const statusKey = effectiveStatus.toLowerCase() === 'expired' ? 'gmTimerExpired' :
		effectiveStatus.toLowerCase() === 'paused' ? 'gmPause' :
			effectiveStatus.toLowerCase() === 'stopped' ? 'gmTimerStopped' : effectiveStatus;
	setText('#publicGameTimerValue', value);
	setText('#publicGameTimerStatus', t(statusKey));
	if (publicTimer) {
		publicTimer.classList.remove('timer-running', 'timer-paused', 'timer-expired', 'timer-stopped', 'timer-warning', 'timer-critical');
		const timerState = ['running', 'paused', 'expired', 'stopped'].includes(effectiveStatus.toLowerCase())
			? effectiveStatus.toLowerCase()
			: 'stopped';
		publicTimer.classList.add(`timer-${timerState}`);
		const urgency = timerState === 'running' && remaining <= 15 ? 'critical' :
			timerState === 'running' && remaining <= 60 ? 'warning' : timerState === 'expired' ? 'expired' : 'normal';
		if (urgency === 'warning' || urgency === 'critical') publicTimer.classList.add(`timer-${urgency}`);
		publicTimer.hidden = !['running', 'paused'].includes(timerState);
		if (publicTimer.dataset.visualTimerState !== urgency) {
			publicTimer.dataset.visualTimerState = urgency;
			if (urgency === 'warning') triggerApocalypseVisualReaction('timer-warning');
			if (urgency === 'critical' || urgency === 'expired') triggerApocalypseVisualReaction('timer-critical');
		}
	}
	const status = currentGameTimer.status.toLowerCase();
	const setDisabled = (id, disabled) => { const element = document.getElementById(id); if (element) element.disabled = gameTimerCommandPending || disabled; };
	setDisabled('gmTimerStart', false);
	setDisabled('gmTimerPause', status !== 'running');
	setDisabled('gmTimerResume', status !== 'paused');
	setDisabled('gmTimerRestart', !currentGameTimer.durationSeconds);
	setDisabled('gmTimerStop', status === 'stopped');
}
