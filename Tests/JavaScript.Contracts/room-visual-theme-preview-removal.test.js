const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');
const roomView = read('Views/Bunker/Index.cshtml');
const effectAssets = read('wwwroot/js/bunker/apocalypse/effect-assets.js');
const materialAssets = read('wwwroot/js/bunker/bunker/material-assets.js');
const registries = read('wwwroot/js/bunker/core/visual-theme-registries.js');

test('room page removes the visual theme preview while retaining game theme infrastructure', () => {
  assert.doesNotMatch(roomView, /Visual Theme Preview|apocalypseEffectPreview|visual-theme-preview|HostEnvironment/);
  assert.doesNotMatch(roomView, /bunker\/visual-preview\.js/);
  assert.doesNotMatch(effectAssets, /initApocalypseEffectPreview|apocalypseEffectPreview/);
  assert.doesNotMatch(materialAssets, /initVisualThemePreview/);
  assert.match(roomView, /core\/visual-theme-registries\.js/);
  assert.match(roomView, /bunker\/material-assets\.js/);
  assert.match(registries, /VisualThemeRegistry|BunkerMaterialRegistry/);
});
