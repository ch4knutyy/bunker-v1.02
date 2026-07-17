const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');

function method(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const signatureEnd = source.indexOf(') {', start);
  const open = source.indexOf('{', signatureEnd);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unclosed ${name}`);
}

function hobbyHelpers(lang = 'uk') {
  const source = ['formatHobbyExperience', 'formatHobbyRelatedItem', 'buildHobbyCardDetails', 'resolveHobbyCardTooltip']
    .map(name => method(game, name)).join('\n');
  const localized = (value, field) => value?._i18n?.[field]?.[lang] ?? value?.[field] ?? value?.[field?.charAt(0).toUpperCase() + field.slice(1)] ?? '';
  const clean = value => String(value || '').trim();
  const factory = new Function('getCurrentLanguage', 'getLocalizedValue', 'cleanTooltipText', 'nonEmptyCardDetail', 't', 'getLocalizedByFields',
    `${source}; return { formatHobbyExperience, buildHobbyCardDetails, resolveHobbyCardTooltip };`);
  return factory(
    () => lang,
    localized,
    clean,
    (label, value) => value !== null && value !== undefined && String(value).trim() ? { label, value: String(value) } : null,
    key => ({ cardExperience: { uk:'Досвід', ru:'Опыт', en:'Experience' }, cardAdditionalItem: { uk:'Додатково має', ru:'Дополнительно имеет', en:'Also has' } }[key]?.[lang] || key),
    (value, fields, fallback) => fields.map(field => localized(value, field)).find(Boolean) || fallback
  );
}

test('Hobby details conditionally render experience and canonical item without empty rows', () => {
  const { buildHobbyCardDetails } = hobbyHelpers('uk');
  const both = buildHobbyCardDetails({ experienceYears: 6, item: 'Гончарний круг' });
  assert.deepEqual(both.details, [
    { label: 'Досвід', value: '6 років' },
    { label: 'Додатково має', value: 'Гончарний круг' }
  ]);
  assert.deepEqual(buildHobbyCardDetails({ experience: 2 }).details, [{ label: 'Досвід', value: '2 роки' }]);
  assert.deepEqual(buildHobbyCardDetails({ equipment: 'Різці' }).details, [{ label: 'Додатково має', value: 'Різці' }]);
  assert.deepEqual(buildHobbyCardDetails({ experienceYears: 0, item: '  ' }).details, []);
});

test('numeric experience pluralizes in UA RU EN and localized strings are not duplicated', () => {
  const uk = hobbyHelpers('uk').formatHobbyExperience;
  assert.equal(uk(1), '1 рік');
  assert.equal(uk(2), '2 роки');
  assert.equal(uk(6), '6 років');
  assert.equal(uk('6 років'), '6 років');
  assert.equal(hobbyHelpers('ru').formatHobbyExperience(5), '5 лет');
  assert.equal(hobbyHelpers('en').formatHobbyExperience(1), '1 year');
  assert.equal(hobbyHelpers('en').formatHobbyExperience(4), '4 years');
});

test('localized Item is preferred and item or experience alone do not create a tooltip', () => {
  const { buildHobbyCardDetails, resolveHobbyCardTooltip } = hobbyHelpers('en');
  const hobby = { experienceYears: 6, item: 'Гончарний круг', _i18n: { item: { en: 'Pottery wheel' } }, tooltip: 'отримує бонусом: pottery wheel.' };
  const details = buildHobbyCardDetails(hobby);
  assert.equal(details.item, 'Pottery wheel');
  assert.equal(resolveHobbyCardTooltip(hobby, details.item), '');
  assert.equal(resolveHobbyCardTooltip({ bonus:'Improves fine motor skills', item:'Tools' }, 'Tools'), 'Improves fine motor skills');
});

test('frontend maps actual Item plus compatible aliases and keeps renderer replacement idempotent', () => {
  assert.match(game, /item: source\.item \?\? source\.Item/);
  assert.match(game, /experienceYears: source\.experienceYears \?\? source\.ExperienceYears \?\? source\.experience \?\? source\.Experience/);
  assert.match(game, /relatedItem:[^\n]*source\.item \?\? source\.Item[^\n]*source\.additionalItem[^\n]*source\.equipment/);
  assert.match(game, /type:'Hobby'[\s\S]*details:hobbyCardDetails\.details[\s\S]*resolveHobbyCardTooltip/);
  assert.match(game, /container\.innerHTML = `\$\{renderEliminatedRevealAllPanel\(player\)\}\$\{models\.map\(renderCharacteristicCard\)\.join\(''\)\}`/);
});

