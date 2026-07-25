const connection = new signalR.HubConnectionBuilder()
	.withUrl("/gameHub")
	.withAutomaticReconnect()
	.build();

// Дані
let currentRoom = null;
let myPlayerData = null;
let myConnectionId = null;
let isHost = false;
let isDeveloper = false;
let developerState = null;
let developerPresence = { developerPresent: false, status: 'offline' };
let currentPostGameTransition = null;
let roomPlayers = {}; // connectionId -> player info
let selectedPublicPlayerSeat = null;
let publicPlayerViewMode = 'all';
let publicPlayerSortMode = 'seat';
let gmPlayersData = {}; // Повні дані гравців для GM
let selectedPlayerForGM = null;
let gmThreatControlData = { threats: [], currentThreat: null, auditLog: [] };
let gmThreatCommandPending = false;
let gmThreatForcePending = false;
let gmThreatForcePreview = null;
let gmThreatForceRequestedOutcome = '';
let gmPlayerCommandPending = false;
let bunkerCapacityPending = false;
let gmRoundCommandPending = false;
let gmVotingAdminState = { active: false, nonVoters: [], eligibleVoters: [] };
let gmDiagnosticsData = null;
let gmAuditData = { entries: [] };
let gmAutoFixPreview = null;
let gmDiagnosticsPending = false;
let gmSnapshotsData = [];
let gmSnapshotRestorePreview = null;
let gmSnapshotCommandPending = false;
let gmRoomLocalEditorData = { bunkerFields: [], apocalypseFields: [], players: [] };
let gmRoomLocalEditPreview = null;
let gmRoomLocalEditorPending = false;
let omniscientPreview = null;
let omniscientCommandPending = false;
let omniscientHiddenState = null;
let omniscientHiddenStateVersion = 0;
let directorPreview = null;
let directorCommandPending = false;
let lobbyState = null;
let lobbyStartPreview = null;
let lobbyCommandPending = false;
let pendingGuestWarningStorageKey = '';
let lobbySettingsDraft = null;
let currentPendingScenarioChoice = null;
let lobbySettingsBaseRevision = 0;
let lobbySettingsDirty = false;
let lobbySettingsPending = false;
let lobbySettingsOwnerId = '';
let lobbySettingsActiveTab = 'basic';
let lobbyApocalypseCatalog = null;
let lobbyApocalypseCatalogPending = false;
let lobbyApocalypseSearch = '';
let lobbyApocalypseCategoryFilter = '';
let lobbyApocalypseInteractiveFilter = 'all';
let lobbyApocalypseVisibleCount = 30;
const lobbyApocalypseCollapsedCategoryIds = new Set();
const lobbyLocalPresetStorageKey = 'bunker.lobbyGamePresets.v1';
const pendingCharacteristicReveals = new Set();
const pendingSpecialCardUses = new Set();
const specialCardSelectionState = new Map();
let renderedSpecialCardKeys = [];
let globalCatalogAllowed = false;
let globalCatalogMetadata = [];
let globalCatalogPage = 1;
let globalCatalogTotal = 0;
let globalCatalogSearchTimer = null;
let globalCatalogAccessRoomId = null;
let globalDrafts = [];
let globalDraftPending = false;
let globalRollbackPreview = null;
let globalMigrationPreview = null;
let currentGameTimer = null;
let gameTimerClockAnchor = null;
let gameTimerCommandPending = false;
let activeGMTab = 'state';
let gmLastCommandError = '';
let pendingJoinRoomId = null; // Для закриття модалки після успішного join
let hostToken = null;
let reconnectToken = null;
let currentApocalypse = null;
let currentPublicGameSettings = { apocalypseThemeEnabled: true, apocalypseActivation: null };
let currentBunker = null;
let currentThreat = null;
let currentThreatState = null;
let lastThreatTimeoutCheckDeadline = null;
let currentVoting = null;
let currentRoundState = null;
let currentGameCompletion = null;
let returnFinishedGamePending = false;
let myVote = null;
let initialInviteRoomId = getRoomIdFromPath();

if (typeof registerSignalREvents === 'function') registerSignalREvents();
console.log("[SignalR] about to call connection.start()");
connection.start()
	.then(async () => {
		console.log("SignalR connected, connectionId:", connection.connectionId);
		myConnectionId = connection.connectionId;
		try { applyDeveloperAccessState(await connection.invoke('GetDeveloperAccessState')); }
		catch (_) { applyDeveloperAccessState(null); }

		updateConnectionStatus(`✓ ${getCurrentLanguage() === 'en' ? 'Connected to server' : getCurrentLanguage() === 'ru' ? 'Подключено к серверу' : 'Підключено до сервера'}`);

		// Спроба перепідключення до існуючої сесії
		if (!tryRejoin()) {
			if (initialInviteRoomId) {
				openJoinRoomModal(initialInviteRoomId);
			}
			connection.invoke("GetRooms");
		}

		// Автозаповнення імені
		prefillPlayerName();

		addEventMessage("Підключено до сервера");
	})
	.catch(err => {
		console.error("Connection error:", err);
		updateConnectionStatus("✗ Помилка підключення. Оновіть сторінку.", true);
		addEventMessage("Помилка підключення до сервера");
	});

// ==================== GLOBAL HELPER FUNCTIONS ====================
// escapeHtml and sanitizeNameInput are defined in game-utils.js (loaded before this file)

// getRoomIdFromPath moved to ~/js/bunker/core/runtime.js


// normalizeRoundState moved to ~/js/bunker/rounds/runtime.js

// applyRoundState moved to ~/js/bunker/rounds/runtime.js

// applyDeveloperAccessState moved to ~/js/bunker/diagnostics/runtime.js

// applyDeveloperPresence moved to ~/js/bunker/diagnostics/runtime.js

// normalizePostGameTransition moved to ~/js/bunker/postgame/runtime.js

// applyPostGameTransition moved to ~/js/bunker/postgame/runtime.js

// setPostGameButton moved to ~/js/bunker/postgame/runtime.js

// renderPostGameCommandState moved to ~/js/bunker/postgame/runtime.js

// renderDeveloperAuthorityUi moved to ~/js/bunker/diagnostics/runtime.js

// developerFeatureEnabled moved to ~/js/bunker/diagnostics/runtime.js

// buildDeveloperChecklist moved to ~/js/bunker/diagnostics/runtime.js

// renderDeveloperAudit moved to ~/js/bunker/diagnostics/runtime.js

// toggleDeveloperTools moved to ~/js/bunker/diagnostics/runtime.js

// copyDeveloperChecklist moved to ~/js/bunker/diagnostics/runtime.js

// recoverDeveloperUi moved to ~/js/bunker/diagnostics/runtime.js

