const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('GM peek and player switching work without the legacy write-only reveal map', () => {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, { value: '', style: {}, classList: new Set() });
    const result = elements.get(id);
    result.classList.remove = name => result.classList.delete(name);
    return result;
  };
  const calls = [];
  const context = vm.createContext({
    document: { getElementById: element, querySelector: () => null },
    gmPlayersData: { p1: { Name: 'First', Body: { Height: 180, Weight: 75 } }, p2: { name: 'Second' } },
    selectedPlayerForGM: 'p1', t: key => key,
    connection: { invoke: (...args) => { calls.push(args); return Promise.resolve(); } }
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../wwwroot/js/bunker/gm/runtime.js'), 'utf8'), context);
  element('gmPlayerSelect').value = 'p1';
  context.loadPlayerDataForGM();
  assert.equal(element('gmBody').textContent, 'hidden');
  context.peekCharacteristic('Body');
  assert.equal(element('gmBody').textContent, '180 см, 75 кг');
  assert.equal(element('gmBody').classList.has('gm-char-revealed'), true);
  assert.deepEqual(calls, [['PeekCharacteristic', 'p1', 'Body']]);
  element('gmPlayerSelect').value = 'p2';
  context.loadPlayerDataForGM();
  assert.equal(element('gmBody').textContent, 'hidden');
  assert.equal(element('gmBody').classList.has('gm-char-revealed'), false);
  assert.equal('gmRevealedChars' in context, false);
});
