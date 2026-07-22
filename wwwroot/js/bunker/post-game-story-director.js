(function () {
	'use strict';
	const soundKey = 'bunker.postGameStory.sound';
	const $ = id => document.getElementById(id);
	const get = (v, a, b) => v?.[a] ?? v?.[b];
	const array = value => Array.isArray(value) ? value : [];
	const isCurrentHost = () => typeof isHost !== 'undefined' && !!isHost;
	const isCurrentDeveloper = () => typeof isDeveloper !== 'undefined' && !!isDeveloper;
	let state = null, currentEntry = null, previewFingerprint = null, responseSchema = '', draftSaveTimer = null;
	let revealNodes = [], revealIndex = 0, revealTimer = null, audioContext = null, bound = false;
	let currentDeveloperOperatorVersion = 0;
	let currentDeveloperIsActiveOperator = false;

	function visible(element, show) { if (element) element.hidden = !show; }
	function append(parent, tag, text, css) {
		const node = document.createElement(tag);
		if (css) node.className = css;
		node.textContent = text || '';
		parent.appendChild(node);
		return node;
	}
	function normalize(value) {
		return {
			status: get(value, 'status', 'Status') || 'not_started',
			currentMode: get(value, 'currentMode', 'CurrentMode') || null,
			currentEntryId: get(value, 'currentEntryId', 'CurrentEntryId') || null,
			publishedEntries: array(get(value, 'publishedEntries', 'PublishedEntries')),
			generatedPrompt: get(value, 'generatedPrompt', 'GeneratedPrompt') || '',
			rawResult: get(value, 'rawResult', 'RawResult') || '',
			preview: get(value, 'preview', 'Preview') || null,
			previewFingerprint: get(value, 'previewFingerprint', 'PreviewFingerprint') || null,
			validationErrors: array(get(value, 'validationErrors', 'ValidationErrors')),
			validationWarnings: array(get(value, 'validationWarnings', 'ValidationWarnings'))
		};
	}
	function updateWaiting() {
		const target = $('postGameStoryWaitingText');
		if (!target) return;
		const status = state?.status || 'not_started';
		target.textContent = status === 'preview_ready' ? 'Developer перевіряє отриману історію.'
			: ['prompt_ready', 'awaiting_result'].includes(status) ? 'Developer готує фінальну хроніку бункера.'
				: ['published', 'awaiting_next_choice'].includes(status) ? 'Хост обирає наступний розділ історії…'
					: 'Очікування рішення хоста.';
	}
	function showFinished() {
		hideUi();
	}
	function applyTransition(transition) {
		const phase = transition?.phase || transition?.Phase || 'None';
		if (phase === 'FinalDiscussion' || phase === 'HostDecision' || phase === 'Completed' || phase === 'None') {
			hideUi();
			return;
		}
		if (phase === 'StoryRequested' || phase === 'StoryPreparation') {
			if (isCurrentDeveloper()) {
				if (phase === 'StoryRequested') hideUi();
				return;
			}
			const root = $('postGameStoryRoot'); if (!root) return;
			root.hidden = false;
			visible($('postGameStoryWaiting'), true);
			visible($('postGameStoryWaitingCancel'), isCurrentHost());
			visible($('postGameStoryDirector'), false);
			visible($('postGameStoryPresentation'), false);
			updateWaiting();
		}
	}
	function openDirector() {
		$('postGameStoryRoot').hidden = false;
		visible($('postGameStoryWaiting'), false);
		visible($('postGameStoryPresentation'), false);
		visible($('postGameStoryDirector'), true);
	}
	function feedback(errors, warnings, recoverableError) {
		const box = $('postGameStoryValidation');
		if (box) {
			box.replaceChildren();
			array(errors).forEach(error => {
				const button = append(box, 'button', error);
				button.type = 'button';
				button.addEventListener('click', () => { $('postGameStoryResult')?.focus(); });
			});
			array(warnings).forEach(warning => append(box, 'p', warning));
		}
		visible($('postGameStoryCorrectionPrompt'), array(state?.validationErrors).length > 0 && !!($('postGameStoryResult')?.value));
		visible($('postGameStoryRecovery'), !!recoverableError);
	}
	function updateWorkspaceCounts() {
		const promptLength = $('postGameStoryPrompt')?.value.length || 0;
		const resultLength = $('postGameStoryResult')?.value.length || 0;
		if ($('postGameStoryPromptCount')) $('postGameStoryPromptCount').textContent = `${promptLength} символів · ≈${Math.ceil(promptLength / 4)} tokens`;
		if ($('postGameStoryResultCount')) $('postGameStoryResultCount').textContent = `${resultLength} символів`;
	}
	function renderPreview(entry) {
		const root = $('postGameStoryPreview'), publish = $('postGameStoryPublish');
		if (!root) return;
		root.replaceChildren(); visible(root, !!entry);
		if (publish) publish.disabled = !entry || !previewFingerprint;
		if (!entry) return;
		append(root, 'h3', get(entry, 'title', 'Title'));
		append(root, 'p', get(entry, 'subtitle', 'Subtitle'));
		append(root, 'strong', `${get(entry, 'survivalScore', 'SurvivalScore') ?? 0}% · ${get(entry, 'verdictText', 'VerdictText') || ''}`);
		array(get(entry, 'chapters', 'Chapters')).forEach(chapter => {
			append(root, 'h4', get(chapter, 'title', 'Title'));
			append(root, 'p', get(chapter, 'text', 'Text'));
		});
	}
	function applyState(value, reconnect) {
		state = normalize(value); updateWaiting();
		if (isCurrentDeveloper()) {
			if ($('postGameStoryPrompt')) $('postGameStoryPrompt').value = state.generatedPrompt;
			if ($('postGameStoryResult')) $('postGameStoryResult').value = state.rawResult;
			previewFingerprint = state.previewFingerprint;
			feedback(state.validationErrors, state.validationWarnings);
			renderPreview(state.preview);
			updateWorkspaceCounts();
			if (state.generatedPrompt || state.preview) openDirector();
		}
		const drafting = ['prompt_ready', 'awaiting_result', 'preview_ready'].includes(state.status);
		if (!isCurrentDeveloper() && drafting) {
			$('postGameStoryRoot').hidden = false;
			visible($('postGameStoryPresentation'), false);
			visible($('postGameStoryWaiting'), true);
		}
		const entry = state.publishedEntries.find(x => get(x, 'id', 'Id') === state.currentEntryId) || state.publishedEntries.at(-1);
		if (entry && !drafting && state.status !== 'completed') showPresentation(entry, { reconnect: !!reconnect });
	}
	async function prepare(mode, parentId) {
		if (!isCurrentDeveloper()) return;
		try { await connection.invoke('PreparePostGameStoryPrompt', mode, parentId || state?.currentEntryId || null, crypto.randomUUID()); }
		catch (error) { feedback([localize(error)], [], true); }
	}
	function prepareRequested() {
		const transition = typeof currentPostGameTransition !== 'undefined' ? currentPostGameTransition : null;
		if (state?.generatedPrompt || state?.preview) {
			if (transition?.phase === 'StoryRequested') {
				return connection.invoke('ResumePostGameStoryDraft', crypto.randomUUID())
					.catch(error => feedback([localize(error)], [], true));
			}
			openDirector();
			return undefined;
		}
		return prepare(transition?.requestedStoryMode || state?.currentMode || 'final_story', state?.currentEntryId || null);
	}
	async function submit() {
		try { await connection.invoke('SubmitPostGameStoryResult', $('postGameStoryResult')?.value || '', crypto.randomUUID()); }
		catch (error) { feedback([localize(error)], [], true); }
	}
	async function publish() {
		if (!previewFingerprint || !confirm('Опублікувати історію всім гравцям? Вона може розкрити приховані характеристики.')) return;
		try { await connection.invoke('PublishPostGameStory', previewFingerprint, crypto.randomUUID()); }
		catch (error) { feedback([localize(error)], [], true); }
	}
	async function cancel() {
		try { await connection.invoke('CancelPostGameStoryDraft', crypto.randomUUID()); }
		catch (error) { feedback([localize(error)], [], true); }
	}
	async function schema() {
		if (!responseSchema) responseSchema = await connection.invoke('GetPostGameStoryResponseSchema');
		return responseSchema;
	}
	function download(name, text) {
		const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
		const link = document.createElement('a');
		link.href = url; link.download = name; link.click();
		setTimeout(() => URL.revokeObjectURL(url), 0);
	}

	async function refreshDeveloperAccessState() {
		const projection = await connection.invoke('GetDeveloperAccessState');

		if (typeof applyDeveloperAccessState === 'function') {
			applyDeveloperAccessState(projection);
		}

		return developerState;
	}

	async function savePostGameStoryDraft(rawResult, retryAfterRefresh = true) {
		if (!isCurrentDeveloper()) {
			return;
		}

		if (
			typeof developerState === 'undefined' ||
			!developerState?.isActiveOperator
		) {
			return;
		}

		const operatorVersion = Number(developerState?.operatorVersion ?? 0);

		if (!Number.isSafeInteger(operatorVersion) || operatorVersion < 0) {
			feedback(['Некоректна версія Developer operator.'], [], true);
			return;
		}

		console.log('[StoryDraft Save]', {
			operatorVersion,
			isActiveOperator: developerState?.isActiveOperator
		});

		try {
			const currentServerVersion = await connection.invoke(
				'SavePostGameStoryDraft',
				rawResult ?? '',
				operatorVersion
			);

			const parsedVersion = Number(currentServerVersion);

			if (
				typeof developerState !== 'undefined' &&
				developerState &&
				Number.isSafeInteger(parsedVersion) &&
				parsedVersion >= 0
			) {
				developerState.operatorVersion = parsedVersion;
			};
		} catch (error) {
			const message = String(error?.message ?? error ?? '');

			if (
				retryAfterRefresh &&
				message.includes('developer_operator_stale')
			) {
				console.warn(
					'[StoryDirector] Operator version застаріла. Оновлюємо Developer state.'
				);

				const refreshedState = await refreshDeveloperAccessState();

				if (!refreshedState?.isActiveOperator) {
					feedback(
						['Ця вкладка більше не є активним Developer operator.'],
						[],
						true
					);
					return;
				}

				await savePostGameStoryDraft(rawResult, false);
				return;
			}

			feedback([localize(error)], [], true);
		}
	}
	function scheduleDraftSave() {
		updateWorkspaceCounts();
		previewFingerprint = null;
		renderPreview(null);
		clearTimeout(draftSaveTimer);

		if (!isCurrentDeveloper()) {
			return;
		}

		if (
			typeof developerState === 'undefined' ||
			!developerState?.isActiveOperator
		) {
			return;
		}

		draftSaveTimer = setTimeout(async () => {
			await savePostGameStoryDraft(
				$('postGameStoryResult')?.value ?? ''
			);
		}, 800);
	}
	async function copyCorrectionPrompt() {
		try {
			const errors = array(state?.validationErrors);
			const invalid = $('postGameStoryResult')?.value || state?.rawResult || '';
			const correction = [
				'Виправ структуру JSON. Поверни лише виправлений JSON без Markdown і пояснень.',
				'', 'ПОМИЛКИ ВАЛІДАЦІЇ:', errors.join('\n') || 'Невідома структурна помилка.',
				'', 'ОБОВ’ЯЗКОВА СХЕМА:', await schema(),
				'', 'ПОТОЧНИЙ INVALID JSON:', invalid
			].join('\n');
			await navigator.clipboard.writeText(correction);
			feedback([], ['Prompt для виправлення JSON скопійовано.']);
		} catch (error) {
			feedback([localize(error)], [], true);
		}
	}
	function section(root, title, items) {
		const values = array(items).filter(Boolean); if (!values.length) return;
		const sectionNode = document.createElement('section'); sectionNode.className = 'story-section';
		append(sectionNode, 'h2', title);
		values.forEach(item => {
			const heading = get(item, 'title', 'Title') || get(item, 'playerName', 'PlayerName');
			const text = get(item, 'text', 'Text') || get(item, 'fate', 'Fate') || String(item);
			if (heading) append(sectionNode, 'h3', heading, 'story-reveal');
			append(sectionNode, 'p', text, 'story-reveal');
			const assessment = get(item, 'usefulnessAssessment', 'UsefulnessAssessment');
			if (assessment) append(sectionNode, 'p', assessment, 'story-reveal');
		});
		root.appendChild(sectionNode);
	}
	function showPresentation(entry, options) {
		if (!entry) return;
		currentEntry = entry; stopReveal();
		const content = $('postGameStoryContent'); if (!content) return;
		$('postGameStoryRoot').hidden = false;
		visible($('postGameStoryWaiting'), false); visible($('postGameStoryDirector'), false); visible($('postGameStoryPresentation'), true);
		$('postGameStoryTitle').textContent = get(entry, 'title', 'Title') || '';
		$('postGameStorySubtitle').textContent = get(entry, 'subtitle', 'Subtitle') || '';
		$('postGameStoryScore').textContent = `${get(entry, 'survivalScore', 'SurvivalScore') ?? 0}%`;
		$('postGameStoryVerdict').textContent = get(entry, 'verdictText', 'VerdictText') || '';
		content.replaceChildren();
		section(content, 'Пролог', [{ text: get(entry, 'opening', 'Opening') }]);
		section(content, 'Хроніка', get(entry, 'chapters', 'Chapters'));
		section(content, 'Ті, хто залишилися', get(entry, 'survivorEpilogues', 'SurvivorEpilogues'));
		section(content, 'Долі вибулих', get(entry, 'eliminatedPlayerFates', 'EliminatedPlayerFates'));
		section(content, 'Фінальний підсумок', [{ text: get(entry, 'finalSummary', 'FinalSummary') }]);
		revealNodes = Array.from(content.querySelectorAll('.story-reveal')); revealIndex = 0;
		if (options?.reconnect || matchMedia('(prefers-reduced-motion: reduce)').matches) showAll(); else scheduleReveal();
		document.querySelectorAll('[data-story-mode]').forEach(button => { button.hidden = !isCurrentHost() && !isCurrentDeveloper(); });
		visible($('postGameStoryNewGame'), isCurrentHost()); visible($('postGameStoryReplay'), !isCurrentHost()); updateSound();
	}
	function stopReveal() { if (revealTimer) clearTimeout(revealTimer); revealTimer = null; }
	function scheduleReveal() {
		stopReveal();
		const step = () => {
			if (document.hidden) { revealTimer = setTimeout(step, 300); return; }
			const node = revealNodes[revealIndex++]; if (!node) { updateProgress(); revealTimer = null; return; }
			node.classList.add('is-visible'); tick(); updateProgress();
			revealTimer = setTimeout(step, Math.min(900, Math.max(180, node.textContent.length * 4)));
		}; step();
	}
	function showAll() { stopReveal(); revealNodes.forEach(x => x.classList.add('is-visible')); revealIndex = revealNodes.length; updateProgress(); }
	function updateProgress() { if ($('postGameStoryProgress')) $('postGameStoryProgress').textContent = `${Math.min(revealIndex, revealNodes.length)} / ${revealNodes.length}`; }
	function soundOn() { return localStorage.getItem(soundKey) === 'on'; }
	function updateSound() { if ($('postGameStorySound')) { $('postGameStorySound').textContent = soundOn() ? 'Звук: увімк.' : 'Звук: вимк.'; $('postGameStorySound').setAttribute('aria-pressed', String(soundOn())); } }
	async function toggleSound() {
		const enable = !soundOn();
		localStorage.setItem(soundKey, enable ? 'on' : 'off');
		updateSound();
		if (!enable) return;
		try {
			audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
			if (audioContext.state === 'suspended') await audioContext.resume();
		} catch (_) { }
	}
	function tick() {
		if (!soundOn() || document.hidden) return;
		try {
			audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state !== 'running') return;
			const osc = audioContext.createOscillator(), gain = audioContext.createGain(); osc.frequency.value = 760;
			gain.gain.setValueAtTime(.018, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + .025);
			osc.connect(gain).connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + .03);
		} catch (_) { }
	}
	async function close() {
		stopReveal();
		if (isCurrentDeveloper()) {
			try { await connection.invoke('FinishPostGameStory', crypto.randomUUID()); } catch (_) { }
			$('postGameStoryRoot').hidden = true;
		} else { hideUi(); }
	}
	function hideUi() { stopReveal(); if ($('postGameStoryRoot')) $('postGameStoryRoot').hidden = true; }
	function clear() { state = currentEntry = previewFingerprint = null; stopReveal(); if ($('postGameStoryRoot')) $('postGameStoryRoot').hidden = true; if ($('postGameStoryResult')) $('postGameStoryResult').value = ''; }
	function localize(error) { const message = error?.message || String(error || 'post_game_story_failed'); return typeof localizeServerMessage === 'function' ? localizeServerMessage(message) : message; }
	function bind(hub) {
		if (bound || !hub) return; bound = true;
		hub.off('PostGameStoryStateChanged'); hub.on('PostGameStoryStateChanged', value => applyState(value, false));
		hub.off('PostGameStoryDeveloperStateChanged'); hub.on('PostGameStoryDeveloperStateChanged', value => applyState(value, false));
		hub.off('PostGameStoryPublished'); hub.on('PostGameStoryPublished', payload => {
			state = normalize(get(payload, 'state', 'State'));
			applyTransition(get(payload, 'transition', 'Transition'));
			showPresentation(get(payload, 'entry', 'Entry'), {});
		});
		hub.off('PostGameStoryCleared'); hub.on('PostGameStoryCleared', value => applyState(value, false));
	}
	$('postGameStoryCopyPrompt')?.addEventListener('click', async () => { try { await navigator.clipboard.writeText($('postGameStoryPrompt')?.value || ''); feedback([], ['Промт скопійовано.']); } catch (_) { feedback(['Не вдалося скопіювати промт.']); } });
	$('postGameStoryDownloadPrompt')?.addEventListener('click', () => download(`bunker-story-prompt-${Date.now()}.txt`, $('postGameStoryPrompt')?.value || ''));
	$('postGameStoryCopySchema')?.addEventListener('click', async () => {
		try { await navigator.clipboard.writeText(await schema()); feedback([], ['JSON schema скопійовано.']); }
		catch (error) { feedback([localize(error)], [], true); }
	});
	$('postGameStoryPasteResult')?.addEventListener('click', async () => {
		try { $('postGameStoryResult').value = await navigator.clipboard.readText(); scheduleDraftSave(); }
		catch (_) { feedback(['Браузер не дозволив читання буфера обміну.']); }
	});
	$('postGameStoryClearResult')?.addEventListener('click', () => {
		if (!confirm('Очистити приватний draft JSON?')) return;
		$('postGameStoryResult').value = '';
		if (state) { state.rawResult = ''; state.validationErrors = []; state.validationWarnings = []; }
		feedback([]); scheduleDraftSave();
	});
	$('postGameStoryCorrectionPrompt')?.addEventListener('click', copyCorrectionPrompt);
	$('postGameStoryResult')?.addEventListener('input', scheduleDraftSave);
	$('postGameStoryRetry')?.addEventListener('click', prepareRequested);
	$('postGameStoryRecoverUi')?.addEventListener('click', () => { if (typeof recoverDeveloperUi === 'function') recoverDeveloperUi(); else hideUi(); });
	$('postGameStoryValidate')?.addEventListener('click', submit); $('postGameStoryPublish')?.addEventListener('click', publish); $('postGameStoryCancel')?.addEventListener('click', cancel);
	$('postGameStoryBack')?.addEventListener('click', () => visible($('postGameStoryPreview'), false)); $('postGameStoryShowAll')?.addEventListener('click', showAll);
	$('postGameStorySound')?.addEventListener('click', toggleSound); $('postGameStoryClose')?.addEventListener('click', close);
	$('postGameStoryWaitingCancel')?.addEventListener('click', () => {
		if (typeof cancelPostGameStoryRequest === 'function') cancelPostGameStoryRequest();
	});
	$('postGameStoryReplay')?.addEventListener('click', () => showPresentation(currentEntry, {})); $('postGameStoryNewGame')?.addEventListener('click', () => returnFinishedGameToLobby());
	document.querySelectorAll('[data-story-mode]').forEach(button => button.addEventListener('click', () => {
		if (typeof requestPostGameStoryMode === 'function') requestPostGameStoryMode(button.dataset.storyMode, get(currentEntry, 'id', 'Id'));
	}));
	document.addEventListener('visibilitychange', () => { if (!document.hidden && !revealTimer && revealIndex < revealNodes.length) scheduleReveal(); });
	window.PostGameStoryDirector = { bind, prepare, prepareRequested, applyState, applyTransition, showFinished, showPresentation, showAll, hideUi, clear };
	updateWorkspaceCounts();
	if (typeof connection !== 'undefined') bind(connection);
	if (typeof currentGameCompletion !== 'undefined' && currentGameCompletion) showFinished();
})();
