const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const game = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const tooltip = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'tooltip.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'wwwroot', 'css', 'tooltip.css'), 'utf8');

function method(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}' && --depth === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unclosed ${name}`);
}

function buildTooltip(effect, lang) {
  const source = method(game, 'buildAdditionalPhysicalConditionTooltip');
  const labels = {
    uk: 'важка форма',
    ru: 'тяжёлая форма',
    en: 'severe'
  };
  const factory = new Function(
    'getCurrentLanguage', 'getLocalization', 'cleanTooltipText', 'getConditionSeverityLabel', 'escapeHtml',
    `${source}; return buildAdditionalPhysicalConditionTooltip;`
  );
  const fn = factory(
    () => lang,
    value => value.localization,
    value => String(value || '').trim(),
    (_value, language) => labels[language],
    value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  );
  return fn(effect, lang);
}

const radiation = {
  baseName: 'Променева хвороба',
  severityCode: 'hard',
  description: 'Опис сервера українською',
  localization: {
    uk: { name: 'Променева хвороба', descriptions: { hard: 'Сильне ураження організму радіацією.' } },
    ru: { name: 'Лучевая болезнь', descriptions: { hard: 'Тяжёлое поражение организма радиацией.' } },
    en: { name: 'Radiation sickness', descriptions: { hard: 'Severe radiation damage to the body.' } }
  }
};

test('additional condition tooltip has its own localized name, severity and description', () => {
  const uk = buildTooltip(radiation, 'uk');
  assert.match(uk, /Променева хвороба/);
  assert.match(uk, /Важка форма/);
  assert.match(uk, /Сильне ураження організму радіацією/);
  assert.doesNotMatch(uk, /опис основного PhysicalHealth/i);
});

test('UA, RU and EN use the matching localization', () => {
  assert.match(buildTooltip(radiation, 'uk'), /Сильне ураження/);
  assert.match(buildTooltip(radiation, 'ru'), /Тяжёлое поражение/);
  assert.match(buildTooltip(radiation, 'en'), /Severe radiation damage/);
});

test('two conditions retain two independent descriptions', () => {
  const burn = structuredClone(radiation);
  burn.localization.uk = { name: 'Опік', descriptions: { hard: 'Глибоке ушкодження тканин.' } };
  const first = buildTooltip(radiation, 'uk');
  const second = buildTooltip(burn, 'uk');
  assert.match(first, /радіацією/);
  assert.doesNotMatch(first, /ушкодження тканин/);
  assert.match(second, /ушкодження тканин/);
  assert.doesNotMatch(second, /радіацією/);
});

test('missing localized description does not borrow another illness or language description', () => {
  const withoutDescription = structuredClone(radiation);
  withoutDescription.localization.en = { name: 'Radiation sickness', descriptions: {} };
  withoutDescription.description = 'Не підставляти цей український опис';
  const result = buildTooltip(withoutDescription, 'en');
  assert.match(result, /Radiation sickness/);
  assert.match(result, /Severe/);
  assert.doesNotMatch(result, /український опис/);
});

test('card, table and live-rendered rows use the same delegated tooltip component', () => {
  assert.match(game, /renderAdditionalPhysicalCondition\(effect, '\+ '\)/);
  assert.match(game, /additionalConditionEffects\.map\(effect =>[\s\S]*renderAdditionalPhysicalCondition\(effect\)/);
  assert.match(game, /mergeThreatPlayerSnapshots\(data\)[\s\S]*renderCurrentGameUI\(\)/);
  assert.match(tooltip, /document\.addEventListener\('pointerover'/);
  assert.match(tooltip, /document\.addEventListener\('focusin'/);
  assert.match(tooltip, /document\.addEventListener\('click'/);
});

test('shared portal is fixed, viewport-corrected and does not clip long descriptions', () => {
  assert.match(tooltip, /document\.body\.appendChild\(portal\)/);
  assert.match(tooltip, /getBoundingClientRect/);
  assert.match(tooltip, /window\.innerWidth/);
  assert.match(tooltip, /window\.innerHeight/);
  assert.match(css, /\.tooltip-portal\s*\{[\s\S]*position:\s*fixed/);
  assert.match(css, /\.tooltip-portal\s*\{[\s\S]*z-index:\s*100000/);
  assert.match(css, /overflow-wrap:\s*anywhere/);
  assert.match(css, /max-height:\s*calc\(100vh - 24px\)/);
});
