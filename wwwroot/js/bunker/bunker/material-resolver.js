// Перетворює classification profiles на обмежені фізичні шари без зміни ігрового контенту.

const bunkerConditionModifierOverlays = Object.freeze({
	damp: 'condensation-moisture',
	corroded: 'rust-streaks-drips',
	cold: 'frost-ice',
	contaminated: 'biological-contamination',
	'biological-hazard': 'biological-contamination',
	'chemical-hazard': 'chemical-etching',
	radiological: 'faded-warning-markings',
	dusty: 'grime-dust',
	hot: 'weld-burn-heat-marks',
	degraded: 'peeling-paint-fragments'
});

let bunkerMaterialValidationSignature = '';
let bunkerMaterialIntegrationDiagnostics = Object.freeze([]);

function validateBunkerMaterialIntegration() {
	const diagnostics = [];
	const records = typeof visualThemeRegistryState !== 'undefined'
		? [...visualThemeRegistryState.bunkerById.values()]
		: [];
	for (const record of records) {
		if (!record.materialProfileId) diagnostics.push(`classification:missing-profile:${record.id}`);
		else if (!getBunkerMaterialProfile(record.materialProfileId))
			diagnostics.push(`classification:unknown-profile:${record.id}:${record.materialProfileId}`);
	}
	for (const profile of Object.values(bunkerMaterialProfiles)) {
		for (const [role, assetId] of [
			['base', profile.baseMaterialId], ['secondary', profile.secondaryMaterialId],
			['accent', profile.accentMaterialId], ['glass', profile.glassMaterialId]
		]) if (assetId && !getBunkerMaterialAsset(assetId, false))
			diagnostics.push(`profile:unknown-${role}:${profile.id}:${assetId}`);
		for (const overlayId of profile.conditionOverlayIds)
			if (!getBunkerOverlayAsset(overlayId))
				diagnostics.push(`profile:unknown-overlay:${profile.id}:${overlayId}`);
	}
	bunkerMaterialIntegrationDiagnostics = Object.freeze(diagnostics);
	const signature = diagnostics.join('|');
	if (signature && signature !== bunkerMaterialValidationSignature && isBunkerMaterialDevelopment())
		console.warn('[BunkerMaterials] Integration validation warnings:', diagnostics);
	bunkerMaterialValidationSignature = signature;
	return bunkerMaterialIntegrationDiagnostics;
}

function resolveBunkerMaterialProfile(theme) {
	const exact = getBunkerMaterialProfile(theme?.materialProfile);
	if (exact) return Object.freeze({ profile: exact, fallbackLevel: 'exact' });
	const categoryProfile = getBunkerMaterialProfile(bunkerCategoryMaterialProfileIds[
		normalizeBunkerClassificationId(theme?.category)
	]);
	if (categoryProfile) return Object.freeze({ profile: categoryProfile, fallbackLevel: 'category' });
	return Object.freeze({ profile: bunkerNeutralMaterialProfile, fallbackLevel: 'neutral-industrial' });
}

function resolveBunkerConditionOverlays(profile, theme, enabled = true) {
	if (!enabled) return Object.freeze([]);
	const condition = normalizeBunkerMaterialToken(theme?.condition);
	if (condition === 'excellent') return Object.freeze([]);
	const modifiers = Array.isArray(theme?.modifiers) ? theme.modifiers : [];
	const modifierOverlayId = modifiers.map(value => bunkerConditionModifierOverlays[value]).find(Boolean);
	const profileOverlayId = profile.conditionOverlayIds.find(id => {
		const asset = getBunkerOverlayAsset(id);
		return asset?.usage !== 'universal';
	});
	const specificId = modifierOverlayId || profileOverlayId || 'grime-dust';
	const layers = [];
	if (condition === 'good') layers.push({ id: 'surface-scratches', opacity: .045 });
	else if (condition === 'fair') layers.push({ id: specificId, opacity: .085 });
	else if (['poor', 'critical', 'damaged', 'abandoned'].includes(condition)) {
		layers.push({ id: 'small-paint-chips', opacity: .1 });
		layers.push({ id: specificId, opacity: .15 });
	}
	const seenUsage = new Set();
	return Object.freeze(layers.flatMap(layer => {
		const asset = getBunkerOverlayAsset(layer.id);
		if (!asset || seenUsage.has(asset.usage)) return [];
		seenUsage.add(asset.usage);
		return [Object.freeze({ asset, opacity: layer.opacity })];
	}).slice(0, 2));
}

function resolveBunkerMaterialPresentation(theme, options = {}) {
	const resolution = resolveBunkerMaterialProfile(theme);
	const profile = resolution.profile;
	const baseAsset = getBunkerMaterialAsset(profile.baseMaterialId);
	const secondaryAsset = getBunkerMaterialAsset(profile.secondaryMaterialId, false);
	const accentAsset = getBunkerMaterialAsset(profile.accentMaterialId, false);
	const glassAsset = getBunkerMaterialAsset(profile.glassMaterialId, false);
	const conditionLayers = resolveBunkerConditionOverlays(profile, theme, options.conditionEnabled !== false);
	const missingAssetIds = [
		!getBunkerMaterialAsset(profile.baseMaterialId, false) && profile.baseMaterialId,
		profile.secondaryMaterialId && !secondaryAsset && profile.secondaryMaterialId,
		profile.accentMaterialId && !accentAsset && profile.accentMaterialId,
		profile.glassMaterialId && !glassAsset && profile.glassMaterialId
	].filter(Boolean);
	return Object.freeze({
		profile,
		fallbackLevel: missingAssetIds.length ? 'asset-fallback' : resolution.fallbackLevel,
		baseAsset,
		secondaryAsset,
		accentAsset,
		glassAsset,
		conditionLayers,
		missingAssetIds: Object.freeze(missingAssetIds)
	});
}

