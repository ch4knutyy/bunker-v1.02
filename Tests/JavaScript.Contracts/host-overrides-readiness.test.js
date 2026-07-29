const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');
const hub = read('Hubs/BunkerHubGame/GameHub.GameMaster.cs');
const actions = read('Hubs/BunkerHubGame/GameHub.GameActions.cs');
const panel = read('Views/Shared/Bunker/_GmPanel.cshtml');
const voting = read('wwwroot/js/bunker/voting/runtime.js');
const translations = read('wwwroot/js/bunker/i18n/translations.js');

const method = (source, name, next) => source.slice(source.indexOf(`Task ${name}`), source.indexOf(next, source.indexOf(`Task ${name}`)));

test('host overrides and readiness check stay server-authoritative without synthetic readiness', () => {
  const forceReveal = method(hub, 'ForceRevealCharacteristic', 'EndRound');
  const endRound = method(hub, 'EndRound', 'RollRoundDice');
  const hide = method(hub, 'HideRevealedCharacteristic', 'ResyncPlayer');
  const readyStart = method(hub, 'StartVotingReadyCheck', 'CancelVotingReadyCheck');

  assert.doesNotMatch(forceReveal, /CurrentRoundReveals|RevealRequirement|FutureRevealCredits/);
  assert.doesNotMatch(hide, /CurrentRoundReveals|RevealRequirement|FutureRevealCredits/);
  assert.doesNotMatch(endRound, /HaveAllActivePlayersRevealedThisRound/);
  assert.match(endRound, /_gameTimerService\.Stop\(room\)[\s\S]*ReadinessCheckId = null/);
  assert.match(readyStart, /ReadinessCheckId = Guid\.NewGuid\(\)\.ToString\("N"\)/);
  assert.match(actions, /stale_readiness_check[\s\S]*readiness_player_ineligible/);
  assert.match(panel, /executeHostCharacteristicOverride\('reveal'\)/);
  assert.match(panel, /startVotingReadyCheck\(\)/);
  assert.doesNotMatch(panel, /markAllPlayersReady\(\)/);
  assert.match(voting, /SubmitVotingReadyStatus", status, readinessCheckId, roundCommandId\(\)/);
  assert.ok(['gmForceEndRoundAction', 'gmAskReadyAction', 'readyCheckNotReady', 'gmCharacteristicOverrideTitle']
    .every(key => (translations.match(new RegExp(`${key}:`, 'g')) || []).length === 3));
});
