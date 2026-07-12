const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..', '..');
const service = fs.readFileSync(path.join(root, 'Services', 'RoomLocalEditorService.cs'), 'utf8');
const hub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.RoomLocalEditor.cs'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'Views', 'Home', 'Game.cshtml'), 'utf8');

test('editor is host-authorized and uses typed allowlist without reflection or threat fields', () => {
  assert.match(hub, /TryGetDiagnosticsRoom/);
  assert.match(service, /Rules = new Dictionary/);
  assert.doesNotMatch(service, /GetProperty|SetValue|PropertyInfo/);
  assert.doesNotMatch(service, /threat_status|effects_applied|selected_plan|operation_leader/);
});

test('hidden player fields require reveal flags and safe DTO excludes inventory/cards', () => {
  assert.match(service, /player\.Revealed\.PhysicalHealth/);
  assert.match(service, /characteristic_hidden/);
  assert.doesNotMatch(service, /player_inventory|player_special/);
});

test('successful edit is linked to snapshot audit integrity and existing live events', () => {
  assert.match(hub, /CreateMutationSnapshot[\s\S]*_roomLocalEditor\.Apply/);
  assert.match(hub, /_roomIntegrity\.Check/);
  assert.match(hub, /AppendGmAudit[\s\S]*room_local_edit/);
  for (const event of ['BunkerChanged', 'ApocalypseChanged', 'RoomPlayersUpdated', 'CharacteristicUpdated']) assert.match(hub, new RegExp(event));
});

test('advanced editor UI is closed by default live localized and guarded', () => {
  assert.match(view, /<details id="gmRoomLocalEditor"/);
  assert.doesNotMatch(view, /<details id="gmRoomLocalEditor"[^>]*open/);
  assert.match(client, /connection\.on\("RoomLocalEditorUpdated"/);
  assert.match(client, /if \(gmRoomLocalEditorPending\) return/);
  assert.equal((client.match(/gmRoomLocalEditor:/g) || []).length, 3);
});
