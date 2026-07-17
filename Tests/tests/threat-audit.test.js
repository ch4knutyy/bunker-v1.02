const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const model = fs.readFileSync('Models/Game/Threats/ThreatAuditEntry.cs', 'utf8');
const service = fs.readFileSync('Services/Bunker/Threats/ThreatAuditService.cs', 'utf8');
const gmHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GMThreats.cs', 'utf8');
const threatsHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Threats.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const { readBunkerView } = require('./bunker-view-test-helpers');
const view = readBunkerView();

test('canonical audit is bounded, sequenced, clocked and locked on ThreatSyncRoot', () => {
  assert.match(service, /MaxEntriesPerRoom = 200/);
  assert.match(service, /lock \(room\.ThreatSyncRoot\)/);
  assert.match(service, /\+\+room\.NextThreatAuditSequenceId/);
  assert.match(service, /timeProvider\.GetUtcNow\(\)/);
  assert.match(service, /RemoveRange\(0, overflow\)/);
});

test('all required transitions are represented while resync writes no audit row', () => {
  for (const name of ['Revealed', 'AttemptStarted', 'AttemptReset', 'Aborted', 'CompletedSuccess', 'CompletedFailure', 'EffectsApplied']) {
    assert.match(model, new RegExp(name));
  }
  assert.match(gmHub, /GMCancelCurrentThreat[\s\S]*ThreatAuditEventType\.Aborted/);
  assert.match(gmHub, /GMRestartCurrentThreat[\s\S]*ThreatAuditEventType\.AttemptReset/);
  const resync = gmHub.match(/GMResyncThreatRoom[\s\S]*?private async Task<Room\?>/)?.[0] || '';
  assert.doesNotMatch(resync, /_threatAudit\.Append/);
  assert.match(threatsHub, /ThreatAuditEventType\.EffectsApplied/);
});

test('audit is exposed only through the existing GM control payload', () => {
  assert.match(gmHub, /GMThreatControlData/);
  assert.match(gmHub, /auditLog = _threatAudit\.GetRecent\(room\)/);
  assert.doesNotMatch(threatsHub.match(/BuildThreatPublicState[\s\S]*?BuildAirFilter/)?.[0] || '', /auditLog|ThreatAudit/);
  assert.doesNotMatch(model.match(/record ThreatAuditEntryDto[\s\S]*/)?.[0] || '', /CommandId/);
});

test('GM history UI localizes, escapes, limits and renders server timestamps', () => {
  assert.match(view, /id="gmThreatAudit"/);
  assert.match(view, /id="gmThreatAuditList"/);
  assert.match(client, /function renderGMThreatAudit\(\)/);
  assert.match(client, /slice\(0, 20\)/);
  assert.match(client, /toLocaleTimeString/);
  assert.match(client, /escapeHtml\(name\)/);
  for (const key of ['gmThreatHistory', 'gmThreatHistoryEmpty', 'gmThreatEventEffectsApplied']) {
    assert.equal((client.match(new RegExp(key, 'g')) || []).length >= 3, true);
  }
});
