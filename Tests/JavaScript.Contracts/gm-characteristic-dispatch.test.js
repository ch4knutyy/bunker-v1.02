const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

test('GM characteristic dispatch preserves named fields, special formatters and unknown input', () => {
  const nodes = new Map();
  const context = vm.createContext({
    document: { getElementById: id => {
      if (!id) return null;
      if (!nodes.has(id)) nodes.set(id, { classList: { add() {}, remove() {} } });
      return nodes.get(id);
    } },
    gmPlayersData: { p: {} }, selectedPlayerForGM: 'p', t: key => key,
    getLocalizedValue: (value, key) => value?.[key],
    getConditionDisplayName: value => value.name || value.Name,
    getPropertyDisplay: value => value.name || value.Name
  });
  vm.runInContext(fs.readFileSync(path.resolve(__dirname, '../../wwwroot/js/bunker/gm/runtime.js'), 'utf8'), context);
  const named = ['Profession', 'PhysicalHealth', 'MentalHealth', 'Hobby', 'CharacterTrait', 'Phobia', 'Inventory', 'Property'];
  const render = (key, data) => {
    context.gmPlayersData.p = data;
    context.revealCharInGMPanel(key);
    return nodes.get(`gm${key}`)?.textContent;
  };
  for (const casing of ['camel', 'pascal']) {
    const values = named.map(key => render(key, {
      [casing === 'camel' ? key[0].toLowerCase() + key.slice(1) : key]:
        key === 'Inventory' ? { Items: [{ Name: key }] } : { Name: key }
    }));
    assert.deepEqual(values, named);
  }
  assert.deepEqual(named.map(key => render(key, {})), named.map(key => key === 'Property' ? 'propertyUnavailable' : 'unknown'));
  assert.equal(render('Body', { Body: { Height: 0, Weight: 75, BodyType: 'type' } }), '0 см, 75 кг, type');
  assert.equal(render('Personality', { Personality: { Age: 30, Sex: 'sex', IsChildfree: true } }), '30 років, sex, Чайлдфрі');
  assert.equal(render('Fact', { fact: { fact: 'localized fact' }, Fact: { Name: 'fallback' } }), 'localized fact');
  const before = [...nodes.keys()];
  render('SecretGoal', {});
  assert.deepEqual([...nodes.keys()], before);
  context.gmPlayersData = {};
  assert.doesNotThrow(() => context.revealCharInGMPanel('Body'));
});
