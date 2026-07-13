const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const lobbyHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Lobby.cs', 'utf8');
const roomsHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Rooms.cs', 'utf8');
const gameMasterHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');

test('lobby start uses one ordered canonical running handoff', () => {
  const start = lobbyHub.slice(lobbyHub.indexOf('public async Task StartGameFromLobby'));
  assert.ok(start.indexOf('PrepareLobbyGameplayCharacters(room)') < start.indexOf('_roomService.StartGame(room.Id'));

  const handoff = roomsHub.slice(roomsHub.indexOf('private async Task CompleteLobbyStart'));
  const ordered = [
    'BroadcastLobbyState(room)',
    'SendPersonalPlayerSnapshot(currentConnectionId, player',
    'BroadcastOmniscientStateToAuthorizedSpectators(room)',
    '"RoomPlayersUpdated"',
    '"RoundStateUpdated"',
    '"BunkerChanged"',
    '"ApocalypseChanged"',
    'SendPlayerHostControlData(room)',
    '"GameStarted"'
  ];
  let cursor = -1;
  for (const token of ordered) {
    const next = handoff.indexOf(token, cursor + 1);
    assert.ok(next > cursor, `${token} must follow the previous handoff step`);
    cursor = next;
  }
  assert.doesNotMatch(lobbyHub, /entry\.Value\.ConnectionId, entry\.Value, "lobby_game_started"/);
});

test('personal snapshots use verified current connections and public payload does not generate characters', () => {
  const preparation = roomsHub.slice(roomsHub.indexOf('private void PrepareLobbyGameplayCharacters'), roomsHub.indexOf('private async Task CompleteLobbyStart'));
  assert.match(preparation, /GetGameplayPlayersSnapshot\(room\)/);
  assert.match(preparation, /EnsurePlayerHasGeneratedData\(player\)/);
  assert.match(roomsHub, /GetCurrentConnectionId\(room, RoomService\.GetPlayerKey\(player\)\)/);
  assert.match(roomsHub, /GetPlayerRoomId\(currentConnectionId\)/);
  assert.match(roomsHub, /foreach \(var entry in RoomService\.GetGameplayPlayersSnapshot\(room\)\)/);
  assert.match(gameMasterHub, /SendPersonalPlayerSnapshot[\s\S]*?new \{ player, reason \}/);
  for (const field of ['Profession', 'PhysicalHealth', 'MentalHealth', 'Hobby', 'CharacterTrait', 'Phobia', 'Fact', 'Inventory', 'SpecialCard']) {
    assert.match(roomsHub, new RegExp(`Has[^\\n]*${field}|player\\.${field}`), `${field} must be part of the generated personal player state`);
  }

  const publicPayload = roomsHub.slice(
    roomsHub.indexOf('private object BuildRoomPlayersPayload'),
    roomsHub.indexOf('public Task StartGame()')
  );
  assert.doesNotMatch(publicPayload, /EnsurePlayerHasGeneratedData/);
});

test('client running renderer is order-independent and preserves personal state', () => {
  assert.match(client, /function tryRenderRunningGameState\(\)/);
  assert.match(client, /LobbyStateUpdated[\s\S]*?renderLobbyState\(\);[\s\S]*?tryRenderRunningGameState\(\)/);
  assert.match(client, /PlayerStateResynced[\s\S]*?myPlayerData = normalizePlayer[\s\S]*?tryRenderRunningGameState\(\)/);

  const lobbyHandler = client.slice(client.indexOf('connection.off("LobbyStateUpdated")'), client.indexOf('connection.off("OmniscientHiddenStateUpdated")'));
  assert.doesNotMatch(lobbyHandler, /myPlayerData\s*=\s*null/);
  assert.match(client, /tryRenderRunningGameState[\s\S]*?renderCurrentGameUI\(\)/);
  assert.match(client, /function updateRoomUI[\s\S]*?updateGMSections\(\)/);
});
