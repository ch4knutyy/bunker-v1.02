// ==================== APOCALYPSE EFFECTS RUNTIME ====================

function ensureApocalypseAmbientRoot() {
	let ambient = document.getElementById('apocalypseAmbientRoot');
	if (!ambient) {
		ambient = document.createElement('div');
		ambient.id = 'apocalypseAmbientRoot';
		ambient.className = 'apocalypse-ambient-root';
		ambient.setAttribute('aria-hidden', 'true');
		ambient.inert = true;
		document.body?.prepend(ambient);
	}
	for (const layer of ['primary', 'secondary', 'edge-back', 'edge-front', 'vignette']) {
		if (ambient.querySelector(`.apocalypse-ambient-layer-${layer}`)) continue;
		const element = document.createElement('div');
		element.className = `apocalypse-ambient-layer apocalypse-ambient-layer-${layer}`;
		ambient.append(element);
	}
	return ambient;
}

function getApocalypseEffectsLevel() {
	let value = 'atmospheric';
	try { value = localStorage.getItem(apocalypseEffectsPreferenceKey) || value; } catch (_) { }
	return apocalypseEffectsLevels.includes(value) ? value : 'atmospheric';
}

function setApocalypseEffectsLevel(level) {
	const normalized = apocalypseEffectsLevels.includes(level) ? level : 'atmospheric';
	try { localStorage.setItem(apocalypseEffectsPreferenceKey, normalized); } catch (_) { }
	if (document.body) document.body.dataset.apocalypseEffectsLevel = normalized;
	if (normalized === 'off') {
		clearApocalypseCategoryVisualState();
		clearApocalypseVisualReactions();
		stopApocalypseAmbientScheduler();
		resetApocalypseParallax();
	} else {
		syncApocalypseCategoryVisualState(currentApocalypse);
		startApocalypseAmbientScheduler();
	}
	return normalized;
}

function syncApocalypseEffectsPreference() {
	return setApocalypseEffectsLevel(getApocalypseEffectsLevel());
}

function clearApocalypseVisualReactions() {
	const root = document.body;
	for (const timer of apocalypseReactionTimers.values()) window.clearTimeout(timer);
	apocalypseReactionTimers.clear();
	if (!root) return;
	for (const type of apocalypseVisualReactionTypes) root.classList.remove(`apocalypse-reaction-${type}`);
}

function triggerApocalypseVisualReaction(type, options = {}) {
	if (!apocalypseVisualReactionTypes.includes(type) || getApocalypseEffectsLevel() === 'off') return false;
	const root = document.body;
	if (!root?.classList.contains('apocalypse-theme-active')) return false;
	const className = `apocalypse-reaction-${type}`;
	const existing = apocalypseReactionTimers.get(type);
	if (existing) window.clearTimeout(existing);
	root.classList.remove(className);
	void root.offsetWidth;
	root.classList.add(className);
	const duration = Math.max(180, Math.min(1400, Number(options.duration) || (type === 'apocalypse-reveal' ? 900 : 620)));
	apocalypseReactionTimers.set(type, window.setTimeout(() => {
		root.classList.remove(className);
		apocalypseReactionTimers.delete(type);
	}, duration));
	return true;
}

function canRunApocalypseEnvironmentalEffects() {
	const root = document.body;
	const theme = root?.dataset.apocalypseTheme;
	return Boolean(root?.classList.contains('apocalypse-theme-active') &&
		apocalypseAmbientEventsByTheme[theme] && getApocalypseEffectsLevel() !== 'off' &&
		!document.hidden && !prefersReducedApocalypseMotion());
}

function getApocalypseCategoryRegistry() {
	return window.ApocalypseCategoryVisualRegistry?.registry || null;
}

