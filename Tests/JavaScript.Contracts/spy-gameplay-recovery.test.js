const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const service = fs.readFileSync('Services/Spy/SpyRoomService.cs', 'utf8');
const hub = fs.readFileSync('Hubs/SpyHubGame/SpyHub.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/spy.js', 'utf8');
const view = fs.readFileSync('Views/Spy/Index.cshtml', 'utf8');

test('Spy lifecycle keeps dangerous actions authoritative, recoverable, and localized', () => {
  assert.match(hub, /KickSpyPlayer[\s\S]*_spyRooms\.KickPlayer[\s\S]*SpyPlayerKicked/);
  assert.match(service, /if \(!IsHost\(room, actor\)\)[\s\S]*RememberCommand\(room, commandId\)[\s\S]*spySnapshotBeforeKick/);
  assert.match(service, /PreviewRestore[\s\S]*ValidateSnapshot[\s\S]*RestoreSnapshot[\s\S]*spySnapshotSafety/);
  assert.match(service, /Fingerprint\(snapshot\.State\)[\s\S]*HostTopologyPlayerId[\s\S]*PlayerTopologyIds/);
  assert.match(service, /locationName = room\.IsRoundActive && !isCurrentSpy[\s\S]*revealedSpyName = spyPlayer\?\.Name/);
  assert.ok(client.includes('confirm(t("confirmKick"') &&
    client.includes('pendingCommands.has(action)') && client.includes('validRestorePreview'));
  assert.ok(view.includes('spyRecovery') && view.includes('spySnapshotPreview') &&
    client.includes('kick: "Вигнати"') && client.includes('kick: "Kick"') && client.includes('kick: "Выгнать"'));
});
