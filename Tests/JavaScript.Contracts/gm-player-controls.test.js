const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');

test('player commands require safe capability and same-room target resolution', () => {
  assert.match(hub, /GmCapability\.ManagePlayersWithoutHiddenData/);
  assert.match(hub, /TryGetManagedPlayer[\s\S]*TryResolvePlayer\(room, targetId/);
  for (const method of ['KickPlayer', 'HideRevealedCharacteristic', 'ResyncPlayer', 'TransferHost', 'ChangeAdditionalConditionSeverity', 'RemoveAdditionalCondition'])
    assert.match(hub, new RegExp(`Task ${method}\\(`));
});

test('host never receives the personal player snapshot', () => {
  const helper = hub.match(/private async Task SendPersonalPlayerSnapshot[\s\S]*?(?=\r?\n\s*private async Task SendPublicPlayersUpdate)/)?.[0] || '';
  assert.match(helper, /Clients\.Client\(connectionId\)/);
  assert.doesNotMatch(helper, /Clients\.Caller/);
});

test('hide mutates reveal state and condition repair uses canonical collection', () => {
  assert.match(hub, /SetCharacteristicHidden\(player, characteristicName\)/);
  assert.doesNotMatch(hub.match(/Task HideRevealedCharacteristic[\s\S]*?Task ResyncPlayer/)?.[0] || '', /_generator\.Generate/);
  assert.match(hub, /GmPlayerStateMutator\.ChangeConditionSeverity/);
  assert.match(hub, /GmPlayerStateMutator\.RemoveCondition/);
});

test('client prevents double submit and handles live snapshots', () => {
  assert.match(client, /if \(gmPlayerCommandPending \|\| !selectedPlayerForGM\) return/);
  assert.match(client, /connection\.on\("PlayerStateResynced"/);
  assert.match(client, /connection\.on\("RoomPlayersUpdated"/);
  assert.match(client, /connection\.on\("HostChanged"/);
});
