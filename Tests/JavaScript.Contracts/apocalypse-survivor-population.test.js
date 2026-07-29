const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = path => fs.readFileSync(path, 'utf8');
const settingsSource = read('wwwroot/js/bunker/core/world-settings.js');
const helpers = read('wwwroot/js/bunker/apocalypse/helpers.js');
const renderer = read('wwwroot/js/bunker/apocalypse/render.js');
const translations = read('wwwroot/js/bunker/i18n/translations.js');
const apocalypseContent = read('wwwroot/data/Apocalypses/apocalypses.json');

function functionSource(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', source.indexOf(') {', start));
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unclosed ${name}`);
}

const worldPopulationSettings = new Function(`${settingsSource}; return worldPopulationSettings;`)();
const localeStrings = {
  uk: { unknown: 'Невідомо', peopleRemaining: 'Вижило людей', survivorPopulationPercent: '{percent}% населення', survivorPopulationTooltip: 'Після катастрофи залишилося приблизно {survivors} із {population} людей.', survivorPopulationAria: 'Вижило людей: приблизно {survivors}, {percent} відсотків населення.' },
  en: { unknown: 'Unknown', peopleRemaining: 'People remaining', survivorPopulationPercent: '{percent}% of the population', survivorPopulationTooltip: 'Approximately {survivors} of {population} people remain after the catastrophe.', survivorPopulationAria: 'People remaining: approximately {survivors}, {percent} percent of the population.' },
  ru: { unknown: 'Неизвестно', peopleRemaining: 'Выжило людей', survivorPopulationPercent: '{percent}% населения', survivorPopulationTooltip: 'После катастрофы осталось примерно {survivors} из {population} человек.', survivorPopulationAria: 'Выжило людей: примерно {survivors}, {percent} процентов населения.' }
};
const api = new Function('worldPopulationSettings', 'getCurrentLanguage', 't', [
  functionSource(helpers, 'calculateApocalypseSurvivorPopulation'),
  functionSource(helpers, 'getApocalypsePopulationLocale'),
  functionSource(helpers, 'formatApocalypsePopulationCompact'),
  functionSource(helpers, 'formatApocalypsePopulationExact'),
  functionSource(helpers, 'buildApocalypseSurvivorPresentation'),
  'return { calculateApocalypseSurvivorPopulation, formatApocalypsePopulationCompact, buildApocalypseSurvivorPresentation };'
].join('\n'))(worldPopulationSettings, () => 'uk', key => localeStrings.uk[key] || key);

test('survivor population is a validated, localized derived apocalypse presentation', () => {
  assert.equal(worldPopulationSettings.beforeApocalypse, 8_200_000_000);
  assert.deepEqual([35, 8, 10, 55, 2, 100, 0].map(api.calculateApocalypseSurvivorPopulation), [2_870_000_000, 656_000_000, 820_000_000, 4_510_000_000, 164_000_000, 8_200_000_000, 0]);
  assert.deepEqual([NaN, Infinity, -1, 101, '35', null].map(api.calculateApocalypseSurvivorPopulation), [null, null, null, null, null, null]);
  assert.deepEqual([
    api.formatApocalypsePopulationCompact(2_870_000_000, 'uk'),
    api.formatApocalypsePopulationCompact(820_000_000, 'ru'),
    api.formatApocalypsePopulationCompact(6_560_000_000, 'en'),
    api.formatApocalypsePopulationCompact(820_000, 'uk')
  ], ['2,87 млрд', '820 млн', '6.56B', '820 тис.']);
  assert.match(api.buildApocalypseSurvivorPresentation(35, 'uk').tooltip, /2\D*870\D*000\D*000[\s\S]*8\D*200\D*000\D*000/u);
  assert.equal(api.buildApocalypseSurvivorPresentation(NaN, 'uk').compact, 'Невідомо');
  assert.match(renderer, /renderApocalypseSurvivorMetric\(model\.survivalChance\)/);
  const survivorMetric = functionSource(renderer, 'renderApocalypseSurvivorMetric');
  assert.match(survivorMetric, /peopleRemaining/);
  assert.match(survivorMetric, /apocalypse-survivor-percentage[\s\S]*tooltip-trigger|tooltip-trigger[\s\S]*apocalypse-survivor-percentage/);
  assert.doesNotMatch(`${renderer}\n${apocalypseContent}`, /t\('survivalChance'\)|survivorsCount|alivePeople|remainingPopulation|formattedPopulation/);
  for (const [language, label] of Object.entries({ uk: 'Вижило людей', en: 'People remaining', ru: 'Выжило людей' })) assert.match(translations, new RegExp(`peopleRemaining: ['\"]${label}`));
});
