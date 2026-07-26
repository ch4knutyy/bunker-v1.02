const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const helpers = fs.readFileSync('wwwroot/js/bunker/apocalypse/helpers.js', 'utf8');
const render = fs.readFileSync('wwwroot/js/bunker/apocalypse/render.js', 'utf8');
const visualConfig = fs.readFileSync('wwwroot/js/bunker/apocalypse/visual-config.js', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const physicalCss = fs.readFileSync('wwwroot/css/apocalypse-physical-theme.css', 'utf8');

function method(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', source.indexOf(') {', start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unclosed ${name}`);
}

function constant(source, name) {
  const start = source.indexOf(`const ${name} =`);
  assert.notEqual(start, -1, `missing ${name}`);
  const match = source.slice(start).match(/;\r?\n\r?\n/);
  assert(match, `unclosed ${name}`);
  return source.slice(start, start + match.index + 1);
}

function eventBlock(name) {
  const start = game.indexOf(`connection.on("${name}"`);
  assert.notEqual(start, -1, `missing ${name}`);
  const end = game.indexOf('\n\tconnection.off(', start);
  return game.slice(start, end === -1 ? game.length : end);
}

function buildThemeHarness() {
  const classNames = new Set();
  let addCalls = 0;
  const body = {
    dataset: {},
    style: {
      values: new Map(),
      setProperty(name, value) { this.values.set(name, value); },
      removeProperty(name) { this.values.delete(name); }
    },
    classList: {
      add(...names) { addCalls += 1; names.forEach(name => classNames.add(name)); },
      remove(...names) { names.forEach(name => classNames.delete(name)); },
      contains(name) { return classNames.has(name); }
    }
  };
  const source = [
    constant(visualConfig, 'apocalypseVisualThemeRegistry'),
    constant(visualConfig, 'apocalypseCategoryThemeRegistry'),
    constant(visualConfig, 'apocalypsePhysicalThemeFallback'),
    constant(visualConfig, 'apocalypsePhysicalThemeProfiles'),
    method(helpers, 'normalizeApocalypseMetadataValue'),
    method(helpers, 'normalizeApocalypseVisualThemeId'),
    method(helpers, 'resolveApocalypseVisualThemeId'),
    method(helpers, 'apocalypseStableVisualHash'),
    method(helpers, 'clampApocalypseIntensity'),
    method(helpers, 'getApocalypseVisualMetadata'),
    method(helpers, 'inferApocalypsePhysicalArchetype'),
    method(helpers, 'resolveApocalypseVisualTheme'),
    method(render, 'clearApocalypseVisualTheme'),
    method(render, 'applyApocalypseVisualTheme'),
    method(render, 'syncApocalypseVisualTheme')
  ].join('\n');
  const api = new Function('document', 'window', `${source}; return { normalizeApocalypseVisualThemeId, resolveApocalypseVisualTheme, applyApocalypseVisualTheme, clearApocalypseVisualTheme, syncApocalypseVisualTheme };`)(
    { body },
    { setTimeout(callback) { callback(); } }
  );
  return { ...api, body, classNames, addCalls: () => addCalls };
}

test('site theme resolution prioritizes allowlisted VisualThemeId and rejects unknown values', () => {
  const themes = buildThemeHarness();
  assert.equal(themes.resolveApocalypseVisualTheme({ visualThemeId: 'storm-blue', categoryId: 'biological', tags: ['zombie'] }).themeId, 'storm-blue');
  assert.equal(themes.resolveApocalypseVisualTheme({ visualThemeId: 'evil injected class', categoryId: 'biological' }).themeId, 'default-dark');
  assert.equal(themes.resolveApocalypseVisualTheme({ categoryId: 'biological', id: 'pandemic_rage' }).archetype, 'pandemic');
  assert.equal(themes.resolveApocalypseVisualTheme({ tags: ['radiation'], id: 'nuclear_test' }).archetype, 'nuclear');
  assert.equal(themes.resolveApocalypseVisualTheme({ id: 'unknown' }).archetype, 'generic-collapse');
  assert.deepEqual(themes.resolveApocalypseVisualTheme({ id: 'stable', tags: ['radiation'] }), themes.resolveApocalypseVisualTheme({ id: 'stable', tags: ['radiation'] }));
});

test('apply is allowlisted, replaces old state, is idempotent and null clears it', () => {
  const themes = buildThemeHarness();
  themes.applyApocalypseVisualTheme({ visualThemeId: 'biohazard-green' });
  assert.equal(themes.body.dataset.apocalypseTheme, 'biohazard-green');
  assert.equal(themes.body.dataset.apocalypseCategory, 'biological');
  assert.equal(themes.body.dataset.apocalypseArchetype, 'generic-collapse');
  assert(themes.classNames.has('apocalypse-theme-active'));
  const afterFirstApply = themes.addCalls();

  themes.applyApocalypseVisualTheme({ visualThemeId: 'biohazard-green' });
  assert.equal(themes.addCalls(), afterFirstApply);
  themes.applyApocalypseVisualTheme({ visualThemeId: 'machine-cyan' });
  assert.equal(themes.body.dataset.apocalypseTheme, 'machine-cyan');
  assert.equal(themes.body.dataset.apocalypseCategory, 'technology');
  assert.equal([...themes.classNames].filter(name => name === 'apocalypse-theme-active').length, 1);

  themes.syncApocalypseVisualTheme(null);
  assert.equal(themes.body.dataset.apocalypseTheme, undefined);
  assert.equal(themes.body.dataset.apocalypseCategory, undefined);
  assert.equal(themes.classNames.size, 0);

  themes.applyApocalypseVisualTheme({ visualThemeId: 'theme; background:url(evil)' });
  assert.equal(themes.body.dataset.apocalypseTheme, 'default-dark');
  assert.equal(themes.body.dataset.apocalypseArchetype, 'generic-collapse');
  assert(themes.classNames.has('apocalypse-theme-active'));
});

test('renderApocalypse is the single canonical synchronization point', () => {
  const renderer = method(game, 'renderApocalypse');
  assert.match(renderer, /if \(!apocalypse \|\| !enabled\)[\s\S]*clearApocalypseVisualTheme\(\)/);
  assert.match(renderer, /container\.innerHTML = renderApocalypseScenario\(buildApocalypseScenarioModel\(apocalypse\)\)[\s\S]*syncApocalypseVisualTheme\(apocalypse\)/);
  const syncDef = method(render, 'syncApocalypseVisualTheme');
  const allGameSource = game + render;
  const syncCallCount = (allGameSource.match(/syncApocalypseVisualTheme\(apocalypse\)/g) || []).length;
  assert.ok(syncCallCount >= 1, 'syncApocalypseVisualTheme should be called');
});

test('game events reuse renderApocalypse without duplicating theme logic', () => {
  for (const eventName of ['GameStarted', 'ApocalypseChanged']) {
    const block = eventBlock(eventName);
    assert.match(block, /renderApocalypse\(currentApocalypse\)/);
    assert.doesNotMatch(block, /applyApocalypseVisualTheme|syncApocalypseVisualTheme|data-apocalypse-theme|dataset\.apocalypseTheme/);
  }
  const rejoin = eventBlock('RejoinSuccess');
  assert.match(rejoin, /currentApocalypse = data\.apocalypse \|\| data\.Apocalypse[\s\S]*renderApocalypse\(currentApocalypse\)/);
  assert.doesNotMatch(rejoin, /applyApocalypseVisualTheme|syncApocalypseVisualTheme|dataset\.apocalypseTheme/);
});

test('room exit and reset paths clear through renderApocalypse null', () => {
  assert.match(method(game, 'resetClientGameStateForNewRoom'), /currentApocalypse = null;[\s\S]*renderApocalypse\(null\)/);
  assert.match(method(game, 'clearGameFinishedStateForLobby'), /currentApocalypse = null;[\s\S]*renderApocalypse\(null\)/);
  assert.match(eventBlock('RoomLeft'), /currentApocalypse = null;[\s\S]*renderApocalypse\(null\)/);
  assert.match(eventBlock('PlayerKicked'), /currentApocalypse = null;[\s\S]*renderApocalypse\(null\)/);
});

test('theme manager never reads gameplay effects or hidden identifiers', () => {
  const manager = [
    method(helpers, 'resolveApocalypseVisualTheme'),
    method(render, 'applyApocalypseVisualTheme'),
    method(render, 'syncApocalypseVisualTheme')
  ].join('\n');
  assert.doesNotMatch(manager, /gameplay|effects|effectProfile|currentRoom|omniscient|hidden/i);
});

test('all ten canonical theme selectors and shared site variables exist', () => {
  const ids = ['extinction-red', 'storm-blue', 'biohazard-green', 'seismic-amber', 'cosmic-violet', 'machine-cyan', 'wasteland-olive', 'collapse-rust', 'glitch-magenta', 'occult-indigo'];
  for (const id of ids) assert.match(css, new RegExp(`body\\[data-apocalypse-theme="${id}"\\]`));
  for (const variable of ['--apocalypse-page-bg', '--apocalypse-page-glow', '--apocalypse-accent', '--apocalypse-border', '--apocalypse-panel-surface', '--apocalypse-overlay', '--apocalypse-shadow', '--apocalypse-pattern-opacity']) {
    assert.match(css, new RegExp(variable));
  }
  assert.match(css, /#gameSection[\s\S]*site-command-bar[\s\S]*site-round-hud[\s\S]*player-overview-section/);
  assert.match(css, /voting-panel[\s\S]*events-section-main[\s\S]*gm-panel-v2-drawer[\s\S]*modal-content/);
});

test('ambient layer is inert and reduced motion disables theme motion', () => {
  assert.match(css, /body\.apocalypse-theme-active::before\s*\{[^}]*pointer-events:\s*none[^}]*user-select:\s*none/s);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*body\.apocalypse-theme-active::before[\s\S]*animation:\s*none/);
  assert.match(css, /body\.apocalypse-theme-revealing[\s\S]*900ms/);
});

