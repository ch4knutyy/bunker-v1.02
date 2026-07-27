const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const readJson = path => JSON.parse(fs.readFileSync(path, 'utf8'));
const bunkerRegistry = readJson('wwwroot/data/visual-themes/bunker-visual-classification.json');
const apocalypseRegistry = readJson('wwwroot/data/visual-themes/apocalypse-realistic-visual-classification.json');
const foundationCss = fs.readFileSync('wwwroot/css/visual-foundation.css', 'utf8');
const bunkerCss = fs.readFileSync('wwwroot/css/bunker-theme.css', 'utf8');
const apocalypseCss = fs.readFileSync('wwwroot/css/apocalypse-physical-theme.css', 'utf8');

function createThemeContext() {
  const classes = new Set();
  const properties = new Map();
  const body = {
    dataset: {},
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name)
    },
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: name => properties.delete(name)
    }
  };
  const context = vm.createContext({
    console,
    document: { body, getElementById: () => null },
    fetch: async url => ({
      ok: true,
      json: async () => url.includes('bunker-visual') ? bunkerRegistry : apocalypseRegistry
    })
  });
  context.window = context;
  context.window.location = { hostname: 'test' };
  for (const path of [
    'wwwroot/js/bunker/core/visual-theme-registries.js',
    'wwwroot/js/bunker/bunker/theme-resolver.js',
    'wwwroot/js/bunker/bunker/theme-manager.js',
    'wwwroot/js/bunker/apocalypse/visual-config.js',
    'wwwroot/js/bunker/apocalypse/helpers.js',
    'wwwroot/js/bunker/apocalypse/render.js'
  ]) vm.runInContext(fs.readFileSync(path, 'utf8'), context);
  return { context, body, classes };
}

test('classification registries drive independent deterministic theme layers with neutral fallback', async () => {
  const { context, body, classes } = createThemeContext();
  await context.loadVisualThemeRegistries();

  const bunker = context.resolveBunkerVisualTheme({ id: 'shipyard_bunker', name: 'ignored' });
  const apocalypse = context.resolveApocalypseVisualTheme({ id: 'iron_plague', name: 'ignored' });
  context.applyBunkerVisualTheme(bunker);
  context.applyApocalypseVisualTheme(apocalypse);
  context.applyBunkerVisualTheme(bunker);
  context.applyApocalypseVisualTheme(apocalypse);
  const fallback = {
    bunker: context.resolveBunkerVisualTheme({ id: 'unknown-bunker' }),
    apocalypse: context.resolveApocalypseVisualTheme({ id: 'unknown-apocalypse' })
  };

  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('[visualThemeRegistryState.bunkerById.size, visualThemeRegistryState.apocalypseById.size]', context))), [205, 220]);
  assert.deepEqual(JSON.parse(JSON.stringify([bunker.family, bunker.category, bunker.materialProfile, bunker.variation])), ['maritime', 'maritime_underwater', 'marine-steel', 1]);
  assert.deepEqual(JSON.parse(JSON.stringify([apocalypse.family, apocalypse.archetype, apocalypse.effects, apocalypse.variation])), ['contamination', 'corrosive_decay', ['corrosion', 'pitting', 'material-decay'], 1]);
  assert.deepEqual([body.dataset.bunkerFamily, body.dataset.apocalypseFamily, body.dataset.bunkerVariation, body.dataset.apocalypseVariation], ['maritime', 'contamination', '1', '1']);
  assert.deepEqual([fallback.bunker.archetype, fallback.bunker.material, fallback.apocalypse.archetype], ['civilian', 'painted-metal', 'generic-collapse']);
  assert.equal([...classes].filter(name => name.endsWith('theme-active')).length, 2);
  assert.match(`${foundationCss}\n${bunkerCss}`, /--surface-raised:[\s\S]*--button-disabled:[\s\S]*data-bunker-modifiers/);
  assert.doesNotMatch(apocalypseCss, /apocalypse-theme-active\.bunker-theme-active[\s\S]*background:\s*(?!var\(--button)/);
});
