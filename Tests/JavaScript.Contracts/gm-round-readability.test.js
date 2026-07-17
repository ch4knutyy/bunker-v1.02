const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const { readBunkerView } = require('./bunker-view-test-helpers');
const view = readBunkerView();
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');

test('round blocks have labels, spacing, wrapping and responsive layout', () => {
  assert.match(view, /class="gm-round-control-block gm-round-state-block"/);
  assert.match(view, /class="gm-round-control-block gm-round-danger-zone"/);
  assert.match(view, /class="gm-round-control-block gm-timer-block"/);
  assert.match(view, /class="gm-field" for="gmManualRound"/);
  assert.match(view, /class="gm-field" for="gmTimerMinutes"/);
  assert.match(css, /\.gm-round-control-block[\s\S]*min-width:\s*0/);
  assert.match(css, /#gmRoundSection \.btn-gm-action[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /@media \(max-width: 560px\)[\s\S]*grid-template-columns:\s*1fr/);
  assert.doesNotMatch(css, /#gmRoundSection[^}]*overflow-x:\s*(auto|scroll)/);
});

test('primary, secondary, danger and disabled states remain distinct', () => {
  assert.match(view, /gm-action-primary/);
  assert.match(view, /gm-action-secondary/);
  assert.match(view, /gm-round-danger-zone/);
  assert.match(css, /\.gm-round-actions \.btn-gm-action:disabled[\s\S]*opacity/);
});
