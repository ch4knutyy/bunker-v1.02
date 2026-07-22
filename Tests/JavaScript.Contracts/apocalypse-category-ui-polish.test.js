const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const registrySource = fs.readFileSync('wwwroot/js/apocalypse-category-visual-registry.js', 'utf8');
const view = fs.readFileSync('Views/Bunker/Index.cshtml', 'utf8');
const css = fs.readFileSync('wwwroot/css/apocalypse-category-effects.css', 'utf8');

test('canonical picker owns grouped batching, counts and stable selection', () => {
  assert.match(game, /function renderLobbyApocalypseEditor[\s\S]*buildLobbyApocalypseGroupedModel/);
  assert.match(game, /filtered\.slice\(0, visibleLimit\)/);
  assert.match(game, /selectedExtras[\s\S]*displayed/);
  assert.match(game, /totalCount[\s\S]*visibleCount[\s\S]*renderedCount[\s\S]*selectedCount/);
  assert.match(game, /group\.visibleCount > 0[\s\S]*group\.selectedCount > 0/);
  assert.match(game, /lobbyApocalypseCollapsedCategoryIds/);
  assert.match(game, /lobbyApocalypseVisibleCount \+= 30/);
  assert.doesNotMatch(game + view, /MutationObserver|apocalypse-category-effects\.js/);
});

test('category presentation uses allowlisted icons and catalog-localized names', () => {
  for (const id of ['armageddon','weather','biological','geological','cosmic','technology','ecological','social','anomaly','supernatural']) assert.match(game, new RegExp(`${id}:`));
  assert.match(game, /resolveApocalypseCategoryIconKey[\s\S]*\|\| 'generic'/);
  assert.match(game, /renderApocalypseCategoryBadge[\s\S]*profile\?\.category\?\._i18n/);
  assert.doesNotMatch(game.slice(game.indexOf('function renderLobbyApocalypseEditor'), game.indexOf('function buildLobbyApocalypseGroupedModel')), /Армагеддон|Погодні|Біологічні|Космічні/);
  assert.doesNotMatch(game.slice(game.indexOf('function renderApocalypseCategoryBadge'), game.indexOf('function clearApocalypseAmbientEvent')), /visualModifierIds.*textContent|rawSvg/i);
});

test('modifier slots are deterministic, independent and suppress contradictions', () => {
  assert.match(game, /apocalypseModifierGroupPriority/);
  assert.match(game, /registry\.priorityGroups\.map/);
  assert.match(game, /drought:[\s\S]*rain-pass[\s\S]*flood-wave/);
  assert.match(game, /frost:[\s\S]*heat-shimmer/);
  for (const slot of ['env','contamination','world']) assert.match(css, new RegExp(`--apoc-mod-${slot}-opacity`));
  assert.doesNotMatch(css, /--apoc-modifier-edge|--apoc-modifier-secondary/);
});

test('registry is deeply frozen and helper arrays are defensive copies', () => {
  const window = {};
  vm.runInNewContext(registrySource, { window });
  const api = window.ApocalypseCategoryVisualRegistry;
  assert(Object.isFrozen(api.registry));
  assert(Object.isFrozen(api.registry.modifierCatalog));
  assert(Object.isFrozen(api.registry.modifierCatalog[0].eventPool));
  const modifier = api.resolveModifier('drought');
  modifier.eventPool.push('test-only');
  assert(!api.resolveModifier('drought').eventPool.includes('test-only'));
  assert.equal((view.match(/apocalypse-category-visual-registry\.js/g) || []).length, 1);
  assert.equal((game.match(/function ensureApocalypseAmbientRoot\(/g) || []).length, 1);
  assert.equal((game.match(/function startApocalypseAmbientScheduler\(/g) || []).length, 1);
  assert.equal((game.match(/function renderApocalypse\(/g) || []).length, 1);
  assert.doesNotMatch(css, /data-apocalypse-id|#[a-z0-9_-]*apocalypse/i);
});
