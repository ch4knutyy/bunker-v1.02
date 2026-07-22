const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const authority = fs.readFileSync('Services/Bunker/Developer/DeveloperAuthorityService.cs', 'utf8');
const imageController = fs.readFileSync('Controllers/ScenarioImageController.cs', 'utf8');
const imagesClient = fs.readFileSync('wwwroot/js/bunker/development-images.js', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const story = fs.readFileSync('wwwroot/js/bunker/post-game-story-director.js', 'utf8');
const transitionHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.PostGameTransition.cs', 'utf8');
const completionHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameCompletion.cs', 'utf8');

test('developer authority is derived from the authenticated account and centralized capabilities', () => {
  assert.match(authority, /Identity\?\.IsAuthenticated == true/);
  assert.match(authority, /ClaimTypes\.NameIdentifier/);
  assert.match(authority, /TryGetOwnerId/);
  assert.match(authority, /RoomActorCapability\.All/);
  assert.doesNotMatch(authority, /player\.Name|nickname/i);
});

test('scenario images and prompts require server-authenticated developer authority', () => {
  assert.match(imageController, /TryGetDeveloperRoomActor\(room, User, out var actor\)/);
  assert.match(imageController, /FeatureAllows\(RoomActorCapability\.ManageScenarioImages\)/);
  assert.match(imageController, /EnsureActiveOperator/);
  assert.doesNotMatch(imageController, /IsValidHostRequest|GetHostRoom|HostToken|hostToken|connectionId/);
  assert.doesNotMatch(imagesClient, /hostToken|connectionId/);
  assert.match(imagesClient, /credentials: 'same-origin'/);
  assert.match(client, /const footerControls = developerFeatureEnabled\('scenarioImages'\)/);
  assert.match(client, /const hostControls = developerFeatureEnabled\('scenarioImages'\)/);
});

test('game completion enters final discussion without opening a blank story surface', () => {
  assert.match(completionHub, /room\.PostGamePhase = PostGamePhase\.FinalDiscussion/);
  assert.match(completionHub, /postGameTransition = BuildPostGameTransition\(room\)/);
  const finishedRenderer = client.slice(client.indexOf('function renderGameFinished'), client.indexOf('function buildGameSummaryText'));
  assert.match(finishedRenderer, /renderPostGameCommandState\(\)/);
  assert.doesNotMatch(finishedRenderer, /showFinished|postGameStoryRoot/);
  assert.match(story, /phase === 'FinalDiscussion' \|\| phase === 'HostDecision'[\s\S]*hideUi\(\)/);
  assert.match(transitionHub, /FinishPostGameDiscussion/);
  assert.match(transitionHub, /ChoosePostGameStory/);
  assert.match(transitionHub, /DeveloperPresent/);
});

test('developer badge and observer mode use only server projections', () => {
  assert.match(client, /p\.isDeveloper \? `<span class="player-role-developer">DEVELOPER/);
  assert.match(client, /data\.developer \|\| data\.Developer/);
  assert.match(client, /joinAsDeveloperObserver/);
  assert.match(client, /connection\.invoke\("JoinRoom"[\s\S]*developerObserver\)/);
  assert.doesNotMatch(client, /name\s*===\s*['"]Developer|includes\(['"]developer/i);
});
