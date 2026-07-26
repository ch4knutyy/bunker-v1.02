// Classic-script globals are intentional: the Bunker client does not use ES modules.

const bunkerThemeFallback = Object.freeze({
	archetype: 'civilian',
	condition: 'fair',
	material: 'painted-metal',
	cleanliness: 'used',
	technology: 'standard',
	atmosphere: 'oppressive',
	accent: 'civilian-amber'
});

const bunkerThemeAllowedValues = Object.freeze({
	archetype: new Set([
		'medical', 'military', 'industrial', 'dirty', 'scientific', 'nuclear',
		'government', 'luxury', 'civilian', 'improvised', 'underground-city',
		'mine', 'submarine', 'prison', 'religious', 'agricultural', 'cryogenic',
		'abandoned'
	]),
	condition: new Set([
		'excellent', 'good', 'fair', 'poor', 'critical', 'abandoned', 'flooded',
		'burned', 'contaminated', 'damaged'
	]),
	material: new Set([
		'steel', 'rusted-steel', 'painted-metal', 'concrete', 'ceramic', 'glass',
		'wood', 'plastic', 'stone', 'composite', 'mixed'
	]),
	cleanliness: new Set(['sterile', 'clean', 'used', 'dirty', 'filthy', 'contaminated']),
	technology: new Set(['primitive', 'improvised', 'standard', 'advanced', 'experimental']),
	atmosphere: new Set([
		'cold', 'warm', 'oppressive', 'emergency', 'toxic', 'dark', 'damp',
		'dusty', 'clinical', 'claustrophobic'
	])
});

