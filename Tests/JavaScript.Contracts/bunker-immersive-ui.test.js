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

test('one universal bunker renderer owns the complete technical facility shell', () => {
  const renderer = method(game, 'renderBunkerFacility');
  assert.match(game, /container\.innerHTML = renderBunkerFacility\(buildBunkerFacilityModel\(bunker\)\)/);
  for (const className of ['bunker-facility-shell','bunker-hero','bunker-hero-media','bunker-hero-image','bunker-hero-overlay','bunker-hero-pattern','bunker-badge','bunker-title','bunker-subtitle','bunker-status-medallion','bunker-metrics','bunker-content-grid','bunker-footer']) assert.match(renderer, new RegExp(className));
  assert.match(renderer, /model\.name/);
  assert.match(renderer, /model\.shortDescription/);
  assert.doesNotMatch(renderer, /model\.id|model\.tags|debug/i);
  assert.equal((game.match(/function renderBunkerFacility\(/g) || []).length, 1);
});

test('four canonical metrics render and empty content sections are omitted', () => {
  const renderer = method(game, 'renderBunkerFacility');
  for (const metric of ['metric-capacity','metric-condition','metric-supplies','metric-location']) assert.match(renderer, new RegExp(metric));
  assert.match(renderer, /model\.capacity/);
  assert.match(renderer, /model\.supplies/);
  assert.match(renderer, /model\.location/);
  assert.match(game, /function renderBunkerContentSection[\s\S]*if \(!Array\.isArray\(items\) \|\| !items\.length\) return ''/);
  assert.match(renderer, /renderBunkerContentSection\('rooms'/);
  assert.match(renderer, /renderBunkerContentSection\('resources'/);
  assert.match(renderer, /renderBunkerContentSection\('problems'/);
});

test('condition resolver normalizes UA RU EN equivalents into presentation semantics', () => {
  const normalize = method(game, 'normalizeBunkerMetadataValue');
  const resolver = method(game, 'resolveBunkerCondition');
  const resolve = new Function(`${normalize}; ${resolver}; return resolveBunkerCondition;`)();
  for (const value of ['excellent','Відмінний','отличный','good','хороший']) assert.equal(resolve(value).semantic, 'positive');
  for (const value of ['stable','стабільний','стабильный']) assert.equal(resolve(value).semantic, 'neutral');
  for (const value of ['worn','fair','зношений','удовлетворительный']) assert.equal(resolve(value).semantic, 'warning-soft');
  for (const value of ['damaged','пошкоджений','poor','плохой']) assert.equal(resolve(value).semantic, 'damaged');
  for (const value of ['critical','критичний','критический']) assert.equal(resolve(value).semantic, 'critical');
  assert.deepEqual(resolve('unmapped'), { key:'unknown', semantic:'neutral' });
});

test('canonical resolver supports facility variants and condition overrides', () => {
  const normalize = method(game, 'normalizeBunkerMetadataValue');
  const resolver = method(game, 'resolveBunkerVisualVariant');
  const resolve = new Function(`${normalize}; ${resolver}; return resolveBunkerVisualVariant;`)();
  const cases = [
    ['military',{tags:['military']}], ['industrial',{category:'industrial'}], ['underground',{type:'subterranean'}],
    ['scientific',{tags:['research_lab']}], ['medical',{category:'hospital'}], ['civilian',{classification:'civilian'}],
    ['luxury',{category:'premium'}], ['emergency',{type:'emergency'}], ['natural',{tags:['agriculture']}],
    ['remote',{tags:['isolated_location']}], ['damaged',{conditionSemantic:'damaged',tags:['military']}],
    ['critical',{conditionSemantic:'critical',tags:['medical']}]
  ];
  for (const [expected, model] of cases) assert.equal(resolve(model), expected);
  assert.equal(resolve({ conditionSemantic:'neutral', tags:['unclassified'] }), 'generic');
  assert.doesNotMatch(resolver, /name|title|description/i);
});

test('complete public model retains metadata while raw ids and tags never enter DOM', () => {
  const model = method(game, 'buildBunkerFacilityModel');
  for (const field of ['id','name','shortDescription','description','capacity','condition','supplies','location','rooms','resources','problems','imageUrl','tags','category','visualVariant']) assert.match(model, new RegExp(`${field}(?::|,|\\s*=)|model\\.${field}`));
  assert.match(model, /source\.bunkerTags \|\| source\.BunkerTags/);
  assert.match(model, /getLocalizedValue/);
  assert.match(model, /getLocalizedArray/);
  assert.match(game, /currentBunker = bunker \|\| null/);
  assert.doesNotMatch(method(game, 'renderBunkerFacility'), /data-id|data-tags|connectionId|hostToken|capabilit/i);
});

test('local hero media has safe fallback and correct non-negative stacking order', () => {
  const renderer = method(game, 'renderBunkerFacility');
  assert.match(renderer, /class="bunker-hero-media"[\s\S]*class="bunker-hero-image"[\s\S]*alt=""/);
  assert.match(renderer, /onerror="handleBunkerHeroImageError\(this\)"/);
  assert.match(game, /function handleBunkerHeroImageError\(image\)[\s\S]*classList\.add\('no-image'\)[\s\S]*bunker-hero-media/);
  assert.match(css, /\.bunker-hero-media\s*\{[^}]*z-index:0/);
  assert.match(css, /\.bunker-hero-image\s*\{[^}]*object-fit:cover/);
  assert.match(css, /\.bunker-hero-overlay\s*\{[^}]*z-index:1/);
  assert.match(css, /\.bunker-hero-pattern\s*\{[^}]*z-index:2/);
  assert.match(css, /\.bunker-hero-content\s*\{[^}]*z-index:3/);
  assert.doesNotMatch(css, /\.bunker-(?:background|hero-image|hero-media)\s*\{[^}]*z-index:\s*-/);
});

test('image states tune only the confirmed bunker pattern layer', () => {
  const renderer = method(game, 'renderBunkerFacility');
  assert.match(renderer, /bunker-hero \$\{model\.imageUrl \? 'has-image' : 'no-image'\}/);
  assert.match(css, /\.apocalypse-hero\.has-image \.apocalypse-hero-pattern,\s*\.bunker-hero\.has-image \.bunker-hero-pattern\s*\{[^}]*display:\s*none;[^}]*opacity:\s*0/);
  assert.match(css, /\.bunker-hero\.no-image \.bunker-hero-pattern\s*\{\s*opacity:\.14/);
  assert.match(game, /handleBunkerHeroImageError[\s\S]*classList\.remove\('has-image'\)[\s\S]*classList\.add\('no-image'\)/);
  assert.doesNotMatch(css, /\.bunker-hero\.has-image \.bunker-hero-pattern\s*\{[^}]*(?:opacity:\.(?:0[5-9]|[1-9])|display:block)/);
});

test('circular decorative medallion replaces the duplicated condition block', () => {
  const renderer = method(game, 'renderBunkerFacility');
  const medallion = renderer.match(/<div class="bunker-status-medallion"[\s\S]*?<\/div>/)?.[0] || '';
  assert.match(medallion, /aria-hidden="true"/);
  assert.match(medallion, /renderBunkerIcon\(variant\)/);
  assert.doesNotMatch(medallion, /t\('condition'\)|getBunkerConditionLabel|<small|<strong/);
  assert.doesNotMatch(renderer, /bunker-status-mark/);
  assert.match(renderer, /metric-condition[\s\S]*getBunkerConditionLabel\(model\.conditionKey\)/);
  assert.match(css, /\.bunker-status-medallion\s*\{[\s\S]*width:84px[\s\S]*height:84px[\s\S]*border-radius:50%/);
  assert.match(css, /\.bunker-status-medallion::before[\s\S]*border-radius:50%/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*bunker-status-medallion[^}]*width:62px[^}]*height:62px/);
  for (const condition of ['positive','warning-soft','damaged','critical']) assert.match(css, new RegExp(`condition-${condition}[^}]*--bunker-medallion-accent`));
});

test('shared CSS variables drive variants, condition states and responsive geometry', () => {
  for (const variable of ['--bunker-accent','--bunker-accent-strong','--bunker-border','--bunker-inner-border','--bunker-surface','--bunker-overlay','--bunker-glow','--bunker-metric-surface','--bunker-divider','--bunker-problem','--bunker-resource','--bunker-room']) assert.match(css, new RegExp(variable));
  for (const variant of ['military','industrial','underground','scientific','medical','civilian','luxury','emergency','natural','remote','damaged','critical']) assert.match(css, new RegExp(`bunker-facility-shell\\.variant-${variant}`));
  for (const condition of ['positive','warning-soft','damaged','critical']) assert.match(css, new RegExp(`condition-${condition}`));
  assert.match(css, /\.bunker-metrics\s*\{[\s\S]*repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(css, /@media \(max-width:900px\)[\s\S]*bunker-metrics[^}]*repeat\(2/);
  assert.match(css, /@media \(max-width:620px\)[\s\S]*bunker-content-grid[^}]*grid-template-columns:1fr/);
  assert.match(css, /@media \(max-width:420px\)[\s\S]*bunker-metrics[^}]*grid-template-columns:1fr/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)[\s\S]*bunker-facility-shell/);
});

test('live capacity image reconnect and localization paths reuse the current renderer', () => {
  assert.equal((game.match(/connection\.off\("BunkerChanged"\)/g) || []).length, 1);
  assert.equal((game.match(/connection\.on\("BunkerChanged"/g) || []).length, 1);
  assert.match(game, /BunkerChanged[\s\S]*currentBunker = bunker;[\s\S]*renderBunker\(currentBunker\)/);
  assert.match(game, /BunkerCapacityUpdated[\s\S]*currentBunkerCapacity = capacity[\s\S]*renderBunker\(currentBunker\)/);
  assert.match(game, /BunkerImageUpdated[\s\S]*currentBunker\.imageUrl = imageUrl[\s\S]*renderBunker\(currentBunker\)/);
  assert.match(game, /RejoinSuccess[\s\S]*currentBunker = data\.bunker \|\| data\.Bunker[\s\S]*renderBunker\(currentBunker\)/);
  assert.match(game, /renderCurrentGameUI\(\)[\s\S]*renderBunker\(currentBunker\)/);
  for (const key of ['bunkerBadge','bunkerRooms','bunkerResources','bunkerProblems','bunkerFacilityRecord','conditionExcellent','conditionCritical','conditionUnknown']) assert.equal((game.match(new RegExp(`${key}:`, 'g')) || []).length, 3, `${key} must have UA/EN/RU`);
});

test('apocalypse renderer and room count privacy guard remain independent', () => {
  const apocalypse = method(game, 'renderApocalypseScenario');
  assert.doesNotMatch(apocalypse, /renderBunkerFacility|bunker-facility-shell|resolveBunkerVisualVariant/);
  assert.match(game, /if \(roomPlayerCountElement\)/);
  assert.match(view, /id="bunkerContent"/);
  assert.match(view, /id="apocalypseContent"/);
});
