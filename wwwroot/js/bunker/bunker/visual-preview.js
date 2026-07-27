// Спільний Development-only preview для bunker materials та apocalypse effects.

function visualThemePreviewText() {
	const language = typeof getCurrentLanguage === 'function' ? getCurrentLanguage() : 'en';
	return ({
		uk: {
			title: 'Visual Theme Preview', material: 'Material profile', condition: 'Стан',
			apocalypse: 'Apocalypse preset', conditionEffects: 'Показувати зношеність',
			apocalypseEffects: 'Показувати apocalypse effects', grayscale: 'Grayscale structure check', primary: 'Головна bunker panel',
			compact: 'Мала картка', copy: 'Матеріал, veil і декоративні ефекти не знижують читабельність контенту.',
			compactCopy: 'Компактна поверхня використовує base material і не більше одного condition overlay.',
			control: 'Перевірити кнопку', table: 'Таблиця / список', modal: 'Modal-like section'
		},
		ru: {
			title: 'Visual Theme Preview', material: 'Material profile', condition: 'Состояние',
			apocalypse: 'Apocalypse preset', conditionEffects: 'Показывать износ',
			apocalypseEffects: 'Показывать apocalypse effects', grayscale: 'Grayscale structure check', primary: 'Главная bunker panel',
			compact: 'Малая карточка', copy: 'Материал, veil и декоративные эффекты не снижают читаемость контента.',
			compactCopy: 'Компактная поверхность использует base material и не более одного condition overlay.',
			control: 'Проверить кнопку', table: 'Таблица / список', modal: 'Modal-like section'
		},
		en: {
			title: 'Visual Theme Preview', material: 'Material profile', condition: 'Condition',
			apocalypse: 'Apocalypse preset', conditionEffects: 'Show condition wear',
			apocalypseEffects: 'Show apocalypse effects', grayscale: 'Grayscale structure check', primary: 'Main bunker panel',
			compact: 'Small card', copy: 'The material, veil and decorative effects preserve readable content.',
			compactCopy: 'The compact surface uses its base material and at most one condition overlay.',
			control: 'Test control', table: 'Table / list', modal: 'Modal-like section'
		}
	})[language] || null;
}

function renderVisualThemePreview() {
	const root = document.getElementById('apocalypseEffectPreview');
	const materialSelect = document.getElementById('bunkerMaterialPreviewSelect');
	const conditionSelect = document.getElementById('bunkerConditionPreviewSelect');
	const apocalypseSelect = document.getElementById('apocalypseEffectPreviewSelect');
	const details = document.getElementById('apocalypseEffectPreviewDetails');
	if (!root || !materialSelect || !conditionSelect || !apocalypseSelect || !details) return;
	const theme = {
		id: 'development-preview',
		category: 'preview',
		materialProfile: materialSelect.value,
		condition: conditionSelect.value,
		modifiers: []
	};
	const conditionEnabled = document.getElementById('bunkerConditionPreviewEnabled')?.checked !== false;
	const apocalypseEnabled = document.getElementById('bunkerApocalypsePreviewEnabled')?.checked !== false;
	const grayscaleEnabled = document.getElementById('bunkerGrayscalePreviewEnabled')?.checked === true;
	const preset = apocalypseVisualPresets[apocalypseSelect.value] || apocalypseVisualPresets['neutral-industrial'];
	const summaries = [];
	root.classList.toggle('is-grayscale', grayscaleEnabled);
	root.querySelectorAll('.visual-theme-preview-card').forEach((card, index) => {
		const resolved = applyBunkerMaterialPresentation(theme, card, {
			conditionEnabled,
			apocalypseEnabled: false
		});
		if (apocalypseEnabled && index === 0) applyApocalypsePresetToRoot(preset, card);
		else card.querySelector('.bunker-apocalypse-effect-stack')?.replaceChildren();
		if (index === 0) {
			const apocalypseLayers = apocalypseEnabled ? buildApocalypseEffectLayers(preset) : [];
			summaries.push(
				`profile=${resolved.profile.id}`,
				`base=${resolved.baseAsset?.id || 'none'}`,
				`secondary=${resolved.secondaryAsset?.id || 'none'}`,
				`accent=${resolved.accentAsset?.id || 'none'}`,
				`glass=${resolved.glassAsset?.id || 'none'}`,
				`structure=${resolved.profile.structureFamily}`,
				`condition=${resolved.conditionLayers.map(layer => `${layer.asset.id}:${layer.opacity}`).join(',') || 'off'}`,
				`apocalypse=${apocalypseLayers.map(layer => `${layer.asset.id}:${layer.opacity.toFixed(3)}:${layer.asset.blendMode}`).join(',') || 'off'}`,
				`fallback=${resolved.fallbackLevel}`
			);
		}
	});
	details.textContent = summaries.join(' | ');
}

function initVisualThemePreview() {
	const root = document.getElementById('apocalypseEffectPreview');
	if (!root) return;
	const text = visualThemePreviewText();
	document.getElementById('apocalypseEffectPreviewTitle').textContent = text.title;
	const labels = {
		bunkerMaterialPreviewLabel: text.material,
		bunkerConditionPreviewLabel: text.condition,
		apocalypseEffectPreviewLabel: text.apocalypse,
		bunkerConditionPreviewEnabledLabel: text.conditionEffects,
		bunkerApocalypsePreviewEnabledLabel: text.apocalypseEffects,
		bunkerGrayscalePreviewEnabledLabel: text.grayscale
	};
	for (const [id, value] of Object.entries(labels)) {
		const element = document.getElementById(id);
		if (element) element.textContent = value;
	}
	root.querySelector('[data-preview-card="primary"] h3').textContent = text.primary;
	root.querySelector('[data-preview-card="compact"] h3').textContent = text.compact;
	root.querySelector('[data-preview-copy="primary"]').textContent = text.copy;
	root.querySelector('[data-preview-copy="compact"]').textContent = text.compactCopy;
	root.querySelector('[data-preview-copy="control"]').textContent = text.control;
	root.querySelector('[data-preview-copy="table"]').textContent = text.table;
	root.querySelector('[data-preview-copy="modal"]').textContent = text.modal;

	const materialSelect = document.getElementById('bunkerMaterialPreviewSelect');
	const conditionSelect = document.getElementById('bunkerConditionPreviewSelect');
	const apocalypseSelect = document.getElementById('apocalypseEffectPreviewSelect');
	if (!materialSelect.options.length)
		materialSelect.replaceChildren(...Object.values(bunkerMaterialProfiles).map(profile => new Option(profile.id, profile.id)));
	if (!conditionSelect.options.length)
		conditionSelect.replaceChildren(...['excellent', 'good', 'fair', 'poor'].map(value => new Option(value, value)));
	if (!apocalypseSelect.options.length)
		apocalypseSelect.replaceChildren(...Object.values(apocalypseVisualPresets).map(preset => new Option(preset.id, preset.id)));
	if (!root.dataset.visualPreviewBound) {
		root.querySelectorAll('select, input[type="checkbox"]').forEach(control =>
			control.addEventListener('change', renderVisualThemePreview));
		root.dataset.visualPreviewBound = 'true';
	}
	renderVisualThemePreview();
}

initVisualThemePreview();
