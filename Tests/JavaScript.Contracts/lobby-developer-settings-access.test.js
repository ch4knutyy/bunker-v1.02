const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const lobbyRuntime = fs.readFileSync('wwwroot/js/bunker/lobby/runtime.js', 'utf8');
const diagnosticsRuntime = fs.readFileSync('wwwroot/js/bunker/diagnostics/runtime.js', 'utf8');
const lobbyHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Lobby.cs', 'utf8');

test('Developer with server-projected ManageRoom can edit lobby settings without becoming Host', () => {
  assert.match(lobbyRuntime, /function lobbyCanEditGameSettings[\s\S]*lobbyAmCurrentHost[\s\S]*developerState\?\.capabilities[\s\S]*ManageRoom/);
  assert.match(lobbyRuntime, /if \(!canEditSettings\) \{ lobbySettingsDraft = null; lobbySettingsDirty = false/);
  assert.match(lobbyRuntime, /editor\.hidden = !canEditSettings[\s\S]*readOnly\.hidden = canEditSettings/);
  assert.match(lobbyRuntime, /if \(canEditSettings\) \{[\s\S]*renderLobbyApocalypseEditor\(displayed\)/);
  assert.match(diagnosticsRuntime, /typeof renderLobbyGameSetup === 'function'\) renderLobbyGameSetup\(\)/);
  assert.match(lobbyHub, /HasActiveRoomCapability\(room, player, RoomActorCapability\.ManageRoom\)/);
  assert.match(lobbyHub, /ApplyLobbyGameSettings[\s\S]*PreparedScenario[\s\S]*Status = "Stale"[\s\S]*BroadcastLobbyState/);
});
