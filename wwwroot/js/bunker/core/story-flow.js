// Canonical game containers are arranged vertically; game state remains server-authoritative.

function bunkerStoryText(key) {
	return typeof t === 'function' ? t(key) : key;
}

function ensureBunkerStorySection(game, id, titleKey = '') {
	let section = document.getElementById(id);
	if (section) return section;
	section = document.createElement('section');
	section.id = id;
	section.className = `game-story-section ${id}`;
	if (titleKey) {
		section.setAttribute('aria-labelledby', `${id}-title`);
		const title = document.createElement('h2');
		title.id = `${id}-title`;
		title.className = 'section-title site-section-heading';
		title.dataset.storyTitle = titleKey;
		title.textContent = bunkerStoryText(titleKey);
		section.append(title);
	}
	game.append(section);
	return section;
}

function organizeBunkerGameStory() {
	const game = document.getElementById('gameSection');
	if (!game) return false;
	const apocalypse = ensureBunkerStorySection(game, 'apocalypseStorySection');
	const bunker = ensureBunkerStorySection(game, 'bunkerStorySection');
	const threat = ensureBunkerStorySection(game, 'threatGameSection');
	threat.hidden = document.getElementById('threatPanel')?.hidden !== false;
	const characteristics = ensureBunkerStorySection(game, 'characteristicsGameSection');
	const voting = ensureBunkerStorySection(game, 'votingGameSection', 'storyVotingTitle');
	const special = ensureBunkerStorySection(game, 'specialCardsGameSection');
	const additional = ensureBunkerStorySection(game, 'additionalGameplaySection');
	const journal = ensureBunkerStorySection(game, 'gameJournalSection');

	const move = (id, target) => {
		const element = document.getElementById(id);
		if (element && element.parentElement !== target) target.append(element);
	};
	move('apocalypsePanel', apocalypse);
	move('bunkerPanel', bunker);
	move('threatPanel', threat);
	move('myPlayerSection', characteristics);
	move('playersOverviewHeading', characteristics);
	move('publicPlayerOverview', characteristics);
	move('startVotingBtn', voting);
	move('readyCheckPanel', voting);
	move('votingPanel', voting);
	move('votingResultsPanel', voting);
	move('mySpecialCardsSection', special);
	move('specialCardsSection', special);
	move('myEventCardsSection', additional);
	const events = document.querySelector('.events-section-wrapper');
	if (events && events.parentElement !== journal) journal.append(events);

	const obsoleteScenario = game.querySelector('.scenario-immersive-section');
	if (obsoleteScenario && !obsoleteScenario.querySelector('#apocalypsePanel, #bunkerPanel, #threatPanel')) obsoleteScenario.remove();
	game.classList.add('game-story-page');
	game.querySelectorAll('[data-story-title]').forEach(title => { title.textContent = bunkerStoryText(title.dataset.storyTitle); });
	return true;
}

function syncBunkerVotingStoryState() {
	const section = document.getElementById('votingGameSection');
	if (!section) return;
	let waiting = document.getElementById('votingStoryWaiting');
	if (!waiting) {
		waiting = document.createElement('p');
		waiting.id = 'votingStoryWaiting';
		waiting.className = 'voting-story-waiting';
		section.querySelector('h2')?.after(waiting);
	}
	const active = typeof isVotingActive === 'function' && isVotingActive();
	waiting.hidden = active;
	waiting.textContent = bunkerStoryText(isHost && typeof canStartVotingNow === 'function' && canStartVotingNow()
		? 'storyVotingHostReady' : 'storyVotingWaiting');
}
