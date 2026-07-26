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
	const media = model.imageUrl ? `<div class="bunker-hero-media" aria-hidden="true">
		<img class="bunker-hero-image" src="${escapeHtml(model.imageUrl)}" alt="" loading="eager" onerror="handleBunkerHeroImageError(this)">
	</div>` : '';
	const imageButton = model.imageUrl ? `<button type="button" class="bunker-open-image" onclick="openCurrentBunkerImage()">${escapeHtml(t('bunkerOpenImage'))}</button>` : '';
	const hostControls = developerFeatureEnabled('scenarioImages') ? `<div class="scenario-image-controls bunker-image-controls">
		<input type="file" id="bunkerImageInput" accept="image/*" hidden onchange="uploadBunkerImage(this)">
		<button type="button" class="btn-scenario-image" onclick="document.getElementById('bunkerImageInput').click()">${escapeHtml(t('uploadImage'))}</button>
		<button type="button" class="btn-scenario-image btn-generate" onclick="generateBunkerPrompt()">${escapeHtml(t('generatePrompt'))}</button>
		${model.imageUrl ? `<button type="button" class="btn-scenario-image btn-remove" onclick="removeBunkerImage()">${escapeHtml(t('remove'))}</button>` : ''}
	</div>` : '';
	const actions = `${imageButton}${hostControls}`;

	return `<article class="scenario-immersive-shell bunker-facility-shell variant-${variant} condition-${model.conditionSemantic}" aria-labelledby="bunker-facility-title">
		<header class="scenario-immersive-hero bunker-hero ${model.imageUrl ? 'has-image' : 'no-image'}">
			${media}<div class="bunker-hero-overlay" aria-hidden="true"></div><div class="bunker-hero-pattern" aria-hidden="true"></div>
			<div class="bunker-status-medallion" aria-hidden="true"><span class="bunker-status-icon">${renderBunkerIcon(variant)}</span></div>
			<div class="bunker-hero-content">
				<span class="bunker-badge">${escapeHtml(t('bunkerBadge'))}</span>
				<h4 id="bunker-facility-title" class="bunker-title">${escapeHtml(model.name)}</h4>
				${model.shortDescription ? `<p class="bunker-subtitle">${escapeHtml(model.shortDescription)}</p>` : ''}
			</div>
		</header>
		<section class="bunker-metrics" aria-label="${escapeHtml(t('bunkerFacilityRecord'))}">
			<div class="bunker-metric metric-capacity"><span class="bunker-metric-label">${escapeHtml(t('capacity'))}</span><strong>${escapeHtml(capacityValue)}</strong></div>
			<div class="bunker-metric metric-condition"><span class="bunker-metric-label">${escapeHtml(t('condition'))}</span><strong>${escapeHtml(getBunkerConditionLabel(model.conditionKey))}</strong></div>
			<div class="bunker-metric metric-supplies"><span class="bunker-metric-label">${escapeHtml(t('supplies'))}</span><strong>${suppliesValue}</strong></div>
			<div class="bunker-metric metric-water"><span class="bunker-metric-label">${escapeHtml(t('water'))}</span><strong>${waterValue}</strong></div>
			<div class="bunker-metric metric-location"><span class="bunker-metric-label">${escapeHtml(t('location'))}</span><strong>${escapeHtml(locationValue)}</strong></div>
		</section>
		<div class="bunker-content-grid">
			${renderBunkerContentSection('rooms', t('bunkerRooms'), model.rooms)}
			${renderBunkerContentSection('resources', t('bunkerResources'), model.resources)}
			${renderBunkerContentSection('problems', t('bunkerProblems'), model.problems)}
		</div>
		${actions ? `<footer class="bunker-footer"><span class="bunker-footer-kicker">${escapeHtml(t('bunkerFacilityRecord'))}</span><div class="bunker-footer-actions">${actions}</div></footer>` : ''}
	</article>`;
}

function renderBunker(bunker) {
	syncBunkerVisualTheme(bunker);
	const container = document.getElementById('bunkerContent');
	if (!container) return;
	const panel = document.getElementById('bunkerPanel');
	const enabled = isLobbyConfiguredSystemEnabled('bunkerScenarioEnabled');
	if (panel) { panel.hidden = !enabled; panel.style.display = enabled ? '' : 'none'; }
	if (!enabled) { container.innerHTML = ''; updateScenarioSectionVisibility(); return; }
	container.innerHTML = renderBunkerFacility(buildBunkerFacilityModel(bunker));
	updateScenarioSectionVisibility();
}

function handleBunkerHeroImageError(image) {
	const hero = image?.closest?.('.bunker-hero');
	if (!hero) return;
	hero.classList.remove('has-image');
	hero.classList.add('no-image');
	image.closest('.bunker-hero-media')?.remove();
}

function openCurrentBunkerImage() {
	const model = buildBunkerFacilityModel(currentBunker);
	if (model?.imageUrl) openImageModal(model.imageUrl, model.name);
}