// takeOverDeveloperOperator moved to ~/js/bunker/diagnostics/runtime.js

// finishPostGameDiscussion moved to ~/js/bunker/postgame/runtime.js

// revealRemainingPostGameCharacteristics moved to ~/js/bunker/postgame/runtime.js

// requestPostGameStoryMode moved to ~/js/bunker/postgame/runtime.js

// requestFinalPostGameStory moved to ~/js/bunker/postgame/runtime.js

// cancelPostGameStoryRequest moved to ~/js/bunker/postgame/runtime.js

// normalizeGameCompletion moved to ~/js/bunker/postgame/runtime.js

// isFinishedGameState moved to ~/js/bunker/postgame/runtime.js

// setGameFinishedMutationState moved to ~/js/bunker/postgame/runtime.js

// renderGameFinished moved to ~/js/bunker/postgame/runtime.js

// buildGameSummaryText moved to ~/js/bunker/postgame/runtime.js

// copyGameSummary moved to ~/js/bunker/postgame/runtime.js

// returnFinishedGameToLobby moved to ~/js/bunker/postgame/runtime.js

// clearGameFinishedStateForLobby moved to ~/js/bunker/postgame/runtime.js

// normalizeGameTimer moved to ~/js/bunker/timer/runtime.js

// syncGameTimer moved to ~/js/bunker/timer/runtime.js

// getGameTimerRemaining moved to ~/js/bunker/timer/runtime.js

// renderGameTimer moved to ~/js/bunker/timer/runtime.js

window.setInterval(renderGameTimer, 250);

// getCurrentRoundNumber moved to ~/js/bunker/rounds/runtime.js

// getCurrentPhase moved to ~/js/bunker/rounds/runtime.js

// normalizeThreatState moved to ~/js/bunker/threats/runtime.js

// normalizeDiceRoll moved to ~/js/bunker/rounds/runtime.js

// hasCurrentPlayerRevealedThisRound moved to ~/js/bunker/rounds/runtime.js

// canRevealThisRound moved to ~/js/bunker/rounds/runtime.js

// getRevealBlockedReason moved to ~/js/bunker/rounds/runtime.js

// getPhaseLabel moved to ~/js/bunker/rounds/runtime.js

// canEndRoundNow moved to ~/js/bunker/rounds/runtime.js

// canRollRoundDiceNow moved to ~/js/bunker/rounds/runtime.js

// canStartVotingNow moved to ~/js/bunker/rounds/runtime.js

// getRoomStateLabel moved to ~/js/bunker/rounds/runtime.js

// updateRoundStatusUI moved to ~/js/bunker/rounds/runtime.js

// normalizeThreatMetadataValue moved to ~/js/bunker/threats/runtime.js

// resolveThreatVisualVariant moved to ~/js/bunker/threats/runtime.js

// resolveThreatSeverity moved to ~/js/bunker/threats/runtime.js

// getThreatSeverityLabel moved to ~/js/bunker/threats/runtime.js

// resolveThreatStatusPresentation moved to ~/js/bunker/threats/runtime.js

// buildThreatScenarioModel moved to ~/js/bunker/threats/runtime.js

// renderThreatIcon moved to ~/js/bunker/threats/runtime.js

// renderHiddenThreatScenario moved to ~/js/bunker/threats/runtime.js

// renderThreatContentSection moved to ~/js/bunker/threats/runtime.js

// renderThreatScenario moved to ~/js/bunker/threats/runtime.js

// renderThreatPanel moved to ~/js/bunker/threats/runtime.js

// handleThreatHeroImageError moved to ~/js/bunker/threats/runtime.js

// openCurrentThreatImage moved to ~/js/bunker/threats/runtime.js

// renderThreatInteractionPanel moved to ~/js/bunker/threats/runtime.js

// getPlanChoiceText moved to ~/js/bunker/threats/runtime.js

// renderPlanRequirementList moved to ~/js/bunker/threats/runtime.js

// planChoiceLabel moved to ~/js/bunker/threats/runtime.js

// planChoiceLevel moved to ~/js/bunker/threats/runtime.js

// renderAirFilterPlanChoice moved to ~/js/bunker/threats/runtime.js

// getThreatStatusLabel moved to ~/js/bunker/threats/runtime.js

// getRadiationOperationStatus moved to ~/js/bunker/threats/runtime.js

// openThreatOperationModal moved to ~/js/bunker/threats/runtime.js

// closeThreatOperationModal moved to ~/js/bunker/threats/runtime.js

// renderThreatOperationModal moved to ~/js/bunker/threats/runtime.js

// getThreatOperationMetrics moved to ~/js/bunker/threats/runtime.js

// buildThreatTeamText moved to ~/js/bunker/threats/runtime.js

// renderThreatParticipantsList moved to ~/js/bunker/threats/runtime.js

// renderThreatLeaderControl moved to ~/js/bunker/threats/runtime.js

// renderThreatMiniGamePanel moved to ~/js/bunker/threats/runtime.js

// isCurrentPlayerId moved to ~/js/bunker/threats/runtime.js

// getThreatSourceLabel moved to ~/js/bunker/threats/runtime.js

// renderThreatItemSelect moved to ~/js/bunker/threats/runtime.js

// renderBunkerAssetControls moved to ~/js/bunker/threats/runtime.js

// renderThreatVolunteerVoteControls moved to ~/js/bunker/threats/runtime.js

// renderThreatRevealedItems moved to ~/js/bunker/threats/runtime.js

// rollThreatSupportDice moved to ~/js/bunker/threats/runtime.js

// submitThreatVolunteer moved to ~/js/bunker/threats/runtime.js

// useProfessionForThreat moved to ~/js/bunker/threats/runtime.js

// useHobbyForThreat moved to ~/js/bunker/threats/runtime.js

// contributeThreatItem moved to ~/js/bunker/threats/runtime.js

// contributeBunkerThreatAsset moved to ~/js/bunker/threats/runtime.js

// withdrawThreatContribution moved to ~/js/bunker/threats/runtime.js

// startThreatVolunteerVote moved to ~/js/bunker/threats/runtime.js

// setThreatOperationLeader moved to ~/js/bunker/threats/runtime.js

// voteThreatVolunteer moved to ~/js/bunker/threats/runtime.js

// closeThreatVolunteerVote moved to ~/js/bunker/threats/runtime.js

// resolveCurrentThreat moved to ~/js/bunker/threats/runtime.js

// selectThreatPlan moved to ~/js/bunker/threats/runtime.js

// startThreatMiniGame moved to ~/js/bunker/threats/runtime.js

// submitThreatMiniGameAnswer moved to ~/js/bunker/threats/runtime.js

// useThreatMiniGameHint moved to ~/js/bunker/threats/runtime.js

