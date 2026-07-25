// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function normalizeSpecialCard(source) {
	const src = source || {};
	const isUsed = !!(src.isUsed ?? src.IsUsed);
	const isActive = !!(src.isActive ?? src.IsActive);
	const effectDuration = src.effectDuration ?? src.EffectDuration ?? "instant";
	const effectExpiresAtRound = src.effectExpiresAtRound ?? src.EffectExpiresAtRound ?? null;
	const computedEffectActive = effectDuration === 'untilRoundEnd' &&
		effectExpiresAtRound != null &&
		Number(effectExpiresAtRound) >= Number(getCurrentRoundNumber() || 0);
	return {
		id: src.id ?? src.Id ?? src.cardId ?? src.CardId ?? "",
		name: src.name ?? src.Name ?? src.cardName ?? src.CardName ?? "",
		description: src.description ?? src.Description ?? "",
		category: src.category ?? src.Category ?? "",
		tags: Array.isArray(src.tags ?? src.Tags) ? (src.tags ?? src.Tags) : [],
		targetType: src.targetType ?? src.TargetType ?? "",
		isSecret: src.isSecret ?? src.IsSecret ?? true,
		isOneTimeUse: src.isOneTimeUse ?? src.IsOneTimeUse ?? true,
		phase: src.phase ?? src.Phase ?? "beforeVoting",
		effectType: src.effectType ?? src.EffectType ?? "",
		requiresTarget: !!(src.requiresTarget ?? src.RequiresTarget),
		isUsed,
		isActive,
		status: src.status ?? src.Status ?? (isActive ? "active" : isUsed ? "used" : "hidden"),
		usedAtRound: src.usedAtRound ?? src.UsedAtRound ?? null,
		activatedRound: src.activatedRound ?? src.ActivatedRound ?? null,
		targetPlayerId: src.targetPlayerId ?? src.TargetPlayerId ?? null,
		targetPlayerName: src.targetPlayerName ?? src.TargetPlayerName ?? null,
		activatedVotingId: src.activatedVotingId ?? src.ActivatedVotingId ?? null,
		effectResult: src.effectResult ?? src.EffectResult ?? null,
		publicLog: src.publicLog ?? src.PublicLog ?? null,
		privateResult: src.privateResult ?? src.PrivateResult ?? null,
		useMode: src.useMode ?? src.UseMode ?? "",
		wasUsedSilently: !!(src.wasUsedSilently ?? src.WasUsedSilently),
		isPubliclyRevealed: !!(src.isPubliclyRevealed ?? src.IsPubliclyRevealed),
		isEffectActive: !!(src.isEffectActive ?? src.IsEffectActive ?? computedEffectActive ?? isActive),
		effectDuration,
		effectExpiresAtRound,
		publicVisibilityExpiresAtRound: src.publicVisibilityExpiresAtRound ?? src.PublicVisibilityExpiresAtRound ?? null,
		publicDisplayName: src.publicDisplayName ?? src.PublicDisplayName ?? null,
		publicDescription: src.publicDescription ?? src.PublicDescription ?? null,
		publicResult: src.publicResult ?? src.PublicResult ?? null,
		_i18n: getI18n(src)
	};
}

function normalizeSpecialCards(source, fallbackCard = null) {
	const cards = Array.isArray(source) ? source : [];
	const normalized = cards.map(card => normalizeSpecialCard(card));

	if (normalized.length === 0 && fallbackCard) {
		normalized.push(normalizeSpecialCard(fallbackCard));
	}

	return normalized.filter(card => card.id && card.id !== 'no_special_card');
}

