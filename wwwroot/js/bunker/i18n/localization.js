// Responsibility: pure localization helpers (language detection, translation lookup, field extraction).
// Depends on: translations.js (uiTranslations). Loaded before game.js as a classic synchronous script.
function getCurrentLanguage() {
	const lang = localStorage.getItem("language") || "uk";
	if (lang === "gb") {
		localStorage.setItem("language", "en");
		return "en";
	}
	return ["uk", "en", "ru"].includes(lang) ? lang : "uk";
}

function setCurrentLanguage(lang) {
	if (!["uk", "en", "ru"].includes(lang)) lang = "uk";
	localStorage.setItem("language", lang);
}

function t(key) {
	const lang = getCurrentLanguage();
	return uiTranslations[lang]?.[key] || uiTranslations.uk?.[key] || key;
}

function localizeServerMessage(message) {
	const keys = {
		"Недоступно зараз": "unavailableNow",
		"У гравця немає великого предмета": "noBigItem",
		"У гравця немає малого предмета": "noSmallItem",
		"У гравця немає предметів": "noItems",
		"У гравця немає спеціальних карт": "noSpecialCards"
	};
	return keys[message] ? t(keys[message]) : message;
}

function getI18n(source) {
	return source?._i18n || source?.i18n || source?.I18n || null;
}

function getLocalization(source) {
	return source?.localization || source?.Localization || null;
}

function getRawField(source, field) {
	if (!source) return "";
	const pascal = field ? field.charAt(0).toUpperCase() + field.slice(1) : field;
	return source[field] ?? source[pascal] ?? "";
}

function getLocalizedValue(source, field, lang = getCurrentLanguage()) {
	if (!source) return "";
	const localization = getLocalization(source);
	const localizedHealth = localization?.[lang] || localization?.uk || Object.values(localization || {}).find(Boolean);
	if (localizedHealth) {
		if ((field === "name" || field === "назва") && localizedHealth.name) return localizedHealth.name;
		if ((field === "description" || field === "опис") && localizedHealth.description) return localizedHealth.description;
	}

	const localized = getI18n(source)?.[field];
	if (!localized) return getRawField(source, field) ?? "";
	return localized[lang] || localized.uk || getRawField(source, field) || "";
}

function getLocalizedArray(source, field, lang = getCurrentLanguage()) {
	if (!source) return [];
	const localized = getI18n(source)?.[field];
	if (Array.isArray(localized)) {
		return localized.map(x => x?.[lang] || x?.uk || "").filter(Boolean);
	}
	const raw = getRawField(source, field);
	return Array.isArray(raw) ? raw : [];
}

function getLocalizedByFields(source, fields, fallback = "") {
	for (const field of fields) {
		const value = getLocalizedValue(source, field);
		if (value) return value;
	}
	return fallback;
}

function getI18nLocalizedValue(source, field, lang = getCurrentLanguage()) {
	const localized = getI18n(source)?.[field];
	if (!localized) return "";
	if (typeof localized === "string") return localized;
	return localized[lang] || localized.uk || "";
}

function getLocalizedPhysicalField(source, fields, fallbackFields = []) {
	const i18nFields = Array.isArray(fields) ? fields : [fields];
	const lang = getCurrentLanguage();
	for (const field of i18nFields) {
		const localized = getI18nLocalizedValue(source, field, lang) || getI18nLocalizedValue(source, field, "uk");
		if (localized) return localized;
	}

	for (const fallbackField of fallbackFields) {
		const value = getRawField(source, fallbackField);
		if (value) return value;
	}

	return "";
}

