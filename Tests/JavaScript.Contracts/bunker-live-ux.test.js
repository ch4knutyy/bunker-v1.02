const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const characters = fs.readFileSync('wwwroot/js/bunker/characters/runtime.js', 'utf8');
const entry = fs.readFileSync('wwwroot/js/bunker/core/entry-performance.js', 'utf8');
const sharedRules = fs.readFileSync('wwwroot/js/bunker-rules-content.js', 'utf8');

test('live UX keeps credits compact and visuals non-blocking', () => {
  assert.match(characters, /function syncRevealCreditBadge\(player\)/);
  assert.doesNotMatch(characters, /function renderRevealCreditStatus\(/);
  assert.match(entry, /if \(image\.complete\) void finish\(image\.naturalWidth > 0\)/);
  assert.match(entry, /setBunkerEntryState\(optionalFailure \? 'degraded' : 'ready'\)/);
  assert.match(sharedRules, /href="\/rules#bunker"/);
});
