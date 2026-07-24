const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const postGame = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'post-game-story-director.js'), 'utf8');

const lines = game.split('\n');

function executableCallsMatching(pattern) {
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
    if (trimmed.startsWith('function ') || trimmed.startsWith('} //')) continue;
    const withoutStrings = line.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''").replace(/`[^`]*`/g, '``');
    if (pattern.test(withoutStrings)) hits.push({ line: i + 1, text: trimmed });
  }
  return hits;
}

test('gmThreatCommandPending is declared before registerSignalREvents() call', () => {
  const decl = game.indexOf('let gmThreatCommandPending');
  assert.notEqual(decl, -1, 'gmThreatCommandPending must be declared in game.js');
  const call = game.indexOf('if (typeof registerSignalREvents');
  assert.notEqual(call, -1, 'registerSignalREvents() call must exist');
  assert.ok(decl < call, `gmThreatCommandPending declaration (${decl}) must come before registerSignalREvents() call (${call})`);
});

test('currentGameCompletion is declared before bootstrap block', () => {
  const decl = game.indexOf('let currentGameCompletion');
  assert.notEqual(decl, -1, 'currentGameCompletion must be declared');
  const bootstrap = game.indexOf('registerSignalREvents()');
  assert.ok(decl < bootstrap, `currentGameCompletion declaration (${decl}) must come before bootstrap (${bootstrap})`);
});

test('exactly one executable registerSignalREvents() call', () => {
  const hits = executableCallsMatching(/registerSignalREvents\(\)/);
  assert.equal(hits.length, 1, `Expected exactly 1 executable registerSignalREvents() call, found ${hits.length}: ${JSON.stringify(hits)}`);
});

test('registration before connection.start()', () => {
  const regHits = executableCallsMatching(/registerSignalREvents\(\)/);
  const startHits = executableCallsMatching(/connection\.start\(\)/);
  assert.ok(regHits.length === 1 && startHits.length === 1, 'both must exist exactly once');
  assert.ok(regHits[0].line < startHits[0].line, 'registerSignalREvents() must come before connection.start()');
});

test('exactly one executable connection.start()', () => {
  const hits = executableCallsMatching(/connection\.start\(\)/);
  assert.equal(hits.length, 1, `Expected exactly 1 executable connection.start(), found ${hits.length}: ${JSON.stringify(hits)}`);
});

test('no setTimeout / var workarounds in synchronous bootstrap block', () => {
  const startLine = lines.findIndex(l => l.includes('if (typeof registerSignalREvents'));
  const connectionStartLine = lines.findIndex((l, i) => i > startLine && /connection\.start\(\)/.test(l));
  assert.ok(startLine >= 0 && connectionStartLine >= 0, 'bootstrap lines must exist');
  const area = lines.slice(startLine, connectionStartLine + 1).join('\n');
  assert.ok(!area.includes('setTimeout'), 'no setTimeout in synchronous bootstrap block');
  assert.ok(!/^\s*var\s/m.test(area), 'no var declarations in synchronous bootstrap block');
});

test('post-game-story-director.js does not call registerSignalREventsForPostGame', () => {
  assert.ok(!postGame.includes('registerSignalREventsForPostGame'), 'post-game-story-director.js must not reference registerSignalREventsForPostGame');
});
