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
	const ambient = document.getElementById?.('apocalypseAmbientRoot');
	if (ambient) ambient.setAttribute('hidden', '');
	if (typeof stopApocalypseAmbientScheduler === 'function') stopApocalypseAmbientScheduler();
	if (typeof resetApocalypseParallax === 'function') resetApocalypseParallax();
	if (typeof clearApocalypseCardRevealWave === 'function') clearApocalypseCardRevealWave({ resetKey: true });
	if (typeof clearApocalypseCategoryVisualState === 'function') clearApocalypseCategoryVisualState();
}

function applyApocalypseVisualTheme(apocalypse) {
	const root = document.body;
	if (!root) return 'default-dark';
	const themeId = resolveApocalypseVisualTheme(apocalypse);
	if (themeId === 'default-dark') {
		clearApocalypseVisualTheme();
		return themeId;
	}

	const definition = apocalypseVisualThemeRegistry[themeId];
	if (root.dataset.apocalypseTheme === themeId &&
		root.dataset.apocalypseCategory === definition.categoryId &&
		root.classList.contains('apocalypse-theme-active')) return themeId;

	clearApocalypseVisualTheme();
	const ambient = document.getElementById?.('apocalypseAmbientRoot');
	ambient?.removeAttribute(['hid', 'den'].join(''));
	root.dataset.apocalypseTheme = themeId;
	root.dataset.apocalypseCategory = definition.categoryId;
	root.classList.add('apocalypse-theme-active');
	return themeId;
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

function renderApocalypseScenario(model) {
	if (!model) return `<p class="apocalypse-empty">${escapeHtml(t('unknown'))}</p>`;
	const variant = model.visualVariant || resolveApocalypseVisualVariant(model);
	const survivalValue = model.survivalChance === '' || model.survivalChance == null
		? t('unknown')
		: `${escapeHtml(model.survivalChance)}${typeof model.survivalChance === 'number' || /^\d+(?:[.,]\d+)?$/.test(String(model.survivalChance)) ? '%' : ''}`;
	const durationValue = model.duration || t('unknown');
	const heroImage = model.imageUrl
		? `<div class="apocalypse-hero-media" aria-hidden="true">
			<img class="apocalypse-hero-image" src="${escapeHtml(model.imageUrl)}" alt="" loading="eager" onerror="handleApocalypseHeroImageError(this)">
		</div>`
		: '';
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

	return `<article class="scenario-immersive-shell apocalypse-scenario-shell variant-${variant}" aria-labelledby="apocalypse-scenario-title">
		<div class="apocalypse-card-border-light" aria-hidden="true"></div>
		<div class="apocalypse-card-reveal-wave" aria-hidden="true"></div>
		<header class="scenario-immersive-hero apocalypse-hero ${model.imageUrl ? 'has-image' : 'no-image'}">
			${heroImage}
			<div class="apocalypse-hero-overlay" aria-hidden="true"></div>
			<div class="apocalypse-hero-pattern" aria-hidden="true"></div>
			<div class="apocalypse-theme-mark" aria-hidden="true">${renderApocalypseIcon(variant)}</div>
			<div class="apocalypse-hero-content apocalypse-hero-copy">
				<span class="apocalypse-badge">${escapeHtml(t('apocBadge'))}</span>
				<h4 id="apocalypse-scenario-title" class="apocalypse-title">${escapeHtml(model.name)}</h4>
				${model.shortDescription ? `<p class="apocalypse-subtitle">${escapeHtml(model.shortDescription)}</p>` : ''}
			</div>
		</header>
		<section class="apocalypse-metrics" aria-label="${escapeHtml(t('apocBadge'))}">
			<div class="apocalypse-metric metric-danger" data-danger="${model.dangerKey}"><span class="apocalypse-metric-label">${escapeHtml(t('apocDanger'))}</span><strong>${escapeHtml(getApocalypseDangerLabel(model.dangerKey))}</strong></div>
			<div class="apocalypse-metric metric-survival"><span class="apocalypse-metric-label">${escapeHtml(t('survivalChance'))}</span><strong>${survivalValue}</strong></div>
			<div class="apocalypse-metric metric-duration"><span class="apocalypse-metric-label">${escapeHtml(t('duration'))}</span><strong>${escapeHtml(durationValue)}</strong></div>
		</section>
		<div class="apocalypse-content-grid">
			${renderApocalypseContentSection('threats', t('apocMainThreats'), model.threats)}
			${renderApocalypseContentSection('requirements', t('apocSurvivalRequirements'), model.requirements)}
			${renderApocalypseContentSection('consequences', t('apocConsequences'), model.consequences)}
		</div>
		<footer class="apocalypse-footer"><div><span class="apocalypse-footer-kicker">${escapeHtml(t('apocScenarioBrief'))}</span>${details}</div><div class="apocalypse-footer-actions">${imageButton}${hostControls}</div></footer>
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
	hero.classList.remove('has-image');
	hero.classList.add('no-image');
	image.closest('.apocalypse-hero-media')?.remove();
}

function openCurrentApocalypseImage() {
	const model = buildApocalypseScenarioModel(currentApocalypse);
	if (model?.imageUrl) openImageModal(model.imageUrl, model.name);
}
