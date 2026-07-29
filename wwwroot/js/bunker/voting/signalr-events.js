// Voting SignalR registrations.
// Loaded before core/signalr-events.js; handlers are registered by the central orchestrator.
window.BunkerSignalREvents = window.BunkerSignalREvents || {};

window.BunkerSignalREvents.voting = {
	VotingReadyCheckStarted() {
		connection.off("VotingReadyCheckStarted");
		connection.on("VotingReadyCheckStarted", function (data) {
			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();
			addEventMessage(data.message || data.Message || 'Всі готові до голосування?');
		});
	},

	VotingReadyCheckClosed() {
		connection.off("VotingReadyCheckClosed");
		connection.on("VotingReadyCheckClosed", function (data) {
			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();
			addEventMessage(t('gmReadyCheckCancelled'));
		});
	},

	VotingReadyStatusUpdated() {
		connection.off("VotingReadyStatusUpdated");
		connection.on("VotingReadyStatusUpdated", function (data) {
			applyRoundState(data.roundState || data.RoundState);
			renderCurrentGameUI();
			const playerName = data.playerName || data.PlayerName || t('unknown');
			const status = data.status || data.Status || 'pending';
			addEventMessage(`${playerName}: ${getReadyStatusLabel(status)}`);
		});
	},

	VotingStarted() {
		connection.off("VotingStarted");
		connection.on("VotingStarted", function (data) {
			console.log("Voting started:", data);
			currentVoting = data;
			if (currentRoom) currentRoom.state = "Voting";
			applyRoundState(data.roundState || data.RoundState);
			myVote = null;
			showVotingPanel(data);
			renderCurrentGameUI();
			window.syncBunkerVotingStoryState?.();
			syncEndVotingControls();
			triggerApocalypseVisualReaction('voting-start');
			addEventMessage(`<span class="event-voting">🗳️ Голосування почалось!</span> Раунд ${data.round || data.Round || getCurrentRoundNumber()}`);
		});
	},

	VoteCast() {
		connection.off("VoteCast");
		connection.on("VoteCast", function (data) {
			console.log("Vote cast:", data);
			myVote = data;
			document.getElementById('myVoteStatus').style.display = 'block';
			document.getElementById('myVoteTarget').textContent = data.targetName;
			updateVotingCandidates();
			addEventMessage(`Ви проголосували за ${data.targetName}${data.changed ? ' (змінено)' : ''}`);
		});
	},

	VotingProgress() {
		connection.off("VotingProgress");
		connection.on("VotingProgress", function (data) {
			console.log("Voting progress:", data);
			document.getElementById('votingProgressText').textContent = `${data.votedCount}/${data.totalVoters} проголосували`;
			window.gmPanelV2OnStateChanged?.();
		});
	},

	VotingEnded() {
		connection.off("VotingEnded");
		connection.on("VotingEnded", function (data) {
			console.log("Voting ended:", data);
			currentVoting = data;
			endVotingPending = false;

			// Ховаємо панель голосування
			document.getElementById('votingPanel').style.display = 'none';
			syncEndVotingControls();

			// Показуємо результати (тільки хосту показуємо кнопки)
			showVotingResults(data);
			window.syncBunkerVotingStoryState?.();
			window.gmPanelV2OnStateChanged?.();
			window.syncBunkerVotingStoryState?.();

			addEventMessage(`<span class="event-voting">🗳️ Голосування завершено!</span> Лідер: ${data.topVotedPlayerName || 'Нічия'}`);
		});
	},

	VotingResolved() {
		connection.off("VotingResolved");
		connection.on("VotingResolved", function (data) {
			console.log("Voting resolved:", data);
			currentVoting = data.voting || data.Voting || currentVoting;
			endVotingPending = false;
			if (currentRoom) {
				currentRoom.state = "Playing";
				currentRoom.currentRound = data.currentRound || data.CurrentRound || data.nextRound || data.NextRound || currentRoom.currentRound;
			}
			applyRoundState(data.roundState || data.RoundState);
			document.getElementById('votingPanel').style.display = 'none';
			syncEndVotingControls();
			if (currentVoting) {
				showVotingResults(currentVoting);
			}

			// Оновлюємо UI
			renderCurrentGameUI();
			triggerApocalypseVisualReaction('voting-result');

			addEventMessage(`<span class="event-voting">⚖️</span> ${data.message}`);
		});
	},

	VotingCancelled() {
		connection.off("VotingCancelled");
		connection.on("VotingCancelled", function (data) {
			console.log("Voting cancelled:", data);
			currentVoting = null;
			endVotingPending = false;
			if (currentRoom) currentRoom.state = "Playing";
			applyRoundState(data.roundState || data.RoundState);

			document.getElementById('votingPanel').style.display = 'none';
			document.getElementById('votingResultsPanel').style.display = 'none';
			syncEndVotingControls();
			window.gmPanelV2OnStateChanged?.();

			addEventMessage(`<span class="event-warning">⚠️ ${data.message}</span>`);
		});
	},

	VotingAdminUpdated() {
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
			window.gmPanelV2OnStateChanged?.();
			finishGmRoundCommand('');
		});
	}
};
