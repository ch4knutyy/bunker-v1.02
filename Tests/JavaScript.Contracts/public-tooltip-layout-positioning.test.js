const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');
const overview = read('wwwroot/js/bunker/public-overview/runtime.js');
const tooltip = read('wwwroot/js/tooltip.js');
const tooltipCss = read('wwwroot/css/tooltip.css');
const gameCss = read('wwwroot/css/game.css');

test('public tooltip uses separated content blocks and a viewport-safe shared portal', () => {
  assert.match(overview, /public-tooltip-header[\s\S]*<p class="public-tooltip-description">/);
  assert.match(overview, /public-tooltip-detail-row/);
  assert.match(overview, /source\.description[\s\S]*source\.gameEffect[\s\S]*source\.bunkerEffect/);
  assert.match(tooltip, /header = document\.querySelector\('\.main-header'\)[\s\S]*safeTop/);
  assert.match(tooltip, /canFitRight[\s\S]*canFitLeft[\s\S]*canFitAbove[\s\S]*canFitBelow/);
  assert.match(tooltip, /is-public-characteristic-tooltip[\s\S]*is-detailed-tooltip/);
  assert.match(tooltipCss, /z-index: var\(--z-tooltip-overlay, 3000\)/);
  assert.match(gameCss, /grid-template-columns: minmax\(112px, auto\) minmax\(0, 1fr\)[\s\S]*word-break: normal/);
  assert.doesNotMatch(gameCss.slice(gameCss.indexOf('.public-tooltip-detail-label'), gameCss.indexOf('.public-tooltip-description')), /overflow-wrap:\s*anywhere|break-all/);
});
