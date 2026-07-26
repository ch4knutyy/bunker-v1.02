const bunkerThemeDatasetKeys = Object.freeze([
	'bunkerArchetype', 'bunkerCondition', 'bunkerMaterial', 'bunkerCleanliness',
	'bunkerTechnology', 'bunkerAtmosphere', 'bunkerAccent', 'bunkerVariation',
	'bunkerTexture'
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
	appliedBunkerThemeSignature = '';
}

function applyBunkerVisualTheme(theme) {
	const root = document.body;
	if (!root || !theme) {
		clearBunkerVisualTheme();
		return null;
	}
	const signature = [
		theme.archetype, theme.condition, theme.material, theme.cleanliness,
		theme.technology, theme.atmosphere, theme.accent, theme.variation,
		theme.textureVariant, theme.accentShift, theme.damageBias
	].join('|');
	if (signature === appliedBunkerThemeSignature && root.classList.contains('bunker-theme-active')) return theme;

	root.classList.add('bunker-theme-active');
	root.dataset.bunkerArchetype = theme.archetype;
	root.dataset.bunkerCondition = theme.condition;
	root.dataset.bunkerMaterial = theme.material;
	root.dataset.bunkerCleanliness = theme.cleanliness;
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