function bunkerMaterialCssUrl(asset) {
	return asset?.path ? `url("${asset.path}")` : 'none';
}

function renderBunkerMaterialLayers() {
	return `<div class="bunker-material-stack" aria-hidden="true">
		<div class="bunker-material-layer bunker-material-layer--base"></div>
		<div class="bunker-material-layer bunker-material-layer--secondary"></div>
		<div class="bunker-condition-stack"></div>
	</div>
	<div class="apocalypse-effect-stack bunker-apocalypse-effect-stack" aria-hidden="true"></div>`;
}

function applyBunkerApocalypseLayers(root = document.querySelector('.bunker-visual-root'), enabled = true) {
	if (!root) return [];
	const stack = root.querySelector('.bunker-apocalypse-effect-stack');
	if (!stack) return [];
	if (!enabled || typeof currentApocalypse === 'undefined' || !currentApocalypse ||
		typeof resolveApocalypseVisualPreset !== 'function') {
		stack.replaceChildren();
		for (const className of [...root.classList])
			if (className.startsWith('apocalypse-tone-')) root.classList.remove(className);
		delete root.dataset.apocalypsePreset;
		return [];
	}
	return applyApocalypsePresetToRoot(resolveApocalypseVisualPreset(currentApocalypse), root);
}

function applyBunkerMaterialPresentation(theme, root, options = {}) {
	if (!root || !theme) return null;
	const resolved = resolveBunkerMaterialPresentation(theme, options);
	const { profile } = resolved;
	root.dataset.bunkerMaterialProfile = profile.id;
	root.dataset.bunkerMaterialFallback = resolved.fallbackLevel;
	root.dataset.bunkerCondition = theme.condition || 'fair';
	root.dataset.bunkerStructureFamily = profile.structureFamily;
	root.dataset.bunkerBaseMaterial = resolved.baseAsset?.id || bunkerMaterialSafeFallback.id;
	root.dataset.bunkerSecondaryMaterial = resolved.secondaryAsset?.id || '';
	root.dataset.bunkerAccentMaterial = resolved.accentAsset?.id || '';
	root.dataset.bunkerGlassMaterial = resolved.glassAsset?.id || '';
	for (const className of [...root.classList])
		if (className.startsWith('bunker-tone-') || className.startsWith('bunker-structure-'))
			root.classList.remove(className);
	root.classList.add(`bunker-tone-${profile.cssTone}`, `bunker-structure-${profile.structureFamily}`);
	const materialProperties = {
		'--bunker-base-material-image': bunkerMaterialCssUrl(resolved.baseAsset),
		'--bunker-secondary-material-image': bunkerMaterialCssUrl(resolved.secondaryAsset),
		'--bunker-accent-material-image': bunkerMaterialCssUrl(resolved.accentAsset),
		'--bunker-glass-material-image': bunkerMaterialCssUrl(resolved.glassAsset),
		'--bunker-material-scale': profile.textureScale
	};
	for (const [property, value] of Object.entries(materialProperties)) root.style.setProperty(property, value);
	const isProductionRoot = Boolean(root.closest?.('#bunkerContent'));
	if (isProductionRoot && document.body) {
		for (const [property, value] of Object.entries(materialProperties)) document.body.style.setProperty(property, value);
		document.body.dataset.bunkerStructureFamily = profile.structureFamily;
		document.body.dataset.bunkerBaseMaterial = resolved.baseAsset?.id || bunkerMaterialSafeFallback.id;
		document.body.dataset.bunkerSecondaryMaterial = resolved.secondaryAsset?.id || '';
		document.body.dataset.bunkerAccentMaterial = resolved.accentAsset?.id || '';
		document.body.dataset.bunkerGlassMaterial = resolved.glassAsset?.id || '';
	}
	const conditionStack = root.querySelector('.bunker-condition-stack');
	if (conditionStack) conditionStack.replaceChildren(...resolved.conditionLayers.map(layer => {
		const element = document.createElement('div');
		element.className = 'bunker-condition-layer';
		element.dataset.overlayId = layer.asset.id;
		element.dataset.overlayUsage = layer.asset.usage;
		element.style.backgroundImage = bunkerMaterialCssUrl(layer.asset);
		element.style.backgroundRepeat = layer.asset.repeatable ? 'repeat' : 'no-repeat';
		element.style.backgroundSize = layer.asset.backgroundSize;
		element.style.mixBlendMode = layer.asset.blendMode;
		element.style.setProperty('--bunker-condition-opacity', String(layer.opacity));
		return element;
	}));
	applyBunkerApocalypseLayers(root, options.apocalypseEnabled !== false);
	if (isBunkerMaterialDevelopment() && resolved.fallbackLevel !== 'exact')
		console.warn(`[BunkerMaterials] ${theme.id || 'unknown'} resolved via ${resolved.fallbackLevel}.`, resolved.missingAssetIds);
	return resolved;
}

function syncBunkerMaterialVisual(bunker, options = {}) {
	const root = document.querySelector('.bunker-visual-root');
	if (!root || !bunker) return null;
	const theme = resolveBunkerVisualTheme(bunker);
	return applyBunkerMaterialPresentation(theme, root, options);
}
