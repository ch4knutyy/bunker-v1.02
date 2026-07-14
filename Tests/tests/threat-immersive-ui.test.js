const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const view = fs.readFileSync('Views/Home/Game.cshtml', 'utf8');

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

test('one universal renderer owns hidden revealed text and interactive layouts', () => {
  const panel = method(game, 'renderThreatPanel');
  const renderer = method(game, 'renderThreatScenario');
  assert.match(panel, /renderThreatScenario\(buildThreatScenarioModel\(threat, isRevealed\)\)/);
  assert.match(renderer, /if \(!model\?\.isRevealed\) return renderHiddenThreatScenario\(\)/);
  for (const className of ['threat-scenario-shell','threat-hero','threat-hero-media','threat-hero-overlay','threat-hero-pattern','threat-badge','threat-title','threat-medallion','threat-status-row','threat-content-grid','threat-interactive-zone','threat-footer']) {
    assert.match(renderer, new RegExp(className));
  }
  assert.equal((game.match(/function renderThreatScenario\(/g) || []).length, 1);
});

test('sealed state is neutral and cannot serialize future metadata', () => {
  const hidden = method(game, 'renderHiddenThreatScenario');
  const renderer = method(game, 'renderThreatScenario');
  const renderHidden = new Function('t', 'escapeHtml', `${hidden}; return renderHiddenThreatScenario;`)(key => ({ threat:'Threat', unknown:'Unknown', threatUnknownDescription:'Not revealed' }[key] || key), String);
  const html = renderHidden();
  assert.match(html, /is-sealed/);
  assert.match(html, /Threat/);
  assert.match(html, /Unknown/);
  assert.match(html, /Not revealed/);
  for (const secret of ['model.name','model.type','model.imageUrl','model.tags','model.visualVariant','data-']) assert.doesNotMatch(hidden, new RegExp(secret.replace('.', '\\.')));
  assert.match(renderer, /if \(!model\?\.isRevealed\)/);
  assert.match(view, /threat-scenario-shell is-sealed/);
  assert.doesNotMatch(view.match(/<article class="threat-scenario-shell is-sealed"[\s\S]*?<\/article>/)?.[0] || '', /radiation|air_filter|variant-|data-/i);
});

test('revealed model uses public fields but ids and tags never enter scenario DOM', () => {
  const model = method(game, 'buildThreatScenarioModel');
  const renderer = method(game, 'renderThreatScenario');
  for (const field of ['id','type','name','shortDescription','description','severity','status','isRevealed','isInteractive','imageUrl','tags','consequences','recommendations','visualVariant','interactiveState']) {
    assert.match(model, new RegExp(`${field}(?::|,|\\s*=)|model\\.${field}`));
  }
  assert.match(model, /if \(!isRevealed \|\| !source\) return \{ isRevealed: false \}/);
  assert.doesNotMatch(renderer, /data-(?:id|tags|type|variant)|model\.id|model\.tags|connectionId|answerKey|debug/i);
  assert.match(renderer, /renderThreatContentSection\('consequences'/);
  assert.match(renderer, /renderThreatContentSection\('recommendations'/);
  assert.match(game, /if \(!Array\.isArray\(items\) \|\| !items\.length\) return ''/);
});

test('canonical metadata resolver covers every requested visual identity', () => {
  const normalize = method(game, 'normalizeThreatMetadataValue');
  const resolver = method(game, 'resolveThreatVisualVariant');
  const resolve = new Function(`${normalize}; ${resolver}; return resolveThreatVisualVariant;`)();
  const cases = [
    ['radiation',{id:'radiation_leak'}], ['air',{id:'air_filter_failure'}], ['fire',{tags:['fire']}],
    ['flood',{category:'water_pressure'}], ['structural',{tags:['structural_damage']}],
    ['contamination',{tags:['contamination']}], ['chemical',{type:'chemical'}], ['medical',{category:'medical'}],
    ['biological',{tags:['infection']}], ['security',{type:'security_breach'}], ['power',{tags:['generator']}],
    ['environmental',{category:'weather'}], ['anomaly',{tags:['reality_distortion']}]
  ];
  for (const [expected, input] of cases) assert.equal(resolve(input), expected);
  assert.equal(resolve({ tags:['unclassified'] }), 'generic');
  assert.doesNotMatch(resolver, /name|title|description/i);
});

test('severity and terminal states normalize without exposing raw codes', () => {
  const normalize = method(game, 'normalizeThreatMetadataValue');
  const severity = method(game, 'resolveThreatSeverity');
  const status = method(game, 'resolveThreatStatusPresentation');
  const resolveSeverity = new Function(`${normalize}; ${severity}; return resolveThreatSeverity;`)();
  for (const [value, semantic] of [['low','low'],['середній','warning'],['высокий','severe'],['very high','severe-dark'],['критичний','critical'],['mystery','neutral']]) assert.equal(resolveSeverity(value).semantic, semantic);
  const t = key => key;
  const resolveStatus = new Function('t', `${normalize}; ${status}; return resolveThreatStatusPresentation;`)(t);
  assert.equal(resolveStatus('active').semantic, 'running');
  assert.equal(resolveStatus('resolved_safely').semantic, 'success');
  assert.equal(resolveStatus('resolved_with_casualty').semantic, 'consequence');
  assert.equal(resolveStatus('failed').semantic, 'failure');
  assert.equal(resolveStatus('timeout').label, 'threatStatusTimeout');
  assert.equal(resolveStatus('aborted').semantic, 'cancelled');
  assert.equal(resolveStatus('internal_new_code').label, 'threatStatusUnknown');
  assert.match(method(game, 'getThreatStatusLabel'), /resolveThreatStatusPresentation\(status\)\.label/);
});

test('image is reveal-only decorative media with safe broken-image fallback and stacking', () => {
  const renderer = method(game, 'renderThreatScenario');
  assert.match(renderer, /if \(!model\?\.isRevealed\)[\s\S]*model\.imageUrl \? `<div class="threat-hero-media"/);
  assert.match(renderer, /class="threat-hero-image"[\s\S]*alt=""[\s\S]*onerror="handleThreatHeroImageError\(this\)"/);
  assert.match(game, /function handleThreatHeroImageError\(image\)[\s\S]*classList\.remove\('has-image'\)[\s\S]*classList\.add\('no-image'\)[\s\S]*threat-hero-media/);
  assert.match(css, /\.threat-hero-media\s*\{[^}]*z-index:\s*0/);
  assert.match(css, /\.threat-hero-image\s*\{[^}]*object-fit:\s*cover/);
  assert.match(css, /\.threat-hero-overlay\s*\{[^}]*z-index:\s*1/);
  assert.match(css, /\.threat-hero-pattern\s*\{[^}]*z-index:\s*2/);
  assert.match(css, /\.threat-hero-content\s*\{[^}]*z-index:\s*3/);
  assert.match(css, /\.threat-hero\.has-image \.threat-hero-pattern,\s*\.apocalypse-hero\.has-image \.apocalypse-hero-pattern,\s*\.bunker-hero\.has-image \.bunker-hero-pattern\s*\{[^}]*display:\s*none;[^}]*opacity:\s*0;[^}]*background-image:\s*none;/);
  assert.match(css, /\.threat-hero\.no-image \.threat-hero-pattern\s*\{[^}]*opacity:\s*\.12;/);
  assert.doesNotMatch(css, /\.(?:threat-hero-media|threat-hero-image|threat-hero-overlay|threat-hero-pattern|threat-hero-content)\s*\{[^}]*z-index:\s*-/);
});

test('radiation and air filter reuse existing interaction renderers and handlers', () => {
  const interaction = method(game, 'renderThreatInteractionPanel');
  const radiation = method(game, 'renderThreatMiniGamePanel');
  const air = method(game, 'renderAirFilterPlanChoice');
  assert.match(interaction, /air_filter_failure[\s\S]*renderAirFilterPlanChoice\(interactionState\)/);
  assert.match(interaction, /radiation_leak[\s\S]*openThreatOperationModal/);
  for (const handler of ['selectThreatPlan','resolveCurrentThreat','submitThreatVolunteer','withdrawThreatContribution']) assert.match(air, new RegExp(handler));
  for (const handler of ['startThreatMiniGame','submitThreatMiniGameAnswer','useThreatMiniGameHint']) assert.match(radiation, new RegExp(handler));
  assert.doesNotMatch(method(game, 'renderThreatScenario'), /connection\.invoke|Finalize|EffectsApplied/);
  assert.match(method(game, 'renderThreatScenario'), /model\.isInteractive \? renderThreatInteractionPanel\(model\) : ''/);
});

test('live reconnect localization and capability paths stay canonical', () => {
  assert.equal((game.match(/connection\.off\("ThreatStateUpdated"\)/g) || []).length, 1);
  assert.equal((game.match(/connection\.on\("ThreatStateUpdated"/g) || []).length, 1);
  assert.equal((game.match(/connection\.off\("ThreatMiniGameUpdated"\)/g) || []).length, 1);
  assert.match(game, /ThreatStateUpdated[\s\S]*applyRoundState[\s\S]*renderCurrentGameUI/);
  assert.match(game, /ThreatMiniGameUpdated[\s\S]*renderThreatPanel\(currentThreat\)/);
  assert.match(game, /RejoinSuccess[\s\S]*applyRoundState\(data\.roundState \|\| data\.RoundState\)[\s\S]*renderCurrentGameUI/);
  assert.match(game, /renderCurrentGameUI\(\)[\s\S]*renderThreatPanel\(currentThreat\)/);
  assert.match(method(game, 'renderThreatScenario'), /isHost \? `<input type="file" id="threatImageInput"/);
  for (const key of ['threatIncidentStatus','threatRecommendations','threatWhatHappens','threatActiveOperation','threatStatusSuccess','threatStatusFailure','threatStatusCancelled','threatStatusTimeout','threatSeverityCritical']) {
    assert.equal((game.match(new RegExp(`${key}:`, 'g')) || []).length, 3, `${key} must have UA/EN/RU`);
  }
});

test('shared variables variants circular medallion and responsive rules are present', () => {
  for (const variable of ['--threat-accent','--threat-accent-strong','--threat-border','--threat-inner-border','--threat-surface','--threat-overlay','--threat-glow','--threat-status-surface','--threat-divider','--threat-danger','--threat-support']) assert.match(css, new RegExp(variable));
  for (const variant of ['radiation','air','fire','flood','structural','contamination','medical','security','power','environmental','biological','chemical','anomaly','generic']) assert.match(css, new RegExp(`threat-scenario-shell\\.variant-${variant}`));
  assert.match(css, /\.threat-medallion\s*\{[\s\S]*width:\s*84px[\s\S]*height:\s*84px[\s\S]*border-radius:\s*50%/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*threat-medallion[^}]*width:\s*62px[^}]*height:\s*62px/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*threat-content-grid[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /threat-interactive-zone button[^{]*\{ min-height:44px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*threat-scenario-shell/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
});

test('apocalypse bunker and room count regression remain independent', () => {
  assert.doesNotMatch(method(game, 'renderApocalypseScenario'), /renderThreatScenario|threat-scenario-shell|resolveThreatVisualVariant/);
  assert.doesNotMatch(method(game, 'renderBunkerFacility'), /renderThreatScenario|threat-scenario-shell|resolveThreatVisualVariant/);
  assert.match(game, /if \(roomPlayerCountElement\)/);
  assert.match(view, /id="apocalypseContent"/);
  assert.match(view, /id="bunkerContent"/);
  assert.match(view, /id="threatContent"/);
});
