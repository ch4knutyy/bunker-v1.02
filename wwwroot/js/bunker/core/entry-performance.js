// Staged lobby -> Bunker entry. Classic-script globals are intentional.

const bunkerEntryImagePromises = new Map();
const bunkerEntryVisualRegistryState = { loadPromise: null };
const bunkerEntryRuntime = {
	generation: 0,
	activeGeneration: 0,
	state: 'idle',
	loadingTimer: null,
	visualWarningGeneration: 0
};

function isBunkerEntryDevelopment() {
	return ['localhost', '127.0.0.1'].includes(globalThis.location?.hostname);
}

function markBunkerEntry(name) {
	if (isBunkerEntryDevelopment() && globalThis.performance?.mark) performance.mark(name);
}

function setBunkerEntryStatus(key) {
	const title = document.querySelector('#bunkerEntryLoading [data-i18n="bunkerEntryTitle"]');
	if (title) title.textContent = typeof t === 'function' ? t('bunkerEntryTitle') : 'Bunker';
	const status = document.getElementById('bunkerEntryLoadingStatus');
	if (status) status.textContent = typeof t === 'function' ? t(key) : key;
}

function setBunkerEntryState(state, statusKey) {
	bunkerEntryRuntime.state = state;
	if (statusKey) setBunkerEntryStatus(statusKey);
}

function showBunkerEntryLoading(generation) {
	if (generation !== bunkerEntryRuntime.activeGeneration) return;
	document.getElementById('bunkerEntryLoading')?.classList.add('is-visible');
}

function beginBunkerEntry(statusKey = 'bunkerEntryRoomState') {
	const generation = ++bunkerEntryRuntime.generation;
	bunkerEntryRuntime.activeGeneration = generation;
	if (bunkerEntryRuntime.loadingTimer) clearTimeout(bunkerEntryRuntime.loadingTimer);
	const layer = document.getElementById('bunkerEntryLoading');
	if (layer) {
		layer.classList.remove('is-leaving');
		layer.setAttribute('aria-busy', 'true');
		layer.removeAttribute('hidden');
	}
	document.body?.classList.add('bunker-entry-busy');
	setBunkerEntryState('loading-core', statusKey);
	markBunkerEntry('bunker-entry-start');
	bunkerEntryRuntime.loadingTimer = setTimeout(() => showBunkerEntryLoading(generation), 150);
	return generation;
}

function ensureBunkerEntry(statusKey = 'bunkerEntryRoomState') {
	if (bunkerEntryRuntime.activeGeneration) {
		setBunkerEntryStatus(statusKey);
		return bunkerEntryRuntime.activeGeneration;
	}
	return beginBunkerEntry(statusKey);
}

function isCurrentBunkerEntry(generation) {
	return generation > 0 && generation === bunkerEntryRuntime.activeGeneration;
}

function hideBunkerEntryLoading(generation) {
	if (!isCurrentBunkerEntry(generation)) return;
	if (bunkerEntryRuntime.loadingTimer) clearTimeout(bunkerEntryRuntime.loadingTimer);
	bunkerEntryRuntime.loadingTimer = null;
	const layer = document.getElementById('bunkerEntryLoading');
	if (!layer) {
		document.body?.classList.remove('bunker-entry-busy');
		return;
	}
	layer.setAttribute('aria-busy', 'false');
	layer.classList.add('is-leaving');
	window.setTimeout(() => {
		if (generation !== bunkerEntryRuntime.generation) return;
		layer.classList.remove('is-visible', 'is-leaving');
		layer.setAttribute('hidden', '');
		document.body?.classList.remove('bunker-entry-busy');
		if (bunkerEntryRuntime.activeGeneration === generation) bunkerEntryRuntime.activeGeneration = 0;
	}, 180);
}

function failBunkerEntryCritical(generation) {
	if (!isCurrentBunkerEntry(generation)) return;
	setBunkerEntryState('critical-error', 'bunkerEntryStateFailed');
	const layer = document.getElementById('bunkerEntryLoading');
	if (layer) layer.classList.add('is-visible', 'is-error');
	window.setTimeout(() => {
		hideBunkerEntryLoading(generation);
		window.setTimeout(() => {
			if (isCurrentBunkerEntry(generation)) bunkerEntryRuntime.activeGeneration = 0;
		}, 200);
	}, 1800);
}

function loadBunkerEntryVisualRegistries() {
	if (bunkerEntryVisualRegistryState.loadPromise) return bunkerEntryVisualRegistryState.loadPromise;
	bunkerEntryVisualRegistryState.loadPromise = Promise.allSettled([
		typeof loadVisualThemeRegistries === 'function' ? loadVisualThemeRegistries() : Promise.resolve(),
		typeof loadBunkerMaterialManifest === 'function' ? loadBunkerMaterialManifest() : Promise.resolve(),
		typeof loadApocalypseEffectManifest === 'function' ? loadApocalypseEffectManifest() : Promise.resolve()
	]);
	return bunkerEntryVisualRegistryState.loadPromise;
}

