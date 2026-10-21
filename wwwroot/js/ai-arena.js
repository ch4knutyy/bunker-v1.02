(() => {
    const state = { arena: null, selected: null, connection: null, configuration: null };
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

    function renderConfiguration(configuration) {
        if (!configuration) return;
        state.configuration = configuration;
        byId('arenaProvider').value = configuration.provider || 'Deterministic';
        byId('arenaGenerationMode').value = configuration.generationMode || 'Direct';
        byId('arenaModel').textContent = configuration.model || 'не задано';
        const local = configuration.localStatus || {};
        byId('arenaProviderStatus').textContent = local.errorCode ? `${local.status || 'unavailable'}: ${local.errorCode}` : (local.status || (configuration.useLiveProvider ? 'configured' : 'disabled'));
    }

    function renderSummary(view) {
        const active = view.agents.filter(agent => !agent.isEliminated).length;
        const eliminated = view.agents.length - active;
        byId('arenaSummary').innerHTML = [
            ['Статус', view.status], ['Раунд', view.currentRound], ['Крок', view.step], ['Активні', active], ['Виключені', eliminated],
            ['Голосування', view.voteCount], ['Провайдер', view.provider], ['Модель', view.model || '—'], ['Режим', view.generationMode]
        ].map(([label, value]) => `<div><span>${safe(label)}</span><strong>${safe(value)}</strong></div>`).join('');
        byId('arenaPlayerCount').textContent = `${active} активних`;
        status(view.lastIntervention ? `${view.status} · ${view.lastIntervention}` : `${view.status} · крок ${view.step} · активних AI: ${active}`);
    }

    function scenarioList(values, empty) {
        return values?.length ? `<ul>${values.map(value => `<li>${safe(value)}</li>`).join('')}</ul>` : `<p class="empty-state">${safe(empty)}</p>`;
    }

    function renderScenario(scenario) {
        const target = byId('arenaScenario');
        if (!scenario?.apocalypse && !scenario?.bunker) {
            target.innerHTML = '<p class="empty-state">Канонічний сценарій ще не завантажено.</p>';
            return;
        }
        const apocalypse = scenario.apocalypse;
        const bunker = scenario.bunker;
        const currentThreats = scenario.currentThreats || [];
        const previousThreats = scenario.previousThreats || [];
        target.innerHTML = `<div class="panel-heading"><div><span>Світ гри</span><h2>Апокаліпсис, бункер і загрози</h2></div></div>
            <div class="arena-scenario-grid">
                <article><h3>Апокаліпсис</h3>${apocalypse ? `<strong>${safe(apocalypse.name)}</strong><p>${safe(apocalypse.description)}</p><dl><dt>Небезпека</dt><dd>${safe(apocalypse.severity)}</dd><dt>Шанс виживання</dt><dd>${safe(apocalypse.survivalChance)}%</dd><dt>Тривалість</dt><dd>${safe(apocalypse.duration)}</dd></dl><h4>Умови виживання</h4>${scenarioList(apocalypse.requirements, 'Не вказано.')}` : '<p class="empty-state">Немає даних.</p>'}</article>
                <article><h3>Бункер</h3>${bunker ? `<strong>${safe(bunker.name)}</strong><p>${safe(bunker.description)}</p><dl><dt>Місткість</dt><dd>${safe(bunker.capacity)}</dd><dt>Локація</dt><dd>${safe(bunker.location)}</dd><dt>Запаси</dt><dd>${safe(bunker.suppliesMonths)} міс. / вода ${safe(bunker.waterMonths)} міс.</dd><dt>Стан</dt><dd>${safe(bunker.condition)}</dd></dl><h4>Приміщення</h4>${scenarioList(bunker.facilities, 'Не вказано.')}<h4>Ресурси</h4>${scenarioList(bunker.resources, 'Не вказано.')}<h4>Проблеми</h4>${scenarioList(bunker.problems, 'Не вказано.')}` : '<p class="empty-state">Немає даних.</p>'}</article>
                <article><h3>Поточні загрози</h3>${currentThreats.length ? currentThreats.map(threat => `<div class="arena-threat"><strong>${safe(threat.name)}</strong><span>${safe(threat.severity)}</span><p>${safe(threat.description)}</p><h4>Вимоги</h4>${scenarioList(threat.requirements, 'Не вказано.')}<h4>Ризики</h4>${scenarioList(threat.risks, 'Не вказано.')}<h4>Наслідки</h4>${scenarioList(threat.consequences, 'Не вказано.')}</div>`).join('') : '<p class="empty-state">Ще не активовано за канонічним розкладом.</p>'}${previousThreats.length ? `<details><summary>Попередні загрози (${safe(previousThreats.length)})</summary>${previousThreats.map(threat => `<p><strong>${safe(threat.name)}</strong> · ${safe(threat.description)}</p>`).join('')}</details>` : ''}</article>
            </div>`;
    }

    function renderPlayers(view) {
        byId('arenaAgents').innerHTML = view.agents.map(agent => {
            const action = agent.lastDecision || 'очікує ходу';
            return `<button class="arena-agent-card ${agent.isEliminated ? 'eliminated' : ''} ${state.selected === agent.id ? 'selected' : ''}" data-id="${safe(agent.id)}">
                <span class="agent-seat">AI ${safe(agent.seat)}</span><strong>${safe(agent.name)}</strong><span>${agent.isEliminated ? 'Виключено' : 'У грі'}</span>
                <small>Відкрито: ${safe(agent.revealedCount ?? Object.keys(agent.revealed || {}).length)} · ${safe(action)}</small>${agent.lastError ? `<em>${safe(agent.lastError)}</em>` : ''}
            </button>`;
        }).join('');
        document.querySelectorAll('.arena-agent-card').forEach(button => button.addEventListener('click', () => watch(view.id, button.dataset.id)));
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

    function renderTimeline(view) {
        const publicEvents = view.events.filter(event => !technicalTypes.has(event.type));
        const technical = view.events.filter(event => technicalTypes.has(event.type));
        byId('arenaEvents').innerHTML = publicEvents.slice().reverse().map(event => `<article><span>крок ${safe(event.step)}</span><strong>${safe(eventText(event, view.agents))}</strong></article>`).join('') || '<p class="empty-state">Подій гри ще немає.</p>';
        const technicalRoot = byId('arenaTechnicalTimeline');
        technicalRoot.querySelector('div').innerHTML = technical.slice().reverse().map(event => `<article><span>крок ${safe(event.step)}</span><strong>${safe(eventText(event, view.agents))}</strong></article>`).join('') || '<p class="empty-state">Технічних подій немає.</p>';
    }

    function characteristicCards(agent) {
        const revealed = agent.revealedCharacteristics || {};
        return Object.entries(agent.ownCharacteristics || {}).map(([key, value]) => `<article class="characteristic-card ${Object.prototype.hasOwnProperty.call(revealed, key) ? 'revealed' : 'hidden'}"><span>${safe(labels[key] || key)}</span><strong>${safe(value)}</strong><small>${Object.prototype.hasOwnProperty.call(revealed, key) ? 'Розкрито публічно' : 'Приховано від AI'}</small></article>`).join('');
    }

    function statements(items, empty) {
        return items?.length ? `<ul>${items.map(item => `<li>${safe(item.text)}</li>`).join('')}</ul>` : `<p class="empty-state">${safe(empty)}</p>`;
    }

    function renderInspector(agent) {
        const target = byId('arenaPerspective');
        if (!agent) { target.textContent = 'Оберіть AI.'; return; }
        target.innerHTML = `<div class="inspector-identity"><h3>${safe(agent.name)}</h3><p>${safe(agent.objective)}</p></div>
            <h4>Справжні характеристики</h4><div class="characteristics-grid">${characteristicCards(agent)}</div>
            <h4>Публічно відомі FACT</h4>${statements(Object.entries(agent.publicKnowledge || {}).map(([key, text]) => ({ text: `${key}: ${text}` })), 'Поки що немає.')}
            <h4>Особиста пам’ять</h4>${statements((agent.memory || []).map(text => ({ text })), 'Пам’ять ще порожня.')}
            <h4>Власні публічні CLAIM</h4>${statements(agent.publicClaims, 'Заяв ще немає.')}
            <details class="private-inspector"><summary>Приватно: навмисні BLUFF</summary>${statements(agent.explicitBluffs, 'Блефів не зафіксовано.')}</details>`;
    }

    function renderDiagnostics(view) {
        const diagnostics = view.diagnostics || [];
        byId('arenaDiagnostics').innerHTML = diagnostics.length ? diagnostics.slice().reverse().map(item => `<article class="diagnostic-entry"><strong>Крок ${safe(item.step)} · ${safe(item.agentId)}</strong><p>${safe(item.providerError || item.validationError || 'rejected')}</p>${item.providerErrorDetail ? `<small>${safe(item.providerErrorDetail)}</small>` : ''}<footer>${item.requestAttempts || 1} спроб · ${item.requestDurationMilliseconds ?? '—'} мс · ${item.inputTokens ?? '—'}/${item.outputTokens ?? '—'} токенів</footer></article>`).join('') : '<p class="empty-state">Помилок генерації ще немає.</p>';
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
        if (!state.selected && view.selectedAgent) state.selected = view.selectedAgent.id;
        renderSummary(view); renderScenario(view.scenario); renderPlayers(view); renderChat(view.messages || []); renderTimeline(view); renderInspector(view.selectedAgent); renderDiagnostics(view); renderDebug(view.selectedAgent);
        const exportLink = byId('arenaExport'); exportLink.href = view.datasetExportUrl; exportLink.hidden = false;
        controls(!['Finished', 'Cancelled', 'Faulted'].includes(view.status));
    }

    async function watch(id, selected = state.selected) { state.selected = selected; render(await state.connection.invoke('WatchArena', id, selected)); }
    async function invoke(name) { if (state.arena) render(await state.connection.invoke(name, state.arena.id)); }

    async function setup() {
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
        byId('arenaCreate').addEventListener('click', async () => render(await state.connection.invoke('CreateArena', { provider: byId('arenaProvider').value, generationMode: byId('arenaGenerationMode').value })));
        byId('arenaCheckProvider').addEventListener('click', async () => { const result = await state.connection.invoke('CheckArenaProvider'); renderConfiguration(result.configuration); if (result.status?.errorCode) status(`Провайдер недоступний: ${result.status.errorCode}`); });
        [['arenaStart', 'StartArena'], ['arenaPause', 'PauseArena'], ['arenaResume', 'ResumeArena'], ['arenaStep', 'StepArena'], ['arenaCancel', 'CancelArena']].forEach(([id, method]) => byId(id).addEventListener('click', () => invoke(method)));
        status('Готово. Створіть або відкрийте арену.');
    }
    setup().catch(error => status(`Помилка підключення: ${error.message || error}`));
})();
