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

test('three public scenarios share one full-width section, panel and shell contract', () => {
  assert.match(view, /<section class="scenario-immersive-section"[^>]*aria-labelledby="scenarioSectionTitle"/);
  assert.match(view, /class="game-info-panels scenario-immersive-grid"/);
  for (const panel of ['apocalypse-panel', 'bunker-panel', 'threat-panel']) {
    assert.match(view, new RegExp(`class="[^"]*${panel}[^"]*scenario-immersive-panel|class="[^"]*scenario-immersive-panel[^"]*${panel}`));
  }
  for (const renderer of ['renderApocalypseScenario', 'renderBunkerFacility', 'renderThreatScenario']) {
    const source = method(game, renderer);
    assert.match(source, /scenario-immersive-shell/);
    assert.match(source, /scenario-immersive-hero/);
  }
  assert.match(css, /\.scenario-immersive-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)[^}]*width:\s*100%/);
  assert.match(css, /\.scenario-immersive-panel\s*\{[^}]*grid-column:\s*1\s*\/\s*-1[^}]*margin:\s*0/);
  assert.match(css, /\.scenario-immersive-shell\s*\{[^}]*max-width:\s*none[^}]*margin-inline:\s*0/);
});

test('desktop heroes use one cinematic ratio and can grow with content', () => {
  assert.match(css, /\.scenario-immersive-hero\s*\{[^}]*height:\s*auto[^}]*min-height:\s*clamp\(280px,\s*32vw,\s*460px\)[^}]*aspect-ratio:\s*2\.75\s*\/\s*1/);
  assert.doesNotMatch(css.match(/\.scenario-immersive-hero\s*\{[^}]*\}/)?.[0] || '', /height:\s*\d+px/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.scenario-immersive-hero\s*\{[^}]*aspect-ratio:\s*auto/);
  assert.match(css, /\.apocalypse-hero-content,\s*\.bunker-hero-content,\s*\.threat-hero-content\s*\{[^}]*width:\s*min\(980px,\s*calc\(100%\s*-\s*150px\)\)[^}]*max-width:\s*none/);
});

test('width expansion is local to the scenario section and collapses safely on mobile', () => {
  const section = css.match(/\.scenario-immersive-section\s*\{[^}]*\}/)?.[0] || '';
  const widthBlockStart = css.indexOf('/* Shared cinematic width');
  const widthBlockEnd = css.indexOf('.ready-check-panel', widthBlockStart);
  const widthBlock = css.slice(widthBlockStart, widthBlockEnd);
  assert.match(section, /--scenario-width-bleed:\s*clamp\(\.75rem,\s*2vw,\s*1\.5rem\)/);
  assert.match(section, /margin-inline:\s*calc\(var\(--scenario-width-bleed\)\s*\*\s*-1\)/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.scenario-immersive-section\s*\{[^}]*--scenario-width-bleed:\s*0rem/);
  assert.doesNotMatch(widthBlock, /(?:\.main-content|\.game-container)\s*\{/);
});

test('threat image loses the pattern while fallback keeps a subtle texture', () => {
  assert.match(css, /\.threat-hero\.has-image \.threat-hero-pattern,\s*\.apocalypse-hero\.has-image \.apocalypse-hero-pattern,\s*\.bunker-hero\.has-image \.bunker-hero-pattern\s*\{[^}]*display:\s*none;[^}]*opacity:\s*0;[^}]*background-image:\s*none;/);
  assert.match(css, /\.threat-hero\.no-image \.threat-hero-pattern\s*\{[^}]*opacity:\s*\.12;/);
  assert.match(css, /\.threat-hero-media\s*\{[^}]*z-index:\s*0/);
  assert.match(css, /\.threat-hero-overlay\s*\{[^}]*z-index:\s*1/);
  assert.match(css, /\.threat-hero-pattern\s*\{[^}]*z-index:\s*2/);
  assert.match(css, /\.threat-hero-content\s*\{[^}]*z-index:\s*3/);
});

test('sealed threat privacy and scenario interactions remain unchanged', () => {
  const hidden = method(game, 'renderHiddenThreatScenario');
  assert.match(hidden, /scenario-immersive-shell threat-scenario-shell is-sealed/);
  assert.doesNotMatch(hidden, /model\.|imageUrl|visualVariant|data-(?:id|type|tags)/);
  for (const name of ['renderThreatInteractionPanel', 'renderThreatMiniGamePanel', 'renderAirFilterPlanChoice']) {
    assert.match(game, new RegExp(`function ${name}\\(`));
  }
});