// updateThreatOperationTimer moved to ~/js/bunker/threats/runtime.js

window.setInterval(updateThreatOperationTimer, 1000);

// getReadyStatusLabel moved to ~/js/bunker/rounds/runtime.js

// getReadyStatusClass moved to ~/js/bunker/rounds/runtime.js

// updateReadyCheckUI moved to ~/js/bunker/rounds/runtime.js







// setText moved to ~/js/bunker/i18n/runtime.js

// setPlaceholder moved to ~/js/bunker/i18n/runtime.js

// applyStaticTranslations moved to ~/js/bunker/i18n/runtime.js

// rerenderLocalizedUI moved to ~/js/bunker/i18n/runtime.js

// renderCurrentGameUI moved to ~/js/bunker/core/runtime.js

// resetClientGameStateForNewRoom moved to ~/js/bunker/core/runtime.js

// clearLegacyRoomStateOnly moved to ~/js/bunker/core/runtime.js

// changeLanguage moved to ~/js/bunker/i18n/runtime.js

window.changeLanguage = changeLanguage;
document.addEventListener('DOMContentLoaded', function () {
	clearLegacyRoomStateOnly();
	applyStaticTranslations();
	ensureApocalypseAmbientRoot();
	syncApocalypseEffectsPreference();
	initApocalypseParallaxManager();
	syncDocumentVisibilityEffects();
});
document.addEventListener('visibilitychange', syncDocumentVisibilityEffects);
window.getApocalypseEffectsLevel = getApocalypseEffectsLevel;
window.setApocalypseEffectsLevel = setApocalypseEffectsLevel;

// normalizeCharacteristicKey moved to ~/js/bunker/characters/runtime.js

// cleanTooltipText moved to ~/js/bunker/characters/runtime.js

// cleanProfessionName moved to ~/js/bunker/characters/runtime.js

// getProfessionDisplayName moved to ~/js/bunker/characters/runtime.js

// getSeverityCode moved to ~/js/bunker/characters/runtime.js

// getSeverityLabel moved to ~/js/bunker/characters/runtime.js

// getConditionSeverityLabel moved to ~/js/bunker/characters/runtime.js

// conditionShouldShowSeverity moved to ~/js/bunker/characters/runtime.js

// getConditionDisplayName moved to ~/js/bunker/characters/runtime.js

// shouldShowSeverity moved to ~/js/bunker/characters/runtime.js

// buildLocalizedTooltip moved to ~/js/bunker/characters/runtime.js

// getLocalizedHealthDescription moved to ~/js/bunker/characters/runtime.js

// buildHealthConditionTooltip moved to ~/js/bunker/characters/runtime.js




// buildPhysicalHealthTooltip moved to ~/js/bunker/characters/runtime.js

// parseFactValue moved to ~/js/bunker/characters/runtime.js

// normalizeFactFromPlayer moved to ~/js/bunker/characters/runtime.js

// normalizeRevealedState moved to ~/js/bunker/characters/runtime.js

// normalizeRevealedSources moved to ~/js/bunker/characters/runtime.js

// normalizeRevealedValues moved to ~/js/bunker/characters/runtime.js

// getRevealedSource moved to ~/js/bunker/characters/runtime.js

// getLocalizedRevealedValue moved to ~/js/bunker/characters/runtime.js

// getLocalizedRevealedTooltip moved to ~/js/bunker/characters/runtime.js

// hasGeneratedCharacterData moved to ~/js/bunker/characters/runtime.js

// normalizeInventoryData moved to ~/js/bunker/inventory/runtime.js

// normalizePropertyData moved to ~/js/bunker/inventory/runtime.js

// getPropertyPresentation moved to ~/js/bunker/inventory/runtime.js

// getPropertyDisplay moved to ~/js/bunker/inventory/runtime.js

// normalizeItemData moved to ~/js/bunker/inventory/runtime.js

// normalizeSpecialCard moved to ~/js/bunker/special-cards/runtime.js

// normalizeSpecialCards moved to ~/js/bunker/special-cards/runtime.js

// normalizeSpecialCardState moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardName moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardDescription moved to ~/js/bunker/special-cards/runtime.js

// Normalize player data from server (PascalCase) to client (camelCase)
// normalizePlayer moved to ~/js/bunker/characters/runtime.js

// normalizeAdditionalPhysicalConditions moved to ~/js/bunker/characters/runtime.js

// normalizeEliminationVoteImmunity moved to ~/js/bunker/characters/runtime.js

// apocalypseEffectBannerTimer is defined in apocalypse/state.js
// apocalypseEffectSummaryKey is defined in apocalypse/helpers.js

// hideApocalypseEffectBanner moved to ~/js/bunker/apocalypse/runtime.js

// showApocalypseEffectBanner moved to ~/js/bunker/apocalypse/runtime.js

// showApocalypseEffectPersonalChanges moved to ~/js/bunker/apocalypse/runtime.js

// registerSignalREvents() moved to bunker/core/signalr-events.js


// ==================== GLOBAL FUNCTIONS ====================

let isStartingGame = false;

// previewLobbyStart moved to ~/js/bunker/lobby/runtime.js

// startGame moved to ~/js/bunker/lobby/runtime.js

// toggleLobbyReady moved to ~/js/bunker/lobby/runtime.js

// setLobbyParticipation moved to ~/js/bunker/lobby/runtime.js

// transferLobbyHost moved to ~/js/bunker/lobby/runtime.js

// ==================== CONNECTION STATUS UI ====================

// updateConnectionStatus moved to ~/js/bunker/core/runtime.js

// ==================== SCENARIO IMAGE FUNCTIONS ====================

// Відкрити зображення в модальному вікні
// openImageModal moved to ~/js/bunker/ui/runtime.js

// Закрити модальне вікно із зображенням
// closeImageModal moved to ~/js/bunker/ui/runtime.js

// ==================== BUNKER FOOD/WATER FUNCTIONS ====================

// bunkerResourceCommandId moved to ~/js/bunker/bunker/runtime.js

// mutateBunkerResource moved to ~/js/bunker/bunker/runtime.js

// addBunkerSupplies moved to ~/js/bunker/bunker/runtime.js
// removeBunkerSupplies moved to ~/js/bunker/bunker/runtime.js
// addBunkerWater moved to ~/js/bunker/bunker/runtime.js
// removeBunkerWater moved to ~/js/bunker/bunker/runtime.js

// ==================== BUTTON EVENT BINDING ====================

// Прив'язуємо подію до кнопки створення кімнати після завантаження DOM
document.addEventListener('DOMContentLoaded', function () {
	const createRoomBtn = document.getElementById('createRoomBtn');
	if (createRoomBtn) {
		createRoomBtn.addEventListener('click', function (e) {
			e.preventDefault();
			e.stopPropagation();
			console.log('[CreateRoom] Button clicked');
			createRoom();
		});
	}

	// Ініціалізація tooltip для мобільних
	initMobileTooltips();
});

