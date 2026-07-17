const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const tooltip = fs.readFileSync('wwwroot/js/tooltip.js', 'utf8');

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

test('one universal special-card renderer owns the complete accessible shell', () => {
  assert.match(game, /function renderSpecialCard\(model\)/);
  assert.match(game, /cards\.map\(\(card, index\) => renderSpecialCard\(buildSpecialCardModel\(card, index\)\)\)/);
  const renderer = method(game, 'renderSpecialCard');
  for (const className of ['special-card-shell','special-card-header','special-card-icon-zone','special-card-category','special-card-title','special-card-divider','special-card-effect','special-card-meta','special-card-footer']) assert.match(renderer, new RegExp(className));
  assert.match(renderer, /model\.name/);
  assert.match(renderer, /model\.effect/);
  assert.match(renderer, /model\.statusLabel/);
  assert.match(renderer, /renderSpecialCardControls/);
  assert.match(renderer, /metaRows \? `<div class="special-card-meta/);
  assert.doesNotMatch(renderer, /model\.id|effectType|tags/);
});

test('semantic resolver maps canonical metadata and falls back to neutral', () => {
  const source = method(game, 'resolveSpecialCardVisualVariant');
  const resolve = new Function(`${source}; return resolveSpecialCardVisualVariant;`)();
  const cases = [
    ['reveal', { effectType:'forceRevealProfession' }], ['protect', { effectType:'protectInventoryFromSteal' }],
    ['steal', { effectType:'silentStealRandomInventoryItem' }], ['swap', { effectType:'swapBodyWithTarget' }],
    ['reroll', { effectType:'rerollTargetSelectedCharacteristic' }], ['global', { category:'all_players' }],
    ['threat', { targetType:'threat' }], ['inventory', { effectType:'peekInventory' }], ['change', { effectType:'copyTargetHobby' }]
  ];
  for (const [expected, model] of cases) assert.equal(resolve(model), expected);
  assert.equal(resolve({ effectType:'unclassifiedAction' }), 'neutral');
  assert.doesNotMatch(source, /name|description/i);
});

test('icons are local inline SVG with fallback and no emoji final icon', () => {
  assert.match(game, /const specialCardIconSvgRegistry = Object\.freeze/);
  for (const icon of ['star','eye','shield','hand','swap','dice','refresh','globe','warning','backpack','briefcase','heart','brain']) assert.match(game, new RegExp(`${icon}:`));
  assert.match(game, /specialCardIconSvgRegistry\[iconKey\] \|\| specialCardIconSvgRegistry\.star/);
  assert.match(game, /aria-hidden="true"/);
  assert.doesNotMatch(method(game, 'renderSpecialCardIcon'), /https?:|<img|[🎲🛡️👁️⭐]/u);
});

test('available pending used and unavailable states reuse the existing endpoint safely', () => {
  assert.match(game, /const pendingSpecialCardUses = new Set\(\)/);
  assert.match(game, /if \(pendingSpecialCardUses\.has\(pendingKey\)\) return/);
  assert.match(game, /pendingSpecialCardUses\.add\(pendingKey\)[\s\S]*connection\.invoke\("UseSpecialCardById"/);
  assert.match(game, /\.finally\(\(\) => \{[\s\S]*pendingSpecialCardUses\.delete/);
  assert.match(game, /model\.isPending[\s\S]*disabled aria-disabled="true"/);
  assert.match(game, /model\.isUsed[\s\S]*cardWasUsed/);
  assert.match(game, /model\.isUnavailable[\s\S]*unavailableNow/);
  assert.doesNotMatch(method(game, 'renderSpecialCardControls'), /beforeVoting|PreVotingReadyCheck|RoundReveal/);
});

test('target selection is conditional, stable across rerender and exposes no connection ids', () => {
  assert.match(game, /const specialCardSelectionState = new Map\(\)/);
  assert.match(game, /function rememberSpecialCardSelection/);
  assert.match(game, /let renderedSpecialCardKeys = \[\]/);
  assert.match(game, /captureSpecialCardSelections\(\)/);
  assert.match(game, /renderedSpecialCardKeys = cards\.map/);
  assert.match(game, /normalized\.requiresTarget \? `<label class="special-card-target-block/);
  assert.match(game, /<option value="\$\{index\}"/);
  assert.doesNotMatch(method(game, 'renderSpecialCardControls'), /option value="\$\{escapeHtml\(connectionId\)\}/);
  assert.match(game, /selectedTarget\?\.connectionId[\s\S]*connection\.invoke\("UseSpecialCardById"/);
});

test('tooltip is conditional and reuses the single delegated portal', () => {
  assert.match(game, /function resolveSpecialCardTooltipContent/);
  assert.match(game, /const tooltip = model\.tooltip \?/);
  assert.match(game, /duplicates\.includes\(normalized\)/);
  assert.match(tooltip, /document\.addEventListener\('pointerover'/);
  assert.match(tooltip, /document\.addEventListener\('focusin'/);
  assert.match(tooltip, /document\.addEventListener\('click'/);
  assert.equal((tooltip.match(/document\.addEventListener\('click'/g) || []).length, 1);
});

test('shared CSS variables provide rare variants and responsive geometry', () => {
  for (const variable of ['--special-accent','--special-accent-strong','--special-border','--special-inner-border','--special-surface','--special-glow','--special-divider','--special-button-border','--special-button-text','--special-medallion']) assert.match(css, new RegExp(variable));
  for (const variant of ['reveal','protect','steal','swap','reroll','change','global','threat','inventory']) assert.match(css, new RegExp(`special-card-shell\\.variant-${variant}`));
  assert.match(css, /\.special-card-shell\s*\{[\s\S]*min-height:390px[\s\S]*display:flex[\s\S]*flex-direction:column/);
  assert.match(css, /\.special-card-shell::before[\s\S]*var\(--special-inner-border\)[\s\S]*pointer-events:none/);
  assert.match(css, /\.special-card-footer\s*\{[^}]*margin-top:auto/);
  assert.match(css, /@media \(max-width: 1050px\)[\s\S]*my-special-cards-list[^}]*repeat\(2/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*my-special-cards-list[^}]*grid-template-columns:\s*1fr/);
  assert.match(css, /special-card-use-btn[^}]*min-height:48px/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*special-card-shell/);
});

test('privacy and live rerender boundaries remain explicit', () => {
  assert.match(game, /buildSpecialCardRows\(\)[\s\S]*filter\(row => row && !row\.isHidden/);
  assert.match(game, /SpecialCardStateUpdated[\s\S]*normalizeSpecialCards[\s\S]*renderCurrentGameUI/);
  assert.match(game, /PlayerStateResynced[\s\S]*myPlayerData = normalizedPlayer[\s\S]*tryRenderRunningGameState/);
  assert.match(game, /if \(roomPlayerCountElement\)/);
});
