// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function normalizeCharacteristicKey(key) {
	return key;
}

function cleanTooltipText(text) {
	if (!text) return '';
	let cleaned = String(text);
	const technicalSentencePattern = /(?:^|[.\n\r]\s*)(?:[^.\n\r]*(?:связано\s+с|related\s+to|тяжкість|тяжесть|severity|влияние\s+в\s+бункере|вплив\s+у\s+бункері|bunker\s+impact)[^.\n\r]*)(?=\.|\n|\r|$)/giu;
	cleaned = cleaned.replace(technicalSentencePattern, ' ');
	const labelPatterns = [
		/(?:^|[\s.])ефект\s+у\s+грі\s*:/giu,
		/(?:^|[\s.])ефекти\s+у\s+грі\s*:/giu,
		/(?:^|[\s.])ефект\s+в\s+игре\s*:/giu,
		/(?:^|[\s.])эффект\s+в\s+игре\s*:/giu,
		/(?:^|[\s.])game\s+effect\s*:/giu,
		/(?:^|[\s.])effect\s+in\s+game\s*:/giu,
		/(?:^|[\s.])bunker\s+effect\s*:/giu,
		/(?:^|[\s.])bunker\s+impact\s*:/giu,
		/(?:^|[\s.])ефект\s+у\s+бункері\s*:/giu,
		/(?:^|[\s.])ефекти\s+у\s+бункері\s*:/giu,
		/(?:^|[\s.])ефект\s+в\s+бункере\s*:/giu,
		/(?:^|[\s.])эффект\s+в\s+бункере\s*:/giu,
		/(?:^|[\s.])вплив\s+у\s+бункері\s*:/giu,
		/(?:^|[\s.])влияние\s+в\s+бункере\s*:/giu,
		/(?:^|[\s.])тип\s*:\s*(?:слабка|середня|сильна|дорослий контент)\b/giu,
		/(?:^|[\s.])тип\s*:\s*(?:слабая|средняя|сильная|взрослый контент)\b/giu,
		/(?:^|[\s.])type\s*:\s*(?:weak|medium|strong|adult content)\b/giu,
		/(?:^|[\s.])категорія\s*:/giu,
		/(?:^|[\s.])категория\s*:/giu,
		/(?:^|[\s.])category\s*:/giu,
		/(?:^|[\s.])source\s*:/giu
	];
	labelPatterns.forEach(pattern => {
		cleaned = cleaned.replace(pattern, match => match.startsWith('.') ? '. ' : ' ');
	});
	cleaned = cleaned
		.replace(/\b(?:тяжкість|тяжесть|severity)\s*:\s*\d+\s*\/\s*10\b/giu, '')
		.replace(/\b(?:weak|medium|strong|adult content|слабка|середня|сильна|дорослий контент|слабая|средняя|сильная|взрослый контент)\b/giu, '')
		.replace(/\s*\((?:міфологія|mythology|adult\s*content|combat|weird|feature|корисна|серйозна|мемна|еротична|креативна|абсурдна|неіснуюча)\)\s*/giu, ' ');
	return cleaned
		.split('.')
		.map(part => part.trim())
		.filter(Boolean)
		.join('. ')
		.replace(/\s+/g, ' ')
		.trim()
		.replace(/([^.!?])$/, '$1.');
}

function cleanProfessionName(value) {
	return String(value || '')
		.replace(/\s*\(\s*\+[^)]*?\s*\)\s*$/u, '')
		.trim();
}

function getProfessionDisplayName(profession) {
	const rawName = getLocalizedValue(profession, 'profession') ||
		getLocalizedValue(profession, 'name') ||
		profession?.name ||
		profession?.Name ||
		'Безробітний';
	const professionName = cleanProfessionName(rawName) || 'Безробітний';
	const professionItem = profession?.professionItem || profession?.ProfessionItem || null;
	const itemName = professionItem
		? (getLocalizedValue(professionItem, 'item') || getLocalizedValue(professionItem, 'name') || professionItem.name || professionItem.Name || '')
		: '';
	return itemName ? `${professionName} + ${itemName}` : professionName;
}

function getSeverityCode(source) {
	const stableCode = (source?.severityCode ?? source?.SeverityCode ?? '').toString();
	const stableMap = {
		Mild: 'mild',
		Moderate: 'moderate',
		Severe: 'severe',
		VerySevere: 'verySevere',
		Critical: 'critical',
		light: 'light',
		medium: 'medium',
		hard: 'hard',
		veryHard: 'veryHard',
		critical: 'critical'
	};
	if (stableMap[stableCode]) return stableMap[stableCode];

	const raw = (source?.severityLevel ?? source?.SeverityLevel ?? '').toString().toLowerCase();
	if (raw.includes('дуже') || raw.includes('очень') || raw.includes('very')) return 'verySevere';
	if (raw.includes('крит') || raw.includes('critical')) return 'critical';
	if (raw.includes('важ') || raw.includes('тяж') || raw.includes('severe') || raw.includes('critical')) return 'severe';
	if (raw.includes('серед') || raw.includes('сред') || raw.includes('moderate')) return 'moderate';
	if (raw.includes('лег') || raw.includes('лёг') || raw.includes('mild')) return 'mild';

	const numeric = Number(source?.baseSeverity ?? source?.BaseSeverity ?? source?.severity ?? source?.Severity ?? source?.тяжкість);
	if (!Number.isFinite(numeric)) return '';
	if (numeric >= 9) return 'verySevere';
	if (numeric >= 7) return 'severe';
	if (numeric >= 4) return 'moderate';
	if (numeric >= 1) return 'mild';
	return '';
}

function getSeverityLabel(source) {
	const code = getSeverityCode(source);
	if (!code) return '';
	const labels = {
		uk: { light: 'Легка форма', medium: 'Середня форма', hard: 'Важка форма', veryHard: 'Дуже важка форма', critical: 'Критична форма', mild: 'Легка форма', moderate: 'Середня форма', severe: 'Важка форма' },
		en: { light: 'Mild', medium: 'Moderate', hard: 'Severe', veryHard: 'Very severe', critical: 'Critical', mild: 'Mild', moderate: 'Moderate', severe: 'Severe' },
		ru: { light: 'Лёгкая форма', medium: 'Средняя форма', hard: 'Тяжёлая форма', veryHard: 'Очень тяжёлая форма', critical: 'Критическая форма', mild: 'Лёгкая форма', moderate: 'Средняя форма', severe: 'Тяжёлая форма' }
	};
	return labels[getCurrentLanguage()]?.[code] || '';
}

