const path = require('node:path');
const root = path.resolve(__dirname, '..', '..');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const icons = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', 'icons.js'), 'utf8');
const visualConfig = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', 'visual-config.js'), 'utf8');
const state = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', 'state.js'), 'utf8');
const helpers = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', 'helpers.js'), 'utf8');
const render = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', 'render.js'), 'utf8');
const effects = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', 'effects.js'), 'utf8');
const index = fs.readFileSync(path.join(root, 'Views', 'Bunker', 'Index.cshtml'), 'utf8');

test('target files exist and are non-empty', () => {
  assert.ok(icons.length > 50, 'icons.js must be non-empty');
  assert.ok(visualConfig.length > 50, 'visual-config.js must be non-empty');
  assert.ok(state.length > 50, 'state.js must be non-empty');
  assert.ok(helpers.length > 100, 'helpers.js must be non-empty');
  assert.ok(render.length > 100, 'render.js must be non-empty');
  assert.ok(effects.length > 100, 'effects.js must be non-empty');
});

test('icons.js contains exactly apocalypseIconSvgRegistry and apocalypseCategoryIconRegistry', () => {
  assert.match(icons, /const apocalypseIconSvgRegistry = Object\.freeze/);
  assert.match(icons, /const apocalypseCategoryIconRegistry = Object\.freeze/);
  assert.ok(!icons.match(/function\s+\w+/), 'icons.js must not contain function declarations');
});

test('visual-config.js contains exactly the 9 config constants', () => {
  assert.match(visualConfig, /const apocalypseVisualThemeRegistry = Object\.freeze/);
  assert.match(visualConfig, /const apocalypseCategoryThemeRegistry = Object\.freeze/);
  assert.match(visualConfig, /const apocalypseVisualReactionTypes = Object\.freeze/);
  assert.match(visualConfig, /const apocalypseEffectsLevels = Object\.freeze/);
  assert.match(visualConfig, /const apocalypseEffectsPreferenceKey = /);
  assert.match(visualConfig, /const apocalypseAmbientEventsByTheme = Object\.freeze/);
  assert.match(visualConfig, /const apocalypseAmbientEventTypes = Object\.freeze/);
  assert.match(visualConfig, /const apocalypseModifierGroupPriority = Object\.freeze/);
  assert.match(visualConfig, /const apocalypseModifierEventSuppressions = Object\.freeze/);
  assert.ok(!visualConfig.match(/let |const.*= new Map|function\s+\w+/), 'visual-config.js must be pure config only');
});

test('state.js contains all mutable bindings', () => {
  assert.match(state, /const apocalypseReactionTimers = new Map/);
  assert.match(state, /let apocalypseEffectBannerTimer = null/);
  assert.match(state, /let apocalypseAmbientSchedulerTimer = null/);
  assert.match(state, /let apocalypseAmbientEventTimer = null/);
  assert.match(state, /let activeApocalypseCategoryProfile = null/);
  assert.match(state, /let lastApocalypseAmbientEventType = ''/);
  assert.match(state, /let apocalypseParallaxTimer = null/);
  assert.match(state, /let apocalypseParallaxInitialized = false/);
  assert.match(state, /let apocalypsePendingPointer = null/);
  assert.match(state, /let lastApocalypseCardRevealKey = ''/);
  assert.match(state, /let apocalypseCardRevealTimer = null/);
});

test('helpers.js contains pure helper functions', () => {
  assert.match(helpers, /function normalizeApocalypseMetadataValue/);
  assert.match(helpers, /function normalizeApocalypseVisualThemeId/);
  assert.match(helpers, /function resolveApocalypseVisualTheme/);
  assert.match(helpers, /function resolveApocalypseVisualVariant/);
  assert.match(helpers, /function normalizeApocalypseCategoryToken/);
  assert.match(helpers, /function getApocalypseDangerKey/);
  assert.match(helpers, /function getApocalypseDangerLabel/);
  assert.match(helpers, /function apocalypseEffectSummaryKey/);
  assert.match(helpers, /function prefersReducedApocalypseMotion/);
  assert.match(helpers, /function resolveApocalypseCategoryIconKey/);
  assert.match(helpers, /function normalizeLocalScenarioImageUrl/);
  assert.match(helpers, /function buildApocalypseScenarioModel/);
});

test('render.js contains render functions', () => {
  assert.match(render, /function createApocalypseCategoryIcon/);
  assert.match(render, /function clearApocalypseVisualTheme/);
  assert.match(render, /function applyApocalypseVisualTheme/);
  assert.match(render, /function syncApocalypseVisualTheme/);
  assert.match(render, /function renderApocalypseIcon/);
  assert.match(render, /function renderApocalypseContentSection/);
  assert.match(render, /function renderApocalypseScenario/);
  assert.match(render, /function renderApocalypseCategoryBadge/);
  assert.match(render, /function handleApocalypseHeroImageError/);
  assert.match(render, /function openCurrentApocalypseImage/);
});

