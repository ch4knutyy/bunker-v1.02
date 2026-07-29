const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');
const materialsCss = read('wwwroot/css/bunker-materials.css');
const resolver = read('wwwroot/js/bunker/bunker/material-resolver.js');
const runtime = read('wwwroot/js/bunker/bunker/runtime.js');
const profiles = read('wwwroot/js/bunker/bunker/material-profiles.js');

test('Bunker uses one generic material shell without changing the existing resolver contract', () => {
  const shellStart = materialsCss.lastIndexOf('/*', materialsCss.indexOf('Спільна оболонка гри:'));
  const shellEnd = materialsCss.indexOf('@media (max-width: 900px)', shellStart);
  const shell = materialsCss.slice(shellStart, shellEnd);

  assert.match(shell, /#bunkerContent \.bunker-visual-root \{[\s\S]*--bunker-shell-material-visibility:[\s\S]*--bunker-shell-readability-strength:/);
  assert.match(shell, /\.bunker-hero\.no-image \.bunker-hero-overlay/);
  assert.match(shell, /:is\(\.bunker-instrument-deck, \.bunker-console-deck, \.bunker-footer\)/);
  assert.doesNotMatch(shell, /data-bunker-(?:id|name)|bunker-\d+|filter:\s*brightness/i);
  assert.match(`${resolver}\n${runtime}`, /renderBunkerMaterialLayers\(\)[\s\S]*applyBunkerMaterialPresentation\(theme,/);
  assert.match(profiles, /ceramic|marine|wood|concrete|armored/i);
});
