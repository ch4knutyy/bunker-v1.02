const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const materialManifest = JSON.parse(fs.readFileSync('wwwroot/assets/ui/materials/material-assets-manifest.json', 'utf8'));
const apocalypseManifest = JSON.parse(fs.readFileSync('wwwroot/assets/ui/apocalypse-effects/apocalypse-effects-manifest.json', 'utf8'));
const classification = JSON.parse(fs.readFileSync('wwwroot/data/visual-themes/bunker-visual-classification.json', 'utf8'));
const materialCss = fs.readFileSync('wwwroot/css/bunker-materials.css', 'utf8');

test('classification resolves bounded material and apocalypse layers with safe fallbacks', async () => {
  const context = vm.createContext({
    console,
    location: { hostname: 'test' },
    document: { getElementById: () => null, querySelector: () => null },
    fetch: async url => ({ ok: true, json: async () => url.includes('apocalypse-effects') ? apocalypseManifest : materialManifest })
  });
  context.window = context;
  for (const path of [
    'wwwroot/js/bunker/bunker/theme-resolver.js',
    'wwwroot/js/bunker/bunker/material-assets.js',
    'wwwroot/js/bunker/bunker/material-profiles.js',
    'wwwroot/js/bunker/bunker/material-resolver.js',
    'wwwroot/js/bunker/apocalypse/effect-assets.js'
  ]) vm.runInContext(fs.readFileSync(path, 'utf8'), context);
  await Promise.all([context.loadBunkerMaterialManifest(), context.loadApocalypseEffectManifest()]);

  const marineRecord = classification.bunkers.find(record => record.id === 'shipyard_bunker');
  const marineTheme = context.resolveBunkerVisualTheme({ id: marineRecord.id }, marineRecord);
  const marine = context.resolveBunkerMaterialPresentation(marineTheme);
  const fallback = context.resolveBunkerMaterialPresentation({ id: 'unknown', materialProfile: 'missing', category: 'missing', condition: 'unknown', modifiers: [] });
  const poor = context.resolveBunkerMaterialPresentation({ id: 'poor', materialProfile: 'marine-steel', category: 'maritime_underwater', condition: 'poor', modifiers: ['corroded'] });
  const apocalypseLayers = context.buildApocalypseEffectLayers('nuclear-fallout');
  const allPaths = [...materialManifest.baseMaterials, ...materialManifest.overlays].map(asset => `wwwroot${asset.path.replaceAll('/', '\\')}`);

  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('[bunkerMaterialAssetState.materialsById.size, bunkerMaterialAssetState.overlaysById.size, validateBunkerMaterialIntegration().length]', context))), [44, 27, 0]);
  assert.deepEqual(JSON.parse(JSON.stringify(vm.runInContext('[Object.keys(bunkerMaterialProfiles).length, new Set(Object.values(bunkerMaterialProfiles).map(profile => profile.structureFamily)).size]', context))), [26, 8]);
  assert(classification.bunkers.every(record => vm.runInContext(`Boolean(bunkerMaterialProfiles[${JSON.stringify(record.materialProfileId)}])`, context)));
  assert.deepEqual([marine.profile.id, marine.baseAsset.id, marine.fallbackLevel], ['marine-steel', 'marine-steel', 'exact']);
  assert.deepEqual([fallback.profile.id, fallback.baseAsset.id, fallback.fallbackLevel], ['neutral-industrial', 'rough-concrete', 'neutral-industrial']);
  assert(poor.conditionLayers.length <= 2 && new Set(poor.conditionLayers.map(layer => layer.asset.usage)).size === poor.conditionLayers.length);
  assert(poor.conditionLayers.length + apocalypseLayers.length <= 5 && apocalypseLayers.length <= 3);
  assert(allPaths.every(path => fs.existsSync(path)) && /bunker-readability-veil[\s\S]*z-index:\s*3[\s\S]*bunker-visual-content[\s\S]*z-index:\s*4/.test(materialCss));
});