function normalizeSpecialCardState(source) {
	const src = source || {};
	return {
		connectionId: src.connectionId || src.ConnectionId || "",
		stablePlayerId: src.stablePlayerId || src.StablePlayerId || "",
		playerName: src.playerName || src.PlayerName || src.name || src.Name || "",
		seatNumber: src.seatNumber ?? src.SeatNumber ?? 0,
		isOwnerHost: !!(src.isOwnerHost ?? src.IsOwnerHost),
		isHidden: !!(src.isHidden ?? src.IsHidden),
		status: src.status || src.Status || "hidden",
		cardId: src.cardId ?? src.CardId ?? null,
		cardName: src.cardName ?? src.CardName ?? src.name ?? src.Name ?? "Секретна карта",
		description: src.description ?? src.Description ?? null,
		effectType: src.effectType ?? src.EffectType ?? null,
		isSecret: src.isSecret ?? src.IsSecret ?? true,
		wasUsedSilently: !!(src.wasUsedSilently ?? src.WasUsedSilently),
		isPubliclyRevealed: !!(src.isPubliclyRevealed ?? src.IsPubliclyRevealed),
		isEffectActive: !!(src.isEffectActive ?? src.IsEffectActive),
		isOneTimeUse: src.isOneTimeUse ?? src.IsOneTimeUse ?? true,
		requiresTarget: !!(src.requiresTarget ?? src.RequiresTarget),
		usedAtRound: src.usedAtRound ?? src.UsedAtRound ?? null,
		activatedRound: src.activatedRound ?? src.ActivatedRound ?? null,
		effectDuration: src.effectDuration ?? src.EffectDuration ?? "instant",
		effectExpiresAtRound: src.effectExpiresAtRound ?? src.EffectExpiresAtRound ?? null,
		targetPlayerId: src.targetPlayerId ?? src.TargetPlayerId ?? null,
		targetPlayerName: src.targetPlayerName ?? src.TargetPlayerName ?? null,
		publicResult: src.publicResult ?? src.PublicResult ?? null,
		_i18n: getI18n(src)
	};
}

function getSpecialCardName(card) {
	if (!card) return 'Без спеціальної карти';
	return getLocalizedValue(card, 'name') || card.name || card.Name || card.cardName || card.CardName || 'Секретна карта';
}

function getSpecialCardDescription(card) {
	if (!card) return '';
	return getLocalizedValue(card, 'description') || card.description || card.Description || '';
}

