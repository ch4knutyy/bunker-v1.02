const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs');
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Director.cs', 'utf8');
const threat = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GMThreats.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
test('director apply delegates to canonical commands', () => {
  for (const name of ['HideRevealedCharacteristic','EliminatePlayer','RestorePlayer','ChangeAdditionalConditionSeverity','RemoveAdditionalCondition','SetGamePaused','SetRoundNumber','ResetRoundReadiness','ClearCurrentVotes','RemoveCurrentVote','ResyncVotingState','GMConfirmForceThreat','GMCancelCurrentThreat','GMRestartCurrentThreat','GMResyncThreatRoom']) assert.match(hub, new RegExp(name));
});
test('threat force retains canonical fingerprint and finalizer pipeline', () => {
  assert.match(hub, /threatFingerprint/); assert.match(threat, /BuildForceThreatPreview/); assert.match(threat, /ForceFinalizeThreatLocked/);
  assert.doesNotMatch(hub, /EffectsApplied\s*=|ForceFinalizeThreatLocked/);
});
test('director UI requires preview confirmation and blocks duplicate submit', () => {
  assert.match(client, /PreviewDirectorAction/); assert.match(client, /directorCommandPending/); assert.match(client, /Undo unavailable/);
});
