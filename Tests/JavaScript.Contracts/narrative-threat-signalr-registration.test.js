const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', '..');
const game = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'core', 'signalr-events.js'), 'utf8');
const coreRuntime = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'core', 'runtime.js'), 'utf8');
const threats = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'threats', 'signalr-events.js'), 'utf8');
const threatRuntime = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'threats', 'runtime.js'), 'utf8');

test('each central SignalR registration has a handler in its domain module', () => {
    const registrations = [...core.matchAll(/events\.([A-Za-z][A-Za-z0-9]*)\.([A-Za-z][A-Za-z0-9]*)\(\);/g)];
    assert.ok(registrations.length > 0);

    for (const [, domain, handler] of registrations) {
        const directory = {
            gameEvents: 'events',
            specialCards: 'special-cards'
        }[domain] || domain;
        const source = fs.readFileSync(
            path.join(root, 'wwwroot', 'js', 'bunker', directory, 'signalr-events.js'),
            'utf8');
        assert.match(source, new RegExp(`\\b${handler}\\s*\\(\\)\\s*\\{`));
    }
});

test('narrative threats register reveal, state, and image handlers only', () => {
    for (const handler of ['ThreatRevealed', 'ThreatStateUpdated', 'ThreatImageUpdated', 'ThreatImageRemoved']) {
        assert.match(core, new RegExp(`events\\.threats\\.${handler}\\(\\);`));
        assert.match(threats, new RegExp(`\\b${handler}\\s*\\(\\)\\s*\\{`));
    }

    assert.doesNotMatch(threats, /ThreatMiniGame|ThreatVolunteer|ThreatContribution|ThreatSupport|ThreatResolved/);
    assert.match(threatRuntime, /function renderThreatPanel\(threat\)/);
    assert.match(threatRuntime, /getThreatText\(threat, 'name'\)/);
    assert.match(threatRuntime, /getThreatText\(threat, 'description'\)/);
    assert.match(threatRuntime, /image\.src = imageUrl/);
    assert.doesNotMatch(game, /updateThreatOperationTimer/);
});

test('ThreatRevealed renders the narrative title, description, and image', () => {
    const handlers = new Map();
    const panel = {
        hidden: true,
        style: {},
        children: [],
        replaceChildren(...children) { this.children = children; }
    };
    const context = {
        window: {},
        currentThreat: null,
        connection: { off() {}, on(name, callback) { handlers.set(name, callback); } },
        document: {
            getElementById(id) { return id === 'threatPanel' ? panel : null; },
            createElement() { return { className: '', textContent: '', src: '', alt: '', children: [], append(child) { this.children.push(child); } }; }
        },
        getLocalizedValue(source, field) { return source?.[field] || ''; },
        t(key) { return key; },
        escapeHtml(value) { return value; },
        applyRoundState() {},
        updateRoundStatusUI() {},
        addEventMessage() {}
    };
    context.window = context.window;
    vm.runInNewContext(threatRuntime, context);
    vm.runInNewContext(threats, context);

    context.window.BunkerSignalREvents.threats.ThreatRevealed();
    handlers.get('ThreatRevealed')({ threat: { name: 'Storm', description: 'Shelter doors are under pressure.', imageUrl: '/storm.png' } });

    const [article] = panel.children;
    assert.equal(panel.hidden, false);
    assert.equal(article.children[0].textContent, 'Storm');
    assert.equal(article.children[1].textContent, 'Shelter doors are under pressure.');
    assert.equal(article.children[2].src, '/storm.png');
});

test('stable player identity is created once and reused for reconnect', () => {
    const values = new Map();
    const storage = { getItem(key) { return values.get(key) || null; }, setItem(key, value) { values.set(key, value); }, removeItem(key) { values.delete(key); } };
    const context = {
        window: { location: { pathname: '/' } },
        document: { addEventListener() {}, getElementById() { return null; } },
        localStorage: storage,
        sessionStorage: storage,
        sessionKeys: { stablePlayerId: 'bunker_stablePlayerId' },
        console: { warn() {} }
    };
    vm.runInNewContext(coreRuntime, context);

    const firstId = context.getOrCreatePlayerId();
    assert.match(firstId, /^player_/);
    assert.equal(context.getOrCreatePlayerId(), firstId);
    assert.equal(storage.getItem('bunker_stablePlayerId'), firstId);
});
