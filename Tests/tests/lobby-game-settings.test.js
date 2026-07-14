const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = fs.readFileSync('Views/Home/Game.cshtml', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const settings = fs.readFileSync('Models/Game/RoomGameSettings.cs', 'utf8');
const service = fs.readFileSync('Services/RoomGameSettingsService.cs', 'utf8');
const lobby = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Lobby.cs', 'utf8');

test('lobby setup has one compact host editor with read-only public summary', () => {
  assert.equal((view.match(/id="lobbyGameSetup"/g) || []).length, 1);
  assert.equal((view.match(/id="lobbySettingsHostEditor"/g) || []).length, 1);
  assert.equal((view.match(/id="lobbySettingsReadOnly"/g) || []).length, 1);
  for (const tab of ['basic', 'threats', 'rounds', 'access']) {
    assert.match(view, new RegExp(`data-settings-tab="${tab}"`));
  }
  assert.match(css, /lobby-settings-tabs[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /max-width:\s*620px[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(view, /<input[^>]*id="maxPlayers"[^>]*min="2"[^>]*max="12"[^>]*data-testid="room-max-players-input"/);
});

test('settings use one versioned canonical model, atomic apply, revision and freeze', () => {
  assert.match(settings, /CurrentVersion\s*=\s*1/);
  assert.match(settings, /LobbySettingsUpdateRequest/);
  assert.match(service, /ExpectedRevision/);
  assert.match(service, /settings_revision_conflict/);
  assert.match(service, /SettingsRevision\+\+/);
  assert.match(service, /FreezeForStart/);
  assert.match(client, /ApplyLobbyGameSettings'[\s\S]*expectedRevision:lobbySettingsBaseRevision[\s\S]*commandId:crypto\.randomUUID\(\)[\s\S]*settings:lobbySettingsHubPayload/);
  assert.equal((client.match(/connection\.invoke\('ApplyLobbyGameSettings'/g) || []).length, 1);
});

test('one delegated setup handler prevents duplicate bindings and keeps draft local until Apply', () => {
  assert.match(client, /setup\.dataset\.bound === 'true'/);
  assert.equal((client.match(/setup\.addEventListener\('input'/g) || []).length, 1);
  assert.equal((client.match(/setup\.addEventListener\('change'/g) || []).length, 1);
  assert.equal((client.match(/setup\.addEventListener\('click'/g) || []).length, 1);
  assert.match(client, /lobbySettingsDraft\[key\] = value;[\s\S]*lobbySettingsDirty = true/);
});

test('live revision or host transfer discards stale drafts and non-host remains read-only', () => {
  assert.match(client, /lobbySettingsOwnerId !== ownerId \|\| lobbySettingsBaseRevision !== revision/);
  assert.match(client, /if \(!hostNow\) \{ lobbySettingsDraft = null; lobbySettingsDirty = false/);
  assert.match(client, /editor\.hidden = !host/);
  assert.match(client, /readOnly\.hidden = host/);
  assert.match(client, /settings_revision_conflict[\s\S]*lobbySettingsConflict/);
});

test('local presets and JSON interchange are versioned and whitelist only normalized settings', () => {
  assert.match(client, /schema:'bunker-room-game-settings', version:1/);
  assert.match(client, /data\?\.schema !== 'bunker-room-game-settings' \|\| data\?\.version !== 1 \|\| data\?\.settings\?\.version !== 1/);
  assert.match(client, /settings:normalizeLobbySettings\(lobbySettingsDraft\)/);
  const normalizeBody = client.slice(client.indexOf('function normalizeLobbySettings'), client.indexOf('function lobbyAmCurrentHost'));
  for (const forbidden of ['password', 'roomId', 'playerId', 'connectionId', 'displayName', 'profession']) {
    assert.doesNotMatch(normalizeBody, new RegExp(forbidden, 'i'));
  }
});

test('UA RU EN expose setup labels and spectator readiness is server blocked', () => {
  for (const key of ['lobbySetupTitle', 'lobbyPresetClassic', 'lobbyInteractiveRate', 'lobbyTimerDuration', 'lobbyVotingStart', 'lobbyApply']) {
    assert.equal((client.match(new RegExp(`${key}:`, 'g')) || []).length, 3);
  }
  assert.match(lobby, /IsGameplayParticipant\(player\)[^\n]*spectators_not_ready_participants/);
  assert.match(lobby, /SetLobbyReady/);
});

test('disabled systems are omitted cleanly instead of rendering empty cards', () => {
  assert.match(client, /isLobbyConfiguredSystemEnabled\('apocalypseEnabled'\)/);
  assert.match(client, /isLobbyConfiguredSystemEnabled\('bunkerScenarioEnabled'\)/);
  assert.match(client, /isLobbyConfiguredSystemEnabled\('threatsEnabled'\)/);
  assert.match(client, /section\.hidden = true; section\.style\.display = 'none'; container\.innerHTML = ''/);
  assert.match(client, /updateScenarioSectionVisibility/);
});
