const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');

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
    classList: {
      add(...names) { addCalls += 1; names.forEach(name => classNames.add(name)); },
      remove(...names) { names.forEach(name => classNames.delete(name)); },
      contains(name) { return classNames.has(name); }
    }
  };
  const source = [
    constant(game, 'apocalypseVisualThemeRegistry'),
    constant(game, 'apocalypseCategoryThemeRegistry'),
    method(game, 'normalizeApocalypseMetadataValue'),
    method(game, 'normalizeApocalypseVisualThemeId'),
    method(game, 'resolveApocalypseVisualTheme'),
    method(game, 'clearApocalypseVisualTheme'),
    method(game, 'applyApocalypseVisualTheme'),
    method(game, 'syncApocalypseVisualTheme')
  ].join('\n');
  const api = new Function('document', 'window', `${source}; return { normalizeApocalypseVisualThemeId, resolveApocalypseVisualTheme, applyApocalypseVisualTheme, clearApocalypseVisualTheme, syncApocalypseVisualTheme };`)(
    { body },
    { setTimeout(callback) { callback(); } }
  );
  return { ...api, body, classNames, addCalls: () => addCalls };
}

test('site theme resolution prioritizes allowlisted VisualThemeId and rejects unknown values', () => {
  const themes = buildThemeHarness();
  assert.equal(themes.resolveApocalypseVisualTheme({ visualThemeId: 'storm-blue', categoryId: 'biological', tags: ['zombie'] }), 'storm-blue');
  assert.equal(themes.resolveApocalypseVisualTheme({ visualThemeId: 'evil injected class', categoryId: 'biological' }), 'default-dark');
  assert.equal(themes.resolveApocalypseVisualTheme({ visualThemeId: '' }), 'default-dark');
  assert.equal(themes.resolveApocalypseVisualTheme({ categoryId: 'biological' }), 'biohazard-green');
  assert.equal(themes.resolveApocalypseVisualTheme({ tags: ['radiation'] }), 'extinction-red');
  assert.doesNotMatch(method(game, 'resolveApocalypseVisualTheme'), /name|title|description/i);
});

test('apply is allowlisted, replaces old state, is idempotent and null clears it', () => {
  const themes = buildThemeHarness();
  themes.applyApocalypseVisualTheme({ visualThemeId: 'biohazard-green' });
  assert.equal(themes.body.dataset.apocalypseTheme, 'biohazard-green');
  assert.equal(themes.body.dataset.apocalypseCategory, 'biological');
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
  assert.equal(themes.body.dataset.apocalypseTheme, undefined);
  assert.equal(themes.classNames.size, 0);
});

test('renderApocalypse is the single canonical synchronization point', () => {
  const renderer = method(game, 'renderApocalypse');
  assert.match(renderer, /if \(!apocalypse \|\| !enabled\)[\s\S]*clearApocalypseVisualTheme\(\)/);
  assert.match(renderer, /container\.innerHTML = renderApocalypseScenario\(buildApocalypseScenarioModel\(apocalypse\)\)[\s\S]*syncApocalypseVisualTheme\(apocalypse\)/);
  assert.equal((game.replace(renderer, '').match(/syncApocalypseVisualTheme\(apocalypse\)/g) || []).length, 1, 'only the function definition may exist outside renderApocalypse');
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
    method(game, 'resolveApocalypseVisualTheme'),
    method(game, 'applyApocalypseVisualTheme'),
    method(game, 'syncApocalypseVisualTheme')
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

test('card variants still prioritize canonical themes and retain tag fallback', () => {
  const resolverSource = method(game, 'resolveApocalypseVisualVariant');
  const resolve = new Function(
    `${constant(game, 'apocalypseVisualThemeRegistry')}; ${method(game, 'normalizeApocalypseMetadataValue')}; ${method(game, 'normalizeApocalypseVisualThemeId')}; ${resolverSource}; return resolveApocalypseVisualVariant;`
  )();
  assert.equal(resolve({ visualThemeId: 'machine-cyan', category: 'biological', tags: ['zombie'] }), 'ai');
  assert.equal(resolve({ tags: ['zombie', 'infection'] }), 'zombie');
  assert.equal(resolve({ tags: ['fungal', 'infection'] }), 'fungal');
  assert.equal(resolve({ tags: ['alien'] }), 'alien');
});
