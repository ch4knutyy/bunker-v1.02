// ==================== APOCALYPSE RENDER FUNCTIONS ====================

function createApocalypseCategoryIcon(categoryId) {
	const template = document.createElement('template');
	template.innerHTML = apocalypseIconSvgRegistry[resolveApocalypseCategoryIconKey(categoryId)] || apocalypseIconSvgRegistry.generic;
	return template.content.firstElementChild;
}

function clearApocalypseVisualTheme() {
	const root = document.body;
	if (!root) return;
	root.classList.remove('apocalypse-theme-active', 'apocalypse-theme-revealing', 'apocalypse-ambient-paused');
	delete root.dataset.apocalypseTheme;
	delete root.dataset.apocalypseCategory;
	for (const key of ['apocalypseFamily', 'apocalypseArchetype', 'apocalypseLighting', 'apocalypseAir', 'apocalypseContamination', 'apocalypseDamage', 'apocalypseVisibility', 'apocalypseAccent', 'apocalypseModifiers', 'apocalypseEffects', 'apocalypseVariation', 'apocalypseTexture'])
		delete root.dataset[key];
	for (const property of ['--apocalypse-light-intensity', '--apocalypse-contamination-intensity', '--apocalypse-visibility-reduction', '--apocalypse-animation-intensity', '--apocalypse-light-position', '--apocalypse-temperature-shift'])
		root.style.removeProperty(property);
	const ambient = document.getElementById?.('apocalypseAmbientRoot');
	if (ambient) ambient.setAttribute('hidden', '');
	if (typeof stopApocalypseAmbientScheduler === 'function') stopApocalypseAmbientScheduler();
	if (typeof resetApocalypseParallax === 'function') resetApocalypseParallax();
	if (typeof clearApocalypseCardRevealWave === 'function') clearApocalypseCardRevealWave({ resetKey: true });
	if (typeof clearApocalypseCategoryVisualState === 'function') clearApocalypseCategoryVisualState();
}

function applyApocalypseVisualTheme(themeOrApocalypse) {
	const root = document.body;
	if (!root) return 'default-dark';
	const theme = themeOrApocalypse?.archetype && themeOrApocalypse?.themeId
		? themeOrApocalypse
		: resolveApocalypseVisualTheme(themeOrApocalypse);
	const themeId = theme.themeId;
	if (themeId === 'default-dark') {
		clearApocalypseVisualTheme();
	}

	const definition = apocalypseVisualThemeRegistry[themeId] || { categoryId: 'generic' };
	if (root.dataset.apocalypseTheme === themeId &&
		root.dataset.apocalypseCategory === (theme.category || definition.categoryId) &&
		root.dataset.apocalypseFamily === theme.family &&
		root.dataset.apocalypseArchetype === theme.archetype &&
		root.dataset.apocalypseVariation === String(theme.variation) &&
		root.classList.contains('apocalypse-theme-active')) return theme;

	clearApocalypseVisualTheme();
	const ambient = document.getElementById?.('apocalypseAmbientRoot');
	ambient?.removeAttribute(['hid', 'den'].join(''));
	root.dataset.apocalypseTheme = themeId;
	root.dataset.apocalypseCategory = theme.category || definition.categoryId;
	root.dataset.apocalypseFamily = theme.family;
	root.dataset.apocalypseArchetype = theme.archetype;
	root.dataset.apocalypseLighting = theme.lighting;
	root.dataset.apocalypseAir = theme.air;
	root.dataset.apocalypseContamination = theme.contamination;
	root.dataset.apocalypseDamage = theme.damage;
	root.dataset.apocalypseVisibility = theme.visibility;
	root.dataset.apocalypseAccent = theme.accent;
	root.dataset.apocalypseModifiers = theme.modifiers?.join(' ') || '';
	root.dataset.apocalypseEffects = theme.effects?.join(' ') || '';
	root.dataset.apocalypseVariation = String(theme.variation);
	root.dataset.apocalypseTexture = String(theme.textureVariant);
	root.style.setProperty('--apocalypse-light-intensity', String(theme.lightingIntensity));
	root.style.setProperty('--apocalypse-contamination-intensity', String(theme.contaminationIntensity));
	root.style.setProperty('--apocalypse-visibility-reduction', String(theme.visibilityReduction));
	root.style.setProperty('--apocalypse-animation-intensity', String(theme.animationIntensity));
	root.style.setProperty('--apocalypse-light-position', `${theme.lightPosition}%`);
	root.style.setProperty('--apocalypse-temperature-shift', `${theme.temperatureShift}deg`);
	root.classList.add('apocalypse-theme-active');
	return theme;
}

