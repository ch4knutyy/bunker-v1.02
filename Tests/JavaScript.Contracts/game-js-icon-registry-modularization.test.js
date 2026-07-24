const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const threatsIcons = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'threats', 'icons.js'), 'utf8');
const bunkerIcons = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'bunker', 'icons.js'), 'utf8');
const specialCardsIcons = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'special-cards', 'icons.js'), 'utf8');
const charactersIcons = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'characters', 'icons.js'), 'utf8');
const apocalypseIcons = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', 'icons.js'), 'utf8');
const apocalypseVisualConfig = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', 'visual-config.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'Views', 'Bunker', 'Index.cshtml'), 'utf8');

const lines = game.split('\n');

test('threatIconSvgRegistry is declared exactly once in threats/icons.js', () => {
  const matches = threatsIcons.match(/const threatIconSvgRegistry = Object\.freeze/);
  assert.ok(matches, 'threatIconSvgRegistry must be declared in threats/icons.js');
});

test('bunkerIconSvgRegistry is declared exactly once in bunker/icons.js', () => {
  const matches = bunkerIcons.match(/const bunkerIconSvgRegistry = Object\.freeze/);
  assert.ok(matches, 'bunkerIconSvgRegistry must be declared in bunker/icons.js');
});

test('specialCardIconSvgRegistry is declared exactly once in special-cards/icons.js', () => {
  const matches = specialCardsIcons.match(/const specialCardIconSvgRegistry = Object\.freeze/);
  assert.ok(matches, 'specialCardIconSvgRegistry must be declared in special-cards/icons.js');
});

test('characteristicIconRegistry, professionIconRegistry, characteristicIconSvgRegistry are in characters/icons.js', () => {
  assert.match(charactersIcons, /const characteristicIconRegistry = Object\.freeze/);
  assert.match(charactersIcons, /const professionIconRegistry = Object\.freeze/);
  assert.match(charactersIcons, /const characteristicIconSvgRegistry = Object\.freeze/);
});

test('publicCharacteristicDefinitions is declared in characters/icons.js', () => {
  assert.match(charactersIcons, /const publicCharacteristicDefinitions = Object\.freeze/);
});

test('registries are NOT declared in game.js', () => {
  const gameDeclarations = game.match(/const (threatIconSvgRegistry|bunkerIconSvgRegistry|specialCardIconSvgRegistry|characteristicIconRegistry|professionIconRegistry|characteristicIconSvgRegistry|publicCharacteristicDefinitions) = Object\.freeze/);
  assert.ok(!gameDeclarations, `game.js must not declare registries: ${gameDeclarations}`);
});

test('Index.cshtml loads icon files before game.js', () => {
  const threatsIdx = index.indexOf('threats/icons.js');
  const bunkerIdx = index.indexOf('bunker/icons.js');
  const specialIdx = index.indexOf('special-cards/icons.js');
  const charactersIdx = index.indexOf('characters/icons.js');
  const gameIdx = index.indexOf('game.js');
  assert.ok(threatsIdx > 0, 'threats/icons.js must be in Index.cshtml');
  assert.ok(bunkerIdx > 0, 'bunker/icons.js must be in Index.cshtml');
  assert.ok(specialIdx > 0, 'special-cards/icons.js must be in Index.cshtml');
  assert.ok(charactersIdx > 0, 'characters/icons.js must be in Index.cshtml');
  assert.ok(threatsIdx < gameIdx, 'threats/icons.js must load before game.js');
  assert.ok(bunkerIdx < gameIdx, 'bunker/icons.js must load before game.js');
  assert.ok(specialIdx < gameIdx, 'special-cards/icons.js must load before game.js');
  assert.ok(charactersIdx < gameIdx, 'characters/icons.js must load before game.js');
});

test('no type="module" in icon script tags', () => {
  assert.ok(!index.includes('type="module"'), 'no type="module" attribute allowed');
});

test('apocalypse icon and visual config registries are in their dedicated files, not in game.js', () => {
  assert.match(apocalypseIcons, /const apocalypseIconSvgRegistry = Object\.freeze/);
  assert.match(apocalypseIcons, /const apocalypseCategoryIconRegistry = Object\.freeze/);
  assert.match(apocalypseVisualConfig, /const apocalypseVisualThemeRegistry = Object\.freeze/);
  assert.match(apocalypseVisualConfig, /const apocalypseCategoryThemeRegistry = Object\.freeze/);
  assert.ok(!game.match(/const (apocalypseIconSvgRegistry|apocalypseCategoryIconRegistry|apocalypseVisualThemeRegistry|apocalypseCategoryThemeRegistry) = Object\.freeze/), 'registries must not be in game.js');
});

test('i18n script order is intact (translations before localization before icon files)', () => {
  const transIdx = index.indexOf('i18n/translations.js');
  const locIdx = index.indexOf('i18n/localization.js');
  const threatsIdx = index.indexOf('threats/icons.js');
  assert.ok(transIdx < locIdx, 'translations.js must load before localization.js');
  assert.ok(locIdx < threatsIdx, 'localization.js must load before icon files');
});

test('only five populated directories lost their .gitkeep', () => {
  const populated = ['threats', 'bunker', 'special-cards', 'characters', 'apocalypse'];
  for (const dir of populated) {
    const gitkeepPath = path.join(root, 'wwwroot', 'js', 'bunker', dir, '.gitkeep');
    assert.ok(!fs.existsSync(gitkeepPath), `${dir}/.gitkeep should be removed`);
  }
});

test('other .gitkeep files are preserved', () => {
  const preserved = ['core', 'diagnostics', 'events', 'global-content', 'gm', 'inventory', 'lobby', 'postgame', 'public-overview', 'rounds', 'timer', 'ui', 'voting'];
  for (const dir of preserved) {
    const gitkeepPath = path.join(root, 'wwwroot', 'js', 'bunker', dir, '.gitkeep');
    assert.ok(fs.existsSync(gitkeepPath), `${dir}/.gitkeep must be preserved`);
  }
});

test('registry consumers in game.js are not renamed', () => {
  assert.ok(game.includes('threatIconSvgRegistry['), 'threatIconSvgRegistry usage must remain');
  assert.ok(game.includes('bunkerIconSvgRegistry['), 'bunkerIconSvgRegistry usage must remain');
  assert.ok(game.includes('specialCardIconSvgRegistry['), 'specialCardIconSvgRegistry usage must remain');
  assert.ok(game.includes('characteristicIconRegistry.'), 'characteristicIconRegistry usage must remain');
  assert.ok(game.includes('professionIconRegistry['), 'professionIconRegistry usage must remain');
  assert.ok(game.includes('characteristicIconSvgRegistry['), 'characteristicIconSvgRegistry usage must remain');
  assert.ok(game.includes('publicCharacteristicDefinitions.'), 'publicCharacteristicDefinitions usage must remain');
});
