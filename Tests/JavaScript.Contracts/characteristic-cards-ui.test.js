const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const tooltip = fs.readFileSync('wwwroot/js/tooltip.js', 'utf8');
const stoneTexture = fs.readFileSync('wwwroot/images/ui/character-card-stone.svg', 'utf8');

function cssRule(selector) {
  const start = css.indexOf(selector);
  assert.notEqual(start, -1, `missing CSS identity for ${selector}`);
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

test('one reusable renderer supports all canonical characteristic cards', () => {
  assert.match(game, /function renderCharacteristicCard\(model\)/);
  const personalRenderer = game.slice(game.indexOf('function renderMyPlayerCards'), game.indexOf('function renderEliminatedRevealAllPanel'));
  assert.match(personalRenderer, /models\.map\(renderCharacteristicCard\)/);
  for (const type of ['Personality','Body','Profession','PhysicalHealth','MentalHealth','Hobby','CharacterTrait','Phobia','Inventory','Property','Fact']) {
    assert.match(personalRenderer, new RegExp(`type:'${type}'`));
  }
  assert.match(game, /data-characteristic-type="\$\{escapeHtml\(model\.type\)\}"/);
  assert.doesNotMatch(personalRenderer, /<div class="char-card/);
});

test('profession details and deterministic tag icon priority use safe fallback', () => {
  assert.match(game, /cardExperience[\s\S]*experienceYears/);
  assert.match(game, /cardAdditionalItem[\s\S]*localizedProfessionItem/);
  assert.match(game, /const professionIconRegistry = Object\.freeze/);
	assert.match(game, /const priority = \['violin','string_instrument','guitar'/);
  assert.match(game, /professionIconRegistry\[match\] \|\| professionIconRegistry\.generic/);
  assert.match(game, /capabilityTags: src\.capabilityTags/);
  const card = game.slice(game.indexOf('function renderCharacteristicCard'), game.indexOf('// Рендер карток моїх характеристик'));
  assert.doesNotMatch(card, /capabilityTags|\.tags|Tags/);
  assert.doesNotMatch(card, /<img|https?:\/\//);
});

test('empty details are omitted and long content has responsive wrapping', () => {
  assert.match(game, /\(model\.details \|\| \[\]\)\.filter\(Boolean\)\.slice\(0, 4\)/);
  assert.match(game, /detailRows \? `<div class="vault-card-details/);
  assert.match(css, /\.vault-card-value[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.vault-card-detail \.char-value[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /grid-template-columns:\s*repeat\(3/);
  assert.match(css, /@media \(max-width: 1050px\)[\s\S]*repeat\(2/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
});

test('reveal keeps the existing endpoint and blocks duplicate pending commands', () => {
  assert.match(game, /async function reveal\(characteristicName\)/);
  assert.match(game, /pendingCharacteristicReveals\.has\(characteristicName\)/);
  assert.match(game, /pendingCharacteristicReveals\.add\(characteristicName\)/);
  assert.match(game, /connection\.invoke\("RevealCharacteristic", characteristicName\)/);
  assert.match(game, /CharacteristicRevealed[\s\S]*pendingCharacteristicReveals\.delete/);
  assert.match(game, /CharacteristicHidden[\s\S]*revealed\[charKey\] = false[\s\S]*renderCurrentGameUI/);
});

test('shared delegated portal tooltip provides hover focus tap escape and outside close once', () => {
  assert.match(game, /aria-controls="\$\{tooltipId\}" aria-expanded="false">\?<\/button>/);
  assert.match(tooltip, /document\.addEventListener\('pointerover'/);
  assert.match(tooltip, /document\.addEventListener\('focusin'/);
  assert.match(tooltip, /document\.addEventListener\('click'/);
  assert.match(tooltip, /event\.key === 'Escape'/);
  assert.match(tooltip, /activeTrigger === trigger && Date\.now\(\) - focusOpenedAt >= 250/);
  assert.equal((tooltip.match(/document\.addEventListener\('click'/g) || []).length, 1);
  assert.match(tooltip, /document\.body\.appendChild\(portal\)/);
  assert.match(tooltip, /activeTrigger && !activeTrigger\.isConnected/);
});

test('tooltips are conditional and generic privacy or duplicate content is rejected', () => {
  assert.match(game, /function resolveCharacteristicTooltipContent\(model\)/);
  assert.match(game, /if \(!content\) return null/);
  assert.match(game, /genericPrivacy\.some/);
  assert.match(game, /duplicates\.includes\(normalized\)/);
  assert.match(game, /tooltipContent \? ' has-tooltip' : ''/);
  assert.match(game, /tooltipContent[\s\S]*\? `<span class="characteristic-with-tooltip vault-card-tooltip/);
  assert.match(game, /type:'Personality'[\s\S]*tooltip:''/);
  assert.match(game, /type:'Body'[\s\S]*tooltip:''/);
  assert.match(game, /type:'Profession'[\s\S]*tooltip:profession\.tooltip/);
});

test('physical, mental and additional conditions reuse one shared health tooltip renderer', () => {
  assert.match(game, /function buildSharedHealthTooltip\(source, options = \{\}\)/);
  assert.match(game, /buildAdditionalPhysicalConditionTooltip[\s\S]*buildSharedHealthTooltip\(effect/);
  assert.match(game, /type:'PhysicalHealth'[\s\S]*tooltipHtml:buildSharedHealthTooltip\(physicalHealth/);
  assert.match(game, /type:'MentalHealth'[\s\S]*tooltipHtml:buildSharedHealthTooltip\(mentalHealth/);
  assert.match(game, /options\.requireExplanation && explanatory\.length === 0/);
});

test('health presentation separates a safe severity suffix and semantic variants normalize the full scale', () => {
  assert.match(game, /function buildHealthCardPresentation\(condition\)/);
  assert.match(game, /endsWith\(suffix\.toLocaleLowerCase\(\)\)/);
  assert.match(game, /function resolveCharacteristicVisualVariant\(model\)/);
  for (const pair of [['light','warning-soft'],['medium','warning'],['heavy','severe'],['very-heavy','severe-dark'],['critical','critical']]) {
    assert.match(game, new RegExp(`severity === '${pair[0]}'[\\s\\S]*return '${pair[1]}'`));
  }
  assert.match(game, /return 'neutral'/);
  assert.match(game, /\['dark','violent','criminal','dangerous','disturbing','horror'\]/);
  assert.match(css, /family-mental\.variant-severe/);
  assert.match(css, /variant-severe[\s\S]*--card-surface/);
});

test('shared shell uses variables, fixed geometry, inner border and footer anchoring', () => {
  for (const variable of ['--card-accent','--card-accent-strong','--card-accent-soft','--card-border','--card-inner-border','--card-glow','--card-surface','--card-surface-overlay','--card-stone-texture','--card-stone-opacity','--card-tint','--card-category-wash','--card-pattern','--card-divider','--card-button-border','--card-button-text','--card-medallion-border','--card-medallion-surface']) assert.match(css, new RegExp(variable));
  assert.match(css, /\.vault-characteristic-card::before[\s\S]*background-image:\s*var\(--card-stone-texture\)[\s\S]*mix-blend-mode:\s*soft-light[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.vault-characteristic-card::after[\s\S]*border:\s*1px solid color-mix\(in srgb, var\(--card-inner-border\)[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.vault-characteristic-card > \*\s*\{\s*z-index:\s*1/);
  assert.match(css, /\.vault-characteristic-card\s*\{[\s\S]*?min-height:\s*415px/);
  assert.match(css, /@media \(max-width: 1050px\)[\s\S]*?\.vault-characteristic-card\s*\{\s*min-height:\s*400px/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*?\.vault-characteristic-card\s*\{\s*min-height:\s*340px/);
  assert.match(css, /\.player-cards-grid\s*\{[\s\S]*?align-items:\s*stretch/);
  assert.match(css, /\.vault-card-footer\s*\{[^}]*margin-top:\s*auto/);
  assert.match(css, /\.vault-card-header\.has-tooltip\s*\{\s*padding-inline:\s*0/);
});

test('all eleven card types keep one shell and expose distinct CSS-only identities', () => {
  const types = ['Personality','Body','Profession','PhysicalHealth','MentalHealth','Hobby','CharacterTrait','Phobia','Inventory','Property','Fact'];
  const patterns = new Set();
  const accents = new Set();
  const tints = new Set();
  for (const type of types) {
    const rule = cssRule(`.vault-characteristic-card[data-characteristic-type="${type}"]`);
    assert.match(rule, /--card-accent:/);
    assert.match(rule, /--card-tint:/);
    assert.match(rule, /--card-inner-border:/);
    assert.match(rule, /--card-pattern:linear-gradient\(transparent,transparent\)/);
    assert.match(rule, /--card-divider:/);
    assert.match(rule, /--card-button-border:/);
    assert.match(rule, /--card-medallion-surface:/);
    patterns.add(rule.match(/--card-pattern:([^;]+);/)[1].trim());
    accents.add(rule.match(/--card-accent:([^;]+);/)[1].trim());
    tints.add(rule.match(/--card-tint:([^;]+);/)[1].trim());
    assert.doesNotMatch(rule, /repeating-(?:linear|radial)-gradient/);
  }
  assert.equal(patterns.size, 1);
  assert.equal(accents.size, types.length);
  assert.equal(tints.size, types.length);
  assert.match(css, /background:\s*var\(--card-pattern\),\s*var\(--card-category-wash\),\s*var\(--card-surface-overlay\),\s*var\(--card-surface\)/);
  assert.doesNotMatch(css, /\.vault-characteristic-card\.variant-(?:severe|severe-dark|critical|dark)\s*\{[^}]*--card-pattern:/s);
});

test('stone material, category accent line and layered bevel use one local asset', () => {
  const shell = cssRule('.vault-characteristic-card');
  assert.match(shell, /--card-stone-texture:\s*url\('\/images\/ui\/character-card-stone\.svg'\)/);
  assert.match(shell, /--card-stone-opacity:\s*0\.2/);
  assert.match(shell, /inset 2px 2px 0 color-mix/);
  assert.match(shell, /inset -2px -2px 0 rgba\(0, 0, 0, 0\.72\)/);
  assert.match(shell, /0 20px 44px rgba\(0, 0, 0, 0\.34\)/);
  assert.match(stoneTexture, /<feTurbulence[^>]*type="fractalNoise"/);
  assert.match(stoneTexture, /<path\b/);
  assert.doesNotMatch(stoneTexture, /(?:href|src)="https?:\/\//);
  assert.match(css, /\.vault-characteristic-card::before\s*\{[\s\S]*background-image:\s*var\(--card-stone-texture\)[\s\S]*mix-blend-mode:\s*soft-light[\s\S]*opacity:\s*var\(--card-stone-opacity\)[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.vault-characteristic-card::after\s*\{[\s\S]*inset:\s*7px[\s\S]*border:\s*1px solid color-mix[\s\S]*inset 1px 1px 0[\s\S]*inset -1px -1px 0[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.vault-card-separator\s*\{[^}]*width:\s*76%/);
  assert.match(css, /\.vault-card-separator span\s*\{[^}]*height:\s*2px[^}]*var\(--card-divider\)[^}]*var\(--card-accent-strong\)/);
  assert.match(css, /\.vault-card-separator i\s*\{[^}]*width:\s*8px[^}]*var\(--card-accent-strong\)/);
  assert.match(css, /\.vault-card-icon\s*\{[\s\S]*inset 0 -12px 18px rgba\(0, 0, 0, 0\.48\)[\s\S]*0 7px 16px rgba\(0, 0, 0, 0\.4\)/);
  assert.match(css, /\.vault-card-icon::before\s*\{[\s\S]*pointer-events:\s*none/);
  assert.match(css, /\.vault-card-icon::after\s*\{[\s\S]*pointer-events:\s*none/);
  const privateDeckCss = css.slice(css.indexOf('.vault-characteristic-card {'), css.indexOf('.my-special-card {'));
  assert.doesNotMatch(privateDeckCss, /repeating-(?:linear|radial)-gradient/);
  assert.match(cssRule('.vault-characteristic-card[data-characteristic-type="PhysicalHealth"]'), /--card-accent:#b86d52/);
  assert.doesNotMatch(shell, /data:image|filter:\s*blur/);
});

test('visual impact variants drive the full shell and keep the tooltip out of flow', () => {
  assert.match(css, /\.vault-card-header\s*\{[\s\S]*?position:\s*static/);
  assert.match(css, /\.vault-characteristic-card \.vault-card-tooltip\s*\{[\s\S]*?position:\s*absolute[\s\S]*?top:\s*18px[\s\S]*?right:\s*18px/);
  assert.match(css, /\.vault-card-tooltip \.tooltip-trigger\s*\{[\s\S]*?width:\s*34px[\s\S]*?height:\s*34px/);

  for (const selector of ['variant-severe','family-mental\\.variant-severe','variant-dark','variant-critical']) {
    const rule = new RegExp(`\\.${selector}\\s*\\{[^}]*--card-border:[^;}]+;[^}]*--card-inner-border:[^;}]+;[^}]*--card-glow:[^;}]+;[^}]*--card-surface:[^;}]+;[^}]*--card-surface-overlay:[^;}]+;[^}]*--card-divider:[^;}]+;[^}]*--card-button-border:[^;}]+;`, 's');
    assert.match(css, rule);
  }
  assert.match(css, /\.vault-card-icon\s*\{[\s\S]*?border:\s*1px solid var\(--card-medallion-border\)[\s\S]*?background:\s*var\(--card-medallion-surface\)/);
  assert.match(css, /\.vault-card-reveal\s*\{[\s\S]*?border:\s*1px solid var\(--card-button-border\)[\s\S]*?background:\s*var\(--card-button-surface\)/);
  assert.doesNotMatch(css, /\.vault-card-reveal\s*\{[^}]*background:\s*(?:var\(--color-gold\)|#d8a846)/s);
  assert.match(css, /\.vault-card-detail \.char-label\s*\{\s*color:\s*var\(--card-detail-label\)/);
  assert.match(css, /@media \(prefers-reduced-motion: no-preference\)[\s\S]*variant-critical::after[\s\S]*animation:\s*vault-critical-pulse/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*variant-critical::after\s*\{\s*animation:\s*none/);
});

test('hobby mirrors profession optional details and does not derive tooltip from rows', () => {
  assert.match(game, /experienceYears: source\.experienceYears/);
  assert.match(game, /relatedItem: source\.relatedItem[\s\S]*source\.item/);
  assert.match(game, /function buildHobbyCardDetails\(hobby\)/);
  assert.match(game, /nonEmptyCardDetail\(t\('cardExperience'\), experience\)/);
  assert.match(game, /nonEmptyCardDetail\(t\('cardAdditionalItem'\), item\)/);
  assert.match(game, /type:'Hobby'[\s\S]*details:hobbyCardDetails\.details/);
  assert.match(game, /tooltip:resolveHobbyCardTooltip\(hobby, hobbyCardDetails\.item\)/);
});

test('restaurant tags use local food-service icons and reveal lock is inline svg', () => {
  assert.match(game, /restaurant: 'cloche'/);
  assert.match(game, /hospitality: 'cloche'/);
  assert.match(game, /food_service: 'cloche'/);
  assert.match(game, /chef: 'chefHat'/);
  assert.match(game, /waiter: 'serviceBell'/);
  assert.match(game, /renderCharacteristicIcon\('lock'\)/);
  assert.match(css, /\.vault-card-reveal\.locked::before\s*\{\s*content:none/);
});

test('live snapshot, privacy boundary, localization and room count guard remain intact', () => {
  assert.match(game, /PlayerStateResynced[\s\S]*myPlayerData = normalizedPlayer[\s\S]*tryRenderRunningGameState/);
  assert.match(game, /lobbyGet\(me,\s*'isGameplayParticipant',\s*'IsGameplayParticipant'\) \? 'block' : 'none'/);
  assert.match(game, /cardExperience:'Досвід'/);
  assert.match(game, /cardExperience:'Experience'/);
  assert.match(game, /cardExperience:'Опыт'/);
  assert.match(game, /if \(roomPlayerCountElement\)/);
});