function loadBunkerEntryImage(url) {
	const normalizedUrl = String(url || '').trim();
	if (!normalizedUrl) return Promise.resolve(false);
	if (bunkerEntryImagePromises.has(normalizedUrl)) return bunkerEntryImagePromises.get(normalizedUrl);
	const image = new Image();
	let finish;
	const promise = new Promise((resolve, reject) => {
		let settled = false;
		finish = async success => {
			if (settled) return;
			settled = true;
			if (!success) {
				bunkerEntryImagePromises.delete(normalizedUrl);
				reject(new Error(`Optional visual asset unavailable: ${normalizedUrl}`));
				return;
			}
			try {
				if (typeof image.decode === 'function') await image.decode();
				resolve(true);
			} catch (error) {
				bunkerEntryImagePromises.delete(normalizedUrl);
				reject(error);
			}
		};
		image.onload = () => void finish(true);
		image.onerror = () => void finish(false);
	});
	bunkerEntryImagePromises.set(normalizedUrl, promise);
	image.decoding = 'async';
	image.src = normalizedUrl;
	if (image.complete) void finish(image.naturalWidth > 0);
	return promise;
}

function collectCurrentBunkerEntryAssetUrls() {
	const fallbackPath = typeof bunkerMaterialSafeFallback !== 'undefined'
		? bunkerMaterialSafeFallback.path
		: '';
	const urls = new Set([fallbackPath]);
	if (currentBunker && typeof resolveBunkerVisualTheme === 'function' &&
		typeof resolveBunkerMaterialPresentation === 'function') {
		const presentation = resolveBunkerMaterialPresentation(resolveBunkerVisualTheme(currentBunker));
		[presentation.baseAsset, presentation.secondaryAsset, presentation.accentAsset, presentation.glassAsset]
			.forEach(asset => asset?.path && urls.add(asset.path));
		presentation.conditionLayers.forEach(layer => layer.asset?.path && urls.add(layer.asset.path));
	}
	if (currentApocalypse && typeof buildApocalypseEffectLayers === 'function')
		buildApocalypseEffectLayers(currentApocalypse).forEach(layer => layer.asset?.path && urls.add(layer.asset.path));
	return [...urls].filter(Boolean);
}

async function preloadBunkerEntryImages(urls, generation) {
	const queue = [...new Set(urls)];
	const results = [];
	const workers = Array.from({ length: Math.min(3, queue.length) }, async () => {
		while (queue.length && isCurrentBunkerEntry(generation)) {
			const url = queue.shift();
			try {
				await loadBunkerEntryImage(url);
				results.push({ url, status: 'fulfilled' });
			} catch (reason) {
				results.push({ url, status: 'rejected', reason });
			}
		}
	});
	await Promise.all(workers);
	return results;
}

async function enhanceBunkerEntryVisuals(generation) {
	setBunkerEntryState('loading-visuals', 'bunkerEntryVisuals');
	const registryResults = await loadBunkerEntryVisualRegistries();
	if (!isCurrentBunkerEntry(generation)) return;
	const imageResults = await preloadBunkerEntryImages(collectCurrentBunkerEntryAssetUrls(), generation);
	if (!isCurrentBunkerEntry(generation)) return;

	if (typeof syncBunkerVisualTheme === 'function') syncBunkerVisualTheme(currentBunker);
	if (typeof syncBunkerMaterialVisual === 'function') syncBunkerMaterialVisual(currentBunker);
	if (typeof applyApocalypseVisualEnhancement === 'function')
		applyApocalypseVisualEnhancement(currentApocalypse);

	const optionalFailure = registryResults.some(result => result.status === 'rejected') ||
		Boolean(typeof visualThemeRegistryState !== 'undefined' && Object.keys(visualThemeRegistryState.errors).length) ||
		Boolean(typeof bunkerMaterialAssetState !== 'undefined' && bunkerMaterialAssetState.error) ||
		Boolean(typeof apocalypseEffectAssetState !== 'undefined' && apocalypseEffectAssetState.error) ||
		imageResults.some(result => result.status === 'rejected');
	if (optionalFailure && bunkerEntryRuntime.visualWarningGeneration !== generation) {
		bunkerEntryRuntime.visualWarningGeneration = generation;
		if (typeof addEventMessage === 'function') addEventMessage(escapeHtml(t('bunkerEntryVisualFallback')));
		if (isBunkerEntryDevelopment())
			console.warn('[BunkerEntry] Optional visual assets failed; simplified presentation remains active.');
	}
	setBunkerEntryState(optionalFailure ? 'degraded' : 'ready');
	markBunkerEntry('bunker-assets-ready');
	markBunkerEntry('bunker-entry-complete');
}

function renderBunkerEntryCore(renderCore) {
	const generation = ensureBunkerEntry('bunkerEntryRoomState');
	markBunkerEntry('bunker-state-ready');
	setBunkerEntryState('core-ready', 'bunkerEntryInterface');
	requestAnimationFrame(() => {
		if (!isCurrentBunkerEntry(generation)) return;
		try {
			renderCore({ deferBunkerVisuals: true, deferApocalypseVisuals: true });
			markBunkerEntry('bunker-core-rendered');
			setBunkerEntryState('core-ready', 'bunkerEntryAlmostReady');
			requestAnimationFrame(() => hideBunkerEntryLoading(generation));
			void enhanceBunkerEntryVisuals(generation).catch(error => {
				if (!isCurrentBunkerEntry(generation)) return;
				if (typeof addEventMessage === 'function')
					addEventMessage(escapeHtml(t('bunkerEntryVisualFallback')));
				if (isBunkerEntryDevelopment()) console.warn('[BunkerEntry] Visual enhancement failed.', error);
				markBunkerEntry('bunker-assets-ready');
				markBunkerEntry('bunker-entry-complete');
				setBunkerEntryState('degraded');
			});
		} catch (error) {
			if (isBunkerEntryDevelopment()) console.warn('[BunkerEntry] Core render failed.', error);
			failBunkerEntryCritical(generation);
		}
	});
	return generation;
}
