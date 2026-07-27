const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const manifest = JSON.parse(fs.readFileSync('wwwroot/assets/ui/apocalypse-effects/apocalypse-effects-manifest.json', 'utf8'));
const css = fs.readFileSync('wwwroot/assets/ui/apocalypse-effects/apocalypse-effects.css', 'utf8');

test('manifest presets produce at most three safe non-repeating apocalypse card layers', async () => {
  const context = vm.createContext({
    console,
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    fetch: async () => ({ ok: true, json: async () => manifest })
  });
  context.window = context;
  vm.runInContext(fs.readFileSync('wwwroot/js/bunker/apocalypse/effect-assets.js', 'utf8'), context);
  await context.loadApocalypseEffectManifest();

  const counts = vm.runInContext("apocalypseEffectUsages.map(usage => apocalypseEffectAssetState.byUsage.get(usage).length)", context);
  const nuclear = context.resolveApocalypseVisualPreset({ family: 'contamination', archetype: 'fallout_radiation' });
  const layers = context.buildApocalypseEffectLayers(nuclear);
  const fallback = context.resolveApocalypseVisualPreset({ family: 'unknown', archetype: 'unknown' });

  assert.equal(vm.runInContext('apocalypseEffectAssetState.byId.size', context), 80);
  assert.deepEqual(JSON.parse(JSON.stringify(counts)), [16, 41, 9, 14]);
  assert.equal(nuclear.id, 'nuclear-fallout');
  assert.deepEqual(JSON.parse(JSON.stringify(layers.map(layer => [layer.asset.id, layer.asset.usage]))), [['radiation-dust', 'universal'], ['contamination-corners', 'edge'], ['critical-haze', 'ui']]);
  assert(layers.length <= 3 && new Set(layers.map(layer => layer.asset.usage)).size === layers.length);
  assert.equal(fallback.id, 'neutral-industrial');
  assert(manifest.effects.every(effect => effect.repeatable === false));
  assert.match(css, /pointer-events:\s*none[\s\S]*background-repeat:\s*no-repeat[\s\S]*data-effect-usage="edge"[\s\S]*100% 100%/);
});
