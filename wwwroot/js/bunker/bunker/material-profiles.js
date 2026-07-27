// Профілі матеріалів описують ролі; маніфест залишається джерелом істини для фізичних ресурсів.

const bunkerMaterialStructureFamilies = Object.freeze({
	'anodized-metal-dark-glass': 'advanced',
	'armored-steel': 'armored',
	'ceramic-composite-steel': 'clinical',
	'concrete-enamel-steel': 'concrete',
	'concrete-painted-steel': 'concrete',
	'concrete-steel-bars': 'armored',
	'damaged-mixed-materials': 'improvised',
	'dark-glass-composite': 'advanced',
	'dark-wood-climate-metal': 'luxury',
	'dark-wood-leather-brass': 'luxury',
	'heavy-painted-steel': 'industrial',
	'insulated-steel-concrete': 'industrial',
	'insulated-steel-frosted-glass': 'advanced',
	'marine-steel': 'maritime',
	'mixed-salvaged-materials': 'improvised',
	'painted-concrete-plastic': 'concrete',
	'painted-metal-wood-plastic': 'industrial',
	'painted-steel-concrete': 'armored',
	'reinforced-concrete-industrial-metal': 'concrete',
	'reinforced-steel-concrete': 'armored',
	'rock-earth-natural': 'concrete',
	'rock-steel-timber': 'industrial',
	'sealed-steel-composite': 'advanced',
	'stone-brick-aged-metal': 'concrete',
	'stone-wood-aged-brass': 'luxury',
	'wet-painted-metal-concrete': 'maritime'
});

function createBunkerMaterialProfile(id, baseMaterialId, secondaryMaterialId, accentMaterialId, glassMaterialId, options = {}) {
	return Object.freeze({
		id,
		baseMaterialId,
		secondaryMaterialId: secondaryMaterialId || '',
		accentMaterialId: accentMaterialId || '',
		glassMaterialId: glassMaterialId || '',
		conditionOverlayIds: Object.freeze(options.conditionOverlayIds || []),
		cssTone: options.cssTone || 'industrial',
		surfaceContrast: options.surfaceContrast || 'medium',
		textureScale: options.textureScale || '512px',
		panelTreatment: options.panelTreatment || 'reinforced',
		edgeTreatment: options.edgeTreatment || 'restrained',
		structureFamily: options.structureFamily || bunkerMaterialStructureFamilies[id] || 'industrial'
	});
}

