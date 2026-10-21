(() => {
    const state = { arena: null, selected: null, connection: null, configuration: null, characteristics: null, drawer: null, detailId: null };
    const detailItems = new Map();
    const supportsHover = window.matchMedia?.('(hover: hover) and (pointer: fine)').matches === true;
    const byId = id => document.getElementById(id);
    const safe = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const status = text => { const target = byId('arenaStatus'); if (target) target.textContent = text; };
    const controls = enabled => ['arenaStart', 'arenaPause', 'arenaResume', 'arenaStep', 'arenaCancel'].forEach(id => { const button = byId(id); if (button) button.disabled = !enabled; });
    const labels = {
        personality: 'Особистість', body: 'Статура', profession: 'Професія', physicalHealth: 'Фізичне здоров’я',
        mentalHealth: 'Психічне здоров’я', hobby: 'Хобі', characterTrait: 'Риса характеру', phobia: 'Фобія',
        inventory: 'Інвентар', property: 'Майно', fact: 'Факт', specialCard: 'Спеціальна карта'
    };
    const technicalTypes = new Set(['provider_error', 'agent_waited', 'decision_rejected', 'arena_paused_provider_error']);
    const votingTypes = new Set(['vote_proposed', 'vote_proposal_accepted', 'vote_proposal_rejected', 'vote_opened', 'vote_cast', 'player_eliminated']);

    const short = (value, length = 88) => {
        const text = String(value ?? '').replace(/\s+/g, ' ').trim();
        return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text || '—';
    };
    const textList = (values, empty = 'Немає даних.') => values?.length
        ? `<ul>${values.map(value => `<li>${safe(value)}</li>`).join('')}</ul>`
        : `<p class="empty-state">${safe(empty)}</p>`;
    const detailValue = value => Array.isArray(value)
        ? textList(value)
        : `<p>${safe(value || '—')}</p>`;

    function registerDetail(item) {
        detailItems.set(item.id, item);
        return item;
    }

    function detailCard(item) {
        registerDetail(item);
        return `<button type="button" class="arena-detail-card ${safe(item.status || '')}" data-detail-id="${safe(item.id)}" aria-label="Відкрити деталі: ${safe(item.title)}">
            <span class="detail-category">${safe(item.category)}</span><strong>${safe(item.title)}</strong><small>${safe(item.summary)}</small><em>${safe(item.statusLabel || '')}</em>
        </button>`;
    }

    function renderConfiguration(configuration) {
        if (!configuration) return;
        state.configuration = configuration;
        byId('arenaProvider').value = configuration.provider || 'Deterministic';
        byId('arenaGenerationMode').value = configuration.generationMode || 'Direct';
		byId('arenaSpeedPreset').value = configuration.speedPreset || 'Balanced';
		byId('arenaAgentCount').value = configuration.agentCount || 6;
		if (!state.characteristics) state.characteristics = new Set(configuration.defaultEnabledCharacteristics || configuration.characteristicCategories || []);
		renderCharacteristicOptions(configuration.characteristicCategories || []);
        byId('arenaModel').textContent = configuration.model || 'не задано';
        const local = configuration.localStatus || {};
        byId('arenaProviderStatus').textContent = local.errorCode ? `${local.status || 'unavailable'}: ${local.errorCode}` : (local.status || (configuration.useLiveProvider ? 'configured' : 'disabled'));
    }

	function renderCharacteristicOptions(categories) {
		const target = byId('arenaCharacteristicOptions');
		if (!target) return;
		target.innerHTML = categories.map(key => `<label><input type="checkbox" value="${safe(key)}" ${state.characteristics?.has(key) ? 'checked' : ''} /> ${safe(labels[key] || key)}</label>`).join('');
		target.querySelectorAll('input').forEach(input => input.addEventListener('change', () => {
			if (input.checked) state.characteristics.add(input.value); else state.characteristics.delete(input.value);
		}));
	}

    function renderSummary(view) {
        const active = view.agents.filter(agent => !agent.isEliminated).length;
        const eliminated = view.agents.length - active;
        byId('arenaSummary').innerHTML = [
            ['Статус', view.status], ['Раунд', view.currentRound], ['Крок', view.step], ['Активні', active], ['Виключені', eliminated],
			['Голосування', view.voteCount], ['Провайдер', view.provider], ['Модель', view.model || '—'], ['Режим', view.generationMode], ['Швидкість', view.speedPreset || 'Balanced'], ['Поточний AI', view.currentAgentName || '—'], ['Генерація', view.isGenerating ? 'триває' : 'очікування']
        ].map(([label, value]) => `<div><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`).join('');
        byId('arenaPlayerCount').textContent = `${active} активних`;
		byId('arenaPlayersTitle').textContent = `${view.agents.length} AI-гравців`;
        status(view.lastIntervention ? `${view.status} · ${view.lastIntervention}` : `${view.status} · крок ${view.step} · активних AI: ${active}`);
    }

    function scenarioCard(id, category, title, description, fields, statusLabel = 'Публічно відомо') {
        return detailCard({ id, category, title, summary: short(description), status: 'public', statusLabel, tooltip: description, details: fields });
    }

    function renderScenario(scenario) {
        const target = byId('arenaScenario');
        if (!scenario?.apocalypse && !scenario?.bunker) {
            target.innerHTML = '<p class="empty-state">Канонічний сценарій ще не завантажено.</p>';
            return;
        }
        const apocalypse = scenario.apocalypse;
        const bunker = scenario.bunker;
        const threats = [...(scenario.currentThreats || []), ...(scenario.previousThreats || [])];
        const cards = [];
        if (apocalypse) cards.push(scenarioCard('scenario:apocalypse', 'Апокаліпсис', apocalypse.name, apocalypse.description, [
            ['Опис', apocalypse.description], ['Небезпека', apocalypse.severity], ['Шанс виживання', `${apocalypse.survivalChance}%`], ['Тривалість', apocalypse.duration],
            ['Зовнішні загрози', apocalypse.threats || []], ['Умови виживання', apocalypse.requirements || []], ['Теги', apocalypse.tags || []]
        ]));
        if (bunker) cards.push(scenarioCard('scenario:bunker', 'Бункер', bunker.name, bunker.description, [
            ['Опис', bunker.description], ['Місткість', bunker.capacity], ['Локація', bunker.location], ['Запаси', `${bunker.suppliesMonths} міс.`], ['Вода', `${bunker.waterMonths} міс.`], ['Стан', bunker.condition],
            ['Приміщення', bunker.facilities || []], ['Ресурси', bunker.resources || []], ['Проблеми', bunker.problems || []], ['Теги', bunker.bunkerTags || []]
        ]));
        threats.forEach(threat => cards.push(scenarioCard(`threat:${threat.id}:${threat.activatedAtRound ?? 'current'}`, threat.isActive ? 'Активна загроза' : 'Попередня загроза', threat.name, threat.description, [
            ['Опис', threat.description], ['Серйозність', threat.severity], ['Категорія', threat.category], ['Вимоги', threat.requirements || []], ['Ризики', threat.risks || []], ['Наслідки', threat.consequences || []], ['Активовано', threat.activatedAtRound ? `раунд ${threat.activatedAtRound}` : '—']
        ], threat.isActive ? 'Активна' : 'Минувша')));
        target.innerHTML = `<div class="panel-heading"><div><span>Світ гри</span><h2>Сценарій виживання</h2></div><small>Натисніть картку для деталей</small></div><div class="arena-scenario-cards">${cards.join('')}</div>`;
    }

    function renderPlayers(view) {
        byId('arenaAgents').innerHTML = view.agents.map(agent => {
            const action = agent.lastDecision || 'очікує ходу';
            return `<button class="arena-agent-card ${agent.isEliminated ? 'eliminated' : ''} ${state.selected === agent.id ? 'selected' : ''}" data-id="${safe(agent.id)}">
                <span class="agent-seat">AI ${safe(agent.seat)}</span><strong>${safe(agent.name)}</strong><span>${agent.isEliminated ? 'Виключено' : 'У грі'}</span>
                <small>${safe(agent.revealedCount ?? Object.keys(agent.revealed || {}).length)} відкрито · ${safe(action)}</small>${agent.lastError ? `<em>${safe(agent.lastError)}</em>` : ''}
            </button>`;
        }).join('');
        document.querySelectorAll('.arena-agent-card').forEach(button => button.addEventListener('click', async () => {
            state.selected = button.dataset.id;
            await watch(view.id, state.selected);
            openInspector();
        }));
    }

    function renderChat(messages) {
        const chat = byId('arenaChat');
        const closeToBottom = chat.scrollHeight - chat.scrollTop - chat.clientHeight < 48;
        chat.innerHTML = messages.map(message => `<article><header><strong>${safe(message.agentName)}</strong><span>крок ${safe(message.step)}</span></header><p>${safe(message.text)}</p></article>`).join('') || '<p class="empty-state">Публічних реплік ще немає.</p>';
        if (closeToBottom) chat.scrollTop = chat.scrollHeight;
    }

    function eventText(event, agents) {
        const name = agents.find(agent => agent.id === event.agentId)?.name || 'Система';
        const types = {
            arena_created: 'Створено арену', arena_started: 'Симуляцію запущено', arena_paused: 'Симуляцію призупинено', arena_resumed: 'Симуляцію продовжено',
            characteristic_revealed: 'Розкрито характеристику', threat_activated: 'Активовано загрозу', vote_proposed: 'Запропоновано голосування', vote_proposal_accepted: 'Підтримано голосування', vote_proposal_rejected: 'Відхилено голосування', vote_opened: 'Голосування відкрито', vote_cast: 'Подано голос', player_eliminated: 'Учасника виключено', public_claim: 'Публічна заява', message: 'Репліка'
        };
        return `${types[event.type] || event.type} · ${name}`;
    }

    function eventRows(events, agents, empty) {
        return events.length ? events.slice().reverse().map(event => `<article><span>крок ${safe(event.step)}</span><strong>${safe(eventText(event, agents))}</strong></article>`).join('') : `<p class="empty-state">${safe(empty)}</p>`;
    }

    function renderTimeline(view) {
        const voting = view.events.filter(event => votingTypes.has(event.type));
        const technical = view.events.filter(event => technicalTypes.has(event.type));
        const publicEvents = view.events.filter(event => !technicalTypes.has(event.type) && !votingTypes.has(event.type));
        byId('arenaEvents').innerHTML = eventRows(publicEvents, view.agents, 'Подій гри ще немає.');
        byId('arenaVotingEvents').innerHTML = eventRows(voting, view.agents, 'Голосувань ще не було.');
        byId('arenaTechnicalEvents').innerHTML = eventRows(technical, view.agents, 'Технічних подій немає.');
    }

    function characteristicItems(agent) {
        const revealed = agent?.revealedCharacteristics || {};
        return Object.entries(agent?.ownCharacteristics || {}).map(([key, value]) => ({
            id: `characteristic:${agent.id}:${key}`,
            category: labels[key] || key,
            title: short(value, 58),
            summary: Object.prototype.hasOwnProperty.call(revealed, key) ? 'Розкрито публічно' : 'Приховано від інших AI',
            status: Object.prototype.hasOwnProperty.call(revealed, key) ? 'revealed' : 'hidden',
            statusLabel: Object.prototype.hasOwnProperty.call(revealed, key) ? 'Розкрито' : 'Приховано',
            tooltip: value,
            details: [['Повне значення', value], ['Статус розкриття', Object.prototype.hasOwnProperty.call(revealed, key) ? 'Публічно розкрито.' : 'Відомо лише власнику та Developer Spectator.']]
        }));
    }

    function characteristicCards(agent) {
        return characteristicItems(agent).map(detailCard).join('');
    }

    function statements(items, empty) {
        return items?.length ? `<ul>${items.map(item => `<li>${safe(item.text ?? item)}</li>`).join('')}</ul>` : `<p class="empty-state">${safe(empty)}</p>`;
    }

    function renderInspectorContent(agent) {
        if (!agent) return '<p class="empty-state">Оберіть AI.</p>';
        return `<div class="inspector-identity"><h3>${safe(agent.name)}</h3><p>${safe(agent.objective)}</p></div>
            <h4>Характеристики</h4><p class="drawer-hint">Наведіть курсор або натисніть картку для повного значення.</p><div class="characteristics-grid">${characteristicCards(agent)}</div>
            <details><summary>Публічно відомі FACT</summary>${statements(Object.entries(agent.publicKnowledge || {}).map(([key, text]) => `${key}: ${text}`), 'Поки що немає.')}</details>
            <details><summary>Особиста пам’ять</summary>${statements(agent.memory || [], 'Пам’ять ще порожня.')}</details>
            <details><summary>Власні публічні CLAIM</summary>${statements(agent.publicClaims, 'Заяв ще немає.')}</details>
            <details class="private-inspector"><summary>Приватно: навмисні BLUFF</summary>${statements(agent.explicitBluffs, 'Блефів не зафіксовано.')}</details>`;
    }

    function renderDrawer(agent) {
        const drawer = byId('arenaDetailDrawer');
        const backdrop = byId('arenaDetailBackdrop');
        if (!state.drawer) {
            drawer.hidden = true; drawer.setAttribute('aria-hidden', 'true'); backdrop.hidden = true;
            return;
        }
        drawer.hidden = false; drawer.setAttribute('aria-hidden', 'false'); backdrop.hidden = false;
        const title = byId('arenaDrawerTitle');
        const meta = byId('arenaDrawerMeta');
        const content = byId('arenaDrawerContent');
        if (state.drawer === 'detail' && detailItems.has(state.detailId)) {
            const item = detailItems.get(state.detailId);
            title.textContent = item.title;
            meta.textContent = item.category;
            content.innerHTML = `<button id="arenaDrawerBack" type="button" class="drawer-back">← До інспектора</button><p class="detail-status ${safe(item.status || '')}">${safe(item.statusLabel || '')}</p>${item.details.map(([label, value]) => `<section class="drawer-detail"><h3>${safe(label)}</h3>${detailValue(value)}</section>`).join('')}`;
            byId('arenaDrawerBack').addEventListener('click', openInspector);
        } else {
            state.drawer = 'inspector'; state.detailId = null;
            title.textContent = agent?.name || 'Інспектор персонажа';
            meta.textContent = 'Developer Spectator';
            content.innerHTML = renderInspectorContent(agent);
        }
        bindDetailCards(content);
    }

    function openInspector() {
        state.drawer = 'inspector'; state.detailId = null;
        renderDrawer(state.arena?.selectedAgent);
    }

    function closeDrawer() {
        state.drawer = null; state.detailId = null;
        renderDrawer(null);
    }

    function showTooltip(card) {
        if (!supportsHover) return;
        const item = detailItems.get(card.dataset.detailId);
        if (!item) return;
        const tooltip = byId('arenaTooltip');
        tooltip.textContent = short(item.tooltip || item.summary, 420);
        tooltip.hidden = false;
        const rect = card.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const left = Math.min(Math.max(12, rect.left), Math.max(12, window.innerWidth - tooltipRect.width - 12));
        const below = rect.bottom + 10;
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${below + tooltipRect.height <= window.innerHeight - 12 ? below : Math.max(12, rect.top - tooltipRect.height - 10)}px`;
    }

    function hideTooltip() { const tooltip = byId('arenaTooltip'); if (tooltip) tooltip.hidden = true; }

    function bindDetailCards(root = document) {
        root.querySelectorAll('.arena-detail-card').forEach(card => {
            if (supportsHover) {
                card.addEventListener('mouseenter', () => showTooltip(card));
                card.addEventListener('mouseleave', hideTooltip);
                card.addEventListener('focus', () => showTooltip(card));
                card.addEventListener('blur', hideTooltip);
            }
            card.addEventListener('click', () => { hideTooltip(); state.drawer = 'detail'; state.detailId = card.dataset.detailId; renderDrawer(state.arena?.selectedAgent); });
        });
    }

    function renderDiagnostics(view) {
        const diagnostics = view.diagnostics || [];
        const aggregate = view.performance || {};
        const aggregateLine = `<p class="diagnostic-summary">середній хід ${aggregate.averageStepMilliseconds ?? '—'} мс · план ${aggregate.averagePlanMilliseconds ?? '—'} мс · публічна генерація ${aggregate.averagePublicGenerationMilliseconds ?? '—'} мс<br>LLM ${aggregate.modelRequests ?? 0} · input ${aggregate.promptTokens ?? 0} · output ${aggregate.completionTokens ?? 0} · retry ${aggregate.retries ?? 0} · JSON ${aggregate.jsonErrors ?? 0} · успішно ${aggregate.successfulActions ?? 0} · fallback Wait ${aggregate.fallbackWaits ?? 0} · оновлення плану ${aggregate.strategyRefreshes ?? 0}</p>`;
        byId('arenaDiagnostics').innerHTML = aggregateLine + (diagnostics.length ? diagnostics.slice().reverse().map(item => {
            const outcome = item.providerError || item.validationError || (item.accepted ? 'прийнято' : 'відхилено');
            const timing = `побудова промпту ${item.promptBuildMilliseconds ?? '—'} мс · генерація ${item.generationMilliseconds ?? item.requestDurationMilliseconds ?? '—'} мс · хід ${item.stepDurationMilliseconds ?? '—'} мс`;
            const prompt = `промпт ${item.promptCharacters ?? '—'} симв. / ≈${item.estimatedPromptTokens ?? '—'} токенів`;
            return `<article class="diagnostic-entry"><strong>Крок ${safe(item.step)} · ${safe(item.agentId)}</strong><p>${safe(outcome)}</p>${item.providerErrorDetail ? `<small>${safe(item.providerErrorDetail)}</small>` : ''}<footer>${timing}<br>${prompt} · ${item.requestAttempts || 1} спроб · ${item.inputTokens ?? '—'}/${item.outputTokens ?? '—'} токенів</footer></article>`;
        }).join('') : '<p class="empty-state">Кроків генерації ще немає.</p>');
    }

    function renderDebug(agent) {
        const target = byId('arenaDebug');
        if (!agent) { target.textContent = 'Оберіть AI, щоб побачити останнє рішення.'; return; }
        const decision = agent.lastDecisionMetadata || {};
        target.innerHTML = `<p><b>Остання дія:</b> ${safe(agent.lastDecision || '—')}</p><p><b>Стратегія:</b> ${safe(agent.lastStrategy || '—')}</p><p><b>Помилка:</b> ${safe(agent.lastError || '—')}</p><p><b>Приватний план:</b> ${safe(decision.privateStrategicPlan || '—')}</p><p><b>Відповідь:</b> ${safe(decision.message || '—')}</p>`;
    }

    function render(view) {
        if (!view) return;
        state.arena = view;
        if (!view.agents.some(agent => agent.id === state.selected)) state.selected = view.selectedAgent?.id || null;
        detailItems.clear();
        characteristicItems(view.selectedAgent).forEach(registerDetail);
        renderSummary(view); renderScenario(view.scenario); renderPlayers(view); renderChat(view.messages || []); renderTimeline(view); renderDiagnostics(view); renderDebug(view.selectedAgent); renderDrawer(view.selectedAgent); bindDetailCards(byId('arenaScenario'));
        const exportLink = byId('arenaExport'); exportLink.href = view.datasetExportUrl; exportLink.hidden = false;
		for (const [id, type] of [['arenaRawExport', 'raw'], ['arenaSftExport', 'sft'], ['arenaCuratedExport', 'curated']]) {
			const link = byId(id); link.href = `/ai-arena/export-${type}?sessionId=${encodeURIComponent(view.id)}`; link.hidden = false;
		}
		if (!view.isGenerating) refreshDatasetStats(view.id);
        controls(!['Finished', 'Cancelled', 'Faulted'].includes(view.status));
    }
	function renderDatasetLabels() {
		byId('arenaDatasetSection').setAttribute('aria-label', t('arenaDatasetSection'));
		byId('arenaDatasetStats').textContent = t('arenaDatasetSelect');
		byId('arenaRawExport').textContent = t('arenaRawExport');
		byId('arenaSftExport').textContent = t('arenaSftExport');
		byId('arenaCuratedExport').textContent = t('arenaCuratedExport');
		byId('arenaEditorStats').textContent = t('arenaEditorSelect');
	}
	async function refreshDatasetStats(id) {
		try {
			const response = await fetch(`/ai-arena/dataset-stats/${encodeURIComponent(id)}`);
			if (!response.ok) return;
			const data = await response.json();
			if (state.arena?.id === id) byId('arenaDatasetStats').textContent = `${t('arenaDatasetSessions')} ${data.sessions} · ${t('arenaDatasetDecisions')} ${data.decisions} · ${t('arenaDatasetEligible')} ${data.eligible} · ${t('arenaDatasetExcluded')} ${data.excluded} · ${t('arenaDatasetStopped')} ${data.stopped} · ${t('arenaDatasetErrors')} ${data.errors} · ≈${Math.ceil((data.approximateStoreBytes || 0) / 1024)} ${t('arenaDatasetKiB')}`;
		} catch { /* Diagnostics must not interrupt the arena controls. */ }
		refreshEditorStats(id);
	}
	async function refreshEditorStats(id) {
		try {
			const response = await fetch(`/ai-arena/editor-stats/${encodeURIComponent(id)}`);
			if (!response.ok) return;
			const data = await response.json();
			if (state.arena?.id === id) byId('arenaEditorStats').textContent = `${t('arenaEditor')}: ${data.enabled ? t('arenaEditorOn') : t('arenaEditorOff')} · ${t('arenaEditorPending')} ${data.stats.pending} · ${t('arenaEditorCompleted')} ${data.stats.completed} · ${t('arenaEditorSkipped')} ${data.stats.skipped} · ${t('arenaEditorRejected')} ${data.stats.rejected} · ${t('arenaEditorFailed')} ${data.stats.failed} · ${t('arenaEditorImprovements')} ${data.stats.improvements} · ${t('arenaEditorTokens')} ${data.stats.inputTokens}/${data.stats.outputTokens}`;
		} catch { /* Editor diagnostics must not interrupt the arena. */ }
	}

    async function watch(id, selected = state.selected) { state.selected = selected; render(await state.connection.invoke('WatchArena', id, selected)); }
    async function invoke(name) { if (state.arena) render(await state.connection.invoke(name, state.arena.id)); }

    async function setup() {
		renderDatasetLabels();
		setInterval(() => { if (state.arena?.id) refreshEditorStats(state.arena.id); }, 10000);
        state.connection = new signalR.HubConnectionBuilder().withUrl('/aiArenaHub').withAutomaticReconnect().build();
        state.connection.on('AiArenaStateUpdated', view => { if (state.arena?.id === view.id) watch(view.id, state.selected); });
        state.connection.onreconnected(() => state.arena && watch(state.arena.id, state.selected));
        await state.connection.start();
        const sessions = await state.connection.invoke('ListArenas');
        byId('arenaSessions').innerHTML = sessions.map(session => `<button class="arena-session" data-id="${safe(session.id)}">${safe(session.id.slice(0, 8))} · ${safe(session.status)}</button>`).join('') || '<p class="empty-state">Сесій ще немає.</p>';
        document.querySelectorAll('.arena-session').forEach(button => button.addEventListener('click', () => watch(button.dataset.id)));
        const initialArenaId = byId('aiArena')?.dataset.initialArenaId;
        if (initialArenaId) { try { await watch(initialArenaId); } catch (error) { status(`Не вдалося відкрити AI арену: ${error.message || error}`); } }
        renderConfiguration(await state.connection.invoke('GetArenaConfiguration'));
		byId('arenaCreate').addEventListener('click', async () => {
			const enabledCharacteristics = [...(state.characteristics || [])];
			if (!enabledCharacteristics.length) { status('Оберіть хоча б одну характеристику.'); return; }
			render(await state.connection.invoke('CreateArena', { provider: byId('arenaProvider').value, generationMode: byId('arenaGenerationMode').value, speedPreset: byId('arenaSpeedPreset').value, agentCount: Number(byId('arenaAgentCount').value), enabledCharacteristics }));
		});
		byId('arenaCharacteristicsAll').addEventListener('click', () => { state.characteristics = new Set(state.configuration?.characteristicCategories || []); renderCharacteristicOptions(state.configuration?.characteristicCategories || []); });
		byId('arenaCharacteristicsNone').addEventListener('click', () => { state.characteristics = new Set(); renderCharacteristicOptions(state.configuration?.characteristicCategories || []); });
		byId('arenaCharacteristicsDefault').addEventListener('click', () => { state.characteristics = new Set(state.configuration?.defaultEnabledCharacteristics || []); renderCharacteristicOptions(state.configuration?.characteristicCategories || []); });
        byId('arenaCheckProvider').addEventListener('click', async () => { const result = await state.connection.invoke('CheckArenaProvider'); renderConfiguration(result.configuration); if (result.status?.errorCode) status(`Провайдер недоступний: ${result.status.errorCode}`); });
        [['arenaStart', 'StartArena'], ['arenaPause', 'PauseArena'], ['arenaResume', 'ResumeArena'], ['arenaStep', 'StepArena'], ['arenaCancel', 'CancelArena']].forEach(([id, method]) => byId(id).addEventListener('click', () => invoke(method)));
        byId('arenaDrawerClose').addEventListener('click', closeDrawer);
        byId('arenaDetailBackdrop').addEventListener('click', closeDrawer);
        document.addEventListener('keydown', event => { if (event.key === 'Escape') closeDrawer(); });
        status('Готово. Створіть або відкрийте арену.');
    }
    setup().catch(error => status(`Помилка підключення: ${error.message || error}`));
})();
