(() => {
    const state = { arena: null, selected: null, connection: null, configuration: null };
    const byId = id => document.getElementById(id);
    const setStatus = text => { byId('arenaStatus').textContent = text; };
    const safe = value => String(value ?? '').replace(/[&<>"']/g, item => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[item]);
    const controls = enabled => ['arenaStart', 'arenaPause', 'arenaResume', 'arenaStep', 'arenaCancel'].forEach(id => byId(id).disabled = !enabled);
    function renderConfiguration(configuration) {
        if (!configuration) return;
        state.configuration = configuration;
        byId('arenaProvider').value = configuration.provider || 'Deterministic';
        byId('arenaGenerationMode').value = configuration.generationMode || 'Direct';
        byId('arenaModel').textContent = configuration.model || 'не задано';
        const local = configuration.localStatus || {};
        const status = local.errorCode ? `${local.status || 'unavailable'}: ${local.errorCode}` : (local.status || (configuration.useLiveProvider ? 'configured' : 'disabled'));
        byId('arenaProviderStatus').textContent = status;
    }
    function render(view) {
        if (!view) return; state.arena = view; const active = view.agents.filter(agent => !agent.isEliminated).length;
        setStatus(`${view.status} · крок ${view.step} · активних AI: ${active} · голосувань: ${view.voteCount}`);
        byId('arenaAgents').innerHTML = view.agents.map(agent => `<button class="arena-agent ${agent.isEliminated ? 'eliminated' : ''}" data-id="${safe(agent.id)}">${safe(agent.name)} <small>${agent.isEliminated ? 'виключено' : Object.keys(agent.revealed).length + '/3 відкрито'}</small></button>`).join('');
        byId('arenaChat').innerHTML = view.messages.map(message => `<article><strong>${safe(message.agentName)}</strong><p>${safe(message.text)}</p></article>`).join('') || '<p>Повідомлень ще немає.</p>';
        byId('arenaEvents').innerHTML = view.events.slice().reverse().map(event => `<p><b>${safe(event.type)}</b> · крок ${event.step}</p>`).join('');
        const agent = view.selectedAgent; if (agent?.lastError) setStatus(`${view.status} · помилка AI: ${agent.lastError}`); byId('arenaPerspective').innerHTML = agent ? `<h3>${safe(agent.name)}</h3><p><b>Ціль:</b> ${safe(agent.objective)}</p><h4>Власні характеристики</h4><pre>${safe(JSON.stringify(agent.ownCharacteristics, null, 2))}</pre><h4>Публічно відомо</h4><pre>${safe(JSON.stringify(agent.publicKnowledge, null, 2))}</pre><h4>Пам'ять</h4><ul>${agent.memory.map(item => `<li>${safe(item)}</li>`).join('')}</ul>` : 'Оберіть AI.';
        byId('arenaDebug').innerHTML = agent ? `<p><b>Стратегія:</b> ${safe(agent.lastStrategy || '—')}</p><p><b>Рішення:</b> ${safe(agent.lastDecision || '—')}</p><p><b>Помилка:</b> ${safe(agent.lastError || '—')}</p><pre>${safe(JSON.stringify(agent.lastDecisionMetadata || agent.lastDecision, null, 2))}</pre>` : '';
        const exportLink = byId('arenaExport'); exportLink.href = view.datasetExportUrl; exportLink.hidden = false; controls(['Finished', 'Cancelled', 'Faulted'].includes(view.status) ? false : true);
        document.querySelectorAll('.arena-agent').forEach(button => button.addEventListener('click', () => watch(view.id, button.dataset.id)));
    }
    async function watch(id, selected = state.selected) { state.selected = selected; render(await state.connection.invoke('WatchArena', id, selected)); }
    async function invoke(name) { if (!state.arena) return; render(await state.connection.invoke(name, state.arena.id)); }
    async function setup() {
        state.connection = new signalR.HubConnectionBuilder().withUrl('/aiArenaHub').withAutomaticReconnect().build();
        state.connection.on('AiArenaStateUpdated', view => { if (state.arena?.id === view.id) watch(view.id, state.selected); });
        state.connection.onreconnected(() => state.arena && watch(state.arena.id, state.selected));
        await state.connection.start(); setStatus('Готово. Створіть окрему арену з 6 AI.');
        const sessions = await state.connection.invoke('ListArenas'); byId('arenaSessions').innerHTML = sessions.map(session => `<button class="arena-session" data-id="${safe(session.id)}">${safe(session.id.slice(0, 8))} · ${safe(session.status)}</button>`).join(''); document.querySelectorAll('.arena-session').forEach(button => button.addEventListener('click', () => watch(button.dataset.id)));
        renderConfiguration(await state.connection.invoke('GetArenaConfiguration'));
        byId('arenaCreate').addEventListener('click', async () => render(await state.connection.invoke('CreateArena', {
            provider: byId('arenaProvider').value,
            generationMode: byId('arenaGenerationMode').value
        })));
        byId('arenaCheckProvider').addEventListener('click', async () => {
            const result = await state.connection.invoke('CheckArenaProvider');
            renderConfiguration(result.configuration);
            if (result.status?.errorCode) setStatus(`Провайдер недоступний: ${result.status.errorCode}`);
        });
        [['arenaStart', 'StartArena'], ['arenaPause', 'PauseArena'], ['arenaResume', 'ResumeArena'], ['arenaStep', 'StepArena'], ['arenaCancel', 'CancelArena']].forEach(([id, method]) => byId(id).addEventListener('click', () => invoke(method)));
    }
    setup().catch(error => setStatus(`Помилка підключення: ${error.message || error}`));
})();
