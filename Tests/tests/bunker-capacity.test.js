const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = fs.readFileSync('Views/Home/Game.cshtml', 'utf8');

test('server uses one absolute validated capacity command', () => {
  const method = hub.match(/Task SetBunkerCapacity[\s\S]*?Task RegenerateBunker/)?.[0] || '';
  assert.match(method, /GmCapability\.ManagePublicGameState/);
  assert.match(method, /BunkerCapacityPolicy\.TryParse/);
  assert.match(method, /room\.Bunker\.Capacity = newCapacity/);
  assert.match(method, /BunkerCapacityUpdated/);
  assert.doesNotMatch(method, /playerCount|Math\.Clamp|\+=/);
  assert.doesNotMatch(hub, /Task UpdateBunkerCapacity/);
});

test('client has number input and no active plus-minus flow', () => {
  assert.match(view, /type="number" min="1" max="99" step="1"/);
  assert.match(client, /if \(bunkerCapacityPending\) return/);
  assert.match(client, /event\.key === 'Enter'/);
  assert.doesNotMatch(client, /function changeBunkerCapacity/);
  assert.doesNotMatch(view, /changeBunkerCapacity/);
});
