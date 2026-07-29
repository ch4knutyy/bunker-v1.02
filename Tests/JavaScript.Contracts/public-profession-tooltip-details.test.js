const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const overview = fs.readFileSync('wwwroot/js/bunker/public-overview/runtime.js', 'utf8');
const professionStart = overview.indexOf("} else if (key === 'profession') {");
const professionEnd = overview.indexOf("} else if (key === 'hobby') {", professionStart);
const professionRenderer = overview.slice(professionStart, professionEnd);

test('public profession tooltip excludes skills without changing other detail categories', () => {
  assert.notEqual(professionStart, -1);
  assert.notEqual(professionEnd, -1);
  assert.match(professionRenderer, /add\(t\('qualification'\)/);
  assert.match(professionRenderer, /add\(t\('professionalItem'\)/);
  assert.match(professionRenderer, /add\(t\('bonus'\), professionBonus\)/);
  assert.doesNotMatch(professionRenderer, /skills|Skills|t\('skills'\)/);
  assert.match(overview, /key === 'profession' && professionBonus && tooltip === professionBonus[\s\S]*\? ''/);
  assert.match(overview, /} else if \(key === 'hobby'\) \{[\s\S]*add\(t\('bonus'\)/);
  assert.match(overview, /details\.map\(detail => `<div class="public-tooltip-detail-row">/);
});