const bunkerArchetypeRules = Object.freeze([
	['medical', /(medical|hospital|clinic|healthcare|quarantine|infirmary|medicine|медич|лікар|кліні|карантин|госпітал|медиц|больниц|лечеб)\w*/u],
	['military', /(military|army|command|defen[cs]e|tactical|arsenal|security|військ|армі|оборон|командн|военн|армей|защит)\w*/u],
	['industrial', /(industrial|factory|manufactur|power.?plant|workshop|mechanic|промисл|завод|фабрик|електростан|промышлен|мастерск)\w*/u],
	['scientific', /(scientific|science|research|laboratory|lab\b|дослід|науков|лаборатор|исслед|научн)\w*/u],
	['nuclear', /(nuclear|atomic|reactor|radiation|radiactive|ядер|атомн|реактор|радіац|радиац)\w*/u],
	['government', /(government|federal|state.?archive|parliament|administration|уряд|держав|архів|правитель|государств|администрац)\w*/u],
	['luxury', /(luxury|elite|presidential|executive|vip|premium|люкс|еліт|президент|роскош|элит)\w*/u],
	['improvised', /(improvised|makeshift|homemade|scrap|garage|самороб|імпровіз|кустар|самодель|гараж)\w*/u],
	['underground-city', /(underground.?city|metro|subway|megacomplex|підземн.{0,8}міст|метро|подземн.{0,8}город)\w*/u],
	['mine', /(mine|shaft|mining|quarry|шахт|копаль|рудник)\w*/u],
	['submarine', /(submarine|underwater|naval|oceanic|підводн|субмарин|подводн)\w*/u],
	['prison', /(prison|detention|penitentiary|jail|в'язниц|тюрм|колоні|заключен)\w*/u],
	['religious', /(religious|monastery|church|temple|cult|монастир|церкв|храм|релігі|монастыр|религи)\w*/u],
	['agricultural', /(agricultur|greenhouse|farm|seed.?storage|hydropon|теплиц|ферм|насін|гідропон|семен)\w*/u],
	['cryogenic', /(cryogenic|cryo|freezer|frozen|кріоген|криоген|морозиль)\w*/u],
	['abandoned', /(abandoned|derelict|forgotten|ruined|покинут|занедбан|заброш|забыт|руин)\w*/u],
	['dirty', /(dirty|filthy|sewer|waste|rust|бруд|сміт|ірж|гряз|мусор|ржав)\w*/u],
	['civilian', /(civilian|residential|public.?shelter|community|цивіль|житлов|громад|граждан|жилой|обществен)\w*/u]
]);

const bunkerArchetypeDefaults = Object.freeze({
	medical: ['ceramic', 'sterile', 'advanced', 'clinical', 'medical-blue'],
	military: ['steel', 'used', 'standard', 'oppressive', 'military-green'],
	industrial: ['steel', 'dirty', 'standard', 'oppressive', 'hazard-amber'],
	dirty: ['rusted-steel', 'filthy', 'improvised', 'damp', 'rust-amber'],
	scientific: ['glass', 'clean', 'advanced', 'cold', 'science-cyan'],
	nuclear: ['steel', 'used', 'advanced', 'toxic', 'radiation-lime'],
	government: ['painted-metal', 'used', 'standard', 'oppressive', 'government-brass'],
	luxury: ['wood', 'clean', 'advanced', 'warm', 'luxury-gold'],
	civilian: ['painted-metal', 'used', 'standard', 'oppressive', 'civilian-amber'],
	improvised: ['mixed', 'dirty', 'improvised', 'claustrophobic', 'salvage-orange'],
	'underground-city': ['concrete', 'used', 'standard', 'dark', 'sector-amber'],
	mine: ['stone', 'dirty', 'primitive', 'dusty', 'mine-amber'],
	submarine: ['steel', 'used', 'standard', 'damp', 'submarine-teal'],
	prison: ['concrete', 'dirty', 'primitive', 'oppressive', 'prison-gray'],
	religious: ['wood', 'used', 'primitive', 'warm', 'ritual-amber'],
	agricultural: ['plastic', 'dirty', 'standard', 'damp', 'agri-green'],
	cryogenic: ['composite', 'clean', 'experimental', 'cold', 'cryo-blue'],
	abandoned: ['rusted-steel', 'filthy', 'primitive', 'dark', 'emergency-amber']
});

function normalizeBunkerThemeToken(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function readBunkerThemeValue(source, key) {
	const explicit = source?.visualTheme ?? source?.VisualTheme ?? source?.theme ?? source?.Theme ?? {};
	const pascalKey = key.charAt(0).toUpperCase() + key.slice(1);
	return explicit[key] ?? explicit[pascalKey] ??
		source?.[`visual${pascalKey}`] ?? source?.[`Visual${pascalKey}`] ??
		source?.[`theme${pascalKey}`] ?? source?.[`Theme${pascalKey}`];
}

function validBunkerThemeValue(key, value, fallback) {
	const normalized = normalizeBunkerThemeToken(value);
	return bunkerThemeAllowedValues[key]?.has(normalized) ? normalized : fallback;
}

function bunkerThemeText(source) {
	const localized = source?._i18n ?? source?.I18n ?? {};
	const values = [
		source?.id, source?.Id, source?.type, source?.Type, source?.category, source?.Category,
		source?.classification, source?.Classification, source?.name, source?.Name,
		source?.description, source?.Description, source?.location, source?.Location,
		...(source?.bunkerTags ?? source?.BunkerTags ?? source?.tags ?? source?.Tags ?? []),
		...(source?.facilities ?? source?.Facilities ?? source?.rooms ?? source?.Rooms ?? []),
		...(source?.problems ?? source?.Problems ?? []),
		...Object.values(localized).flatMap(entry => entry && typeof entry === 'object' ? Object.values(entry) : [entry])
	];
	return values.flat(Infinity).filter(value => typeof value === 'string')
		.join(' ').toLocaleLowerCase().replace(/[_-]+/g, ' ');
}

function inferBunkerArchetype(source, text) {
	const explicit = validBunkerThemeValue('archetype', readBunkerThemeValue(source, 'archetype'), '');
	if (explicit) return explicit;
	return bunkerArchetypeRules.find(([, pattern]) => pattern.test(text))?.[0] || bunkerThemeFallback.archetype;
}

function inferBunkerCondition(source, text) {
	const explicit = validBunkerThemeValue('condition', readBunkerThemeValue(source, 'condition'), '');
	if (explicit) return explicit;
	const condition = normalizeBunkerThemeToken(source?.condition ?? source?.Condition);
	const aliases = {
		stable: 'fair', worn: 'fair', satisfactory: 'fair', задовільний: 'fair',
		стабільний: 'fair', удовлетворительный: 'fair', стабильный: 'fair',
		damaged: 'damaged', пошкоджений: 'damaged', поврежденный: 'damaged',
		ruined: 'critical', зруйнований: 'critical', разрушенный: 'critical'
	};
	if (bunkerThemeAllowedValues.condition.has(condition)) return condition;
	if (aliases[condition]) return aliases[condition];
	if (/(flood|затоп|підтоп)\w*/u.test(text)) return 'flooded';
	if (/(burn|fire.?damage|обгор|пожеж|пожар)\w*/u.test(text)) return 'burned';
	if (/(contaminat|заражен|забруднен|загрязнен)\w*/u.test(text)) return 'contaminated';
	return bunkerThemeFallback.condition;
}

function inferModifier(key, source, text, archetype, condition) {
	const defaults = bunkerArchetypeDefaults[archetype] || bunkerArchetypeDefaults.civilian;
	const defaultIndex = { material: 0, cleanliness: 1, technology: 2, atmosphere: 3 }[key];
	const explicit = validBunkerThemeValue(key, readBunkerThemeValue(source, key), '');
	if (explicit) return explicit;

	if (key === 'material') {
		const rules = [
			['rusted-steel', /(rusted|rust|ірж|ржав)\w*/u], ['concrete', /(concrete|бетон)\w*/u],
			['ceramic', /(ceramic|tile|керамі|плитк)\w*/u], ['glass', /(glass|скл|стекл)\w*/u],
			['wood', /(wood|timber|дерев)\w*/u], ['stone', /(stone|rock|камін|камен)\w*/u],
			['plastic', /(plastic|пластик)\w*/u], ['composite', /(composite|композит)\w*/u],
			['painted-metal', /(painted.?metal|фарбован.{0,5}метал|крашен.{0,5}металл)\w*/u],
			['steel', /(steel|metal|сталь|метал)\w*/u]
		];
		return rules.find(([, pattern]) => pattern.test(text))?.[0] || defaults[defaultIndex];
	}
	if (key === 'cleanliness') {
		if (condition === 'contaminated' || /(contaminat|заражен|забруднен|загрязнен)\w*/u.test(text)) return 'contaminated';
		if (/(filthy|sewer|waste|нечистот|сміт|грязн|мусор)\w*/u.test(text)) return 'filthy';
		if (condition === 'abandoned' || archetype === 'abandoned') return 'filthy';
		if (['poor', 'critical', 'abandoned', 'burned', 'flooded', 'damaged'].includes(condition)) return 'dirty';
		if (/(sterile|стериль)\w*/u.test(text)) return 'sterile';
		return defaults[defaultIndex];
	}
	if (key === 'technology') {
		if (/(experimental|prototype|експеримент|эксперимент|прототип)\w*/u.test(text)) return 'experimental';
		if (/(advanced|high.?tech|автоматиз|передов|високотехнолог|высокотехнолог)\w*/u.test(text)) return 'advanced';
		if (/(primitive|manual|примітив|ручн|примитив)\w*/u.test(text)) return 'primitive';
		return defaults[defaultIndex];
	}
	if (condition === 'flooded') return 'damp';
	if (condition === 'contaminated') return 'toxic';
	if (['critical', 'burned'].includes(condition)) return 'emergency';
	return defaults[defaultIndex];
}

function bunkerThemeStableHash(value) {
	let hash = 2166136261;
	for (const character of String(value || 'bunker-fallback')) {
		hash ^= character.codePointAt(0);
		hash = Math.imul(hash, 16777619);
	}
	return hash >>> 0;
}

function resolveBunkerVisualTheme(bunker) {
	const source = bunker && typeof bunker === 'object' ? bunker : {};
	const text = bunkerThemeText(source);
	const archetype = inferBunkerArchetype(source, text);
	const condition = inferBunkerCondition(source, text);
	const defaults = bunkerArchetypeDefaults[archetype] || bunkerArchetypeDefaults.civilian;
	const id = String(source.id ?? source.Id ?? source.name ?? source.Name ?? 'bunker-fallback');
	const hash = bunkerThemeStableHash(id);
	return Object.freeze({
		archetype,
		condition,
		material: inferModifier('material', source, text, archetype, condition),
		cleanliness: inferModifier('cleanliness', source, text, archetype, condition),
		technology: inferModifier('technology', source, text, archetype, condition),
		atmosphere: inferModifier('atmosphere', source, text, archetype, condition),
		accent: normalizeBunkerThemeToken(readBunkerThemeValue(source, 'accent')) || defaults[4],
		variation: hash % 4,
		textureVariant: (hash >>> 3) % 3,
		accentShift: (hash % 13) - 6,
		damageBias: (hash >>> 7) % 4
	});
}
