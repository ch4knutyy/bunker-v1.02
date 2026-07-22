const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readBunkerView } = require('./bunker-view-test-helpers');

const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = readBunkerView();
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Lobby.cs', 'utf8');
const settings = fs.readFileSync('Models/Game/Rooms/Settings/RoomGameSettings.cs', 'utf8');

test('there is exactly one apocalypse settings tab and one delegated handler set', () => {
  assert.equal((view.match(/data-settings-tab="apocalypse"/g) || []).length, 1);
  assert.equal((view.match(/data-settings-pane="apocalypse"/g) || []).length, 1);
  assert.equal((client.match(/setup\.addEventListener\('input'/g) || []).length, 1);
  assert.equal((client.match(/setup\.addEventListener\('change'/g) || []).length, 1);
  assert.equal((client.match(/setup\.addEventListener\('click'/g) || []).length, 1);
});

test('mode-specific editors are canonical and incremental', () => {
  assert.match(client, /mode === 'RandomCategories'/);
  assert.match(client, /mode === 'Specific' \|\| mode === 'CustomPool'/);
  assert.match(client, /mode === 'CustomPool'/);
  assert.match(client, /filtered\.slice\(0, visibleLimit\)/);
  assert.match(client, /lobbyApocalypseVisibleCount \+= 30/);
  assert.match(client, /replaceChildren[\s\S]*textContent/);
  assert.doesNotMatch(client.slice(client.indexOf('function renderLobbyApocalypseEditor'), client.indexOf('function renderLobbyGameSetup')), /innerHTML/);
});

test('catalog remains read-only after settings freeze and public projection protects hidden apocalypse ids', () => {
  const catalogMethod = hub.slice(hub.indexOf('GetLobbyApocalypseCatalog'), hub.indexOf('ApplyLobbyGameSettings'));
  assert.match(catalogMethod, /RequireLobbyHost\(\)/);
  assert.match(catalogMethod, /GetEffective\(room\)/);
  assert.doesNotMatch(catalogMethod, /settings_frozen|SettingsFrozen|RoomState\.Lobby/);
  assert.match(hub.slice(hub.indexOf('ApplyLobbyGameSettings')), /_roomGameSettings\.Apply\(room, actor, request\)/);
  const publicDto = settings.slice(settings.indexOf('public sealed record LobbyGameSettingsDto'), settings.indexOf('public sealed record LobbySettingsWarningDto'));
  assert.match(publicDto, /AllowedApocalypseCategoryCount/);
  assert.match(publicDto, /ApocalypseCustomPoolCount/);
  assert.doesNotMatch(publicDto, /SelectedApocalypseId|AllowedApocalypseCategoryIds|ApocalypseCustomPoolIds/);
});

test('draft normalization and import export preserve only v4 apocalypse settings', () => {
  const normalize = client.slice(client.indexOf('function normalizeLobbySettings'), client.indexOf('function isLobbyConfiguredSystemEnabled'));
  for (const field of ['apocalypseSelectionMode', 'selectedApocalypseId', 'allowedApocalypseCategoryIds', 'apocalypseCustomPoolIds', 'allowInteractiveApocalypses', 'interactiveApocalypseChancePercent', 'apocalypseThemeEnabled']) assert.match(normalize, new RegExp(field));
  assert.match(client, /settings:lobbySettingsHubPayload\(lobbySettingsDraft\)/);
  assert.match(client, /lobbySettingsDraft\.version = 4/);
  assert.doesNotMatch(normalize, /Gameplay\.Effects|effectPayload|apocalypseGameplay|roomId|connectionId/i);
});

test('apply stays on existing revision command flow and theme manager is not duplicated', () => {
  assert.equal((client.match(/connection\.invoke\('ApplyLobbyGameSettings'/g) || []).length, 1);
  assert.match(client, /expectedRevision:lobbySettingsBaseRevision[\s\S]*commandId:crypto\.randomUUID/);
  assert.equal((client.match(/function applyApocalypseVisualTheme\(/g) || []).length, 1);
  assert.doesNotMatch(client.slice(client.indexOf('function renderLobbyApocalypseEditor'), client.indexOf('function renderLobbyGameSetup')), /effects|gameplay/i);
  assert.match(client, /mode === 'Specific' \|\| !settings\.allowInteractiveApocalypses/);
});