function getConditionSeverityLabel(condition, lang = getCurrentLanguage()) {
	if (!condition) return "";
	const code = condition.severityCode || condition.SeverityCode;
	if (!code || code === "None") return "";

	const labels = {
		uk: {
			light: "легка форма",
			medium: "середня форма",
			hard: "важка форма",
			veryHard: "дуже важка форма",
			critical: "критична форма",
			Mild: "легка форма",
			Moderate: "середня форма",
			Severe: "важка форма",
			VerySevere: "дуже важка форма",
			Critical: "критична форма"
		},
		ru: {
			light: "лёгкая форма",
			medium: "средняя форма",
			hard: "тяжёлая форма",
			veryHard: "очень тяжёлая форма",
			critical: "критическая форма",
			Mild: "лёгкая форма",
			Moderate: "средняя форма",
			Severe: "тяжёлая форма",
			VerySevere: "очень тяжёлая форма",
			Critical: "критическая форма"
		},
		en: {
			light: "mild",
			medium: "moderate",
			hard: "severe",
			veryHard: "very severe",
			critical: "critical",
			Mild: "mild",
			Moderate: "moderate",
			Severe: "severe",
			VerySevere: "very severe",
			Critical: "critical"
		}
	};

	return labels[lang]?.[code] || labels.uk?.[code] || "";
}

function conditionShouldShowSeverity(condition) {
	if (!condition) return false;

	const allowsSeverity =
		condition.allowsSeverity ??
		condition.AllowsSeverity;

	if (allowsSeverity === false) return false;

	const name = [
		condition.baseName,
		condition.BaseName,
		condition.name,
		condition.Name,
		getLocalizedValue(condition, "назва", "uk"),
		getLocalizedValue(condition, "назва", "ru"),
		getLocalizedValue(condition, "назва", "en"),
		getLocalizedValue(condition, "name", "uk"),
		getLocalizedValue(condition, "name", "ru"),
		getLocalizedValue(condition, "name", "en")
	].filter(Boolean).join(" ").toLowerCase();

	const noSeverityMarkers = [
		"відсутність",
		"отсутствие",
		"missing",
		"ампут",
		"amput",
		"протез",
		"prosthesis",
		"скляне око",
		"glass eye",
		"слуховий апарат",
		"hearing aid",
		"сліпота",
		"слепота",
		"слеп",
		"blindness",
		"глухота",
		"глух",
		"deafness",
		"параліч",
		"паралич",
		"paralysis"
	];

	return !noSeverityMarkers.some(marker => name.includes(marker));
}

function getConditionDisplayName(condition, lang = getCurrentLanguage()) {
	if (!condition) return "";

	const baseName =
		getLocalizedValue(condition, "назва", lang) ||
		getLocalizedValue(condition, "name", lang) ||
		condition.baseName ||
		condition.BaseName ||
		condition.name ||
		condition.Name ||
		"";

	const shouldShowSeverity = conditionShouldShowSeverity(condition);

	const severityLabel = shouldShowSeverity
		? getConditionSeverityLabel(condition, lang)
		: "";

	if (!severityLabel) return baseName;
	return `${baseName} (${severityLabel})`;
}

function shouldShowSeverity(source, kind) {
	if (!source) return false;
	if (kind === 'fact') return false;
	const explicitAllows = source.allowsSeverity ?? source.AllowsSeverity;
	if (explicitAllows === false) return false;

	const text = [
		getLocalizedByFields(source, ['назва', 'name'], ''),
		getLocalizedByFields(source, ['категорія', 'category'], ''),
		getLocalizedArray(source, 'теги').join(' '),
		source.name, source.Name, source.baseName, source.BaseName, source.category, source.Category
	].filter(Boolean).join(' ').toLowerCase();

	const noSeverityPattern = /(без\s+(ног|рук|ока)|немає\s+ока|відсутність\s+(пальц|ока)|ампутац|параліч|сліп|глух|missing\s+(leg|arm|eye|fingers)|amputation|paralysis|blind|deaf|без\s+(ноги|руки)|нет\s+глаза|отсутствие\s+пальц|слеп|глух)/iu;
	if (noSeverityPattern.test(text) || !conditionShouldShowSeverity(source)) return false;
	if (explicitAllows === true) return !!getSeverityCode(source);

	const gradablePattern = /(хроніч|хронич|chronic|тривож|тревож|anxiety|синдром|syndrome|розлад|расстрой|disorder|депрес|depress|астма|asthma|артрит|arthritis|біль|боль|pain|алерг|аллерг|allerg|діабет|диабет|diabet)/iu;
	return gradablePattern.test(text) && !!getSeverityCode(source);
}

function buildLocalizedTooltip(source, kind) {
	if (!source) return '';
	if (kind === 'physicalHealth') {
		return buildPhysicalHealthTooltip(source);
	}
	if (kind === 'mentalHealth') {
		return buildHealthConditionTooltip(source);
	}
	const isHealth = kind === 'physicalHealth' || kind === 'mentalHealth';
	const name = kind === 'fact'
		? (getLocalizedValue(source, 'fact') || getLocalizedValue(source, 'name') || source.name || source.Name || '')
		: isHealth
			? (getLocalizedValue(source, "назва") || getLocalizedValue(source, "name") || source.baseName || source.BaseName || source.name || source.Name || '')
			: getLocalizedByFields(source, ['назва', 'name'], source.name || source.Name || source.baseName || source.BaseName || '');
	const description = kind === 'fact'
		? getLocalizedValue(source, 'description')
		: getLocalizedByFields(source, ['опис', 'description'], '');
	const effect = getLocalizedByFields(source, ['ефект_у_грі', 'gameEffect', 'bunkerEffect'], source.gameEffect || source.GameEffect || source.bunkerEffect || source.BunkerEffect || '');
	const healthSeverity = isHealth && conditionShouldShowSeverity(source) ? getConditionSeverityLabel(source) : '';
	const prefix = healthSeverity
		? `${healthSeverity.charAt(0).toUpperCase()}${healthSeverity.slice(1)} ${String(name).toLowerCase()}`
		: shouldShowSeverity(source, kind) ? `${getSeverityLabel(source)} ${String(name).toLowerCase()}` : '';
	return cleanTooltipText([prefix, description, effect].filter(Boolean).join('. '));
}

function getLocalizedHealthDescription(source, lang = getCurrentLanguage()) {
	const localization = getLocalization(source);
	const languageOrder = [lang, 'uk', ...Object.keys(localization || {})].filter((value, index, array) => value && array.indexOf(value) === index);
	const severityCode = source?.severityCode || source?.SeverityCode || getSeverityCode(source);
	const hasSeverity = conditionShouldShowSeverity(source) && severityCode && severityCode !== 'none' && severityCode !== 'None';

	if (localization) {
		if (hasSeverity) {
			for (const language of languageOrder) {
				const descriptions = localization[language]?.descriptions || localization[language]?.Descriptions;
				const value = descriptions?.[severityCode];
				if (value) return value;
			}

			for (const language of languageOrder) {
				const descriptions = localization[language]?.descriptions || localization[language]?.Descriptions;
				const value = descriptions ? Object.values(descriptions).find(Boolean) : '';
				if (value) return value;
			}
		} else {
			for (const language of languageOrder) {
				const value = localization[language]?.description || localization[language]?.Description;
				if (value) return value;
			}
		}
	}

	return source?.tooltip || source?.Tooltip || source?.description || source?.Description || '';
}

