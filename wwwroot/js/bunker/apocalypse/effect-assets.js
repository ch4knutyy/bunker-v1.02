// Classic-script globals are intentional: the Bunker client does not use ES modules.

const apocalypseEffectManifestPath = '/assets/ui/apocalypse-effects/apocalypse-effects-manifest.json';
const apocalypseEffectUsages = Object.freeze(['universal', 'local', 'edge', 'ui']);
const apocalypseEffectBlendModes = new Set(['normal', 'multiply', 'soft-light', 'overlay', 'screen']);

const apocalypseEffectAssetState = {
	loadPromise: null,
	loaded: false,
	byId: new Map(),
	byUsage: new Map(apocalypseEffectUsages.map(usage => [usage, []])),
	byFamily: new Map(),
	error: null
};

function normalizeApocalypseEffectToken(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function normalizeApocalypseEffectAsset(source) {
	const id = normalizeApocalypseEffectToken(source?.id);
	const usage = normalizeApocalypseEffectToken(source?.usage);
	const family = normalizeApocalypseEffectToken(source?.family);
	const path = String(source?.path ?? '').trim();
	if (!id || !apocalypseEffectUsages.includes(usage) || !family ||
		!/^\/assets\/ui\/apocalypse-effects\/[a-z0-9/_-]+\.png$/i.test(path)) return null;
	const maximum = Math.max(0, Math.min(.4, Number(source.maxOpacity) || .2));
	const opacity = Math.max(0, Math.min(maximum, Number(source.defaultOpacity) || .1));
	return Object.freeze({
		id,
		number: Number(source.number) || 0,
		path,
		usage,
		family,
		repeatable: false,
		backgroundSize: usage === 'edge' ? '100% 100%' : 'cover',
		blendMode: apocalypseEffectBlendModes.has(source.blendMode) ? source.blendMode : 'soft-light',
		defaultOpacity: opacity,
		maxOpacity: maximum
	});
}

function indexApocalypseEffectAssets(records) {
	const assets = records.map(normalizeApocalypseEffectAsset).filter(Boolean);
	apocalypseEffectAssetState.byId = new Map(assets.map(asset => [asset.id, asset]));
	apocalypseEffectAssetState.byUsage = new Map(apocalypseEffectUsages.map(usage => [
		usage,
		Object.freeze(assets.filter(asset => asset.usage === usage))
	]));
	apocalypseEffectAssetState.byFamily = new Map();
	for (const asset of assets) {
		const familyAssets = apocalypseEffectAssetState.byFamily.get(asset.family) || [];
		familyAssets.push(asset);
		apocalypseEffectAssetState.byFamily.set(asset.family, familyAssets);
	}
	for (const [family, familyAssets] of apocalypseEffectAssetState.byFamily)
		apocalypseEffectAssetState.byFamily.set(family, Object.freeze(familyAssets));
	return apocalypseEffectAssetState;
}

function loadApocalypseEffectManifest() {
	if (apocalypseEffectAssetState.loadPromise) return apocalypseEffectAssetState.loadPromise;
	apocalypseEffectAssetState.loadPromise = fetch(apocalypseEffectManifestPath, { cache: 'force-cache' })
		.then(response => {
			if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
			return response.json();
		})
		.then(payload => indexApocalypseEffectAssets(Array.isArray(payload?.effects) ? payload.effects : []))
		.catch(error => {
			apocalypseEffectAssetState.error = error;
			return apocalypseEffectAssetState;
		})
		.then(state => {
			state.loaded = true;
			if (typeof currentApocalypse !== 'undefined' && currentApocalypse &&
				typeof applyApocalypseVisualState === 'function') applyApocalypseVisualState(currentApocalypse);
			initApocalypseEffectPreview();
			return state;
		});
	return apocalypseEffectAssetState.loadPromise;
}

function getApocalypseEffectAsset(effectId) {
	return apocalypseEffectAssetState.byId.get(normalizeApocalypseEffectToken(effectId)) || null;
}

function getApocalypseEffectAssetsByUsage(usage) {
	return apocalypseEffectAssetState.byUsage.get(normalizeApocalypseEffectToken(usage)) || Object.freeze([]);
}

function getApocalypseEffectAssetsByFamily(family) {
	return apocalypseEffectAssetState.byFamily.get(normalizeApocalypseEffectToken(family)) || Object.freeze([]);
}

function createApocalypseVisualPreset(id, primaryEffectId, edgeEffectId, uiEffectId, tone, intensity = 1) {
	return Object.freeze({
		id,
		primaryEffectId,
		edgeEffectId: edgeEffectId || '',
		uiEffectId: uiEffectId || '',
		tone: normalizeApocalypseEffectToken(tone),
		intensity: Math.max(.4, Math.min(1, Number(intensity) || 1))
	});
}

const apocalypseVisualPresets = Object.freeze({
	'nuclear-fallout': createApocalypseVisualPreset('nuclear-fallout', 'radiation-dust', 'contamination-corners', 'critical-haze', 'radiation', .82),
	'fungal-biohazard': createApocalypseVisualPreset('fungal-biohazard', 'spore-film', 'contamination-corners', '', 'bio', .76),
	'toxic-chemical': createApocalypseVisualPreset('toxic-chemical', 'toxic-residue', 'contamination-corners', 'critical-haze', 'chemical', .72),
	'corrosive-decay': createApocalypseVisualPreset('corrosive-decay', 'corrosion-runoff', 'sandblasted-edge-wear', '', 'chemical', .78),
	firestorm: createApocalypseVisualPreset('firestorm', 'ash-fallout', 'burnt-edge-mask', 'critical-haze', 'fire', .82),
	'cryogenic-winter': createApocalypseVisualPreset('cryogenic-winter', 'blizzard-ice-dust', 'frost-edge-mask', '', 'cold', .74),
	'flood-humidity': createApocalypseVisualPreset('flood-humidity', 'humidity-fog-film', '', '', 'moisture', .72),
	'drought-dust': createApocalypseVisualPreset('drought-dust', 'drought-dust', 'sandblasted-edge-wear', '', 'arid', .76),
	'industrial-collapse': createApocalypseVisualPreset('industrial-collapse', 'collapse-debris-dust', 'emergency-warning-mask', 'critical-haze', 'structural', .74),
	'emp-system-failure': createApocalypseVisualPreset('emp-system-failure', 'electrical-scorch', 'failed-containment-ui', 'emp-static', 'signal', .65),
	'spatial-anomaly': createApocalypseVisualPreset('spatial-anomaly', 'optical-distortion-traces', '', 'anomaly-static-film', 'anomaly', .56),
	'quarantine-medical': createApocalypseVisualPreset('quarantine-medical', 'infection-film', 'quarantine-markings', 'critical-haze', 'bio', .68),
	'volcanic-ash': createApocalypseVisualPreset('volcanic-ash', 'volcanic-grit', 'burnt-edge-mask', '', 'fire', .78),
	'war-destruction': createApocalypseVisualPreset('war-destruction', 'blast-dust-residue', 'emergency-warning-mask', 'critical-haze', 'structural', .76),
	'marine-corrosion': createApocalypseVisualPreset('marine-corrosion', 'brackish-salt-spray', 'sandblasted-edge-wear', '', 'moisture', .72),
	'storm-damage': createApocalypseVisualPreset('storm-damage', 'storm-abrasion', '', 'emergency-power-flicker', 'signal', .62),
	'neutral-industrial': createApocalypseVisualPreset('neutral-industrial', 'utility-leak-residue', '', '', 'neutral', .48)
});

const apocalypseArchetypePresetIds = Object.freeze({
	fallout_radiation: 'nuclear-fallout',
	fire_ash: 'firestorm',
	extreme_heat: 'drought-dust',
	frost_ice: 'cryogenic-winter',
	storm_electric: 'storm-damage',
	flood_moisture: 'flood-humidity',
	fog_low_visibility: 'flood-humidity',
	toxic_air: 'toxic-chemical',
	corrosive_decay: 'corrosive-decay',
	infection_quarantine: 'quarantine-medical',
	fungal_spore: 'fungal-biohazard',
	parasite_infestation: 'fungal-biohazard',
	mutation_body: 'fungal-biohazard',
	ecological_collapse: 'drought-dust',
	overgrowth_swarm: 'fungal-biohazard',
	resource_scarcity: 'drought-dust',
	seismic_ruin: 'industrial-collapse',
	cosmic_impact: 'industrial-collapse',
	cosmic_radiation: 'nuclear-fallout',
	celestial_anomaly: 'spatial-anomaly',
	blackout_emp: 'emp-system-failure',
	nanotech_corrosion: 'corrosive-decay',
	machine_uprising: 'emp-system-failure',
	digital_failure: 'emp-system-failure',
	civil_collapse: 'industrial-collapse',
	war_unrest: 'war-destruction',
	cognitive_epidemic: 'spatial-anomaly',
	sensory_resonance: 'spatial-anomaly',
	reality_fracture: 'spatial-anomaly',
	temporal_distortion: 'spatial-anomaly',
	gravity_distortion: 'spatial-anomaly',
	identity_distortion: 'spatial-anomaly',
	occult_manifestation: 'spatial-anomaly',
	shadow_haunting: 'spatial-anomaly',
	darkness_light_loss: 'neutral-industrial',
	undead: 'fungal-biohazard'
});

const apocalypseFamilyPresetIds = Object.freeze({
	contamination: 'toxic-chemical',
	thermal: 'firestorm',
	cryogenic: 'cryogenic-winter',
	atmospheric: 'storm-damage',
	hydrological: 'flood-humidity',
	biological: 'fungal-biohazard',
	ecological: 'drought-dust',
	structural: 'industrial-collapse',
	cosmic: 'spatial-anomaly',
	technological: 'emp-system-failure',
	societal: 'war-destruction',
	psychological: 'spatial-anomaly',
	anomalous: 'spatial-anomaly',
	occult: 'spatial-anomaly'
});

function resolveApocalypseVisualPreset(apocalypseOrTheme) {
	const theme = apocalypseOrTheme?.archetype && apocalypseOrTheme?.family
		? apocalypseOrTheme
		: (typeof resolveApocalypseVisualTheme === 'function' ? resolveApocalypseVisualTheme(apocalypseOrTheme) : null);
	const archetype = normalizeApocalypseEffectToken(theme?.archetype).replace(/-/g, '_');
	const family = normalizeApocalypseEffectToken(theme?.family);
	const presetId = apocalypseArchetypePresetIds[archetype] ||
		apocalypseFamilyPresetIds[family] ||
		'neutral-industrial';
	return apocalypseVisualPresets[presetId] || apocalypseVisualPresets['neutral-industrial'];
}

function buildApocalypseEffectLayers(presetOrApocalypse) {
	const preset = typeof presetOrApocalypse === 'string'
		? apocalypseVisualPresets[normalizeApocalypseEffectToken(presetOrApocalypse)]
		: (presetOrApocalypse?.primaryEffectId ? presetOrApocalypse : resolveApocalypseVisualPreset(presetOrApocalypse));
	if (!preset) return [];
	const candidates = [
		[preset.primaryEffectId, new Set(['universal', 'local'])],
		[preset.edgeEffectId, new Set(['edge'])],
		[preset.uiEffectId, new Set(['ui'])]
	];
	return candidates.flatMap(([effectId, allowedUsages]) => {
		const asset = getApocalypseEffectAsset(effectId);
		if (!asset || !allowedUsages.has(asset.usage)) return [];
		return [Object.freeze({
			asset,
			opacity: Math.min(asset.maxOpacity, asset.defaultOpacity * preset.intensity)
		})];
	}).slice(0, 3);
}

function renderApocalypseEffectLayers() {
	return '<div class="apocalypse-effect-stack" aria-hidden="true"></div>';
}

function applyApocalypsePresetToRoot(preset, root) {
	if (!root) return [];
	const resolvedPreset = typeof preset === 'string'
		? apocalypseVisualPresets[normalizeApocalypseEffectToken(preset)]
		: preset;
	const stack = root.querySelector('.apocalypse-effect-stack');
	if (!resolvedPreset || !stack) return [];
	const layers = buildApocalypseEffectLayers(resolvedPreset);
	stack.replaceChildren(...layers.map(layer => {
		const element = document.createElement('div');
		element.className = 'apocalypse-effect-layer';
		element.dataset.effectId = layer.asset.id;
		element.dataset.effectUsage = layer.asset.usage;
		element.style.backgroundImage = `url("${layer.asset.path}")`;
		element.style.setProperty('--apocalypse-effect-opacity', String(layer.opacity));
		element.style.setProperty('--apocalypse-effect-blend', layer.asset.blendMode);
		element.style.setProperty('--apocalypse-effect-size', layer.asset.backgroundSize);
		return element;
	}));
	for (const className of [...root.classList])
		if (className.startsWith('apocalypse-tone-')) root.classList.remove(className);
	root.classList.add(`apocalypse-tone-${resolvedPreset.tone}`);
	root.dataset.apocalypsePreset = resolvedPreset.id;
	return layers;
}

function applyApocalypseVisualState(apocalypse, root = document.querySelector('.apocalypse-scenario-shell')) {
	if (!root) return [];
	return applyApocalypsePresetToRoot(resolveApocalypseVisualPreset(apocalypse), root);
}

function clearApocalypseEffectLayers() {
	document.querySelectorAll?.('.apocalypse-effect-stack').forEach(stack => stack.replaceChildren());
}

function apocalypseEffectPreviewText() {
	const language = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'en';
	return ({
		uk: { title: 'Development preview ефектів апокаліпсису', preset: 'Preset', primary: 'Основна картка', compact: 'Компактна картка', primaryCopy: 'Заголовок, показники виживання та критичні дії залишаються над шарами ефектів.', compactCopy: 'Компактний preview-текст і статусні значення.', control: 'Перевірити кнопку', empty: 'Ефекти відсутні' },
		ru: { title: 'Development preview эффектов апокалипсиса', preset: 'Preset', primary: 'Основная карточка', compact: 'Компактная карточка', primaryCopy: 'Заголовок, показатели выживания и критические действия остаются над слоями эффектов.', compactCopy: 'Компактный preview-текст и статусные значения.', control: 'Проверить кнопку', empty: 'Эффекты отсутствуют' },
		en: { title: 'Apocalypse effects development preview', preset: 'Preset', primary: 'Primary card', compact: 'Compact card', primaryCopy: 'The title, survival metrics and critical actions remain above the effect layers.', compactCopy: 'Compact preview text and status values.', control: 'Test control', empty: 'No effects' }
	})[language] || null;
}

function renderApocalypseEffectPreviewPreset() {
	const select = document.getElementById('apocalypseEffectPreviewSelect');
	const details = document.getElementById('apocalypseEffectPreviewDetails');
	const preview = document.getElementById('apocalypseEffectPreview');
	if (!select || !details || !preview) return;
	const preset = apocalypseVisualPresets[select.value] || apocalypseVisualPresets['neutral-industrial'];
	const layers = buildApocalypseEffectLayers(preset);
	preview.querySelectorAll('.apocalypse-effect-preview-card').forEach(card => applyApocalypsePresetToRoot(preset, card));
	details.textContent = layers.length
		? layers.map(layer => `${layer.asset.id} · ${layer.asset.usage} · ${layer.opacity.toFixed(3)} · ${layer.asset.blendMode}`).join(' | ')
		: apocalypseEffectPreviewText().empty;
}

function initApocalypseEffectPreview() {
	if (typeof initVisualThemePreview === 'function') {
		initVisualThemePreview();
		return;
	}
	const root = document.getElementById('apocalypseEffectPreview');
	const select = document.getElementById('apocalypseEffectPreviewSelect');
	if (!root || !select) return;
	const text = apocalypseEffectPreviewText();
	document.getElementById('apocalypseEffectPreviewTitle').textContent = text.title;
	document.getElementById('apocalypseEffectPreviewLabel').textContent = text.preset;
	root.querySelector('[data-preview-card="primary"] h3').textContent = text.primary;
	root.querySelector('[data-preview-card="compact"] h3').textContent = text.compact;
	root.querySelector('[data-preview-copy="primary"]').textContent = text.primaryCopy;
	root.querySelector('[data-preview-copy="compact"]').textContent = text.compactCopy;
	root.querySelector('[data-preview-copy="control"]').textContent = text.control;
	if (!select.options.length) {
		select.replaceChildren(...Object.values(apocalypseVisualPresets).map(preset => {
			const option = document.createElement('option');
			option.value = preset.id;
			option.textContent = preset.id;
			return option;
		}));
		select.addEventListener('change', renderApocalypseEffectPreviewPreset);
	}
	renderApocalypseEffectPreviewPreset();
}

loadApocalypseEffectManifest();
