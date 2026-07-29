// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function bunkerResourceCommandId() {
	return globalThis.crypto?.randomUUID?.() || `bunker-resource-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function mutateBunkerResource(invokeMutation, resourceKey, months = null) {
	if (!isHost) {
		alert("Тільки хост може змінювати ресурси бункера");
		return;
	}
	if (!currentBunker) {
		alert("Бункер не визначено. Спочатку почніть гру.");
		return;
	}
	let amount = months;
	if (amount === null || amount === undefined) {
		const input = prompt(`${t(resourceKey)} (${t('bunkerMonths')})`, "3");
		if (input === null) return;
		amount = Number.parseInt(input, 10);
	}
	if (!Number.isInteger(amount) || amount < 1 || amount > 120) {
		alert("Вкажіть ціле число від 1 до 120");
		return;
	}
	try {
		await invokeMutation(amount, bunkerResourceCommandId());
	} catch (err) {
		console.error(`[BunkerResource:${resourceKey}] Error:`, err);
		alert(`Помилка зміни ресурсу:\n${err?.message ?? String(err)}`);
	}
}

function addBunkerSupplies(months = null) {
	return mutateBunkerResource(
		(amount, commandId) => connection.invoke("AddBunkerSupplies", amount, commandId),
		"supplies",
		months);
}

function removeBunkerSupplies(months = null) {
	return mutateBunkerResource(
		(amount, commandId) => connection.invoke("RemoveBunkerSupplies", amount, commandId),
		"supplies",
		months);
}

function addBunkerWater(months = null) {
	return mutateBunkerResource(
		(amount, commandId) => connection.invoke("AddBunkerWater", amount, commandId),
		"water",
		months);
}

function removeBunkerWater(months = null) {
	return mutateBunkerResource(
		(amount, commandId) => connection.invoke("RemoveBunkerWater", amount, commandId),
		"water",
		months);
}

function normalizeBunkerMetadataValue(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function resolveBunkerCondition(value) {
	const condition = normalizeBunkerMetadataValue(value);
	const groups = [
		['excellent', 'positive', /^(excellent|відмінний|відмінна|отличный|отличное)$/],
		['good', 'positive', /^(good|хороший|хороша|хорошее)$/],
		['stable', 'neutral', /^(stable|стабільний|стабільна|стабильный|стабильное)$/],
		['worn', 'warning-soft', /^(worn|fair|зношений|зношена|задовільний|изношенный|удовлетворительный)$/],
		['damaged', 'damaged', /^(damaged|пошкоджений|пошкоджена|поврежденный|повреждённый)$/],
		['poor', 'damaged', /^(poor|поганий|погана|плохой|плохое)$/],
		['critical', 'critical', /^(critical|критичний|критична|критический|критическое)$/]
	];
	const match = groups.find(([, , pattern]) => pattern.test(condition));
	return match ? { key: match[0], semantic: match[1] } : { key: 'unknown', semantic: 'neutral' };
}

function getBunkerConditionLabel(key) {
	return t({ excellent: 'conditionExcellent', good: 'conditionGood', stable: 'conditionStable', worn: 'conditionWorn', damaged: 'conditionDamaged', poor: 'conditionPoor', critical: 'conditionCritical' }[key] || 'conditionUnknown');
}

function getBunkerCapacityValue(source, fallback = '') {
	return source?.capacity ?? source?.Capacity ?? fallback;
}

function resolveBunkerVisualVariant(model) {
	if (model?.conditionSemantic === 'critical') return 'critical';
	if (model?.conditionSemantic === 'damaged') return 'damaged';
	const metadata = [
		...(Array.isArray(model?.tags) ? model.tags : []), model?.category, model?.type,
		model?.classification, model?.locationMetadata, model?.imageCategory, model?.imageType
	].map(normalizeBunkerMetadataValue).filter(Boolean).join(' ');
	const rules = [
		['military', /military|tactical|defen[cs]e|security_complex/],
		['scientific', /scientific|research_lab|laboratory|science_facility/],
		['industrial', /industrial|factory|manufacturing|power_plant/],
		['underground', /underground|subterranean|tunnel|mine|cave_bunker/],
		['luxury', /luxury|premium|executive|vip/],
		['emergency', /emergency|temporary_shelter|rapid_response/],
		['remote', /isolated_location|mountain_location|remote|arctic|offshore/],
		['natural', /natural|rural_location|agriculture|forest|cavern|spring/],
		['medical', /medical|hospital|clinic|healthcare/],
		['civilian', /civilian|residential|public_shelter|community/]
	];
	return rules.find(([, pattern]) => pattern.test(metadata))?.[0] || 'generic';
}

function buildBunkerFacilityModel(source) {
	if (!source) return null;
	const rawCondition = source.condition ?? source.Condition ?? '';
	const condition = resolveBunkerCondition(rawCondition);
	const tags = source.bunkerTags || source.BunkerTags || source.tags || source.Tags || [];
	const supplies = source.supplies ?? source.Supplies ?? source.suppliesMonths ?? source.SuppliesMonths ?? '';
	const water = source.waterMonths ?? source.WaterMonths ?? supplies;
	const model = {
		id: source.id || source.Id || '',
		name: getLocalizedValue(source, 'name') || t('unknown'),
		shortDescription: getLocalizedByFields(source, ['shortDescription', 'subtitle', 'description']),
		description: getLocalizedValue(source, 'description'),
		capacity: source.capacity ?? source.Capacity ?? '',
		condition: rawCondition,
		conditionKey: condition.key,
		conditionSemantic: condition.semantic,
		supplies,
		water,
		location: getLocalizedValue(source, 'location') || '',
		locationMetadata: source.location || source.Location || '',
		rooms: getLocalizedArray(source, 'rooms').length ? getLocalizedArray(source, 'rooms') : getLocalizedArray(source, 'facilities'),
		resources: getLocalizedArray(source, 'resources'),
		problems: getLocalizedArray(source, 'problems'),
		imageUrl: normalizeLocalScenarioImageUrl(source.imageUrl || source.ImageUrl || source.uploadedImagePath || source.UploadedImagePath),
		tags: Array.isArray(tags) ? tags : [],
		category: source.category || source.Category || '',
		type: source.type || source.Type || '',
		classification: source.classification || source.Classification || '',
		imageCategory: source.imageCategory || source.ImageCategory || '',
		imageType: source.imageType || source.ImageType || ''
	};
	model.visualVariant = resolveBunkerVisualVariant(model);
	return model;
}

function renderBunkerIcon(variant) {
	return bunkerIconSvgRegistry[variant] || bunkerIconSvgRegistry.generic;
}

function renderBunkerSectionIcon(kind) {
	const icons = {
		rooms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5h16v16M8 9h3v3H8zm5 0h3v3h-3zM8 15h3v3H8zm5 0h3v3h-3z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
		resources: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Zm0 0v8l8 4 8-4V8M12 12v8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
		problems: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
	};
	return icons[kind] || '';
}

function renderBunkerContentSection(kind, title, items) {
	if (!Array.isArray(items) || !items.length) return '';
	return `<section class="bunker-content-card content-${kind}" aria-labelledby="bunker-${kind}-title">
		<h5 id="bunker-${kind}-title" class="bunker-content-title">${renderBunkerSectionIcon(kind)}<span>${escapeHtml(title)}</span></h5>
		<ul>${items.map(item => `<li><span aria-hidden="true"></span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>
	</section>`;
}

function renderBunkerCoverSummary(model, capacityValue) {
	return `<div class="bunker-cover-summary"><span>${escapeHtml(t('capacity'))}</span><strong>${escapeHtml(capacityValue)}</strong><small>${escapeHtml(t('condition'))} · ${escapeHtml(getBunkerConditionLabel(model.conditionKey))}</small></div>`;
}

function renderBunkerHeroImage(imageUrl) {
	if (!imageUrl) return '';
	return `<div class="bunker-hero-media is-loading" aria-hidden="true"><img class="bunker-hero-image" src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async"></div>`;
}

function renderBunkerFacility(model) {
	if (!model) return `<p class="bunker-empty">${escapeHtml(t('unknown'))}</p>`;
	const variant = bunkerIconSvgRegistry[model.visualVariant] ? model.visualVariant : resolveBunkerVisualVariant(model);
	const capacityValue = model.capacity === '' || model.capacity == null ? t('unknown') : model.capacity;
	const suppliesValue = model.supplies === '' || model.supplies == null
		? t('unknown')
		: `${escapeHtml(model.supplies)}${typeof model.supplies === 'number' ? ` ${escapeHtml(t('bunkerMonths'))}` : ''}`;
	const waterValue = model.water === '' || model.water == null
		? t('unknown')
		: `${escapeHtml(model.water)}${typeof model.water === 'number' ? ` ${escapeHtml(t('bunkerMonths'))}` : ''}`;
	const locationValue = model.location || t('unknown');
	const media = renderBunkerHeroImage(model.imageUrl);
	const imageButton = model.imageUrl ? `<button type="button" class="bunker-open-image" onclick="openCurrentBunkerImage()">${escapeHtml(t('bunkerOpenImage'))}</button>` : '';
	const hostControls = developerFeatureEnabled('scenarioImages') ? `<div class="scenario-image-controls bunker-image-controls">
		<input type="file" id="bunkerImageInput" accept="image/*" hidden onchange="uploadBunkerImage(this)">
		<button type="button" class="btn-scenario-image" onclick="document.getElementById('bunkerImageInput').click()">${escapeHtml(t('uploadImage'))}</button>
		<button type="button" class="btn-scenario-image btn-generate" onclick="generateBunkerPrompt()">${escapeHtml(t('generatePrompt'))}</button>
		${model.imageUrl ? `<button type="button" class="btn-scenario-image btn-remove" onclick="removeBunkerImage()">${escapeHtml(t('remove'))}</button>` : ''}
	</div>` : '';
	const actions = `${imageButton}${hostControls}`;

	return `<article class="scenario-immersive-shell cinematic-section bunker-cinematic-shell bunker-visual-root variant-${variant} condition-${model.conditionSemantic}" aria-labelledby="bunker-facility-title">
		${renderBunkerMaterialLayers()}
		<div class="bunker-visual-content">
		<div class="cinematic-cover bunker-cinematic-stage">
			<header class="scenario-immersive-hero cinematic-cover__hero bunker-hero ${model.imageUrl ? 'has-image is-image-loading' : 'no-image'}">
				${media}<div class="bunker-hero-overlay" aria-hidden="true"></div>
				<div class="bunker-status-medallion" aria-hidden="true"><span class="bunker-status-icon">${renderBunkerIcon(variant)}</span></div>
				<div class="bunker-hero-content bunker-cover__content">
					<span class="bunker-badge">${escapeHtml(t('bunkerBadge'))}</span>
					<h4 id="bunker-facility-title" class="bunker-title">${escapeHtml(model.name)}</h4>
					${model.shortDescription ? `<p class="bunker-subtitle">${escapeHtml(model.shortDescription)}</p>` : ''}
					${renderBunkerCoverSummary(model, capacityValue)}
				</div>
			</header>
		</div>
		<section class="cinematic-details">
			<section class="cinematic-details__metrics bunker-metrics" aria-label="${escapeHtml(t('bunkerFacilityRecord'))}">
				<div class="bunker-metric metric-capacity"><span class="bunker-metric-label">${escapeHtml(t('capacity'))}</span><strong>${escapeHtml(capacityValue)}</strong></div>
				<div class="bunker-metric metric-condition"><span class="bunker-metric-label">${escapeHtml(t('condition'))}</span><strong>${escapeHtml(getBunkerConditionLabel(model.conditionKey))}</strong></div>
				<div class="bunker-metric metric-supplies"><span class="bunker-metric-label">${escapeHtml(t('supplies'))}</span><strong>${suppliesValue}</strong></div>
				<div class="bunker-metric metric-water"><span class="bunker-metric-label">${escapeHtml(t('water'))}</span><strong>${waterValue}</strong></div>
				<div class="bunker-metric metric-location"><span class="bunker-metric-label">${escapeHtml(t('location'))}</span><strong>${escapeHtml(locationValue)}</strong></div>
			</section>
			<div class="cinematic-details__columns bunker-content-grid">
				${renderBunkerContentSection('rooms', t('bunkerRooms'), model.rooms)}
				${renderBunkerContentSection('resources', t('bunkerResources'), model.resources)}
				${renderBunkerContentSection('problems', t('bunkerProblems'), model.problems)}
			</div>
			<footer class="cinematic-developer-toolbar bunker-footer bunker-control-deck"><span class="bunker-footer-kicker">${escapeHtml(t('bunkerFacilityRecord'))}</span>${actions ? `<div class="bunker-footer-actions">${actions}</div>` : ''}</footer>
		</section>
		</div>
	</article>`;
}

function renderBunker(bunker, options = {}) {
	const theme = syncBunkerVisualTheme(bunker);
	const container = document.getElementById('bunkerContent');
	if (!container) return;
	const panel = document.getElementById('bunkerPanel');
	const enabled = isLobbyConfiguredSystemEnabled('bunkerScenarioEnabled');
	if (panel) { panel.hidden = !enabled; panel.style.display = enabled ? '' : 'none'; }
	if (!enabled) { container.innerHTML = ''; updateScenarioSectionVisibility(); return; }
	container.innerHTML = renderBunkerFacility(buildBunkerFacilityModel(bunker));
	prepareBunkerHeroImage(container);
	if (!options.deferVisuals)
		applyBunkerMaterialPresentation(theme, container.querySelector('.bunker-visual-root'));
	updateScenarioSectionVisibility();
}

function handleBunkerHeroImageError(image) {
	const hero = image?.closest?.('.bunker-hero');
	if (!hero) return;
	const media = image.closest('.bunker-hero-media');
	media?.remove();
	hero.classList.remove('is-image-loading');
	const fallbackImage = hero.querySelector('.bunker-hero-media');
	if (fallbackImage) {
		fallbackImage.classList.remove('is-replacing', 'is-retiring');
		return;
	}
	hero.classList.remove('has-image');
	hero.classList.add('no-image');
}

function completeBunkerHeroImageLoad(image) {
	const hero = image?.closest?.('.bunker-hero');
	const media = image?.closest?.('.bunker-hero-media');
	if (!hero || !media || !image.naturalWidth) return handleBunkerHeroImageError(image);
	media.classList.remove('is-loading');
	media.classList.add('is-ready');
	hero.classList.remove('is-image-loading', 'no-image');
	hero.classList.add('has-image');
	syncBunkerHeroImageActions();
	for (const previous of hero.querySelectorAll('.bunker-hero-media.is-replacing')) {
		if (previous === media) continue;
		previous.classList.add('is-retiring');
		window.setTimeout(() => previous.remove(), 180);
	}
}

function syncBunkerHeroImageActions() {
	const actions = document.querySelector('.bunker-footer-actions');
	if (!actions) return;
	if (!actions.querySelector('.bunker-open-image')) {
		const openImage = document.createElement('button');
		openImage.type = 'button';
		openImage.className = 'bunker-open-image';
		openImage.textContent = t('bunkerOpenImage');
		openImage.addEventListener('click', openCurrentBunkerImage);
		actions.prepend(openImage);
	}
	const controls = actions.querySelector('.bunker-image-controls');
	if (controls && !controls.querySelector('.btn-remove')) {
		const removeImage = document.createElement('button');
		removeImage.type = 'button';
		removeImage.className = 'btn-scenario-image btn-remove';
		removeImage.textContent = t('remove');
		removeImage.addEventListener('click', removeBunkerImage);
		controls.append(removeImage);
	}
}

function prepareBunkerHeroImage(container = document) {
	const image = container?.querySelector?.('.bunker-hero-image:not([data-bunker-image-ready])');
	if (!image) return;
	image.dataset.bunkerImageReady = 'true';
	const finish = async () => {
		try {
			if (typeof image.decode === 'function') await image.decode();
		} catch (_) {
			// naturalWidth remains authoritative when decode rejects for an already cached image.
		} finally {
			if (image.naturalWidth) completeBunkerHeroImageLoad(image);
			else handleBunkerHeroImageError(image);
		}
	};
	if (image.complete) {
		finish();
		return;
	}
	image.addEventListener('load', finish, { once: true });
	image.addEventListener('error', () => handleBunkerHeroImageError(image), { once: true });
}

function updateBunkerHeroImage(imageUrl) {
	const hero = document.querySelector('.bunker-hero');
	if (!hero) return false;
	if (!imageUrl) {
		for (const media of hero.querySelectorAll('.bunker-hero-media')) media.remove();
		hero.classList.remove('has-image', 'is-image-loading');
		hero.classList.add('no-image');
		return true;
	}
	const currentImage = hero.querySelector('.bunker-hero-media:not(.is-replacing) .bunker-hero-image');
	if (currentImage?.getAttribute('src') === imageUrl) return true;
	for (const media of hero.querySelectorAll('.bunker-hero-media')) media.classList.add('is-replacing');
	const template = document.createElement('template');
	template.innerHTML = renderBunkerHeroImage(imageUrl);
	const media = template.content.firstElementChild;
	hero.insertBefore(media, hero.querySelector('.bunker-hero-overlay') || null);
	hero.classList.add('is-image-loading');
	prepareBunkerHeroImage(media);
	return true;
}

function openCurrentBunkerImage() {
	const model = buildBunkerFacilityModel(currentBunker);
	if (model?.imageUrl) openImageModal(model.imageUrl, model.name);
}
