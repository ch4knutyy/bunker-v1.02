const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const panel = fs.readFileSync('wwwroot/js/bunker/gm-panel-v2.js', 'utf8');
const runtime = fs.readFileSync('wwwroot/js/bunker/gm/runtime.js', 'utf8');
const bunkerRuntime = fs.readFileSync('wwwroot/js/bunker/bunker/runtime.js', 'utf8');
const threatRuntime = fs.readFileSync('wwwroot/js/bunker/threats/runtime.js', 'utf8');
const styles = [
  'wwwroot/css/game.css',
  'wwwroot/css/character-cards.css',
  'wwwroot/css/bunker-theme.css',
  'wwwroot/css/bunker-materials.css',
  'wwwroot/css/apocalypse-physical-theme.css',
  'wwwroot/css/apocalypse-category-effects.css'
].map(file => fs.readFileSync(file, 'utf8')).join('\n');

test('GM drawer preserves deliberate scroll and game UI contains no stripe layers', () => {
  assert.match(panel, /nearBottom:[\s\S]*<= 48/);
  assert.match(panel, /state\.container\.scrollTop = state\.nearBottom \? maxTop : Math\.min\(state\.top, maxTop\)/);
  assert.match(panel, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(panel, /window\.switchGMTab\(activeGMTab\)/);
  assert.match(runtime, /window\.preserveGmPanelScroll\(render\)/);
  assert.match(styles, /\.gm-panel-v2-content\s*\{[\s\S]*?overflow-y: auto;[\s\S]*?overflow-anchor: none;/);
  assert.match(styles, /\.gm-developer-toolbox\s*\{[\s\S]*?overflow: visible;/);
  assert.doesNotMatch(`${styles}\n${bunkerRuntime}\n${threatRuntime}`, /repeating-linear-gradient|bunker-hero-pattern|threat-hero-pattern|threat-sealed-pattern|vault-characteristic-card::(?:before|after)|--card-(?:frame|stain|fingerprint)-texture/);
});