test('physical apocalypse layer is bounded and leaves bunker materials authoritative', () => {
  for (const archetype of ['nuclear', 'fire', 'ice', 'flood', 'pandemic', 'biological', 'chemical', 'volcanic', 'desert', 'darkness', 'solar', 'war', 'machine', 'anomalous']) {
    assert.match(physicalCss, new RegExp(`data-apocalypse-archetype="${archetype}"`));
  }
  assert.match(physicalCss, /apocalypse-light-intensity/);
  assert.match(physicalCss, /apocalypse-contamination-intensity/);
  assert.match(physicalCss, /apocalypse-visibility-reduction/);
  assert.match(physicalCss, /bunker-theme-active[\s\S]*--bunker-button-border/);
  assert.match(physicalCss, /prefers-reduced-motion[\s\S]*animation:\s*none\s*!important/);
});

test('card variants still prioritize canonical themes and retain tag fallback', () => {
  const resolverSource = method(helpers, 'resolveApocalypseVisualVariant');
  const resolve = new Function(
    `${constant(visualConfig, 'apocalypseVisualThemeRegistry')}; ${method(helpers, 'normalizeApocalypseMetadataValue')}; ${method(helpers, 'normalizeApocalypseVisualThemeId')}; ${resolverSource}; return resolveApocalypseVisualVariant;`
  )();
  assert.equal(resolve({ visualThemeId: 'machine-cyan', category: 'biological', tags: ['zombie'] }), 'ai');
  assert.equal(resolve({ tags: ['zombie', 'infection'] }), 'zombie');
  assert.equal(resolve({ tags: ['fungal', 'infection'] }), 'fungal');
  assert.equal(resolve({ tags: ['alien'] }), 'alien');
});
