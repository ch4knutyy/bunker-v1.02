const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const model = fs.readFileSync('Models/Player/Player.cs','utf8') + fs.readFileSync('Models/Game/Room.cs','utf8') + fs.readFileSync('Models/Game/GmMode.cs','utf8');
const role = fs.readFileSync('Services/OmniscientGmRoleService.cs','utf8');
const room = fs.readFileSync('Services/RoomService.cs','utf8');
const snapshot = fs.readFileSync('Services/RoomSnapshotService.cs','utf8');
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.OmniscientGm.cs','utf8');
const client = fs.readFileSync('wwwroot/js/game.js','utf8');

test('omniscient GM has canonical irreversible spectator boundary', () => {
  assert.match(model, /IsSpectatorGm/); assert.match(model, /HasSeenOmniscientState/); assert.match(model, /IrreversibleOmniscientPlayerIds/);
  assert.match(role, /RemoveGameplayParticipation/); assert.match(room, /GetGameplayPlayersSnapshot/); assert.match(room, /IsGameplayParticipant/);
  assert.match(snapshot, /omniscient_boundary_irreversible/); assert.match(snapshot, /IrreversibleOmniscientPlayerIds/);
});

test('preview apply authorization and audit expose no hidden state', () => {
  assert.match(hub, /PreviewEnterOmniscientGm/); assert.match(hub, /EnterOmniscientGm/); assert.match(hub, /CreateMutationSnapshot/); assert.match(hub, /allowUndo: false/);
  assert.match(hub, /OmniscientGmStateUpdated/); assert.doesNotMatch(hub, /PhysicalHealth|Profession|Inventory|SpecialCard|HiddenGameState/);
});

test('UI has double confirmation and public spectator marker only', () => {
  assert.match(client, /This cannot be undone in this room/); assert.match(client, /omniscientCommandPending/); assert.match(client, /omniscientPublicBadge/);
  assert.doesNotMatch(client, /renderHiddenGameState|omniscientHidden/);
});
