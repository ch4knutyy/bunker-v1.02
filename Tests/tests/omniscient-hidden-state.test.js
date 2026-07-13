const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.OmniscientGm.cs', 'utf8');
const dto = fs.readFileSync('Models/Game/OmniscientHiddenState.cs', 'utf8');
const service = fs.readFileSync('Services/OmniscientHiddenStateService.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');

test('hidden delivery uses one private event and no room broadcast', () => {
  assert.match(hub, /OmniscientHiddenStateUpdated/);
  const privateMethod = hub.slice(hub.indexOf('SendPrivateOmniscientState'), hub.indexOf('BroadcastOmniscientStateToAuthorizedSpectators'));
  assert.match(privateMethod, /Clients\.Client/);
  assert.doesNotMatch(privateMethod, /Clients\.Group|Clients\.All/);
});

test('explicit DTO omits internal threat and transport fields', () => {
  assert.match(dto, /OmniscientRoomStateDto/); assert.match(dto, /OmniscientPlayerStateDto/); assert.match(dto, /OmniscientVotingStateDto/);
  assert.doesNotMatch(dto, /ConnectionId|HostToken|RandomModifier|Mechanics|AnswerKey|ImagePath/);
  assert.doesNotMatch(service, /ToClientInfo\(|CurrentThreat\.Mechanics|SecretSupportDrop|OperationScaling/);
});

test('client rejects stale versions and clears hidden DOM without storage', () => {
  assert.match(client, /version <= omniscientHiddenStateVersion/);
  assert.match(client, /clearOmniscientHiddenState\(\)/);
  const hiddenBlock = client.slice(client.indexOf('function clearOmniscientHiddenState'), client.indexOf('async function refreshGlobalContentCatalogAccess'));
  assert.doesNotMatch(hiddenBlock, /localStorage|sessionStorage|console\./);
});
