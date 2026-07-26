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

const apocalypsePhysicalThemeFallback = Object.freeze({
	archetype: 'generic-collapse',
	lighting: 'dim-neutral',
	air: 'dusty',
	contamination: 'none',
	damage: 'light',
	visibility: 'normal',
	accent: 'muted-amber',
	intensity: .18,
	lightingIntensity: .18,
	contaminationIntensity: .08,
	visibilityReduction: .04,
	animationIntensity: .03
});

const apocalypsePhysicalThemeProfiles = Object.freeze({
	nuclear: Object.freeze({ lighting: 'emergency-amber', air: 'dusty', contamination: 'radiation', damage: 'moderate', visibility: 'reduced', accent: 'muted-olive', intensity: .35, lightingIntensity: .28, contaminationIntensity: .18, visibilityReduction: .1, animationIntensity: .05 }),
	fire: Object.freeze({ lighting: 'ember-side', air: 'smoky', contamination: 'soot', damage: 'burned', visibility: 'reduced', accent: 'burnt-orange', intensity: .34, lightingIntensity: .26, contaminationIntensity: .2, visibilityReduction: .12, animationIntensity: .05 }),
	ice: Object.freeze({ lighting: 'cold-diffuse', air: 'condensed', contamination: 'frost', damage: 'weathered', visibility: 'softened', accent: 'steel-blue', intensity: .27, lightingIntensity: .2, contaminationIntensity: .13, visibilityReduction: .07, animationIntensity: .025 }),
	flood: Object.freeze({ lighting: 'wet-reflection', air: 'damp', contamination: 'condensation', damage: 'corroded', visibility: 'softened', accent: 'gray-teal', intensity: .29, lightingIntensity: .2, contaminationIntensity: .17, visibilityReduction: .06, animationIntensity: .035 }),
	pandemic: Object.freeze({ lighting: 'clinical-dim', air: 'filtered', contamination: 'quarantine', damage: 'light', visibility: 'normal', accent: 'hospital-gray-green', intensity: .24, lightingIntensity: .2, contaminationIntensity: .12, visibilityReduction: .03, animationIntensity: .015 }),
	biological: Object.freeze({ lighting: 'sickly-dim', air: 'humid', contamination: 'organic', damage: 'stained', visibility: 'softened', accent: 'muted-olive', intensity: .28, lightingIntensity: .17, contaminationIntensity: .2, visibilityReduction: .06, animationIntensity: .025 }),
	chemical: Object.freeze({ lighting: 'hazard-dim', air: 'foggy', contamination: 'chemical', damage: 'corroded', visibility: 'reduced', accent: 'faded-hazard', intensity: .31, lightingIntensity: .21, contaminationIntensity: .2, visibilityReduction: .11, animationIntensity: .025 }),
	volcanic: Object.freeze({ lighting: 'ember-side', air: 'ashy', contamination: 'soot', damage: 'scorched', visibility: 'reduced', accent: 'ash-brown', intensity: .32, lightingIntensity: .22, contaminationIntensity: .19, visibilityReduction: .12, animationIntensity: .035 }),
	desert: Object.freeze({ lighting: 'dust-dim', air: 'sandy', contamination: 'dust', damage: 'abraded', visibility: 'softened', accent: 'faded-sand', intensity: .25, lightingIntensity: .18, contaminationIntensity: .15, visibilityReduction: .07, animationIntensity: .025 }),
	darkness: Object.freeze({ lighting: 'local-emergency', air: 'still', contamination: 'none', damage: 'light', visibility: 'low', accent: 'dim-amber', intensity: .3, lightingIntensity: .14, contaminationIntensity: .03, visibilityReduction: .16, animationIntensity: .025 }),
	solar: Object.freeze({ lighting: 'unstable-cold', air: 'static', contamination: 'electrical-noise', damage: 'systems', visibility: 'normal', accent: 'pale-electric', intensity: .27, lightingIntensity: .2, contaminationIntensity: .1, visibilityReduction: .04, animationIntensity: .05 }),
	war: Object.freeze({ lighting: 'emergency-amber', air: 'dusty', contamination: 'debris', damage: 'severe', visibility: 'reduced', accent: 'military-olive', intensity: .33, lightingIntensity: .24, contaminationIntensity: .16, visibilityReduction: .09, animationIntensity: .035 }),
	machine: Object.freeze({ lighting: 'mechanical-cold', air: 'static', contamination: 'electrical-noise', damage: 'systems', visibility: 'normal', accent: 'cold-white', intensity: .24, lightingIntensity: .2, contaminationIntensity: .09, visibilityReduction: .03, animationIntensity: .045 }),
	anomalous: Object.freeze({ lighting: 'misaligned', air: 'still', contamination: 'none', damage: 'light', visibility: 'softened', accent: 'bruise-gray', intensity: .23, lightingIntensity: .17, contaminationIntensity: .06, visibilityReduction: .06, animationIntensity: .035 }),
	'generic-collapse': apocalypsePhysicalThemeFallback
});

// Resolver helpers consume these immutable profiles at render time.