test('effects.js contains effect runtime functions', () => {
  assert.match(effects, /function ensureApocalypseAmbientRoot/);
  assert.match(effects, /function getApocalypseEffectsLevel/);
  assert.match(effects, /function setApocalypseEffectsLevel/);
  assert.match(effects, /function syncApocalypseEffectsPreference/);
  assert.match(effects, /function clearApocalypseVisualReactions/);
  assert.match(effects, /function triggerApocalypseVisualReaction/);
  assert.match(effects, /function canRunApocalypseEnvironmentalEffects/);
  assert.match(effects, /function getApocalypseCategoryRegistry/);
  assert.match(effects, /function resolveApocalypseCategoryProfile/);
  assert.match(effects, /function getApocalypseCategoryEventPools/);
  assert.match(effects, /function clearApocalypseCategoryVisualState/);
  assert.match(effects, /function syncApocalypseCategoryVisualState/);
  assert.match(effects, /function clearApocalypseAmbientEvent/);
  assert.match(effects, /function triggerApocalypseAmbientEvent/);
  assert.match(effects, /function startApocalypseAmbientScheduler/);
  assert.match(effects, /function stopApocalypseAmbientScheduler/);
  assert.match(effects, /function resetApocalypseParallax/);
  assert.match(effects, /function flushApocalypseParallax/);
  assert.match(effects, /function queueApocalypseParallaxUpdate/);
  assert.match(effects, /function initApocalypseParallaxManager/);
  assert.match(effects, /function clearApocalypseCardRevealWave/);
  assert.match(effects, /function triggerApocalypseCardRevealWave/);
  assert.match(effects, /function syncDocumentVisibilityEffects/);
});

test('moved declarations are NOT in game.js', () => {
  const movedHelpers = ['normalizeApocalypseMetadataValue', 'normalizeApocalypseVisualThemeId',
    'resolveApocalypseVisualTheme', 'resolveApocalypseVisualVariant', 'normalizeApocalypseCategoryToken',
    'getApocalypseDangerKey', 'getApocalypseDangerLabel', 'apocalypseEffectSummaryKey',
    'prefersReducedApocalypseMotion', 'resolveApocalypseCategoryIconKey', 'buildApocalypseScenarioModel',
    'normalizeLocalScenarioImageUrl'];
  const movedRenders = ['renderApocalypseCategoryBadge', 'applyApocalypseVisualTheme',
    'syncApocalypseVisualTheme', 'createApocalypseCategoryIcon', 'renderApocalypseIcon',
    'renderApocalypseContentSection', 'renderApocalypseScenario', 'handleApocalypseHeroImageError',
    'openCurrentApocalypseImage', 'clearApocalypseVisualTheme'];
  const movedEffects = ['getApocalypseEffectsLevel', 'setApocalypseEffectsLevel',
    'syncApocalypseEffectsPreference', 'canRunApocalypseEnvironmentalEffects',
    'getApocalypseCategoryRegistry', 'resolveApocalypseCategoryProfile',
    'getApocalypseCategoryEventPools', 'clearApocalypseVisualReactions',
    'triggerApocalypseVisualReaction', 'ensureApocalypseAmbientRoot',
    'clearApocalypseAmbientEvent', 'triggerApocalypseAmbientEvent',
    'startApocalypseAmbientScheduler', 'stopApocalypseAmbientScheduler',
    'clearApocalypseCategoryVisualState', 'syncApocalypseCategoryVisualState',
    'clearApocalypseCardRevealWave', 'triggerApocalypseCardRevealWave',
    'resetApocalypseParallax', 'flushApocalypseParallax', 'queueApocalypseParallaxUpdate',
    'initApocalypseParallaxManager', 'syncDocumentVisibilityEffects'];

  for (const fn of [...movedHelpers, ...movedRenders, ...movedEffects]) {
    const regex = new RegExp(`function\\s+${fn}\\s*\\(`);
    assert.ok(!regex.test(game), `game.js must not contain function ${fn}`);
  }
});

