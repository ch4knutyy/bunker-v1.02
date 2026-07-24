// ==================== APOCALYPSE VISUAL CONFIGURATION ====================

const apocalypseVisualThemeRegistry = Object.freeze({
	'extinction-red': Object.freeze({ categoryId: 'armageddon', cardVariant: 'nuclear' }),
	'storm-blue': Object.freeze({ categoryId: 'weather', cardVariant: 'climate' }),
	'biohazard-green': Object.freeze({ categoryId: 'biological', cardVariant: 'biological' }),
	'seismic-amber': Object.freeze({ categoryId: 'geological', cardVariant: 'collapse' }),
	'cosmic-violet': Object.freeze({ categoryId: 'cosmic', cardVariant: 'cosmic' }),
	'machine-cyan': Object.freeze({ categoryId: 'technology', cardVariant: 'ai' }),
	'wasteland-olive': Object.freeze({ categoryId: 'ecological', cardVariant: 'collapse' }),
	'collapse-rust': Object.freeze({ categoryId: 'social', cardVariant: 'collapse' }),
	'glitch-magenta': Object.freeze({ categoryId: 'anomaly', cardVariant: 'anomaly' }),
	'occult-indigo': Object.freeze({ categoryId: 'supernatural', cardVariant: 'mystical' })
});

const apocalypseCategoryThemeRegistry = Object.freeze(Object.fromEntries(
	Object.entries(apocalypseVisualThemeRegistry).map(([themeId, definition]) => [definition.categoryId, themeId])
));

const apocalypseVisualReactionTypes = Object.freeze([
	'apocalypse-reveal', 'apocalypse-effect', 'characteristic-reveal', 'timer-warning',
	'timer-critical', 'voting-start', 'voting-result', 'threat-reveal', 'round-change'
]);
const apocalypseEffectsLevels = Object.freeze(['off', 'subtle', 'atmospheric']);
const apocalypseEffectsPreferenceKey = 'bunker-apocalypse-effects-level';
const apocalypseAmbientEventsByTheme = Object.freeze({
	'extinction-red': Object.freeze(['ash-burst', 'smoke-pulse']),
	'storm-blue': Object.freeze(['lightning', 'mist-sweep']),
	'biohazard-green': Object.freeze(['spore-wave', 'toxic-bloom']),
	'seismic-amber': Object.freeze(['dust-burst', 'microcrack']),
	'cosmic-violet': Object.freeze(['cosmic-warp', 'star-pulse']),
	'machine-cyan': Object.freeze(['scanline-pulse', 'static-flicker']),
	'wasteland-olive': Object.freeze(['dust-burst', 'heat-haze']),
	'collapse-rust': Object.freeze(['rust-drip', 'dust-burst']),
	'glitch-magenta': Object.freeze(['glitch-pulse', 'chromatic-slip']),
	'occult-indigo': Object.freeze(['ritual-ring', 'shadow-smoke'])
});
const apocalypseAmbientEventTypes = Object.freeze([...new Set(Object.values(apocalypseAmbientEventsByTheme).flat())]);
const apocalypseModifierGroupPriority = Object.freeze({
	environment: Object.freeze(['drought','frost','flood','heat','storm','fog','ash','darkness','air-hazard','cosmic-impact']),
	contamination: Object.freeze(['toxic','radiation','spores','infection','mutation','nanotech','parasite','allergens','swarm']),
	world: Object.freeze(['emp','blackout','communication-failure','structural-damage','vegetation-collapse','reality-fracture','identity-shift','machine','unrest','psychological','undead','resource-scarcity'])
});
const apocalypseModifierEventSuppressions = Object.freeze({
	drought: Object.freeze(['rain-pass','flood-wave','condensation-wave','water-distortion']),
	frost: Object.freeze(['heat-shimmer','ember-trace','thermal-wave']),
	flood: Object.freeze(['dry-wind','dust-surge','water-evaporation-shimmer','heat-shimmer']),
	heat: Object.freeze(['frost-edge','cold-mist','snow-drift'])
});
