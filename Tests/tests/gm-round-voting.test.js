const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const gm = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');
const voting = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Voting.cs', 'utf8');
const gameActions = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameActions.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = fs.readFileSync('Views/Home/Game.cshtml', 'utf8');
const helpers = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Helpers.cs', 'utf8');
const service = fs.readFileSync('Services/RoundVotingAdminService.cs', 'utf8');

test('voting availability has one server rule and live public state', () => {
  assert.match(service, /CanStartVoting\(Room room,/);
  assert.match(service, /GamePhase\.ExtraInventory or GamePhase\.PreVotingReadyCheck/);
  assert.match(voting, /GetVotingStartAvailability\(room\)/);
  assert.match(helpers, /RoundVotingAdminService\.CanStartVoting\(room, hasUnresolvedBlockingThreat\)/);
  assert.match(helpers, /canStartVoting = votingAvailability\.Allowed/);
  assert.match(client, /currentRoundState\?\.canStartVoting === true/);
  assert.doesNotMatch(client.match(/function canStartVotingNow\(\)[\s\S]*?\n    }/)?.[0] || '', /CurrentRound|PreVotingReadyCheck|currentVoting/);
});

test('round recovery commands require public-state capability and idempotency', () => {
  for (const method of ['SetGamePaused', 'SetRoundNumber', 'ResetRoundReadiness']) assert.match(gm, new RegExp(`Task ${method}\\(`));
  assert.match(gm, /GmCapability\.ManagePublicGameState/);
  assert.match(gm, /RememberPlayerCommand/);
  assert.match(gameActions, /RejectPausedPlayerAction/);
  assert.match(voting, /RejectPausedPlayerAction/);
});

test('voting admin payload never exposes target values', () => {
  const body = voting.match(/private object BuildVotingAdminState[\s\S]*?private static bool HasActive/)?.[0] || '';
  assert.doesNotMatch(body, /vote\.Value|targetId|targetName/);
  assert.match(voting, /ToClientInfo\(playersSnapshot, showVotes: false\)/);
  assert.match(voting, /GetTiedCandidateIds\(voting\)/);
});

test('stage controls stay disabled while canonical timer controls are available', () => {
  assert.match(view, /gmStageUnavailable[^>]*>[^<]*Reopen\/skip/);
  assert.doesNotMatch(gm + voting, /Task (ReopenCurrentStage|SkipCurrentStage)/);
  assert.match(view, /id="gmGameTimerCard"/);
  assert.match(gm, /Task StartGameTimer\(/);
});

test('client round commands prevent double submit and render only voter names', () => {
  assert.match(client, /if \(gmRoundCommandPending\) return/);
  assert.match(client, /VotingAdminUpdated/);
  const render = client.match(/function renderGmVotingAdmin[\s\S]*?\n    }/)?.[0] || '';
  assert.doesNotMatch(render, /targetId|targetName/);
});

test('round controls are grouped without changing existing command handlers', () => {
  for (const id of ['gmRoundStateHeading', 'gmRoundMainHeading', 'gmManualRoundHeading', 'gmReadinessHeading', 'gmTimerHeading']) {
    assert.match(view, new RegExp(`id="${id}"`));
  }
  assert.match(view, /onclick="setGamePause\(true\)"/);
  assert.match(view, /onclick="setGamePause\(false\)"/);
  assert.match(view, /onclick="previewManualRoundChange\(\)"/);
  assert.match(view, /onclick="resetRoundReadiness\(\)"/);
  assert.match(view, /onclick="startGameTimer\(\)"/);
  assert.match(client, /if \(gmRoundCommandPending\) return/);
});

test('round labels are localized and pause reason is rendered from server state', () => {
  for (const key of ['gmRoundCurrentState', 'gmRoundMainActions', 'gmManualRoundHint', 'gmReadinessHint', 'gmTimerMinutes']) {
    assert.equal((client.match(new RegExp(key, 'g')) || []).length >= 3, true, `missing localized ${key}`);
  }
  assert.match(client, /currentRoundState\.pauseReason/);
  assert.match(client, /gmStatusPaused/);
  assert.match(client, /gmStatusRunning/);
});