function resolveApocalypseCategoryProfile(apocalypse) {
	const registry = getApocalypseCategoryRegistry();
	if (!apocalypse || !registry) return null;
	const categories = new Map(registry.categoryPackages.map(item => [item.categoryId, item]));
	const modifiers = new Map(registry.modifierCatalog.map(item => [item.id, item]));
	const id = String(apocalypse.id ?? apocalypse.Id ?? '').trim();
	const registered = window.ApocalypseCategoryVisualRegistry?.getApocalypseVisualMetadata?.(id);
	const categoryId = String(apocalypse.categoryId ?? apocalypse.CategoryId ?? registered?.categoryId ?? '').trim().toLowerCase();
	const category = categories.get(categoryId);
	if (!category) return null;
	const rawModifiers = apocalypse.visualModifierIds ?? apocalypse.VisualModifierIds ?? registered?.visualModifierIds ?? [];
	const maximum = getApocalypseEffectsLevel() === 'subtle' || window.matchMedia?.('(max-width: 768px)')?.matches === true
		? 1
		: Math.min(3, Number(registry.maxModifiers) || 3);
	const candidates = [...new Set(Array.isArray(rawModifiers) ? rawModifiers.map(value => String(value).trim().toLowerCase()) : [])].filter(value => modifiers.has(value));
	const modifierIds = registry.priorityGroups.map(group => {
		const priority = apocalypseModifierGroupPriority[group] || [];
		return candidates.filter(id => modifiers.get(id)?.group === group).sort((left, right) => priority.indexOf(left) - priority.indexOf(right))[0];
	}).filter(Boolean).slice(0, maximum);
	return { apocalypseId: id, categoryId, category, modifierIds, modifiers };
}

function getApocalypseCategoryEventPools() {
	if (!activeApocalypseCategoryProfile) {
		const fallback = apocalypseAmbientEventsByTheme[document.body?.dataset.apocalypseTheme] || [];
		return { category: [...fallback], modifier: [], all: [...fallback] };
	}
	const suppressed = new Set(activeApocalypseCategoryProfile.modifierIds.flatMap(id => apocalypseModifierEventSuppressions[id] || []));
	const category = [...new Set((activeApocalypseCategoryProfile.category.baseEvents || []).map(normalizeApocalypseCategoryToken).filter(value => value && !suppressed.has(value)))];
	const modifier = [...new Set(activeApocalypseCategoryProfile.modifierIds
		.flatMap(id => activeApocalypseCategoryProfile.modifiers.get(id)?.eventPool || [])
		.map(normalizeApocalypseCategoryToken).filter(value => value && !suppressed.has(value)))];
	return { category, modifier, all: [...new Set([...category, ...modifier])] };
}

function clearApocalypseCategoryVisualState() {
	const registry = getApocalypseCategoryRegistry();
	const ambient = document.getElementById('apocalypseAmbientRoot');
	for (const item of registry?.modifierCatalog || []) {
		document.body?.classList.remove(item.cssClass);
		ambient?.classList.remove(item.cssClass);
	}
	ambient?.removeAttribute('data-apocalypse-package');
	activeApocalypseCategoryProfile = null;
	lastApocalypseAmbientEventType = '';
}

function syncApocalypseCategoryVisualState(apocalypse) {
	clearApocalypseAmbientEvent();
	clearApocalypseCategoryVisualState();
	const profile = resolveApocalypseCategoryProfile(apocalypse);
	if (!profile) return null;
	activeApocalypseCategoryProfile = profile;
	if (getApocalypseEffectsLevel() === 'off' || !document.body?.classList.contains('apocalypse-theme-active')) return profile;
	const ambient = ensureApocalypseAmbientRoot();
	ambient.dataset.apocalypsePackage = normalizeApocalypseCategoryToken(profile.category.packageId);
	for (const id of profile.modifierIds) {
		const className = profile.modifiers.get(id)?.cssClass;
		if (!className) continue;
		document.body.classList.add(className);
		ambient.classList.add(className);
	}
	return profile;
}