// Обробка перепідключення
connection.onreconnecting(err => {
	console.log("SignalR reconnecting...", err);
	updateConnectionStatus("⟳ Перепідключення...", false);
});

connection.onreconnected(connectionId => {
	console.log("SignalR reconnected, connectionId:", connectionId);
	myConnectionId = connectionId;
	updateConnectionStatus("✓ Перепідключено");
	if (!tryRejoin()) {
		connection.invoke("GetRooms");
	}
});

connection.onclose(err => {
	console.log("SignalR connection closed", err);
	updateConnectionStatus("✗ З'єднання втрачено. Оновіть сторінку.", true);
});

// ==================== NAME VALIDATION ====================
// sanitizeNameInput is defined in game-utils.js (loaded before this file)

// Validate player name before submission
// validatePlayerName moved to ~/js/bunker/core/runtime.js

// ==================== SESSION & PROFILE FUNCTIONS ====================

const sessionKeys = {
	roomId: 'bunker_roomId',
	playerName: 'bunker_playerName',
	hostToken: 'bunker_hostToken',
	stablePlayerId: 'bunker_stablePlayerId',
	reconnectToken: 'bunker_reconnectToken',
	isHost: 'bunker_isHost'
};

// saveSession moved to ~/js/bunker/core/runtime.js

// Генеруємо або отримуємо стабільний playerId
// getOrCreatePlayerId moved to ~/js/bunker/core/runtime.js

const stablePlayerId = getOrCreatePlayerId();

// clearSession moved to ~/js/bunker/core/runtime.js

// loadSession moved to ~/js/bunker/core/runtime.js

// tryRejoin moved to ~/js/bunker/core/runtime.js

// Автозаповнення імені з localStorage
// prefillPlayerName moved to ~/js/bunker/core/runtime.js

// ==================== PEEK (EYE ICON) FUNCTIONS ====================

// peekCharacteristic moved to ~/js/bunker/gm/runtime.js

// Reveal a specific characteristic value in the GM panel
// revealCharInGMPanel moved to ~/js/bunker/gm/runtime.js

// showPeekModal moved to ~/js/bunker/gm/runtime.js

// closePeekModal moved to ~/js/bunker/gm/runtime.js

// ==================== SCENARIO & EVENT FUNCTIONS ====================

var currentBunkerCapacity = 6;

// setBunkerCapacityPending moved to ~/js/bunker/gm/runtime.js

// submitBunkerCapacity moved to ~/js/bunker/gm/runtime.js

// handleBunkerCapacityKeydown moved to ~/js/bunker/gm/runtime.js

// regenerateBunker moved to ~/js/bunker/gm/runtime.js

// regenerateApocalypse moved to ~/js/bunker/gm/runtime.js

// sendGameEvent moved to ~/js/bunker/events/runtime.js

// sendQuickEvent moved to ~/js/bunker/events/runtime.js

// ==================== MOBILE TOOLTIPS ====================

// Ініціалізація tooltip для мобільних
// initMobileTooltips moved to ~/js/bunker/ui/runtime.js

// ==================== ROOM FUNCTIONS ====================

// createRoom moved to ~/js/bunker/core/runtime.js

// getInviteLink moved to ~/js/bunker/core/runtime.js

// fallbackCopyText moved to ~/js/bunker/core/runtime.js

// copyInviteLink moved to ~/js/bunker/core/runtime.js

window.copyInviteLink = copyInviteLink;

// openJoinRoomModal moved to ~/js/bunker/core/runtime.js

// joinRoom moved to ~/js/bunker/core/runtime.js

// submitJoinRoom moved to ~/js/bunker/core/runtime.js

// closeJoinModal moved to ~/js/bunker/core/runtime.js

// leaveRoom moved to ~/js/bunker/core/runtime.js


// reveal moved to ~/js/bunker/characters/runtime.js

// ==================== APOCALYPSE & BUNKER FUNCTIONS ====================

// apocalypseIconSvgRegistry and apocalypseCategoryIconRegistry are defined in apocalypse/icons.js

// resolveApocalypseCategoryIconKey is defined in apocalypse/helpers.js

// createApocalypseCategoryIcon is defined in apocalypse/render.js

// Apocalypse/lobby runtime translations moved to ~/js/bunker/i18n/game-translations.js

// apocalypseVisualThemeRegistry, apocalypseCategoryThemeRegistry, and related constants are defined in apocalypse/visual-config.js

// normalizeApocalypseVisualThemeId is defined in apocalypse/helpers.js

// resolveApocalypseVisualTheme is defined in apocalypse/helpers.js

// clearApocalypseVisualTheme is defined in apocalypse/render.js

// All apocalypse mutable state (apocalypseReactionTimers, apocalypseEffectBannerTimer, etc.) is defined in apocalypse/state.js

// ensureApocalypseAmbientRoot is defined in apocalypse/effects.js

// getApocalypseEffectsLevel is defined in apocalypse/effects.js

// setApocalypseEffectsLevel is defined in apocalypse/effects.js

// syncApocalypseEffectsPreference is defined in apocalypse/effects.js

// clearApocalypseVisualReactions is defined in apocalypse/effects.js

// triggerApocalypseVisualReaction is defined in apocalypse/effects.js

// prefersReducedApocalypseMotion is defined in apocalypse/helpers.js

// canRunApocalypseEnvironmentalEffects is defined in apocalypse/effects.js

// normalizeApocalypseCategoryToken is defined in apocalypse/helpers.js

// getApocalypseCategoryRegistry is defined in apocalypse/effects.js

// resolveApocalypseCategoryProfile is defined in apocalypse/effects.js

// getApocalypseCategoryEventPools is defined in apocalypse/effects.js

// clearApocalypseCategoryVisualState is defined in apocalypse/effects.js

// syncApocalypseCategoryVisualState is defined in apocalypse/effects.js

// renderApocalypseCategoryBadge is defined in apocalypse/render.js

// clearApocalypseAmbientEvent is defined in apocalypse/effects.js

// triggerApocalypseAmbientEvent is defined in apocalypse/effects.js

// startApocalypseAmbientScheduler is defined in apocalypse/effects.js

// stopApocalypseAmbientScheduler is defined in apocalypse/effects.js

// resetApocalypseParallax is defined in apocalypse/effects.js

// flushApocalypseParallax is defined in apocalypse/effects.js

// queueApocalypseParallaxUpdate is defined in apocalypse/effects.js

// initApocalypseParallaxManager is defined in apocalypse/effects.js

// clearApocalypseCardRevealWave is defined in apocalypse/effects.js

