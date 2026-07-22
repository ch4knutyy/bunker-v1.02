const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const completionHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameCompletion.cs', 'utf8');
const roomHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Rooms.cs', 'utf8');
const helpersHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Helpers.cs', 'utf8');
const lobbyHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Lobby.cs', 'utf8');
const view = fs.readFileSync('Views/Bunker/Index.cshtml', 'utf8');

test('live and reconnect completion use the same renderer and canonical room state', () => {
  assert.match(completionHub, /room\.Completion = completionState/);
  assert.match(helpersHub, /completion = room\.Completion/);
  assert.match(roomHub, /RejoinSuccess[\s\S]*?completion = room\.Completion/);

  const liveHandler = client.slice(
    client.indexOf('connection.off("GameFinished")'),
    client.indexOf('connection.off("PlayerRestored")')
  );
  const rejoinHandler = client.slice(
    client.indexOf('connection.off("RejoinSuccess")'),
    client.indexOf('connection.off("RejoinFailed")')
  );
  assert.match(liveHandler, /renderGameFinished\(completion/);
  assert.match(rejoinHandler, /renderGameFinished\(rejoinCompletion/);
  assert.match(client, /function renderGameFinished\(completion, context = \{\}\)/);
});

test('post-game actions are host-safe and summary exposes names instead of ids', () => {
  assert.match(view, /id="gameFinishedPanel"/);
  assert.match(view, /id="returnFinishedGameButton"/);
  assert.match(view, /id="copyGameSummaryButton"/);
  assert.match(view, /id="finishPostGameDiscussionButton"/);
  assert.match(view, /id="createPostGameStoryButton"[\s\S]*requestFinalPostGameStory\(\)/);
  assert.match(client, /setPostGameButton\('returnFinishedGameButton', canManagePostGame && canStartAgain\)/);
  assert.match(client, /setPostGameButton\('createPostGameStoryButton', canManagePostGame && hostDecision && !!transition\?\.developerPresent && !!transition\?\.storyDirectorAvailable\)/);
  assert.match(client, /if \(\(!isHost && !\(isDeveloper && developerState\?\.isActiveOperator\)\) \|\| returnFinishedGamePending \|\| !currentGameCompletion\) return/);
  assert.match(client, /connection\.invoke\('ReturnFinishedGameToLobby', true, crypto\.randomUUID\(\)\)/);
  assert.match(lobbyHub, /public async Task ReturnFinishedGameToLobby/);
  assert.match(lobbyHub, /RequireLobbyHost\(\)/);
  assert.match(lobbyHub, /game_return_confirmation_required/);
  assert.match(lobbyHub, /PostGamePhase\.HostDecision or PostGamePhase\.StoryPublished or PostGamePhase\.Completed/);

  const summary = client.slice(
    client.indexOf('function buildGameSummaryText()'),
    client.indexOf('async function copyGameSummary()')
  );
  assert.match(summary, /winner\.name/);
  assert.doesNotMatch(summary, /playerId|PlayerId|connectionId|ConnectionId/);
});

test('return event clears post-game state and restores the canonical lobby renderer', () => {
  const returnedHandler = client.slice(
    client.indexOf('connection.off("GameReturnedToLobby")'),
    client.indexOf('connection.off("LobbyKicked")')
  );
  assert.match(returnedHandler, /clearGameFinishedStateForLobby\(\)/);
  assert.match(returnedHandler, /lobbyState = nextLobbyState/);
  assert.match(returnedHandler, /renderLobbyState\(\)/);
  assert.match(lobbyHub, /"GameReturnedToLobby"/);
  assert.match(lobbyHub, /"game_returned_to_lobby"/);
  assert.match(lobbyHub, /CompleteSessionAsync\(previousSessionId,\s*result\.ParticipantResults\)/);
});
