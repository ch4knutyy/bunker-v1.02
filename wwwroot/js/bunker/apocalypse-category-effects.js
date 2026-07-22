(function (global) {
    'use strict';

    let lobbyIndex = null;
    let lobbyIndexPromise = null;
    let lobbyObserver = null;
    let groupingLobby = false;

    function language() {
        const value = typeof global.getCurrentLanguage === 'function'
            ? global.getCurrentLanguage()
            : document.documentElement.lang;
        return ['uk', 'en', 'ru'].includes(value) ? value : 'uk';
    }

    async function loadLobbyIndex() {
        if (lobbyIndex) return lobbyIndex;
        lobbyIndexPromise ||= fetch('/data/Apocalypses/apocalypse-category-index.json', { cache: 'force-cache' })
            .then(response => {
                if (!response.ok) throw new Error(`category index ${response.status}`);
                return response.json();
            })
            .then(value => (lobbyIndex = value))
            .catch(error => {
                console.warn('[ApocalypseCategoryEffects] Lobby category index unavailable.', error);
                return null;
            });
        return lobbyIndexPromise;
    }

    function optionId(option) {
        const direct = option.dataset.apocalypseId || option.dataset.id || option.getAttribute('data-value') || option.value;
        if (direct) return direct;
        const nested = option.querySelector('[data-apocalypse-id], input[value], button[value]');
        if (nested) return nested.dataset.apocalypseId || nested.value || '';
        const onclick = option.getAttribute('onclick') || '';
        return onclick.match(/["']([a-z0-9_:-]+)["']/i)?.[1] || '';
    }

    async function groupLobbyResults() {
        if (groupingLobby) return;
        const root = document.getElementById('lobbyApocalypseResults');
        if (!root || root.dataset.categoryGrouping === 'working') return;
        const index = await loadLobbyIndex();
        if (!index?.categories?.length || !root.isConnected) return;

        const directOptions = [...root.children].filter(element => element.matches?.('.lobby-apocalypse-option'));
        if (root.querySelector('.lobby-apocalypse-category-group') && directOptions.length === 0) return;
        const options = [...root.querySelectorAll('.lobby-apocalypse-option')];
        if (!options.length) return;
        const idToCategory = new Map(index.categories.flatMap(category =>
            category.apocalypseIds.map(id => [id, category.id])));
        const known = options.map(option => ({ option, id: optionId(option) }))
            .filter(item => idToCategory.has(item.id));
        if (!known.length) return;

        groupingLobby = true;
        root.dataset.categoryGrouping = 'working';
        try {
            const fragment = document.createDocumentFragment();
            for (const category of index.categories) {
                const members = known.filter(item => idToCategory.get(item.id) === category.id);
                if (!members.length) continue;
                const details = document.createElement('details');
                details.className = 'lobby-apocalypse-category-group';
                details.dataset.categoryId = category.id;
                details.open = true;

                const summary = document.createElement('summary');
                summary.className = 'lobby-apocalypse-category-heading';
                const name = category._i18n?.name?.[language()] || category._i18n?.name?.uk || category.id;
                summary.textContent = `${name} — ${members.length}`;

                const grid = document.createElement('div');
                grid.className = 'lobby-apocalypse-category-options';
                members.forEach(item => grid.appendChild(item.option));
                details.append(summary, grid);
                fragment.appendChild(details);
            }
            const knownOptions = new Set(known.map(item => item.option));
            options.filter(option => !knownOptions.has(option)).forEach(option => fragment.appendChild(option));
            root.replaceChildren(fragment);
            root.dataset.categoryGrouping = 'ready';
        } finally {
            groupingLobby = false;
        }
    }

    function initLobbyGrouping() {
        const root = document.getElementById('lobbyApocalypseResults');
        if (!root || lobbyObserver) return;
        lobbyObserver = new MutationObserver(() => {
            if (!groupingLobby) queueMicrotask(groupLobbyResults);
        });
        lobbyObserver.observe(root, { childList: true, subtree: false });
        groupLobbyResults();
    }

    function init() {
        initLobbyGrouping();
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) groupLobbyResults();
        });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
})(window);