// triggerApocalypseCardRevealWave is defined in apocalypse/effects.js

// syncDocumentVisibilityEffects is defined in apocalypse/effects.js

// applyApocalypseVisualTheme is defined in apocalypse/render.js

// syncApocalypseVisualTheme is defined in apocalypse/render.js

// syncPublicGameSettings moved to ~/js/bunker/apocalypse/runtime.js

// normalizeApocalypseMetadataValue is defined in apocalypse/helpers.js

// resolveApocalypseVisualVariant is defined in apocalypse/helpers.js

// normalizeLocalScenarioImageUrl is defined in apocalypse/helpers.js

// getApocalypseDangerKey is defined in apocalypse/helpers.js

// getApocalypseDangerLabel is defined in apocalypse/helpers.js

// buildApocalypseScenarioModel is defined in apocalypse/helpers.js

// renderApocalypseIcon is defined in apocalypse/render.js

// renderApocalypseContentSection is defined in apocalypse/render.js

// renderApocalypseScenario is defined in apocalypse/render.js

// renderApocalypse moved to ~/js/bunker/apocalypse/runtime.js

// handleApocalypseHeroImageError is defined in apocalypse/render.js

// openCurrentApocalypseImage is defined in apocalypse/render.js

// ==================== VOTING FUNCTIONS ====================

// endRound moved to ~/js/bunker/voting/runtime.js

// rollRoundDice moved to ~/js/bunker/voting/runtime.js

// markAllPlayersReady moved to ~/js/bunker/voting/runtime.js

// submitVotingReadyStatus moved to ~/js/bunker/voting/runtime.js

// startVoting moved to ~/js/bunker/voting/runtime.js

// showVotingPanel moved to ~/js/bunker/voting/runtime.js

// updateVotingCandidates moved to ~/js/bunker/voting/runtime.js

// voteFor moved to ~/js/bunker/voting/runtime.js

// endVotingEarly moved to ~/js/bunker/voting/runtime.js

// cancelVoting moved to ~/js/bunker/voting/runtime.js

// showVotingResults moved to ~/js/bunker/voting/runtime.js

// eliminateTopVoted moved to ~/js/bunker/voting/runtime.js

// resolveNoElimination moved to ~/js/bunker/voting/runtime.js

// normalizeBunkerMetadataValue moved to ~/js/bunker/bunker/runtime.js

// resolveBunkerCondition moved to ~/js/bunker/bunker/runtime.js

// getBunkerConditionLabel moved to ~/js/bunker/bunker/runtime.js

// getBunkerCapacityValue moved to ~/js/bunker/bunker/runtime.js

// resolveBunkerVisualVariant moved to ~/js/bunker/bunker/runtime.js

// buildBunkerFacilityModel moved to ~/js/bunker/bunker/runtime.js

// renderBunkerIcon moved to ~/js/bunker/bunker/runtime.js

// renderBunkerSectionIcon moved to ~/js/bunker/bunker/runtime.js

// renderBunkerContentSection moved to ~/js/bunker/bunker/runtime.js

// renderBunkerFacility moved to ~/js/bunker/bunker/runtime.js

// renderBunker moved to ~/js/bunker/bunker/runtime.js

// handleBunkerHeroImageError moved to ~/js/bunker/bunker/runtime.js

// openCurrentBunkerImage moved to ~/js/bunker/bunker/runtime.js

// ==================== EVENTS SYSTEM ====================

let currentEvent = null;
let eventsHistory = [];

// closeScenarioPublicModal moved to ~/js/bunker/events/runtime.js

// closeScenarioPrivateModal moved to ~/js/bunker/events/runtime.js

// renderScenarioPrivateChoices moved to ~/js/bunker/events/runtime.js

// resolveScenarioPrivateChoice moved to ~/js/bunker/events/runtime.js

// gmRevealNextBunkerIntel moved to ~/js/bunker/events/runtime.js

// gmGrantPrivateBunkerIntel moved to ~/js/bunker/events/runtime.js

// gmSkipScenarioChoice moved to ~/js/bunker/events/runtime.js

// showCurrentEvent moved to ~/js/bunker/events/runtime.js

// formatEventEffect moved to ~/js/bunker/events/runtime.js

// applyCurrentEventEffect moved to ~/js/bunker/events/runtime.js

// dismissCurrentEvent moved to ~/js/bunker/events/runtime.js

// addEventToHistory moved to ~/js/bunker/events/runtime.js

// ==================== GAME MASTER FUNCTIONS ====================

// setOmniscientPending moved to ~/js/bunker/gm/runtime.js
// previewEnterOmniscientGm moved to ~/js/bunker/gm/runtime.js
// enterOmniscientGm moved to ~/js/bunker/gm/runtime.js

// clearOmniscientHiddenState moved to ~/js/bunker/gm/runtime.js

// resyncOmniscientHiddenState moved to ~/js/bunker/gm/runtime.js

// buildDirectorRequest moved to ~/js/bunker/gm/runtime.js
// syncDirectorControls moved to ~/js/bunker/gm/runtime.js
// setDirectorPending moved to ~/js/bunker/gm/runtime.js
// previewDirectorAction moved to ~/js/bunker/gm/runtime.js
// applyDirectorAction moved to ~/js/bunker/gm/runtime.js

// renderOmniscientHiddenState moved to ~/js/bunker/gm/runtime.js

// refreshGlobalContentCatalogAccess moved to ~/js/bunker/gm/runtime.js

// loadGlobalContentCategories moved to ~/js/bunker/gm/runtime.js

// loadGlobalContentPage moved to ~/js/bunker/gm/runtime.js

// renderGlobalContentPage moved to ~/js/bunker/global-content/runtime.js

// loadGlobalContentEntry moved to ~/js/bunker/global-content/runtime.js

// changeGlobalContentPage moved to ~/js/bunker/global-content/runtime.js
// scheduleGlobalContentSearch moved to ~/js/bunker/global-content/runtime.js
// renderGlobalCatalogError moved to ~/js/bunker/global-content/runtime.js

// setGlobalDraftPending moved to ~/js/bunker/global-content/runtime.js
// selectedGlobalDraftId moved to ~/js/bunker/global-content/runtime.js
// loadGlobalContentDrafts moved to ~/js/bunker/global-content/runtime.js
// renderGlobalDraftState moved to ~/js/bunker/global-content/runtime.js
// runGlobalDraftCommand moved to ~/js/bunker/global-content/runtime.js
// createGlobalContentDraft moved to ~/js/bunker/global-content/runtime.js
// applyGlobalDraftCommand moved to ~/js/bunker/global-content/runtime.js
// validateGlobalDraft moved to ~/js/bunker/global-content/runtime.js
// previewGlobalDraftDiff moved to ~/js/bunker/global-content/runtime.js
// discardGlobalDraft moved to ~/js/bunker/global-content/runtime.js
// commitGlobalDraft moved to ~/js/bunker/global-content/runtime.js
// loadGlobalContentBackups moved to ~/js/bunker/global-content/runtime.js
// previewGlobalRollback moved to ~/js/bunker/global-content/runtime.js
// executeGlobalRollback moved to ~/js/bunker/global-content/runtime.js
// previewStableIdMigration moved to ~/js/bunker/global-content/runtime.js
// applyStableIdMigration moved to ~/js/bunker/global-content/runtime.js



