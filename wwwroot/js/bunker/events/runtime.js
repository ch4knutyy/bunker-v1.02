// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function sendGameEvent() {
	var text = document.getElementById('gmEventText').value.trim();
	var type = document.getElementById('gmEventType').value;
	var feedback = document.getElementById('gmEventFeedback');
	if (!text) {
		if (feedback) feedback.textContent = t('gmEventTextRequired');
		return;
	}
	if (feedback) feedback.textContent = '';
	connection.invoke("SendGameEvent", text, type)
		.catch(function (err) {
			console.error("SendGameEvent error:", err);
			if (feedback) feedback.textContent = t('gmEventSendFailed');
		});
	document.getElementById('gmEventText').value = '';
}

function sendQuickEvent(text, type) {
	const input = document.getElementById('gmEventText');
	const select = document.getElementById('gmEventType');
	if (input) {
		input.value = text || '';
		input.focus();
	}
	if (select) select.value = type || 'info';
}

function closeScenarioPublicModal() {
	const modal = document.getElementById('scenarioPublicModal');
	if (modal) { modal.hidden = true; modal.style.display = 'none'; }
}

function closeScenarioPrivateModal() {
	const modal = document.getElementById('scenarioPrivateModal');
	if (modal) { modal.hidden = true; modal.style.display = 'none'; }
}

function renderScenarioPrivateChoices() {
	const container = document.getElementById('scenarioPrivateChoices');
	if (!container) return;
	const choice = currentPendingScenarioChoice;
	const choices = choice?.choices || choice?.Choices || [];
	if (!choice || !choices.length) { container.innerHTML = ''; return; }
	const players = eventCardPlayerOptions(getMyStablePlayerId()).filter(option => !option.isOwner);
	container.innerHTML = `<select id="scenarioChoiceTarget" class="special-card-target-select"><option value="">${escapeHtml(t('choosePlayer'))}</option>${players.map(player => `<option value="${escapeHtml(player.id)}">${escapeHtml(player.name)}</option>`).join('')}</select>
		<div class="scenario-choice-actions">${choices.map(option => `<button type="button" class="btn-primary" onclick="resolveScenarioPrivateChoice('${escapeHtml(option.id || option.Id)}')">${escapeHtml(eventCardLocalized(option.label || option.Label))}</button>`).join('')}</div>`;
}

async function resolveScenarioPrivateChoice(optionId) {
	if (!currentPendingScenarioChoice) return;
	const choiceId = currentPendingScenarioChoice.choiceId || currentPendingScenarioChoice.ChoiceId;
	const target = document.getElementById('scenarioChoiceTarget')?.value || null;
	try {
		await connection.invoke('ResolveScenarioChoice', choiceId, optionId, target, crypto.randomUUID());
	} catch (error) {
		console.error('Scenario choice failed', error);
	}
}

async function gmRevealNextBunkerIntel() {
	try { await connection.invoke('RevealNextBunkerIntel', crypto.randomUUID()); }
	catch (error) { console.error('Bunker intel reveal failed', error); }
}

async function gmGrantPrivateBunkerIntel() {
	const target = document.getElementById('gmPlayerSelect')?.value;
	if (!target) return;
	try { await connection.invoke('GrantNextPrivateBunkerIntel', target, crypto.randomUUID()); }
	catch (error) { console.error('Private bunker intel grant failed', error); }
}

async function gmSkipScenarioChoice() {
	const choiceId = currentPendingScenarioChoice?.choiceId || currentPendingScenarioChoice?.ChoiceId;
	if (!choiceId) return;
	try { await connection.invoke('SkipPendingScenarioChoice', choiceId, crypto.randomUUID()); }
	catch (error) { console.error('Scenario skip failed', error); }
}

function showCurrentEvent(event) {
	currentEvent = event;

	const panel = document.getElementById('currentEventPanel');
	const content = document.getElementById('currentEventContent');
	const effectSection = document.getElementById('currentEventEffect');
	const effectText = document.getElementById('currentEventEffectText');
	const timeEl = document.getElementById('currentEventTime');
	const hostControls = document.getElementById('eventHostControls');

	if (!panel || !content) return;

	content.innerHTML = `
            <h3 style="margin-bottom: 0.5rem; color: var(--color-gold);">${event.name || event.Name || 'Подія'}</h3>
            <p>${event.description || event.Description || ''}</p>
        `;

	if (event.effect || event.Effect) {
		const effect = event.effect || event.Effect;
		effectSection.style.display = 'block';
		effectText.textContent = formatEventEffect(effect);
	} else {
		effectSection.style.display = 'none';
	}

	timeEl.textContent = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

	// Показуємо кнопки керування тільки для ведучого
	hostControls.style.display = isHost ? 'flex' : 'none';

	panel.style.display = 'block';
}

function formatEventEffect(effect) {
	if (typeof effect === 'string') return effect;

	// Якщо це об'єкт з полями
	if (effect.type && effect.value) {
		const effectTypes = {
			'addFood': `Додати ${effect.value} місяців їжі`,
			'removeFood': `Забрати ${effect.value} місяців їжі`,
			'addSpace': `Додати ${effect.value} місць`,
			'removeSpace': `Забрати ${effect.value} місць`,
			'addTime': `Додати ${effect.value} місяців часу`,
			'removeTime': `Забрати ${effect.value} місяців часу`,
			'custom': effect.description || effect.value
		};
		return effectTypes[effect.type] || JSON.stringify(effect);
	}

	return JSON.stringify(effect);
}

function applyCurrentEventEffect() {
	if (!currentEvent || !isHost) return;

	if (confirm('Застосувати ефект події?')) {
		connection.invoke("ApplyEventEffect", currentEvent.id || currentEvent.Id)
			.then(() => {
				addEventMessage(`<span class="event-special">Ведучий застосував ефект події: ${currentEvent.name || currentEvent.Name}</span>`);
				dismissCurrentEvent();
			})
			.catch(err => {
				console.error("ApplyEventEffect error:", err);
				alert("Помилка застосування ефекту: " + err.message);
			});
	}
}

function dismissCurrentEvent() {
	if (!currentEvent) return;

	// Додаємо в історію
	eventsHistory.unshift({
		...currentEvent,
		dismissedAt: new Date()
	});

	currentEvent = null;
	document.getElementById('currentEventPanel').style.display = 'none';
}

function addEventToHistory(event, type = 'game') {
	const eventsContainer = document.getElementById('events');
	if (!eventsContainer) return;

	// Прибираємо placeholder якщо є
	const placeholder = eventsContainer.querySelector('p');
	if (placeholder) placeholder.remove();

	const time = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

	const eventItem = document.createElement('div');
	eventItem.className = `event-item event-type-${type}`;
	eventItem.innerHTML = `
            <span class="event-time">${time}</span>
            <span class="event-text">${event}</span>
        `;

	eventsContainer.insertBefore(eventItem, eventsContainer.firstChild);

	// Обмежуємо кількість подій у списку
	while (eventsContainer.children.length > 50) {
		eventsContainer.removeChild(eventsContainer.lastChild);
	}
}
