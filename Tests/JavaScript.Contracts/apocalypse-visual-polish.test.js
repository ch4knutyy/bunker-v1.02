const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const settingsModel = fs.readFileSync('Models/Game/Rooms/Settings/RoomGameSettings.cs', 'utf8');

function method(name) {
  const start = game.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const signatureEnd = game.indexOf(') {', start);
  const open = game.indexOf('{', signatureEnd);
  let depth = 0;
  for (let i = open; i < game.length; i += 1) {
    if (game[i] === '{') depth += 1;
    if (game[i] === '}' && --depth === 0) return game.slice(start, i + 1);
  }
  throw new Error(`unclosed ${name}`);
}

test('one inert three-layer ambient root is created idempotently', () => {
  const source = method('ensureApocalypseAmbientRoot');
  assert.match(source, /getElementById\('apocalypseAmbientRoot'\)[\s\S]*if \(ambient\) return ambient/);
  assert.match(source, /aria-hidden[\s\S]*inert = true/);
  for (const layer of ['primary', 'secondary', 'vignette']) assert.match(source, new RegExp(`'${layer}'`));
  assert.match(css, /\.apocalypse-ambient-root\s*\{[^}]*position:\s*fixed[^}]*pointer-events:\s*none[^}]*user-select:\s*none/s);
});

test('all ten themes define distinct ambient and reaction variables', () => {
  const themes = ['extinction-red','storm-blue','biohazard-green','seismic-amber','cosmic-violet','machine-cyan','wasteland-olive','collapse-rust','glitch-magenta','occult-indigo'];
  for (const theme of themes) {
    const blocks = [...css.matchAll(new RegExp(`body\\[data-apocalypse-theme="${theme}"\\] \\{([\\s\\S]*?)\\}`, 'g'))];
    assert(blocks.length, `missing ${theme}`);
    const combined = blocks.map(match => match[1]).join('\n');
    assert.match(combined, /--apocalypse-ambient-primary/);
    assert.match(combined, /--apocalypse-ambient-secondary/);
    assert.match(combined, /--apocalypse-reaction-glow/);
  }
});

test('reaction controller is allowlisted, restartable and clears stale classes', () => {
  const trigger = method('triggerApocalypseVisualReaction');
  const clear = method('clearApocalypseVisualReactions');
  assert.match(trigger, /apocalypseVisualReactionTypes\.includes\(type\)/);
  assert.match(trigger, /return false/);
  assert.match(trigger, /clearTimeout[\s\S]*classList\.remove[\s\S]*classList\.add/);
  assert.match(clear, /clearTimeout[\s\S]*classList\.remove/);
  assert.doesNotMatch(trigger, /dataset.*type|effectProfile|targetId/i);
});

test('canonical events use generic reactions without duplicate handlers', () => {
  assert.equal((game.match(/connection\.on\("ApocalypseEffectActivated"/g) || []).length, 1);
  assert.match(game, /ApocalypseEffectActivated[\s\S]{0,220}triggerApocalypseVisualReaction\('apocalypse-effect'\)/);
  assert.match(game, /CharacteristicRevealed[\s\S]*triggerApocalypseVisualReaction\('characteristic-reveal'/);
  for (const reaction of ['voting-start','voting-result','threat-reveal','round-change']) assert.match(game, new RegExp(`triggerApocalypseVisualReaction\\('${reaction}'`));
  assert.doesNotMatch(method('triggerApocalypseVisualReaction'), /Gameplay\.Effects|EffectProfileId|connection\.invoke/i);
});

test('null render and theme switches clear ambient reaction state', () => {
  const render = method('renderApocalypse');
  assert.match(render, /!apocalypse[\s\S]*clearApocalypseVisualReactions\(\)[\s\S]*clearApocalypseVisualTheme\(\)/);
  assert.match(render, /dataset\.apocalypseTheme !== nextTheme[\s\S]*clearApocalypseVisualReactions\(\)/);
});

test('timer derives warning and critical visuals from canonical remaining time', () => {
  const render = method('renderGameTimer');
  assert.match(render, /remaining <= 15 \? 'critical'/);
  assert.match(render, /remaining <= 60 \? 'warning'/);
  assert.match(render, /timer-paused/);
  assert.match(css, /#publicGameTimer\.timer-warning/);
  assert.match(css, /#publicGameTimer\.timer-critical/);
});

test('effects preference is device-local and does not enter room settings', () => {
  assert.match(game, /bunker-apocalypse-effects-level/);
  assert.match(method('getApocalypseEffectsLevel'), /localStorage\.getItem/);
  assert.match(method('setApocalypseEffectsLevel'), /localStorage\.setItem/);
  assert.doesNotMatch(settingsModel, /ApocalypseEffectsLevel|bunker-apocalypse-effects-level/);
  for (const level of ['off','subtle','atmospheric']) assert.match(css, new RegExp(`data-apocalypse-effects-level="${level}"`));
});

test('motion, mobile, visibility and performance safeguards are present', () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.apocalypse-ambient-layer[\s\S]*animation:\s*none !important/);
  assert.match(css, /@media \(max-width: 768px\)[\s\S]*apocalypse-ambient-layer-secondary/);
  assert.match(game, /visibilitychange[\s\S]*syncDocumentVisibilityEffects/);
  assert.match(css, /apocalypse-ambient-paused[\s\S]*animation-play-state:\s*paused/);
  const visualController = game.slice(game.indexOf('const apocalypseVisualReactionTypes'), game.indexOf('function syncPublicGameSettings'));
  const visualCss = css.slice(css.indexOf('APOCALYPSE VISUAL POLISH V1-F'));
  assert.doesNotMatch(visualController + visualCss, /requestAnimationFrame|WebGLRenderingContext|<canvas[^>]*particle|particle.*setInterval/i);
});

test('visual controller uses safe DOM construction and no alerts or server HTML', () => {
  const controller = [method('ensureApocalypseAmbientRoot'), method('triggerApocalypseVisualReaction'), method('setApocalypseEffectsLevel')].join('\n');
  assert.match(controller, /createElement/);
  assert.doesNotMatch(controller, /innerHTML|insertAdjacentHTML|alert\(|server/i);
});
