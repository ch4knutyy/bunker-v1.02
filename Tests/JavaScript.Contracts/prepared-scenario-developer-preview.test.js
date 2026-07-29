const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');
const lobbyHub = read('Hubs', 'BunkerHubGame', 'GameHub.Lobby.cs');
const lobbyState = read('Services', 'Bunker', 'GameFlow', 'LobbyStartService.cs');
const runtime = read('wwwroot', 'js', 'bunker', 'lobby', 'runtime.js');
const images = read('Controllers', 'ScenarioImageController.cs');

test('Developer restores a room-owned prepared scenario without becoming Host', () => {
  const getPreview = lobbyHub.slice(lobbyHub.indexOf('GetPreparedGameScenario'), lobbyHub.indexOf('CancelPreparedGameScenario'));
  assert.match(getPreview, /RequireLobbyMember\(\)[\s\S]*_developerAuthority\.IsDeveloper\(actor\)/);
  assert.doesNotMatch(getPreview, /RequireLobbyHost\(/);
  assert.match(lobbyHub, /PrepareGameScenario[\s\S]*RequireLobbyHost\([\s\S]*CancelPreparedGameScenario[\s\S]*RequireLobbyHost\([\s\S]*StartGameFromLobby[\s\S]*RequireLobbyHost\(/);
  assert.match(lobbyState, /PreparedScenario is \{ Status: "Prepared" or "Stale" \}/);
  assert.match(runtime, /const visible = Boolean\(isDeveloper && \(preparedScenarioPreview \|\| preparationActive \|\| preparedScenarioRestoreError\)\)/);
  assert.match(runtime, /restorePreparedGameScenarioPreview[\s\S]*preparedScenarioRestoreRequest[\s\S]*GetPreparedGameScenario[\s\S]*preparedScenarioRestoreError[\s\S]*clearPreparedGameScenarioPreview/);
  assert.match(runtime, /retryPreparedGameScenarioPreview[\s\S]*restorePreparedGameScenarioPreview[\s\S]*isDeveloper && \(!preparedScenarioPreview \|\| String\(preparedStatus\)\.toLowerCase\(\) === 'stale'\)/);
  assert.match(images, /TryGetDeveloperRoomActor\(room, User, out var actor\)[\s\S]*return new DeveloperRoomResult\(room, actor, null\);/);
});
