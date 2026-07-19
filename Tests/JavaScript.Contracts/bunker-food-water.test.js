const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const gmPanel = fs.readFileSync('wwwroot/js/bunker/gm-panel-v2.js', 'utf8');
const gmView = fs.readFileSync('Views/Shared/Bunker/_GmPanel.cshtml', 'utf8');

test('bunker card renders localized food and water as independent metrics', () => {
  assert.match(game, /supplies:\s*"Їжа",\s*water:\s*"Вода"/);
  assert.match(game, /supplies:\s*"Food",\s*water:\s*"Water"/);
  assert.match(game, /supplies:\s*"Еда",\s*water:\s*"Вода"/);
  assert.match(game, /metric-supplies[\s\S]*t\('supplies'\)/);
  assert.match(game, /metric-water[\s\S]*t\('water'\)/);
});

test('legacy bunker payload falls back to food only when water is absent', () => {
  assert.match(game, /source\.waterMonths \?\? source\.WaterMonths \?\? supplies/);
  assert.doesNotMatch(game, /waterMonths\s*\|\||WaterMonths\s*\|\|/);
});

test('live food and water events update canonical fields without refresh', () => {
  for (const event of ['BunkerSuppliesAdded', 'BunkerSuppliesRemoved', 'BunkerWaterAdded', 'BunkerWaterRemoved', 'BunkerUpdated']) {
    assert.match(game, new RegExp(`connection\\.off\\("${event}"\\)`));
    assert.match(game, new RegExp(`connection\\.on\\("${event}"`));
    assert.match(gmPanel, new RegExp(`"${event}"`));
  }
  assert.match(game, /currentBunker\.waterMonths = water[\s\S]*renderBunker\(currentBunker\)/);
  assert.match(game, /currentBunker\.suppliesMonths = supplies[\s\S]*renderBunker\(currentBunker\)/);
});

test('GM bunker tab exposes food and water actions through canonical hub methods', () => {
  for (const label of ['+ Їжа', '− Їжа', '+ Вода', '− Вода']) assert.ok(gmView.includes(label));
  for (const method of ['AddBunkerSupplies', 'RemoveBunkerSupplies', 'AddBunkerWater', 'RemoveBunkerWater']) {
    assert.match(game, new RegExp(`mutateBunkerResource\\("${method}"`));
  }
  assert.match(game, /connection\.invoke\(method, amount, bunkerResourceCommandId\(\)\)/);
});

test('read-only GM roles cannot see bunker controls', () => {
  assert.match(gmPanel, /if \(tab === "bunker"\) return Boolean\(value\(access, "canManageBunker", "CanManageBunker"\)\)/);
  assert.match(gmPanel, /button\.hidden = !canShowTab\(button\.dataset\.gmTabButton\)/);
  assert.match(gmView, /id="gmScenarioSection" data-gm-tab="bunker"/);
});
