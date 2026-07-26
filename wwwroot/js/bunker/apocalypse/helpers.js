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

function resolveApocalypseVisualThemeId(apocalypse) {
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

function apocalypseStableVisualHash(value) {
	let hash = 2166136261;
	for (const character of String(value || 'apocalypse-fallback')) {
		hash ^= character.codePointAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function clampApocalypseIntensity(value, minimum, maximum, fallback) {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? Math.max(minimum, Math.min(maximum, numeric)) : fallback;
}

function getApocalypseVisualMetadata(apocalypse) {
	const id = String(apocalypse?.id ?? apocalypse?.Id ?? '').trim();
	const registered = window.ApocalypseCategoryVisualRegistry?.getApocalypseVisualMetadata?.(id);
	const tags = apocalypse?.tags ?? apocalypse?.Tags ?? [];
	const modifiers = apocalypse?.visualModifierIds ?? apocalypse?.VisualModifierIds ?? registered?.visualModifierIds ?? [];
	const localized = apocalypse?._i18n ?? apocalypse?.I18n ?? {};
	const text = [
		id,
		apocalypse?.type, apocalypse?.Type, apocalypse?.categoryId, apocalypse?.CategoryId,
		apocalypse?.category, apocalypse?.Category, apocalypse?.classification, apocalypse?.Classification,
		apocalypse?.name, apocalypse?.Name,
		...(Array.isArray(tags) ? tags : []),
		...(Array.isArray(modifiers) ? modifiers : []),
		...Object.values(localized).flatMap(entry => entry && typeof entry === 'object' ? Object.values(entry) : [entry])
	].flat(Infinity).filter(value => typeof value === 'string').join(' ').toLocaleLowerCase().replace(/[_-]+/g, ' ');
	return {
		id,
		category: normalizeApocalypseMetadataValue(apocalypse?.categoryId ?? apocalypse?.CategoryId ?? registered?.categoryId ?? apocalypse?.category ?? apocalypse?.Category),
		modifiers: Array.isArray(modifiers) ? modifiers.map(normalizeApocalypseMetadataValue) : [],
		text
	};
}

function inferApocalypsePhysicalArchetype(apocalypse) {
	const metadata = getApocalypseVisualMetadata(apocalypse);
	const has = value => metadata.modifiers.includes(normalizeApocalypseMetadataValue(value));
	const text = metadata.text;
	if (has('radiation') || /(nuclear|atomic|radiation|fallout|ядер|атомн|радіац|радиац)/u.test(text)) return 'nuclear';
	if (has('heat') || /(wildfire|fire sky|global fire|combust|пожеж|вогн|пожар|огнен)/u.test(text)) return 'fire';
	if (has('frost') || /(ice age|extreme cold|nuclear winter|frozen|льодов|крижан|ледников|замерз)/u.test(text)) return 'ice';
	if (has('flood') || /(flood|ocean rise|tsunami|затоп|повін|наводнен)/u.test(text)) return 'flood';
	if (/(pandemic|epidemic|virus|plague|пандем|епідем|вірус|чума|эпидем)/u.test(text)) return 'pandemic';
	if (has('spores') || has('mutation') || has('parasite') || /(biological contamination|fungal|organic bloom|біологіч|біозабруд|биологичес)/u.test(text)) return 'biological';
	if (has('toxic') || has('air_hazard') || /(chemical|poison atmosphere|toxic gas|хіміч|отруйн|химичес|ядовит)/u.test(text)) return 'chemical';
	if (has('ash') || /(volcan|eruption|ash ocean|вулкан|попіл|пепел)/u.test(text)) return 'volcanic';
	if (has('drought') || /(desert|drought|sand storm|опустел|посух|засух|пустын)/u.test(text)) return 'desert';
	if (has('darkness') || has('blackout') || /(sun disappearance|endless darkness|night without end|зникнен.{0,8}сонц|вічн.{0,8}темр|исчезновен.{0,8}солнц|вечн.{0,8}тьм)/u.test(text)) return 'darkness';
	if (has('emp') || /(solar flare|electromagnetic|magnetic storm|сонячн.{0,8}спалах|електромагніт|солнечн.{0,8}вспыш|электромагнит)/u.test(text)) return 'solar';
	if (has('unrest') || /(world war|civil war|machine war|війна|воєн|война|военн)/u.test(text)) return 'war';
	if (has('machine') || metadata.category === 'technology' || /(artificial intelligence|machine uprising|robot|штучн.{0,8}інтелект|машин|искусственн.{0,8}интеллект|робот)/u.test(text)) return 'machine';
	if (has('reality_fracture') || metadata.category === 'anomaly' || /(anomal|conscious object|reality|аномал|реальност)/u.test(text)) return 'anomalous';
	return 'generic-collapse';
}

function resolveApocalypseVisualTheme(apocalypse) {
	const themeId = resolveApocalypseVisualThemeId(apocalypse);
	const archetype = apocalypse ? inferApocalypsePhysicalArchetype(apocalypse) : 'generic-collapse';
	const profile = apocalypsePhysicalThemeProfiles[archetype] || apocalypsePhysicalThemeFallback;
	const id = String(apocalypse?.id ?? apocalypse?.Id ?? 'apocalypse-fallback');
	const hash = apocalypseStableVisualHash(id);
	return Object.freeze({
		themeId,
		archetype,
		lighting: profile.lighting,
		air: profile.air,
		contamination: profile.contamination,
		damage: profile.damage,
		visibility: profile.visibility,
		accent: profile.accent,
		intensity: clampApocalypseIntensity(profile.intensity, .08, .42, .18),
		lightingIntensity: clampApocalypseIntensity(profile.lightingIntensity, .08, .32, .18),
		contaminationIntensity: clampApocalypseIntensity(profile.contaminationIntensity, 0, .22, .08),
		visibilityReduction: clampApocalypseIntensity(profile.visibilityReduction, 0, .18, .04),
		animationIntensity: clampApocalypseIntensity(profile.animationIntensity, 0, .06, .03),
		variation: hash % 4,
		textureVariant: (hash >>> 4) % 3,
		lightPosition: 12 + ((hash >>> 7) % 77),
		temperatureShift: ((hash >>> 12) % 9) - 4
	});
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
