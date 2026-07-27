// Глобальні classic-script змінні навмисні: клієнт Bunker не використовує ES modules.

const bunkerMaterialManifestPath = '/assets/ui/materials/material-assets-manifest.json';
const bunkerMaterialOverlayUsages = Object.freeze(['universal', 'local', 'edge']);
const bunkerMaterialSafeFallback = Object.freeze({
	id: 'rough-concrete',
	path: '/assets/ui/materials/rough-concrete/base.webp'
});

const bunkerMaterialAssetState = {
	loadPromise: null,
	loaded: false,
	materialsById: new Map(),
	overlaysById: new Map(),
	overlaysByUsage: new Map(bunkerMaterialOverlayUsages.map(usage => [usage, []])),
	diagnostics: [],
	error: null
};

function normalizeBunkerMaterialToken(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
}

function isBunkerMaterialDevelopment() {
	return ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
}

function normalizeBunkerMaterialAsset(source) {
	const id = normalizeBunkerMaterialToken(source?.id);
	const path = String(source?.path ?? '').trim();
	if (!id || !/^\/assets\/ui\/materials\/[a-z0-9_-]+\/base\.webp$/i.test(path)) return null;
	return Object.freeze({ id, path });
}

function normalizeBunkerOverlayAsset(source) {
	const id = normalizeBunkerMaterialToken(source?.id);
	const usage = normalizeBunkerMaterialToken(source?.usage);
	const path = String(source?.path ?? '').trim();
	if (!id || !bunkerMaterialOverlayUsages.includes(usage) ||
		!/^\/assets\/ui\/materials\/overlays\/(universal|local|edge)\/[a-z0-9_-]+\.png$/i.test(path)) return null;
	return Object.freeze({
		id,
		path,
		usage,
		repeatable: usage === 'universal',
		backgroundSize: usage === 'edge' ? '100% 100%' : (usage === 'local' ? 'cover' : '640px'),
		blendMode: usage === 'edge' ? 'normal' : 'soft-light'
	});
}

function validateBunkerMaterialManifest(payload) {
	const diagnostics = [];
	const validateCollection = (records, kind, normalize) => {
		const seen = new Set();
		for (const record of records) {
			const id = normalizeBunkerMaterialToken(record?.id);
			if (!id) diagnostics.push(`${kind}:missing-id`);
			else if (seen.has(id)) diagnostics.push(`${kind}:duplicate:${id}`);
			else seen.add(id);
			if (!String(record?.path ?? '').trim()) diagnostics.push(`${kind}:missing-path:${id || 'unknown'}`);
			if (!normalize(record)) diagnostics.push(`${kind}:invalid:${id || 'unknown'}`);
		}
	};
	validateCollection(Array.isArray(payload?.baseMaterials) ? payload.baseMaterials : [], 'material', normalizeBunkerMaterialAsset);
	validateCollection(Array.isArray(payload?.overlays) ? payload.overlays : [], 'overlay', normalizeBunkerOverlayAsset);
	return diagnostics;
}

function indexBunkerMaterialManifest(payload) {
	const materialRecords = Array.isArray(payload?.baseMaterials) ? payload.baseMaterials : [];
	const overlayRecords = Array.isArray(payload?.overlays) ? payload.overlays : [];
	bunkerMaterialAssetState.diagnostics = validateBunkerMaterialManifest(payload);
	const materials = materialRecords.map(normalizeBunkerMaterialAsset).filter(Boolean);
	const overlays = overlayRecords.map(normalizeBunkerOverlayAsset).filter(Boolean);
	bunkerMaterialAssetState.materialsById = new Map(materials.map(asset => [asset.id, asset]));
	bunkerMaterialAssetState.overlaysById = new Map(overlays.map(asset => [asset.id, asset]));
	bunkerMaterialAssetState.overlaysByUsage = new Map(bunkerMaterialOverlayUsages.map(usage => [
		usage,
		Object.freeze(overlays.filter(asset => asset.usage === usage))
	]));
	if (isBunkerMaterialDevelopment() && bunkerMaterialAssetState.diagnostics.length)
		console.warn('[BunkerMaterials] Manifest validation warnings:', bunkerMaterialAssetState.diagnostics);
	return bunkerMaterialAssetState;
}

function loadBunkerMaterialManifest() {
	if (bunkerMaterialAssetState.loadPromise) return bunkerMaterialAssetState.loadPromise;
	bunkerMaterialAssetState.loadPromise = fetch(bunkerMaterialManifestPath, { cache: 'force-cache' })
		.then(response => {
			if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
			return response.json();
		})
		.then(indexBunkerMaterialManifest)
		.catch(error => {
			bunkerMaterialAssetState.error = error;
			if (isBunkerMaterialDevelopment()) console.warn('[BunkerMaterials] Manifest unavailable; safe fallback applied.', error);
			return bunkerMaterialAssetState;
		})
		.then(state => {
			state.loaded = true;
			if (typeof validateBunkerMaterialIntegration === 'function') validateBunkerMaterialIntegration();
			if (typeof currentBunker !== 'undefined' && currentBunker &&
				typeof syncBunkerMaterialVisual === 'function') syncBunkerMaterialVisual(currentBunker);
			if (typeof initVisualThemePreview === 'function') initVisualThemePreview();
			return state;
		});
	return bunkerMaterialAssetState.loadPromise;
}

function getBunkerMaterialAsset(materialId, useFallback = true) {
	const asset = bunkerMaterialAssetState.materialsById.get(normalizeBunkerMaterialToken(materialId));
	if (asset) return asset;
	if (!useFallback) return null;
	return bunkerMaterialAssetState.materialsById.get(bunkerMaterialSafeFallback.id) || bunkerMaterialSafeFallback;
}

function getBunkerOverlayAsset(overlayId) {
	return bunkerMaterialAssetState.overlaysById.get(normalizeBunkerMaterialToken(overlayId)) || null;
}

function getBunkerOverlayAssetsByUsage(usage) {
	return bunkerMaterialAssetState.overlaysByUsage.get(normalizeBunkerMaterialToken(usage)) || Object.freeze([]);
}

loadBunkerMaterialManifest();