// setGmDiagnosticsPending moved to ~/js/bunker/gm/runtime.js

// diagnosticsCommand moved to ~/js/bunker/gm/runtime.js

// runRoomIntegrityCheck moved to ~/js/bunker/gm/runtime.js

// previewRoomAutoFix moved to ~/js/bunker/gm/runtime.js

// applyRoomAutoFix moved to ~/js/bunker/gm/runtime.js

// refreshGmAudit moved to ~/js/bunker/gm/runtime.js

// setGmSnapshotPending moved to ~/js/bunker/gm/runtime.js

// invokeSnapshotCommand moved to ~/js/bunker/gm/runtime.js

// refreshRoomSnapshots moved to ~/js/bunker/gm/runtime.js

// createManualRoomSnapshot moved to ~/js/bunker/gm/runtime.js

// previewRoomSnapshot moved to ~/js/bunker/gm/runtime.js

// restoreRoomSnapshot moved to ~/js/bunker/gm/runtime.js

// undoLastGmAction moved to ~/js/bunker/gm/runtime.js

// setRoomLocalEditorPending moved to ~/js/bunker/gm/runtime.js

// currentRoomLocalEditorSelection moved to ~/js/bunker/gm/runtime.js

// previewRoomLocalEdit moved to ~/js/bunker/gm/runtime.js

// applyRoomLocalEdit moved to ~/js/bunker/gm/runtime.js

// renderRoomLocalEditor moved to ~/js/bunker/gm/runtime.js

// syncRoomLocalEditorField moved to ~/js/bunker/gm/runtime.js

// gmRoundCommandId moved to ~/js/bunker/gm/runtime.js

// setGmRoundCommandPending moved to ~/js/bunker/gm/runtime.js

// finishGmRoundCommand moved to ~/js/bunker/gm/runtime.js

// handleGmRoundCommandError moved to ~/js/bunker/gm/runtime.js

// invokeGmRoundCommand moved to ~/js/bunker/gm/runtime.js

// setGamePause moved to ~/js/bunker/gm/runtime.js

// previewManualRoundChange moved to ~/js/bunker/gm/runtime.js

// resetRoundReadiness moved to ~/js/bunker/gm/runtime.js

// clearCurrentVotes moved to ~/js/bunker/gm/runtime.js

// removeSelectedVote moved to ~/js/bunker/gm/runtime.js

// resyncVotingAdmin moved to ~/js/bunker/gm/runtime.js

// gameTimerDurationValue moved to ~/js/bunker/gm/runtime.js

// gameTimerCommandId moved to ~/js/bunker/gm/runtime.js

// invokeGameTimerCommand moved to ~/js/bunker/gm/runtime.js

// startGameTimer moved to ~/js/bunker/gm/runtime.js

// setGameTimer moved to ~/js/bunker/gm/runtime.js

// adjustGameTimer moved to ~/js/bunker/gm/runtime.js

// restartGameTimer moved to ~/js/bunker/gm/runtime.js

// stopGameTimer moved to ~/js/bunker/gm/runtime.js

// handleGameTimerKeydown moved to ~/js/bunker/gm/runtime.js

// renderGmVotingAdmin moved to ~/js/bunker/gm/runtime.js

// markGMServerUpdate moved to ~/js/bunker/gm/runtime.js

// renderGMPanelState moved to ~/js/bunker/gm/runtime.js

// renderGMThreatControl moved to ~/js/bunker/gm/runtime.js

// renderGMThreatAudit moved to ~/js/bunker/gm/runtime.js

// renderRoomDiagnostics moved to ~/js/bunker/gm/runtime.js

// renderRoomSnapshots moved to ~/js/bunker/gm/runtime.js

// renderUnifiedGmAudit moved to ~/js/bunker/gm/runtime.js

// filterGMThreatOptions moved to ~/js/bunker/gm/runtime.js

// gmThreatCommandId moved to ~/js/bunker/gm/runtime.js

// confirmGMThreatReplacement moved to ~/js/bunker/gm/runtime.js

// invokeGMThreatCommand moved to ~/js/bunker/gm/runtime.js

// gmGenerateRareThreat moved to ~/js/bunker/gm/runtime.js
// gmGenerateTextThreat moved to ~/js/bunker/gm/runtime.js
// gmSelectSpecificThreat moved to ~/js/bunker/gm/runtime.js
// gmCancelThreat moved to ~/js/bunker/gm/runtime.js
// gmRestartThreat moved to ~/js/bunker/gm/runtime.js
// gmResyncThreatRoom moved to ~/js/bunker/gm/runtime.js

// setGMThreatForcePending moved to ~/js/bunker/gm/runtime.js

// requestGMThreatForcePreview moved to ~/js/bunker/gm/runtime.js

// refreshGMThreatForcePreview moved to ~/js/bunker/gm/runtime.js

// renderGMThreatForcePreview moved to ~/js/bunker/gm/runtime.js

// confirmGMThreatForce moved to ~/js/bunker/gm/runtime.js

// closeGMThreatForceModal moved to ~/js/bunker/gm/runtime.js

// invokeGMThreatEmergency moved to ~/js/bunker/gm/runtime.js

// updateGMPlayerSelect moved to ~/js/bunker/gm/runtime.js

// loadPlayerDataForGM moved to ~/js/bunker/gm/runtime.js

// renderGMAdditionalConditions moved to ~/js/bunker/gm/runtime.js

// Об'єкт для зберігання розкритих характеристик у GM панелі
var gmRevealedChars = {};

// Форматування особистості
// formatPersonality moved to ~/js/bunker/gm/runtime.js

// Форматування статури
// formatBody moved to ~/js/bunker/gm/runtime.js

// Безпечне отримання значення характеристики з обох регістрів
// getCharValue moved to ~/js/bunker/gm/runtime.js

// editCharacteristic moved to ~/js/bunker/gm/runtime.js

// submitEditCharacteristic moved to ~/js/bunker/gm/runtime.js

// clearCharacteristic moved to ~/js/bunker/gm/runtime.js

// closeEditCharModal moved to ~/js/bunker/gm/runtime.js

