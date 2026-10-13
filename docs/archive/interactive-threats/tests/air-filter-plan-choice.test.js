const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const hub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.Threats.cs'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'Models', 'Game', 'Threats', 'ThreatInteractionState.cs'), 'utf8');

test('random modifier is generated once and persisted in threat state', () => {
  assert.match(state, /public int\? RandomModifier/);
  assert.match(hub, /PlanChoice\.RandomModifier \?\?= _random\.Next/);
});

test('effects are guarded and applied once before fresh room snapshot', () => {
  const start = hub.indexOf('private async Task ResolveAirFilterPlanChoice');
  const resolve = hub.slice(start, hub.indexOf('private bool FinalizeAirFilterOutcomeLocked', start));
  const canonicalStart = hub.indexOf('private bool FinalizeAirFilterOutcomeLocked', start);
  const canonical = hub.slice(canonicalStart, hub.indexOf('private PlanChoiceScoreRequest', canonicalStart));
  assert.match(resolve, /if \(state\.Resolution\.EffectsApplied\)/);
  assert.ok(canonical.indexOf('ApplyAirFilterPlanEffects') < canonical.indexOf('EffectsApplied = true'));
  assert.ok(resolve.indexOf('FinalizeAirFilterOutcomeLocked') < resolve.lastIndexOf('BroadcastThreatState'));
});

test('public DTO excludes internal score, random and capability matching', () => {
  const start = hub.indexOf('private object BuildAirFilterPlanChoicePublicState');
  const body = hub.slice(start, hub.indexOf('private object BuildThreatVotePublicInfo', start));
  for (const secret of ['InternalScore', 'RandomModifier', 'TagsSnapshot', 'strongAny', 'relatedAllGroups', 'supportAny']) {
    assert.ok(!body.includes(secret), `${secret} leaked through public DTO`);
  }
  assert.match(body, /solutionGuide/);
  assert.match(body, /requirementsPreview/);
});

test('non-plan-choice threats retain the legacy public flow', () => {
  assert.match(hub, /if \(string\.Equals\(room\.CurrentThreat\?\.Id, AirFilterFailureThreatId[\s\S]*BuildAirFilterPlanChoicePublicState/);
  assert.match(hub, /return new \{ currentThreatId = room\.CurrentThreat\?\.Id \?\? "", threatStatus = threatState\.ThreatStatus \};/);
});

test('client renders guide and requirements without score or capability tags', () => {
  assert.match(client, /function renderAirFilterPlanChoice/);
  assert.match(client, /plan-choice-guide/);
  assert.match(client, /requirementsPreview/);
  const start = client.indexOf('function renderAirFilterPlanChoice');
  const body = client.slice(start, client.indexOf('function getThreatStatusLabel', start));
  assert.ok(!body.includes('capabilityTags'));
  assert.ok(!body.includes('InternalScore'));
});
