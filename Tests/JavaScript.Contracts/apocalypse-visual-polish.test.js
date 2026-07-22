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

test('one inert five-layer ambient root is created idempotently', () => {
  const source = method('ensureApocalypseAmbientRoot');
  assert.match(source, /getElementById\('apocalypseAmbientRoot'\)[\s\S]*if \(!ambient\)[\s\S]*querySelector[\s\S]*continue/);
  assert.match(source, /aria-hidden[\s\S]*inert = true/);
  for (const layer of ['primary', 'secondary', 'edge-back', 'edge-front', 'vignette']) assert.match(source, new RegExp(`'${layer}'`));
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

test('environmental scheduler is rare, theme-allowlisted and lifecycle-safe', () => {
  const start = method('startApocalypseAmbientScheduler');
  const stop = method('stopApocalypseAmbientScheduler');
  const trigger = method('triggerApocalypseAmbientEvent');
  const gate = method('canRunApocalypseEnvironmentalEffects');
  const themes = ['extinction-red','storm-blue','biohazard-green','seismic-amber','cosmic-violet','machine-cyan','wasteland-olive','collapse-rust','glitch-magenta','occult-indigo'];
  for (const theme of themes) assert.match(game, new RegExp(`'${theme}': Object\\.freeze\\(\\[`));
  assert.match(start, /apocalypseAmbientSchedulerTimer[\s\S]*20000[\s\S]*20001[\s\S]*setTimeout/);
  assert.match(stop, /clearTimeout[\s\S]*clearApocalypseAmbientEvent/);
  assert.match(trigger, /pools\.all\.includes\(normalizedPreferred\)[\s\S]*classList\.add/);
  assert.match(gate, /dataset\.apocalypseTheme[\s\S]*document\.hidden[\s\S]*prefersReducedApocalypseMotion/);
  assert.doesNotMatch(start + stop + trigger, /setInterval|currentApocalypse|\.name|\.Name/);
  assert.match(method('renderApocalypse'), /startApocalypseAmbientScheduler/);
  assert.match(method('clearApocalypseVisualTheme'), /stopApocalypseAmbientScheduler/);
});

test('parallax is input-throttled, bounded and disabled on mobile', () => {
  const init = method('initApocalypseParallaxManager');
  const queue = method('queueApocalypseParallaxUpdate');
  const flush = method('flushApocalypseParallax');
  assert.match(init, /apocalypseParallaxInitialized[\s\S]*pointermove[\s\S]*scroll[\s\S]*resize/);
  assert.match(queue, /apocalypseParallaxTimer[\s\S]*setTimeout\(flushApocalypseParallax, 48\)/);
  for (const variable of ['--apoc-parallax-x','--apoc-parallax-y','--apoc-parallax-scroll']) assert.match(flush, new RegExp(variable));
  assert.match(flush, /max-width: 768px[\s\S]*resetApocalypseParallax/);
  assert.doesNotMatch(init + queue + flush, /setInterval|requestAnimationFrame/);
});

test('canonical apocalypse reveal wave is duplicate-safe and reconnect does not replay it', () => {
  const reveal = method('triggerApocalypseCardRevealWave');
  assert.match(reveal, /lastApocalypseCardRevealKey[\s\S]*return false[\s\S]*apoc-card-reveal-wave/);
  assert.match(game, /ApocalypseChanged[\s\S]{0,520}triggerApocalypseCardRevealWave\(apocalypse\)/);
  const rejoinStart = game.indexOf('connection.on("RejoinSuccess"');
  const rejoinEnd = game.indexOf('\n\tconnection.off(', rejoinStart);
  assert.doesNotMatch(game.slice(rejoinStart, rejoinEnd), /triggerApocalypseCardRevealWave/);
  assert.match(method('renderApocalypse'), /!apocalypse[\s\S]*clearApocalypseCardRevealWave\(\{ resetKey: true \}\)/);
});

test('edge contamination, card shimmer and effects levels have static fallbacks', () => {
  for (const layer of ['edge-back','edge-front']) assert.match(css, new RegExp(`apocalypse-ambient-layer-${layer}`));
  for (const variable of ['--apocalypse-edge-back','--apocalypse-edge-front']) assert.match(css, new RegExp(variable));
  assert.match(css, /#apocalypsePanel \.apocalypse-card-border-light[\s\S]*apocalypse-card-border-sweep/);
  assert.match(css, /apoc-card-reveal-wave[\s\S]*apocalypse-card-reveal-wave/);
  assert.match(css, /data-apocalypse-effects-level="off"[\s\S]*apocalypse-ambient-layer-edge-back[\s\S]*apocalypse-card-border-light/);
  assert.match(css, /data-apocalypse-effects-level="subtle"[\s\S]*--apoc-event-strength/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*apocalypse-card-border-light[\s\S]*animation:\s*none !important/);
});

test('visual controller uses safe DOM construction and no alerts or server HTML', () => {
  const controller = [method('ensureApocalypseAmbientRoot'), method('triggerApocalypseVisualReaction'), method('setApocalypseEffectsLevel')].join('\n');
  assert.match(controller, /createElement/);
  assert.doesNotMatch(controller, /innerHTML|insertAdjacentHTML|alert\(|server/i);
});