function clearApocalypseAmbientEvent() {
	if (apocalypseAmbientEventTimer) window.clearTimeout(apocalypseAmbientEventTimer);
	apocalypseAmbientEventTimer = null;
	const ambient = document.getElementById('apocalypseAmbientRoot');
	if (!ambient) return;
	const registry = getApocalypseCategoryRegistry();
	const registeredTypes = [
		...(registry?.categoryPackages || []).flatMap(item => item.baseEvents || []),
		...(registry?.modifierCatalog || []).flatMap(item => item.eventPool || [])
	].map(normalizeApocalypseCategoryToken);
	for (const type of new Set([...apocalypseAmbientEventTypes, ...registeredTypes])) ambient.classList.remove(`apoc-event-${type}`);
}

function triggerApocalypseAmbientEvent(preferredType = '') {
	if (!canRunApocalypseEnvironmentalEffects()) return false;
	const ambient = ensureApocalypseAmbientRoot();
	const pools = getApocalypseCategoryEventPools();
	const normalizedPreferred = normalizeApocalypseCategoryToken(preferredType);
	let type = pools.all.includes(normalizedPreferred) ? normalizedPreferred : '';
	if (!type) {
		const categoryPercent = Number(getApocalypseCategoryRegistry()?.eventWeights?.categoryBasePercent ?? 65);
		const useModifier = pools.modifier.length > 0 && Math.random() * 100 >= categoryPercent;
		let selectedPool = useModifier ? pools.modifier : pools.category;
		if (!selectedPool.length) selectedPool = pools.all;
		if (selectedPool.length > 1 && lastApocalypseAmbientEventType)
			selectedPool = selectedPool.filter(value => value !== lastApocalypseAmbientEventType);
		type = selectedPool[Math.floor(Math.random() * selectedPool.length)] || '';
	}
	if (!type) return false;
	lastApocalypseAmbientEventType = type;
	clearApocalypseAmbientEvent();
	const className = `apoc-event-${type}`;
	ambient.classList.add(className);
	const duration = getApocalypseEffectsLevel() === 'subtle' ? 900 : 1600;
	apocalypseAmbientEventTimer = window.setTimeout(() => {
		ambient.classList.remove(className);
		apocalypseAmbientEventTimer = null;
	}, duration);
	return true;
}

function startApocalypseAmbientScheduler() {
	if (apocalypseAmbientSchedulerTimer || !canRunApocalypseEnvironmentalEffects()) return false;
	const delay = 20000 + Math.floor(Math.random() * 20001);
	apocalypseAmbientSchedulerTimer = window.setTimeout(() => {
		apocalypseAmbientSchedulerTimer = null;
		triggerApocalypseAmbientEvent();
		startApocalypseAmbientScheduler();
	}, delay);
	return true;
}

function stopApocalypseAmbientScheduler() {
	if (apocalypseAmbientSchedulerTimer) window.clearTimeout(apocalypseAmbientSchedulerTimer);
	apocalypseAmbientSchedulerTimer = null;
	clearApocalypseAmbientEvent();
}

function resetApocalypseParallax() {
	if (apocalypseParallaxTimer) window.clearTimeout(apocalypseParallaxTimer);
	apocalypseParallaxTimer = null;
	apocalypsePendingPointer = null;
	const ambient = document.getElementById('apocalypseAmbientRoot');
	for (const variable of ['--apoc-parallax-x', '--apoc-parallax-y', '--apoc-parallax-x-far', '--apoc-parallax-y-far', '--apoc-parallax-x-mid', '--apoc-parallax-y-mid', '--apoc-parallax-scroll'])
		ambient?.style.removeProperty(variable);
}