function buildHealthConditionTooltip(source) {
	return cleanTooltipText(getLocalizedHealthDescription(source));
}

function buildPhysicalHealthTooltip(source) {
	if (!source) return "";

	const name = getConditionDisplayName(source) ||
		getLocalizedValue(source, "name") ||
		source.baseName ||
		source.BaseName ||
		source.name ||
		source.Name ||
		"";
	const description = getLocalizedHealthDescription(source);
	const parts = [name, description]
		.map(value => cleanTooltipText(value))
		.filter(Boolean);

	return sentenceCase(cleanTooltipText(parts.join(". ")));
}

function parseFactValue(value) {
	if (!value) return null;
	const text = String(value);
	const parts = text.split(':');
	if (parts.length > 1) {
		return {
			type: parts[0].trim() || 'Невідомо',
			name: parts.slice(1).join(':').trim() || 'Немає факту'
		};
	}
	return { type: 'Невідомо', name: text.trim() || 'Немає факту' };
}

function normalizeFactFromPlayer(player) {
	const direct = player?.fact || player?.Fact;
	const revealedData = player?.revealedData || player?.RevealedData || {};
	const revealedFact = revealedData.Fact || revealedData.fact;
	const revealedTooltips = player?.revealedTooltips || player?.RevealedTooltips || {};
	const revealedTooltip = revealedTooltips.Fact || revealedTooltips.fact;

	let source = direct || revealedFact || {};
	if (typeof source === 'string') {
		source = parseFactValue(source) || {};
	}

	const parsedValue = parseFactValue(source.value ?? source.Value);
	const type = source.type ?? source.Type ?? '';
	const name = source.name ?? source.Name ?? parsedValue?.name ?? 'Немає факту';
	const description = source.description ?? source.Description ?? '';
	const tooltip = cleanTooltipText(source.tooltip ?? source.Tooltip ?? source.description ?? source.Description ?? source.value?.Tooltip ?? revealedTooltip ?? '');

	return { type, name, description, tooltip, _i18n: getI18n(source) };
}

function normalizeRevealedState(revealed) {
	const src = revealed || {};
	return {
		personality: !!(src.personality ?? src.Personality),
		body: !!(src.body ?? src.Body),
		profession: !!(src.profession ?? src.Profession),
		physicalHealth: !!(src.physicalHealth ?? src.PhysicalHealth),
		mentalHealth: !!(src.mentalHealth ?? src.MentalHealth),
		hobby: !!(src.hobby ?? src.Hobby),
		characterTrait: !!(src.characterTrait ?? src.CharacterTrait),
		phobia: !!(src.phobia ?? src.Phobia),
		inventory: !!(src.inventory ?? src.Inventory),
		property: !!(src.property ?? src.Property),
		fact: !!(src.fact ?? src.Fact),
		specialCard: !!(src.specialCard ?? src.SpecialCard)
	};
}

function normalizeRevealedSources(sources) {
	const src = sources || {};
	const normalized = {};
	Object.keys(src).forEach(key => {
		normalized[normalizeCharacteristicKey(toCamelCase(key))] = src[key];
	});
	return normalized;
}

function normalizeRevealedValues(revealedValues) {
	const revealedData = {};
	const revealedTooltips = {};
	const rv = revealedValues || {};
	Object.keys(rv).forEach(key => {
		const rd = rv[key] || {};
		const camelKey = normalizeCharacteristicKey(toCamelCase(key));
		revealedData[camelKey] = rd.value || rd.Value || t('revealed');

		const tooltip = rd.tooltip || rd.Tooltip;
		if (tooltip) {
			revealedTooltips[camelKey] = cleanTooltipText(tooltip);
		}
	});
	return { revealedData, revealedTooltips };
}

function getRevealedSource(player, charKey) {
	const fromRevealed = player?.revealedSources?.[charKey];
	if (fromRevealed) return fromRevealed;
	if (player?.connectionId === myConnectionId && myPlayerData?.[charKey]) return myPlayerData[charKey];
	if (charKey === 'specialCard') return player?.specialCard || myPlayerData?.specialCard;
	if (charKey === 'fact') return player?.fact || myPlayerData?.fact;
	return null;
}

function getLocalizedRevealedValue(player, charKey) {
	if (charKey === 'personality' && player?.personality) {
		return `${t('age')}: ${player.personality.age}, ${t('sex')}: ${player.personality.sex}, ${t('orientation')}: ${player.personality.sexOrientation}`;
	}
	if (charKey === 'body' && player?.body) {
		return `${t('height')}: ${player.body.height} см, ${t('weight')}: ${player.body.weight} кг, ${t('bodyType')}: ${player.body.bodyType}`;
	}

	const source = getRevealedSource(player, charKey);
	if (charKey === 'fact') {
		return getLocalizedValue(source, 'fact') || getLocalizedValue(source, 'name') || source?.name || source?.Name || t('noFact');
	}
	if (charKey === 'inventory') {
		const items = source?.items || source?.Items || [];
		const names = items.map(item => getLocalizedValue(item, 'item') || getLocalizedValue(item, 'name') || item.name || item.Name).filter(Boolean);
		return names.length ? names.join(', ') : t('empty');
	}
	if (charKey === 'property') {
		return getPropertyPresentation(source).title;
	}
	if (charKey === 'profession') {
		const name = getProfessionDisplayName(source);
		const experience = source?.experienceYears ?? source?.ExperienceYears;
		const parts = [name || t('profession')];
		if (Number.isFinite(Number(experience)) && Number(experience) > 0) parts.push(`(${experience} ${t('years')})`);
		return parts.join(' ');
	}
	if (charKey === 'specialCard') {
		return getSpecialCardName(source);
	}

	const fieldByKey = {
		hobby: ['hobby', 'name'],
		characterTrait: ['trait', 'name'],
		phobia: ['phobia', 'fear', 'name']
	};
	if (source && (charKey === 'physicalHealth' || charKey === 'mentalHealth')) {
		const localized = getConditionDisplayName(source);
		if (localized) return localized;
	}
	if (source && fieldByKey[charKey]) {
		const localized = getLocalizedByFields(source, fieldByKey[charKey], source.name || source.Name || source.baseName || source.BaseName || '');
		if (localized) return localized;
	}

	return player?.revealedData?.[charKey] || t('revealed');
}

function getLocalizedRevealedTooltip(player, charKey) {
	const source = getRevealedSource(player, charKey);
	if (charKey === 'specialCard') return getSpecialCardDescription(source);
	const kind = charKey === 'physicalHealth' ? 'physicalHealth' : charKey === 'mentalHealth' ? 'mentalHealth' : charKey;
	return buildLocalizedTooltip(source, kind) || player?.revealedTooltips?.[charKey] || '';
}

