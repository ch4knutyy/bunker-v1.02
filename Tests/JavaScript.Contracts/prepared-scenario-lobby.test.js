const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = path => fs.readFileSync(path, 'utf8');
const room = read('Models/Game/Rooms/Room.cs');
const state = read('Models/Game/Rooms/PreparedScenarioState.cs');
const lobbyHub = read('Hubs/BunkerHubGame/GameHub.Lobby.cs');
const roomHub = read('Hubs/BunkerHubGame/GameHub.Rooms.cs');
const imageController = read('Controllers/ScenarioImageController.cs');
const client = read('wwwroot/js/bunker/lobby/runtime.js');
const translations = read('wwwroot/js/bunker/i18n/translations.js');

test('prepared scenario is private, stable and reused by the final lobby start', () => {
  assert.match(room, /PreparedScenarioState\? PreparedScenario/);
  assert.match(state, /ApocalypseId[\s\S]*BunkerId[\s\S]*GenerationId[\s\S]*PreparedAtUtc[\s\S]*Status/);
  assert.match(lobbyHub, /PrepareGameScenario\(\)[\s\S]*_developerAuthority\.IsDeveloper\(host\)[\s\S]*room\.PreparedScenario is \{ Status: "Prepared" \}[\s\S]*return BuildPreparedScenarioPreview/);
  assert.match(lobbyHub, /room\.Apocalypse = settings\.ApocalypseEnabled[\s\S]*room\.Bunker = settings\.BunkerScenarioEnabled[\s\S]*PreparedScenarioFingerprint/);
  assert.match(lobbyHub, /GetPreparedGameScenario\(\)[\s\S]*_developerAuthority\.IsDeveloper\(host\)/);
  assert.match(roomHub, /_apocalypseSelection\.ResolveForStart\(room, settings, _random\.Next\)/);
  assert.match(imageController, /if \(room\.State != RoomState\.Lobby\)[\s\S]*ApocalypseImageUpdated[\s\S]*if \(room\.State != RoomState\.Lobby\)[\s\S]*BunkerImageUpdated/);
  assert.match(client, /PrepareGameScenario[\s\S]*GetPreparedGameScenario[\s\S]*scenarioPreparationWaiting/);
  for (const key of ['prepareGame', 'preparedScenarioTitle', 'scenarioPreparationWaiting', 'startWithFallbackConfirm']) assert.equal((translations.match(new RegExp(`${key}:`, 'g')) || []).length, 3);
});
