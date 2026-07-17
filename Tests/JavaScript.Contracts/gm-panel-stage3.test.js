const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const view = fs.readFileSync(path.join(root, 'Views', 'Shared', 'Bunker', '_GmPanel.cshtml'), 'utf8');
const client = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');

test('GM panel exposes five focused tabs and diagnostics', () => {
  for (const tab of ['state', 'round', 'threat', 'content', 'diagnostics']) {
    assert.match(view, new RegExp(`data-gm-tab-button="${tab}"`));
  }
  assert.match(view, /gmDiagnosticsSummary/);
  assert.match(view, /gmLastCommandError/);
});

test('opening threat section and server payload update status without reload', () => {
  assert.match(client, /function switchGMTab\(tab\)/);
  assert.match(client, /connection\.on\("GMThreatControlData"[\s\S]*renderGMThreatControl\(\)/);
  assert.match(client, /connection\.on\("ThreatStateUpdated"[\s\S]*markGMServerUpdate\(\)/);
});

test('reload obtains the same canonical server threat state', () => {
  assert.match(client, /connection\.invoke\("GetGMThreatControlData"\)/);
  assert.match(client, /RejoinSuccess[\s\S]*applyRoundState/);
});

test('double click cannot duplicate a GM command', () => {
  assert.match(client, /if \(gmThreatCommandPending\) return/);
  assert.match(client, /button\.disabled = true/);
  assert.match(client, /randomUUID/);
});

test('visible phase and interaction state use localized labels', () => {
  assert.match(client, /getPhaseLabel\(getCurrentPhase\(\)\)/);
  assert.match(client, /getThreatStatusLabel\(currentThreatState\.threatStatus\)/);
  for (const key of ['gmGameState', 'gmRoundControl', 'gmThreatControl', 'gmContent', 'gmDiagnostics']) {
    assert.match(client, new RegExp(key));
  }
});
