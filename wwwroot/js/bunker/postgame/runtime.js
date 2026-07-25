// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function normalizePostGameTransition(value) {
	if (!value) return null;
	return {
		phase: value.phase || value.Phase || 'None',
		developerPresent: !!(value.developerPresent ?? value.DeveloperPresent),
		developerPlayerId: value.developerPlayerId || value.DeveloperPlayerId || null,
		canRevealRemainingCharacteristics: !!(value.canRevealRemainingCharacteristics ?? value.CanRevealRemainingCharacteristics),
		hostDecisionPending: !!(value.hostDecisionPending ?? value.HostDecisionPending),
		storyRequested: !!(value.storyRequested ?? value.StoryRequested),
		publishedStoryAvailable: !!(value.publishedStoryAvailable ?? value.PublishedStoryAvailable),
		waitingStatusCode: value.waitingStatusCode || value.WaitingStatusCode || 'none',
		storyDirectorAvailable: !!(value.storyDirectorAvailable ?? value.StoryDirectorAvailable),
		requestedStoryMode: value.requestedStoryMode || value.RequestedStoryMode || null
	};
}

function applyPostGameTransition(value) {
	const normalized = normalizePostGameTransition(value);
	if (!normalized) return;
	currentPostGameTransition = normalized;
	developerPresence = { ...developerPresence, developerPresent: normalized.developerPresent, developerPlayerId: normalized.developerPlayerId };
	renderPostGameCommandState();
	window.PostGameStoryDirector?.applyTransition(normalized);
}

function setPostGameButton(id, visible) {
	const button = document.getElementById(id);
	if (button) button.style.display = visible ? 'inline-flex' : 'none';
}

function renderPostGameCommandState() {
	const transition = currentPostGameTransition;
	const phase = transition?.phase || 'None';
	const inFinalDiscussion = phase === 'FinalDiscussion';
	const hostDecision = phase === 'HostDecision';
	const storyActive = phase === 'StoryRequested' || phase === 'StoryPreparation';
	const canStartAgain = phase === 'HostDecision' || phase === 'StoryRequested' || phase === 'StoryPreparation' || phase === 'StoryPublished' || phase === 'Completed';
	const canManagePostGame = isHost || (isDeveloper && developerState?.isActiveOperator);
	setPostGameButton('finishPostGameDiscussionButton', canManagePostGame && inFinalDiscussion);
	setPostGameButton('revealPostGameCharacteristicsButton', inFinalDiscussion);
	setPostGameButton('returnFinishedGameButton', canManagePostGame && canStartAgain);
	setPostGameButton('createPostGameStoryButton', canManagePostGame && hostDecision && !!transition?.developerPresent && !!transition?.storyDirectorAvailable);
	setPostGameButton('cancelPostGameStoryRequestButton', canManagePostGame && storyActive);
	setPostGameButton('openPostGameStoryDeveloperButton', isDeveloper && storyActive && !!transition?.storyDirectorAvailable);
	const waiting = document.getElementById('gameFinishedWaitingForHost');
	if (waiting) {
		waiting.textContent = hostDecision && (!transition?.developerPresent || !transition?.storyDirectorAvailable)
			? 'Фінальна історія недоступна: Developer офлайн або функцію вимкнено. Можна почати нову гру.'
			: storyActive ? (transition?.developerPresent ? 'Developer готує фінальну історію…' : 'Очікування Developer…')
			: inFinalDiscussion ? 'Фінальне обговорення: ігрове поле залишається доступним лише для читання та розкриття карток.'
			: '';
		waiting.style.display = waiting.textContent ? 'block' : 'none';
	}
}

async function finishPostGameDiscussion() {
	if (!isHost && !(isDeveloper && developerState?.isActiveOperator)) return;
	try { await connection.invoke('FinishPostGameDiscussion', crypto.randomUUID()); }
	catch (error) { alert(localizeServerMessage(error?.message || 'post_game_transition_failed')); }
}

async function revealRemainingPostGameCharacteristics() {
	try { await connection.invoke('RevealRemainingPostGameCharacteristics', crypto.randomUUID()); }
	catch (error) { alert(localizeServerMessage(error?.message || 'post_game_reveal_failed')); }
}

async function requestPostGameStoryMode(mode, parentEntryId = null) {
	try { await connection.invoke('ChoosePostGameStory', mode, parentEntryId, crypto.randomUUID()); }
	catch (error) { alert(localizeServerMessage(error?.message || 'post_game_story_failed')); }
}

function requestFinalPostGameStory() { return requestPostGameStoryMode('final_story'); }

