// Налаштування джерела для Bootstrap-order та i18n тестів з використанням относних шляхів на рівні проєкту
const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');

// Імпорт необхідних модулів
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

// Для тесту bootstrap порядку — i18n вида
const game = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const i18n = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'translations.js'), 'utf8');
const localization = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'localization.js'), 'utf8');

// Визначення допоміжної функції для отримання частини функції за її назвою
function method(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unclosed ${name}`);
}

// Тест на правильний порядок та кількість браузерних інтеграцій
// Версія, яка відповідає поточній структурі game.js і попередньому культурному того факту, що content/script (або ознаком не було DOM)

test('bootstrap использует registerSignalREvents в правильном порядке', () => {
  // Убеждаемся, что game.js строит connection первым
  assert.match(game, /^const connection = new signalR.HubConnectionBuilder/, 'signalr-lite строется первым');

  // registerSignalREvents вызывается после connection builder, но перед connection.start (синхронно)
  const registerIndex = game.indexOf('if (typeof registerSignalREvents === \'function\') registerSignalREvents()');
  assert.notEqual(registerIndex, -1, 'registerSignalREvents должен быть вызван до connection.start');

  assert.ok(registerIndex > 0 && registerIndex < game.indexOf('connection.start()'),
    'registerSignalREvents должен быть вызван после соединения builder и перед connection.start');

  const consoleLogIndex = game.indexOf('[SignalR] about to call connection.start()');
  const connectionStartIndex = game.indexOf('connection.start()');
  assert.ok(consoleLogIndex >= 0 && consoleLogIndex < connectionStartIndex,
    'Журнал должен быть выведен перед connection.start');

  // Убеждаемся, что registerSignalREvents объявлен выше
  assert.match(game, /function registerSignalREvents\(/, 'registerSignalREvents должен быть объявлен в game.js');
});

test('dom-безпечні i18n модулі завантажуються перед game.js', () => {
  const index = fs.readFileSync(path.join(root, 'Views', 'Bunker', 'Index.cshtml'), 'utf8');
  const transIdx = index.indexOf('i18n/translations.js');
  const locIdx = index.indexOf('i18n/localization.js');
  const gameIdx = index.indexOf('game.js');

  assert.notEqual(transIdx, -1, 'translations.js повинен знаходиться в Index.cshtml');
  assert.notEqual(locIdx, -1, 'localization.js повинен знаходиться в Index.cshtml');
  assert.notEqual(gameIdx, -1, 'game.js повинен знаходиться в Index.cshtml');

  assert.ok(transIdx < gameIdx, 'translations.js повинен знаходиться перед game.js');
  assert.ok(locIdx < gameIdx, 'localization.js повинен знаходиться перед game.js');

  const transContent = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'translations.js'), 'utf8');
  const locContent = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'localization.js'), 'utf8');
  assert.ok(transContent.includes('const uiTranslations = {'), 'translations.js повинен містити uiTranslations');
  assert.ok(locContent.includes('function getCurrentLanguage'), 'localization.js повинен містити getCurrentLanguage');
  assert.ok(locContent.includes('function t(key)'), 'localization.js повинен містити t');
  assert.ok(locContent.includes('function changeLanguage'), 'localization.js повинен містити changeLanguage');

  const i18nLinesInGame = game.split('\n').filter(l =>
    l.includes('translations.js') || l.includes('localization.js') ||
    l.includes('uiTranslations') || l.includes('getCurrentLanguage') ||
    l.includes('function t') || l.includes('function changeLanguage')
  );
  assert.equal(i18nLinesInGame.length, 0, `game.js повинен бути очищений від i18n-ідентифікаторів; знайдено ${i18nLinesInGame.map(l => `"${l}"`).join(', ')}`);

  // Дуже важливий тест на те, що у сторінці є синхронні &lt;script> теги для цих двох модулів
  const script1 = index.match(/i18n\/translations\.js/g);
  const script2 = index.match(/i18n\/localization\.js/g);
  assert.ok(script1?.length === 1, 'точно один тег для translations.js повинен знаходиться в Index.cshtml');
  assert.ok(script2?.length === 1, 'точно один тег для localization.js повинен знаходиться в Index.cshtml');
});

// Тест, який гарантує, що обробники посилань для i18n-совместимого коду знаходяться
// в localization.js, а не у game.js
test('всі i18n-обробники знаходяться в localization.js', () => {
  const loc = localization;

  // localization.js містить functions getCurrentLanguage, setCurrentLanguage, t, локалізацію, normalizer
  assert.match(loc, /function getCurrentLanguage\(/);
  assert.match(loc, /function setCurrentLanguage\(/);
  assert.match(loc, /function t\(/);

  // Типові i18n-допоміжні функції (extract, get, helper)
  assert.match(loc, /function getRawField\(/);
  assert.match(loc, /function getLocalizedValue\(/);
  assert.match(loc, /function getLocalizedArray\(/);
  assert.match(loc, /function getLocalizedByFields\(/);
  assert.match(loc, /function getI18nLocalizedValue\(/);
  assert.match(loc, /function getLocalizedPhysicalField\(/);
  assert.match(loc, /function sentenceCase\(/);
  assert.match(loc, /function toCamelCase\(/);

  // Localization keys and text blocks
  assert.match(loc, /function eventCardLocalized\(/);
  assert.match(loc, /function scenarioUiText\(/);
  assert.match(loc, /function scenarioTypeLabel\(/);
  assert.match(loc, /function eventCardPublicNoticeText\(/);
  assert.match(loc, /function getTooltipTypeClass\(/);

  // localization.js НІКОЛИ не повинен містити uiTranslations — вони знаходяться в translations.js
  assert.doesNotMatch(loc, /const uiTranslations = {/);
  assert.doesNotMatch(loc, /const translations = {/);

  // Ніякі з цих функцій не повинні знаходиться в game.js
  const i18nFunctions = [
    'function getCurrentLanguage',
    'function setCurrentLanguage',
    'function t(',
    'function localizeServerMessage',
    'function getI18n',
    'function getLocalization',
    'function getRawField',
    'function getLocalizedValue',
    'function getLocalizedArray',
    'function getLocalizedByFields',
    'function getI18nLocalizedValue',
    'function getLocalizedPhysicalField',
    'function sentenceCase',
    'function toCamelCase',
    'function eventCardLocalized',
    'function scenarioUiText',
    'function scenarioTypeLabel',
    'function eventCardPublicNoticeText',
    'function getTooltipTypeClass'
  ];

  for (const fn of i18nFunctions) {
    const match = game.match(new RegExp(fn));
    assert.ok(!match, `i18n function ${fn} повинно бути винесене з game.js до localization.js`);
  }
});
