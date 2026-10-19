const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const runtime = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'lobby', 'runtime.js'), 'utf8');
const events = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'lobby', 'signalr-events.js'), 'utf8');
const hub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.Chat.cs'), 'utf8');

test('adding lobby AI reaches the server and lobby rendering has no server-side identifier', () => {
  assert.doesNotMatch(runtime, /AiConversationCoordinator/);
  assert.match(runtime, /connection\.invoke\('AddAiPlayers', Math\.max\(1, Math\.floor\(count\)\)\)/);
  assert.match(hub, /public async Task AddAiPlayers\(int count\)[\s\S]*?_aiParticipants\.Add\(room, count\)[\s\S]*?BroadcastAiParticipants\(room\)/);
  assert.match(events, /connection\.on\("LobbyStateUpdated"[\s\S]*?renderLobbyState\(\)/);
  assert.match(hub, /BroadcastAiParticipants\(Room room\)[\s\S]*?RoomPlayersUpdated[\s\S]*?BroadcastLobbyState\(room\)/);
});
