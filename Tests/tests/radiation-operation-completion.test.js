const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const hub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.Threats.cs'), 'utf8');
const service = fs.readFileSync(path.join(root, 'Services', 'Threats', 'RadiationLeakMiniGameService.cs'), 'utf8');
const dto = fs.readFileSync(path.join(root, 'Services', 'Threats', 'IThreatMiniGameService.cs'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');

test('all completion paths converge on the idempotent finalizer', () => {
  assert.match(hub, /StartThreatMiniGame[\s\S]*FinalizeRadiationOperationAsync/);
  assert.match(hub, /SubmitThreatMiniGameAnswer[\s\S]*FinalizeRadiationOperationAsync/);
  assert.match(hub, /CheckThreatMiniGameTimeout[\s\S]*FinalizeRadiationOperationAsync/);
  assert.match(hub, /ResolveCurrentThreat[\s\S]*FinalizeRadiationOperationAsync/);
  assert.match(service, /errors > threatState\.OperationScaling\.AllowedErrors/);
  assert.match(hub, /IsRadiationMiniGameTerminalStatus/);
  assert.ok((hub.match(/IsRadiationMiniGameTerminalStatus\(/g) || []).length >= 7);
});

test('normal and forced failure share FinalizeRadiationOperationLocked', () => {
  const normal = hub.match(/private async Task FinalizeRadiationOperationAsync[\s\S]*?private bool FinalizeRadiationOperationLocked/)?.[0] || '';
  const forced = hub.match(/private bool ForceFinalizeThreatLocked[\s\S]*?private async Task NotifyReturnedThreatItems/)?.[0] || '';
  assert.match(normal, /FinalizeRadiationOperationLocked/);
  assert.match(forced, /FinalizeRadiationOperationLocked/);
  const canonical = hub.match(/private bool FinalizeRadiationOperationLocked[\s\S]*?private bool ForceFinalizeThreatLocked/)?.[0] || '';
  assert.match(canonical, /ApplyRadiationFailure\(room, threatState\)/);
  assert.ok(canonical.indexOf('ApplyRadiationFailure(room, threatState)') < canonical.indexOf('Resolution.EffectsApplied = true'));
  assert.ok(canonical.indexOf('Resolution.EffectsApplied = true') < canonical.indexOf('threatState.ThreatStatus = outcome'));
});

test('effects are applied before EffectsApplied and final snapshots', () => {
  const asyncBody = hub.match(/private async Task FinalizeRadiationOperationAsync[\s\S]*?private bool FinalizeRadiationOperationLocked/)?.[0] || '';
  const canonical = hub.match(/private bool FinalizeRadiationOperationLocked[\s\S]*?private bool ForceFinalizeThreatLocked/)?.[0] || '';
  assert.ok(canonical.indexOf('ApplyRadiationFailure(room, threatState)') < canonical.indexOf('Resolution.EffectsApplied = true'));
  assert.ok(canonical.indexOf('Resolution.EffectsApplied = true') < canonical.indexOf('threatState.ThreatStatus = outcome'));
  assert.ok(asyncBody.indexOf('FinalizeRadiationOperationLocked') < asyncBody.indexOf('miniGame.GetPublicState'));
  assert.ok(asyncBody.indexOf('miniGame.GetPublicState') < asyncBody.indexOf('SendAsync("ThreatMiniGameUpdated"'));
  assert.ok(asyncBody.indexOf('SendAsync("ThreatMiniGameUpdated"') < asyncBody.indexOf('BroadcastThreatState'));
});

test('final payload carries status, outcome, score, and refreshed players', () => {
  assert.match(dto, /public string Outcome/);
  assert.match(hub, /players = BuildRoomPlayersPayload\(room\)/);
  assert.match(hub, /player = entry\.Value/);
  assert.match(client, /outcome: miniGame\.outcome \|\| miniGame\.Outcome/);
  assert.match(client, /additionalPhysicalConditions:[\s\S]*AdditionalConditionEffects/);
});

test('final UI uses one server status and a nonzero server progress', () => {
  assert.match(client, /function getRadiationOperationStatus/);
  assert.match(client, /failed: "Операція провалена"/);
  assert.match(client, /if \(isFinal\)[\s\S]*miniGame\.currentIndex[\s\S]*miniGame\.totalQuestions/);
  assert.doesNotMatch(client, /if \(!question\)[\s\S]{0,250}Операція триває/);
});
