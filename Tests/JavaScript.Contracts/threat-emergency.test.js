const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GMThreats.cs', 'utf8');
const mutator = fs.readFileSync('Services/Bunker/Threats/GMThreatStateMutator.cs', 'utf8');
const threats = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Threats.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const { readBunkerView } = require('./bunker-view-test-helpers');
const view = readBunkerView();

test('abort is terminal, preserves CurrentThreat, and applies no effects', () => {
  const abort = mutator.match(/public static bool Abort[\s\S]*?public static bool Restart/)?.[0] || '';
  assert.match(abort, /ThreatStatus = "aborted"/);
  assert.doesNotMatch(abort, /CurrentThreat = null|EffectsApplied = true|AdditionalCondition/);
  assert.match(abort, /Contributions|new ThreatInteractionState/);
});

test('reset keeps the same threat and clears canonical transient state', () => {
  const reset = mutator.match(/public static bool Restart[\s\S]*?public static bool CanReset/)?.[0] || '';
  assert.match(reset, /CurrentThreat!\.Id/);
  assert.match(reset, /new ThreatInteractionState/);
  assert.doesNotMatch(reset, /CurrentThreat\s*=|Inventory|ProfessionItem|AdditionalCondition/);
  assert.match(mutator, /Resolution\.EffectsApplied/);
});

test('all recovery commands use capability, command ids and canonical sync event', () => {
  assert.match(hub, /GmCapability\.ManagePublicGameState/);
  assert.match(hub, /TryRememberThreatCommand/);
  assert.match(hub, /BroadcastThreatState/);
  assert.match(threats, /SendAsync\("ThreatStateUpdated"/);
  const resync = hub.match(/Task GMResyncThreatRoom[\s\S]*?private async Task<Room\?>/)?.[0] || '';
  assert.doesNotMatch(resync, /CurrentThreat\s*=|ThreatState\s*=|EffectsApplied\s*=/);
});

test('safe public projection contains no internal recovery or secret checks', () => {
  const dto = threats.match(/private object BuildThreatPublicState[\s\S]*?private object BuildAirFilter/)?.[0] || '';
  for (const hidden of ['TagsSnapshot', 'InternalScore', 'RandomModifier']) assert.doesNotMatch(dto, new RegExp(hidden));
  const gmDto = hub.match(/private object BuildGMThreatControlData[\s\S]*?private bool IsAvailableSpecialThreat/)?.[0] || '';
  assert.doesNotMatch(gmDto, /ThreatSyncRoot|ProcessedGmThreatCommandIds/);
});

test('GM emergency UI confirms mutations and guards double submit', () => {
  assert.match(view, /id="gmThreatEmergencyBlock"/);
  assert.match(client, /Поточний прогрес спроби буде очищено/);
  assert.match(client, /Загрозу буде завершено без застосування нових наслідків/);
  assert.match(client, /if \(gmThreatCommandPending\) return/);
  assert.match(client, /canRecoverAttempt/);
});