// regenerateCharacteristic moved to ~/js/bunker/gm/runtime.js

// forceReveal moved to ~/js/bunker/gm/runtime.js

// eliminateSelectedPlayer moved to ~/js/bunker/gm/runtime.js

// restoreSelectedPlayer moved to ~/js/bunker/gm/runtime.js

// gmPlayerCommandId moved to ~/js/bunker/gm/runtime.js

// invokeGMPlayerCommand moved to ~/js/bunker/gm/runtime.js

// resyncSelectedPlayer moved to ~/js/bunker/gm/runtime.js

// inspectSelectedConnection moved to ~/js/bunker/gm/runtime.js

// hideSelectedCharacteristic moved to ~/js/bunker/gm/runtime.js

// transferHostToSelectedPlayer moved to ~/js/bunker/gm/runtime.js

// kickSelectedPlayer moved to ~/js/bunker/gm/runtime.js

// changeSelectedConditionSeverity moved to ~/js/bunker/gm/runtime.js

// removeSelectedCondition moved to ~/js/bunker/gm/runtime.js

// ==================== UI FUNCTIONS ====================

// showLobbySection moved to ~/js/bunker/gm/runtime.js

// showRoomSection moved to ~/js/bunker/ui/runtime.js

// updateRoomUI moved to ~/js/bunker/ui/runtime.js

// Нова функція для оновлення GM секцій
// updateGMSections moved to ~/js/bunker/ui/runtime.js

// renderRoomsList moved to ~/js/bunker/ui/runtime.js

// renderRoomPlayers moved to ~/js/bunker/ui/runtime.js

// lobbyGet moved to ~/js/bunker/ui/runtime.js
const lobbySettingNumberKeys = new Set(['maxGameplayPlayers', 'minGameplayPlayers', 'manualBunkerCapacity', 'randomBunkerCapacityMin', 'randomBunkerCapacityMax', 'firstThreatRound', 'maxThreatsPerGame', 'roundTimerDurationSeconds', 'votingStartRound', 'specialCardsPerPlayer', 'bonusInventoryRound', 'bonusInventoryCount', 'startingInventoryCount', 'scenarioFirstAfterRound', 'scenarioIntervalRounds', 'bunkerIntelIntervalRounds', 'interactiveApocalypseChancePercent']);
const lobbySettingNullableNumberKeys = new Set(['manualBunkerCapacity', 'randomBunkerCapacityMin', 'randomBunkerCapacityMax', 'maxThreatsPerGame']);
const lobbySettingBooleanKeys = new Set(['spectatorsAllowed', 'allowSpectatorsAfterStart', 'allowLateGameplayJoin', 'lockRoomOnStart', 'joinsLocked', 'hostCanStartWithoutAllReady', 'resetReadinessAfterSettingsChange', 'apocalypseEnabled', 'allowInteractiveApocalypses', 'apocalypseThemeEnabled', 'bunkerScenarioEnabled', 'threatsEnabled', 'avoidRepeatedThreats', 'roundTimerEnabled', 'autoStartRoundTimer', 'pauseTimerOnHostDisconnect', 'votingEnabled', 'specialCardsEnabled', 'bonusInventoryEnabled', 'scenarioEnabled', 'scenarioThreatEnabled', 'scenarioEventEnabled', 'scenarioSecretEventEnabled']);

// normalizeLobbySettings moved to ~/js/bunker/ui/runtime.js

// isLobbyConfiguredSystemEnabled moved to ~/js/bunker/ui/runtime.js

// updateScenarioSectionVisibility moved to ~/js/bunker/lobby/runtime.js

// lobbyAmCurrentHost moved to ~/js/bunker/lobby/runtime.js

// syncLobbySettingsState moved to ~/js/bunker/lobby/runtime.js

// lobbyPresetLabel moved to ~/js/bunker/lobby/runtime.js
// lobbyFrequencyLabel moved to ~/js/bunker/lobby/runtime.js
// lobbyCapacityLabel moved to ~/js/bunker/lobby/runtime.js
// setLobbySettingsFeedback moved to ~/js/bunker/lobby/runtime.js
// lobbyWarningText moved to ~/js/bunker/lobby/runtime.js
// lobbyAuditLabel moved to ~/js/bunker/lobby/runtime.js

// ensureLobbyApocalypseCatalog moved to ~/js/bunker/lobby/runtime.js

// markLobbyApocalypseDraftChanged moved to ~/js/bunker/lobby/runtime.js

// updateLobbyActivationDraft moved to ~/js/bunker/lobby/runtime.js

// renderLobbyApocalypseActivation moved to ~/js/bunker/lobby/runtime.js

// renderLobbyApocalypseEditor moved to ~/js/bunker/lobby/runtime.js

// buildLobbyApocalypseGroupedModel moved to ~/js/bunker/lobby/runtime.js

// createLobbyApocalypseOption moved to ~/js/bunker/lobby/runtime.js

// renderLobbyGameSetup moved to ~/js/bunker/lobby/runtime.js

// updateLobbySettingsDraft moved to ~/js/bunker/lobby/runtime.js

// loadLobbyServerPreset moved to ~/js/bunker/lobby/runtime.js

// lobbySettingsHubPayload moved to ~/js/bunker/lobby/runtime.js

// applyLobbySettings moved to ~/js/bunker/lobby/runtime.js

// readLobbyLocalPresets moved to ~/js/bunker/lobby/runtime.js
// writeLobbyLocalPresets moved to ~/js/bunker/lobby/runtime.js
// renderLobbyLocalPresetOptions moved to ~/js/bunker/lobby/runtime.js
// saveLobbyLocalPreset moved to ~/js/bunker/lobby/runtime.js
// loadLobbyLocalPreset moved to ~/js/bunker/lobby/runtime.js
// deleteLobbyLocalPreset moved to ~/js/bunker/lobby/runtime.js
// exportLobbyPreset moved to ~/js/bunker/lobby/runtime.js
// importLobbyPresetFile moved to ~/js/bunker/lobby/runtime.js

// updateLobbyPassword moved to ~/js/bunker/lobby/runtime.js
// resetLobbyMemberReady moved to ~/js/bunker/lobby/runtime.js
// kickLobbyMember moved to ~/js/bunker/lobby/runtime.js

// bindLobbySettingsControls moved to ~/js/bunker/lobby/runtime.js
// isLobbyRunning moved to ~/js/bunker/lobby/runtime.js

// tryRenderRunningGameState moved to ~/js/bunker/lobby/runtime.js

// localizeLobbyLifecycle moved to ~/js/bunker/lobby/runtime.js
// localizeLobbyRole moved to ~/js/bunker/lobby/runtime.js
// lobbyRoleHelp moved to ~/js/bunker/lobby/runtime.js
// localizeLobbyBlocker moved to ~/js/bunker/lobby/runtime.js
// renderLobbyPreviewSummary moved to ~/js/bunker/lobby/runtime.js

