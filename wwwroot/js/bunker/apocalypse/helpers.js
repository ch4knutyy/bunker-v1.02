// ==================== APOCALYPSE PURE HELPERS ====================

function normalizeApocalypseMetadataValue(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function normalizeApocalypseVisualThemeId(value) {
	const normalized = String(value ?? '').trim().toLowerCase();
	return Object.prototype.hasOwnProperty.call(apocalypseVisualThemeRegistry, normalized)
		? normalized
		: 'default-dark';
}

function resolveApocalypseVisualTheme(apocalypse) {
	if (!apocalypse) return 'default-dark';
	const hasThemeField = Object.prototype.hasOwnProperty.call(apocalypse, 'visualThemeId') ||
		Object.prototype.hasOwnProperty.call(apocalypse, 'VisualThemeId');
	if (hasThemeField) {
		return normalizeApocalypseVisualThemeId(apocalypse.visualThemeId ?? apocalypse.VisualThemeId);
	}

	const category = normalizeApocalypseMetadataValue(
		apocalypse.categoryId ?? apocalypse.CategoryId ?? apocalypse.category ?? apocalypse.Category
	);
	if (apocalypseCategoryThemeRegistry[category]) return apocalypseCategoryThemeRegistry[category];

	const tags = (Array.isArray(apocalypse.tags ?? apocalypse.Tags) ? (apocalypse.tags ?? apocalypse.Tags) : [])
		.map(normalizeApocalypseMetadataValue)
		.join(' ');
	const tagRules = [
		['extinction-red', /armageddon|nuclear|radiation|fallout/],
		['storm-blue', /weather|climate|storm|flood|winter_cold/],
		['biohazard-green', /biological|biohazard|infection|virus|fungal|zombie/],
		['seismic-amber', /geological|earthquake|seismic|volcanic/],
		['cosmic-violet', /cosmic|space|asteroid|meteor|solar/],
		['machine-cyan', /technology|ai_machines|cyber|robot|machine/],
		['wasteland-olive', /ecological|drought|toxic_contamination|wasteland/],
		['collapse-rust', /social_conflict|structural_damage|collapse|infrastructure/],
		['glitch-magenta', /anomaly|reality_distortion|dimensional/],
		['occult-indigo', /supernatural|mystical|occult|magic/]
	];
	return tagRules.find(([, pattern]) => pattern.test(tags))?.[0] || 'default-dark';
}

function resolveApocalypseVisualVariant(model) {
	const themeId = normalizeApocalypseVisualThemeId(model?.visualThemeId);
	if (themeId !== 'default-dark') return apocalypseVisualThemeRegistry[themeId].cardVariant;
	const metadata = [
		...(Array.isArray(model?.tags) ? model.tags : []),
		model?.category, model?.type, model?.classification, model?.imageCategory, model?.imageType
	].map(normalizeApocalypseMetadataValue).filter(Boolean).join(' ');
	const rules = [
		['nuclear', /nuclear|radiation|atomic|fallout/],
		['fungal', /fungal|fungus|spore|mushroom/],
		['zombie', /zombie|undead/],
		['biological', /biological|biohazard|infection|virus|pandemic|parasite|toxic_contamination/],
		['climate', /weather_climate|climate|winter_cold|heat_fire|volcanic_ash|storm|flood|drought|ice/],
		['cosmic', /cosmic|space|asteroid|meteor|solar|planetary/],
		['ai', /ai_machines|artificial_intelligence|technology|nanotech|cyber|robot|machine/],
		['alien', /alien|extraterrestrial|ufo|unknown_signal/],
		['mystical', /mystical|occult|magic|supernatural|rune/],
		['anomaly', /anomaly_reality|anomaly|reality_distortion|dimensional/],
		['collapse', /structural_damage|social_conflict|collapse|industrial|infrastructure/]
	];
	return rules.find(([, pattern]) => pattern.test(metadata))?.[0] || 'generic';
}

function normalizeApocalypseCategoryToken(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/_+/g, '-');
}

function getApocalypseDangerKey(value) {
	const normalized = normalizeApocalypseMetadataValue(value);
	if (['low', 'minor'].includes(normalized)) return 'low';
	if (['medium', 'moderate'].includes(normalized)) return 'medium';
	if (['high', 'severe'].includes(normalized)) return 'high';
	if (['very_high', 'veryhigh'].includes(normalized)) return 'very-high';
	if (['critical', 'extreme', 'catastrophic'].includes(normalized)) return 'critical';
	return 'unknown';
}

function getApocalypseDangerLabel(key) {
	return t({ low: 'dangerLow', medium: 'dangerMedium', high: 'dangerHigh', 'very-high': 'dangerVeryHigh', critical: 'dangerCritical' }[key] || 'dangerUnknown');
}

function apocalypseEffectSummaryKey(code, failed) {
	if (failed) return 'apocalypseEffectFailed';
	return ({
		apocalypse_effect_age: 'apocalypseEffectAge',
		apocalypse_effect_body: 'apocalypseEffectBody',
		apocalypse_effect_profession: 'apocalypseEffectProfession',
		apocalypse_effect_conditions: 'apocalypseEffectConditions'
	})[String(code || '')] || 'apocalypseEffectApplied';
}

function prefersReducedApocalypseMotion() {
	return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
}

function resolveApocalypseCategoryIconKey(categoryId) {
	return apocalypseCategoryIconRegistry[String(categoryId ?? '').trim().toLowerCase()] || 'generic';
}

function normalizeLocalScenarioImageUrl(value) {
	const url = String(value ?? '').trim().replace(/\\/g, '/');
	if (!url || /^(?:https?:)?\/\//i.test(url) || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.includes('..')) return '';
	return url.startsWith('/') ? url : `/${url.replace(/^\.\//, '')}`;
}

function buildApocalypseScenarioModel(source) {
	if (!source) return null;
	const rawTags = source.tags || source.Tags || [];
	const dangerLevel = source.dangerLevel ?? source.DangerLevel ?? source.severity ?? source.Severity ?? '';
	const model = {
		id: source.id || source.Id || '',
		name: getLocalizedValue(source, 'name') || t('unknown'),
		shortDescription: getLocalizedByFields(source, ['shortDescription', 'subtitle', 'description']),
		description: getLocalizedValue(source, 'description'),
		dangerLevel,
		survivalChance: source.survivalChance ?? source.SurvivalChance ?? '',
		duration: getLocalizedValue(source, 'duration') || '',
		threats: getLocalizedArray(source, 'threats'),
		requirements: getLocalizedArray(source, 'requirements'),
		consequences: getLocalizedArray(source, 'consequences'),
		imageUrl: normalizeLocalScenarioImageUrl(source.imageUrl || source.ImageUrl || source.uploadedImagePath || source.UploadedImagePath),
		tags: Array.isArray(rawTags) ? rawTags : [],
		categoryId: source.categoryId || source.CategoryId || '',
		visualThemeId: source.visualThemeId ?? source.VisualThemeId,
		category: source.categoryId || source.CategoryId || source.category || source.Category || '',
		type: source.type || source.Type || '',
		classification: source.classification || source.Classification || '',
		imageCategory: source.imageCategory || source.ImageCategory || '',
		imageType: source.imageType || source.ImageType || ''
	};
	model.visualVariant = resolveApocalypseVisualVariant(model);
	model.dangerKey = getApocalypseDangerKey(dangerLevel);
	return model;
}
