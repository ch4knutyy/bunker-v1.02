const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');

const cleanImageRule = /\.threat-hero\.has-image \.threat-hero-pattern,\s*\.apocalypse-hero\.has-image \.apocalypse-hero-pattern,\s*\.bunker-hero\.has-image \.bunker-hero-pattern\s*\{([^}]*)\}/;

test('one late safe rule fully disables every revealed hero pattern with an image', () => {
  const body = css.match(cleanImageRule)?.[1] || '';
  assert.match(body, /display:\s*none/);
  assert.match(body, /opacity:\s*0/);
  assert.match(body, /background-image:\s*none/);
  assert.equal((css.match(cleanImageRule) || []).length > 0, true);
  assert.doesNotMatch(css, /(?:threat|apocalypse|bunker)-hero\.has-image \.\w+-hero-pattern\s*\{[^}]*opacity:\s*\.0[1-9]/);
});

test('fallback patterns remain atmospheric and the sealed threat remains neutral', () => {
  assert.match(css, /\.threat-hero\.no-image \.threat-hero-pattern\s*\{[^}]*opacity:\s*\.12/);
  assert.match(css, /\.apocalypse-hero\.no-image \.apocalypse-hero-pattern\s*\{[^}]*opacity:\s*\.14/);
  assert.match(css, /\.bunker-hero\.no-image \.bunker-hero-pattern\s*\{[^}]*opacity:\s*\.14/);
  assert.match(css, /\.threat-sealed-pattern\s*\{[^}]*opacity:\s*\.16[^}]*repeating-linear-gradient/);
  const hiddenStart = game.indexOf('function renderHiddenThreatScenario(');
  const hiddenEnd = game.indexOf('\n}', hiddenStart);
  const hidden = game.slice(hiddenStart, hiddenEnd + 2);
  assert.match(hidden, /threat-scenario-shell is-sealed/);
  assert.doesNotMatch(hidden, /model\.|visualVariant|imageUrl|data-(?:id|type|variant)/);
});

test('shared width shell owns geometry only and cannot paint a grid over images', () => {
  const sharedShell = css.match(/\.scenario-immersive-shell\s*\{([^}]*)\}/g) || [];
  assert.ok(sharedShell.length >= 1);
  for (const rule of sharedShell) {
    assert.doesNotMatch(rule, /background|gradient|z-index|opacity/);
  }
  assert.doesNotMatch(css, /\.scenario-immersive-(?:shell|hero)::(?:before|after)\s*\{/);
  assert.match(css, /\.apocalypse-hero\.has-image\s*\{[^}]*background:\s*var\(--apoc-surface\)/);
});

test('media overlay pattern and content retain the non-negative 0-1-2-3 stack', () => {
  for (const prefix of ['threat', 'apocalypse', 'bunker']) {
    assert.match(css, new RegExp(`\\.${prefix}-hero-media(?:\\s*\\{|[^}]*\\{)[^}]*z-index:\\s*0`, 's'));
    assert.match(css, new RegExp(`\\.${prefix}-hero-overlay\\s*\\{[^}]*z-index:\\s*1`, 's'));
    assert.match(css, new RegExp(`\\.${prefix}-hero-pattern\\s*\\{[^}]*z-index:\\s*2`, 's'));
    assert.match(css, new RegExp(`\\.${prefix}-hero-content\\s*\\{[^}]*z-index:\\s*3`, 's'));
  }
  assert.doesNotMatch(css, /(?:threat|apocalypse|bunker)-(?:hero-media|hero-overlay|hero-pattern|hero-content)[^{]*\{[^}]*z-index:\s*-/);
});

test('existing image state and broken-image fallback handlers stay canonical', () => {
  for (const prefix of ['Threat', 'Apocalypse', 'Bunker']) {
    const handler = game.match(new RegExp(`function handle${prefix}HeroImageError\\(image\\) \\{[\\s\\S]*?\\n\\}`))?.[0] || '';
    assert.match(handler, /classList\.remove\('has-image'\)/);
    assert.match(handler, /classList\.add\('no-image'\)/);
    assert.match(handler, /hero-media'\)\?\.remove\(\)/);
  }
  assert.match(game, /threat-hero \$\{model\.imageUrl \? 'has-image' : 'no-image'\}/);
  assert.match(game, /apocalypse-hero \$\{model\.imageUrl \? 'has-image' : 'no-image'\}/);
  assert.match(game, /bunker-hero \$\{model\.imageUrl \? 'has-image' : 'no-image'\}/);
});

test('width and responsive hero proportions from the previous hotfix are untouched', () => {
  assert.match(css, /\.scenario-immersive-hero\s*\{[^}]*min-height:\s*clamp\(280px,\s*32vw,\s*460px\)[^}]*aspect-ratio:\s*2\.75\s*\/\s*1/);
  assert.match(css, /@media \(max-width:\s*900px\)[\s\S]*?\.scenario-immersive-hero\s*\{[^}]*aspect-ratio:\s*2\.5\s*\/\s*1/);
  assert.match(css, /@media \(max-width:\s*760px\)[\s\S]*?\.scenario-immersive-hero\s*\{[^}]*aspect-ratio:\s*auto/);
});