async function cancelPostGameStoryRequest() {
	if (!isHost && !(isDeveloper && developerState?.isActiveOperator)) return;
	try { await connection.invoke('CancelPostGameStoryRequest', crypto.randomUUID()); }
	catch (error) { alert(localizeServerMessage(error?.message || 'post_game_story_failed')); }
}

function normalizeGameCompletion(source) {
	if (!source) return null;
	const winners = source.winners || source.Winners || [];
	return {
		reason: source.reason || source.Reason || 'bunker_capacity_reached',
		source: source.source || source.Source || '',
		bunkerCapacity: source.bunkerCapacity ?? source.BunkerCapacity ?? 0,
		survivorCount: source.survivorCount ?? source.SurvivorCount ?? winners.length,
		completedAtRound: source.completedAtRound ?? source.CompletedAtRound ?? source.currentRound ?? source.CurrentRound ?? 0,
		completedAtUtc: source.completedAtUtc || source.CompletedAtUtc || null,
		winners: winners.map(winner => ({
			name: winner.name || winner.Name || '',
			playerId: winner.playerId || winner.PlayerId || ''
		}))
	};
}

function isFinishedGameState(source, completion = null) {
	const state = source?.state || source?.State || source?.roomState || source?.RoomState || currentRoom?.state;
	const phase = source?.currentPhase || source?.CurrentPhase || source?.phase || source?.Phase || currentRoundState?.phase;
	return state === 'Finished' || phase === 'Finished' || !!completion;
}

function setGameFinishedMutationState(finished) {
	const roomSection = document.getElementById('roomSection');
	if (roomSection) roomSection.classList.toggle('is-game-finished', finished);

	const selectors = [
		'#startVotingBtn', '#startGameBtn', '#gmPanelBtn',
		'#votingPanel button', '#votingResultsPanel button', '#readyCheckPanel button',
		'#gmPanel button:not(.btn-close):not(.gm-tab)',
		'#myPlayerSection .vault-card-reveal', '#myPlayerSection .special-card-use-btn',
		'#myPlayerSection .btn-eliminated-reveal-all', '#threatPanel .char-btn',
		'#threatPanel .btn-scenario-image', '.events-section-wrapper .btn-apply-effect'
	];
	document.querySelectorAll(selectors.join(',')).forEach(button => {
		if (finished) {
			if (!button.dataset.postGameDisabled) {
				button.dataset.postGameDisabled = button.disabled ? 'preserve' : 'restore';
			}
			button.disabled = true;
			button.setAttribute('aria-disabled', 'true');
		} else if (button.dataset.postGameDisabled) {
			if (button.dataset.postGameDisabled === 'restore') button.disabled = false;
			button.removeAttribute('data-post-game-disabled');
			button.removeAttribute('aria-disabled');
		}
	});
}