function renderSpecialCardIcon(iconKey) {
	const body = specialCardIconSvgRegistry[iconKey] || specialCardIconSvgRegistry.star;
	return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function resolveSpecialCardVisualVariant(model) {
	const tags = Array.isArray(model?.tags) ? model.tags : [];
	const metadata = [model?.category, model?.effectType, model?.targetType, ...tags].filter(Boolean).join(' ').toLowerCase();
	if (/threat|hazard|danger/.test(metadata)) return 'threat';
	if (/protect|shield|heal|immun/.test(metadata)) return 'protect';
	if (/steal|destroy|sabotage|block/.test(metadata)) return 'steal';
	if (/swap|exchange|trade/.test(metadata)) return 'swap';
	if (/reroll|regenerat|randomize|refresh/.test(metadata)) return 'reroll';
	if (/global|all[_\s-]?players|neighbors|force.*all/.test(metadata)) return 'global';
	if (/inventory|item|equipment|loadout/.test(metadata)) return 'inventory';
	if (/reveal|peek|expos|inspect/.test(metadata)) return 'reveal';
	if (/change|copy|hide|give|double|modify/.test(metadata)) return 'change';
	return 'neutral';
}

function resolveSpecialCardIconKey(model, visualVariant = resolveSpecialCardVisualVariant(model)) {
	const effectType = String(model?.effectType || '').toLowerCase();
	if (/mental|brain/.test(effectType)) return 'brain';
	if (/physical|health|heal/.test(effectType)) return 'heart';
	if (/profession/.test(effectType)) return 'briefcase';
	if (/inventory|item/.test(effectType) && !['steal', 'swap'].includes(visualVariant)) return 'backpack';
	return { reveal: 'eye', protect: 'shield', steal: 'hand', swap: 'swap', reroll: 'dice', change: 'refresh', global: 'globe', threat: 'warning', inventory: 'backpack', neutral: 'star' }[visualVariant] || 'star';
}

function getSpecialCardVariantLabel(variant) {
	const key = { reveal: 'specialVariantReveal', protect: 'specialVariantProtect', steal: 'specialVariantSteal', swap: 'specialVariantSwap', reroll: 'specialVariantReroll', change: 'specialVariantChange', global: 'specialVariantGlobal', threat: 'specialVariantThreat', inventory: 'specialVariantInventory', neutral: 'specialVariantNeutral' }[variant] || 'specialVariantNeutral';
	return t(key);
}

function getSpecialCardStageLabel(phase) {
	return phase === 'beforeVoting' ? t('specialStageBeforeVoting') : phase === 'discussion' ? t('specialStageDiscussion') : '';
}

function canUseSpecialCardNow(card) {
	const phase = getCurrentPhase();
	return currentRoom?.state === 'Playing' &&
		(card.phase === 'beforeVoting'
			? phase === 'PreVotingReadyCheck'
			: card.phase === 'discussion' && ['RoundReveal', 'RoundEnded', 'Threat', 'ExtraInventory', 'PreVotingReadyCheck', 'VotingResults'].includes(phase));
}

function getSpecialCardSelectionKey(card, cardIndex) {
	return card?.id || `card-${cardIndex}`;
}

function getSpecialCardTargetRef(player) {
	return player?.stablePlayerId || player?.StablePlayerId || player?.connectionId || player?.ConnectionId || '';
}

function getSpecialCardStatusLabel(status) {
	const labels = {
		hidden: t('hidden'),
		revealed: t('cardRevealed'),
		active: t('activeUntilRoundEnd'),
		used: t('used'),
		ended: t('effectEnded'),
		hand: t('notUsed')
	};
	return labels[status] || labels.hidden;
}

function getSpecialCardPrivacyLabel(card) {
	if (card.isSecret && card.isPubliclyRevealed) return t('secretRevealedBadge');
	return card.isSecret ? t('secretCardBadge') : t('publicCardBadge');
}

function getSpecialCardPrivacyClass(card) {
	if (card.isSecret && card.isPubliclyRevealed) return 'secret-revealed';
	return card.isSecret ? 'secret' : 'public';
}

function getSpecialCardTargets() {
	return Object.values(roomPlayers || {})
		.filter(player => player && !(player.isEliminated || player.IsEliminated) && !(player.isSpectatorGm || player.IsSpectatorGm))
		.filter(player => !isMyPlayerRef(player.connectionId || player.ConnectionId, player.stablePlayerId || player.StablePlayerId))
		.sort((a, b) => (a.seatNumber || 999) - (b.seatNumber || 999));
}

function getAutomaticSpecialCardOrderLabel(card) {
	const effectType = String(card?.effectType || card?.EffectType || '');
	if (!/(Upper|Lower|Neighbors)/.test(effectType)) return '';
	const models = getCanonicalPublicPlayerModels({ activeOnly: true });
	if (models.length < 2) return '';
	const ownerIndex = models.findIndex(({ player }) => isMyPlayerRef(
		player.connectionId || player.ConnectionId,
		player.stablePlayerId || player.StablePlayerId));
	if (ownerIndex < 0) return '';
	const formatNeighbor = (direction, labelKey) => {
		const target = models[(ownerIndex + direction + models.length) % models.length];
		return `${t(labelKey)}: #${target.seat} ${target.player.name || target.player.Name || t('playerLabel')}`;
	};
	const hasBothDirections = /Neighbors|Upper.*Lower|Lower.*Upper/.test(effectType);
	if (hasBothDirections) return [formatNeighbor(-1, 'specialPreviousOrder'), formatNeighbor(1, 'specialNextOrder')].join(' · ');
	return /Upper/.test(effectType)
		? formatNeighbor(-1, 'specialPreviousOrder')
		: formatNeighbor(1, 'specialNextOrder');
}

function rememberSpecialCardSelection(cardIndex = 0, rerender = true, keyOverride = '') {
	const cards = normalizeSpecialCards(myPlayerData?.specialCards, myPlayerData?.specialCard);
	const card = cards[cardIndex];
	const selectionKey = keyOverride || renderedSpecialCardKeys[cardIndex] || getSpecialCardSelectionKey(card, cardIndex);
	if (!selectionKey) return;
	const targets = getSpecialCardTargets();
	const targetSelect = document.getElementById(`specialCardTargetSelect-${cardIndex}`);
	const characteristicSelect = document.getElementById(`specialCardCharacteristicSelect-${cardIndex}`);
	const targetIndex = targetSelect?.value === '' ? -1 : Number(targetSelect?.value);
	const selectedTarget = Number.isInteger(targetIndex) ? targets[targetIndex] : null;
	specialCardSelectionState.set(selectionKey, {
		targetRef: getSpecialCardTargetRef(selectedTarget),
		characteristic: characteristicSelect?.value || ''
	});
	if (rerender) renderMySpecialCards(myPlayerData);
}

function captureSpecialCardSelections() {
	renderedSpecialCardKeys.forEach((key, index) => {
		if (document.getElementById(`specialCardTargetSelect-${index}`) || document.getElementById(`specialCardCharacteristicSelect-${index}`)) {
			rememberSpecialCardSelection(index, false, key);
		}
	});
}

function resolveSpecialCardTooltipContent(card, model) {
	const extra = cleanTooltipText(card.privateResult || card.effectResult || card.publicResult || '');
	if (!extra) return '';
	const normalized = extra.toLocaleLowerCase();
	const duplicates = [model.name, model.effect, model.statusLabel, model.targetLabel]
		.map(value => cleanTooltipText(value || '').toLocaleLowerCase()).filter(Boolean);
	return duplicates.includes(normalized) || /^(unknown|невідомо|неизвестно)$/i.test(extra) ? '' : extra;
}

function buildSpecialCardModel(card, cardIndex = 0) {
	const normalized = normalizeSpecialCard(card);
	const visualVariant = resolveSpecialCardVisualVariant(normalized);
	const isPending = pendingSpecialCardUses.has(getSpecialCardSelectionKey(normalized, cardIndex));
	const isActive = normalized.isEffectActive || normalized.isActive || normalized.status === 'active';
	const isUsed = normalized.isUsed || !!normalized.usedAtRound || normalized.status === 'used';
	const status = isPending ? 'pending' : isActive ? 'active' : isUsed ? (normalized.effectDuration === 'untilRoundEnd' ? 'ended' : 'used') : 'hand';
	const isAvailable = !isPending && !isActive && !isUsed && canUseSpecialCardNow(normalized);
	const selection = specialCardSelectionState.get(getSpecialCardSelectionKey(normalized, cardIndex)) || {};
	const selectedTarget = getSpecialCardTargets().find(player => getSpecialCardTargetRef(player) === selection.targetRef);
	const automaticOrderLabel = getAutomaticSpecialCardOrderLabel(normalized);
	const model = {
		id: normalized.id,
		name: getSpecialCardName(normalized),
		category: getSpecialCardVariantLabel(visualVariant),
		description: '',
		effect: getSpecialCardDescription(normalized),
		iconKey: resolveSpecialCardIconKey(normalized, visualVariant),
		targetType: normalized.requiresTarget ? 'player' : automaticOrderLabel ? 'seat-order' : '',
		targetLabel: normalized.requiresTarget ? (selectedTarget?.name || selectedTarget?.Name || normalized.targetPlayerName || t('specialTargetRequired')) : automaticOrderLabel,
		stageRestriction: getSpecialCardStageLabel(normalized.phase),
		isAvailable,
		isPending,
		isUsed,
		isUnavailable: !isPending && !isActive && !isUsed && !isAvailable,
		canUse: isAvailable,
		actionLabel: isPending ? t('specialPending') : t('useSpecialCard'),
		statusLabel: isPending ? t('specialPending') : isAvailable ? t('specialAvailableNow') : getSpecialCardStatusLabel(status),
		visualVariant,
		status,
		isActive,
		isSecret: normalized.isSecret,
		privacyLabel: getSpecialCardPrivacyLabel(normalized),
		privacyClass: getSpecialCardPrivacyClass(normalized),
		cardIndex,
		source: normalized
	};
	model.tooltip = resolveSpecialCardTooltipContent(normalized, model);
	return model;
}

function renderSpecialCardControls(card, cardIndex = 0, model = buildSpecialCardModel(card, cardIndex)) {
	const normalized = normalizeSpecialCard(card);
	if (!normalized.id || normalized.id === 'no_special_card') return `<p class="special-card-note">${t('specialNotIssued')}</p>`;
	if (model.isPending) return `<button type="button" class="special-card-use-btn is-pending" disabled aria-disabled="true">${t('specialPending')}</button>`;
	if (model.isActive) return `<p class="special-card-note active">${t('activeUntilRoundEnd')}</p>`;
	if (model.isUsed) return `<p class="special-card-note used">${t('cardWasUsed')}</p>`;
	if (model.isUnavailable) {
		return `<p class="special-card-note unavailable">${t('unavailableNow')} · ${escapeHtml(model.stageRestriction)}</p><button type="button" class="special-card-use-btn" disabled aria-disabled="true">${t('unavailableNow')}</button>`;
	}

	const targets = getSpecialCardTargets();
	const selection = specialCardSelectionState.get(getSpecialCardSelectionKey(normalized, cardIndex)) || {};
	const targetSelectId = `specialCardTargetSelect-${cardIndex}`;
	const characteristicSelectId = `specialCardCharacteristicSelect-${cardIndex}`;
	const needsCharacteristicSelect = ['swapSelectedCharacteristicWithTarget', 'rerollTargetSelectedCharacteristic'].includes(normalized.effectType);
	const characteristicOptions = [
		['Profession', t('profession')], ['PersonalInfo', t('personality')], ['Body', t('body')], ['PhysicalHealth', t('physicalHealth')],
		['MentalHealth', t('mentalHealth')], ['Hobby', t('hobby')], ['CharacterTrait', t('characterTrait')], ['Fact', t('fact')]
	];
	const selectedTargetIndex = targets.findIndex(player => getSpecialCardTargetRef(player) === selection.targetRef);
	const targetSelect = normalized.requiresTarget ? `<label class="special-card-target-block" for="${targetSelectId}"><span>${t('target')}</span><select id="${targetSelectId}" class="special-card-target-select" aria-label="${t('target')}" onchange="rememberSpecialCardSelection(${cardIndex})">
		<option value="">${t('choosePlayer')}</option>
		${targets.map((player, index) => {
		const seat = player.seatNumber || player.SeatNumber || 0;
		const name = player.name || player.Name || t('unknown');
		return `<option value="${index}"${index === selectedTargetIndex ? ' selected' : ''}>${seat ? `#${seat} ` : ''}${escapeHtml(name)}</option>`;
	}).join('')}
	</select></label>` : '';
	const characteristicSelect = needsCharacteristicSelect ? `<label class="special-card-target-block" for="${characteristicSelectId}"><span>${t('specialCharacteristicLabel')}</span><select id="${characteristicSelectId}" class="special-card-target-select" aria-label="${t('specialCharacteristicLabel')}" onchange="rememberSpecialCardSelection(${cardIndex})">
		<option value="">${t('specialChooseCharacteristic')}</option>
		${characteristicOptions.map(([value, label]) => `<option value="${value}"${selection.characteristic === value ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('')}
	</select></label>` : '';
	if (normalized.requiresTarget && targets.length === 0) return `<button type="button" class="special-card-use-btn" disabled aria-disabled="true">${t('noAvailableTarget')}</button>`;

	const targetReady = !normalized.requiresTarget || selectedTargetIndex >= 0;
	const characteristicReady = !needsCharacteristicSelect || !!selection.characteristic;
	const disabled = !(targetReady && characteristicReady);
	const disabledMarkup = disabled ? ' disabled aria-disabled="true"' : '';
	const useButtons = normalized.isSecret
		? `<button type="button" class="special-card-use-btn" data-testid="special-card-use-silent" onclick="useSpecialCardFromCard(${cardIndex}, 'silent')"${disabledMarkup}>${t('useSecretly')}</button><button type="button" class="special-card-use-btn public-use" data-testid="special-card-use-public" onclick="useSpecialCardFromCard(${cardIndex}, 'public')"${disabledMarkup}>${t('usePublicly')}</button>`
		: `<button type="button" class="special-card-use-btn" data-testid="special-card-use" onclick="useSpecialCardFromCard(${cardIndex}, 'public')"${disabledMarkup}>${t('useSpecialCard')}</button>`;

	return `<div class="special-card-controls">${targetSelect}${characteristicSelect}<div class="special-card-use-actions">${useButtons}</div></div>`;
}

function useSpecialCardFromCard(cardIndex = 0, useMode = null) {
	const cards = normalizeSpecialCards(myPlayerData?.specialCards, myPlayerData?.specialCard);
	const card = cards[cardIndex] || normalizeSpecialCard(myPlayerData?.specialCard);
	const pendingKey = getSpecialCardSelectionKey(card, cardIndex);
	if (pendingSpecialCardUses.has(pendingKey)) return;
	rememberSpecialCardSelection(cardIndex, false);
	const targets = getSpecialCardTargets();
	const select = document.getElementById(`specialCardTargetSelect-${cardIndex}`);
	const targetIndex = select?.value === '' ? -1 : Number(select?.value);
	const selectedTarget = Number.isInteger(targetIndex) ? targets[targetIndex] : null;
	const targetConnectionId = selectedTarget?.connectionId || selectedTarget?.ConnectionId || null;
	const characteristicSelect = document.getElementById(`specialCardCharacteristicSelect-${cardIndex}`);
	const selectedCharacteristic = characteristicSelect ? characteristicSelect.value : null;
	const needsCharacteristicSelect = [
		'swapSelectedCharacteristicWithTarget',
		'rerollTargetSelectedCharacteristic'
	].includes(card.effectType);

	if (card.requiresTarget && !targetConnectionId) {
		addEventMessage('Оберіть ціль для спеціальної карти.');
		return;
	}
	if (needsCharacteristicSelect && !selectedCharacteristic) {
		addEventMessage('Оберіть характеристику для спеціальної карти.');
		return;
	}

	const resolvedUseMode = card.isSecret ? (useMode || 'silent') : 'public';
	pendingSpecialCardUses.add(pendingKey);
	renderMySpecialCards(myPlayerData);
	const commandId = globalThis.crypto?.randomUUID?.() || `special-card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
	connection.invoke("UseSpecialCardById", card.id, targetConnectionId || null, resolvedUseMode, selectedCharacteristic || null, commandId)
		.catch(err => {
			console.error("UseSpecialCard error:", err);
			addEventMessage(t('unavailableNow'));
		})
		.finally(() => {
			pendingSpecialCardUses.delete(pendingKey);
			renderMySpecialCards(myPlayerData);
		});
}

function renderSpecialCard(model) {
	const tooltipId = `special-card-tooltip-${model.cardIndex}`;
	const tooltip = model.tooltip ? `<span class="characteristic-with-tooltip special-card-tooltip"><button type="button" class="tooltip-trigger" aria-label="${escapeHtml(t('cardTooltipLabel'))}" aria-controls="${tooltipId}" aria-expanded="false">?</button><span class="tooltip-content" id="${tooltipId}" role="tooltip">${escapeHtml(model.tooltip)}</span></span>` : '';
	const metaRows = [
		model.targetType ? { label: t('target'), value: model.targetLabel } : null,
		model.stageRestriction ? { label: t('specialStageLabel'), value: model.stageRestriction } : null
	].filter(Boolean).map(row => `<div class="special-card-meta-row"><span>${escapeHtml(row.label)}</span><strong>${escapeHtml(row.value)}</strong></div>`).join('');
	return `<article class="my-special-card special-card-shell variant-${model.visualVariant} state-${model.status}" data-testid="my-special-card">
		${tooltip}
		<header class="special-card-header">
			<div class="special-card-icon-zone">${renderSpecialCardIcon(model.iconKey)}</div>
			<div class="special-card-heading"><span class="special-card-category">${escapeHtml(model.category)}</span><h3 class="special-card-title">${escapeHtml(model.name)}</h3></div>
			<span class="special-card-status ${model.status}">${escapeHtml(model.statusLabel)}</span>
		</header>
		<div class="special-card-divider"><span></span><i></i><span></span></div>
		<section class="special-card-effect"><span>${escapeHtml(t('specialEffectLabel'))}</span><p>${escapeHtml(model.effect || t('noData'))}</p></section>
		${metaRows ? `<div class="special-card-meta">${metaRows}</div>` : ''}
		<span class="special-card-privacy ${model.privacyClass}">${escapeHtml(model.privacyLabel)}</span>
		<footer class="special-card-footer">${renderSpecialCardControls(model.source, model.cardIndex, model)}</footer>
	</article>`;
}

function renderMySpecialCards(player) {
	const section = document.getElementById('mySpecialCardsSection');
	const container = document.getElementById('mySpecialCardsList');
	if (!section || !container) return;

	captureSpecialCardSelections();
	const cards = normalizeSpecialCards(player?.specialCards || player?.SpecialCards, player?.specialCard || player?.SpecialCard);
	if (cards.length === 0) {
		section.hidden = true; section.style.display = 'none'; container.innerHTML = '';
		return;
	}

	section.hidden = false; section.style.display = '';
	container.innerHTML = cards.map((card, index) => renderSpecialCard(buildSpecialCardModel(card, index))).join('');
	renderedSpecialCardKeys = cards.map((card, index) => getSpecialCardSelectionKey(card, index));
	window.reinitTooltips?.();
}

function eventCardPlayerOptions(ownerId, includeEliminated = false) {
	return Object.values(roomPlayers)
		.filter(player => (includeEliminated || !player.isEliminated) && !player.isSpectatorGm)
		.map(player => {
			const stableId = player.stablePlayerId || player.id || '';
			return { id: stableId, name: player.name || t('unknown'), isOwner: stableId === ownerId };
		});
}

function renderMyEventCards(player) {
	const section = document.getElementById('myEventCardsSection');
	const container = document.getElementById('myEventCardsList');
	if (!section || !container) return;
	const cards = player?.eventSpecialCards || player?.EventSpecialCards || [];
	section.hidden = cards.length === 0;
	if (cards.length === 0) { container.innerHTML = ''; return; }
	section.style.display = '';
	container.innerHTML = cards.map((card, cardIndex) => {
		const runtimeId = card.runtimeCardId || card.RuntimeCardId;
		const ownerId = getMyStablePlayerId();
		const actions = card.availableActions || card.AvailableActions || card.actions || card.Actions || [];
		const status = card.status || card.Status || 'available';
		const result = card.result || card.Result || 'none';
		const canUse = card.canUse ?? card.CanUse ?? false;
		const professionOptions = card.pendingProfessionOptions || card.PendingProfessionOptions || [];
		const actionMarkup = canUse ? actions.map((action, actionIndex) => {
			const targetMode = action.targetMode || action.TargetMode || 'room';
			const operation = action.operation || action.Operation || 'apply_effects';
			const needsTarget = ['other_active_player', 'self_or_other_active_player', 'eliminated_other_player'].includes(targetMode);
			const targetSelect = needsTarget ? `<select id="eventCardTarget-${cardIndex}-${actionIndex}" class="special-card-target-select">
				<option value="">${escapeHtml(t('choosePlayer'))}</option>
				${eventCardPlayerOptions(ownerId, targetMode === 'eliminated_other_player').filter(option => !option.isOwner).map(option => `<option value="${escapeHtml(option.id)}">${escapeHtml(option.name)}</option>`).join('')}
			</select>` : '';
			const choices = action.choices || action.Choices || [];
			const choiceSelect = choices.length ? `<select id="eventCardChoice-${cardIndex}-${actionIndex}" class="special-card-target-select">${choices.map(choice => `<option value="${escapeHtml(choice.id || choice.Id)}">${escapeHtml(eventCardLocalized(choice.label || choice.Label))}</option>`).join('')}</select>` : '';
			const professionSelect = professionOptions.length ? `<select id="eventCardProfession-${cardIndex}-${actionIndex}" class="special-card-target-select"><option value="">${escapeHtml(t('choosePlayer'))}</option>${professionOptions.map(option => `<option value="${escapeHtml(option.name || option.Name)}">${escapeHtml(option.name || option.Name)}</option>`).join('')}</select>` : '';
			return `<div class="event-card-action">${targetSelect}${choiceSelect}${professionSelect}<button type="button" class="special-card-use-btn" onclick="useEventSpecialCard(${cardIndex},${actionIndex},'${escapeHtml(operation)}')">${escapeHtml(eventCardLocalized(action.label || action.Label) || t('use'))}</button></div>`;
		}).join('') : '';
		const expiresAfterRound = card.expiresAfterRound ?? card.ExpiresAfterRound;
		const usedAtRound = card.usedAtRound ?? card.UsedAtRound;
		const resolvedAtRound = card.resolvedAtRound ?? card.ResolvedAtRound;
		const resultLabel = result !== 'none' ? scenarioUiText(result) : '';
		const timing = expiresAfterRound && canUse
			? scenarioUiText('validUntil').replace('{round}', expiresAfterRound)
			: usedAtRound
				? scenarioUiText('usedRound').replace('{round}', usedAtRound)
				: resolvedAtRound
					? scenarioUiText('resolvedRound').replace('{round}', resolvedAtRound)
					: '';
		return `<article class="my-special-card event-special-card special-card-shell variant-secret state-${escapeHtml(status)}" data-event-card-id="${escapeHtml(card.definitionId || card.DefinitionId || '')}" data-event-card-status="${escapeHtml(status)}">
			<header class="special-card-header"><div class="special-card-heading"><span class="special-card-category">${escapeHtml(scenarioUiText('eventCard'))}</span><h3 class="special-card-title">${escapeHtml(eventCardLocalized(card.title || card.Title))}</h3></div><span class="event-card-status">${escapeHtml(scenarioUiText(status))}</span></header>
			<section class="special-card-effect"><p>${escapeHtml(eventCardLocalized(card.description || card.Description))}</p></section>
			${timing ? `<p class="event-card-timing">${escapeHtml(timing)}</p>` : ''}
			${resultLabel ? `<p class="event-card-result">${escapeHtml(resultLabel)}</p>` : ''}
			${actionMarkup ? `<footer class="special-card-footer">${actionMarkup}</footer>` : ''}
		</article>`;
	}).join('');
}

async function useEventSpecialCard(cardIndex, actionIndex, operation) {
	const cards = myPlayerData?.eventSpecialCards || [];
	const card = cards[cardIndex];
	const action = (card?.availableActions || card?.AvailableActions || card?.actions || card?.Actions || [])[actionIndex];
	if (!card || !action) return;
	const runtimeId = card.runtimeCardId || card.RuntimeCardId;
	const actionId = action.id || action.Id;
	const target = document.getElementById(`eventCardTarget-${cardIndex}-${actionIndex}`)?.value || null;
	const choice = document.getElementById(`eventCardChoice-${cardIndex}-${actionIndex}`)?.value || null;
	const profession = document.getElementById(`eventCardProfession-${cardIndex}-${actionIndex}`)?.value || null;
	const commandId = crypto.randomUUID();
	try {
		if (operation === 'transfer_owned_card')
			await connection.invoke('TransferEventSpecialCard', runtimeId, target, commandId);
		else
			await connection.invoke('UseEventSpecialCard', runtimeId, actionId, target, choice, profession, commandId);
	} catch (error) {
		console.error('Event special card action failed', error);
		addEventMessage(t('unavailableNow'));
	}
}

function buildSpecialCardRows() {
	const publicRows = currentRoundState?.specialCards || [];
	return publicRows
		.filter(row => row && !row.isHidden && ['revealed', 'active', 'used'].includes(row.status))
		.sort((a, b) => (a.seatNumber || 999) - (b.seatNumber || 999));
}

function buildGMSpecialCardRows() {
	return buildSpecialCardRows();
}

function renderSpecialCardRows(rows, compact = false) {
	if (!rows || rows.length === 0) {
		return compact
			? `<p class="special-cards-empty">${t('noRevealedSpecialCards')}</p>`
			: `<tr><td colspan="6" class="special-cards-empty">${t('noRevealedSpecialCards')}</td></tr>`;
	}

	if (compact) {
		return rows.map(row => {
			const status = row.status || 'hidden';
			const seat = row.seatNumber ? `#${row.seatNumber} ` : '';
			const card = normalizeSpecialCardState(row);
			const isStillHidden = card.wasUsedSilently && !card.isPubliclyRevealed;
			const cardName = isStillHidden ? t('hiddenSecretCard') : (getLocalizedValue(row, 'name') || row.cardName || t('specialCard'));
			const target = !card.wasUsedSilently && row.targetPlayerName ? ` -> ${row.targetPlayerName}` : '';
			return `
                    <div class="gm-special-card-row ${status}">
                        <span>${seat}${escapeHtml(row.playerName || t('unknown'))}</span>
                        <strong>${escapeHtml(cardName)}${escapeHtml(target)}</strong>
                        <small>${getSpecialCardStatusLabel(status)}</small>
                    </div>
                `;
		}).join('');
	}

	return rows.map(row => {
		const status = row.status || 'hidden';
		const seat = row.seatNumber ? `#${row.seatNumber}` : '';
		const isMine = isMyPlayerRef(row.connectionId, row.stablePlayerId);
		const card = normalizeSpecialCardState(row);
		const isStillHidden = card.wasUsedSilently && !card.isPubliclyRevealed;
		const cardName = isStillHidden ? t('hiddenSecretCard') : (getLocalizedValue(row, 'name') || row.cardName || t('specialCard'));
		const description = isStillHidden ? t('hiddenDetails') : (getLocalizedValue(row, 'description') || row.description || t('noData'));
		const target = !card.wasUsedSilently && row.targetPlayerName ? escapeHtml(row.targetPlayerName) : '-';
		const privacyLabel = getSpecialCardPrivacyLabel(card);
		const privacyClass = getSpecialCardPrivacyClass(card);

		return `
                <tr class="${isMine ? 'my-special-card-row' : ''}">
                    <td>${escapeHtml(seat)}</td>
                    <td>${escapeHtml(row.playerName || t('unknown'))}${isMine ? ` <span class="my-badge">(${t('you')})</span>` : ''}</td>
                    <td><strong>${escapeHtml(cardName)}</strong><span class="special-card-privacy ${privacyClass}">${privacyLabel}</span></td>
                    <td>${escapeHtml(description)}</td>
                    <td>${target}</td>
                    <td><span class="special-card-status ${status}">${getSpecialCardStatusLabel(status)}</span></td>
                </tr>
            `;
	}).join('');
}
