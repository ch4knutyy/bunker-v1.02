// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function hideApocalypseEffectBanner() {
	const banner = document.getElementById('apocalypseEffectBanner');
	if (banner) banner.hidden = true;
	if (apocalypseEffectBannerTimer) clearTimeout(apocalypseEffectBannerTimer);
	apocalypseEffectBannerTimer = null;
}

function showApocalypseEffectBanner(data) {
	const banner = document.getElementById('apocalypseEffectBanner');
	const title = document.getElementById('apocalypseEffectBannerTitle');
	const message = document.getElementById('apocalypseEffectBannerMessage');
	const changes = document.getElementById('apocalypseEffectPersonalChanges');
	if (!banner || !title || !message || !changes) return;
	const activationId = String(data?.activationId ?? data?.ActivationId ?? '');
	if (activationId && banner.dataset.lastActivationId === activationId) return false;

	const failed = String(data?.result ?? data?.Result ?? '').toLowerCase() === 'failed';
	const summaryKey = apocalypseEffectSummaryKey(data?.summaryCode ?? data?.SummaryCode, failed);
	const localizedMessage = t(summaryKey);
	title.textContent = t(failed ? 'apocalypseEffectFailureTitle' : 'apocalypseEffectTitle');
	message.textContent = localizedMessage;
	changes.replaceChildren();
	banner.dataset.activationId = activationId;
	banner.dataset.lastActivationId = activationId;
	banner.hidden = false;
	document.getElementById('apocalypseEffectBannerDismiss')?.addEventListener('click', hideApocalypseEffectBanner, { once: true });
	addEventMessage(escapeHtml(localizedMessage));
	if (apocalypseEffectBannerTimer) clearTimeout(apocalypseEffectBannerTimer);
	apocalypseEffectBannerTimer = setTimeout(hideApocalypseEffectBanner, 9000);
	return true;
}

function showApocalypseEffectPersonalChanges(data) {
	const banner = document.getElementById('apocalypseEffectBanner');
	const list = document.getElementById('apocalypseEffectPersonalChanges');
	const activationId = String(data?.activationId ?? data?.ActivationId ?? '');
	if (!banner || !list || banner.hidden || banner.dataset.activationId !== activationId) return;
	const changes = data?.changes ?? data?.Changes ?? [];
	list.replaceChildren(...changes.map(change => {
		const item = document.createElement('li');
		const field = String(change?.field ?? change?.Field ?? '');
		const after = String(change?.after ?? change?.After ?? '');
		item.textContent = `${field}: ${after}`;
		return item;
	}));
}

function syncPublicGameSettings(payload) {
	const source = payload?.gameSettings ?? payload?.GameSettings;
	if (!source) return currentPublicGameSettings;
	const rawActivation = source.apocalypseActivation ?? source.ApocalypseActivation;
	currentPublicGameSettings = {
		apocalypseThemeEnabled: Boolean(source.apocalypseThemeEnabled ?? source.ApocalypseThemeEnabled ?? true),
		apocalypseActivation: rawActivation == null ? null : {
			effectsEnabled: Boolean(rawActivation.effectsEnabled ?? rawActivation.EffectsEnabled),
			scheduleMode: String(rawActivation.scheduleMode ?? rawActivation.ScheduleMode ?? ''),
			trigger: String(rawActivation.trigger ?? rawActivation.Trigger ?? ''),
			firstRound: Number(rawActivation.firstRound ?? rawActivation.FirstRound ?? 1),
			intervalRounds: rawActivation.intervalRounds ?? rawActivation.IntervalRounds ?? null,
			maxActivations: rawActivation.maxActivations ?? rawActivation.MaxActivations ?? null
		}
	};
	return currentPublicGameSettings;
}

function renderApocalypse(apocalypse) {
	const container = document.getElementById('apocalypseContent');
	const panel = document.getElementById('apocalypsePanel');
	const enabled = isLobbyConfiguredSystemEnabled('apocalypseEnabled');
	if (panel) { panel.hidden = !enabled; panel.style.display = enabled ? '' : 'none'; }
	if (!apocalypse || !enabled) {
		if (container) container.innerHTML = '';
		clearApocalypseVisualReactions();
		stopApocalypseAmbientScheduler();
		clearApocalypseCardRevealWave({ resetKey: true });
		resetApocalypseParallax();
		clearApocalypseVisualTheme();
		clearApocalypseCategoryVisualState();
		updateScenarioSectionVisibility();
		return;
	}
	if (!container) {
		syncApocalypseVisualTheme(apocalypse);
		syncApocalypseCategoryVisualState(apocalypse);
		startApocalypseAmbientScheduler();
		return;
	}
	const nextTheme = resolveApocalypseVisualTheme(apocalypse);
	if (document.body?.dataset.apocalypseTheme && document.body.dataset.apocalypseTheme !== nextTheme)
		clearApocalypseVisualReactions();
	ensureApocalypseAmbientRoot();
	clearApocalypseCardRevealWave();
	container.innerHTML = renderApocalypseScenario(buildApocalypseScenarioModel(apocalypse));
	syncApocalypseVisualTheme(apocalypse);
	syncApocalypseCategoryVisualState(apocalypse);
	renderApocalypseCategoryBadge(apocalypse);
	startApocalypseAmbientScheduler();
	updateScenarioSectionVisibility();
}