function hasGeneratedCharacterData(player) {
	if (!player) return false;

	const getObj = (camel, pascal) => player[camel] || player[pascal] || {};
	const getValue = (obj, camel, pascal) => obj?.[camel] ?? obj?.[pascal];
	const hasName = obj => !!String(getValue(obj, 'name', 'Name') || '').trim();

	const personality = getObj('personality', 'Personality');
	const body = getObj('body', 'Body');
	const inventory = getObj('inventory', 'Inventory');
	const inventoryItems = getValue(inventory, 'items', 'Items') || [];

	return Number(getValue(personality, 'age', 'Age')) > 0
		&& !!String(getValue(personality, 'sex', 'Sex') || '').trim()
		&& !!String(getValue(personality, 'sexOrientation', 'SexOrientation') || '').trim()
		&& Number(getValue(body, 'height', 'Height')) > 0
		&& Number(getValue(body, 'weight', 'Weight')) > 0
		&& !!String(getValue(body, 'bodyType', 'BodyType') || '').trim()
		&& hasName(getObj('profession', 'Profession'))
		&& hasName(getObj('physicalHealth', 'PhysicalHealth'))
		&& hasName(getObj('mentalHealth', 'MentalHealth'))
		&& hasName(getObj('hobby', 'Hobby'))
		&& hasName(getObj('characterTrait', 'CharacterTrait'))
		&& hasName(getObj('phobia', 'Phobia'))
		&& hasName(getObj('fact', 'Fact'))
		&& Array.isArray(inventoryItems)
		&& inventoryItems.length > 0;
}

function normalizePlayer(player) {
	if (!player) return null;


	// Helper to get value from either camelCase or PascalCase
	function get(obj, camel, pascal) {
		return obj?.[camel] ?? obj?.[pascal] ?? null;
	}

	// Helper to normalize a simple object with name/tooltip
	function normalizeSimple(obj, camelKey, pascalKey) {
		const source = obj?.[camelKey] || obj?.[pascalKey];
		if (!source) return { name: null, tooltip: null };
		return {
			name: source.name ?? source.Name ?? null,
			tooltip: cleanTooltipText(source.tooltip ?? source.Tooltip ?? null),
			baseName: source.baseName ?? source.BaseName ?? null,
			category: source.category ?? source.Category ?? null,
			description: source.description ?? source.Description ?? null,
			gameEffect: source.gameEffect ?? source.GameEffect ?? null,
			bunkerEffect: source.bunkerEffect ?? source.BunkerEffect ?? null,
			baseSeverity: source.baseSeverity ?? source.BaseSeverity ?? source.severity ?? source.Severity ?? null,
			severityLevel: source.severityLevel ?? source.SeverityLevel ?? null,
			severityCode: source.severityCode ?? source.SeverityCode ?? null,
			allowsSeverity: source.allowsSeverity ?? source.AllowsSeverity ?? null,
			tags: source.tags ?? source.Tags ?? [],
			experienceYears: source.experienceYears ?? source.ExperienceYears ?? source.experience ?? source.Experience ?? source.years ?? source.Years ?? null,
			duration: source.duration ?? source.Duration ?? null,
			item: source.item ?? source.Item ?? null,
			bonus: source.bonus ?? source.Bonus ?? null,
			relatedItem: source.relatedItem ?? source.RelatedItem ?? source.item ?? source.Item ?? source.additionalItem ?? source.AdditionalItem ?? source.equipment ?? source.Equipment ?? source.hobbyItem ?? source.HobbyItem ?? source.tool ?? source.Tool ?? source.set ?? source.Set ?? source.selectedItem ?? source.SelectedItem ?? null,
			_i18n: getI18n(source),
			localization: getLocalization(source)
		};
	}

	const normalized = {
		name: player.name ?? player.Name ?? 'Гравець',
		connectionId: player.connectionId ?? player.ConnectionId ?? null,
		stablePlayerId: player.stablePlayerId ?? player.StablePlayerId ?? "",
		isHost: player.isHost ?? player.IsHost ?? false,
		isDeveloper: !!(player.isDeveloper ?? player.IsDeveloper),
		developerParticipationMode: player.developerParticipationMode ?? player.DeveloperParticipationMode ?? null,
		isEliminated: player.isEliminated ?? player.IsEliminated ?? false,
		isSpectatorGm: player.isSpectatorGm ?? player.IsSpectatorGm ?? false,
		publicRole: player.publicRole ?? player.PublicRole ?? 'player',
		eliminatedAtRound: player.eliminatedAtRound ?? player.EliminatedAtRound ?? null,
		eliminatedByVote: !!(player.eliminatedByVote ?? player.EliminatedByVote),
		canRevealAllAfterElimination: !!(player.canRevealAllAfterElimination ?? player.CanRevealAllAfterElimination),
		hasRevealedAllAfterElimination: !!(player.hasRevealedAllAfterElimination ?? player.HasRevealedAllAfterElimination),
		eliminationVoteImmunity: normalizeEliminationVoteImmunity(player.eliminationVoteImmunity || player.EliminationVoteImmunity),
		seatNumber: player.seatNumber ?? player.SeatNumber ?? 0,
		_hasCharacter: hasGeneratedCharacterData(player),
		revealed: normalizeRevealedState(player.revealed ?? player.Revealed ?? {}),
		specialCards: normalizeSpecialCards(
			player.specialCards || player.SpecialCards,
			player.specialCard || player.SpecialCard
		),
		specialCard: normalizeSpecialCard(player.specialCard || player.SpecialCard),
		eventSpecialCards: player.eventSpecialCards || player.EventSpecialCards || [],
		privateInspectedFacts: player.privateInspectedFacts || player.PrivateInspectedFacts || [],

		// Personality
		personality: {
			age: get(player.personality || player.Personality, 'age', 'Age') ?? 25,
			sex: get(player.personality || player.Personality, 'sex', 'Sex') ?? 'Невизначено',
			sexOrientation: get(player.personality || player.Personality, 'sexOrientation', 'SexOrientation') ?? 'Невизначено',
			isChildfree: get(player.personality || player.Personality, 'isChildfree', 'IsChildfree') ?? false
		},

		// Body
		body: {
			height: get(player.body || player.Body, 'height', 'Height') ?? 170,
			weight: get(player.body || player.Body, 'weight', 'Weight') ?? 70,
			bodyType: get(player.body || player.Body, 'bodyType', 'BodyType') ?? 'Звичайний'
		},

		// Profession
		profession: (() => {
			const src = player.profession || player.Profession || {};

			const professionItem = normalizeItemData(
				player.professionItem
				|| player.ProfessionItem
				|| src.professionItem
				|| src.ProfessionItem
			);

			return {
				name: cleanProfessionName(
					src.name
					?? src.Name
					?? 'Безробітний'
				),

				tooltip: cleanTooltipText(
					src.tooltip
					?? src.Tooltip
					?? null
				),

				professionalLevel:
					src.professionalLevel
					?? src.ProfessionalLevel
					?? '',

				// Тимчасово залишаємо для сумісності зі старими даними.
				experienceYears:
					src.experienceYears
					?? src.ExperienceYears
					?? 0,

				selectedItem:
					src.selectedItem
					?? src.SelectedItem
					?? null,

				selectedItemIndex:
					src.selectedItemIndex
					?? src.SelectedItemIndex
					?? null,

				capabilityTags:
					src.capabilityTags
					?? src.CapabilityTags
					?? src.tags
					?? src.Tags
					?? [],

				professionItem,
				_i18n: getI18n(src)
			};
		})(),
		professionItem: normalizeItemData(player.professionItem || player.ProfessionItem),

		// Health
		physicalHealth: normalizeSimple(player, 'physicalHealth', 'PhysicalHealth'),
		additionalPhysicalConditions: normalizeAdditionalPhysicalConditions(
			player.additionalPhysicalConditions || player.AdditionalPhysicalConditions ||
			player.additionalConditionEffects || player.AdditionalConditionEffects || []
		),
		mentalHealth: normalizeSimple(player, 'mentalHealth', 'MentalHealth'),

		// Other characteristics
		hobby: normalizeSimple(player, 'hobby', 'Hobby'),
		characterTrait: normalizeSimple(player, 'characterTrait', 'CharacterTrait'),
		phobia: normalizeSimple(player, 'phobia', 'Phobia'),
		fact: normalizeFactFromPlayer(player),

		// Inventory
		inventory: normalizeInventoryData(player.inventory || player.Inventory),
		property: normalizePropertyData(player.property || player.Property),
	};

	normalized.additionalConditionEffects = normalized.additionalPhysicalConditions;
	if (normalized.specialCards.length > 0) {
		normalized.specialCard = normalized.specialCards[0];
	}

	return normalized;
}

