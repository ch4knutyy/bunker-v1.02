// UI and errors SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.ui = {
	ReceiveError() {
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
	}
};