test('intentionally retained functions remain in game.js', () => {
  assert.match(game, /function renderApocalypse\s*\(/);
  assert.match(game, /function registerSignalREvents\s*\(/);
  assert.match(game, /function syncPublicGameSettings\s*\(/);
  assert.match(game, /function showApocalypseEffectBanner\s*\(/);
  assert.match(game, /function hideApocalypseEffectBanner\s*\(/);
  assert.match(game, /function updateScenarioSectionVisibility\s*\(/);
  assert.match(game, /function isLobbyConfiguredSystemEnabled\s*\(/);
});

test('registerSignalREvents exists exactly once in game.js', () => {
  const matches = game.match(/function registerSignalREvents\s*\(/g);
  assert.ok(matches && matches.length === 1, 'registerSignalREvents must be declared exactly once');
});

test('bootstrap order preserved: registration before connection.start', () => {
  const regCallIdx = game.indexOf('if (typeof registerSignalREvents === \'function\') registerSignalREvents()');
  const startIdx = game.indexOf('connection.start()');
  assert.ok(regCallIdx > 0, 'registerSignalREvents() call must exist');
  assert.ok(startIdx > regCallIdx, 'registerSignalREvents() call must be before connection.start()');
});

test('no ES modules in target files', () => {
  for (const [name, content] of [['icons.js', icons], ['visual-config.js', visualConfig],
    ['state.js', state], ['helpers.js', helpers], ['render.js', render], ['effects.js', effects]]) {
    assert.ok(!content.match(/^export\s/m), `${name} must not use export`);
    assert.ok(!content.match(/^import\s/m), `${name} must not use import`);
  }
});

test('no top-level module startup in target files', () => {
  for (const [name, content] of [['icons.js', icons], ['visual-config.js', visualConfig],
    ['state.js', state], ['helpers.js', helpers], ['render.js', render], ['effects.js', effects]]) {
    assert.ok(!content.match(/\(function\s*\(\)/), `${name} must not use IIFE`);
    assert.ok(!content.match(/^document\.addEventListener.*DOMContentLoaded/m), `${name} must not have DOMContentLoaded listener`);
    assert.ok(!content.match(/^window\.addEventListener.*load/m), `${name} must not have load listener`);
  }
});

test('Index.cshtml loads all 6 apocalypse files before game.js', () => {
  const apocalypseIdx = index.indexOf('apocalypse/icons.js');
  const visualConfigIdx = index.indexOf('apocalypse/visual-config.js');
  const stateIdx = index.indexOf('apocalypse/state.js');
  const helpersIdx = index.indexOf('apocalypse/helpers.js');
  const renderIdx = index.indexOf('apocalypse/render.js');
  const effectsIdx = index.indexOf('apocalypse/effects.js');
  const gameIdx = index.indexOf('game.js');

  assert.ok(apocalypseIdx > 0, 'apocalypse/icons.js must be in Index.cshtml');
  assert.ok(visualConfigIdx > 0, 'apocalypse/visual-config.js must be in Index.cshtml');
  assert.ok(stateIdx > 0, 'apocalypse/state.js must be in Index.cshtml');
  assert.ok(helpersIdx > 0, 'apocalypse/helpers.js must be in Index.cshtml');
  assert.ok(renderIdx > 0, 'apocalypse/render.js must be in Index.cshtml');
  assert.ok(effectsIdx > 0, 'apocalypse/effects.js must be in Index.cshtml');

  assert.ok(apocalypseIdx < visualConfigIdx, 'icons.js before visual-config.js');
  assert.ok(visualConfigIdx < stateIdx, 'visual-config.js before state.js');
  assert.ok(stateIdx < helpersIdx, 'state.js before helpers.js');
  assert.ok(helpersIdx < renderIdx, 'helpers.js before render.js');
  assert.ok(renderIdx < effectsIdx, 'render.js before effects.js');
  assert.ok(effectsIdx < gameIdx, 'effects.js before game.js');
});

test('.gitkeep removed in populated apocalypse folder', () => {
  const gitkeepPath = path.join(root, 'wwwroot', 'js', 'bunker', 'apocalypse', '.gitkeep');
  assert.ok(!fs.existsSync(gitkeepPath), '.gitkeep should be removed from apocalypse folder');
});

test('apocalypseReactionTimers is declared only in state.js', () => {
  const stateDecl = state.match(/const apocalypseReactionTimers = new Map/);
  assert.ok(stateDecl, 'apocalypseReactionTimers must be in state.js');
  const gameDecl = game.match(/const apocalypseReactionTimers\s*=/);
  assert.ok(!gameDecl, 'apocalypseReactionTimers must not be in game.js');
});

test('apocalypseEffectBannerTimer is declared only in state.js', () => {
  const stateDecl = state.match(/let apocalypseEffectBannerTimer = null/);
  assert.ok(stateDecl, 'apocalypseEffectBannerTimer must be in state.js');
  const gameDecl = game.match(/let apocalypseEffectBannerTimer\s*=/);
  assert.ok(!gameDecl, 'apocalypseEffectBannerTimer must not be in game.js');
});

test('02B/02C files not broken', () => {
  const gameUtils = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'game-utils.js'), 'utf8');
  assert.ok(gameUtils.length > 100, 'game-utils.js must not be empty');
  const translations = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'translations.js'), 'utf8');
  assert.ok(translations.length > 100, 'translations.js must not be empty');
  const localization = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'localization.js'), 'utf8');
  assert.ok(localization.length > 100, 'localization.js must not be empty');
});