function normalizeAdditionalPhysicalConditions(conditions) {
	return (conditions || []).map(effect => ({
		id: effect.id || effect.Id || "",
		conditionId: effect.conditionId || effect.ConditionId || "",
		baseName: effect.baseName || effect.BaseName || "",
		name: effect.name || effect.Name || "",
		severityCode: effect.severityCode || effect.SeverityCode || "",
		severityLevel: effect.severityLevel || effect.SeverityLevel || "",
		sourceThreatId: effect.sourceThreatId || effect.SourceThreatId || "",
		appliedAtRound: effect.appliedAtRound ?? effect.AppliedAtRound ?? null,
		description: effect.description || effect.Description || "",
		localization: getLocalization(effect)
	})).filter(effect => effect.name && effect.baseName);
}

function normalizeEliminationVoteImmunity(source) {
	const src = source || {};
	return {
		isActive: !!(src.isActive ?? src.IsActive),
		sourceThreatId: src.sourceThreatId || src.SourceThreatId || "",
		grantedAtRound: src.grantedAtRound ?? src.GrantedAtRound ?? null,
		remainingUses: src.remainingUses ?? src.RemainingUses ?? 0
	};
}

async function reveal(characteristicName) {
	if (pendingCharacteristicReveals.has(characteristicName)) return;
	if (!canRevealThisRound()) {
		const reason = getRevealBlockedReason();
		if (reason) addEventMessage(`Помилка: ${reason}`);
		return;
	}

	pendingCharacteristicReveals.add(characteristicName);
	renderMyPlayerCards(myPlayerData);
	try {
		await connection.invoke("RevealCharacteristic", characteristicName);
	} catch (err) {
		pendingCharacteristicReveals.delete(characteristicName);
		renderMyPlayerCards(myPlayerData);
		console.error("RevealCharacteristic error:", err);
		addEventMessage(`Помилка: ${localizeServerMessage(err?.message || '')}`);
	}
}

function formatAdditionalPhysicalCondition(effect) {
	if (!effect?.name || !effect?.baseName) return '';
	return getConditionDisplayName({
		...effect,
		allowsSeverity: true,
		AllowsSeverity: true,
		localization: effect.localization,
		Localization: effect.localization
	});
}

function buildSharedHealthTooltip(source, options = {}) {
	if (!source) return '';
	const lang = options.lang || getCurrentLanguage();
	const localization = getLocalization(source) || {};
	const localized = localization[lang] || localization.uk || null;
	const name = cleanTooltipText(localized?.name || localized?.Name || getLocalizedValue(source, 'name') || source.baseName || source.BaseName || source.name || source.Name || '');
	const severity = cleanTooltipText(getConditionSeverityLabel(source, lang));
	const severityCode = source.severityCode || source.SeverityCode || '';
	const descriptions = localized?.descriptions || localized?.Descriptions || {};
	const localizedDescription = descriptions[severityCode] || localized?.description || localized?.Description || '';
	const hasRequestedLocalization = Boolean(localization && Object.prototype.hasOwnProperty.call(localization, lang));
	const fallbackDescription = hasRequestedLocalization
		? ''
		: getLocalizedHealthDescription(source, lang) || source.description || source.Description || source.tooltip || source.Tooltip || '';
	const description = cleanTooltipText(localizedDescription || fallbackDescription);
	const effect = cleanTooltipText(getLocalizedByFields(source, ['gameEffect', 'bunkerEffect', 'ефект_у_грі'], source.gameEffect || source.GameEffect || source.bunkerEffect || source.BunkerEffect || ''));
	const validName = /^(невідомо|неизвестно|unknown)$/i.test(name) ? '' : name;
	const explanatory = [description, effect].filter(value => value && value.toLocaleLowerCase() !== validName.toLocaleLowerCase());
	if (options.requireExplanation && explanatory.length === 0) return '';
	if (!validName && !severity && explanatory.length === 0) return '';

	return [
		validName ? `<span class="tooltip-medical-name">${escapeHtml(validName)}</span>` : '',
		severity ? `<span class="tooltip-medical-severity">${escapeHtml(severity.charAt(0).toUpperCase() + severity.slice(1))}</span>` : '',
		...explanatory.map(value => `<span class="tooltip-medical-description">${escapeHtml(value)}</span>`)
	].filter(Boolean).join('');
}

function buildAdditionalPhysicalConditionTooltip(effect, lang = getCurrentLanguage()) {
	return buildSharedHealthTooltip(effect, { lang, requireExplanation: false });
}

function renderAdditionalPhysicalCondition(effect, prefix = '') {
	const label = formatAdditionalPhysicalCondition(effect);
	if (!label) return '';
	const tooltip = buildAdditionalPhysicalConditionTooltip(effect);
	if (!tooltip) return `<span class="additional-condition-item">${escapeHtml(prefix + label)}</span>`;
	return `<span class="characteristic-with-tooltip additional-condition-item">
            <span>${escapeHtml(prefix + label)}</span>
            <button type="button" class="tooltip-trigger physical" aria-label="${escapeHtml(label)}" aria-expanded="false">!</button>
            <span class="tooltip-content">${tooltip}</span>
        </span>`;
}

function renderAdditionalPhysicalConditionsForOverview(player) {
	const conditions = (player?.additionalPhysicalConditions || player?.additionalConditionEffects || [])
		.map(effect => renderAdditionalPhysicalCondition(effect, '+ '))
		.filter(Boolean);
	if (!conditions.length) return '';

	return `<div class="public-additional-conditions">${conditions.join('')}</div>`;
}

