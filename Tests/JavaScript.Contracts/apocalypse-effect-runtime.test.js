const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { readBunkerView } = require('./bunker-view-test-helpers');

const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const view = readBunkerView();
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.ApocalypseEffects.cs', 'utf8');
const roomHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Rooms.cs', 'utf8');

test('live runtime registers exactly one public and one personal handler', () => {
  assert.equal((client.match(/connection\.on\("ApocalypseEffectActivated"/g) || []).length, 1);
  assert.equal((client.match(/connection\.on\("ApocalypseEffectPersonalChanged"/g) || []).length, 1);
  assert.match(client, /connection\.off\("ApocalypseEffectActivated"/);
  assert.match(client, /connection\.off\("ApocalypseEffectPersonalChanged"/);
});

test('banner uses safe DOM construction and reduced motion', () => {
  assert.match(view, /id="apocalypseEffectBanner"[\s\S]*aria-live="polite"/);
  const runtime = client.slice(client.indexOf('function apocalypseEffectSummaryKey'), client.indexOf('// ==================== SIGNALR HANDLERS'));
  assert.match(runtime, /textContent/);
  assert.match(runtime, /replaceChildren/);
  assert.doesNotMatch(runtime, /innerHTML|insertAdjacentHTML/);
  assert.match(runtime, /setTimeout\(hideApocalypseEffectBanner, 9000\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test('public payload is sanitized while personal changes stay one-client only', () => {
  const publicSend = hub.slice(hub.indexOf('SendAsync("ApocalypseEffectActivated"'), hub.indexOf('if (!execution.Success)'));
  assert.match(publicSend, /summaryCode/);
  assert.doesNotMatch(publicSend, /PersonalChanges|before\s*=|after\s*=|EffectTypes/);
  assert.match(hub, /Clients\.Client\(connectionId\)\.SendAsync\("ApocalypseEffectPersonalChanged"/);
  assert.match(roomHub, /fact = p\.Revealed\?\.Fact == true \? p\.Fact : null/);
});

test('runtime is projected as summary only and is not replayed as a cinematic', () => {
  assert.match(roomHub, /apocalypseEffectRuntime = room\.ApocalypseEffectRuntime/);
  assert.doesNotMatch(roomHub, /ProcessedOccurrenceKeys|PersonalChanges|EffectTypes/);
  assert.doesNotMatch(client, /apocalypseEffectRuntime[\s\S]{0,200}showApocalypseEffectBanner/);
});

test('all runtime messages are localized in three languages', () => {
  for (const key of ['apocalypseEffectTitle', 'apocalypseEffectFailureTitle', 'apocalypseEffectApplied', 'apocalypseEffectFailed', 'apocalypseEffectAge', 'apocalypseEffectBody', 'apocalypseEffectProfession', 'apocalypseEffectConditions']) {
    assert.equal((client.match(new RegExp(`${key}:`, 'g')) || []).length, 3);
  }
});