function syncApocalypseVisualTheme(apocalypse) {
	return apocalypse && currentPublicGameSettings.apocalypseThemeEnabled !== false
		? applyApocalypseVisualTheme(apocalypse)
		: (clearApocalypseVisualTheme(), 'default-dark');
}

function renderApocalypseIcon(variant) {
	return apocalypseIconSvgRegistry[variant] || apocalypseIconSvgRegistry.generic;
}

function renderApocalypseContentSection(kind, title, items) {
	if (!Array.isArray(items) || !items.length) return '';
	return `<section class="apocalypse-content-card content-${kind}" aria-labelledby="apoc-${kind}-title">
		<h5 id="apoc-${kind}-title" class="apocalypse-content-title"><span aria-hidden="true"></span>${escapeHtml(title)}</h5>
		<ul>${items.map(item => `<li><span aria-hidden="true"></span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>
	</section>`;
}

function renderApocalypseSurvivorMetric(survivalChance) {
	const presentation = buildApocalypseSurvivorPresentation(survivalChance);
	const tooltipId = 'apocalypse-survivors-tooltip';
	const tooltip = presentation.isValid
		? `<span class="characteristic-with-tooltip apocalypse-survivor-tooltip"><button type="button" class="tooltip-trigger" aria-label="${escapeHtml(presentation.tooltip)}" aria-controls="${tooltipId}" aria-expanded="false">?</button><span id="${tooltipId}" class="tooltip-content" role="tooltip">${escapeHtml(presentation.tooltip)}</span></span>`
		: '';
	const percentage = presentation.isValid
		? `<small class="apocalypse-survivor-percentage">${escapeHtml(presentation.percentage)}</small>`
		: '';
	return `<div class="apocalypse-metric metric-survival"><span class="apocalypse-metric-label">${escapeHtml(t('peopleRemaining'))}</span><div class="apocalypse-survivor-value-row"><strong class="apocalypse-survivor-value" aria-label="${escapeHtml(presentation.ariaLabel)}">${escapeHtml(presentation.compact)}</strong>${tooltip}</div>${percentage}</div>`;
}

function renderApocalypseCoverSurvivors(survivalChance) {
	const presentation = buildApocalypseSurvivorPresentation(survivalChance);
	return `<div class="apocalypse-cover-survivors"><span>${escapeHtml(t('peopleRemaining'))}</span><strong aria-label="${escapeHtml(presentation.ariaLabel)}">${escapeHtml(presentation.compact)}</strong>${presentation.isValid ? `<small>${escapeHtml(presentation.percentage)}</small>` : ''}</div>`;
}

function renderApocalypseHeroImage(imageUrl) {
	if (!imageUrl) return '';
	return `<div class="apocalypse-hero-media is-loading" aria-hidden="true">
		<img class="apocalypse-hero-image" src="${escapeHtml(imageUrl)}" alt="" loading="eager" decoding="async">
	</div>`;
}

function renderApocalypseScenario(model, options = {}) {
	if (!model) return `<p class="apocalypse-empty">${escapeHtml(t('unknown'))}</p>`;
	const variant = model.visualVariant || resolveApocalypseVisualVariant(model);
	const durationValue = model.duration || t('unknown');
	const heroImage = renderApocalypseHeroImage(model.imageUrl);
	const imageButton = model.imageUrl
		? `<button type="button" class="apocalypse-open-image" onclick="openCurrentApocalypseImage()">${escapeHtml(t('apocOpenImage'))}</button>`
		: '';
	const hostControls = developerFeatureEnabled('scenarioImages') ? `<div class="scenario-image-controls apocalypse-image-controls">
		<input type="file" id="apocalypseImageInput" accept="image/*" hidden onchange="uploadApocalypseImage(this)">
		<button type="button" class="btn-scenario-image" onclick="document.getElementById('apocalypseImageInput').click()">${escapeHtml(t('uploadImage'))}</button>
		<button type="button" class="btn-scenario-image btn-generate" onclick="generateApocalypsePrompt()">${escapeHtml(t('generatePrompt'))}</button>
		${model.imageUrl ? `<button type="button" class="btn-scenario-image btn-remove" onclick="removeApocalypseImage()">${escapeHtml(t('remove'))}</button>` : ''}
	</div>` : '';
	const details = model.description && model.description !== model.shortDescription
		? `<p class="apocalypse-footer-description">${escapeHtml(model.description)}</p>` : '';

	return `<article class="scenario-immersive-shell cinematic-section apocalypse-scenario-shell variant-${variant}" aria-labelledby="apocalypse-scenario-title">
		<div class="apocalypse-card-border-light" aria-hidden="true"></div>
		<div class="apocalypse-card-reveal-wave" aria-hidden="true"></div>
		${options.deferVisuals ? '<div class="apocalypse-effect-stack" aria-hidden="true"></div>' : renderApocalypseEffectLayers()}
		<div class="cinematic-cover apocalypse-cinematic-stage">
			<header class="scenario-immersive-hero cinematic-cover__hero apocalypse-hero ${model.imageUrl ? 'has-image is-image-loading' : 'no-image'}">
				${heroImage}
				<div class="apocalypse-hero-overlay" aria-hidden="true"></div>
				<div class="apocalypse-hero-pattern" aria-hidden="true"></div>
				<div class="apocalypse-theme-mark" aria-hidden="true">${renderApocalypseIcon(variant)}</div>
				<div class="apocalypse-hero-content apocalypse-hero-copy apocalypse-cover__content">
					<span class="apocalypse-badge">${escapeHtml(t('apocBadge'))}</span>
					<h4 id="apocalypse-scenario-title" class="apocalypse-title">${escapeHtml(model.name)}</h4>
					${model.shortDescription ? `<p class="apocalypse-subtitle">${escapeHtml(model.shortDescription)}</p>` : ''}
					${renderApocalypseCoverSurvivors(model.survivalChance)}
				</div>
			</header>
		</div>
		<section class="cinematic-details">
		<section class="cinematic-details__metrics apocalypse-metrics" aria-label="${escapeHtml(t('apocBadge'))}">
			<div class="apocalypse-metric metric-danger" data-danger="${model.dangerKey}"><span class="apocalypse-metric-label">${escapeHtml(t('apocDanger'))}</span><strong>${escapeHtml(getApocalypseDangerLabel(model.dangerKey))}</strong></div>
			${renderApocalypseSurvivorMetric(model.survivalChance)}
			<div class="apocalypse-metric metric-duration"><span class="apocalypse-metric-label">${escapeHtml(t('duration'))}</span><strong>${escapeHtml(durationValue)}</strong></div>
		</section>
		<div class="cinematic-details__columns apocalypse-content-grid apocalypse-primary-content-grid">
			${renderApocalypseContentSection('threats', t('apocMainThreats'), model.threats)}
			${renderApocalypseContentSection('requirements', t('apocSurvivalRequirements'), model.requirements)}
		</div>
		${model.consequences?.length ? `<div class="apocalypse-consequences">${renderApocalypseContentSection('consequences', t('apocConsequences'), model.consequences)}</div>` : ''}
		<footer class="cinematic-developer-toolbar apocalypse-footer"><div><span class="apocalypse-footer-kicker">${escapeHtml(t('apocScenarioBrief'))}</span>${details}</div><div class="apocalypse-footer-actions">${imageButton}${hostControls}</div></footer>
		</section>
	</article>`;
}

function renderApocalypseCategoryBadge(apocalypse) {
	const profile = resolveApocalypseCategoryProfile(apocalypse);
	const hero = document.querySelector('.apocalypse-hero-content');
	if (!hero) return;
	const categoryId = profile?.categoryId || '';
	const language = ['uk', 'en', 'ru'].includes(getCurrentLanguage?.()) ? getCurrentLanguage() : 'uk';
	const badge = document.createElement('span');
	badge.className = 'apocalypse-category-badge';
	badge.dataset.category = categoryId || 'generic';
	const icon = document.createElement('span'); icon.className = 'apocalypse-category-badge-icon'; icon.setAttribute('aria-hidden', 'true'); icon.append(createApocalypseCategoryIcon(categoryId));
	const label = document.createElement('span'); label.textContent = profile?.category?._i18n?.name?.[language] || profile?.category?._i18n?.name?.uk || t('apocalypse');
	badge.append(icon, label);
	const title = hero.querySelector('.apocalypse-title');
	hero.insertBefore(badge, title || null);
}

function handleApocalypseHeroImageError(image) {
	const hero = image?.closest?.('.apocalypse-hero');
	if (!hero) return;
	const media = image.closest('.apocalypse-hero-media');
	media?.remove();
	hero.classList.remove('is-image-loading');
	const fallbackImage = hero.querySelector('.apocalypse-hero-media');
	if (fallbackImage) {
		fallbackImage.classList.remove('is-replacing', 'is-retiring');
		return;
	}
	hero.classList.remove('has-image');
	hero.classList.add('no-image');
}

function completeApocalypseHeroImageLoad(image) {
	const hero = image?.closest?.('.apocalypse-hero');
	const media = image?.closest?.('.apocalypse-hero-media');
	if (!hero || !media || !image.naturalWidth) return handleApocalypseHeroImageError(image);
	media.classList.remove('is-loading');
	media.classList.add('is-ready');
	hero.classList.remove('is-image-loading', 'no-image');
	hero.classList.add('has-image');
	syncApocalypseHeroImageActions();
	for (const previous of hero.querySelectorAll('.apocalypse-hero-media.is-replacing')) {
		if (previous === media) continue;
		previous.classList.add('is-retiring');
		window.setTimeout(() => previous.remove(), 180);
	}
}

function syncApocalypseHeroImageActions() {
	const actions = document.querySelector('.apocalypse-footer-actions');
	if (!actions) return;
	if (!actions.querySelector('.apocalypse-open-image')) {
		const openImage = document.createElement('button');
		openImage.type = 'button';
		openImage.className = 'apocalypse-open-image';
		openImage.textContent = t('apocOpenImage');
		openImage.addEventListener('click', openCurrentApocalypseImage);
		actions.prepend(openImage);
	}
	const controls = actions.querySelector('.apocalypse-image-controls');
	if (controls && !controls.querySelector('.btn-remove')) {
		const removeImage = document.createElement('button');
		removeImage.type = 'button';
		removeImage.className = 'btn-scenario-image btn-remove';
		removeImage.textContent = t('remove');
		removeImage.addEventListener('click', removeApocalypseImage);
		controls.append(removeImage);
	}
}

function prepareApocalypseHeroImage(container = document) {
	const image = container?.querySelector?.('.apocalypse-hero-image:not([data-apocalypse-image-ready])');
	if (!image) return;
	image.dataset.apocalypseImageReady = 'true';
	const finish = async () => {
		try {
			if (typeof image.decode === 'function') await image.decode();
		} catch (_) {
			// A decoded cached image may reject in some browsers; naturalWidth remains authoritative.
		} finally {
			if (image.naturalWidth) completeApocalypseHeroImageLoad(image);
			else handleApocalypseHeroImageError(image);
		}
	};
	if (image.complete) {
		finish();
		return;
	}
	image.addEventListener('load', finish, { once: true });
	image.addEventListener('error', () => handleApocalypseHeroImageError(image), { once: true });
}

function updateApocalypseHeroImage(imageUrl) {
	const hero = document.querySelector('.apocalypse-hero');
	if (!hero || !imageUrl) return false;
	const currentImage = hero.querySelector('.apocalypse-hero-media:not(.is-replacing) .apocalypse-hero-image');
	if (currentImage?.getAttribute('src') === imageUrl) return true;
	for (const media of hero.querySelectorAll('.apocalypse-hero-media')) media.classList.add('is-replacing');
	const template = document.createElement('template');
	template.innerHTML = renderApocalypseHeroImage(imageUrl).trim();
	const media = template.content.firstElementChild;
	const overlay = hero.querySelector('.apocalypse-hero-overlay');
	hero.insertBefore(media, overlay || null);
	hero.classList.add('is-image-loading');
	prepareApocalypseHeroImage(media);
	return true;
}

function openCurrentApocalypseImage() {
	const model = buildApocalypseScenarioModel(currentApocalypse);
	if (model?.imageUrl) openImageModal(model.imageUrl, model.name);
}
