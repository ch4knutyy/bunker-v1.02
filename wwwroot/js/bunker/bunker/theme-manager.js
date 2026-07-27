const bunkerThemeDatasetKeys = Object.freeze([
	'bunkerFamily', 'bunkerCategory', 'bunkerArchetype', 'bunkerCondition', 'bunkerMaterial',
	'bunkerMaterialProfile', 'bunkerCleanliness', 'bunkerModifiers',
	'bunkerTechnology', 'bunkerAtmosphere', 'bunkerAccent', 'bunkerVariation',
	'bunkerTexture', 'bunkerStructureFamily', 'bunkerBaseMaterial', 'bunkerSecondaryMaterial',
	'bunkerAccentMaterial', 'bunkerGlassMaterial'
]);

const bunkerMaterialStyleProperties = Object.freeze([
	'--bunker-base-material-image', '--bunker-secondary-material-image',
	'--bunker-accent-material-image', '--bunker-glass-material-image', '--bunker-material-scale'
]);

let appliedBunkerThemeSignature = '';

function clearBunkerVisualTheme() {
	const root = document.body;
	if (!root) return;
	root.classList.remove('bunker-theme-active');
	bunkerThemeDatasetKeys.forEach(key => delete root.dataset[key]);
	root.style.removeProperty('--bunker-accent-shift');
	root.style.removeProperty('--bunker-damage-bias');
	root.style.removeProperty('--bunker-damage-bias-opacity');
	bunkerMaterialStyleProperties.forEach(property => root.style.removeProperty(property));
	appliedBunkerThemeSignature = '';
}

function applyBunkerVisualTheme(theme) {
	const root = document.body;
	if (!root || !theme) {
		clearBunkerVisualTheme();
		return null;
	}
	const signature = [
		theme.family, theme.category, theme.archetype, theme.condition, theme.material,
		theme.materialProfile, theme.cleanliness, theme.modifiers?.join(' '),
		theme.technology, theme.atmosphere, theme.accent, theme.variation,
		theme.textureVariant, theme.accentShift, theme.damageBias
	].join('|');
	if (signature === appliedBunkerThemeSignature && root.classList.contains('bunker-theme-active')) return theme;

	root.classList.add('bunker-theme-active');
	root.dataset.bunkerFamily = theme.family;
	root.dataset.bunkerCategory = theme.category;
	root.dataset.bunkerArchetype = theme.archetype;
	root.dataset.bunkerCondition = theme.condition;
	root.dataset.bunkerMaterial = theme.material;
	root.dataset.bunkerMaterialProfile = theme.materialProfile;
	root.dataset.bunkerCleanliness = theme.cleanliness;
	root.dataset.bunkerModifiers = theme.modifiers?.join(' ') || '';
	root.dataset.bunkerTechnology = theme.technology;
	root.dataset.bunkerAtmosphere = theme.atmosphere;
	root.dataset.bunkerAccent = theme.accent;
	root.dataset.bunkerVariation = String(theme.variation);
	root.dataset.bunkerTexture = String(theme.textureVariant);
	root.style.setProperty('--bunker-accent-shift', `${theme.accentShift}deg`);
	root.style.setProperty('--bunker-damage-bias', String(theme.damageBias));
	root.style.setProperty('--bunker-damage-bias-opacity', String(theme.damageBias * .02));
	appliedBunkerThemeSignature = signature;
	return theme;
}

function syncBunkerVisualTheme(bunker) {
	return bunker ? applyBunkerVisualTheme(resolveBunkerVisualTheme(bunker)) : (clearBunkerVisualTheme(), null);
}
