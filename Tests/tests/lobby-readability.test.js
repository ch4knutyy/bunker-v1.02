const test = require('node:test'); const assert = require('node:assert/strict'); const fs = require('node:fs');
const client = fs.readFileSync('wwwroot/js/game.js','utf8'); const view = fs.readFileSync('Views/Home/Game.cshtml','utf8'); const css = fs.readFileSync('wwwroot/css/game.css','utf8');
test('UA RU EN lobby labels use localization keys', () => {
  for (const key of ['lobbyActivePlayers','lobbySpectators','lobbyReadySummary','lobbyRoomState','lobbyRoleHostPlayer','lobbyCheckReadiness']) {
    assert.match(client, new RegExp(`${key}:`));
  }
  assert.match(client, /localizeLobbyLifecycle/); assert.match(client, /localizeLobbyRole/); assert.match(view, /data-lobby-i18n/);
});
test('blocker codes are mapped and never inserted as visible text', () => {
  for (const code of ['minimum_gameplay_players','connected_members_not_ready','invalid_lobby_role','active_voting','active_threat','not_current_host']) assert.match(client, new RegExp(code));
  assert.match(client, /lobbyBlockFallback/); assert.doesNotMatch(client, /escapeHtml\(String\(blocker\)\)/);
});
test('lobby uses one member surface and lifecycle visibility', () => {
  assert.equal((view.match(/id="lobbyMembers"/g) || []).length, 1); assert.equal((view.match(/id="roomPlayersList"/g) || []).length, 1);
  assert.match(client, /roomPlayersList'\)\.style\.display = lifecycle === 'Lobby' \? 'none'/);
  assert.match(client, /focusedKey/); assert.match(client, /connection\.off\("LobbyStateUpdated"\)/);
});
test('responsive hierarchy defines 2x2 summaries and touch controls', () => {
  assert.match(css, /max-width: 768px[\s\S]*#lobbySummary[\s\S]*repeat\(2/); assert.match(css, /min-height: 44px/); assert.match(css, /overflow-wrap: anywhere/);
});
