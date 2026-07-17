const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const view = fs.readFileSync(path.join(root, 'Views', 'Shared', 'Bunker', '_GmPanel.cshtml'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const hub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.Diagnostics.cs'), 'utf8');

test('diagnostics and audit are host-authorized and use canonical live events', () => {
  assert.match(hub, /room\.IsHost\(caller\)/);
  assert.match(hub, /GmCapability\.ManagePublicGameState/);
  assert.match(hub, /RoomDiagnosticsUpdated/);
  assert.match(hub, /GmAuditLogUpdated/);
  assert.match(hub, /_roomIntegrity\.PreviewAutoFix/);
  assert.match(hub, /_roomIntegrity\.ApplySafeFixes/);
  assert.doesNotMatch(hub, /ThreatAuditEventType/);
});

test('preview is separate from confirmed idempotent apply', () => {
  assert.match(hub, /ProcessedRoomIntegrityCommandIds\.Add\(commandId\)/);
  assert.match(hub, /!confirmed \|\| string\.IsNullOrWhiteSpace\(commandId\)/);
  assert.match(client, /confirm\(t\('gmAutoFixConfirm'\)\)/);
  assert.match(client, /if \(gmDiagnosticsPending \|\| !gmAutoFixPreview\?\.hasChanges/);
});

test('GM diagnostics UI renders safe issues and unified audit without reload', () => {
  for (const id of ['gmDiagnosticsSummary', 'gmDiagnosticsIssues', 'gmRunDiagnostics', 'gmPreviewAutoFix', 'gmApplyAutoFix', 'gmThreatAuditList']) {
    assert.match(view, new RegExp(`id="${id}"`));
  }
  assert.match(client, /connection\.on\("RoomDiagnosticsUpdated"[\s\S]*renderRoomDiagnostics\(\)/);
  assert.match(client, /connection\.on\("GmAuditLogUpdated"[\s\S]*renderUnifiedGmAudit\(\)/);
  assert.match(client, /\[\.\.\.general, \.\.\.threat\]/);
  assert.match(client, /escapeHtml\(message\)/);
});

test('UA RU and EN diagnostics labels exist', () => {
  assert.equal((client.match(/gmRunDiagnostics:/g) || []).length, 3);
  assert.equal((client.match(/gmAutoFixConfirm:/g) || []).length, 3);
  assert.equal((client.match(/gmAuditLog:/g) || []).length, 3);
});