function flushApocalypseParallax() {
	apocalypseParallaxTimer = null;
	const ambient = document.getElementById('apocalypseAmbientRoot');
	const mobile = window.matchMedia?.('(max-width: 768px)')?.matches === true;
	if (!ambient || !canRunApocalypseEnvironmentalEffects() || mobile) {
		resetApocalypseParallax();
		return;
	}
	if (apocalypsePendingPointer) {
		const x = ((apocalypsePendingPointer.x / Math.max(window.innerWidth, 1)) - .5) * 2;
		const y = ((apocalypsePendingPointer.y / Math.max(window.innerHeight, 1)) - .5) * 2;
		const clampedX = Math.max(-1, Math.min(1, x));
		const clampedY = Math.max(-1, Math.min(1, y));
		ambient.style.setProperty('--apoc-parallax-x', `${(clampedX * 4).toFixed(2)}px`);
		ambient.style.setProperty('--apoc-parallax-y', `${(clampedY * 4).toFixed(2)}px`);
		ambient.style.setProperty('--apoc-parallax-x-mid', `${(clampedX * 2.7).toFixed(2)}px`);
		ambient.style.setProperty('--apoc-parallax-y-mid', `${(clampedY * 2.7).toFixed(2)}px`);
		ambient.style.setProperty('--apoc-parallax-x-far', `${(clampedX * 1.4).toFixed(2)}px`);
		ambient.style.setProperty('--apoc-parallax-y-far', `${(clampedY * 1.4).toFixed(2)}px`);
	}
	ambient.style.setProperty('--apoc-parallax-scroll', `${Math.max(-6, Math.min(6, window.scrollY * .008)).toFixed(2)}px`);
}

function queueApocalypseParallaxUpdate(event) {
	if (event?.clientX != null) apocalypsePendingPointer = { x: event.clientX, y: event.clientY };
	if (apocalypseParallaxTimer) return;
	apocalypseParallaxTimer = window.setTimeout(flushApocalypseParallax, 48);
}

function initApocalypseParallaxManager() {
	if (apocalypseParallaxInitialized) return;
	apocalypseParallaxInitialized = true;
	document.addEventListener('pointermove', queueApocalypseParallaxUpdate, { passive: true });
	window.addEventListener('scroll', queueApocalypseParallaxUpdate, { passive: true });
	window.addEventListener('resize', queueApocalypseParallaxUpdate, { passive: true });
}

function clearApocalypseCardRevealWave(options = {}) {
	if (apocalypseCardRevealTimer) window.clearTimeout(apocalypseCardRevealTimer);
	apocalypseCardRevealTimer = null;
	document.querySelectorAll?.('.apocalypse-scenario-shell.apoc-card-reveal-wave')
		.forEach(card => card.classList.remove('apoc-card-reveal-wave'));
	if (options.resetKey) lastApocalypseCardRevealKey = '';
}

function triggerApocalypseCardRevealWave(apocalypse) {
	if (!apocalypse) return false;
	const id = String(apocalypse.id ?? apocalypse.Id ?? '').trim();
	const revealKey = id || `${resolveApocalypseVisualTheme(apocalypse)}:${String(apocalypse.categoryId ?? apocalypse.CategoryId ?? '')}`;
	if (!revealKey || revealKey === lastApocalypseCardRevealKey) return false;
	lastApocalypseCardRevealKey = revealKey;
	if (getApocalypseEffectsLevel() === 'off' || prefersReducedApocalypseMotion()) return false;
	const card = document.querySelector('.apocalypse-scenario-shell');
	if (!card) return false;
	clearApocalypseCardRevealWave();
	card.classList.add('apoc-card-reveal-wave');
	apocalypseCardRevealTimer = window.setTimeout(() => {
		card.classList.remove('apoc-card-reveal-wave');
		apocalypseCardRevealTimer = null;
	}, 1100);
	return true;
}

function syncDocumentVisibilityEffects() {
	document.body?.classList.toggle('apocalypse-ambient-paused', document.hidden);
	if (document.hidden) {
		stopApocalypseAmbientScheduler();
		resetApocalypseParallax();
	} else {
		startApocalypseAmbientScheduler();
	}
}
