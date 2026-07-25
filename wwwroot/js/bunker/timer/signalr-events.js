// Timer SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.timer = {
	GamePauseUpdated() {
		connection.off("GamePauseUpdated");
		connection.on("GamePauseUpdated", function (data) {
			currentRoundState = currentRoundState || {};
			currentRoundState.isPaused = data.isPaused ?? data.IsPaused ?? false;
			currentRoundState.pauseReason = data.reason || data.Reason || null;
			finishGmRoundCommand(currentRoundState.isPaused ? t('gmPause') : t('gmResume'));
			renderCurrentGameUI();
			if (gmRoundCommandPending) finishGmRoundCommand('');
		});
	},

	GameTimerUpdated() {
		connection.off("GameTimerUpdated");
		connection.on("GameTimerUpdated", function (data) {
			syncGameTimer(data);
			gameTimerCommandPending = false;
			document.querySelectorAll('.gm-timer-command').forEach(button => button.disabled = false);
			const feedback = document.getElementById('gmTimerFeedback');
			if (feedback) feedback.textContent = data.status || data.Status || '';
			renderGameTimer();
		});
	}
};
