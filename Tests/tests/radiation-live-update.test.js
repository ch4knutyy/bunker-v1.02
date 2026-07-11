const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const hub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.Threats.cs'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.GameActions.cs'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');

function method(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unclosed ${name}`);
}

test('radiation snapshot is persisted and built after the condition is added', () => {
  const add = hub.indexOf('TryAddRadiationCondition(');
  const persist = hub.indexOf('_roomService.UpdatePlayer(playerEntry.Key, player)', add);
  const broadcast = hub.indexOf('private async Task BroadcastThreatState');
  assert.ok(add >= 0 && persist > add);
  assert.ok(broadcast >= 0);
  assert.match(hub.slice(broadcast), /players = BuildRoomPlayersPayload\(room\)/);
  assert.match(hub.slice(broadcast), /player = entry\.Value/);
  assert.match(hub.slice(broadcast), /SendAsync\("ThreatStateUpdated"/);
});

test('physical-health reveal carries all additional conditions', () => {
  assert.match(actions, /"PhysicalHealth" => new[\s\S]*additionalConditionEffects = player\.AdditionalConditionEffects/);
});

test('live merge replaces private player state and refreshes public snapshots', () => {
  const merge = method(client, 'mergeThreatPlayerSnapshots');
  assert.match(merge, /roomPlayers\[connectionId\] =/);
  assert.match(merge, /additionalConditionEffects: normalizeAdditionalPhysicalConditions/);
  assert.match(merge, /myPlayerData = normalizePlayer\(privatePlayer\)/);
  const handler = client.slice(client.indexOf('connection.on("ThreatStateUpdated"'), client.indexOf('connection.off("ThreatSupportDiceRolled"'));
  assert.ok(handler.indexOf('mergeThreatPlayerSnapshots(data)') < handler.indexOf('renderCurrentGameUI()'));
});

test('card and table render every condition while the table respects reveal state', () => {
  assert.match(client, /additionalConditionEffects\.map\(effect =>[\s\S]*additional-condition-item/);
  assert.match(client, /conditions\.map\(name => `<span>\+ \$\{escapeHtml\(name\)\}<\/span>`\)\.join\(''\)/);
  const tableCell = method(client, 'renderTableCell');
  assert.match(tableCell, /if \(revealed\)/);
  assert.ok(tableCell.indexOf("renderAdditionalPhysicalConditionsForTable(player)") > tableCell.indexOf('if (revealed)'));
  assert.match(tableCell, /char-hidden/);
});

test('reload and reveal paths normalize the same condition collection', () => {
  assert.ok((client.match(/additionalConditionEffects: normalizeAdditionalPhysicalConditions\(p\.additionalConditionEffects \|\| p\.AdditionalConditionEffects \|\| \[\]\)/g) || []).length >= 3);
  assert.match(client, /info\.data\.additionalConditionEffects \|\| info\.data\.AdditionalConditionEffects/);
  assert.match(client, /sourcePlayer = player\.connectionId === myConnectionId \? myPlayerData : player/);
});
