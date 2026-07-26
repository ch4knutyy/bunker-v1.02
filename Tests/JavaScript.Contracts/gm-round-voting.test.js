const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const gm = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');
const voting = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Voting.cs', 'utf8');
const gameActions = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameActions.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/bunker/rounds/runtime.js', 'utf8');
const i18n = fs.readFileSync('wwwroot/js/bunker/i18n/translations.js', 'utf8');
const { readBunkerView } = require('./bunker-view-test-helpers');
const view = readBunkerView();
const helpers = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Helpers.cs', 'utf8');
const service = fs.readFileSync('Services/Bunker/GameFlow/RoundVotingAdminService.cs', 'utf8');
const votingClient = fs.readFileSync('wwwroot/js/bunker/voting/runtime.js', 'utf8');
const votingEvents = fs.readFileSync('wwwroot/js/bunker/voting/signalr-events.js', 'utf8');
const lobbyEvents = fs.readFileSync('wwwroot/js/bunker/lobby/signalr-events.js', 'utf8');
const gmPanelV2 = fs.readFileSync('wwwroot/js/bunker/gm-panel-v2.js', 'utf8');
const gmRuntime = fs.readFileSync('wwwroot/js/bunker/gm/runtime.js', 'utf8');
const votingModel = fs.readFileSync('Models/Game/Voting/VotingSession.cs', 'utf8');
const revealCredits = fs.readFileSync('Services/Bunker/GameFlow/RevealCreditService.cs', 'utf8');
const specialCards = fs.readFileSync('Hubs/BunkerHubGame/GameHub.SpecialCards.cs', 'utf8');
const gmPanelHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GmPanel.cs', 'utf8');

test('voting availability has one server rule and live public state', () => {
  assert.match(service, /CanStartVoting\(Room room,/);
  assert.match(service, /GamePhase\.RoundReveal or GamePhase\.ExtraInventory or GamePhase\.PreVotingReadyCheck/);
  assert.match(voting, /GetVotingStartAvailability\(room\)/);
  assert.match(helpers, /RoundVotingAdminService\.CanStartVoting\(room, hasUnresolvedBlockingThreat\)/);
  assert.match(helpers, /canStartVoting = votingAvailability\.Allowed/);
  assert.match(client, /currentRoundState\?\.canStartVoting === true/);
  assert.doesNotMatch(client.match(/function canStartVotingNow\(\)[\s\S]*?\n    }/)?.[0] || '', /CurrentRound|PreVotingReadyCheck|currentVoting/);
});

test('early voting is server-authoritative, optional, and localized', () => {
  assert.match(votingModel, /RecommendedStartRound = 3/);
  assert.match(voting, /VotingStartedAtRound = room\.CurrentRound/);
  assert.match(voting, /IsEarlyVoting = room\.CurrentRound < VotingSession\.RecommendedStartRound/);
  assert.doesNotMatch(gm, /IsVotingRound\(/);
  assert.match(client, /currentRoundState\?\.isEarlyVoting/);
  assert.doesNotMatch(client, /round\s*<\s*3|currentRound\s*<\s*3/);
  for (const key of ['gmStartEarlyVotingAction', 'gmEarlyVotingHint', 'gmConfirmEarlyVoting']) {
    assert.equal((i18n.match(new RegExp(key, 'g')) || []).length >= 3, true, `missing localized ${key}`);
  }
});

test('forced reveal credits use actual transitions and developer adjustments are explicit', () => {
  assert.match(specialCards, /revealedKeys\.Add\(key\)/);
  assert.match(specialCards, /RevealCreditService\.ApplyForcedReveals/);
  assert.match(specialCards, /ProcessedSpecialCardCommandIds\.Contains\(commandId\)/);
  assert.match(revealCredits, /actualKeys\.Length - usedForCurrentRound/);
  assert.match(revealCredits, /player\.FutureRevealCredits--/);
  assert.match(gameActions, /!player\.RevealRequirementSatisfiedByCredit/);
  assert.match(client, /revealRequirementSatisfiedByCredit \|\| self\.RevealRequirementSatisfiedByCredit/);
  assert.match(gmPanelHub, /Task AdjustRevealCredits\(/);
  assert.match(gmPanelHub, /RoomActorCapability\.UseDeveloperTools/);
  assert.match(gmPanelV2, /connection\.invoke\(\s*\"AdjustRevealCredits\"/);
  assert.doesNotMatch(gmPanelV2, /\beval\s*\(|new Function\s*\(/);
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
  assert.match(gmRuntime, /if \(gmRoundCommandPending\) return/);
  assert.match(votingEvents, /VotingAdminUpdated/);
  const render = gmRuntime.match(/function renderGmVotingAdmin[\s\S]*?\n}/)?.[0] || '';
  assert.doesNotMatch(render, /targetId|targetName/);
});

test('round controls are grouped without changing existing command handlers', () => {
  for (const id of ['gmRoundStateHeading', 'gmRoundMainHeading', 'gmManualRoundHeading', 'gmReadinessHeading', 'gmGameTimerCard']) {
    assert.match(view, new RegExp(`id="${id}"`));
  }
  assert.match(view, /data-gm-click="setGamePause\(true\)"/);
  assert.match(view, /data-gm-click="setGamePause\(false\)"/);
  assert.match(view, /data-gm-click="previewManualRoundChange\(\)"/);
  assert.match(view, /data-gm-click="resetRoundReadiness\(\)"/);
  assert.match(view, /data-gm-click="startGameTimer\(\)"/);
  assert.match(gmRuntime, /if \(gmRoundCommandPending\) return/);
});

test('round labels are localized and pause reason is rendered from server state', () => {
  for (const key of ['gmRoundCurrentState', 'gmRoundMainActions', 'gmManualRoundHint', 'gmReadinessHint', 'gmTimerMinutes']) {
    assert.equal((i18n.match(new RegExp(key, 'g')) || []).length >= 3, true, `missing localized ${key}`);
  }
  assert.match(client, /currentRoundState\.pauseReason/);
  assert.match(client, /gmStatusPaused/);
  assert.match(client, /gmStatusRunning/);
});

test('end voting uses one guarded client action and reconnect renders once', () => {
  assert.doesNotMatch(view, /onclick="endVoting(?:Early)?\(\)"/);
  assert.equal((view.match(/data-voting-action="end"/g) || []).length, 2);
  assert.match(votingClient, /if \(endVotingPending \|\| !isVotingActive\(\)\)/);
  assert.match(votingClient, /button\.disabled = !available \|\| endVotingPending/);
  assert.match(votingEvents, /VotingEnded[\s\S]*syncEndVotingControls\(\)/);
  assert.match(voting, /if \(room\.CurrentVoting\?\.State != VotingState\.Active\)/);
  assert.equal((lobbyEvents.match(/renderCurrentGameUI\(\)/g) || []).length, 8);
  assert.doesNotMatch(gmPanelV2, /connection\.(?:on|onreconnected)\s*\(/);
});
