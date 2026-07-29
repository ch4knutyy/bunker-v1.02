// Classic-script globals are intentional: the Bunker client does not use ES modules.

const visualThemeRegistryPaths = Object.freeze({
	bunker: '/data/visual-themes/bunker-visual-classification.json',
	apocalypse: '/data/visual-themes/apocalypse-realistic-visual-classification.json'
});

const visualThemeRegistryState = {
	bunkerById: new Map(),
	apocalypseById: new Map(),
	loadPromise: null,
	loaded: false,
	errors: Object.create(null),
	diagnostics: Object.create(null),
	warnedMissing: new Set()
};

function normalizeVisualThemeRecordId(value) {
	return String(value ?? '').trim();
}

async function fetchVisualThemeRegistry(kind, collectionName) {
	const response = await fetch(visualThemeRegistryPaths[kind], { cache: 'force-cache' });
	if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
	const payload = await response.json();
	const records = Array.isArray(payload?.[collectionName]) ? payload[collectionName] : [];
	const seenIds = new Set();
	visualThemeRegistryState.diagnostics[kind] = records.flatMap(record => {
		const id = normalizeVisualThemeRecordId(record?.id);
		if (!id) return [`${kind}:missing-id`];
		if (seenIds.has(id)) return [`${kind}:duplicate:${id}`];
		seenIds.add(id);
		if (kind === 'bunker' && !normalizeVisualThemeRecordId(record?.materialProfileId))
			return [`${kind}:missing-profile:${id}`];
		return [];
	});
	return new Map(records
		.filter(record => normalizeVisualThemeRecordId(record?.id))
		.map(record => [normalizeVisualThemeRecordId(record.id), Object.freeze({ ...record })]));
}

function resyncLoadedVisualThemes() {
	// Registry completion must not mutate the live DOM. Entry performance owns the
	// one deferred visual application after the selected assets have been decoded.
	if (typeof validateBunkerMaterialIntegration === 'function') validateBunkerMaterialIntegration();
}

function loadVisualThemeRegistries() {
	if (visualThemeRegistryState.loadPromise) return visualThemeRegistryState.loadPromise;

	visualThemeRegistryState.loadPromise = Promise.allSettled([
		fetchVisualThemeRegistry('bunker', 'bunkers'),
		fetchVisualThemeRegistry('apocalypse', 'apocalypses')
	]).then(results => {
		if (results[0].status === 'fulfilled') visualThemeRegistryState.bunkerById = results[0].value;
		else visualThemeRegistryState.errors.bunker = results[0].reason;
		if (results[1].status === 'fulfilled') visualThemeRegistryState.apocalypseById = results[1].value;
		else visualThemeRegistryState.errors.apocalypse = results[1].reason;
		visualThemeRegistryState.loaded = true;
		resyncLoadedVisualThemes();
		return visualThemeRegistryState;
	});

	return visualThemeRegistryState.loadPromise;
}

function warnMissingVisualClassification(kind, id) {
	if (!id || !visualThemeRegistryState.loaded ||
		!['localhost', '127.0.0.1'].includes(window.location?.hostname)) return;
	const key = `${kind}:${id}`;
	if (visualThemeRegistryState.warnedMissing.has(key)) return;
	visualThemeRegistryState.warnedMissing.add(key);
	console.warn(`[VisualThemes] Missing ${kind} classification for id "${id}". Neutral fallback applied.`);
}

function getBunkerVisualClassification(bunkerId) {
	const id = normalizeVisualThemeRecordId(bunkerId);
	const record = visualThemeRegistryState.bunkerById.get(id) || null;
	if (!record) warnMissingVisualClassification('bunker', id);
	return record;
}

function getApocalypseVisualClassification(apocalypseId) {
	const id = normalizeVisualThemeRecordId(apocalypseId);
	const record = visualThemeRegistryState.apocalypseById.get(id) || null;
	if (!record) warnMissingVisualClassification('apocalypse', id);
	return record;
}
