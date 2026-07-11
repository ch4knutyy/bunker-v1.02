const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const hub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.GMThreats.cs'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');

test('every GM threat command resolves the caller room through host authorization', () => {
  for (const method of ['GMGenerateRandomRareThreat', 'GMGenerateTextThreat', 'GMSelectThreat', 'GMCancelCurrentThreat', 'GMRestartCurrentThreat', 'GMResyncThreatRoom']) {
    const start = hub.indexOf(`public async Task ${method}`);
    const next = hub.indexOf('public async Task ', start + 20);
    const body = hub.slice(start, next < 0 ? undefined : next);
    assert.match(body, /TryGetHostRoom/);
  }
  assert.match(hub, /TryGetHostRoom[\s\S]*IsCallerHost\(\)/);
});

test('rare generation uses only validated explicit specials', () => {
  assert.match(hub, /Where\(IsAvailableSpecialThreat\)/);
  assert.match(hub, /radiation_leak|RadiationLeakThreatId/);
  assert.match(hub, /air_filter_failure|AirFilterFailureThreatId/);
});

test('specific threat selection validates server data and availability', () => {
  assert.match(hub, /_gameData\.Threats\.FirstOrDefault/);
  assert.match(hub, /IsExplicitSpecialThreat\(threat\) && !IsAvailableSpecialThreat\(threat\)/);
});

test('resync emits fresh snapshots without mutating room state', () => {
  const start = hub.indexOf('public async Task GMResyncThreatRoom');
  const body = hub.slice(start, hub.indexOf('private bool TryGetHostRoom', start));
  assert.match(body, /SyncThreatRoom\(room/);
  assert.doesNotMatch(body, /CurrentThreat\s*=|ThreatState\s*=|EffectsApplied\s*=/);
});

test('GM DTO contains public threat metadata but no hidden interaction data', () => {
  const start = hub.indexOf('private object BuildGMThreatControlData');
  const body = hub.slice(start, hub.indexOf('private bool IsAvailableSpecialThreat', start));
  assert.match(body, /currentThreat/);
  assert.match(body, /threats = _gameData\.Threats/);
  for (const hidden of ['TagsSnapshot', 'CorrectAnswers', 'InternalScore', 'RandomModifier', 'DisplayName']) assert.ok(!body.includes(hidden));
});

test('client prevents double submit and requires double replacement confirmation', () => {
  assert.match(client, /if \(gmThreatCommandPending\) return/);
  assert.match(client, /confirm\(message\) && confirm\(/);
  assert.match(client, /GMThreatControlData/);
});
