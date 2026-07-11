const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const gm = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');
const voting = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Voting.cs', 'utf8');
const gameActions = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameActions.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = fs.readFileSync('Views/Home/Game.cshtml', 'utf8');

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

test('stage and timer controls are disabled without fake server methods', () => {
  assert.match(view, /gmStageUnavailable[^>]*>[^<]*Reopen\/skip/);
  assert.match(view, /gmTimerUnavailable[^>]*>[^<]*Round\/voting timer/);
  assert.doesNotMatch(gm + voting, /Task (ReopenCurrentStage|SkipCurrentStage|RestartRoundTimer|AddRoundTime)/);
});

test('client round commands prevent double submit and render only voter names', () => {
  assert.match(client, /if \(gmRoundCommandPending\) return/);
  assert.match(client, /VotingAdminUpdated/);
  const render = client.match(/function renderGmVotingAdmin[\s\S]*?\n    }/)?.[0] || '';
  assert.doesNotMatch(render, /targetId|targetName/);
});
