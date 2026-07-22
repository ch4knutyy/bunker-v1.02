const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = fs.readFileSync('Views/Bunker/Index.cshtml', 'utf8');

function countFunction(name) {
  return (game.match(new RegExp(`function ${name}\\(`, 'g')) || []).length;
}

test('category effects use the single canonical controller and timer owners', () => {
  for (const name of ['triggerApocalypseAmbientEvent', 'clearApocalypseAmbientEvent',
    'startApocalypseAmbientScheduler', 'stopApocalypseAmbientScheduler', 'renderApocalypse']) {
    assert.equal(countFunction(name), 1, `${name} must have one implementation`);
  }
  assert.equal((game.match(/let apocalypseAmbientEventTimer\s*=/g) || []).length, 1);
  assert.equal((game.match(/let apocalypseAmbientSchedulerTimer\s*=/g) || []).length, 1);
  assert.doesNotMatch(game + view, /apocalypseCategoryEventTimer|__categoryEffectsWrapped|installAmbientOverride|installRenderHooks|apocalypse-category-effects\.js/);
});

test('canonical event selection is explicit, allowlisted and weighted 65/35', () => {
  assert.match(game, /categoryBasePercent\s*\?\?\s*65/);
  assert.match(game, /Math\.random\(\) \* 100 >= categoryPercent/);
  assert.match(game, /pools\.all\.includes\(normalizedPreferred\)/);
  assert.match(game, /candidates[\s\S]*registry\.priorityGroups\.map[\s\S]*\.slice\(0, maximum\)/);
  assert.doesNotMatch(game.slice(game.indexOf('function resolveApocalypseCategoryProfile'), game.indexOf('function getApocalypseCategoryEventPools')), /description|Gameplay|EffectProfile|tags/i);
});

test('same-theme changes and cleanup clear modifiers, event classes and the owned timer', () => {
  assert.match(game, /function syncApocalypseCategoryVisualState[\s\S]*clearApocalypseAmbientEvent\(\)[\s\S]*clearApocalypseCategoryVisualState\(\)/);
  assert.match(game, /function clearApocalypseAmbientEvent[\s\S]*clearTimeout\(apocalypseAmbientEventTimer\)[\s\S]*classList\.remove/);
  assert.match(game, /normalized === 'off'[\s\S]*clearApocalypseCategoryVisualState\(\)[\s\S]*stopApocalypseAmbientScheduler\(\)/);
});