const bunkerMaterialProfiles = Object.freeze({
	'anodized-metal-dark-glass': createBunkerMaterialProfile('anodized-metal-dark-glass', 'anodized-aluminum', 'dark-steel', 'brushed-stainless-steel', 'dark-glass', { cssTone: 'advanced', panelTreatment: 'technical' }),
	'armored-steel': createBunkerMaterialProfile('armored-steel', 'military-painted-steel', 'dark-steel', 'aged-brass', 'wired-safety-glass', { cssTone: 'military', conditionOverlayIds: ['faded-warning-markings', 'impact-abrasion'] }),
	'ceramic-composite-steel': createBunkerMaterialProfile('ceramic-composite-steel', 'medical-ceramic', 'compact-clinical-laminate', 'brushed-stainless-steel', 'quarantine-frosted-glass', { cssTone: 'clinical', surfaceContrast: 'light', panelTreatment: 'clean-institutional' }),
	'concrete-enamel-steel': createBunkerMaterialProfile('concrete-enamel-steel', 'rough-concrete', 'white-enamel-steel', 'galvanized-steel', 'wired-safety-glass', { cssTone: 'underground', textureScale: '680px', conditionOverlayIds: ['dried-water-stains'] }),
	'concrete-painted-steel': createBunkerMaterialProfile('concrete-painted-steel', 'institutional-painted-concrete', 'painted-metal', 'galvanized-steel', 'wired-safety-glass', { cssTone: 'civil-defense', textureScale: '640px', panelTreatment: 'institutional' }),
	'concrete-steel-bars': createBunkerMaterialProfile('concrete-steel-bars', 'rough-concrete', 'dark-steel', 'galvanized-steel', '', { cssTone: 'institutional', textureScale: '700px', conditionOverlayIds: ['grime-dust'] }),
	'damaged-mixed-materials': createBunkerMaterialProfile('damaged-mixed-materials', 'salvaged-mixed-metal', 'sealed-plywood', 'rusted-metal', 'smoked-polycarbonate', { cssTone: 'improvised', conditionOverlayIds: ['peeling-paint-fragments', 'corroded-edge-chips'] }),
	'dark-glass-composite': createBunkerMaterialProfile('dark-glass-composite', 'advanced-carbon-composite', 'laboratory-plastic', 'anodized-aluminum', 'dark-glass', { cssTone: 'laboratory', panelTreatment: 'technical' }),
	'dark-wood-climate-metal': createBunkerMaterialProfile('dark-wood-climate-metal', 'aged-dark-wood', 'painted-metal', 'aged-brass', 'wired-safety-glass', { cssTone: 'luxury', textureScale: '580px', panelTreatment: 'refined' }),
	'dark-wood-leather-brass': createBunkerMaterialProfile('dark-wood-leather-brass', 'aged-dark-wood', 'aged-leather', 'aged-brass', 'dark-glass', { cssTone: 'luxury', textureScale: '600px', panelTreatment: 'refined' }),
	'heavy-painted-steel': createBunkerMaterialProfile('heavy-painted-steel', 'painted-metal', 'dark-steel', 'industrial-rubber', 'wired-safety-glass', { cssTone: 'industrial', conditionOverlayIds: ['oil-smear', 'weld-burn-heat-marks'] }),
	'insulated-steel-concrete': createBunkerMaterialProfile('insulated-steel-concrete', 'fireproof-mineral-board', 'galvanized-steel', 'aged-copper', 'wired-safety-glass', { cssTone: 'reactor', textureScale: '620px', conditionOverlayIds: ['electric-arc-scorch'] }),
	'insulated-steel-frosted-glass': createBunkerMaterialProfile('insulated-steel-frosted-glass', 'cryogenic-insulated-composite', 'white-enamel-steel', 'anodized-aluminum', 'quarantine-frosted-glass', { cssTone: 'advanced', conditionOverlayIds: ['frost-ice'], panelTreatment: 'sealed' }),
	'marine-steel': createBunkerMaterialProfile('marine-steel', 'marine-steel', 'submarine-enamel-steel', 'aged-copper', 'wired-safety-glass', { cssTone: 'maritime', conditionOverlayIds: ['condensation-moisture', 'corroded-edge-chips'], panelTreatment: 'sealed' }),
	'mixed-salvaged-materials': createBunkerMaterialProfile('mixed-salvaged-materials', 'salvaged-mixed-metal', 'sealed-plywood', 'rusted-metal', 'smoked-polycarbonate', { cssTone: 'improvised', conditionOverlayIds: ['impact-abrasion', 'chips-edge-damage'] }),
	'painted-concrete-plastic': createBunkerMaterialProfile('painted-concrete-plastic', 'institutional-painted-concrete', 'laboratory-plastic', 'galvanized-steel', 'wired-safety-glass', { cssTone: 'institutional', textureScale: '640px' }),
	'painted-metal-wood-plastic': createBunkerMaterialProfile('painted-metal-wood-plastic', 'painted-metal', 'sealed-plywood', 'sanitation-hdpe', 'wired-safety-glass', { cssTone: 'civil-defense', conditionOverlayIds: ['grime-dust'] }),
	'painted-steel-concrete': createBunkerMaterialProfile('painted-steel-concrete', 'painted-metal', 'institutional-painted-concrete', 'powder-coated-steel', 'wired-safety-glass', { cssTone: 'civil-defense', conditionOverlayIds: ['faded-warning-markings'] }),
	'reinforced-concrete-industrial-metal': createBunkerMaterialProfile('reinforced-concrete-industrial-metal', 'rough-concrete', 'galvanized-steel', 'dark-steel', 'wired-safety-glass', { cssTone: 'underground', textureScale: '720px', panelTreatment: 'monumental' }),
	'reinforced-steel-concrete': createBunkerMaterialProfile('reinforced-steel-concrete', 'military-painted-steel', 'rough-concrete', 'dark-steel', 'wired-safety-glass', { cssTone: 'military', textureScale: '640px', panelTreatment: 'reinforced' }),
	'rock-earth-natural': createBunkerMaterialProfile('rock-earth-natural', 'natural-stone', 'sealed-plywood', 'waxed-canvas', '', { cssTone: 'underground', textureScale: '760px', conditionOverlayIds: ['dried-water-stains'] }),
	'rock-steel-timber': createBunkerMaterialProfile('rock-steel-timber', 'natural-stone', 'galvanized-steel', 'aged-dark-wood', '', { cssTone: 'industrial', textureScale: '740px', conditionOverlayIds: ['sand-grit'] }),
	'sealed-steel-composite': createBunkerMaterialProfile('sealed-steel-composite', 'powder-coated-steel', 'advanced-carbon-composite', 'brushed-stainless-steel', 'smoked-polycarbonate', { cssTone: 'laboratory', panelTreatment: 'sealed' }),
	'stone-brick-aged-metal': createBunkerMaterialProfile('stone-brick-aged-metal', 'natural-stone', 'aged-dark-wood', 'rusted-metal', '', { cssTone: 'underground', textureScale: '720px', conditionOverlayIds: ['grime-dust'] }),
	'stone-wood-aged-brass': createBunkerMaterialProfile('stone-wood-aged-brass', 'natural-stone', 'aged-dark-wood', 'aged-brass', 'dark-glass', { cssTone: 'luxury', textureScale: '700px', panelTreatment: 'ritual' }),
	'wet-painted-metal-concrete': createBunkerMaterialProfile('wet-painted-metal-concrete', 'institutional-painted-concrete', 'painted-metal', 'galvanized-steel', 'wired-safety-glass', { cssTone: 'maritime', conditionOverlayIds: ['condensation-moisture', 'corroded-edge-chips'] })
});

