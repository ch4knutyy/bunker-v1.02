// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function normalizeInventoryData(source) {
	const src = source || {};
	const items = src.items ?? src.Items ?? [];

	return {
		items: Array.isArray(items)
			? items.map(normalizeItemData)
			: []
	};
}

function normalizePropertyData(source) {
	const src = source || {};
	return {
		definitionId: src.definitionId ?? src.DefinitionId ?? "",
		generatedValues: src.generatedValues ?? src.GeneratedValues ?? {},
		localizedDisplay: src.localizedDisplay ?? src.LocalizedDisplay ?? {},
		localizedPresentation: src.localizedPresentation ?? src.LocalizedPresentation ?? {},
		category: src.category ?? src.Category ?? "",
		sizeClass: src.sizeClass ?? src.SizeClass ?? "",
		resourceTags: src.resourceTags ?? src.ResourceTags ?? [],
		protectionTags: src.protectionTags ?? src.ProtectionTags ?? [],
		threatUsage: src.threatUsage ?? src.ThreatUsage ?? null
	};
}

function getPropertyPresentation(source) {
	const property = normalizePropertyData(source);
	const language = getCurrentLanguage();
	const presentation = property.localizedPresentation?.[language] ||
		property.localizedPresentation?.uk ||
		null;
	if (!presentation) {
		return { title: getPropertyDisplay(property), details: [] };
	}
	const rawDetails = presentation.details ?? presentation.Details ?? [];
	return {
		title: presentation.title ?? presentation.Title ?? getPropertyDisplay(property),
		details: Array.isArray(rawDetails)
			? rawDetails.slice(0, 4).map(detail => ({
				key: detail.key ?? detail.Key ?? "",
				label: detail.label ?? detail.Label ?? "",
				value: detail.value ?? detail.Value ?? ""
			}))
			: []
	};
}

function getPropertyDisplay(source) {
	const property = normalizePropertyData(source);
	const language = getCurrentLanguage();
	return property.localizedDisplay?.[language] ||
		property.localizedDisplay?.uk ||
		t('propertyUnavailable');
}

function normalizeItemData(item) {
	const src = item || {};
	return {
		instanceId: src.instanceId ?? src.InstanceId ?? "",
		name: src.name ?? src.Name ?? "",
		description: src.description ?? src.Description ?? '',
		quantity: src.quantity ?? src.Quantity ?? 1,
		source: src.source ?? src.Source ?? "",
		isHidden: !!(src.isHidden ?? src.IsHidden),
		resourceTags: src.resourceTags || src.ResourceTags || [],
		protectionTags: src.protectionTags || src.ProtectionTags || [],
		_i18n: getI18n(src)
	};
}
