const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');
const entry = read('wwwroot/js/bunker/core/entry-performance.js');
const visualRegistries = read('wwwroot/js/bunker/core/visual-theme-registries.js');
const materials = read('wwwroot/js/bunker/bunker/material-assets.js');
const effects = read('wwwroot/js/bunker/apocalypse/effect-assets.js');
const lobbyEvents = read('wwwroot/js/bunker/lobby/signalr-events.js');

test('Bunker entry defers and deduplicates optional visual work', () => {
  assert.match(entry, /Promise\.allSettled\([\s\S]*loadVisualThemeRegistries[\s\S]*loadBunkerMaterialManifest[\s\S]*loadApocalypseEffectManifest/);
  assert.match(entry, /bunkerEntryImagePromises\.has\(normalizedUrl\)[\s\S]*return bunkerEntryImagePromises\.get\(normalizedUrl\)/);
  assert.match(entry, /Math\.min\(3, queue\.length\)/);
  assert.doesNotMatch(visualRegistries, /\nloadVisualThemeRegistries\(\);\s*$/);
  assert.doesNotMatch(`${materials}\n${effects}`, /\nload(?:BunkerMaterial|ApocalypseEffect)Manifest\(\);\s*$/m);
  assert.match(lobbyEvents, /GameStarted\(\)[\s\S]*renderBunkerEntryCore[\s\S]*RejoinSuccess\(\)[\s\S]*renderBunkerEntryCore/);
});
