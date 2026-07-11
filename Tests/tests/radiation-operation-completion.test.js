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
});

test('effects are applied before EffectsApplied and final snapshots', () => {
  const start = hub.indexOf('private async Task FinalizeRadiationOperationAsync');
  const body = hub.slice(start, hub.indexOf('private async Task NotifyReturnedThreatItems', start));
  assert.ok(body.indexOf('ApplyRadiationFailure(room, threatState)') < body.indexOf('Resolution.EffectsApplied = true'));
  assert.ok(body.indexOf('Resolution.EffectsApplied = true') < body.indexOf('miniGame.GetPublicState'));
  assert.ok(body.indexOf('miniGame.GetPublicState') < body.indexOf('SendAsync("ThreatMiniGameUpdated"'));
  assert.ok(body.indexOf('SendAsync("ThreatMiniGameUpdated"') < body.indexOf('BroadcastThreatState'));
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
