// Extracted from wwwroot/js/game.js.
// Classic-script globals are intentional; do not convert to ES modules without a separate migration.

function normalizeThreatState(source) {
	if (!source) return null;
	const volunteer = source.volunteerSelection || source.VolunteerSelection || {};
	const support = source.secretSupportDrop || source.SecretSupportDrop || {};
	const contributions = source.contributions || source.Contributions || {};
	const vote = source.threatVolunteerVote || source.ThreatVolunteerVote || {};
	const resolution = source.resolution || source.Resolution || {};
	const scaling = source.scaling || source.Scaling || {};
	const preview = source.preview || source.Preview || {};
	const participants = source.participants || source.Participants || [];
	const miniGame = source.miniGame || source.MiniGame || {};
	const planChoice = source.planChoice || source.PlanChoice || {};
	const currentQuestion = miniGame.currentQuestion || miniGame.CurrentQuestion || null;
	const operationAggregates = source.operationAggregates || source.OperationAggregates || {};

	return {
		currentThreatId: source.currentThreatId || source.CurrentThreatId || "",
		threatStatus: source.threatStatus || source.ThreatStatus || "hidden",
		threatRevealedRound: source.threatRevealedRound ?? source.ThreatRevealedRound ?? null,
		secretSupportDrop: {
			isCompleted: !!(support.isCompleted ?? support.IsCompleted)
		},
		volunteerSelection: {
			selectedPlayerId: volunteer.selectedPlayerId || volunteer.SelectedPlayerId || "",
			selectedPlayerName: volunteer.selectedPlayerName || volunteer.SelectedPlayerName || "",
			selectionReason: volunteer.selectionReason || volunteer.SelectionReason || "",
			selectedAtRound: volunteer.selectedAtRound ?? volunteer.SelectedAtRound ?? null
		},
		contributions: {
			total: contributions.total ?? contributions.Total ?? 0,
			byType: contributions.byType || contributions.ByType || {},
			mine: contributions.mine || contributions.Mine || [],
			revealedAfterResolution: contributions.revealedAfterResolution || contributions.RevealedAfterResolution || []
		},
		threatVolunteerVote: {
			type: vote.type || vote.Type || "threat_volunteer_vote",
			status: vote.status || vote.Status || "none",
			votedCount: vote.votedCount ?? vote.VotedCount ?? 0,
			totalVoters: vote.totalVoters ?? vote.TotalVoters ?? 0,
			selectedPlayerId: vote.selectedPlayerId || vote.SelectedPlayerId || ""
		},
		resolution: {
			effectsApplied: !!(resolution.effectsApplied ?? resolution.EffectsApplied),
			wasSuccessful: !!(resolution.wasSuccessful ?? resolution.WasSuccessful),
			wasVolunteerProtected: !!(resolution.wasVolunteerProtected ?? resolution.WasVolunteerProtected),
			publicResults: resolution.publicResults || resolution.PublicResults || []
		},
		participants: (participants || []).map(participant => ({
			playerId: participant.playerId || participant.PlayerId || "",
			name: participant.name || participant.Name || t('unknown'),
			isLeader: !!(participant.isLeader ?? participant.IsLeader),
			isForced: !!(participant.isForced ?? participant.IsForced),
			isProtected: !!(participant.isProtected ?? participant.IsProtected)
		})),
		preview: {
			activePlayerCount: preview.activePlayerCount ?? preview.ActivePlayerCount ?? 0,
			participantCount: preview.participantCount ?? preview.ParticipantCount ?? 0,
			minParticipants: preview.minParticipants ?? preview.MinParticipants ?? 0,
			maxParticipants: preview.maxParticipants ?? preview.MaxParticipants ?? 0,
			baseTaskCount: preview.baseTaskCount ?? preview.BaseTaskCount ?? 0,
			playableTaskCount: preview.playableTaskCount ?? preview.PlayableTaskCount ?? 0,
			baseTimeSeconds: preview.baseTimeSeconds ?? preview.BaseTimeSeconds ?? 0,
			timeBonusSeconds: preview.timeBonusSeconds ?? preview.TimeBonusSeconds ?? 0,
			taskTimeSeconds: preview.taskTimeSeconds ?? preview.TaskTimeSeconds ?? 0,
			hintTokens: preview.hintTokens ?? preview.HintTokens ?? 0,
			allowedErrors: preview.allowedErrors ?? preview.AllowedErrors ?? 0,
			requiredTasksForSuccess: preview.requiredTasksForSuccess ?? preview.RequiredTasksForSuccess ?? 0
		},
		scaling: {
			isCalculated: !!(scaling.isCalculated ?? scaling.IsCalculated),
			scalingPlayerCount: scaling.scalingPlayerCount ?? scaling.ScalingPlayerCount ?? 0,
			minParticipants: scaling.minParticipants ?? scaling.MinParticipants ?? 0,
			maxParticipants: scaling.maxParticipants ?? scaling.MaxParticipants ?? 0,
			baseTaskCount: scaling.baseTaskCount ?? scaling.BaseTaskCount ?? 0,
			playableTaskCount: scaling.playableTaskCount ?? scaling.PlayableTaskCount ?? 0,
			baseTimeSeconds: scaling.baseTimeSeconds ?? scaling.BaseTimeSeconds ?? 0,
			timeBonusSeconds: scaling.timeBonusSeconds ?? scaling.TimeBonusSeconds ?? 0,
			taskTimeSeconds: scaling.taskTimeSeconds ?? scaling.TaskTimeSeconds ?? 0,
			hintTokens: scaling.hintTokens ?? scaling.HintTokens ?? 0,
			allowedErrors: scaling.allowedErrors ?? scaling.AllowedErrors ?? 0,
			requiredTasksForSuccess: scaling.requiredTasksForSuccess ?? scaling.RequiredTasksForSuccess ?? 0
		},
		operationAggregates: {
			team: operationAggregates.team || operationAggregates.Team || "0/0",
			professionContributions: operationAggregates.professionContributions ?? operationAggregates.ProfessionContributions ?? 0,
			equipmentContributions: operationAggregates.equipmentContributions ?? operationAggregates.EquipmentContributions ?? 0,
			protectedParticipants: operationAggregates.protectedParticipants ?? operationAggregates.ProtectedParticipants ?? 0,
			hints: operationAggregates.hints ?? operationAggregates.Hints ?? 0,
			status: operationAggregates.status || operationAggregates.Status || ""
		},
		planChoice: {
			selectedPlanId: planChoice.selectedPlanId || planChoice.SelectedPlanId || "",
			isLocked: !!(planChoice.isLocked ?? planChoice.IsLocked),
			outcome: planChoice.outcome || planChoice.Outcome || "",
			resolvedAtRound: planChoice.resolvedAtRound ?? planChoice.ResolvedAtRound ?? null,
			solutionGuide: planChoice.solutionGuide || planChoice.SolutionGuide || null,
			plans: planChoice.plans || planChoice.Plans || []
		},
		miniGame: {
			threatId: miniGame.threatId || miniGame.ThreatId || "",
			status: miniGame.status || miniGame.Status || "not_started",
			leaderPlayerId: miniGame.leaderPlayerId || miniGame.LeaderPlayerId || "",
			currentIndex: miniGame.currentIndex ?? miniGame.CurrentIndex ?? 0,
			totalQuestions: miniGame.totalQuestions ?? miniGame.TotalQuestions ?? 0,
			deadlineUtc: miniGame.deadlineUtc || miniGame.DeadlineUtc || null,
			resultStatus: miniGame.resultStatus || miniGame.ResultStatus || "",
			outcome: miniGame.outcome || miniGame.Outcome || "",
			score: (() => {
				const score = miniGame.score || miniGame.Score || {};
				return {
					correctAnswers: score.correctAnswers ?? score.CorrectAnswers ?? 0,
					wrongAnswers: score.wrongAnswers ?? score.WrongAnswers ?? 0,
					timeouts: score.timeouts ?? score.Timeouts ?? 0,
					completedTasks: score.completedTasks ?? score.CompletedTasks ?? 0,
					requiredForSuccess: score.requiredForSuccess ?? score.RequiredForSuccess ?? 0,
					allowedErrors: score.allowedErrors ?? score.AllowedErrors ?? 0
				};
			})(),
			currentQuestion: currentQuestion ? {
				questionId: currentQuestion.questionId || currentQuestion.QuestionId || "",
				category: currentQuestion.category || currentQuestion.Category || "",
				text: currentQuestion.text || currentQuestion.Text || "",
				options: currentQuestion.options || currentQuestion.Options || [],
				currentIndex: currentQuestion.currentIndex ?? currentQuestion.CurrentIndex ?? 0,
				totalQuestions: currentQuestion.totalQuestions ?? currentQuestion.TotalQuestions ?? 0,
				deadlineUtc: currentQuestion.deadlineUtc || currentQuestion.DeadlineUtc || null,
				hint: currentQuestion.hint || currentQuestion.Hint || ""
			} : null
		}
	};
}

