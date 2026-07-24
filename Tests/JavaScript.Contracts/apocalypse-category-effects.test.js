const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const effects = fs.readFileSync('wwwroot/js/bunker/apocalypse/effects.js', 'utf8');
const helpers = fs.readFileSync('wwwroot/js/bunker/apocalypse/helpers.js', 'utf8');
const state = fs.readFileSync('wwwroot/js/bunker/apocalypse/state.js', 'utf8');
const view = fs.readFileSync('Views/Bunker/Index.cshtml', 'utf8');

const all = game + effects + helpers + state;

function countFunction(name) {
  return (all.match(new RegExp(`function ${name}\\(`, 'g')) || []).length;
}

test('category effects use the single canonical controller and timer owners', () => {
  for (const name of ['triggerApocalypseAmbientEvent', 'clearApocalypseAmbientEvent',
    'startApocalypseAmbientScheduler', 'stopApocalypseAmbientScheduler', 'renderApocalypse']) {
    assert.equal(countFunction(name), 1, `${name} must have one implementation`);
  }
  assert.equal((state.match(/let apocalypseAmbientEventTimer\s*=/g) || []).length, 1);
  assert.equal((state.match(/let apocalypseAmbientSchedulerTimer\s*=/g) || []).length, 1);
  assert.doesNotMatch(all + view, /apocalypseCategoryEventTimer|__categoryEffectsWrapped|installAmbientOverride|installRenderHooks|apocalypse-category-effects\.js/);
});

test('canonical event selection is explicit, allowlisted and weighted 65/35', () => {
  assert.match(effects, /categoryBasePercent\s*\?\?\s*65/);
  assert.match(effects, /Math\.random\(\) \* 100 >= categoryPercent/);
  assert.match(effects, /pools\.all\.includes\(normalizedPreferred\)/);
  assert.match(effects, /candidates[\s\S]*registry\.priorityGroups\.map[\s\S]*\.slice\(0, maximum\)/);
  assert.doesNotMatch(effects.slice(effects.indexOf('function resolveApocalypseCategoryProfile'), effects.indexOf('function getApocalypseCategoryEventPools')), /description|Gameplay|EffectProfile|tags/i);
});

test('same-theme changes and cleanup clear modifiers, event classes and the owned timer', () => {
  assert.match(effects, /function syncApocalypseCategoryVisualState[\s\S]*clearApocalypseAmbientEvent\(\)[\s\S]*clearApocalypseCategoryVisualState\(\)/);
  assert.match(effects, /function clearApocalypseAmbientEvent[\s\S]*clearTimeout\(apocalypseAmbientEventTimer\)[\s\S]*classList\.remove/);
  assert.match(effects, /normalized === 'off'[\s\S]*clearApocalypseCategoryVisualState\(\)[\s\S]*stopApocalypseAmbientScheduler\(\)/);
});
