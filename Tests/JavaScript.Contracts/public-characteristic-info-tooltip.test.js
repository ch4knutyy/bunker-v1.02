const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const overview = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'public-overview', 'runtime.js'), 'utf8');
const tooltip = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'tooltip.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'wwwroot', 'css', 'game.css'), 'utf8');
const hub = fs.readFileSync(path.join(root, 'Hubs', 'BunkerHubGame', 'GameHub.GameActions.cs'), 'utf8');
const translations = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'translations.js'), 'utf8');

test('public cards use a semantic neutral info button only when public detail data exists', () => {
  assert.match(overview, /function renderPublicCharacteristicTooltip\(/);
  assert.match(overview, /<button type="button" class="tooltip-trigger public-info-trigger"[\s\S]*aria-expanded="false"[\s\S]*aria-controls=/);
  assert.match(overview, /<svg viewBox="0 0 24 24"/);
  assert.doesNotMatch(overview, /public-info-trigger[^\n]*>!<|public-characteristic-tooltip[^\n]*>!/);
  assert.match(overview, /return details\.length \|\| description \? \{ details, description \} : null/);
  assert.match(css, /\.public-info-trigger\s*\{[\s\S]*border: 1px solid[\s\S]*background: rgba\(8, 11, 13, \.86\)/);
});

test('property, profession and hobby details remain public, structured and localized', () => {
  assert.match(overview, /key === 'property'[\s\S]*getPropertyPresentation\(source\)\.details/);
  assert.match(overview, /key === 'profession'[\s\S]*t\('qualification'\)[\s\S]*t\('experience'\)/);
  assert.match(overview, /key === 'hobby'[\s\S]*t\('hobbyRelatedItem'\)[\s\S]*t\('bonus'\)/);
  assert.match(overview, /key === 'property' && source\) return getPropertyPresentation\(source\)\.title/);
  assert.doesNotMatch(overview, /renderPublicPropertyDetails/);
  assert.match(hub, /player\.Profession\.ProfessionalLevel/);
  for (const key of ['additionalInformationAria', 'qualification', 'experience', 'professionalItem', 'hobbyRelatedItem', 'skills', 'bonus']) {
    assert.equal((translations.match(new RegExp(`${key}:`, 'g')) || []).length, 3, `${key} must be localized`);
  }
});

test('shared tooltip retains one listener set and supports escape plus pointer transition', () => {
  assert.equal((tooltip.match(/document\.addEventListener\('click'/g) || []).length, 1);
  assert.match(tooltip, /event\.key === 'Escape'/);
  assert.match(tooltip, /portal\?\.contains\(event\.relatedTarget\)/);
  assert.match(tooltip, /ensurePortal\(\)\.addEventListener\('pointerenter'/);
  assert.match(overview, /getPublicRevealedSource\(player, key\)[\s\S]*revealedSources/);
  assert.doesNotMatch(overview.slice(overview.indexOf('function getPublicRevealedSource'), overview.indexOf('function renderPublicCharacteristicCard')), /myPlayerData/);
});