function normalizeThreatMetadataValue(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function resolveThreatVisualVariant(model) {
	const id = normalizeThreatMetadataValue(model?.id);
	if (id === 'radiation_leak') return 'radiation';
	if (id === 'air_filter_failure') return 'air';
	const metadata = [model?.type, model?.category, model?.classification, ...(Array.isArray(model?.tags) ? model.tags : [])]
		.map(normalizeThreatMetadataValue).filter(Boolean).join(' ');
	const rules = [
		['radiation', /radiation|nuclear|radioactive/],
		['air', /(^|_)(air|oxygen|filtration|ventilation)(_|$)|air_system/],
		['fire', /fire|flame|heat|smoke|combust/],
		['flood', /flood|water|pressure|leak|sewage/],
		['structural', /structural|crack|collapse|support|infrastructure/],
		['chemical', /chemical|toxic_gas|acid|reagent/],
		['contamination', /contamination|hazard|poison|waste|toxic/],
		['medical', /medical|health|injury|hospital/],
		['biological', /biological|biohazard|infection|virus|bacteria|fungal|parasite/],
		['security', /security|breach|intruder|attack|lockdown|access/],
		['power', /power|generator|electric|battery|grid|energy/],
		['environmental', /environmental|weather|storm|climate|temperature|cold|wind/],
		['anomaly', /anomaly|unknown_signal|distortion|paranormal|reality/]
	];
	return rules.find(([, pattern]) => pattern.test(metadata))?.[0] || 'generic';
}

function resolveThreatSeverity(value) {
	const normalized = normalizeThreatMetadataValue(value);
	const groups = [
		['low', 'low', /^(low|minor|низький|низкая|низкий)$/],
		['medium', 'warning', /^(medium|moderate|середній|середня|средний|средняя)$/],
		['high', 'severe', /^(high|severe|високий|висока|высокий|высокая)$/],
		['veryHigh', 'severe-dark', /^(very_high|veryhigh|дуже_високий|дуже_висока|очень_высокий|очень_высокая)$/],
		['critical', 'critical', /^(critical|extreme|критичний|критична|критический|критическая)$/]
	];
	const match = groups.find(([, , pattern]) => pattern.test(normalized));
	return match ? { key: match[0], semantic: match[1] } : { key: 'unknown', semantic: 'neutral' };
}

function getThreatSeverityLabel(key) {
	return t({ low: 'threatSeverityLow', medium: 'threatSeverityMedium', high: 'threatSeverityHigh', veryHigh: 'threatSeverityVeryHigh', critical: 'threatSeverityCritical' }[key] || 'threatSeverityUnknown');
}

function resolveThreatStatusPresentation(status) {
	const normalized = normalizeThreatMetadataValue(status);
	if (['active', 'mini_game_active', 'minigameactive'].includes(normalized)) return { semantic: 'running', label: t('threatStatusActive') };
	if (['preparing', 'ready', 'not_started', 'notstarted', 'collecting_contributions', 'collectingcontributions', 'revealed', 'pending'].includes(normalized)) return { semantic: 'pending', label: t('threatStatusPending') };
	if (['resolved_safely', 'resolvedsafely', 'success', 'completed'].includes(normalized)) return { semantic: 'success', label: t('threatStatusSuccess') };
	if (['resolved_with_casualty', 'resolvedwithcasualty'].includes(normalized)) return { semantic: 'consequence', label: t('threatStatusConsequences') };
	if (['timeout', 'timed_out', 'timedout', 'expired'].includes(normalized)) return { semantic: 'failure', label: t('threatStatusTimeout') };
	if (['failed', 'failure'].includes(normalized)) return { semantic: 'failure', label: t('threatStatusFailure') };
	if (['aborted', 'cancelled', 'canceled'].includes(normalized)) return { semantic: 'cancelled', label: t('threatStatusCancelled') };
	return { semantic: 'neutral', label: t('threatStatusUnknown') };
}

function buildThreatScenarioModel(source, isRevealed) {
	if (!isRevealed || !source) return { isRevealed: false };
	const id = source.id || source.Id || currentThreatState?.currentThreatId || '';
	const normalizedId = String(id).toLowerCase();
	const stateStatus = normalizedId === 'radiation_leak'
		? getRadiationOperationStatus(currentThreatState)
		: currentThreatState?.threatStatus || 'revealed';
	const tags = source.tags || source.Tags || [];
	const recommendations = getLocalizedArray(source, 'recommendations');
	const model = {
		id,
		type: source.type || source.Type || source.category || source.Category || '',
		name: getLocalizedValue(source, 'name') || t('unknown'),
		shortDescription: getLocalizedByFields(source, ['shortDescription', 'summary', 'description']),
		description: getLocalizedValue(source, 'description'),
		severity: source.severity || source.Severity || '',
		status: stateStatus,
		isRevealed: true,
		isInteractive: normalizedId === 'radiation_leak' || normalizedId === 'air_filter_failure' || !!currentThreatState?.planChoice?.plans?.length,
		imageUrl: normalizeLocalScenarioImageUrl(source.imageUrl || source.ImageUrl || source.uploadedImagePath || source.UploadedImagePath || source.imagePath || source.ImagePath),
		tags: Array.isArray(tags) ? tags : [],
		consequences: getLocalizedArray(source, 'consequences'),
		recommendations: recommendations.length ? recommendations : getLocalizedArray(source, 'requirements'),
		visualVariant: '',
		interactiveState: currentThreatState
	};
	model.visualVariant = resolveThreatVisualVariant(model);
	return model;
}

function renderThreatIcon(variant) {
	return threatIconSvgRegistry[variant] || threatIconSvgRegistry.generic;
}

function renderHiddenThreatScenario() {
	return `<article class="scenario-immersive-shell threat-scenario-shell is-sealed" aria-labelledby="threat-hidden-title">
		<div class="threat-sealed-icon" aria-hidden="true"><svg viewBox="0 0 64 64"><rect x="13" y="28" width="38" height="28" rx="5" fill="none" stroke="currentColor" stroke-width="4"/><path d="M21 28v-8c0-8 4-13 11-13s11 5 11 13v8M32 38v8" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg></div>
		<div class="threat-sealed-copy"><span class="threat-badge">${escapeHtml(t('threat'))}</span><h4 id="threat-hidden-title" class="threat-title">${escapeHtml(t('unknown'))}</h4><p class="threat-description">${escapeHtml(t('threatUnknownDescription'))}</p></div>
	</article>`;
}

function renderThreatContentSection(kind, title, items) {
	if (!Array.isArray(items) || !items.length) return '';
	return `<section class="threat-content-card content-${kind}" aria-labelledby="threat-${kind}-title"><h5 id="threat-${kind}-title">${escapeHtml(title)}</h5><ul>${items.map(item => `<li><span aria-hidden="true"></span><span>${escapeHtml(item)}</span></li>`).join('')}</ul></section>`;
}

function renderThreatScenario(model) {
	if (!model?.isRevealed) return renderHiddenThreatScenario();
	const variant = threatIconSvgRegistry[model.visualVariant] ? model.visualVariant : resolveThreatVisualVariant(model);
	const severity = resolveThreatSeverity(model.severity);
	const status = resolveThreatStatusPresentation(model.status);
	const media = model.imageUrl ? `<div class="threat-hero-media" aria-hidden="true"><img class="threat-hero-image" src="${escapeHtml(model.imageUrl)}" alt="" loading="eager" onerror="handleThreatHeroImageError(this)"></div>` : '';
	const detailDescription = model.description && model.description !== model.shortDescription
		? `<section class="threat-content-card content-description" aria-labelledby="threat-description-title"><h5 id="threat-description-title">${escapeHtml(t('threatWhatHappens'))}</h5><p>${escapeHtml(model.description)}</p></section>` : '';
	const interactive = model.isInteractive ? renderThreatInteractionPanel(model) : '';
	const footerControls = developerFeatureEnabled('scenarioImages') ? `<input type="file" id="threatImageInput" accept="image/*" hidden onchange="uploadThreatImage(this)"><button type="button" class="btn-scenario-image" onclick="document.getElementById('threatImageInput').click()">${escapeHtml(t('uploadImage'))}</button><button type="button" class="btn-scenario-image btn-generate" onclick="generateThreatPrompt()">${escapeHtml(t('generatePrompt'))}</button>${model.imageUrl ? `<button type="button" class="btn-scenario-image" onclick="openCurrentThreatImage()">${escapeHtml(t('threatOpenImage'))}</button><button type="button" class="btn-scenario-image btn-remove" onclick="removeThreatImage()">${escapeHtml(t('remove'))}</button>` : ''}` : '';

	return `<article class="scenario-immersive-shell threat-scenario-shell variant-${variant} severity-${severity.semantic}" aria-labelledby="threat-scenario-title">
		<header class="scenario-immersive-hero threat-hero ${model.imageUrl ? 'has-image' : 'no-image'}">${media}<div class="threat-hero-overlay" aria-hidden="true"></div>
			<div class="threat-medallion" aria-hidden="true"><span>${renderThreatIcon(variant)}</span></div>
			<div class="threat-hero-content"><span class="threat-badge">${escapeHtml(t('threat'))}</span><h4 id="threat-scenario-title" class="threat-title">${escapeHtml(model.name)}</h4>${model.shortDescription ? `<p class="threat-description">${escapeHtml(model.shortDescription)}</p>` : ''}</div>
		</header>
		<section class="threat-status-row" aria-label="${escapeHtml(t('threatIncidentStatus'))}"><div class="threat-status-item"><span>${escapeHtml(t('severity'))}</span><strong>${escapeHtml(getThreatSeverityLabel(severity.key))}</strong></div><div class="threat-status-item status-${status.semantic}"><span>${escapeHtml(t('status'))}</span><strong>${escapeHtml(status.label)}</strong></div>${model.isInteractive ? `<div class="threat-status-item is-interactive"><span>${escapeHtml(t('threatMode'))}</span><strong>${escapeHtml(t('threatActiveOperation'))}</strong></div>` : ''}</section>
		<div class="threat-content-grid">${detailDescription}${renderThreatContentSection('consequences', t('consequences'), model.consequences)}${renderThreatContentSection('recommendations', t('threatRecommendations'), model.recommendations)}</div>
		${interactive ? `<section class="threat-interactive-zone state-${status.semantic}" aria-label="${escapeHtml(t('threatActiveOperation'))}">${interactive}</section>` : ''}
		${footerControls ? `<footer class="threat-footer"><span>${escapeHtml(t('threatIncidentReport'))}</span><div class="threat-footer-actions">${footerControls}</div></footer>` : ''}
	</article>`;
}

function renderThreatPanel(threat) {
	const panel = document.getElementById('threatPanel');
	if (!panel) return;
	const enabled = isLobbyConfiguredSystemEnabled('threatsEnabled');
	const isRevealed = !!currentRoundState?.threatRevealed && !!threat;
	const isPublicThreat = enabled && isRevealed;
	const storySection = document.getElementById('threatGameSection');
	if (!isPublicThreat) {
		panel.hidden = true;
		panel.style.display = 'none';
		panel.classList.remove('threat-unknown');
		panel.replaceChildren();
		if (storySection) storySection.hidden = true;
		updateScenarioSectionVisibility();
		return;
	}

	panel.hidden = false;
	panel.style.display = '';
	if (storySection) storySection.hidden = false;
	let title = panel.querySelector('.threat-panel-title');
	if (!title) {
		title = document.createElement('h3');
		title.className = 'panel-title threat-panel-title';
		title.textContent = `⚠️ ${t('threat')}`;
		panel.append(title);
	}
	let content = panel.querySelector('.panel-content');
	if (!content) {
		content = document.createElement('div');
		content.className = 'panel-content';
		content.id = 'threatContent';
		panel.append(content);
	}
	content.innerHTML = renderThreatScenario(buildThreatScenarioModel(threat, isRevealed));
	panel.classList.remove('threat-unknown');
	updateScenarioSectionVisibility();
}

function handleThreatHeroImageError(image) {
	const hero = image?.closest?.('.threat-hero');
	if (!hero) return;
	hero.classList.remove('has-image');
	hero.classList.add('no-image');
	image.closest('.threat-hero-media')?.remove();
}

function openCurrentThreatImage() {
	const model = buildThreatScenarioModel(currentThreat, !!currentRoundState?.threatRevealed);
	if (model?.imageUrl) openImageModal(model.imageUrl, model.name);
}

function renderThreatInteractionPanel(threat) {
	const threatId = String(threat?.id || currentThreatState?.currentThreatId || '').toLowerCase();
	const interactionState = threat?.interactiveState || currentThreatState;
	if (!interactionState) return '';
	if (threatId === 'air_filter_failure' && interactionState.planChoice?.plans?.length) {
		return renderAirFilterPlanChoice(interactionState);
	}
	if (threatId !== 'radiation_leak') return '';

	const state = interactionState;
	const aggregates = state.operationAggregates || {};
	const status = getRadiationOperationStatus(state);
	const statusLabel = getThreatStatusLabel(status);
	const teamText = buildThreatTeamText(state);
	const equipment = aggregates.equipmentContributions ?? state.contributions?.byType?.personal_inventory ?? 0;

	return `
            <section class="threat-operation-card">
                <div class="threat-operation-card-main">
                    <div>
                        <span class="threat-operation-kicker">${escapeHtml(t('radiationOperation'))}</span>
						<strong>${escapeHtml(threat?.name || t('unknown'))}</strong>
                    </div>
                    <button type="button" class="char-btn public-use" onclick="openThreatOperationModal()">${escapeHtml(t('openOperation'))}</button>
                </div>
                <div class="threat-operation-stats">
                    <span>${escapeHtml(t('team'))}: <strong>${escapeHtml(teamText)}</strong></span>
                    <span>${escapeHtml(t('equipment'))}: <strong>${escapeHtml(equipment)}</strong></span>
                    <span>${escapeHtml(t('status'))}: <strong>${escapeHtml(statusLabel)}</strong></span>
                </div>
            </section>
        `;
}

function getPlanChoiceText(value) {
	if (!value) return '';
	const lang = getCurrentLanguage();
	return value[lang] || value.uk || value.en || Object.values(value).find(item => typeof item === 'string') || '';
}

function renderPlanRequirementList(items) {
	if (!Array.isArray(items) || !items.length) return '';
	return `<ul>${items.map(item => `<li>${escapeHtml(getPlanChoiceText(item))}</li>`).join('')}</ul>`;
}

function planChoiceLabel(key) {
	const labels = {
		uk: { primary: 'Основне', helpful: 'Може допомогти', risk: 'Ризик', resources: 'Вартість ресурсів', selected: 'Обрано', choose: 'Обрати план', change: 'Змінити вибір', start: 'Почати розв’язку', safe: 'Безпечний результат', consequence: 'Успіх із наслідками', failure: 'Провал', note: 'Це орієнтири для обговорення, а не жорсткі обов’язкові умови.' },
		ru: { primary: 'Основное', helpful: 'Может помочь', risk: 'Риск', resources: 'Стоимость ресурсов', selected: 'Выбрано', choose: 'Выбрать план', change: 'Изменить выбор', start: 'Начать решение', safe: 'Безопасный результат', consequence: 'Успех с последствиями', failure: 'Провал', note: 'Это ориентиры для обсуждения, а не жёсткие обязательные условия.' },
		en: { primary: 'Primary', helpful: 'May help', risk: 'Risk', resources: 'Resource cost', selected: 'Selected', choose: 'Choose plan', change: 'Change selection', start: 'Start resolution', safe: 'Safe outcome', consequence: 'Success with consequences', failure: 'Failure', note: 'These are discussion guidelines, not rigid mandatory requirements.' }
	};
	return labels[getCurrentLanguage()]?.[key] || labels.uk[key] || key;
}

function planChoiceLevel(value) {
	const labels = {
		uk: { low: 'низький', medium: 'середній', high: 'високий' },
		ru: { low: 'низкий', medium: 'средний', high: 'высокий' },
		en: { low: 'low', medium: 'medium', high: 'high' }
	};
	return labels[getCurrentLanguage()]?.[value] || value || '—';
}

function renderAirFilterPlanChoice(state) {
	const choice = state.planChoice || {};
	const isTerminal = ['aborted', 'resolved_safely', 'resolved_with_casualty', 'failed', 'completed', 'success', 'failure'].includes(state.threatStatus);
	const guide = choice.solutionGuide || {};
	const leaderId = state.volunteerSelection?.selectedPlayerId || '';
	const canChoose = !choice.isLocked && !isTerminal && (isCurrentPlayerId(leaderId) || isHost);
	const commonNeeds = guide.commonNeeds || guide.CommonNeeds || [];
	const guideHtml = guide && (guide.title || guide.Title) ? `
            <section class="plan-choice-guide">
                <h3>${escapeHtml(getPlanChoiceText(guide.title || guide.Title))}</h3>
                <p>${escapeHtml(getPlanChoiceText(guide.summary || guide.Summary))}</p>
                ${commonNeeds.length ? `<ul>${commonNeeds.map(item => `<li>${escapeHtml(getPlanChoiceText(item.text || item.Text))}</li>`).join('')}</ul>` : ''}
                <p class="plan-choice-note">${escapeHtml(getPlanChoiceText(guide.note || guide.Note) || planChoiceLabel('note'))}</p>
            </section>` : '';
	const plansHtml = (choice.plans || []).map(raw => {
		const plan = raw || {};
		const id = plan.id || plan.Id || '';
		const selected = id === choice.selectedPlanId;
		const preview = plan.outcomePreview || plan.OutcomePreview || {};
		const requirements = plan.requirementsPreview || plan.RequirementsPreview || null;
		return `<article class="plan-choice-card${selected ? ' selected' : ''}">
                <header><h4>${escapeHtml(getPlanChoiceText(plan.title || plan.Title))}</h4>${selected ? `<span class="plan-choice-selected">${escapeHtml(planChoiceLabel('selected'))}</span>` : ''}</header>
                <p>${escapeHtml(getPlanChoiceText(plan.description || plan.Description))}</p>
                <p class="plan-choice-tradeoff">${escapeHtml(getPlanChoiceText(plan.tradeoff || plan.Tradeoff))}</p>
                <div class="plan-choice-meta"><span>${escapeHtml(planChoiceLabel('risk'))}: ${escapeHtml(planChoiceLevel(plan.riskLevel || plan.RiskLevel))}</span><span>${escapeHtml(planChoiceLabel('resources'))}: ${escapeHtml(planChoiceLevel(plan.resourceCost || plan.ResourceCost))}</span></div>
                ${requirements ? `<section class="plan-requirements">
                    <strong>${escapeHtml(getPlanChoiceText(requirements.shortSummary || requirements.ShortSummary))}</strong>
                    <h5>${escapeHtml(planChoiceLabel('primary'))}</h5>${renderPlanRequirementList(requirements.primary || requirements.Primary)}
                    <h5>${escapeHtml(planChoiceLabel('helpful'))}</h5>${renderPlanRequirementList(requirements.helpful || requirements.Helpful)}
                    ${getPlanChoiceText(requirements.warning || requirements.Warning) ? `<p class="plan-warning">${escapeHtml(getPlanChoiceText(requirements.warning || requirements.Warning))}</p>` : ''}
                </section>` : ''}
                <section class="plan-outcomes">
                    <p><strong>${escapeHtml(planChoiceLabel('safe'))}:</strong> ${escapeHtml(getPlanChoiceText(preview.safeSuccess || preview.SafeSuccess))}</p>
                    <p><strong>${escapeHtml(planChoiceLabel('consequence'))}:</strong> ${escapeHtml(getPlanChoiceText(preview.successWithConsequence || preview.SuccessWithConsequence))}</p>
                    <p><strong>${escapeHtml(planChoiceLabel('failure'))}:</strong> ${escapeHtml(getPlanChoiceText(preview.failure || preview.Failure))}</p>
                </section>
                ${canChoose ? `<button type="button" class="char-btn" onclick="selectThreatPlan('${escapeHtml(id)}')">${escapeHtml(planChoiceLabel(selected ? 'change' : 'choose'))}</button>` : ''}
            </article>`;
	}).join('');
	const discussionControls = !choice.isLocked && !isTerminal ? `<section class="plan-choice-contributions">
            <h3>${escapeHtml(t('team'))}</h3>
            ${renderThreatParticipantsList(state)}
            <div class="threat-operation-actions">
                <button type="button" class="char-btn" onclick="submitThreatVolunteer()">${escapeHtml(t('joinTeam'))}</button>
                <button type="button" class="char-btn" onclick="withdrawThreatContribution()">${escapeHtml(t('leaveTeam'))}</button>
                ${renderThreatLeaderControl(state)}
            </div>
            <div class="threat-operation-actions">
                ${renderThreatItemSelect(t('addEquipment'))}
                <button type="button" class="char-btn" onclick="useProfessionForThreat()">${escapeHtml(t('useProfession'))}</button>
                <button type="button" class="char-btn" onclick="useHobbyForThreat()">${escapeHtml(t('useHobby'))}</button>
            </div>
        </section>` : '';
	return `<section class="plan-choice-panel">${guideHtml}${discussionControls}<div class="plan-choice-grid">${plansHtml}</div>${isHost && choice.selectedPlanId && !choice.isLocked && !isTerminal ? `<button type="button" class="char-btn public-use" onclick="resolveCurrentThreat()">${escapeHtml(planChoiceLabel('start'))}</button>` : ''}</section>`;
}

function getThreatStatusLabel(status) {
	return resolveThreatStatusPresentation(status).label;
}

function getRadiationOperationStatus(state) {
	const miniStatus = state?.miniGame?.status || '';
	if (['active', 'resolved_safely', 'resolved_with_casualty', 'failed'].includes(miniStatus)) {
		return miniStatus;
	}
	return state?.threatStatus || state?.operationAggregates?.status || miniStatus || 'not_started';
}

function openThreatOperationModal() {
	renderThreatOperationModal();
	const modal = document.getElementById('threatOperationModal');
	if (modal) modal.style.display = 'flex';
	updateThreatOperationTimer();
}

function closeThreatOperationModal() {
	const modal = document.getElementById('threatOperationModal');
	if (modal) modal.style.display = 'none';
}

function renderThreatOperationModal() {
	let modal = document.getElementById('threatOperationModal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'threatOperationModal';
		modal.className = 'modal threat-operation-modal';
		modal.style.display = 'none';
		document.body.appendChild(modal);
	}

	const state = currentThreatState || {};
	const scaling = getThreatOperationMetrics(state);
	const aggregates = state.operationAggregates || {};
	const miniGame = state.miniGame || {};
	const leaderName = state.volunteerSelection?.selectedPlayerName || t('noLeader');
	const status = getThreatStatusLabel(getRadiationOperationStatus(state));
	const teamText = buildThreatTeamText(state, scaling);
	const playersCount = scaling.activePlayerCount || currentRoundState?.activePlayerCount || Object.values(roomPlayers || {}).filter(p => !p.isEliminated).length || 0;
	const hints = aggregates.hints ?? scaling.hintTokens ?? 0;

	modal.innerHTML = `
            <div class="modal-content threat-operation-content">
                <button type="button" class="modal-close" onclick="closeThreatOperationModal()">&times;</button>
                <div class="threat-operation-header">
                    <span>${escapeHtml(t('radiationOperation'))}</span>
					<h3>${escapeHtml(t('operation'))}: ${escapeHtml(getLocalizedValue(currentThreat, 'name') || t('threat'))}</h3>
                </div>
                <div class="threat-operation-overview">
                    <span>${escapeHtml(t('playersInRoom'))}: <strong>${escapeHtml(playersCount)}</strong></span>
                    <span>${escapeHtml(t('team'))}: <strong>${escapeHtml(teamText)}</strong></span>
                    <span>${escapeHtml(t('operationStages'))}: <strong>${escapeHtml(scaling.playableTaskCount || miniGame.totalQuestions || 0)}</strong></span>
                    <span>${escapeHtml(t('allowedErrors'))}: <strong>${escapeHtml(scaling.allowedErrors ?? 0)}</strong></span>
                    <span>${escapeHtml(t('hints'))}: <strong>${escapeHtml(hints)}</strong></span>
                    <span>${escapeHtml(t('secondsPerStage'))}: <strong>${escapeHtml(scaling.taskTimeSeconds || 0)}</strong></span>
                </div>
                <div class="threat-operation-sections">
                    <section>
                        <h4>${escapeHtml(t('team'))}</h4>
                        <div class="threat-operation-row">
                            <span>${escapeHtml(t('leader'))}</span>
                            <strong>${escapeHtml(leaderName)}</strong>
                        </div>
                        ${renderThreatParticipantsList(state)}
                        <div class="threat-operation-actions">
                            <button type="button" class="char-btn" onclick="submitThreatVolunteer()">${escapeHtml(t('joinTeam'))}</button>
                            <button type="button" class="char-btn" onclick="withdrawThreatContribution()">${escapeHtml(t('leaveTeam'))}</button>
                            ${renderThreatLeaderControl(state)}
                        </div>
                    </section>
                    <section>
                        <h4>${escapeHtml(t('equipment'))}</h4>
                        <div class="threat-operation-row">
                            <span>${escapeHtml(t('equipment'))}</span>
                            <strong>${escapeHtml(aggregates.equipmentContributions ?? 0)}</strong>
                        </div>
                        <div class="threat-operation-actions">
                            ${renderThreatItemSelect(t('addEquipment'))}
                            <button type="button" class="char-btn" onclick="useProfessionForThreat()">${escapeHtml(t('useProfession'))}</button>
                        </div>
                    </section>
                    <section>
                        <h4>${escapeHtml(t('operation'))}</h4>
                        <div class="threat-operation-row">
                            <span>${escapeHtml(t('status'))}</span>
                            <strong>${escapeHtml(status)}</strong>
                        </div>
                        ${renderThreatMiniGamePanel(state)}
                    </section>
                </div>
            </div>
        `;
}

function getThreatOperationMetrics(state) {
	const scaling = state?.scaling || {};
	if (scaling.isCalculated) return scaling;
	return state?.preview || scaling || {};
}

function buildThreatTeamText(state, metrics = null) {
	const data = metrics || getThreatOperationMetrics(state);
	const participantCount = state?.participants?.length ?? data.participantCount ?? 0;
	const maxParticipants = data.maxParticipants ?? 0;
	if (maxParticipants > 0) return `${participantCount}/${maxParticipants}`;
	return state?.operationAggregates?.team || '0/0';
}

function renderThreatParticipantsList(state) {
	const participants = state?.participants || [];
	if (!participants.length) {
		return `<div class="threat-participants-list muted">${escapeHtml(t('noLeader'))}</div>`;
	}

	return `
            <div class="threat-participants-list">
                ${participants.map(participant => {
		const badges = [
			participant.isLeader ? `<span>${escapeHtml(t('leader'))}</span>` : '',
			participant.isForced ? `<span>${escapeHtml(t('forcedParticipant'))}</span>` : '',
			participant.isProtected ? `<span>${escapeHtml(t('protectedParticipant'))}</span>` : ''
		].filter(Boolean).join('');
		return `
                        <div class="threat-participant">
                            <strong>${escapeHtml(participant.name || t('unknown'))}</strong>
                            ${badges ? `<div class="threat-participant-badges">${badges}</div>` : ''}
                        </div>
                    `;
	}).join('')}
            </div>
        `;
}

function renderThreatLeaderControl(state) {
	if (!isHost || state?.miniGame?.status === 'active' || state?.miniGame?.status === 'completed') return '';
	const players = Object.values(roomPlayers || {})
		.filter(player => player && !player.isEliminated)
		.sort((a, b) => (a.seatNumber || 999) - (b.seatNumber || 999));
	if (!players.length) return '';

	const options = players.map(player => {
		const id = player.stablePlayerId || player.connectionId || '';
		const selected = id && id === state?.volunteerSelection?.selectedPlayerId ? ' selected' : '';
		return `<option value="${escapeHtml(id)}"${selected}>#${escapeHtml(player.seatNumber || '?')} ${escapeHtml(player.name || t('unknown'))}</option>`;
	}).join('');

	return `<label class="threat-inline-control"><select id="threatLeaderSelect">${options}</select><button type="button" class="char-btn" onclick="setThreatOperationLeader()">${escapeHtml(t('chooseLeader'))}</button></label>`;
}

function renderThreatMiniGamePanel(state) {
	const miniGame = state?.miniGame || {};
	const status = getRadiationOperationStatus(state);
	const question = miniGame.currentQuestion || null;
	const leaderId = miniGame.leaderPlayerId || state?.volunteerSelection?.selectedPlayerId || '';
	const amLeader = isCurrentPlayerId(leaderId);
	const isFinal = ['resolved_safely', 'resolved_with_casualty', 'failed', 'aborted'].includes(status);
	const canStart = isHost && leaderId && !isFinal && status !== 'active';
	const score = miniGame.score || {};
	const metrics = getThreatOperationMetrics(state);
	const progress = `${miniGame.currentIndex ?? 0}/${miniGame.totalQuestions ?? metrics.playableTaskCount ?? 0}`;

	if (isFinal) {
		return `
                <div class="threat-mini-panel threat-mini-panel-final">
                    <p><strong>${escapeHtml(getThreatStatusLabel(status))}</strong></p>
                    <div class="threat-operation-row"><span>${escapeHtml(t('currentProgress'))}</span><strong>${escapeHtml(progress)}</strong></div>
                </div>
            `;
	}

	if (!question) {
		return `
                <div class="threat-mini-panel">
                    <p>${escapeHtml(t('noOperationQuestion'))}</p>
                    <div class="threat-operation-actions">
                        ${canStart ? `<button type="button" class="char-btn public-use" onclick="startThreatMiniGame()">${escapeHtml(t('startOperation'))}</button>` : ''}
                    </div>
                    <div class="threat-operation-row"><span>${escapeHtml(t('currentProgress'))}</span><strong>${escapeHtml(progress)}</strong></div>
                </div>
            `;
	}

	const options = (question.options || []).map(option => {
		const optionId = option.optionId || option.OptionId || '';
		const text = option.text || option.Text || optionId;
		return `<button type="button" class="char-btn threat-answer-btn" ${amLeader ? '' : 'disabled aria-disabled="true"'} onclick="submitThreatMiniGameAnswer('${escapeHtml(question.questionId)}','${escapeHtml(optionId)}')">${escapeHtml(text)}</button>`;
	}).join('');

	return `
            <div class="threat-mini-panel">
                <div class="threat-operation-row">
                    <span>${escapeHtml(t('currentProgress'))}</span>
                    <strong>${escapeHtml(question.currentIndex || miniGame.currentIndex || 0)}/${escapeHtml(question.totalQuestions || miniGame.totalQuestions || 0)}</strong>
                </div>
                <div class="threat-operation-row">
                    <span>${escapeHtml(t('secondsPerStage'))}</span>
                    <strong id="threatOperationTimer">--</strong>
                </div>
                <p class="threat-question-text">${escapeHtml(question.text || '')}</p>
                <div class="threat-answer-list">${options}</div>
                ${question.hint ? `<p class="threat-hint">${escapeHtml(question.hint)}</p>` : ''}
                <div class="threat-operation-actions">
                    <button type="button" class="char-btn" onclick="useThreatMiniGameHint()">${escapeHtml(t('useHint'))}</button>
                </div>
            </div>
        `;
}

function isCurrentPlayerId(playerId) {
	if (!playerId) return false;
	const self = roomPlayers?.[myConnectionId] || {};
	return playerId === self.stablePlayerId || playerId === stablePlayerId || playerId === myConnectionId;
}

function getThreatSourceLabel(sourceType) {
	const labels = {
		profession: 'Професія',
		hobby: 'Хобі',
		personal_inventory: 'Предмет',
		profession_item: 'Професійний предмет',
		property: t('property'),
		bunker_resource: 'Ресурс бункера',
		bunker_facility: 'Система бункера'
	};
	return labels[sourceType] || sourceType || 'Внесок';
}

function renderThreatItemSelect(buttonLabel = null) {
	const inventoryItems = (myPlayerData?.inventory?.items || []).map((item, index) => ({
		item,
		source: 'inventory',
		fallbackId: String(index)
	}));
	const professionItem = myPlayerData?.professionItem;
	const professionItems = professionItem?.name ? [{ item: professionItem, source: 'profession', fallbackId: 'profession' }] : [];
	const property = myPlayerData?.property;
	const propertyItems = property?.definitionId ? [{
		item: { name: getPropertyDisplay(property), instanceId: property.definitionId },
		source: 'property',
		fallbackId: property.definitionId
	}] : [];
	const items = [...professionItems, ...inventoryItems, ...propertyItems];
	if (!items.length) return '';
	const options = items.map(({ item, source, fallbackId }) => {
		const rawValue = item.instanceId || item.name || fallbackId;
		const value = `${source}:${rawValue}`;
		const name = getLocalizedValue(item, 'item') || getLocalizedValue(item, 'name') || item.name || 'Предмет';
		return `<option value="${escapeHtml(value)}">${escapeHtml(name)}</option>`;
	}).join('');
	return `<label class="threat-inline-control"><select id="threatItemSelect">${options}</select><button type="button" class="char-btn" onclick="contributeThreatItem()">${escapeHtml(buttonLabel || t('addEquipment'))}</button></label>`;
}

function renderBunkerAssetControls() {
	const assets = currentBunker?.threatAssets || currentBunker?.ThreatAssets || {};
	const resources = assets.resources || assets.Resources || [];
	const facilities = assets.facilities || assets.Facilities || [];
	const resourceOptions = resources
		.filter(asset => (asset.status || asset.Status || 'available') === 'available')
		.map(asset => `<option value="${escapeHtml(asset.id || asset.Id || asset.name || asset.Name)}">${escapeHtml(asset.name || asset.Name || asset.id || asset.Id)}</option>`)
		.join('');
	const facilityOptions = facilities
		.filter(asset => (asset.status || asset.Status || 'available') === 'available')
		.map(asset => `<option value="${escapeHtml(asset.id || asset.Id || asset.name || asset.Name)}">${escapeHtml(asset.name || asset.Name || asset.id || asset.Id)}</option>`)
		.join('');

	return `
            ${resourceOptions ? `<label class="threat-inline-control"><select id="threatBunkerResourceSelect">${resourceOptions}</select><button class="char-btn" onclick="contributeBunkerThreatAsset('bunker_resource')">Додати ресурс</button></label>` : ''}
            ${facilityOptions ? `<label class="threat-inline-control"><select id="threatBunkerFacilitySelect">${facilityOptions}</select><button class="char-btn" onclick="contributeBunkerThreatAsset('bunker_facility')">Додати систему</button></label>` : ''}
        `;
}

function renderThreatVolunteerVoteControls() {
	const candidates = Object.values(roomPlayers || {})
		.filter(player => player && !player.isEliminated && player.connectionId !== myConnectionId)
		.sort((a, b) => (a.seatNumber || 999) - (b.seatNumber || 999));
	if (!candidates.length) return '';
	return `
            <div class="threat-volunteer-vote">
                <p>Оберіть гравця, якого група вважає найменш корисним і готова відправити усувати загрозу.</p>
                <div class="threat-vote-candidates">
                    ${candidates.map(player => `<button class="char-btn" onclick="voteThreatVolunteer('${escapeHtml(player.stablePlayerId || player.connectionId)}')">#${player.seatNumber || '?'} ${escapeHtml(player.name || t('unknown'))}</button>`).join('')}
                </div>
            </div>
        `;
}

function renderThreatRevealedItems(state) {
	const items = state.contributions?.revealedAfterResolution || [];
	if (!items.length) return '';
	const names = items.map(item => item.displayName || item.DisplayName || '').filter(Boolean);
	return names.length ? `<p>Використані предмети: ${names.map(escapeHtml).join(', ')}</p>` : '';
}

function rollThreatSupportDice() {
	connection.invoke("RollThreatSupportDice").catch(err => console.error("RollThreatSupportDice error:", err));
}

function submitThreatVolunteer() {
	connection.invoke("SubmitThreatVolunteer").catch(err => console.error("SubmitThreatVolunteer error:", err));
}

function useProfessionForThreat() {
	connection.invoke("UseProfessionForThreat").catch(err => console.error("UseProfessionForThreat error:", err));
}

function useHobbyForThreat() {
	connection.invoke("UseHobbyForThreat").catch(err => console.error("UseHobbyForThreat error:", err));
}

function contributeThreatItem() {
	const select = document.getElementById('threatItemSelect');
	if (!select?.value) {
		addEventMessage("Оберіть предмет для внеску.");
		return;
	}
	connection.invoke("ContributeThreatItem", select.value).catch(err => console.error("ContributeThreatItem error:", err));
}

function contributeBunkerThreatAsset(sourceType) {
	const selectId = sourceType === 'bunker_facility' ? 'threatBunkerFacilitySelect' : 'threatBunkerResourceSelect';
	const select = document.getElementById(selectId);
	if (!select?.value) {
		addEventMessage("Оберіть ресурс або систему бункера.");
		return;
	}
	connection.invoke("ContributeBunkerThreatAsset", sourceType, select.value).catch(err => console.error("ContributeBunkerThreatAsset error:", err));
}

function withdrawThreatContribution() {
	connection.invoke("WithdrawThreatContribution", null).catch(err => console.error("WithdrawThreatContribution error:", err));
}

function startThreatVolunteerVote() {
	connection.invoke("StartThreatVolunteerVote").catch(err => console.error("StartThreatVolunteerVote error:", err));
}

function setThreatOperationLeader() {
	const select = document.getElementById('threatLeaderSelect');
	if (!select?.value) return;
	connection.invoke("SetThreatOperationLeader", select.value).catch(err => console.error("SetThreatOperationLeader error:", err));
}

function voteThreatVolunteer(targetPlayerId) {
	connection.invoke("VoteThreatVolunteer", targetPlayerId).catch(err => console.error("VoteThreatVolunteer error:", err));
}

function closeThreatVolunteerVote() {
	connection.invoke("CloseThreatVolunteerVote").catch(err => console.error("CloseThreatVolunteerVote error:", err));
}

function resolveCurrentThreat() {
	connection.invoke("ResolveCurrentThreat").catch(err => console.error("ResolveCurrentThreat error:", err));
}

function selectThreatPlan(planId) {
	connection.invoke("SelectThreatPlan", planId).catch(err => console.error("SelectThreatPlan error:", err));
}

function startThreatMiniGame() {
	connection.invoke("StartThreatMiniGame", getCurrentLanguage()).catch(err => console.error("StartThreatMiniGame error:", err));
}

function submitThreatMiniGameAnswer(questionId, optionId) {
	connection.invoke("SubmitThreatMiniGameAnswer", questionId, optionId, getCurrentLanguage()).catch(err => console.error("SubmitThreatMiniGameAnswer error:", err));
}

function useThreatMiniGameHint() {
	connection.invoke("UseThreatMiniGameHint", getCurrentLanguage()).catch(err => console.error("UseThreatMiniGameHint error:", err));
}

function updateThreatOperationTimer() {
	const timer = document.getElementById('threatOperationTimer');
	const deadline = currentThreatState?.miniGame?.currentQuestion?.deadlineUtc || currentThreatState?.miniGame?.deadlineUtc;
	if (!timer || !deadline || getRadiationOperationStatus(currentThreatState) !== 'active') return;

	const remaining = Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000));
	timer.textContent = `${remaining}s`;
	if (remaining === 0 && lastThreatTimeoutCheckDeadline !== deadline) {
		lastThreatTimeoutCheckDeadline = deadline;
		connection.invoke("CheckThreatMiniGameTimeout", getCurrentLanguage())
			.catch(err => console.error("CheckThreatMiniGameTimeout error:", err));
	}
}
