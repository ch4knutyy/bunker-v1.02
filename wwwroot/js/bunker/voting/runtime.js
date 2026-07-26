// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function endRound() {
	if (!canEndRoundNow()) {
		addEventMessage('Помилка: раунд можна завершити після reveal усіх активних гравців');
		return;
	}

	if (confirm('Завершити поточний раунд?')) {
		connection.invoke("EndRound")
			.catch(err => console.error("EndRound error:", err));
	}
}

function rollRoundDice() {
	if (!canRollRoundDiceNow()) {
		addEventMessage('Помилка: кубик доступний після reveal усіх активних гравців і тільки один раз за раунд');
		return;
	}

	const commandId = globalThis.crypto?.randomUUID?.() ||
		`round-dice-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	connection.invoke("RollRoundDice", commandId)
		.catch(err => console.error("RollRoundDice error:", err));
}

function markAllPlayersReady() {
	if (!isHost) return;
	connection.invoke("MarkAllPlayersReady")
		.catch(err => console.error("MarkAllPlayersReady error:", err));
}

function submitVotingReadyStatus(status) {
	connection.invoke("SubmitVotingReadyStatus", status)
		.catch(err => console.error("SubmitVotingReadyStatus error:", err));
}

function startVoting() {
	if (!canStartVotingNow()) {
		addEventMessage(`Помилка: ${t('gmVotingUnavailable')}`);
		return;
	}

	const early = currentRoundState?.isEarlyVoting === true;
	if (confirm(t(early ? 'gmConfirmEarlyVoting' : 'gmConfirmVoting'))) {
		connection.invoke("StartVoting", crypto.randomUUID())
			.catch(err => console.error("StartVoting error:", err));
	}
}

function showVotingPanel(data) {
	document.getElementById('votingRound').textContent = data.round || data.Round || data.roundNumber || data.RoundNumber || getCurrentRoundNumber();
	const votedCount = data.votedCount ?? data.VotedCount ?? 0;
	const totalVoters = data.totalVoters ?? data.TotalVoters ?? data.eligibleVoters ?? data.EligibleVoters ?? 0;
	document.getElementById('votingProgressText').textContent = `${votedCount}/${totalVoters} проголосували`;
	document.getElementById('myVoteStatus').style.display = 'none';
	const blockedVoterIds = data.blockedVoterIds || data.BlockedVoterIds || [];
	const voteMultipliers = data.voteMultipliers || data.VoteMultipliers || {};
	const myStable = getMyStablePlayerId();
	const isMyVoteBlocked = blockedVoterIds.includes(myStable) || blockedVoterIds.includes(myConnectionId);

	// Показуємо кнопки хоста
	document.getElementById('votingHostControls').style.display = isHost ? 'flex' : 'none';

	// Рендеримо кандидатів
	const candidatesContainer = document.getElementById('votingCandidates');
	const candidates = data.candidates || data.Candidates || [];
	const blockedNotice = isMyVoteBlocked
		? '<div class="voting-blocked-notice">Ваш голос заблоковано активованою спеціальною картою. Ви можете бачити перебіг голосування, але не голосуєте.</div>'
		: '';
	candidatesContainer.innerHTML = blockedNotice + candidates.map(c => {
		var badges = '';
		const connectionId = c.connectionId || c.ConnectionId;
		const candidateStableId = c.stablePlayerId || c.StablePlayerId || '';
		const playerName = c.name || c.Name || t('unknown');
		const seatNumber = c.seatNumber ?? c.SeatNumber ?? 0;
		const isProtected = c.isProtected ?? c.IsProtected ?? false;
		const extraVotes = c.extraVotes ?? c.ExtraVotes ?? 0;
		const multiplier = voteMultipliers[candidateStableId] || voteMultipliers[connectionId] || 1;

		if (isProtected) badges += '<span class="badge-protected" title="Захищений від голосування">🛡️</span>';
		if (extraVotes > 0) badges += `<span class="badge-extra-votes" title="Має ${extraVotes} додаткових голосів">+${extraVotes}🗳️</span>`;
		if (multiplier > 1) badges += `<span class="badge-vote-multiplier" title="Голоси проти цього гравця множаться">×${multiplier}</span>`;

		var voteBtn = '';
		if (connectionId === myConnectionId) {
			voteBtn = '<span class="self-label">(Ви)</span>';
		} else if (isMyVoteBlocked) {
			voteBtn = '<span class="blocked-voter-label">Ваш голос заблоковано</span>';
		} else if (isProtected) {
			voteBtn = '<span class="protected-label">Захищений</span>';
		} else {
			voteBtn = `<button class="btn-vote-for" onclick="voteFor('${connectionId}')">Голосувати</button>`;
		}

		return `<div class="voting-candidate ${connectionId === myConnectionId ? 'self-candidate' : ''} ${isProtected ? 'protected-candidate' : ''}"
                 data-connection-id="${connectionId}">
                <span class="candidate-name">${seatNumber ? `#${seatNumber} ` : ''}${escapeHtml(playerName)} ${badges}</span>
                ${voteBtn}
            </div>`;
	}).join('');

	document.getElementById('votingPanel').style.display = 'block';

	// Ховаємо кнопку голосування
	document.getElementById('startVotingBtn').style.display = 'none';
	syncEndVotingControls();
}

function updateVotingCandidates() {
	if (!myVote) return;

	// Позначаємо вибраного кандидата
	document.querySelectorAll('.voting-candidate').forEach(el => {
		const connId = el.dataset.connectionId;
		if (connId === myVote.targetConnectionId) {
			el.classList.add('voted-for');
			const btn = el.querySelector('.btn-vote-for');
			if (btn) btn.textContent = '✓ Ваш голос';
		} else {
			el.classList.remove('voted-for');
			const btn = el.querySelector('.btn-vote-for');
			if (btn) btn.textContent = 'Голосувати';
		}
	});
}

function voteFor(targetConnectionId) {
	connection.invoke("Vote", targetConnectionId)
		.catch(err => console.error("Vote error:", err));
}

let endVotingPending = false;

function isVotingActive() {
	const state = currentVoting?.state || currentVoting?.State || '';
	return currentRoom?.state === 'Voting' && (!state || state === 'Active');
}

function syncEndVotingControls() {
	document.querySelectorAll('[data-voting-action="end"]').forEach(button => {
		const available = isHost && isVotingActive();
		button.hidden = !available;
		button.disabled = !available || endVotingPending;
	});
}

async function endVotingEarly() {
	if (endVotingPending || !isVotingActive()) {
		syncEndVotingControls();
		return;
	}
	if (!confirm('Завершити голосування достроково?')) return;

	endVotingPending = true;
	syncEndVotingControls();
	try {
		await connection.invoke("EndVoting");
	} catch (err) {
		console.error("EndVoting error:", err);
		addEventMessage(`Помилка: ${localizeServerMessage(err?.message || 'EndVoting')}`);
	} finally {
		endVotingPending = false;
		syncEndVotingControls();
	}
}

function initializeVotingControls() {
	if (document.documentElement.dataset.votingControlsBound === 'true') return;
	document.documentElement.dataset.votingControlsBound = 'true';
	document.addEventListener('click', event => {
		if (event.target.closest('[data-voting-action="end"]')) endVotingEarly();
	});
	syncEndVotingControls();
}

function cancelVoting() {
	if (confirm('Скасувати голосування?')) {
		connection.invoke("CancelVoting")
			.catch(err => console.error("CancelVoting error:", err));
	}
}

function showVotingResults(data) {
	const resultsContainer = document.getElementById('votingResultsContent');

	const results = data.results || data.Results || [];
	const nonVoters = data.nonVoters || data.NonVoters || [];
	const effects = data.specialCardEffects || data.SpecialCardEffects || [];
	const roundNumber = data.roundNumber || data.RoundNumber || data.round || data.Round || getCurrentRoundNumber();
	const totalVotes = data.totalVotes ?? data.TotalVotes ?? results.reduce((sum, r) => sum + (r.voteCount ?? r.VoteCount ?? 0), 0);
	const votedCount = data.votedCount ?? data.VotedCount ?? 0;
	const totalVoters = data.totalVoters ?? data.TotalVoters ?? 0;
	const state = data.state || data.State || '';
	const isResolved = state === 'Resolved';

	let resultsHtml = `
            <div class="voting-results-title">
                <span>Результат останнього голосування</span>
                <strong>Результат голосування — Раунд ${escapeHtml(roundNumber)}</strong>
                <small>${votedCount}/${totalVoters} учасників проголосували · ${totalVotes} голосів загалом</small>
            </div>
        `;

	if (results.length === 0) {
		resultsHtml += '<p class="no-votes">Голосів немає.</p>';
	} else {
		resultsHtml += '<div class="voting-results-list detailed">';
		results.forEach((r, i) => {
			const voteCount = r.voteCount ?? r.VoteCount ?? 0;
			const percentage = Number(r.percentage ?? r.Percentage ?? (totalVotes > 0 ? (voteCount * 100 / totalVotes) : 0));
			const seatNumber = r.seatNumber ?? r.SeatNumber ?? 0;
			const playerName = r.playerName || r.PlayerName || t('unknown');
			const voters = r.voters || r.Voters || [];
			const isTop = i === 0;
			const votersText = voters.length > 0
				? voters.map(v => {
					const voterSeat = v.voterSeatNumber ?? v.VoterSeatNumber ?? 0;
					const voterName = v.voterName || v.VoterName || t('unknown');
					const weight = v.voteWeight ?? v.VoteWeight ?? 1;
					const weightLabel = weight > 1 ? ` ×${weight}` : '';
					return `<span class="vote-voter">${voterSeat ? `#${voterSeat} ` : ''}${escapeHtml(voterName)}${weightLabel}</span>`;
				}).join('')
				: '<span class="vote-voter muted">Ніхто</span>';

			resultsHtml += `
                    <div class="vote-result-detailed ${isTop ? 'top-voted' : ''}" data-connection-id="${escapeHtml(r.connectionId || r.ConnectionId || '')}">
                        <div class="vote-result-main">
                            <span class="result-seat">${seatNumber ? `#${seatNumber}` : `#${i + 1}`}</span>
                            <strong class="result-name">${escapeHtml(playerName)}</strong>
                            <span class="result-votes">${voteCount} голосів</span>
                            <span class="result-percent">${percentage.toFixed(1)}%</span>
                        </div>
                        <div class="vote-progress-bar" aria-hidden="true">
                            <span style="width: ${Math.max(0, Math.min(100, percentage))}%"></span>
                        </div>
                        <div class="vote-voters-list">
                            <span class="vote-voters-label">Голосували проти:</span>
                            <div>${votersText}</div>
                        </div>
                    </div>
                `;
		});
		resultsHtml += '</div>';
	}

	if (data.isTie || data.IsTie) {
		resultsHtml += '<p class="tie-warning">Нічия. Ведучий вирішує фінальну дію.</p>';
	}

	resultsHtml += `
            <div class="non-voters-block">
                <h4>Не голосували</h4>
                ${nonVoters.length > 0
			? `<div class="non-voters-list">${nonVoters.map(v => {
				const seat = v.seatNumber ?? v.SeatNumber ?? 0;
				const name = v.voterName || v.VoterName || t('unknown');
				const isBlocked = v.isBlocked ?? v.IsBlocked ?? false;
				const reason = v.reason || v.Reason || '';
				return `<span class="${isBlocked ? 'blocked-non-voter' : ''}">${seat ? `#${seat} ` : ''}${escapeHtml(name)}${reason ? ` — ${escapeHtml(reason)}` : ''}</span>`;
			}).join('')}</div>`
			: '<p>Усі доступні гравці проголосували.</p>'}
            </div>
        `;

	if (effects.length > 0) {
		resultsHtml += `
                <div class="special-effects-block">
                    <h4>Ефекти спеціальних карт</h4>
                    <ul>${effects.map(effect => `<li>${escapeHtml(effect)}</li>`).join('')}</ul>
                </div>
            `;
	}

	resultsContainer.innerHTML = resultsHtml;

	// Показуємо/ховаємо кнопки рішення (тільки для хоста)
	document.getElementById('votingDecisionControls').style.display = isHost && !isResolved ? 'block' : 'none';

	// Оновлюємо кнопку елімінації
	const eliminateBtn = document.getElementById('eliminateTopBtn');
	const topName = data.topVotedPlayerName || data.TopVotedPlayerName;
	const topId = data.topVotedPlayerId || data.TopVotedPlayerId;
	if (topName) {
		eliminateBtn.textContent = `Елімінувати ${topName}`;
		eliminateBtn.dataset.targetId = topId;
	}

	document.getElementById('votingResultsPanel').style.display = 'block';
}

function eliminateTopVoted() {
	const btn = document.getElementById('eliminateTopBtn');
	const targetId = btn.dataset.targetId;

	if (!targetId) {
		alert('Немає кандидата для елімінації');
		return;
	}

	if (confirm('Елімінувати цього гравця?')) {
		connection.invoke("ResolveVoting", targetId)
			.catch(err => console.error("ResolveVoting error:", err));
	}
}

function resolveNoElimination() {
	if (confirm('Нікого не елімінувати?')) {
		connection.invoke("ResolveVoting", null)
			.catch(err => console.error("ResolveVoting error:", err));
	}
}
