const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const { readBunkerView } = require('./bunker-view-test-helpers');
const view = readBunkerView();

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

test('one universal renderer owns the full immersive scenario structure', () => {
  const renderer = method(game, 'renderApocalypseScenario');
  assert.match(game, /container\.innerHTML = renderApocalypseScenario\(buildApocalypseScenarioModel\(apocalypse\)\)/);
  for (const className of ['apocalypse-scenario-shell', 'apocalypse-hero', 'apocalypse-hero-media', 'apocalypse-hero-image', 'apocalypse-hero-overlay', 'apocalypse-hero-pattern', 'apocalypse-hero-content', 'apocalypse-badge', 'apocalypse-title', 'apocalypse-subtitle', 'apocalypse-metrics', 'apocalypse-content-grid', 'apocalypse-footer']) {
    assert.match(renderer, new RegExp(className));
  }
  assert.match(renderer, /model\.name/);
  assert.match(renderer, /model\.shortDescription/);
  assert.doesNotMatch(renderer, /model\.id|model\.tags|debug/i);
  assert.equal((game.match(/function renderApocalypseScenario\(/g) || []).length, 1);
});

test('metrics use canonical values and missing content sections are omitted', () => {
  const renderer = method(game, 'renderApocalypseScenario');
  assert.match(renderer, /model\.dangerKey/);
  assert.match(renderer, /model\.survivalChance/);
  assert.match(renderer, /model\.duration \|\| t\('unknown'\)/);
  assert.match(game, /if \(!Array\.isArray\(items\) \|\| !items\.length\) return ''/);
  assert.match(renderer, /renderApocalypseContentSection\('threats'/);
  assert.match(renderer, /renderApocalypseContentSection\('requirements'/);
  assert.match(renderer, /renderApocalypseContentSection\('consequences'/);
});

test('canonical metadata resolver supports every requested variant and generic fallback', () => {
  const normalize = method(game, 'normalizeApocalypseMetadataValue');
  const resolver = method(game, 'resolveApocalypseVisualVariant');
  const resolve = new Function(`${normalize}; ${resolver}; return resolveApocalypseVisualVariant;`)();
  const cases = [
    ['nuclear', { tags: ['radiation'] }],
    ['biological', { category: 'biological' }],
    ['climate', { tags: ['weather_climate'] }],
    ['cosmic', { classification: 'cosmic_event' }],
    ['ai', { tags: ['ai_machines'] }],
    ['alien', { type: 'extraterrestrial' }],
    ['fungal', { tags: ['fungal', 'infection'] }],
    ['zombie', { tags: ['zombie', 'infection'] }],
    ['mystical', { category: 'occult' }],
    ['anomaly', { tags: ['anomaly_reality'] }],
    ['collapse', { tags: ['structural_damage'] }]
  ];
  for (const [expected, model] of cases) assert.equal(resolve(model), expected);
  assert.equal(resolve({ tags: ['unclassified'] }), 'generic');
  assert.doesNotMatch(resolver, /name|title|description/i);
});

test('model preserves canonical fields while renderer exposes no ids or tags', () => {
  const model = method(game, 'buildApocalypseScenarioModel');
  for (const field of ['id', 'name', 'shortDescription', 'description', 'dangerLevel', 'survivalChance', 'duration', 'threats', 'requirements', 'consequences', 'imageUrl', 'tags', 'category', 'visualVariant']) {
    assert.match(model, new RegExp(`${field}(?::|,|\\s*=)|model\\.${field}`));
  }
  assert.match(model, /getLocalizedValue/);
  assert.match(model, /getLocalizedArray/);
  assert.match(game, /currentApocalypse = apocalypse \|\| null/);
  assert.doesNotMatch(method(game, 'renderApocalypseScenario'), /data-id|data-tags|apocalypseId/);
});

test('local image is decorative and unsafe or remote sources fall back to CSS', () => {
  const normalizer = method(game, 'normalizeLocalScenarioImageUrl');
  const normalize = new Function(`${normalizer}; return normalizeLocalScenarioImageUrl;`)();
  assert.equal(normalize('/uploads/apocalypses/nuclear.webp?v=2'), '/uploads/apocalypses/nuclear.webp?v=2');
  assert.equal(normalize('uploads/apocalypses/local.png'), '/uploads/apocalypses/local.png');
  assert.equal(normalize('https://remote.invalid/a.png'), '');
  assert.equal(normalize('javascript:alert(1)'), '');
  assert.equal(normalize('../secret.png'), '');
  const renderer = method(game, 'renderApocalypseScenario');
  assert.match(renderer, /class="apocalypse-hero-media"[\s\S]*class="apocalypse-hero-image"[\s\S]*alt=""/);
  assert.match(renderer, /onerror="handleApocalypseHeroImageError\(this\)"/);
  assert.match(renderer, /'has-image' : 'no-image'/);
  assert.match(game, /function handleApocalypseHeroImageError\(image\)[\s\S]*classList\.add\('no-image'\)[\s\S]*apocalypse-hero-media/);
  assert.match(css, /\.apocalypse-hero\.no-image \.apocalypse-hero-pattern/);
});

test('hero stacking keeps real media above fallback and below readable decoration', () => {
  assert.match(css, /\.apocalypse-hero-media\s*\{[^}]*z-index: 0/);
  assert.match(css, /\.apocalypse-hero-image\s*\{[\s\S]*object-fit: cover[\s\S]*object-position:/);
  assert.match(css, /\.apocalypse-hero-overlay\s*\{[^}]*z-index: 1/);
  assert.match(css, /\.apocalypse-hero-pattern\s*\{[^}]*z-index: 2[\s\S]*opacity: \.14/);
  assert.match(css, /\.apocalypse-hero-content\s*\{[^}]*z-index: 3/);
  assert.doesNotMatch(css, /\.apocalypse-(?:background|hero-image)\s*\{[^}]*z-index:\s*-/);
});

test('apocalypse image state restrains pattern and keeps a circular decorative medallion', () => {
  const renderer = method(game, 'renderApocalypseScenario');
  assert.match(renderer, /apocalypse-hero \$\{model\.imageUrl \? 'has-image' : 'no-image'\}/);
  assert.match(css, /\.apocalypse-hero\.has-image \.apocalypse-hero-pattern,\s*\.bunker-hero\.has-image \.bunker-hero-pattern\s*\{[^}]*display:\s*none;[^}]*opacity:\s*0;[^}]*background-image:\s*none/);
  assert.match(css, /\.apocalypse-hero\.no-image \.apocalypse-hero-pattern\s*\{[^}]*opacity: \.14/);
  assert.match(renderer, /class="apocalypse-theme-mark" aria-hidden="true"/);
  assert.match(css, /\.apocalypse-theme-mark\s*\{[\s\S]*z-index: 3[\s\S]*width: 84px[\s\S]*height: 84px[\s\S]*border-radius: 50%/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*apocalypse-theme-mark[^}]*width: 62px[^}]*height: 62px/);
});

test('shared CSS variables drive twelve variants and responsive card geometry', () => {
  for (const variable of ['--apoc-accent', '--apoc-accent-strong', '--apoc-border', '--apoc-inner-border', '--apoc-surface', '--apoc-overlay', '--apoc-glow', '--apoc-metric-surface', '--apoc-danger', '--apoc-divider']) assert.match(css, new RegExp(variable));
  for (const variant of ['nuclear', 'biological', 'climate', 'cosmic', 'ai', 'alien', 'fungal', 'zombie', 'mystical', 'anomaly', 'collapse']) assert.match(css, new RegExp(`apocalypse-scenario-shell\.variant-${variant}`));
  assert.match(css, /\.apocalypse-metrics\s*\{[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.apocalypse-content-grid\s*\{[\s\S]*repeat\(auto-fit/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*apocalypse-content-grid[^}]*grid-template-columns: 1fr/);
  assert.match(css, /@media \(max-width: 420px\)[\s\S]*apocalypse-metrics[^}]*grid-template-columns: 1fr/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*apocalypse-scenario-shell/);
});

test('live, reconnect and language paths rerender the same current scenario', () => {
  assert.equal((game.match(/connection\.off\("ApocalypseChanged"\)/g) || []).length, 1);
  assert.equal((game.match(/connection\.on\("ApocalypseChanged"/g) || []).length, 1);
  assert.match(game, /connection\.on\("ApocalypseChanged"[\s\S]*currentApocalypse = apocalypse;[\s\S]*renderApocalypse\(currentApocalypse\)/);
  assert.match(game, /connection\.on\("GameStarted"[\s\S]*currentApocalypse = apocalypse \|\| null/);
  assert.match(game, /RejoinSuccess[\s\S]*currentApocalypse = data\.apocalypse \|\| data\.Apocalypse[\s\S]*renderApocalypse\(currentApocalypse\)/);
  assert.match(game, /renderCurrentGameUI\(\)[\s\S]*renderApocalypse\(currentApocalypse\)/);
  for (const key of ['apocBadge', 'apocDanger', 'apocMainThreats', 'apocSurvivalRequirements', 'apocConsequences', 'dangerCritical', 'dangerUnknown']) {
    assert.equal((game.match(new RegExp(`${key}:`, 'g')) || []).length, 3, `${key} must have UA/EN/RU`);
  }
});

test('bunker renderer and the guarded room player count remain independent', () => {
  const bunker = method(game, 'renderBunker');
  assert.doesNotMatch(bunker, /renderApocalypseScenario|apocalypse-scenario-shell|resolveApocalypseVisualVariant/);
  assert.match(game, /if \(roomPlayerCountElement\)/);
  assert.match(view, /id="apocalypseContent"/);
  assert.match(view, /id="bunkerContent"/);
});
