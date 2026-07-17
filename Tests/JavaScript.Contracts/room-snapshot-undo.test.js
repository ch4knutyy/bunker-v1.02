const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const service = fs.readFileSync(path.join(root, 'Services', 'Bunker', 'Rooms', 'RoomSnapshotService.cs'), 'utf8');
const diagnosticsHub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.Diagnostics.cs'), 'utf8');
const threatHub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.GMThreats.cs'), 'utf8');
const view = fs.readFileSync(path.join(root, 'Views', 'Shared', 'Bunker', '_GmPanel.cshtml'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');

test('snapshot service uses explicit state and excludes runtime room fields', () => {
  const captureState = service.match(/private static RoomSnapshotState CaptureState[\s\S]*?(?=\n    private static void ApplyState)/)?.[0] || '';
  assert.match(service, /new RoomSnapshotState/);
  assert.doesNotMatch(service, /Clone\(room\)/);
  assert.match(service, /player\.ConnectionId = ""/);
  assert.match(service, /restored\.ConnectionId = current\.ConnectionId/);
  assert.doesNotMatch(service, /room\.HostConnectionId\s*=\s*state/);
  assert.doesNotMatch(captureState, /ThreatAuditLog|GmAuditLog|SnapshotHistory|Processed/);
});

test('restore validates topology fingerprint and integrity with safety rollback', () => {
  assert.match(service, /player_topology_changed/);
  assert.match(service, /host_topology_changed/);
  assert.match(service, /snapshot_fingerprint_invalid/);
  assert.match(service, /Safety snapshot before restore/);
  assert.match(service, /_integrity\.Check/);
  assert.match(service, /ApplyState\(room, safety\.State\)/);
  assert.doesNotMatch(service, /Finalize|EffectsApplied\s*=|ThreatAuditEventType/);
});

test('hub exposes one canonical snapshot event and safe resync', () => {
  assert.match(diagnosticsHub, /RoomSnapshotsUpdated/);
  assert.match(diagnosticsHub, /PreviewRoomSnapshotRestore/);
  assert.match(diagnosticsHub, /RestoreRoomSnapshot/);
  assert.match(diagnosticsHub, /UndoLastGmAction/);
  assert.match(diagnosticsHub, /RoomPlayersUpdated/);
  assert.match(diagnosticsHub, /RoundStateUpdated/);
  assert.match(diagnosticsHub, /BunkerChanged/);
  assert.match(diagnosticsHub, /ApocalypseChanged/);
});

test('threat boundaries only create snapshots and retain existing lifecycle calls', () => {
  assert.match(threatHub, /Before threat cancel/);
  assert.match(threatHub, /Before threat restart/);
  assert.match(threatHub, /Before threat replacement/);
  assert.doesNotMatch(threatHub, /AppendGmAudit/);
});

test('snapshot UI is live, localized, confirmed, and prevents double submit', () => {
  for (const id of ['gmSnapshotsSection', 'gmCreateSnapshot', 'gmUndoLastAction', 'gmSnapshotsList', 'gmSnapshotPreview']) {
    assert.match(view, new RegExp(`id="${id}"`));
  }
  assert.match(client, /connection\.on\("RoomSnapshotsUpdated"[\s\S]*renderRoomSnapshots\(\)/);
  assert.match(client, /if \(gmSnapshotCommandPending\) return/);
  assert.match(client, /confirm\(t\('gmSnapshotConfirm'\)\)/);
  assert.match(client, /confirm\(t\('gmSnapshotActiveConfirm'\)\)/);
  assert.equal((client.match(/gmSnapshotsTitle:/g) || []).length, 3);
  assert.equal((client.match(/gmUndoLastAction:/g) || []).length, 3);
});
