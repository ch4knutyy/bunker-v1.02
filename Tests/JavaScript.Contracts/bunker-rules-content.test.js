const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('wwwroot/js/bunker-rules-content.js', 'utf8');
const rulesView = fs.readFileSync('Views/Home/Rules.cshtml', 'utf8');
const gameView = fs.readFileSync('Views/Bunker/Index.cshtml', 'utf8');
const siteTranslations = fs.readFileSync('wwwroot/js/site.js', 'utf8');

test('Bunker rules use one localized source for the full rules page', () => {
  for (const language of ['uk:', 'en:', 'ru:']) assert.match(source, new RegExp(`\\b${language}`));
  for (const heading of ['Що це за гра', 'Мета гри', 'Швидкий старт', 'Що робити у свій хід', 'Апокаліпсис і бункер', 'Персонаж і характеристики', 'Розкриття характеристик і кредити', 'Раунди', 'Голосування', 'Спеціальні карти', 'Інвентар', 'Загрози', 'Роль ведучого', 'Виключення гравця', 'Перепідключення', 'Поради новачкам']) assert.match(source, new RegExp(heading));
  assert.match(source, /function renderFull\(\)/);
  assert.match(rulesView, /id="bunker"[\s\S]*data-bunker-rules-full/);
  assert.doesNotMatch(gameView, /gameRulesModal|data-bunker-rules-button|openGameRules/);
  assert.match(source, /href="\/rules#bunker"/);
  assert.match(source, /howToPlay: 'Як грати'|howToPlay: 'How to play'|howToPlay: 'Как играть'/);
  assert.doesNotMatch(`${rulesView}\n${siteTranslations}`, /Правила режиму Бункер будуть додані тут|Bunker mode rules will be added here|Правила режима Бункер будут добавлены здесь|bunkerRulesText/);
  assert.doesNotMatch(source, /SignalR|commandId|payload/);
});
