const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const gmHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GMThreats.cs', 'utf8');
const threatsHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Threats.cs', 'utf8');
const mutator = fs.readFileSync('Services/Threats/GMThreatStateMutator.cs', 'utf8');
const auditModel = fs.readFileSync('Models/Game/ThreatAuditEntry.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const { readBunkerView } = require('./bunker-view-test-helpers');
const view = readBunkerView();

test('preview is host-authorized, fingerprinted and does not mutate or broadcast room state', () => {
  const preview = gmHub.match(/Task GMPreviewForceThreat[\s\S]*?Task GMConfirmForceThreat/)?.[0] || '';
  assert.match(preview, /GetForceThreatRoom/);
  assert.match(gmHub, /room\.IsHost\(player\)/);
  assert.match(gmHub, /GmCapability\.ManagePublicGameState/);
  assert.match(preview, /BuildForceThreatPreview/);
  assert.doesNotMatch(preview, /ForceFinalizeThreatLocked|_threatAudit\.Append|BroadcastThreatState|_random/);
  assert.match(mutator, /SHA256\.HashData/);
});

test('confirm revalidates eligibility and stale fingerprint under ThreatSyncRoot', () => {
  const confirm = gmHub.match(/Task GMConfirmForceThreat[\s\S]*?public async Task GetGMThreatControlData/)?.[0] || '';
  assert.match(confirm, /lock \(room\.ThreatSyncRoot\)/);
  assert.match(confirm, /CanForceOutcome/);
  assert.match(confirm, /currentPreview\.Fingerprint/);
  assert.match(confirm, /stale_preview/);
  assert.match(confirm, /TryRememberThreatCommand/);
});

test('GM handler delegates to canonical finalizers and never applies player effects itself', () => {
  const confirm = gmHub.match(/Task GMConfirmForceThreat[\s\S]*?public async Task GetGMThreatControlData/)?.[0] || '';
  assert.match(confirm, /ForceFinalizeThreatLocked/);
  for (const forbidden of ['ApplyRadiationFailure', 'ApplyRadiationCondition', 'ApplyAirFilterPlanEffects', 'AdditionalConditionEffects', 'Inventory']) {
    assert.doesNotMatch(confirm, new RegExp(forbidden));
  }
  const forcePipeline = threatsHub.match(/ForceFinalizeThreatLocked[\s\S]*?NotifyReturnedThreatItems/)?.[0] || '';
  assert.match(forcePipeline, /FinalizeRadiationOperationLocked/);
  assert.match(forcePipeline, /FinalizeAirFilterOutcomeLocked/);
  assert.match(forcePipeline, /ThreatAuditEventType\.ForcedSuccess/);
  assert.match(forcePipeline, /ThreatAuditEventType\.ForcedFailure/);
});

test('public projection contains no preview, fingerprint, actor or force metadata', () => {
  const dto = threatsHub.match(/BuildThreatPublicState[\s\S]*?BuildAirFilterPlanChoicePublicState/)?.[0] || '';
  for (const hidden of ['Fingerprint', 'ActorPlayerId', 'ForcedSuccess', 'ForcedFailure', 'GMThreatForcePreview']) {
    assert.doesNotMatch(dto, new RegExp(hidden));
  }
});

test('GM UI requests preview first, renders safe modal and guards double confirm', () => {
  assert.match(view, /id="gmThreatForceSuccess"/);
  assert.match(view, /id="gmThreatForceFailure"/);
  assert.match(view, /id="gmThreatForceModal"/);
  assert.match(client, /connection\.invoke\('GMPreviewForceThreat'/);
  assert.match(client, /connection\.invoke\('GMConfirmForceThreat'/);
  assert.match(client, /if \(gmThreatForcePending \|\| !gmThreatForcePreview\) return/);
  assert.match(client, /GMThreatForceRejected/);
  assert.match(client, /gmThreatForceStale/);
  for (const key of ['gmThreatForceSuccess', 'gmThreatForceFailure', 'gmThreatForcePreviewTitle']) {
    assert.equal((client.match(new RegExp(key, 'g')) || []).length >= 3, true);
  }
});

test('forced audit event types are canonical and existing sync events are reused', () => {
  assert.match(auditModel, /ForcedSuccess/);
  assert.match(auditModel, /ForcedFailure/);
  assert.match(gmHub, /SyncThreatRoom/);
  assert.match(threatsHub, /SendAsync\("ThreatStateUpdated"/);
  assert.match(gmHub, /SendAsync\("GMThreatControlData"/);
  assert.doesNotMatch(gmHub, /SendAsync\("ThreatForceStateUpdated"/);
});
