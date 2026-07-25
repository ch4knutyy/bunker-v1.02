// Post-game SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.postgame = {
	PostGameTransitionChanged() {
		connection.off('PostGameTransitionChanged');
		connection.on('PostGameTransitionChanged', applyPostGameTransition);
	},

	GameFinished() {
		connection.off("GameFinished");
		connection.on("GameFinished", function (data) {
			applyRoundState(data?.roundState || data?.RoundState);
			applyPostGameTransition(data?.postGameTransition || data?.PostGameTransition || null);
			const completion = normalizeGameCompletion(data);
			renderCurrentGameUI();
			renderGameFinished(completion, { source: 'live' });
		});
	}
};