function normalizeProfessionIconTags(profession) {
	const raw = profession?.capabilityTags || profession?.CapabilityTags || profession?.tags || profession?.Tags || [];
	return (Array.isArray(raw) ? raw : [raw]).map(tag => String(tag).trim().toLowerCase().replace(/[\s-]+/g, '_')).filter(Boolean);
}

function resolveProfessionIconKey(profession) {
	const tags = normalizeProfessionIconTags(profession);
	const priority = ['violin', 'string_instrument', 'guitar', 'chef', 'waiter', 'restaurant', 'food_service', 'hospitality', 'service', 'music', 'medical', 'medicine', 'healthcare', 'engineering', 'engineer', 'military', 'agriculture', 'transport', 'science', 'technology', 'education', 'construction', 'law', 'food'];
	const match = priority.find(tag => tags.includes(tag));
	return professionIconRegistry[match] || professionIconRegistry.generic;
}

function renderCharacteristicIcon(iconKey) {
	const body = characteristicIconSvgRegistry[iconKey] || characteristicIconSvgRegistry.briefcase;
	return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function formatHobbyExperience(value, lang = getCurrentLanguage()) {
	if (value === null || value === undefined) return '';
	const text = String(value).trim();
	if (!text) return '';
	const numericText = text.replace(',', '.');
	const numericValue = typeof value === 'number' || /^\d+(?:[.,]\d+)?$/.test(text) ? Number(numericText) : Number.NaN;
	if (!Number.isFinite(numericValue)) return text;
	if (numericValue <= 0) return '';

	const language = ['uk', 'ru', 'en'].includes(lang) ? lang : 'uk';
	const locale = language === 'uk' ? 'uk-UA' : language === 'ru' ? 'ru-RU' : 'en-US';
	const plural = new Intl.PluralRules(locale).select(numericValue);
	const labels = {
		uk: { one: 'рік', few: 'роки', many: 'років', other: 'року' },
		ru: { one: 'год', few: 'года', many: 'лет', other: 'года' },
		en: { one: 'year', few: 'years', many: 'years', other: 'years' }
	};
	const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(numericValue);
	return `${number} ${labels[language][plural] || labels[language].other}`;
}

function formatHobbyRelatedItem(value) {
	if (value === null || value === undefined) return '';
	if (typeof value !== 'object') return String(value).trim();
	return cleanTooltipText(getLocalizedValue(value, 'item') || getLocalizedValue(value, 'name') || value.item || value.Item || value.name || value.Name || '');
}

function nonEmptyCardDetail(label, value) {
	const normalizedValue = value == null
		? ''
		: String(value).trim();

	if (!normalizedValue) {
		return null;
	}

	return {
		label: label || '',
		value: normalizedValue
	};
}

function buildHobbyCardDetails(hobby) {
	const experienceRaw = hobby?.experienceYears ?? hobby?.experience ?? hobby?.years ?? hobby?.duration;
	const localizedItem = getLocalizedValue(hobby, 'item') || getLocalizedValue(hobby, 'relatedItem') || getLocalizedValue(hobby, 'additionalItem') || getLocalizedValue(hobby, 'equipment');
	const itemRaw = localizedItem || hobby?.relatedItem || hobby?.item || hobby?.additionalItem || hobby?.equipment || '';
	const experience = formatHobbyExperience(experienceRaw);
	const item = formatHobbyRelatedItem(itemRaw);
	return {
		experience,
		item,
		details: [
			nonEmptyCardDetail(t('cardExperience'), experience),
			nonEmptyCardDetail(t('cardAdditionalItem'), item)
		].filter(Boolean)
	};
}

function resolveHobbyCardTooltip(hobby, item = '') {
	const explanation = cleanTooltipText(getLocalizedByFields(hobby, ['description', 'gameEffect', 'bunkerEffect', 'bonus'], hobby?.description || hobby?.gameEffect || hobby?.bunkerEffect || hobby?.bonus || ''));
	if (explanation) return explanation;
	const tooltip = cleanTooltipText(hobby?.tooltip || '');
	if (!tooltip) return '';
	const normalizedTooltip = tooltip.toLocaleLowerCase().replace(/[.!]+$/g, '').trim();
	const normalizedItem = cleanTooltipText(item).toLocaleLowerCase();
	const generatedItemOnly = /^(отримує бонусом|получает бонусом|gets as (?:a )?bonus)\s*:/i.test(normalizedTooltip)
		&& normalizedItem && normalizedTooltip.includes(normalizedItem);
	return generatedItemOnly ? '' : tooltip;
}

function normalizeVariantMetadata(source) {
	const raw = source?.tags || source?.Tags || source?.capabilityTags || source?.CapabilityTags || [];
	return (Array.isArray(raw) ? raw : [raw]).map(value => String(value).trim().toLowerCase().replace(/[\s-]+/g, '_')).filter(Boolean);
}

function normalizeCharacteristicSeverity(source) {
	const raw = [source?.severityCode, source?.SeverityCode, source?.severityLevel, source?.SeverityLevel, source?.severity, source?.Severity]
		.filter(value => value !== null && value !== undefined).join(' ').toLowerCase();
	if (!raw || /\b(none|stable|stabil|без\s*(нічого|форм)|стабіль|стабил)\b/u.test(raw)) return 'stable';
	if (/critical|критич/u.test(raw)) return 'critical';
	if (/very[_\s-]*(hard|heavy|severe)|дуже\s*важ|очень\s*(тяж|тяжел)/u.test(raw)) return 'very-heavy';
	if (/\b(hard|heavy|severe)\b|важк|тяж[её]л/u.test(raw)) return 'heavy';
	if (/\b(medium|moderate)\b|середн|средн/u.test(raw)) return 'medium';
	if (/\b(light|mild)\b|легк|л[её]гк/u.test(raw)) return 'light';
	return 'stable';
}

function resolveCharacteristicVisualVariant(model) {
	const tags = normalizeVariantMetadata(model.variantSource);
	const severity = normalizeCharacteristicSeverity(model.variantSource);
	if (tags.includes('critical')) return 'critical';
	if (severity === 'critical') return 'critical';
	if (severity === 'very-heavy') return 'severe-dark';
	if (tags.includes('severe')) return 'severe';
	if (severity === 'heavy') return 'severe';
	if (severity === 'medium') return 'warning';
	if (severity === 'light') return 'warning-soft';
	if (tags.some(tag => ['dark', 'violent', 'criminal', 'dangerous', 'disturbing', 'horror'].includes(tag))) return 'dark';
	if (tags.some(tag => ['positive', 'supportive', 'beneficial', 'healing'].includes(tag))) return 'positive';
	return 'neutral';
}

function resolveCharacteristicTooltipContent(model) {
	if (model.tooltipHtml && String(model.tooltipHtml).trim()) return { html: String(model.tooltipHtml) };
	const content = cleanTooltipText(model.tooltip || '').trim();
	if (!content) return null;
	const normalized = content.toLocaleLowerCase();
	const genericPrivacy = [t('cardPrivateTooltip'), 'це ваша приватна характеристика', 'this is your private characteristic', 'это ваша приватная характеристика']
		.map(value => String(value || '').trim().toLocaleLowerCase()).filter(Boolean);
	if (genericPrivacy.some(value => normalized === value || normalized.startsWith(value))) return null;
	const duplicates = [model.value, model.categoryLabel, ...(model.details || []).flatMap(detail => detail ? [detail.label, detail.value] : [])]
		.map(value => cleanTooltipText(value || '').trim().toLocaleLowerCase()).filter(Boolean);
	if (duplicates.includes(normalized)) return null;
	return { text: content };
}

function buildHealthCardPresentation(condition) {
	const display = getConditionDisplayName(condition) || getLocalizedValue(condition, 'name') || condition?.name || '';
	const severity = conditionShouldShowSeverity(condition) ? getConditionSeverityLabel(condition, getCurrentLanguage()) : '';
	if (!severity) return { value: display, severity: '' };
	const suffix = ` (${severity})`;
	if (display.toLocaleLowerCase().endsWith(suffix.toLocaleLowerCase())) {
		return { value: display.slice(0, -suffix.length), severity };
	}
	if (display.toLocaleLowerCase().includes(severity.toLocaleLowerCase())) return { value: display, severity: '' };
	return { value: display, severity };
}

function renderCharacteristicCard(model) {
	const details = (model.details || []).filter(Boolean).slice(0, 4);
	const tooltipId = `characteristic-tooltip-${model.type.toLowerCase()}`;
	const tooltipContent = resolveCharacteristicTooltipContent({ ...model, details });
	const visualVariant = resolveCharacteristicVisualVariant(model);
	const visualFamily = model.visualFamily || 'neutral';
	const pending = pendingCharacteristicReveals.has(model.revealAction);
	const blockedReason = model.canReveal && !model.isRevealed ? getRevealBlockedReason() : '';
	const disabled = pending || !!blockedReason;
	const detailRows = details.map(detail => `<div class="char-row vault-card-detail"><span class="char-label">${escapeHtml(detail.label)}</span><span class="char-value">${escapeHtml(detail.value)}</span></div>`).join('');
	const action = model.isRevealed
		? `<span class="status-revealed vault-card-status">${t('cardRevealed')}</span>`
		: `<button type="button" class="char-btn locked vault-card-reveal${disabled ? ' disabled' : ''}" data-characteristic="${escapeHtml(model.type)}" onclick="reveal('${model.revealAction}')" ${disabled ? 'disabled aria-disabled="true"' : ''}${blockedReason ? ` aria-label="${escapeHtml(blockedReason)}"` : ''}><span class="vault-lock-icon">${renderCharacteristicIcon('lock')}</span>${pending ? t('cardRevealPending') : t('reveal')}</button>`;
	const tooltipMarkup = tooltipContent
		? `<span class="characteristic-with-tooltip vault-card-tooltip"><button type="button" class="tooltip-trigger" aria-label="${escapeHtml(t('cardTooltipLabel'))}" aria-controls="${tooltipId}" aria-expanded="false">?</button><span id="${tooltipId}" class="tooltip-content">${tooltipContent.html || escapeHtml(tooltipContent.text)}</span></span>`
		: '';

	return `<article class="char-card player-card vault-characteristic-card variant-${visualVariant} family-${visualFamily} ${model.isRevealed ? 'card-revealed' : ''}" data-characteristic-type="${escapeHtml(model.type)}">
		<header class="vault-card-header${tooltipContent ? ' has-tooltip' : ''}"><div class="vault-card-icon">${renderCharacteristicIcon(model.iconKey)}</div><span class="char-card-title vault-card-category">${escapeHtml(model.categoryLabel)}</span>${tooltipMarkup}</header>
		<div class="vault-card-value ${model.type === 'Fact' ? 'is-long' : ''}">${escapeHtml(model.value)}</div>
		<div class="vault-card-separator"><span></span><i aria-hidden="true"></i><span></span></div>
		${detailRows ? `<div class="vault-card-details">${detailRows}</div>` : ''}
		${model.supplementalHtml || ''}
		<footer class="vault-card-footer">${action}</footer>
	</article>`;
}

function renderMyPlayerCards(player) {
	const container = document.getElementById("myPlayerCards");
	if (!container) return;
	if (!player || player._hasCharacter === false) {
		console.warn("No current player character found", {
			currentPlayerId: myConnectionId,
			currentRoomId: currentRoom?.id,
			currentRoomState: currentRoom?.state
		});
		container.innerHTML = `<p style="color: var(--color-text-muted);">${t('noData')}</p>`;
		return;
	}

	const revealed = normalizeRevealedState(player.revealed || player.Revealed || {});
	const personality = player.personality || {};
	const body = player.body || {};
	const profession = player.profession || player.Profession || {};
	const professionalLevel = String(
		profession.professionalLevel
		?? profession.ProfessionalLevel
		?? ''
	).trim();
	const physicalHealth = player.physicalHealth || {};
	const mentalHealth = player.mentalHealth || {};
	const hobby = player.hobby || {};
	const characterTrait = player.characterTrait || {};
	const phobia = player.phobia || {};
	const inventory = player.inventory || {};
	const property = player.property || {};
	const fact = normalizeFactFromPlayer(player);
	const professionItem =
		profession.professionItem
		|| profession.ProfessionItem
		|| player.professionItem
		|| player.ProfessionItem
		|| {};
	const localizedProfessionItem =
		getLocalizedValue(professionItem, 'item')
		|| getLocalizedValue(professionItem, 'name')
		|| professionItem.name
		|| professionItem.Name
		|| profession.selectedItem
		|| profession.SelectedItem
		|| '';
	const additionalConditionEffects = player.additionalPhysicalConditions || player.additionalConditionEffects || [];
	const additionalConditionsHtml = additionalConditionEffects.length ? `<div class="additional-conditions"><span class="char-label">${escapeHtml(t('additionalConditions'))}</span>${additionalConditionEffects.map(effect => renderAdditionalPhysicalCondition(effect)).filter(Boolean).join('')}</div>` : '';
	const inventorySourceItems = inventory.items || [];
	const inventoryItems = inventorySourceItems.map(item => getLocalizedValue(item, 'item') || getLocalizedValue(item, 'name') || item.name || item.Name || '').filter(Boolean);
	const inventoryTooltip = [...new Set(inventorySourceItems.map(item => getLocalizedValue(item, 'description') || item.description || item.Description || item.effect || item.Effect || '').filter(Boolean))].join('. ');
	const physicalPresentation = buildHealthCardPresentation(physicalHealth);
	const mentalPresentation = buildHealthCardPresentation(mentalHealth);
	const hobbyCardDetails = buildHobbyCardDetails(hobby);
	const propertyPresentation = getPropertyPresentation(property);
	const models = [
		{ type: 'Personality', categoryLabel: t('personality'), value: `${personality.age} ${t('years')}`, iconKey: characteristicIconRegistry.personality, details: [nonEmptyCardDetail(t('sex'), `${personality.sex || ''}${personality.isChildfree ? ` · ${t('cardChildfree')}` : ''}`), nonEmptyCardDetail(t('orientation'), personality.sexOrientation)], tooltip: '', isRevealed: revealed.personality, canReveal: true, revealAction: 'Personality' },
		{ type: 'Body', categoryLabel: t('body'), value: body.bodyType || t('body'), iconKey: characteristicIconRegistry.body, details: [nonEmptyCardDetail(t('height'), body.height ? `${body.height} см` : ''), nonEmptyCardDetail(t('weight'), body.weight ? `${body.weight} кг` : '')], tooltip: '', isRevealed: revealed.body, canReveal: true, revealAction: 'Body' },
		{
			type: 'Profession',
			categoryLabel: t('profession'),
			value: getLocalizedValue(profession, 'profession')
				|| getLocalizedValue(profession, 'name')
				|| profession.name
				|| profession.Name
				|| t('profession'),
			iconKey: resolveProfessionIconKey(profession),
			details: [
				nonEmptyCardDetail(
					t('cardQualification'),
					professionalLevel
				),
				nonEmptyCardDetail(
					t('cardAdditionalItem'),
					localizedProfessionItem
				)
			],
			tooltip: profession.tooltip || profession.Tooltip || '',
			variantSource: profession,
			isRevealed: revealed.profession,
			canReveal: true,
			revealAction: 'Profession'
		},
		{ type: 'PhysicalHealth', categoryLabel: t('physicalHealth'), value: physicalPresentation.value || t('physicalHealth'), iconKey: characteristicIconRegistry.physicalHealth, details: [nonEmptyCardDetail(t('cardSeverity'), physicalPresentation.severity)], tooltipHtml: buildSharedHealthTooltip(physicalHealth, { requireExplanation: true }), variantSource: physicalHealth, visualFamily: 'medical', isRevealed: revealed.physicalHealth, canReveal: true, revealAction: 'PhysicalHealth', supplementalHtml: additionalConditionsHtml },
		{ type: 'MentalHealth', categoryLabel: t('mentalHealth'), value: mentalPresentation.value || t('mentalHealth'), iconKey: characteristicIconRegistry.mentalHealth, details: [nonEmptyCardDetail(t('cardSeverity'), mentalPresentation.severity)], tooltipHtml: buildSharedHealthTooltip(mentalHealth, { requireExplanation: true }), variantSource: mentalHealth, visualFamily: 'mental', isRevealed: revealed.mentalHealth, canReveal: true, revealAction: 'MentalHealth' },
		{ type: 'Hobby', categoryLabel: t('hobby'), value: getLocalizedValue(hobby, 'hobby') || getLocalizedValue(hobby, 'name') || hobby.name || t('hobby'), iconKey: characteristicIconRegistry.hobby, details: hobbyCardDetails.details, tooltip: resolveHobbyCardTooltip(hobby, hobbyCardDetails.item), variantSource: hobby, isRevealed: revealed.hobby, canReveal: true, revealAction: 'Hobby' },
		{ type: 'CharacterTrait', categoryLabel: t('characterTrait'), value: getLocalizedValue(characterTrait, 'trait') || getLocalizedValue(characterTrait, 'name') || characterTrait.name || t('characterTrait'), iconKey: characteristicIconRegistry.characterTrait, details: [], tooltip: characterTrait.description || characterTrait.gameEffect || characterTrait.bunkerEffect || characterTrait.tooltip, variantSource: characterTrait, isRevealed: revealed.characterTrait, canReveal: true, revealAction: 'CharacterTrait' },
		{ type: 'Phobia', categoryLabel: t('phobia'), value: getLocalizedValue(phobia, 'phobia') || getLocalizedValue(phobia, 'name') || phobia.name || t('phobia'), iconKey: characteristicIconRegistry.phobia, details: [], tooltip: getLocalizedValue(phobia, 'description') || phobia.description || phobia.gameEffect || phobia.tooltip, variantSource: phobia, isRevealed: revealed.phobia, canReveal: true, revealAction: 'Phobia' },
		{ type: 'Inventory', categoryLabel: t('inventory'), value: inventoryItems.join(', ') || t('empty'), iconKey: characteristicIconRegistry.inventory, details: [], tooltip: inventoryTooltip, variantSource: inventory, isRevealed: revealed.inventory, canReveal: true, revealAction: 'Inventory' },
		{ type: 'Property', categoryLabel: t('property'), value: propertyPresentation.title, iconKey: characteristicIconRegistry.property, details: propertyPresentation.details, tooltip: '', variantSource: property, isRevealed: revealed.property, canReveal: !!property.definitionId, revealAction: 'Property' },
		{ type: 'Fact', categoryLabel: t('fact'), value: getLocalizedValue(fact, 'fact') || getLocalizedValue(fact, 'name') || fact.name || t('noFact'), iconKey: characteristicIconRegistry.fact, details: [], tooltip: fact.description || fact.tooltip || '', variantSource: fact, isRevealed: revealed.fact || revealed.Fact, canReveal: true, revealAction: 'Fact' }
	];

	container.innerHTML = `${renderEliminatedRevealAllPanel(player)}${models.map(renderCharacteristicCard).join('')}`;
	window.reinitTooltips?.();

}

function renderEliminatedRevealAllPanel(player) {
	const isEliminated = !!(player?.isEliminated || player?.IsEliminated);
	if (!isEliminated) return '';

	const hasRevealedAll = !!(player?.hasRevealedAllAfterElimination || player?.HasRevealedAllAfterElimination);
	const canRevealAll = !!(player?.canRevealAllAfterElimination || player?.CanRevealAllAfterElimination);

	if (hasRevealedAll) {
		return `
                <div class="eliminated-reveal-panel done">
                    <strong>${t('youHaveBeenEliminated')}</strong>
                    <span>${t('allCharacteristicsRevealed')}</span>
                </div>
            `;
	}

	if (!canRevealAll) {
		return `
                <div class="eliminated-reveal-panel">
                    <strong>${t('youHaveBeenEliminated')}</strong>
                </div>
            `;
	}

	return `
            <div class="eliminated-reveal-panel">
                <div>
                    <strong>${t('youHaveBeenEliminated')}</strong>
                    <span>${t('canRevealAllAfterElimination')}</span>
                </div>
                <button type="button" class="btn-eliminated-reveal-all" onclick="revealAllEliminatedPlayerCharacteristics()">
                    ${t('revealAllCharacteristics')}
                </button>
            </div>
        `;
}

function revealAllEliminatedPlayerCharacteristics() {
	connection.invoke("RevealAllEliminatedPlayerCharacteristics")
		.catch(err => console.error("RevealAllEliminatedPlayerCharacteristics error:", err));
}