function sentenceCase(text) {
	if (!text) return "";
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function toCamelCase(str) {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

function eventCardLocalized(value) {
	if (!value) return '';
	const language = getCurrentLanguage();
	return value[language] || value[language.toUpperCase()] || value.uk || value.Uk || value.en || value.En || '';
}

function scenarioUiText(key) {
	const language = getCurrentLanguage();
	const texts = {
		uk: {
			event: 'Подія', secretEvent: 'Таємна подія', privateEvent: 'Приватна подія',
			eventCard: 'Подієва карта', available: 'Доступна', pending_choice: 'Очікує рішення',
			resolved: 'Використано', expired: 'Згоріла', transferred: 'Передано',
			opportunity_missed: 'Можливість втрачено', returned: 'Повернуто', kept: 'Залишено',
			used: 'Використано', consumed: 'Використано', framed: 'Передано',
			validUntil: 'Діє до завершення {round} раунду', usedRound: 'Використано у {round} раунді',
			resolvedRound: 'Завершено у {round} раунді', supplyIncident: 'Інцидент зі складом'
		},
		en: {
			event: 'Event', secretEvent: 'Secret event', privateEvent: 'Private event',
			eventCard: 'Event card', available: 'Available', pending_choice: 'Awaiting decision',
			resolved: 'Used', expired: 'Expired', transferred: 'Transferred',
			opportunity_missed: 'Opportunity missed', returned: 'Returned', kept: 'Kept',
			used: 'Used', consumed: 'Used', framed: 'Transferred',
			validUntil: 'Valid until the end of round {round}', usedRound: 'Used in round {round}',
			resolvedRound: 'Resolved in round {round}', supplyIncident: 'Storage incident'
		},
		ru: {
			event: 'Событие', secretEvent: 'Тайное событие', privateEvent: 'Приватное событие',
			eventCard: 'Карта события', available: 'Доступна', pending_choice: 'Ожидает решения',
			resolved: 'Использована', expired: 'Сгорела', transferred: 'Передана',
			opportunity_missed: 'Возможность упущена', returned: 'Возвращено', kept: 'Оставлено',
			used: 'Использована', consumed: 'Использована', framed: 'Передана',
			validUntil: 'Действует до завершения {round} раунда', usedRound: 'Использована в {round} раунде',
			resolvedRound: 'Завершена в {round} раунде', supplyIncident: 'Инцидент на складе'
		}
	};
	return texts[language]?.[key] || texts.uk[key] || '';
}

function scenarioTypeLabel(type) {
	return String(type || '').toLowerCase() === 'secret_event'
		? scenarioUiText('secretEvent')
		: scenarioUiText('event');
}

function eventCardPublicNoticeText(code, accused) {
	const language = getCurrentLanguage();
	const templates = {
		uk: {
			supplies_stolen: 'Усі запаси їжі та води зникли зі складу. Винного не встановлено.',
			supplies_returned: 'Зниклі припаси повернули до бункера.',
			supplies_returned_accusation: 'Припаси повернули, але знайдені докази вказують на {name}.',
			supplies_missing_accusation: 'Припаси не повернули. Знайдені докази вказують на {name}.'
		},
		en: {
			supplies_stolen: 'All food and water supplies disappeared from storage. The culprit is unknown.',
			supplies_returned: 'The missing supplies were returned to the bunker.',
			supplies_returned_accusation: 'The supplies were returned, but the evidence points to {name}.',
			supplies_missing_accusation: 'The supplies were not returned. The evidence points to {name}.'
		},
		ru: {
			supplies_stolen: 'Все запасы еды и воды исчезли со склада. Виновный не установлен.',
			supplies_returned: 'Пропавшие припасы вернули в бункер.',
			supplies_returned_accusation: 'Припасы вернули, но найденные доказательства указывают на {name}.',
			supplies_missing_accusation: 'Припасы не вернули. Найденные доказательства указывают на {name}.'
		}
	};
	return (templates[language]?.[code] || templates.uk[code] || scenarioUiText('supplyIncident'))
		.replace('{name}', accused || t('unknown'));
}

function getTooltipTypeClass(charKey) {
	const typeClasses = {
		'profession': 'profession',
		'physicalHealth': 'physical',
		'mentalHealth': 'mental',
		'hobby': 'hobby',
		'phobia': 'phobia',
		'fact': 'fact',
		'specialCard': 'special-card-tooltip'
	};
	return typeClasses[charKey] || '';
}