const bunkerCategoryMaterialProfileIds = Object.freeze({
	military_command: 'armored-steel', government_security: 'painted-steel-concrete',
	medical_clinical: 'ceramic-composite-steel', scientific_laboratory: 'dark-glass-composite',
	digital_control: 'anodized-metal-dark-glass', industrial_production: 'heavy-painted-steel',
	energy_infrastructure: 'insulated-steel-concrete', water_sanitation: 'wet-painted-metal-concrete',
	transit_infrastructure: 'concrete-enamel-steel', mining_extraction: 'rock-steel-timber',
	maritime_underwater: 'marine-steel', agricultural_food: 'painted-metal-wood-plastic',
	luxury_hospitality: 'dark-wood-leather-brass', civic_public: 'painted-concrete-plastic',
	subterranean_urban: 'reinforced-concrete-industrial-metal', detention: 'concrete-steel-bars',
	historic_fortified: 'stone-brick-aged-metal', religious_ritual: 'stone-wood-aged-brass',
	natural_cavern: 'rock-earth-natural', polar_cryogenic: 'insulated-steel-frosted-glass',
	civil_defense: 'concrete-painted-steel', community_improvised: 'mixed-salvaged-materials',
	archive_cultural: 'dark-wood-climate-metal', fortified_vault: 'reinforced-steel-concrete',
	contaminated_isolation: 'sealed-steel-composite', abandoned_damaged: 'damaged-mixed-materials'
});

const bunkerNeutralMaterialProfile = createBunkerMaterialProfile(
	'neutral-industrial',
	'rough-concrete',
	'painted-metal',
	'galvanized-steel',
	'wired-safety-glass',
	{ cssTone: 'industrial', textureScale: '640px', panelTreatment: 'restrained', structureFamily: 'industrial' });

function getBunkerMaterialProfile(profileId) {
	return bunkerMaterialProfiles[normalizeBunkerMaterialToken(profileId)] || null;
}
