const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const actions = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.GameActions.cs'), 'utf8');
const mutator = fs.readFileSync(path.join(root, 'Services', 'Bunker', 'Gm', 'GmPlayerStateMutator.cs'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'characters', 'runtime.js'), 'utf8');
const events = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'characters', 'signalr-events.js'), 'utf8');
const overview = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'public-overview', 'runtime.js'), 'utf8');
const translations = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'translations.js'), 'utf8');

test('a player can reveal and hide only their own public characteristic without a round quota', () => {
  assert.match(actions, /Task<bool> HideOwnRevealedCharacteristic\(string characteristicName\)[\s\S]*GetPlayer\(Context\.ConnectionId\)[\s\S]*PublicCharacteristicKeys\.Contains/);
  assert.doesNotMatch(actions.slice(actions.indexOf('HideOwnRevealedCharacteristic'), actions.indexOf('SubmitVotingReadyStatus')), /targetPlayerId|Player player|RevealedValues\s*=/);
  assert.match(actions, /lock \(room\.SnapshotSyncRoot\)[\s\S]*HideCharacteristic\(player, characteristicName\)[\s\S]*PublicRevealRevision/);
  assert.doesNotMatch(actions, /CurrentRoundReveals|RevealRequirement|FutureRevealCredits|CurrentPhase != GamePhase\.RoundReveal/);
  assert.match(mutator, /player\.Revealed\.RevealedValues\.Remove\(key\)/);
  assert.match(runtime, /pendingCharacteristicHides[\s\S]*connection\.invoke\("HideOwnRevealedCharacteristic", characteristicName\)[\s\S]*hideCharacteristic/);
  assert.match(events, /clearHiddenPublicCharacteristicState[\s\S]*revealedData[\s\S]*revealedSources[\s\S]*revealedTooltips[\s\S]*additionalPhysicalConditions/);
  assert.match(overview, /function patchPublicCharacteristicHidden[\s\S]*outerHTML = renderComparisonCharacteristic[\s\S]*outerHTML = renderPublicCharacteristicCard/);
  const keys = ['hideCharacteristic', 'characteristicHidden', 'characteristicHideFailed', 'characteristicAlreadyHidden', 'canHideOwnCharacteristicsOnly'];
  assert.deepEqual(keys.map(key => (translations.match(new RegExp(`${key}:`, 'g')) || []).length), [3, 3, 3, 3, 3]);
});
