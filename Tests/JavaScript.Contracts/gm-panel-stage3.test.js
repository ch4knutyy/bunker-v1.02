const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const view = fs.readFileSync(path.join(root, 'Views', 'Shared', 'Bunker', '_GmPanel.cshtml'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');

test('GM panel exposes the current role-safe tabs and diagnostics', () => {
  for (const tab of ['game', 'players', 'voting', 'threats', 'bunker', 'events', 'technical', 'overview']) {
    assert.match(view, new RegExp(`data-gm-tab-button="${tab}"`));
  }
  assert.match(view, /gmDiagnosticsSummary/);
  assert.match(view, /gmLastCommandError/);
});

test('opening threat section and server payload update status without reload', () => {
  assert.match(client, /connection\.on\("GMThreatControlData"[\s\S]*renderGMThreatControl\(\)/);
  assert.match(client, /connection\.on\("ThreatStateUpdated"[\s\S]*markGMServerUpdate\(\)/);
});

test('reload obtains the same canonical server threat state', () => {
  assert.match(client, /RejoinSuccess[\s\S]*applyRoundState/);
});

test('double click cannot duplicate a GM command', () => {
  assert.match(client, /if \(gmThreatCommandPending\) return/);
  assert.match(client, /button\.disabled = true/);
  assert.match(client, /randomUUID/);
});

test('visible phase and interaction state use localized labels', () => {
  assert.match(client, /function getPhaseLabel/);
  assert.match(client, /function getThreatStatusLabel/);
  for (const key of ['gmGameState', 'gmRoundControl', 'gmThreatControl', 'gmContent', 'gmDiagnostics']) {
    assert.match(client, new RegExp(key));
  }
});

test('omniscient hidden state update refreshes GM panel button', () => {
  assert.match(client, /OmniscientHiddenStateUpdated[\s\S]*renderCurrentGameUI\(\)/);
});

test('updateGMSections no longer references legacy round tab button', () => {
  const fn = client.slice(
    client.indexOf('function updateGMSections()'),
    client.indexOf('function renderRoomsList'));
  assert.doesNotMatch(fn, /data-gm-tab-button="round"/);
  assert.doesNotMatch(fn, /console\.log/);
});
