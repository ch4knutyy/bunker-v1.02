// Rounds SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.rounds = {
	RoundStateUpdated() {
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
	},

	RoundEnded() {
		connection.off("RoundEnded");
		connection.on("RoundEnded", function (data) {
			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();
			addEventMessage(`Раунд ${data.completedRound || data.CompletedRound} завершено.`);
		});
	},

	RoundAdvanced() {
		connection.off("RoundAdvanced");
		connection.on("RoundAdvanced", function (data) {
			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();
			triggerApocalypseVisualReaction('round-change');
			addEventMessage(`Почався раунд ${data.currentRound || data.CurrentRound || getCurrentRoundNumber()}.`);
		});
	},

	RoundDiceRolled() {
		connection.off("RoundDiceRolled");
		connection.on("RoundDiceRolled", function (data) {
			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();
			const roll = normalizeDiceRoll(data.diceRoll || data.DiceRoll || data.roll || data.Roll);
			const value = roll?.value || '?';
			const round = roll?.round || getCurrentRoundNumber();
			const roller = roll?.rolledByPlayerName || 'GM';
			addEventMessage(
				t('gmDiceFeedResult')
					.replace('{player}', escapeHtml(roller))
					.replace('{round}', round)
					.replace('{value}', `<strong>${value}</strong>`)
			);
		});
	},

	RoundChangePreview() {
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
	}
};
