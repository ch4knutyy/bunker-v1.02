const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const read = path => fs.readFileSync(path, 'utf8');
const renderer = read('wwwroot/js/bunker/apocalypse/render.js');
const runtime = read('wwwroot/js/bunker/apocalypse/runtime.js');
const bunker = read('wwwroot/js/bunker/bunker/runtime.js');
const events = read('wwwroot/js/bunker/apocalypse/signalr-events.js');
const story = read('wwwroot/js/bunker/core/story-flow.js');
const css = read('wwwroot/css/game.css');

test('apocalypse and bunker covers remain canonical, centered, and locally updatable', () => {
  assert.ok(story.indexOf("move('apocalypsePanel', apocalypse)") < story.indexOf("move('bunkerPanel', bunker)"));
  assert.match(runtime, /renderApocalypseScenario\(buildApocalypseScenarioModel\(apocalypse\), options\)/);
  assert.doesNotMatch(`${renderer}\n${runtime}\n${bunker}`, /select(?:Random)?(?:Apocalypse|Bunker)/i);
  assert.match(renderer, /cinematic-section apocalypse-scenario-shell[\s\S]*cinematic-cover__hero[\s\S]*apocalypse-cover__content[\s\S]*renderApocalypseCoverSurvivors\(model\.survivalChance\)[\s\S]*<\/div>\s*<section class="cinematic-details">[\s\S]*cinematic-details__metrics apocalypse-metrics/);
  assert.match(renderer, /renderApocalypseHeroImage\(model\.imageUrl\)[\s\S]*renderApocalypseSurvivorMetric\(model\.survivalChance\)/);
  assert.match(bunker, /(?=[\s\S]*renderBunkerFacility\(buildBunkerFacilityModel\(bunker\)\))(?=[\s\S]*cinematic-section bunker-cinematic-shell[\s\S]*bunker-cinematic-stage[\s\S]*bunker-cover__content[\s\S]*renderBunkerCoverSummary\(model, capacityValue\)[\s\S]*<\/div>\s*<section class="cinematic-details">[\s\S]*cinematic-details__metrics bunker-metrics)(?![\s\S]*bunker-facility-shell)/);
  assert.match(`${renderer}\n${bunker}`, /(?=[\s\S]*apocalypse-primary-content-grid[\s\S]*apocMainThreats[\s\S]*apocSurvivalRequirements)(?=[\s\S]*developerFeatureEnabled\('scenarioImages'\))(?=[\s\S]*bunker-image-controls)/);
  assert.match(`${renderer}\n${events}\n${bunker}`, /(?=[\s\S]*image\.complete)(?=[\s\S]*image\.decode)(?=[\s\S]*finally)(?=[\s\S]*updateApocalypseHeroImage\(imageUrl\))(?=[\s\S]*updateBunkerHeroImage\(imageUrl\))/);
  assert.match(css, /(?=[\s\S]*\.bunker-game-page #gameSection\.game-story-page\s*\{[\s\S]*width: 100vw)(?=[\s\S]*#bunkerStorySection\s*\{[\s\S]*width: 100%[\s\S]*max-width: none)(?=[\s\S]*#bunkerStorySection \.scenario-immersive-panel,[\s\S]*#bunkerStorySection \.bunker-cinematic-stage\s*\{[\s\S]*max-width: none)(?=[\s\S]*\.cinematic-cover__content\s*\{[\s\S]*margin-inline: auto[\s\S]*align-items: center[\s\S]*text-align: center)(?=[\s\S]*\.cinematic-details\s*\{[\s\S]*width: min\(calc\(100% - clamp\(2rem, 8vw, 8rem\)\), 1320px\))(?=[\s\S]*:not\(#apocalypseStorySection\):not\(#bunkerStorySection\))(?![\s\S]*bunker-facility-shell)/);
});