function renderGameFinished(completion, context = {}) {
	const normalized = normalizeGameCompletion(completion || currentGameCompletion);
	if (!normalized) return false;

	currentGameCompletion = normalized;
	if (currentRoom) {
		currentRoom.state = 'Finished';
		currentRoom.phase = 'Finished';
	}
	currentGameTimer = null;
	gameTimerClockAnchor = null;
	currentVoting = null;
	myVote = null;

	showRoomSection();
	const lobby = document.getElementById('roomLobby');
	const game = document.getElementById('gameSection');
	const personal = document.getElementById('myPlayerSection');
	const panel = document.getElementById('gameFinishedPanel');
	if (lobby) lobby.style.display = 'none';
	if (game) game.style.display = 'block';
	if (personal) personal.style.display = 'block';
	if (panel) panel.style.display = 'grid';

	setText('#gameFinishedTitle', t('gameFinishedTitle'));
	setText('#gameFinishedReason', t('gameFinishedReason'));
	setText('#gameFinishedCapacityLabel', t('gameFinishedCapacity'));
	setText('#gameFinishedSurvivorLabel', t('gameFinishedSurvivors'));
	setText('#gameFinishedRoundLabel', t('gameFinishedRound'));
	setText('#gameFinishedTimeLabel', t('gameFinishedTime'));
	setText('#gameFinishedWinnersTitle', t('gameFinishedWinners'));
	setText('#gameFinishedCapacity', normalized.bunkerCapacity);
	setText('#gameFinishedSurvivorCount', normalized.survivorCount);
	setText('#gameFinishedRound', normalized.completedAtRound || '—');

	const locale = { uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU' }[getCurrentLanguage()] || 'uk-UA';
	const completedDate = normalized.completedAtUtc ? new Date(normalized.completedAtUtc) : null;
	setText('#gameFinishedTime', completedDate && !Number.isNaN(completedDate.getTime()) ? completedDate.toLocaleString(locale) : '—');

	const winnerList = document.getElementById('gameFinishedWinners');
	if (winnerList) {
		winnerList.innerHTML = normalized.winners.length
			? normalized.winners.map(winner => `<li>${escapeHtml(winner.name || t('unknown'))}</li>`).join('')
			: `<li>${escapeHtml(t('gameFinishedNoWinners'))}</li>`;
	}

	const newGameButton = document.getElementById('returnFinishedGameButton');
	if (newGameButton) {
		newGameButton.textContent = returnFinishedGamePending ? t('gameFinishedReturning') : t('gameFinishedNewGame');
		newGameButton.disabled = returnFinishedGamePending;
	}
	const copyButton = document.getElementById('copyGameSummaryButton');
	if (copyButton) copyButton.textContent = t('gameFinishedCopy');
	const stateLabel = document.getElementById('currentRoomState');
	if (stateLabel) stateLabel.textContent = t('gameFinishedTitle');

	setGameFinishedMutationState(true);
	renderPostGameCommandState();
	return true;
}

function buildGameSummaryText() {
	const completion = normalizeGameCompletion(currentGameCompletion);
	if (!completion) return '';
	const winnerNames = completion.winners.map(winner => winner.name).filter(Boolean);
	return [
		t('gameFinishedTitle'),
		`${t('gameFinishedCapacity')}: ${completion.bunkerCapacity}`,
		`${t('gameFinishedSurvivors')}: ${completion.survivorCount}`,
		`${t('gameFinishedRound')}: ${completion.completedAtRound || '—'}`,
		`${t('gameFinishedWinners')}: ${winnerNames.length ? winnerNames.join(', ') : t('gameFinishedNoWinners')}`
	].join('\n');
}

async function copyGameSummary() {
	const feedback = document.getElementById('gameFinishedFeedback');
	try {
		const summary = buildGameSummaryText();
		if (!summary || !navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
		await navigator.clipboard.writeText(summary);
		if (feedback) { feedback.textContent = t('gameFinishedCopied'); feedback.classList.remove('is-error'); }
		addEventMessage(escapeHtml(t('gameFinishedCopied')));
	} catch (_) {
		if (feedback) { feedback.textContent = t('gameFinishedCopyFailed'); feedback.classList.add('is-error'); }
		addEventMessage(escapeHtml(t('gameFinishedCopyFailed')));
	}
}

async function returnFinishedGameToLobby() {
	if ((!isHost && !(isDeveloper && developerState?.isActiveOperator)) || returnFinishedGamePending || !currentGameCompletion) return;
	if (!confirm(t('gameFinishedConfirmReturn'))) return;
	returnFinishedGamePending = true;
	renderGameFinished(currentGameCompletion, { source: 'return-request' });
	try {
		await connection.invoke('ReturnFinishedGameToLobby', true, crypto.randomUUID());
	} catch (error) {
		returnFinishedGamePending = false;
		renderGameFinished(currentGameCompletion, { source: 'return-error' });
		const feedback = document.getElementById('gameFinishedFeedback');
		if (feedback) { feedback.textContent = localizeServerMessage(error?.message || 'game_return_failed'); feedback.classList.add('is-error'); }
	}
}

function clearGameFinishedStateForLobby() {
	currentGameCompletion = null;
	currentPostGameTransition = null;
	returnFinishedGamePending = false;
	currentVoting = null;
	currentRoundState = null;
	currentThreat = null;
	currentThreatState = null;
	currentGameTimer = null;
	gameTimerClockAnchor = null;
	myVote = null;
	currentApocalypse = null;
	currentPublicGameSettings = { apocalypseThemeEnabled: true, apocalypseActivation: null };
	if (typeof renderApocalypse === "function") renderApocalypse(null);
	currentBunker = null;
	['myPlayerCards', 'mySpecialCardsList', 'votingCandidates', 'votingResultsContent', 'threatContent'].forEach(id => {
		const element = document.getElementById(id);
		if (element) element.innerHTML = '';
	});
	const panel = document.getElementById('gameFinishedPanel');
	if (panel) panel.style.display = 'none';
	const feedback = document.getElementById('gameFinishedFeedback');
	if (feedback) { feedback.textContent = ''; feedback.classList.remove('is-error'); }
	setGameFinishedMutationState(false);
	window.PostGameStoryDirector?.clear();
}
