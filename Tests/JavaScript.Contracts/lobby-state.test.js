const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs');
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Lobby.cs','utf8');
const rooms = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Rooms.cs','utf8');
const dto = fs.readFileSync('Models/Game/Lobby/LobbyState.cs','utf8');
const client = fs.readFileSync('wwwroot/js/game.js','utf8');
test('lobby uses one safe canonical event and preview-token start', () => {
  assert.match(hub,/LobbyStateUpdated/); assert.match(hub,/PreviewStartGameFromLobby/); assert.match(hub,/StartGameFromLobby/);
  assert.match(rooms,/lobby_preview_required/); assert.doesNotMatch(dto,/ConnectionId|HostToken|Inventory|Property|SpecialCard|Profession/);
});
test('character generation is deferred and excludes spectators', () => {
  assert.match(rooms,/room\?\.State == RoomState\.Lobby/); assert.match(rooms,/GetGameplayPlayersSnapshot\(room\)/);
});
test('client lobby is live and hides gameplay until running', () => {
  assert.match(client,/LobbyStateUpdated/); assert.match(client,/PreviewStartGameFromLobby/); assert.match(client,/StartGameFromLobby/);
  assert.match(client,/game\.style\.display = 'none'/); assert.match(client,/mine\.style\.display = 'none'/);
});
