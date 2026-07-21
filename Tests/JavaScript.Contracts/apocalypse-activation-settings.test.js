const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readBunkerView } = require('./bunker-view-test-helpers');

const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = readBunkerView();
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Lobby.cs', 'utf8');
const settings = fs.readFileSync('Models/Game/Rooms/Settings/RoomGameSettings.cs', 'utf8');
const policy = fs.readFileSync('Models/Game/Scenarios/Apocalypse/ResolvedApocalypseActivationPolicy.cs', 'utf8');

test('activation uses one section and the existing delegated apply flow', () => {
  assert.equal((view.match(/id="lobbyApocalypseActivation"/g) || []).length, 1);
  assert.equal((client.match(/setup\.addEventListener\('change'/g) || []).length, 1);
  assert.match(client, /data-activation-setting[\s\S]*updateLobbyActivationDraft/);
  assert.equal((client.match(/connection\.invoke\('ApplyLobbyGameSettings'/g) || []).length, 1);
  assert.doesNotMatch(hub, /SetApocalypseActivation|UpdateApocalypseActivation/);
});

test('default and custom conditional controls are contract driven', () => {
  const render = client.slice(client.indexOf('function renderLobbyApocalypseActivation'), client.indexOf('function renderLobbyApocalypseEditor'));
  assert.match(render, /activation\.policyMode === 'Custom'/);
  assert.match(render, /activation\.trigger === 'GameStart'/);
  assert.match(render, /activation\.scheduleMode === 'Once'/);
  assert.match(render, /supportedModes[\s\S]*supportedTriggers[\s\S]*allowedFirstRounds[\s\S]*allowedIntervalRounds/);
  assert.match(render, /!settings\.votingEnabled/);
  assert.match(render, /specificOrdinary/);
  assert.doesNotMatch(render, /Gameplay\.Effects|effectProfileId|EffectProfileId/);
});

test('effects disable preserves nested draft values and remains separate from theme', () => {
  const update = client.slice(client.indexOf('function updateLobbyActivationDraft'), client.indexOf('function renderLobbyApocalypseActivation'));
  assert.match(update, /apocalypseActivation\[key\] = value/);
  assert.doesNotMatch(update, /effectsEnabled[\s\S]*apocalypseActivation\s*=\s*new|delete/);
  const normalize = client.slice(client.indexOf('function normalizeLobbySettings'), client.indexOf('function isLobbyConfiguredSystemEnabled'));
  assert.match(normalize, /apocalypseThemeEnabled/);
  assert.match(normalize, /apocalypseActivation:[\s\S]*effectsEnabled/);
});

test('v4 import export contains settings but excludes runtime policy and effects', () => {
  assert.match(client, /\[1, 2, 3, 4\]\.includes/);
  assert.match(client, /lobbySettingsDraft\.version = 4/);
  assert.match(client, /settings:normalizeLobbySettings\(lobbySettingsDraft\)/);
  const normalize = client.slice(client.indexOf('function normalizeLobbySettings'), client.indexOf('function isLobbyConfiguredSystemEnabled'));
  for (const field of ['effectsEnabled', 'policyMode', 'scheduleMode', 'trigger', 'firstRound', 'intervalRounds', 'maxActivations']) assert.match(normalize, new RegExp(field));
  assert.doesNotMatch(normalize, /resolvedPolicy|effectProfile|Gameplay\.Effects|catalog/i);
});

test('public lobby projection and resolved model expose no raw effect data', () => {
  const dto = settings.slice(settings.indexOf('public sealed record LobbyGameSettingsDto'), settings.indexOf('public sealed record LobbySettingsWarningDto'));
  assert.match(dto, /ApocalypseEffectsEnabled[\s\S]*ApocalypseActivationPolicyMode[\s\S]*ApocalypseActivationMaxActivations/);
  assert.doesNotMatch(dto, /EffectProfileId|GameplaySchemaVersion|ResolvedApocalypse/);
  assert.match(policy, /EffectProfileId/);
  assert.doesNotMatch(policy, /Gameplay\.Effects|ApocalypseEffectDefinition|JsonExtensionData|RuntimeCounter/);
});

test('all activation labels are localized and warnings are mapped', () => {
  for (const key of ['lobbyActivationTitle', 'lobbyActivationEffectsEnabled', 'lobbyActivationDefinitionDefault', 'lobbyActivationCustom', 'lobbyActivationOnce', 'lobbyActivationRecurring', 'lobbyActivationGameStart', 'lobbyActivationAfterVoting', 'lobbyActivationAfterRound']) {
    assert.equal((client.match(new RegExp(`${key}:`, 'g')) || []).length, 3);
  }
  for (const code of ['apocalypse_effects_disabled', 'apocalypse_activation_inactive', 'apocalypse_activation_candidate_incompatible', 'apocalypse_activation_requires_voting', 'apocalypse_activation_unlimited', 'apocalypse_activation_game_start_once', 'apocalypse_activation_no_interactive_candidates']) assert.match(client, new RegExp(code));
});