// isGuestGameplayLobbyMember moved to ~/js/bunker/lobby/runtime.js

// guestWarningStorageKey moved to ~/js/bunker/lobby/runtime.js

// showGuestWarningIfEligible moved to ~/js/bunker/lobby/runtime.js

// hideGuestWarningModal moved to ~/js/bunker/lobby/runtime.js

// continueAsGuest moved to ~/js/bunker/lobby/runtime.js

// registerFromGuestWarning moved to ~/js/bunker/lobby/runtime.js

// handleGuestWarningKeydown moved to ~/js/bunker/lobby/runtime.js

// renderLobbyState moved to ~/js/bunker/lobby/runtime.js


// getMyStablePlayerId moved to ~/js/bunker/core/runtime.js

// isMyPlayerRef moved to ~/js/bunker/core/runtime.js

// renderSpecialCardIcon moved to ~/js/bunker/special-cards/runtime.js

// resolveSpecialCardVisualVariant moved to ~/js/bunker/special-cards/runtime.js

// resolveSpecialCardIconKey moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardVariantLabel moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardStageLabel moved to ~/js/bunker/special-cards/runtime.js

// canUseSpecialCardNow moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardSelectionKey moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardTargetRef moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardStatusLabel moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardPrivacyLabel moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardPrivacyClass moved to ~/js/bunker/special-cards/runtime.js

// getSpecialCardTargets moved to ~/js/bunker/special-cards/runtime.js

// getAutomaticSpecialCardOrderLabel moved to ~/js/bunker/special-cards/runtime.js

// rememberSpecialCardSelection moved to ~/js/bunker/special-cards/runtime.js

// captureSpecialCardSelections moved to ~/js/bunker/special-cards/runtime.js

// resolveSpecialCardTooltipContent moved to ~/js/bunker/special-cards/runtime.js

// buildSpecialCardModel moved to ~/js/bunker/special-cards/runtime.js

// renderSpecialCardControls moved to ~/js/bunker/special-cards/runtime.js

// useSpecialCardFromCard moved to ~/js/bunker/special-cards/runtime.js

// renderSpecialCard moved to ~/js/bunker/special-cards/runtime.js

// renderMySpecialCards moved to ~/js/bunker/special-cards/runtime.js





// eventCardPlayerOptions moved to ~/js/bunker/special-cards/runtime.js

// renderMyEventCards moved to ~/js/bunker/special-cards/runtime.js

// useEventSpecialCard moved to ~/js/bunker/special-cards/runtime.js

// buildSpecialCardRows moved to ~/js/bunker/special-cards/runtime.js

// buildGMSpecialCardRows moved to ~/js/bunker/special-cards/runtime.js

// renderSpecialCardRows moved to ~/js/bunker/special-cards/runtime.js

// updateSpecialCardsUI moved to ~/js/bunker/public-overview/runtime.js

// isPublicGameplayPlayer moved to ~/js/bunker/public-overview/runtime.js

// getCanonicalPublicPlayerModels moved to ~/js/bunker/public-overview/runtime.js

// getPublicActivePlayerSeat moved to ~/js/bunker/public-overview/runtime.js

// resolveSelectedPublicPlayer moved to ~/js/bunker/public-overview/runtime.js

// selectPublicPlayerSeat moved to ~/js/bunker/public-overview/runtime.js

// navigatePublicPlayerOverview moved to ~/js/bunker/public-overview/runtime.js

// ensurePublicPlayerOverviewEvents moved to ~/js/bunker/public-overview/runtime.js

// renderPublicPlayerBadges moved to ~/js/bunker/public-overview/runtime.js

// renderPublicPlayerSelectorItem moved to ~/js/bunker/public-overview/runtime.js

// renderPublicCharacteristicCard moved to ~/js/bunker/public-overview/runtime.js

// renderPublicPropertyDetails moved to ~/js/bunker/public-overview/runtime.js

// getPublicRevealedCount moved to ~/js/bunker/public-overview/runtime.js

// sortPublicPlayerModels moved to ~/js/bunker/public-overview/runtime.js

// renderComparisonCharacteristic moved to ~/js/bunker/public-overview/runtime.js

// renderPlayerDossierCard moved to ~/js/bunker/public-overview/runtime.js

// renderAllPlayersComparison moved to ~/js/bunker/public-overview/runtime.js

// updatePublicPlayerComparisonToolbar moved to ~/js/bunker/public-overview/runtime.js

// renderPublicPlayerOverview moved to ~/js/bunker/public-overview/runtime.js

// formatAdditionalPhysicalCondition moved to ~/js/bunker/characters/runtime.js

// buildSharedHealthTooltip moved to ~/js/bunker/characters/runtime.js

// buildAdditionalPhysicalConditionTooltip moved to ~/js/bunker/characters/runtime.js

// renderAdditionalPhysicalCondition moved to ~/js/bunker/characters/runtime.js

// renderAdditionalPhysicalConditionsForOverview moved to ~/js/bunker/characters/runtime.js


// normalizeProfessionIconTags moved to ~/js/bunker/characters/runtime.js

// resolveProfessionIconKey moved to ~/js/bunker/characters/runtime.js

// renderCharacteristicIcon moved to ~/js/bunker/characters/runtime.js

// formatHobbyExperience moved to ~/js/bunker/characters/runtime.js

// formatHobbyRelatedItem moved to ~/js/bunker/characters/runtime.js

// nonEmptyCardDetail moved to ~/js/bunker/characters/runtime.js

// buildHobbyCardDetails moved to ~/js/bunker/characters/runtime.js

// resolveHobbyCardTooltip moved to ~/js/bunker/characters/runtime.js

// normalizeVariantMetadata moved to ~/js/bunker/characters/runtime.js

// normalizeCharacteristicSeverity moved to ~/js/bunker/characters/runtime.js

// resolveCharacteristicVisualVariant moved to ~/js/bunker/characters/runtime.js

// resolveCharacteristicTooltipContent moved to ~/js/bunker/characters/runtime.js

// buildHealthCardPresentation moved to ~/js/bunker/characters/runtime.js

// renderCharacteristicCard moved to ~/js/bunker/characters/runtime.js

// Рендер карток моїх характеристик
// renderMyPlayerCards moved to ~/js/bunker/characters/runtime.js

// renderEliminatedRevealAllPanel moved to ~/js/bunker/characters/runtime.js

// revealAllEliminatedPlayerCharacteristics moved to ~/js/bunker/characters/runtime.js

// addEventMessage moved to ~/js/bunker/ui/runtime.js

