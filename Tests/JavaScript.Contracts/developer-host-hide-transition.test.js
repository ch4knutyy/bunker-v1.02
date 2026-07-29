const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const stateHub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.PostGameTransition.cs'), 'utf8');
const gmHub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.GameMaster.cs'), 'utf8');
const actions = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.GameActions.cs'), 'utf8');
const characters = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'characters', 'signalr-events.js'), 'utf8');
const lobbyEvents = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'lobby', 'signalr-events.js'), 'utf8');
const core = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'core', 'runtime.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'wwwroot', 'css', 'game.css'), 'utf8');

test('developer resync, public hide ordering and cinematic crossover retain their boundaries', () => {
  assert.match(stateHub, /GetRoomState\(\)[\s\S]*TryResolvePlayer\(room, Context\.ConnectionId[\s\S]*_developerAuthority\.IsDeveloper\(player\)[\s\S]*_bunkerIntel\.Project\(room, player/);
  assert.doesNotMatch(stateHub.slice(stateHub.indexOf('public object GetRoomState'), stateHub.indexOf('public object GetDeveloperAccessState')), /IsHost\(/);
  assert.match(gmHub, /TransferHost[\s\S]*SendPublicPlayersUpdate\(room\)[\s\S]*RoundStateUpdated[\s\S]*BroadcastBunkerIntelProjection\(room\)[\s\S]*BroadcastDeveloperAuthorityState\(room\)/);
  assert.match(core, /function resyncCurrentRoomState\(\)[\s\S]*canonicalRoomResyncPromise[\s\S]*connection\.invoke\('GetRoomState'\)[\s\S]*applyCanonicalRoomStateSnapshot/);
  assert.match(lobbyEvents, /HostChanged[\s\S]*resyncCurrentRoomState/);
  assert.match(actions, /HideOwnRevealedCharacteristic[\s\S]*revealRevision = \+\+room\.PublicRevealRevision[\s\S]*CharacteristicHidden[\s\S]*revealRevision[\s\S]*RoundStateUpdated/);
  assert.match(characters, /shouldApplyPublicCharacteristicRevision[\s\S]*revealedTooltips[\s\S]*CharacteristicHidden[\s\S]*revealRevision/);
  assert.match(css, /#apocalypseStorySection::after[\s\S]*pointer-events:\s*none[\s\S]*#bunkerStorySection\s*\{[\s\S]*margin-top:\s*-56px[\s\S]*@media \(max-width: 760px\)[\s\S]*margin-top:\s*-32px/);
});
