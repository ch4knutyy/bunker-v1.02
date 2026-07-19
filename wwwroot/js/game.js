const connection = new signalR.HubConnectionBuilder()
	.withUrl("/gameHub")
	.withAutomaticReconnect()
	.build();

registerSignalREvents();
console.log("[SignalR] about to call connection.start()");
connection.start()
	.then(() => {
		console.log("SignalR connected, connectionId:", connection.connectionId);
		myConnectionId = connection.connectionId;

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

// Дані
let currentRoom = null;
let myPlayerData = null;
let myConnectionId = null;
let isHost = false;
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
let lobbySettingsBaseRevision = 0;
let lobbySettingsDirty = false;
let lobbySettingsPending = false;
let lobbySettingsOwnerId = '';
let lobbySettingsActiveTab = 'basic';
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
let gmLastServerUpdateAt = null;
let gmLastCommandError = '';
let pendingJoinRoomId = null; // Для закриття модалки після успішного join
let hostToken = null;
let reconnectToken = null;
let currentApocalypse = null;
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

// ==================== GLOBAL HELPER FUNCTIONS ====================

// Escape HTML to prevent XSS
function escapeHtml(text) {
	if (text == null) return '';
	return String(text)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

function getRoomIdFromPath() {
	const match = window.location.pathname.match(/^\/room\/([^/?#]+)/i);
	return match ? decodeURIComponent(match[1]) : null;
}

const uiTranslations = {
	uk: {
		createRoom: "Створити кімнату", availableRooms: "Доступні кімнати", loadingRooms: "Завантаження кімнат...", noRooms: "Немає доступних кімнат. Створіть свою!", playerNamePlaceholder: "Ваше ім'я...", roomNamePlaceholder: "Назва кімнати...", maxPlayersPlaceholder: "Макс. гравців", passwordOptionalPlaceholder: "Пароль (необов'язково)", passwordIfAnyPlaceholder: "Пароль (якщо є)", room: "Кімната", lobby: "Лобі", game: "Гра", gmPanel: "🎮 GM Панель", voting: "🗳️ Голосування", startGame: "Почати гру", leaveRoom: "Покинути кімнату", players: "Гравці", host: "Хост", you: "Ви", eliminated: "ВИБУВ", myCharacteristics: "Мої характеристики (бачу тільки я)", bunkerAndApocalypse: "🎭 Бункер та Апокаліпсис", apocalypse: "Апокаліпсис", bunker: "Бункер", playersInBunker: "Гравці в бункері:", gameEvents: "Ігрові події", eventsHistory: "Історія подій", eventsPlaceholder: "Тут будуть відображатися події гри...", reveal: "Розкрити всім", revealed: "Відкрито для всіх", hidden: "Приховано", unknown: "Невідомо", profession: "Професія", inventory: "Інвентар", vote: "Голосувати", roomCode: "Код кімнати", name: "Назва", age: "Вік", years: "років", sex: "Стать", orientation: "Орієнтація", personality: "Особистість", body: "Статура", height: "Зріст", weight: "Вага", bodyType: "Тип тіла", physicalHealth: "Фізичне здоров'я", mentalHealth: "Психічне здоров'я", state: "Стан", hobby: "Хобі", activity: "Заняття", characterTrait: "Риса характеру", trait: "Риса", phobia: "Фобія", fear: "Страх", items: "Предмети", fact: "Факт", empty: "Порожній", noFact: "Немає факту", noData: "Немає даних гравця", use: "Використати", close: "Закрити", capacity: "Місткість", condition: "Стан", supplies: "Запаси", location: "Локація", threats: "⚠️ Загрози:", requirements: "✓ Потрібно:", facilities: "🏗️ Приміщення:", resources: "📦 Ресурси:", problems: "⚠️ Проблеми:", survivalChance: "Шанс виживання", duration: "Тривалість", threatLevel: "Загроза", uploadImage: "📤 Завантажити зображення", generatePrompt: "✨ Згенерувати промпт", remove: "🗑️ Видалити", specialCards: "Спеціальні карти", mySpecialCards: "Мої спеціальні карти", revealedSpecialCards: "Розкриті спеціальні карти", noRevealedSpecialCards: "Поки що немає розкритих спеціальних карт.", cardInHand: "У руці", cardRevealed: "Розкрита", cardUsed: "Використана", cardActive: "Активна", specialCard: "Спеціальна карта", description: "Опис", effect: "Ефект", target: "Ціль", status: "Статус", threat: "Загроза", threatUnknownDescription: "Загроза ще не розкрита."
	},
	en: {
		createRoom: "Create Room", availableRooms: "Available Rooms", loadingRooms: "Loading rooms...", noRooms: "No available rooms. Create your own!", playerNamePlaceholder: "Your name...", roomNamePlaceholder: "Room name...", maxPlayersPlaceholder: "Max players", passwordOptionalPlaceholder: "Password (optional)", passwordIfAnyPlaceholder: "Password (if any)", room: "Room", lobby: "Lobby", game: "Game", gmPanel: "🎮 GM Panel", voting: "🗳️ Voting", startGame: "Start Game", leaveRoom: "Leave Room", players: "Players", host: "Host", you: "You", eliminated: "ELIMINATED", myCharacteristics: "My characteristics (only I can see)", bunkerAndApocalypse: "🎭 Bunker and Apocalypse", apocalypse: "Apocalypse", bunker: "Bunker", playersInBunker: "Players in bunker:", gameEvents: "Game Events", eventsHistory: "Event History", eventsPlaceholder: "Game events will appear here...", reveal: "Reveal to all", revealed: "Revealed to all", hidden: "Hidden", unknown: "Unknown", profession: "Profession", inventory: "Inventory", vote: "Vote", roomCode: "Room Code", name: "Name", age: "Age", years: "years", sex: "Sex", orientation: "Orientation", personality: "Personality", body: "Body", height: "Height", weight: "Weight", bodyType: "Body type", physicalHealth: "Physical health", mentalHealth: "Mental health", state: "State", hobby: "Hobby", activity: "Activity", characterTrait: "Character trait", trait: "Trait", phobia: "Phobia", fear: "Fear", items: "Items", fact: "Fact", empty: "Empty", noFact: "No fact", noData: "No player data", use: "Use", close: "Close", capacity: "Capacity", condition: "Condition", supplies: "Supplies", location: "Location", threats: "⚠️ Threats:", requirements: "✓ Required:", facilities: "🏗️ Facilities:", resources: "📦 Resources:", problems: "⚠️ Problems:", survivalChance: "Survival chance", duration: "Duration", threatLevel: "Threat", uploadImage: "📤 Upload image", generatePrompt: "✨ Generate prompt", remove: "🗑️ Remove", specialCards: "Special cards", mySpecialCards: "My special cards", revealedSpecialCards: "Revealed special cards", noRevealedSpecialCards: "No special cards have been revealed yet.", cardInHand: "In hand", cardRevealed: "Revealed", cardUsed: "Used", cardActive: "Active", specialCard: "Special card", description: "Description", effect: "Effect", target: "Target", status: "Status", threat: "Threat", threatUnknownDescription: "The threat has not been revealed yet."
	},
	ru: {
		createRoom: "Создать комнату", availableRooms: "Доступные комнаты", loadingRooms: "Загрузка комнат...", noRooms: "Нет доступных комнат. Создайте свою!", playerNamePlaceholder: "Ваше имя...", roomNamePlaceholder: "Название комнаты...", maxPlayersPlaceholder: "Макс. игроков", passwordOptionalPlaceholder: "Пароль (необязательно)", passwordIfAnyPlaceholder: "Пароль (если есть)", room: "Комната", lobby: "Лобби", game: "Игра", gmPanel: "🎮 GM Панель", voting: "🗳️ Голосование", startGame: "Начать игру", leaveRoom: "Покинуть комнату", players: "Игроки", host: "Ведущий", you: "Вы", eliminated: "ВЫБЫЛ", myCharacteristics: "Мои характеристики (вижу только я)", bunkerAndApocalypse: "🎭 Бункер и Апокалипсис", apocalypse: "Апокалипсис", bunker: "Бункер", playersInBunker: "Игроки в бункере:", gameEvents: "Игровые события", eventsHistory: "История событий", eventsPlaceholder: "Здесь будут отображаться события игры...", reveal: "Раскрыть всем", revealed: "Открыто для всех", hidden: "Скрыто", unknown: "Неизвестно", profession: "Профессия", inventory: "Инвентарь", vote: "Голосовать", roomCode: "Код комнаты", name: "Название", age: "Возраст", years: "лет", sex: "Пол", orientation: "Ориентация", personality: "Личность", body: "Телосложение", height: "Рост", weight: "Вес", bodyType: "Тип тела", physicalHealth: "Физическое здоровье", mentalHealth: "Психическое здоровье", state: "Состояние", hobby: "Хобби", activity: "Занятие", characterTrait: "Черта характера", trait: "Черта", phobia: "Фобия", fear: "Страх", items: "Предметы", fact: "Факт", empty: "Пусто", noFact: "Нет факта", noData: "Нет данных игрока", use: "Использовать", close: "Закрыть", capacity: "Вместимость", condition: "Состояние", supplies: "Запасы", location: "Локация", threats: "⚠️ Угрозы:", requirements: "✓ Нужно:", facilities: "🏗️ Помещения:", resources: "📦 Ресурсы:", problems: "⚠️ Проблемы:", survivalChance: "Шанс выживания", duration: "Длительность", threatLevel: "Угроза", uploadImage: "📤 Загрузить изображение", generatePrompt: "✨ Сгенерировать промпт", remove: "🗑️ Удалить", specialCards: "Специальные карты", mySpecialCards: "Мои специальные карты", revealedSpecialCards: "Раскрытые специальные карты", noRevealedSpecialCards: "Пока нет раскрытых специальных карт.", cardInHand: "В руке", cardRevealed: "Раскрыта", cardUsed: "Использована", cardActive: "Активна", specialCard: "Специальная карта", description: "Описание", effect: "Эффект", target: "Цель", status: "Статус", threat: "Угроза", threatUnknownDescription: "Угроза ещё не раскрыта."
	}
};

Object.assign(uiTranslations.uk, {
	property: "Майно",
	propertyUnavailable: "Майно відсутнє",
	useSpecialCard: "Використати карту",
	activateSpecialCard: "Активувати карту",
	cardWasUsed: "Карту використано",
	unavailableNow: "Недоступно зараз",
	choosePlayer: "Оберіть гравця",
	confirm: "Підтвердити",
	cancel: "Скасувати",
	noAvailableTarget: "Немає доступної цілі",
	noBigItem: "У гравця немає великого предмета",
	noSmallItem: "У гравця немає малого предмета",
	noItems: "У гравця немає предметів",
	noSpecialCards: "У гравця немає спеціальних карт",
	cardUsedSuccessfully: "Карту успішно використано",
	allReady: "Всі готові",
	allPlayersReady: "Усі гравці готові",
	threatRevealed: "Загрозу розкрито",
	threat: "Загроза",
	unknown: "Невідомо",
	threatUnknownDescription: "Загроза ще не розкрита.",
	requirements: "Потрібно",
	risks: "Ризики",
	consequences: "Наслідки",
	severity: "Рівень",
	category: "Категорія",
	round: "Раунд",
	revealThreat: "Розкрити загрозу",
	hiddenSecretCard: "Прихована секретна карта",
	hiddenDetails: "Деталі приховані",
	secretCardBadge: "Секретна",
	publicCardBadge: "Публічна",
	secretRevealedBadge: "Секретна, розкрита",
	useSecretly: "Використати тихо",
	usePublicly: "Використати публічно",
	activeUntilRoundEnd: "Активна до кінця раунду",
	effectEnded: "Ефект завершено",
	specialPending: "Виконується…", specialAvailableNow: "Доступна зараз", specialTargetRequired: "Потрібно обрати ціль",
	specialStageBeforeVoting: "Перед голосуванням", specialStageDiscussion: "Під час обговорення", specialStageLabel: "Етап", specialEffectLabel: "Ефект",
	specialChooseCharacteristic: "Оберіть характеристику", specialCharacteristicLabel: "Характеристика", specialNotIssued: "Спеціальну карту не видано",
	specialVariantReveal: "Розкриття", specialVariantProtect: "Захист", specialVariantSteal: "Перехоплення", specialVariantSwap: "Обмін", specialVariantReroll: "Перегенерація", specialVariantChange: "Зміна", specialVariantGlobal: "Глобальний ефект", specialVariantThreat: "Загроза", specialVariantInventory: "Спорядження", specialVariantNeutral: "Особлива дія",
	notUsed: "Не використана",
	used: "Використана",
	youHaveBeenEliminated: "Ви вибули з гри",
	canRevealAllAfterElimination: "Ви можете розкрити всі свої характеристики",
	revealAllCharacteristics: "Розкрити всі характеристики",
	allCharacteristicsRevealed: "Усі характеристики розкрито",
	eliminatedRevealedBadge: "Вибув — характеристики розкрито",
	eliminatedRevealedAllLog: "Вибулий гравець розкрив усі свої характеристики",
	radiationOperation: "Операція",
	openOperation: "Відкрити операцію",
	team: "Команда",
	equipment: "Спорядження",
	operation: "Операція",
	joinTeam: "Долучитися",
	leaveTeam: "Вийти з команди",
	addEquipment: "Додати спорядження",
	useProfession: "Використати професію",
	useHobby: "Використати хобі",
	startOperation: "Почати операцію",
	answer: "Відповісти",
	leader: "Керівник",
	chooseLeader: "Змінити керівника",
	playersInRoom: "Гравців у кімнаті",
	operationStages: "Етапів операції",
	allowedErrors: "Допустимих помилок",
	hints: "Підказок",
	secondsPerStage: "Секунд на етап",
	currentProgress: "Прогрес",
	currentQuestion: "Поточне питання",
	availableHints: "Доступні підказки",
	useHint: "Підказка",
	noOperationQuestion: "Операція ще не почалась.",
	noLeader: "Керівника не вибрано",
	forcedParticipant: "Примусовий учасник",
	protectedParticipant: "Захищений",
	additionalConditions: "Додаткові стани",
	notStarted: "Не почато",
	collecting_contributions: "Збір команди",
	mini_game_active: "Операція триває",
	active: "Операція триває",
	resolved_safely: "Загрозу повністю усунено",
	resolved_with_casualty: "Загрозу усунено з наслідками",
	failed: "Операція провалена"
	, aborted: "Загрозу скасовано ведучим"
	, gmThreatEmergency: "Аварійне керування", gmThreatResync: "Оновити стан загрози", gmThreatReset: "Перезапустити спробу", gmThreatAbort: "Скасувати загрозу"
	, gmThreatHistory: "Історія загроз", gmThreatHistoryEmpty: "Подій загроз ще немає"
	, gmThreatEventRevealed: "Загрозу відкрито", gmThreatEventAttemptStarted: "Спробу розпочато", gmThreatEventAttemptReset: "Спробу перезапущено", gmThreatEventAborted: "Загрозу скасовано", gmThreatEventCompletedSuccess: "Загрозу завершено успішно", gmThreatEventCompletedFailure: "Загрозу завершено невдало", gmThreatEventEffectsApplied: "Наслідки застосовано", gmThreatRound: "Раунд"
	, gmThreatForceSuccess: "Примусовий успіх", gmThreatForceFailure: "Примусовий провал", gmThreatForcePreviewTitle: "Підтвердження примусового завершення", gmThreatForceRefresh: "Оновити preview", gmThreatForceOutcome: "Результат", gmThreatForceEffects: "Наслідки", gmThreatForceScope: "Обсяг", gmThreatForceAffected: "Потенційно зачеплені гравці", gmThreatForceWillApply: "будуть застосовані", gmThreatForceWillNotApply: "не застосовуватимуться", gmThreatForceStale: "Стан загрози змінився. Оновіть preview."
	, gmThreatEventForcedSuccess: "GM примусово встановив успіх", gmThreatEventForcedFailure: "GM примусово встановив провал"
	, gmGameState: "Стан гри", gmRoundControl: "Керування раундом", gmThreatControl: "Керування загрозою", gmContent: "Контент", gmDiagnostics: "Діагностика"
	, gmPlayerSecondaryActions: "Додаткові дії", gmResyncPlayer: "Синхронізувати гравця", gmInspectConnection: "Перевірити connection", gmTransferHost: "Передати host", gmHideCharacteristic: "Сховати розкриту характеристику", gmHide: "Сховати", gmDangerousActions: "Небезпечні дії", gmKickPlayer: "Виключити з кімнати"
	, gmBunkerCapacityLabel: "Місткість бункера", gmCapacitySubmit: "ОК", gmCapacitySaved: "Місткість збережено", gmCapacityInvalid: "Введіть ціле число від 1 до 99"
	, gmPauseReason: "Причина паузи", gmPause: "Пауза", gmResume: "Продовжити", gmManualRound: "Номер раунду", gmSetRound: "Встановити", gmResetReadiness: "Скинути готовність", gmVotingRecovery: "Відновлення голосування", gmClearVotes: "Очистити голоси", gmVotingResync: "Синхронізувати", gmRemoveVote: "Видалити голос voter", gmUnavailableRecovery: "Недоступні recovery controls", gmStageUnavailable: "Reopen/skip потребує transition helper", gmTimerUnavailable: "Round/voting timer відсутній"
	, gmRoundCurrentState: "Поточний стан", gmRoundMainActions: "Основні дії", gmStatusPaused: "Гру призупинено", gmStatusRunning: "Гра триває", gmManualRoundHeading: "Ручне встановлення раунду", gmManualRoundHint: "Перехід можливий лише вперед; частину стану поточного раунду буде очищено.", gmPreviewRound: "Preview / підтвердити", gmReadinessHeading: "Скидання готовності", gmReadinessHint: "Очищає поточні позначки готовності після підтвердження."
	, gmTimerMinutes: "Хвилини", gmTimerSeconds: "Секунди", gmTimerPurpose: "Призначення", gmTimerName: "Назва"
	, gmGameTimer: "Серверний таймер", gmTimerLabel: "Назва таймера", gmTimerStart: "Старт", gmTimerRestart: "Перезапустити", gmTimerSet: "Встановити", gmTimerStop: "Зупинити", gmTimerExpired: "Час вийшов", gmTimerStopped: "Зупинено", timerPurposeRound: "Раунд", timerPurposeVoting: "Голосування", timerPurposeThreat: "Загроза", timerPurposeCustom: "Інше"
});
Object.assign(uiTranslations.en, {
	useSpecialCard: "Use card",
	activateSpecialCard: "Activate card",
	cardWasUsed: "Card used",
	unavailableNow: "Unavailable now",
	choosePlayer: "Choose player",
	confirm: "Confirm",
	cancel: "Cancel",
	noAvailableTarget: "No available target",
	noBigItem: "The player has no large item",
	noSmallItem: "The player has no small item",
	noItems: "The player has no items",
	noSpecialCards: "The player has no special cards",
	cardUsedSuccessfully: "Card used successfully",
	allReady: "Everyone ready",
	allPlayersReady: "All players are ready",
	threatRevealed: "Threat revealed",
	threat: "Threat",
	unknown: "Unknown",
	threatUnknownDescription: "The threat has not been revealed yet.",
	requirements: "Requirements",
	risks: "Risks",
	consequences: "Consequences",
	severity: "Severity",
	category: "Category",
	round: "Round",
	revealThreat: "Reveal threat",
	hiddenSecretCard: "Hidden secret card",
	hiddenDetails: "Details are hidden",
	secretCardBadge: "Secret",
	publicCardBadge: "Public",
	secretRevealedBadge: "Secret, revealed",
	useSecretly: "Use secretly",
	usePublicly: "Use publicly",
	activeUntilRoundEnd: "Active until end of round",
	effectEnded: "Effect ended",
	specialPending: "Processing…", specialAvailableNow: "Available now", specialTargetRequired: "Choose a target",
	specialStageBeforeVoting: "Before voting", specialStageDiscussion: "During discussion", specialStageLabel: "Stage", specialEffectLabel: "Effect",
	specialChooseCharacteristic: "Choose a characteristic", specialCharacteristicLabel: "Characteristic", specialNotIssued: "No special card assigned",
	specialVariantReveal: "Reveal", specialVariantProtect: "Protection", specialVariantSteal: "Interception", specialVariantSwap: "Swap", specialVariantReroll: "Reroll", specialVariantChange: "Change", specialVariantGlobal: "Global effect", specialVariantThreat: "Threat", specialVariantInventory: "Equipment", specialVariantNeutral: "Special action",
	notUsed: "Not used",
	used: "Used",
	youHaveBeenEliminated: "You have been eliminated",
	canRevealAllAfterElimination: "You can reveal all your characteristics",
	revealAllCharacteristics: "Reveal all characteristics",
	allCharacteristicsRevealed: "All characteristics revealed",
	eliminatedRevealedBadge: "Eliminated — characteristics revealed",
	eliminatedRevealedAllLog: "The eliminated player revealed all their characteristics",
	radiationOperation: "Operation",
	openOperation: "Open operation",
	team: "Team",
	equipment: "Equipment",
	operation: "Operation",
	joinTeam: "Join",
	leaveTeam: "Leave team",
	addEquipment: "Add equipment",
	useProfession: "Use profession",
	useHobby: "Use hobby",
	startOperation: "Start operation",
	answer: "Answer",
	leader: "Leader",
	chooseLeader: "Change leader",
	playersInRoom: "Players in room",
	operationStages: "Operation stages",
	allowedErrors: "Allowed errors",
	hints: "Hints",
	secondsPerStage: "Seconds per stage",
	currentProgress: "Progress",
	currentQuestion: "Current question",
	availableHints: "Available hints",
	useHint: "Hint",
	noOperationQuestion: "The operation has not started yet.",
	noLeader: "No leader selected",
	forcedParticipant: "Forced participant",
	protectedParticipant: "Protected",
	additionalConditions: "Additional conditions",
	notStarted: "Not started",
	collecting_contributions: "Collecting team",
	mini_game_active: "Operation active",
	resolved_safely: "Resolved safely",
	resolved_with_casualty: "Resolved with consequences",
	failed: "Failed"
	, aborted: "Threat aborted by host"
	, gmThreatEmergency: "Emergency controls", gmThreatResync: "Refresh threat state", gmThreatReset: "Restart attempt", gmThreatAbort: "Abort threat"
	, gmThreatHistory: "Threat history", gmThreatHistoryEmpty: "No threat events yet"
	, gmThreatEventRevealed: "Threat revealed", gmThreatEventAttemptStarted: "Attempt started", gmThreatEventAttemptReset: "Attempt restarted", gmThreatEventAborted: "Threat aborted", gmThreatEventCompletedSuccess: "Threat completed successfully", gmThreatEventCompletedFailure: "Threat completed unsuccessfully", gmThreatEventEffectsApplied: "Effects applied", gmThreatRound: "Round"
	, gmThreatForceSuccess: "Force success", gmThreatForceFailure: "Force failure", gmThreatForcePreviewTitle: "Confirm forced completion", gmThreatForceRefresh: "Refresh preview", gmThreatForceOutcome: "Outcome", gmThreatForceEffects: "Effects", gmThreatForceScope: "Scope", gmThreatForceAffected: "Potentially affected players", gmThreatForceWillApply: "will be applied", gmThreatForceWillNotApply: "will not be applied", gmThreatForceStale: "The threat state changed. Refresh the preview."
	, gmThreatEventForcedSuccess: "GM forced success", gmThreatEventForcedFailure: "GM forced failure"
	, gmGameState: "Game state", gmRoundControl: "Round control", gmThreatControl: "Threat control", gmContent: "Content", gmDiagnostics: "Diagnostics"
	, gmPlayerSecondaryActions: "Additional actions", gmResyncPlayer: "Resync player", gmInspectConnection: "Inspect connection", gmTransferHost: "Transfer host", gmHideCharacteristic: "Hide revealed characteristic", gmHide: "Hide", gmDangerousActions: "Dangerous actions", gmKickPlayer: "Kick from room"
	, gmBunkerCapacityLabel: "Bunker capacity", gmCapacitySubmit: "OK", gmCapacitySaved: "Capacity saved", gmCapacityInvalid: "Enter an integer from 1 to 99"
	, gmPauseReason: "Pause reason", gmPause: "Pause", gmResume: "Resume", gmManualRound: "Round number", gmSetRound: "Set", gmResetReadiness: "Reset readiness", gmVotingRecovery: "Voting recovery", gmClearVotes: "Clear votes", gmVotingResync: "Resync", gmRemoveVote: "Remove voter vote", gmUnavailableRecovery: "Unavailable recovery controls", gmStageUnavailable: "Reopen/skip requires a transition helper", gmTimerUnavailable: "Round/voting timer is unavailable"
	, gmRoundCurrentState: "Current state", gmRoundMainActions: "Primary actions", gmStatusPaused: "Game paused", gmStatusRunning: "Game running", gmManualRoundHeading: "Set round manually", gmManualRoundHint: "Only forward transitions are allowed; part of the current round state will be cleared.", gmPreviewRound: "Preview / confirm", gmReadinessHeading: "Reset readiness", gmReadinessHint: "Clears the current readiness marks after confirmation."
	, gmTimerMinutes: "Minutes", gmTimerSeconds: "Seconds", gmTimerPurpose: "Purpose", gmTimerName: "Name"
	, gmGameTimer: "Server timer", gmTimerLabel: "Timer label", gmTimerStart: "Start", gmTimerRestart: "Restart", gmTimerSet: "Set", gmTimerStop: "Stop", gmTimerExpired: "Time is up", gmTimerStopped: "Stopped", timerPurposeRound: "Round", timerPurposeVoting: "Voting", timerPurposeThreat: "Threat", timerPurposeCustom: "Custom"
});
Object.assign(uiTranslations.ru, {
	useSpecialCard: "Использовать карту",
	activateSpecialCard: "Активировать карту",
	cardWasUsed: "Карта использована",
	unavailableNow: "Сейчас недоступно",
	choosePlayer: "Выберите игрока",
	confirm: "Подтвердить",
	cancel: "Отменить",
	noAvailableTarget: "Нет доступной цели",
	noBigItem: "У игрока нет большого предмета",
	noSmallItem: "У игрока нет малого предмета",
	noItems: "У игрока нет предметов",
	noSpecialCards: "У игрока нет специальных карт",
	cardUsedSuccessfully: "Карта успешно использована",
	allReady: "Все готовы",
	allPlayersReady: "Все игроки готовы",
	threatRevealed: "Угроза раскрыта",
	threat: "Угроза",
	unknown: "Неизвестно",
	threatUnknownDescription: "Угроза ещё не раскрыта.",
	requirements: "Требуется",
	risks: "Риски",
	consequences: "Последствия",
	severity: "Уровень",
	category: "Категория",
	round: "Раунд",
	revealThreat: "Раскрыть угрозу",
	hiddenSecretCard: "Скрытая секретная карта",
	hiddenDetails: "Детали скрыты",
	secretCardBadge: "Секретная",
	publicCardBadge: "Публичная",
	secretRevealedBadge: "Секретная, раскрыта",
	useSecretly: "Использовать тихо",
	usePublicly: "Использовать публично",
	activeUntilRoundEnd: "Активна до конца раунда",
	effectEnded: "Эффект завершён",
	specialPending: "Выполняется…", specialAvailableNow: "Доступна сейчас", specialTargetRequired: "Нужно выбрать цель",
	specialStageBeforeVoting: "Перед голосованием", specialStageDiscussion: "Во время обсуждения", specialStageLabel: "Этап", specialEffectLabel: "Эффект",
	specialChooseCharacteristic: "Выберите характеристику", specialCharacteristicLabel: "Характеристика", specialNotIssued: "Специальная карта не выдана",
	specialVariantReveal: "Раскрытие", specialVariantProtect: "Защита", specialVariantSteal: "Перехват", specialVariantSwap: "Обмен", specialVariantReroll: "Перегенерация", specialVariantChange: "Изменение", specialVariantGlobal: "Глобальный эффект", specialVariantThreat: "Угроза", specialVariantInventory: "Снаряжение", specialVariantNeutral: "Особое действие",
	notUsed: "Не использована",
	used: "Использована",
	youHaveBeenEliminated: "Вы выбыли из игры",
	canRevealAllAfterElimination: "Вы можете раскрыть все свои характеристики",
	revealAllCharacteristics: "Раскрыть все характеристики",
	allCharacteristicsRevealed: "Все характеристики раскрыты",
	eliminatedRevealedBadge: "Выбыл — характеристики раскрыты",
	eliminatedRevealedAllLog: "Выбывший игрок раскрыл все свои характеристики",
	radiationOperation: "Операция",
	openOperation: "Открыть операцию",
	team: "Команда",
	equipment: "Снаряжение",
	operation: "Операция",
	joinTeam: "Присоединиться",
	leaveTeam: "Выйти из команды",
	addEquipment: "Добавить снаряжение",
	useProfession: "Использовать профессию",
	useHobby: "Использовать хобби",
	startOperation: "Начать операцию",
	answer: "Ответить",
	leader: "Руководитель",
	chooseLeader: "Сменить руководителя",
	playersInRoom: "Игроков в комнате",
	operationStages: "Этапов операции",
	allowedErrors: "Допустимых ошибок",
	hints: "Подсказок",
	secondsPerStage: "Секунд на этап",
	currentProgress: "Прогресс",
	currentQuestion: "Текущий вопрос",
	availableHints: "Доступные подсказки",
	useHint: "Подсказка",
	noOperationQuestion: "Операция ещё не началась.",
	noLeader: "Руководитель не выбран",
	forcedParticipant: "Принудительный участник",
	protectedParticipant: "Защищен",
	additionalConditions: "Дополнительные состояния",
	notStarted: "Не начато",
	collecting_contributions: "Сбор команды",
	mini_game_active: "Операция идёт",
	resolved_safely: "Безопасно завершено",
	resolved_with_casualty: "Завершено с последствиями",
	failed: "Провалено"
	, aborted: "Угроза отменена ведущим"
	, gmThreatEmergency: "Аварийное управление", gmThreatResync: "Обновить состояние угрозы", gmThreatReset: "Перезапустить попытку", gmThreatAbort: "Отменить угрозу"
	, gmThreatHistory: "История угроз", gmThreatHistoryEmpty: "Событий угроз пока нет"
	, gmThreatEventRevealed: "Угроза раскрыта", gmThreatEventAttemptStarted: "Попытка начата", gmThreatEventAttemptReset: "Попытка перезапущена", gmThreatEventAborted: "Угроза отменена", gmThreatEventCompletedSuccess: "Угроза завершена успешно", gmThreatEventCompletedFailure: "Угроза завершена неудачно", gmThreatEventEffectsApplied: "Последствия применены", gmThreatRound: "Раунд"
	, gmThreatForceSuccess: "Принудительный успех", gmThreatForceFailure: "Принудительный провал", gmThreatForcePreviewTitle: "Подтверждение принудительного завершения", gmThreatForceRefresh: "Обновить preview", gmThreatForceOutcome: "Результат", gmThreatForceEffects: "Последствия", gmThreatForceScope: "Объём", gmThreatForceAffected: "Потенциально затронутые игроки", gmThreatForceWillApply: "будут применены", gmThreatForceWillNotApply: "не будут применяться", gmThreatForceStale: "Состояние угрозы изменилось. Обновите preview."
	, gmThreatEventForcedSuccess: "GM принудительно установил успех", gmThreatEventForcedFailure: "GM принудительно установил провал"
	, gmGameState: "Состояние игры", gmRoundControl: "Управление раундом", gmThreatControl: "Управление угрозой", gmContent: "Контент", gmDiagnostics: "Диагностика"
	, gmPlayerSecondaryActions: "Дополнительные действия", gmResyncPlayer: "Синхронизировать игрока", gmInspectConnection: "Проверить connection", gmTransferHost: "Передать host", gmHideCharacteristic: "Скрыть открытую характеристику", gmHide: "Скрыть", gmDangerousActions: "Опасные действия", gmKickPlayer: "Исключить из комнаты"
	, gmBunkerCapacityLabel: "Вместимость бункера", gmCapacitySubmit: "ОК", gmCapacitySaved: "Вместимость сохранена", gmCapacityInvalid: "Введите целое число от 1 до 99"
	, gmPauseReason: "Причина паузы", gmPause: "Пауза", gmResume: "Продолжить", gmManualRound: "Номер раунда", gmSetRound: "Установить", gmResetReadiness: "Сбросить готовность", gmVotingRecovery: "Восстановление голосования", gmClearVotes: "Очистить голоса", gmVotingResync: "Синхронизировать", gmRemoveVote: "Удалить голос voter", gmUnavailableRecovery: "Недоступные recovery controls", gmStageUnavailable: "Reopen/skip требует transition helper", gmTimerUnavailable: "Round/voting timer отсутствует"
	, gmRoundCurrentState: "Текущее состояние", gmRoundMainActions: "Основные действия", gmStatusPaused: "Игра приостановлена", gmStatusRunning: "Игра продолжается", gmManualRoundHeading: "Ручная установка раунда", gmManualRoundHint: "Переход возможен только вперёд; часть состояния текущего раунда будет очищена.", gmPreviewRound: "Preview / подтвердить", gmReadinessHeading: "Сброс готовности", gmReadinessHint: "Очищает текущие отметки готовности после подтверждения."
	, gmTimerMinutes: "Минуты", gmTimerSeconds: "Секунды", gmTimerPurpose: "Назначение", gmTimerName: "Название"
	, gmGameTimer: "Серверный таймер", gmTimerLabel: "Название таймера", gmTimerStart: "Старт", gmTimerRestart: "Перезапустить", gmTimerSet: "Установить", gmTimerStop: "Остановить", gmTimerExpired: "Время вышло", gmTimerStopped: "Остановлен", timerPurposeRound: "Раунд", timerPurposeVoting: "Голосование", timerPurposeThreat: "Угроза", timerPurposeCustom: "Другое"
});

Object.assign(uiTranslations.uk, {
	gmRunDiagnostics: "Перевірити кімнату", gmPreviewAutoFix: "Preview auto-fix", gmApplyAutoFix: "Застосувати безпечні виправлення",
	gmIssueFilter: "Фільтр issues", gmAll: "Усі", gmAuditLog: "Журнал GM-дій і загроз", gmAuditSearch: "Пошук за action або summary",
	gmRefreshAudit: "Оновити журнал", gmHealthy: "Справна", gmWarning: "Попередження", gmError: "Помилка", gmNoIssues: "Проблем не виявлено",
	gmAutoFixAvailable: "Auto-fix available", gmNoAutoFix: "Безпечних виправлень немає", gmAutoFixConfirm: "Застосувати лише previewed безпечні виправлення?",
	gmSnapshotsTitle: "Контрольні точки / Undo", gmSnapshotReason: "Назва контрольної точки", gmCreateSnapshot: "Створити контрольну точку", gmUndoLastAction: "Скасувати останню GM-дію",
	gmRefreshSnapshots: "Оновити snapshots", gmSnapshotPreview: "Preview", gmSnapshotRestore: "Restore", gmSnapshotEmpty: "Контрольних точок ще немає", gmSnapshotConfirm: "Відновити стан кімнати з цієї контрольної точки?",
	gmSnapshotActiveConfirm: "Активна гра буде повернута до попереднього стану. Підтвердити ще раз?", gmSnapshotBlocked: "Restore заблоковано", gmSnapshotChanges: "Змінені категорії",
	gmRoomLocalEditor: "Редактор поточної кімнати", gmRoomLocalWarning: "Зміни діють лише в цій кімнаті й не змінюють глобальні дані.", gmCurrentPublicValue: "Поточне публічне значення", gmNewPublicValue: "Нове публічне значення", gmEditorApply: "Застосувати"
});

Object.assign(uiTranslations.uk, {
	lobbyTitle: 'Лобі кімнати', lobbyHint: 'Оберіть ролі, підтвердьте готовність і почніть гру.', lobbyMembersTitle: 'Учасники', lobbyParticipants: 'Учасники',
	lobbyActivePlayers: 'Активні гравці', lobbySpectators: 'Спостерігачі', lobbyReadySummary: 'Готовність', lobbyRoomState: 'Стан кімнати',
	lobbyLifecycleLobby: 'Лобі', lobbyLifecycleRunning: 'Гра триває', lobbyLifecycleFinished: 'Гру завершено',
	lobbyRoleHostPlayer: 'Хост і гравець', lobbyRolePlayer: 'Гравець', lobbyRoleSpectator: 'Спостерігач', lobbyRoleTechnicalGm: 'Технічний GM', lobbyRoleOmniscientGm: 'Всезнаючий GM',
	lobbyConnected: 'У мережі', lobbyDisconnected: 'Не в мережі', lobbyReady: 'Готовий', lobbyNotReady: 'Не готовий', lobbyIAmReady: 'Я готовий', lobbyCancelReady: 'Скасувати готовність',
	lobbyCheckReadiness: 'Перевірити готовність', lobbyStartTitle: 'Готовність до старту', lobbyTransferHost: 'Передати хост', lobbyHostBadge: 'Хост', lobbyRoomCode: 'Код кімнати',
	lobbyCopyLink: 'Скопіювати посилання', lobbyGmPanel: 'GM-панель', lobbyLeave: 'Вийти з кімнати', lobbyReadyProgress: 'Готові', lobbyGameplayProgress: 'Активні гравці', lobbyMinimum: 'мінімум', lobbyRoleLabel: 'Роль',
	lobbyRolePlayerHelp: 'Отримує персонажа, голосує та бере участь у загрозах.', lobbyRoleSpectatorHelp: 'Не отримує персонажа, не голосує та не займає місце серед активних гравців.',
	lobbyRoleTechnicalHelp: 'Допомагає керувати технічним станом кімнати без доступу до прихованих характеристик.', lobbyRoleOmniscientHelp: 'Спостерігає за грою, бачить прихований стан і не бере участі як гравець.',
	lobbyBlockMinimum: 'Для старту потрібно щонайменше 2 активні гравці.', lobbyBlockReady: 'Не всі підключені учасники підтвердили готовність.', lobbyBlockRole: 'Один або кілька учасників мають несумісну роль.',
	lobbyBlockVoting: 'Неможливо почати гру під час активного голосування.', lobbyBlockThreat: 'Неможливо почати гру під час активної загрози.', lobbyBlockHost: 'Почати гру може лише поточний хост.',
	lobbyBlockFallback: 'Гру поки неможливо почати. Оновіть стан лобі.', lobbyPreviewReady: 'Перевірку завершено: кімната готова до старту.', lobbyPreviewBlocked: 'Перевірку завершено: усуньте перешкоди нижче.'
	, guestWarningTitle: 'Ви граєте без акаунта', guestWarningPrimary: 'Звичайне перепідключення після оновлення сторінки підтримується. Проте після очищення даних браузера, зміни пристрою або повного перезапуску сервера відновлення вашого персонажа поки не гарантується.', guestWarningSecondary: 'Акаунт створює стабільну прив’язку до користувача та буде використаний для надійнішого відновлення й історії партій.', guestWarningContinue: 'Продовжити як гість', guestWarningRegister: 'Зареєструватися', guestWarningCurrentPlayerRemainsGuest: 'Поточний гравець залишиться гостьовим до повторного входу в кімнату з авторизованим акаунтом.', lobbyGuestCount: 'У кімнаті є гостьові гравці: {count}', lobbyGuestRisk: 'Вони можуть грати без реєстрації. Оновлення сторінки та звичайне перепідключення підтримуються, але після втрати даних браузера або повного перезапуску сервера відновлення поточної гри поки не гарантується.'
});
Object.assign(uiTranslations.en, {
	property: "Property",
	propertyUnavailable: "Property unavailable",
	lobbyTitle: 'Room lobby', lobbyHint: 'Choose roles, confirm readiness, and start the game.', lobbyMembersTitle: 'Members', lobbyParticipants: 'Participants',
	lobbyActivePlayers: 'Active players', lobbySpectators: 'Spectators', lobbyReadySummary: 'Readiness', lobbyRoomState: 'Room state', lobbyLifecycleLobby: 'Lobby', lobbyLifecycleRunning: 'Game running', lobbyLifecycleFinished: 'Game finished',
	lobbyRoleHostPlayer: 'Host and player', lobbyRolePlayer: 'Player', lobbyRoleSpectator: 'Spectator', lobbyRoleTechnicalGm: 'Technical GM', lobbyRoleOmniscientGm: 'Omniscient GM',
	lobbyConnected: 'Online', lobbyDisconnected: 'Offline', lobbyReady: 'Ready', lobbyNotReady: 'Not ready', lobbyIAmReady: 'I am ready', lobbyCancelReady: 'Cancel readiness', lobbyCheckReadiness: 'Check readiness',
	lobbyStartTitle: 'Ready to start', lobbyTransferHost: 'Transfer host', lobbyHostBadge: 'Host', lobbyRoomCode: 'Room code', lobbyCopyLink: 'Copy link', lobbyGmPanel: 'GM panel', lobbyLeave: 'Leave room', lobbyReadyProgress: 'Ready', lobbyGameplayProgress: 'Active players', lobbyMinimum: 'minimum', lobbyRoleLabel: 'Role',
	lobbyRolePlayerHelp: 'Receives a character, votes, and participates in threats.', lobbyRoleSpectatorHelp: 'Does not receive a character, vote, or occupy an active-player slot.', lobbyRoleTechnicalHelp: 'Helps manage technical room state without access to hidden characteristics.', lobbyRoleOmniscientHelp: 'Observes the game, sees hidden state, and does not participate as a player.',
	lobbyBlockMinimum: 'At least 2 active players are required to start.', lobbyBlockReady: 'Not all connected members have confirmed readiness.', lobbyBlockRole: 'One or more members have an incompatible role.', lobbyBlockVoting: 'The game cannot start during active voting.', lobbyBlockThreat: 'The game cannot start during an active threat.', lobbyBlockHost: 'Only the current host can start the game.', lobbyBlockFallback: 'The game cannot start yet. Refresh the lobby state.', lobbyPreviewReady: 'Check complete: the room is ready to start.', lobbyPreviewBlocked: 'Check complete: resolve the blockers below.'
	, guestWarningTitle: 'You are playing without an account', guestWarningPrimary: 'Normal reconnection after refreshing the page is supported. However, after clearing browser data, changing devices, or a full server restart, recovery of your character is not currently guaranteed.', guestWarningSecondary: 'An account creates a stable user binding and will be used for more reliable recovery and game history.', guestWarningContinue: 'Continue as guest', guestWarningRegister: 'Register', guestWarningCurrentPlayerRemainsGuest: 'The current player will remain a guest until you re-enter the room with an authenticated account.', lobbyGuestCount: 'Guest players in the room: {count}', lobbyGuestRisk: 'They can play without registering. Page refresh and normal reconnection are supported, but recovery of the current game after browser data loss or a full server restart is not currently guaranteed.'
});
Object.assign(uiTranslations.ru, {
	property: "Имущество",
	propertyUnavailable: "Имущество отсутствует",
	lobbyTitle: 'Лобби комнаты', lobbyHint: 'Выберите роли, подтвердите готовность и начните игру.', lobbyMembersTitle: 'Участники', lobbyParticipants: 'Участники',
	lobbyActivePlayers: 'Активные игроки', lobbySpectators: 'Наблюдатели', lobbyReadySummary: 'Готовность', lobbyRoomState: 'Состояние комнаты', lobbyLifecycleLobby: 'Лобби', lobbyLifecycleRunning: 'Игра продолжается', lobbyLifecycleFinished: 'Игра завершена',
	lobbyRoleHostPlayer: 'Хост и игрок', lobbyRolePlayer: 'Игрок', lobbyRoleSpectator: 'Наблюдатель', lobbyRoleTechnicalGm: 'Технический GM', lobbyRoleOmniscientGm: 'Всезнающий GM',
	lobbyConnected: 'В сети', lobbyDisconnected: 'Не в сети', lobbyReady: 'Готов', lobbyNotReady: 'Не готов', lobbyIAmReady: 'Я готов', lobbyCancelReady: 'Отменить готовность', lobbyCheckReadiness: 'Проверить готовность',
	lobbyStartTitle: 'Готовность к старту', lobbyTransferHost: 'Передать хост', lobbyHostBadge: 'Хост', lobbyRoomCode: 'Код комнаты', lobbyCopyLink: 'Скопировать ссылку', lobbyGmPanel: 'GM-панель', lobbyLeave: 'Выйти из комнаты', lobbyReadyProgress: 'Готовы', lobbyGameplayProgress: 'Активные игроки', lobbyMinimum: 'минимум', lobbyRoleLabel: 'Роль',
	lobbyRolePlayerHelp: 'Получает персонажа, голосует и участвует в угрозах.', lobbyRoleSpectatorHelp: 'Не получает персонажа, не голосует и не занимает место среди активных игроков.', lobbyRoleTechnicalHelp: 'Помогает управлять техническим состоянием комнаты без доступа к скрытым характеристикам.', lobbyRoleOmniscientHelp: 'Наблюдает за игрой, видит скрытое состояние и не участвует как игрок.',
	lobbyBlockMinimum: 'Для старта нужны как минимум 2 активных игрока.', lobbyBlockReady: 'Не все подключённые участники подтвердили готовность.', lobbyBlockRole: 'Один или несколько участников имеют несовместимую роль.', lobbyBlockVoting: 'Нельзя начать игру во время активного голосования.', lobbyBlockThreat: 'Нельзя начать игру во время активной угрозы.', lobbyBlockHost: 'Начать игру может только текущий хост.', lobbyBlockFallback: 'Игру пока нельзя начать. Обновите состояние лобби.', lobbyPreviewReady: 'Проверка завершена: комната готова к старту.', lobbyPreviewBlocked: 'Проверка завершена: устраните препятствия ниже.'
	, guestWarningTitle: 'Вы играете без аккаунта', guestWarningPrimary: 'Обычное переподключение после обновления страницы поддерживается. Однако после очистки данных браузера, смены устройства или полного перезапуска сервера восстановление вашего персонажа пока не гарантируется.', guestWarningSecondary: 'Аккаунт создаёт стабильную привязку к пользователю и будет использоваться для более надёжного восстановления и истории партий.', guestWarningContinue: 'Продолжить как гость', guestWarningRegister: 'Зарегистрироваться', guestWarningCurrentPlayerRemainsGuest: 'Текущий игрок останется гостевым до повторного входа в комнату с авторизованным аккаунтом.', lobbyGuestCount: 'В комнате есть гостевые игроки: {count}', lobbyGuestRisk: 'Они могут играть без регистрации. Обновление страницы и обычное переподключение поддерживаются, но после потери данных браузера или полного перезапуска сервера восстановление текущей игры пока не гарантируется.'
});

Object.assign(uiTranslations.uk, {
	lobbySetupTitle:'Налаштування гри', lobbyRevision:'Ревізія', lobbyUnsaved:'Незбережені зміни', lobbyPreset:'Пресет', lobbyPresetClassic:'Класичний', lobbyPresetCalm:'Спокійний', lobbyPresetDangerous:'Небезпечний', lobbyPresetHardcore:'Хардкор', lobbyPresetQuick:'Швидка гра', lobbyPresetLong:'Довга гра', lobbyPresetCustom:'Власний',
	lobbyTabBasic:'Основне', lobbyTabThreats:'Загрози', lobbyTabRounds:'Раунди', lobbyTabAccess:'Доступ', lobbyMaxPlayers:'Максимум гравців', lobbyMinPlayers:'Мінімум гравців', lobbyBunkerCapacityMode:'Місткість бункера', lobbyAutomatic:'Автоматично', lobbyManual:'Вручну', lobbyRandomRange:'Випадковий діапазон', lobbyManualCapacity:'Місць', lobbyRangeMin:'Мінімум місць', lobbyRangeMax:'Максимум місць', lobbyStartingItems:'Стартові предмети', lobbySpecialCardsCount:'Спеціальних карт на гравця', lobbyApocalypseEnabled:'Апокаліпсис', lobbyBunkerEnabled:'Бункер', lobbySpecialCardsEnabled:'Спеціальні карти',
	lobbyInteractiveRate:'Інтерактивні загрози', lobbyFirstThreatRound:'Перший раунд загрози', lobbyThreatFrequency:'Частота загроз', lobbyOnce:'Один раз', lobbyEveryOther:'Через раунд', lobbyEveryRound:'Щораунду', lobbyRandomRounds:'Випадково', lobbyMaxThreats:'Максимум загроз', lobbyUnlimited:'Без обмеження', lobbyThreatsEnabled:'Загрози увімкнено', lobbyAvoidThreatRepeats:'Не повторювати ID загроз', lobbyTimerDuration:'Таймер раунду', lobbyVotingStart:'Голосування з раунду', lobbyVotingFrequency:'Частота голосувань', lobbyBonusRound:'Бонусний інвентар у раунді', lobbyBonusCount:'Бонусних предметів', lobbyTimerEnabled:'Таймер увімкнено', lobbyTimerAutoStart:'Автостарт таймера', lobbyTimerPauseDisconnect:'Пауза при відключенні host', lobbyVotingEnabled:'Голосування увімкнено', lobbyBonusEnabled:'Бонусний інвентар',
	lobbyReadyPolicy:'Політика готовності', lobbyAllReady:'Усі гравці', lobbyHostDecides:'Вирішує host', lobbyRoomPassword:'Пароль кімнати', lobbyPasswordPlaceholder:'Порожньо — вимкнути захист', lobbyPasswordApply:'Оновити пароль', lobbySpectatorsAllowed:'Дозволити спостерігачів', lobbyHostOverride:'Host може стартувати без усіх ready', lobbyResetReady:'Скидати ready після змін', lobbyLockJoins:'Заблокувати нові входи', lobbyPresetName:'Назва локального пресету', lobbyPresetSave:'Зберегти локально', lobbyPresetLoad:'Завантажити', lobbyPresetDelete:'Видалити', lobbyPresetExport:'Export JSON', lobbyPresetImport:'Import JSON', lobbyReset:'Скинути', lobbyResetClassic:'Класичний', lobbyApply:'Застосувати', lobbyAuditTitle:'Останні події лобі',
	lobbySettingsApplied:'Налаштування застосовано.', lobbySettingsConflict:'Налаштування змінилися в іншій вкладці. Завантажено актуальні значення.', lobbySettingsInvalid:'Перевірте значення налаштувань.', lobbyPresetSaved:'Локальний пресет збережено.', lobbyPresetLoaded:'Пресет завантажено в чернетку.', lobbyPresetDeleted:'Локальний пресет видалено.', lobbyPresetImportOk:'JSON імпортовано в чернетку.', lobbyPresetImportError:'Некоректний або застарілий JSON-пресет.', lobbyPasswordUpdated:'Захист кімнати оновлено.', lobbyResetMemberReady:'Скинути ready', lobbyKickMember:'Видалити', lobbyKicked:'Host видалив вас із кімнати.', lobbyNoAudit:'Подій ще немає.', lobbySettingsReadOnly:'Налаштування доступні лише для перегляду.', lobbySummaryThreats:'Загрози', lobbySummaryTimer:'Таймер', lobbySummaryVoting:'Голосування', lobbySummaryBunker:'Бункер', lobbySummaryCards:'Карти', lobbyOff:'Вимкнено', lobbyFromRound:'з раунду'
});
Object.assign(uiTranslations.en, {
	lobbySetupTitle:'Game setup', lobbyRevision:'Revision', lobbyUnsaved:'Unsaved changes', lobbyPreset:'Preset', lobbyPresetClassic:'Classic', lobbyPresetCalm:'Calm', lobbyPresetDangerous:'Dangerous', lobbyPresetHardcore:'Hardcore', lobbyPresetQuick:'Quick game', lobbyPresetLong:'Long game', lobbyPresetCustom:'Custom',
	lobbyTabBasic:'Basic', lobbyTabThreats:'Threats', lobbyTabRounds:'Rounds', lobbyTabAccess:'Access', lobbyMaxPlayers:'Maximum players', lobbyMinPlayers:'Minimum players', lobbyBunkerCapacityMode:'Bunker capacity', lobbyAutomatic:'Automatic', lobbyManual:'Manual', lobbyRandomRange:'Random range', lobbyManualCapacity:'Seats', lobbyRangeMin:'Minimum seats', lobbyRangeMax:'Maximum seats', lobbyStartingItems:'Starting items', lobbySpecialCardsCount:'Special cards per player', lobbyApocalypseEnabled:'Apocalypse', lobbyBunkerEnabled:'Bunker', lobbySpecialCardsEnabled:'Special cards',
	lobbyInteractiveRate:'Interactive threats', lobbyFirstThreatRound:'First threat round', lobbyThreatFrequency:'Threat frequency', lobbyOnce:'Once', lobbyEveryOther:'Every other round', lobbyEveryRound:'Every round', lobbyRandomRounds:'Random', lobbyMaxThreats:'Maximum threats', lobbyUnlimited:'Unlimited', lobbyThreatsEnabled:'Threats enabled', lobbyAvoidThreatRepeats:'Avoid repeated threat IDs', lobbyTimerDuration:'Round timer', lobbyVotingStart:'Voting from round', lobbyVotingFrequency:'Voting frequency', lobbyBonusRound:'Bonus items round', lobbyBonusCount:'Bonus item count', lobbyTimerEnabled:'Timer enabled', lobbyTimerAutoStart:'Auto-start timer', lobbyTimerPauseDisconnect:'Pause when host disconnects', lobbyVotingEnabled:'Voting enabled', lobbyBonusEnabled:'Bonus items',
	lobbyReadyPolicy:'Readiness policy', lobbyAllReady:'All players', lobbyHostDecides:'Host decides', lobbyRoomPassword:'Room password', lobbyPasswordPlaceholder:'Empty disables protection', lobbyPasswordApply:'Update password', lobbySpectatorsAllowed:'Allow spectators', lobbyHostOverride:'Host may start without everyone ready', lobbyResetReady:'Reset readiness after changes', lobbyLockJoins:'Lock new joins', lobbyPresetName:'Local preset name', lobbyPresetSave:'Save locally', lobbyPresetLoad:'Load', lobbyPresetDelete:'Delete', lobbyPresetExport:'Export JSON', lobbyPresetImport:'Import JSON', lobbyReset:'Reset', lobbyResetClassic:'Classic', lobbyApply:'Apply', lobbyAuditTitle:'Recent lobby events',
	lobbySettingsApplied:'Settings applied.', lobbySettingsConflict:'Settings changed in another tab. Current values were loaded.', lobbySettingsInvalid:'Check the settings values.', lobbyPresetSaved:'Local preset saved.', lobbyPresetLoaded:'Preset loaded into the draft.', lobbyPresetDeleted:'Local preset deleted.', lobbyPresetImportOk:'JSON imported into the draft.', lobbyPresetImportError:'Invalid or outdated JSON preset.', lobbyPasswordUpdated:'Room protection updated.', lobbyResetMemberReady:'Reset ready', lobbyKickMember:'Remove', lobbyKicked:'The host removed you from the room.', lobbyNoAudit:'No events yet.', lobbySettingsReadOnly:'Settings are read-only.', lobbySummaryThreats:'Threats', lobbySummaryTimer:'Timer', lobbySummaryVoting:'Voting', lobbySummaryBunker:'Bunker', lobbySummaryCards:'Cards', lobbyOff:'Off', lobbyFromRound:'from round'
});
Object.assign(uiTranslations.ru, {
	lobbySetupTitle:'Настройки игры', lobbyRevision:'Ревизия', lobbyUnsaved:'Несохранённые изменения', lobbyPreset:'Пресет', lobbyPresetClassic:'Классический', lobbyPresetCalm:'Спокойный', lobbyPresetDangerous:'Опасный', lobbyPresetHardcore:'Хардкор', lobbyPresetQuick:'Быстрая игра', lobbyPresetLong:'Долгая игра', lobbyPresetCustom:'Свой',
	lobbyTabBasic:'Основное', lobbyTabThreats:'Угрозы', lobbyTabRounds:'Раунды', lobbyTabAccess:'Доступ', lobbyMaxPlayers:'Максимум игроков', lobbyMinPlayers:'Минимум игроков', lobbyBunkerCapacityMode:'Вместимость бункера', lobbyAutomatic:'Автоматически', lobbyManual:'Вручную', lobbyRandomRange:'Случайный диапазон', lobbyManualCapacity:'Мест', lobbyRangeMin:'Минимум мест', lobbyRangeMax:'Максимум мест', lobbyStartingItems:'Стартовые предметы', lobbySpecialCardsCount:'Специальных карт на игрока', lobbyApocalypseEnabled:'Апокалипсис', lobbyBunkerEnabled:'Бункер', lobbySpecialCardsEnabled:'Специальные карты',
	lobbyInteractiveRate:'Интерактивные угрозы', lobbyFirstThreatRound:'Первый раунд угрозы', lobbyThreatFrequency:'Частота угроз', lobbyOnce:'Один раз', lobbyEveryOther:'Через раунд', lobbyEveryRound:'Каждый раунд', lobbyRandomRounds:'Случайно', lobbyMaxThreats:'Максимум угроз', lobbyUnlimited:'Без ограничения', lobbyThreatsEnabled:'Угрозы включены', lobbyAvoidThreatRepeats:'Не повторять ID угроз', lobbyTimerDuration:'Таймер раунда', lobbyVotingStart:'Голосование с раунда', lobbyVotingFrequency:'Частота голосований', lobbyBonusRound:'Бонусный инвентарь в раунде', lobbyBonusCount:'Бонусных предметов', lobbyTimerEnabled:'Таймер включён', lobbyTimerAutoStart:'Автозапуск таймера', lobbyTimerPauseDisconnect:'Пауза при отключении host', lobbyVotingEnabled:'Голосование включено', lobbyBonusEnabled:'Бонусный инвентарь',
	lobbyReadyPolicy:'Политика готовности', lobbyAllReady:'Все игроки', lobbyHostDecides:'Решает host', lobbyRoomPassword:'Пароль комнаты', lobbyPasswordPlaceholder:'Пусто — отключить защиту', lobbyPasswordApply:'Обновить пароль', lobbySpectatorsAllowed:'Разрешить наблюдателей', lobbyHostOverride:'Host может начать без всех ready', lobbyResetReady:'Сбрасывать ready после изменений', lobbyLockJoins:'Заблокировать новые входы', lobbyPresetName:'Название локального пресета', lobbyPresetSave:'Сохранить локально', lobbyPresetLoad:'Загрузить', lobbyPresetDelete:'Удалить', lobbyPresetExport:'Export JSON', lobbyPresetImport:'Import JSON', lobbyReset:'Сбросить', lobbyResetClassic:'Классический', lobbyApply:'Применить', lobbyAuditTitle:'Последние события лобби',
	lobbySettingsApplied:'Настройки применены.', lobbySettingsConflict:'Настройки изменились в другой вкладке. Загружены актуальные значения.', lobbySettingsInvalid:'Проверьте значения настроек.', lobbyPresetSaved:'Локальный пресет сохранён.', lobbyPresetLoaded:'Пресет загружен в черновик.', lobbyPresetDeleted:'Локальный пресет удалён.', lobbyPresetImportOk:'JSON импортирован в черновик.', lobbyPresetImportError:'Некорректный или устаревший JSON-пресет.', lobbyPasswordUpdated:'Защита комнаты обновлена.', lobbyResetMemberReady:'Сбросить ready', lobbyKickMember:'Удалить', lobbyKicked:'Host удалил вас из комнаты.', lobbyNoAudit:'Событий пока нет.', lobbySettingsReadOnly:'Настройки доступны только для просмотра.', lobbySummaryThreats:'Угрозы', lobbySummaryTimer:'Таймер', lobbySummaryVoting:'Голосование', lobbySummaryBunker:'Бункер', lobbySummaryCards:'Карты', lobbyOff:'Выключено', lobbyFromRound:'с раунда'
});
Object.assign(uiTranslations.uk, { lobbyWarningCapacity:'Місткість бункера не менша за поточну кількість активних гравців.', lobbyWarningSpectators:'У кімнаті вже є спостерігачі, хоча нові ролі спостерігачів вимкнено.', lobbyWarningPlayers:'Поточна кількість гравців перевищує максимум.', lobbyAuditSettings:'Host застосував налаштування гри.', lobbyAuditReady:'Учасник змінив готовність.', lobbyAuditReadyReset:'Host скинув готовність учасника.', lobbyAuditRole:'Host змінив роль учасника.', lobbyAuditHost:'Передано роль host.', lobbyAuditKick:'Host видалив учасника.', lobbyAuditJoined:'Учасник приєднався до лобі.', lobbyAuditReconnected:'Учасник відновив з’єднання.', lobbyAuditLeft:'Учасник залишив лобі.', lobbyAuditPassword:'Host змінив захист кімнати.', lobbyAuditStarted:'Гру запущено з лобі.', lobbyAuditGeneric:'Оновлено стан лобі.' });
Object.assign(uiTranslations.en, { lobbyWarningCapacity:'Bunker capacity is not lower than the current active-player count.', lobbyWarningSpectators:'Spectators are already present although new spectator roles are disabled.', lobbyWarningPlayers:'The current player count exceeds the maximum.', lobbyAuditSettings:'The host applied game settings.', lobbyAuditReady:'A member changed readiness.', lobbyAuditReadyReset:'The host reset a member’s readiness.', lobbyAuditRole:'The host changed a member role.', lobbyAuditHost:'The host role was transferred.', lobbyAuditKick:'The host removed a member.', lobbyAuditJoined:'A member joined the lobby.', lobbyAuditReconnected:'A member reconnected.', lobbyAuditLeft:'A member left the lobby.', lobbyAuditPassword:'The host changed room protection.', lobbyAuditStarted:'The game was started from the lobby.', lobbyAuditGeneric:'Lobby state updated.' });
Object.assign(uiTranslations.ru, { lobbyWarningCapacity:'Вместимость бункера не меньше текущего количества активных игроков.', lobbyWarningSpectators:'В комнате уже есть наблюдатели, хотя новые роли наблюдателей отключены.', lobbyWarningPlayers:'Текущее количество игроков превышает максимум.', lobbyAuditSettings:'Host применил настройки игры.', lobbyAuditReady:'Участник изменил готовность.', lobbyAuditReadyReset:'Host сбросил готовность участника.', lobbyAuditRole:'Host изменил роль участника.', lobbyAuditHost:'Передана роль host.', lobbyAuditKick:'Host удалил участника.', lobbyAuditJoined:'Участник присоединился к лобби.', lobbyAuditReconnected:'Участник восстановил соединение.', lobbyAuditLeft:'Участник покинул лобби.', lobbyAuditPassword:'Host изменил защиту комнаты.', lobbyAuditStarted:'Игра запущена из лобби.', lobbyAuditGeneric:'Состояние лобби обновлено.' });
Object.assign(uiTranslations.uk, { gameFinishedTitle:'Гру завершено', gameFinishedReason:'Місткість бункера досягнута.', gameFinishedCapacity:'Місткість бункера', gameFinishedSurvivors:'Переможців', gameFinishedRound:'Раунд завершення', gameFinishedTime:'Час завершення', gameFinishedWinners:'Переможці', gameFinishedNoWinners:'Переможців немає', gameFinishedNewGame:'Нова гра', gameFinishedCopy:'Скопіювати підсумок', gameFinishedWaitHost:'Очікуємо, поки хост почне нову гру.', gameFinishedCopied:'Підсумок скопійовано', gameFinishedCopyFailed:'Не вдалося скопіювати підсумок', gameFinishedConfirmReturn:'Повернути цю кімнату в lobby для нової гри?', gameFinishedReturning:'Повертаємо кімнату в lobby…' });
Object.assign(uiTranslations.en, { gameFinishedTitle:'Game finished', gameFinishedReason:'The bunker capacity has been reached.', gameFinishedCapacity:'Bunker capacity', gameFinishedSurvivors:'Winners', gameFinishedRound:'Completion round', gameFinishedTime:'Completed at', gameFinishedWinners:'Winners', gameFinishedNoWinners:'No winners', gameFinishedNewGame:'New game', gameFinishedCopy:'Copy summary', gameFinishedWaitHost:'Waiting for the host to start a new game.', gameFinishedCopied:'Summary copied', gameFinishedCopyFailed:'Could not copy the summary', gameFinishedConfirmReturn:'Return this room to the lobby for a new game?', gameFinishedReturning:'Returning the room to the lobby…' });
Object.assign(uiTranslations.ru, { gameFinishedTitle:'Игра завершена', gameFinishedReason:'Вместимость бункера достигнута.', gameFinishedCapacity:'Вместимость бункера', gameFinishedSurvivors:'Победителей', gameFinishedRound:'Раунд завершения', gameFinishedTime:'Время завершения', gameFinishedWinners:'Победители', gameFinishedNoWinners:'Победителей нет', gameFinishedNewGame:'Новая игра', gameFinishedCopy:'Скопировать итог', gameFinishedWaitHost:'Ожидаем, пока хост начнёт новую игру.', gameFinishedCopied:'Итог скопирован', gameFinishedCopyFailed:'Не удалось скопировать итог', gameFinishedConfirmReturn:'Вернуть эту комнату в lobby для новой игры?', gameFinishedReturning:'Возвращаем комнату в lobby…' });

Object.assign(uiTranslations.uk, {
	cardExperience:'Досвід', cardAdditionalItem:'Додатково має', cardSeverity:'Тяжкість', cardTooltipLabel:'Пояснення характеристики',
	cardPrivateTooltip:'Це ваша приватна характеристика. Її можна розкрити іншим гравцям.', cardRevealPending:'Розкриваємо…', cardRevealed:'Розкрито', cardChildfree:'Чайлдфрі'
});
Object.assign(uiTranslations.en, {
	cardExperience:'Experience', cardAdditionalItem:'Also has', cardSeverity:'Severity', cardTooltipLabel:'Characteristic details',
	cardPrivateTooltip:'This is your private characteristic. You can reveal it to the other players.', cardRevealPending:'Revealing…', cardRevealed:'Revealed', cardChildfree:'Childfree'
});
Object.assign(uiTranslations.ru, {
	cardExperience:'Опыт', cardAdditionalItem:'Дополнительно имеет', cardSeverity:'Тяжесть', cardTooltipLabel:'Описание характеристики',
	cardPrivateTooltip:'Это ваша приватная характеристика. Её можно раскрыть другим игрокам.', cardRevealPending:'Раскрываем…', cardRevealed:'Раскрыто', cardChildfree:'Чайлдфри'
});

Object.assign(uiTranslations.uk, {
	globalCatalogTitle: "Глобальний каталог контенту", globalCatalogDevelopmentWarning: "Лише Development: read-only каталог. У Production доступ вимкнено.",
	globalCatalogReadOnly: "Тільки перегляд: збереження, видалення, commit і rollback недоступні.", globalCatalogCategory: "Категорія", globalCatalogSearch: "Пошук",
	globalCatalogPrevious: "Назад", globalCatalogNext: "Далі", globalCatalogSchema: "Схема", globalCatalogStableIds: "Стабільні ID", globalCatalogLocalization: "Локалізація"
	, globalDraftsTitle: "Чернетки", globalDraftCreate: "Створити чернетку", globalDraftApply: "Застосувати до чернетки", globalDraftValidate: "Валідувати", globalDraftPreview: "Preview diff", globalDraftDiscard: "Відкинути"
	, globalDraftCommit: "Commit", globalRuntimeRestart: "Зміни набудуть чинності після перезапуску застосунку.", globalBackupsTitle: "Резервні копії", globalBackupsRefresh: "Оновити backups", globalRollbackPreview: "Preview rollback", globalRollbackExecute: "Rollback"
	, globalMigrationTitle: "Потрібна stable-ID migration", globalMigrationPreview: "Preview migration", globalMigrationApply: "Застосувати migration"
	, omniscientModeTitle: "Режим GM-спостерігача", omniscientModeWarning: "Незворотно для цієї кімнати: GM перестане бути учасником гри.", omniscientBootstrapKey: "Development bootstrap key", omniscientPreview: "Preview наслідків", omniscientEnter: "Увійти незворотно", omniscientPublicBadge: "GM-спостерігач"
	, omniscientHiddenTitle: "Всезнаючий GM", omniscientReadOnlyNotice: "Спостерігач — не бере участі у грі. Лише перегляд.", omniscientHiddenSearch: "Пошук гравця або характеристики", omniscientRefresh: "Оновити", omniscientHiddenPending: "Оновлення прихованого стану…", omniscientHiddenError: "Прихований стан недоступний", omniscientSecretVotes: "Таємні голоси"
	, directorControlsTitle: "Director controls", directorControlsWarning: "Preview і підтвердження обов’язкові. Threat force не можна скасувати через undo.", directorOption: "Опція / severity / номер раунду", directorPreview: "Preview дії", directorApply: "Застосувати"
});
Object.assign(uiTranslations.en, {
	globalCatalogTitle: "Global Content Catalog", globalCatalogDevelopmentWarning: "Development only: read-only catalog. Production access is disabled.",
	globalCatalogReadOnly: "Read-only: save, delete, commit and rollback are unavailable.", globalCatalogCategory: "Category", globalCatalogSearch: "Search",
	globalCatalogPrevious: "Previous", globalCatalogNext: "Next", globalCatalogSchema: "Schema", globalCatalogStableIds: "Stable IDs", globalCatalogLocalization: "Localization"
	, globalDraftsTitle: "Drafts", globalDraftCreate: "Create draft", globalDraftApply: "Apply to draft", globalDraftValidate: "Validate", globalDraftPreview: "Preview diff", globalDraftDiscard: "Discard"
	, globalDraftCommit: "Commit", globalRuntimeRestart: "Changes take effect after application restart.", globalBackupsTitle: "Backups", globalBackupsRefresh: "Refresh backups", globalRollbackPreview: "Preview rollback", globalRollbackExecute: "Rollback"
	, globalMigrationTitle: "Stable-ID migration required", globalMigrationPreview: "Preview migration", globalMigrationApply: "Apply migration"
	, omniscientModeTitle: "Spectator GM mode", omniscientModeWarning: "Irreversible in this room: the GM stops participating in gameplay.", omniscientBootstrapKey: "Development bootstrap key", omniscientPreview: "Preview consequences", omniscientEnter: "Enter irreversibly", omniscientPublicBadge: "Spectator GM"
	, omniscientHiddenTitle: "Omniscient GM", omniscientReadOnlyNotice: "Observer — does not participate in gameplay. Read-only.", omniscientHiddenSearch: "Search player or characteristic", omniscientRefresh: "Refresh", omniscientHiddenPending: "Refreshing hidden state…", omniscientHiddenError: "Hidden state unavailable", omniscientSecretVotes: "Secret votes"
	, directorControlsTitle: "Director controls", directorControlsWarning: "Preview and confirmation are required. Threat force cannot be undone.", directorOption: "Option / severity / round number", directorPreview: "Preview action", directorApply: "Apply"
});
Object.assign(uiTranslations.ru, {
	globalCatalogTitle: "Глобальный каталог контента", globalCatalogDevelopmentWarning: "Только Development: read-only каталог. В Production доступ отключён.",
	globalCatalogReadOnly: "Только просмотр: сохранение, удаление, commit и rollback недоступны.", globalCatalogCategory: "Категория", globalCatalogSearch: "Поиск",
	globalCatalogPrevious: "Назад", globalCatalogNext: "Далее", globalCatalogSchema: "Схема", globalCatalogStableIds: "Стабильные ID", globalCatalogLocalization: "Локализация"
	, globalDraftsTitle: "Черновики", globalDraftCreate: "Создать черновик", globalDraftApply: "Применить к черновику", globalDraftValidate: "Проверить", globalDraftPreview: "Preview diff", globalDraftDiscard: "Отбросить"
	, globalDraftCommit: "Commit", globalRuntimeRestart: "Изменения вступят в силу после перезапуска приложения.", globalBackupsTitle: "Резервные копии", globalBackupsRefresh: "Обновить backups", globalRollbackPreview: "Preview rollback", globalRollbackExecute: "Rollback"
	, globalMigrationTitle: "Требуется stable-ID migration", globalMigrationPreview: "Preview migration", globalMigrationApply: "Применить migration"
	, omniscientModeTitle: "Режим GM-наблюдателя", omniscientModeWarning: "Необратимо для этой комнаты: GM перестанет участвовать в игре.", omniscientBootstrapKey: "Development bootstrap key", omniscientPreview: "Preview последствий", omniscientEnter: "Войти необратимо", omniscientPublicBadge: "GM-наблюдатель"
	, omniscientHiddenTitle: "Всезнающий GM", omniscientReadOnlyNotice: "Наблюдатель — не участвует в игре. Только просмотр.", omniscientHiddenSearch: "Поиск игрока или характеристики", omniscientRefresh: "Обновить", omniscientHiddenPending: "Обновление скрытого состояния…", omniscientHiddenError: "Скрытое состояние недоступно", omniscientSecretVotes: "Тайные голоса"
	, directorControlsTitle: "Director controls", directorControlsWarning: "Preview и подтверждение обязательны. Threat force нельзя отменить через undo.", directorOption: "Опция / severity / номер раунда", directorPreview: "Preview действия", directorApply: "Применить"
});
Object.assign(uiTranslations.en, {
	gmRunDiagnostics: "Check room", gmPreviewAutoFix: "Preview auto-fix", gmApplyAutoFix: "Apply safe fixes",
	gmIssueFilter: "Issue filter", gmAll: "All", gmAuditLog: "GM and threat audit log", gmAuditSearch: "Search action or summary",
	gmRefreshAudit: "Refresh log", gmHealthy: "Healthy", gmWarning: "Warning", gmError: "Error", gmNoIssues: "No issues found",
	gmAutoFixAvailable: "Auto-fix available", gmNoAutoFix: "No safe fixes available", gmAutoFixConfirm: "Apply only the previewed safe fixes?",
	gmSnapshotsTitle: "Snapshots / Undo", gmSnapshotReason: "Checkpoint label", gmCreateSnapshot: "Create checkpoint", gmUndoLastAction: "Undo last GM action",
	gmRefreshSnapshots: "Refresh snapshots", gmSnapshotPreview: "Preview", gmSnapshotRestore: "Restore", gmSnapshotEmpty: "No checkpoints yet", gmSnapshotConfirm: "Restore the room from this checkpoint?",
	gmSnapshotActiveConfirm: "The active game will return to an earlier state. Confirm again?", gmSnapshotBlocked: "Restore blocked", gmSnapshotChanges: "Changed categories",
	gmRoomLocalEditor: "Current room editor", gmRoomLocalWarning: "Changes apply only to this room and do not modify global data.", gmCurrentPublicValue: "Current public value", gmNewPublicValue: "New public value", gmEditorApply: "Apply"
});
Object.assign(uiTranslations.ru, {
	gmRunDiagnostics: "Проверить комнату", gmPreviewAutoFix: "Preview auto-fix", gmApplyAutoFix: "Применить безопасные исправления",
	gmIssueFilter: "Фильтр issues", gmAll: "Все", gmAuditLog: "Журнал GM-действий и угроз", gmAuditSearch: "Поиск по action или summary",
	gmRefreshAudit: "Обновить журнал", gmHealthy: "Исправна", gmWarning: "Предупреждение", gmError: "Ошибка", gmNoIssues: "Проблем не обнаружено",
	gmAutoFixAvailable: "Auto-fix available", gmNoAutoFix: "Безопасных исправлений нет", gmAutoFixConfirm: "Применить только previewed безопасные исправления?",
	gmSnapshotsTitle: "Контрольные точки / Undo", gmSnapshotReason: "Название контрольной точки", gmCreateSnapshot: "Создать контрольную точку", gmUndoLastAction: "Отменить последнее GM-действие",
	gmRefreshSnapshots: "Обновить snapshots", gmSnapshotPreview: "Preview", gmSnapshotRestore: "Restore", gmSnapshotEmpty: "Контрольных точек пока нет", gmSnapshotConfirm: "Восстановить комнату из этой контрольной точки?",
	gmSnapshotActiveConfirm: "Активная игра вернётся к предыдущему состоянию. Подтвердить ещё раз?", gmSnapshotBlocked: "Restore заблокирован", gmSnapshotChanges: "Изменённые категории",
	gmRoomLocalEditor: "Редактор текущей комнаты", gmRoomLocalWarning: "Изменения действуют только в этой комнате и не меняют глобальные данные.", gmCurrentPublicValue: "Текущее публичное значение", gmNewPublicValue: "Новое публичное значение", gmEditorApply: "Применить"
});

Object.assign(uiTranslations.uk, {
	apocBadge: "Апокаліпсис", apocDanger: "Небезпека", apocMainThreats: "Основні загрози",
	apocSurvivalRequirements: "Потрібно для виживання", apocConsequences: "Наслідки / Особливості світу",
	apocScenarioBrief: "Сценарій виживання", apocOpenImage: "Відкрити зображення сценарію",
	dangerLow: "Низька", dangerMedium: "Середня", dangerHigh: "Висока",
	dangerVeryHigh: "Дуже висока", dangerCritical: "Критична", dangerUnknown: "Невідомо"
});
Object.assign(uiTranslations.en, {
	apocBadge: "Apocalypse", apocDanger: "Danger", apocMainThreats: "Main threats",
	apocSurvivalRequirements: "Required for survival", apocConsequences: "Consequences / World conditions",
	apocScenarioBrief: "Survival scenario", apocOpenImage: "Open scenario image",
	dangerLow: "Low", dangerMedium: "Medium", dangerHigh: "High",
	dangerVeryHigh: "Very high", dangerCritical: "Critical", dangerUnknown: "Unknown"
});
Object.assign(uiTranslations.ru, {
	apocBadge: "Апокалипсис", apocDanger: "Опасность", apocMainThreats: "Основные угрозы",
	apocSurvivalRequirements: "Нужно для выживания", apocConsequences: "Последствия / Особенности мира",
	apocScenarioBrief: "Сценарий выживания", apocOpenImage: "Открыть изображение сценария",
	dangerLow: "Низкая", dangerMedium: "Средняя", dangerHigh: "Высокая",
	dangerVeryHigh: "Очень высокая", dangerCritical: "Критическая", dangerUnknown: "Неизвестно"
});
Object.assign(uiTranslations.uk, {
	bunkerBadge: "Бункер", bunkerRooms: "Приміщення", bunkerResources: "Ресурси", bunkerProblems: "Проблеми",
	bunkerFacilityRecord: "Технічний паспорт укриття", bunkerOpenImage: "Відкрити зображення бункера", bunkerMonths: "міс.",
	conditionExcellent: "Відмінний", conditionGood: "Хороший", conditionStable: "Стабільний", conditionWorn: "Зношений",
	conditionDamaged: "Пошкоджений", conditionPoor: "Поганий", conditionCritical: "Критичний", conditionUnknown: "Невідомо"
});
Object.assign(uiTranslations.en, {
	bunkerBadge: "Bunker", bunkerRooms: "Rooms", bunkerResources: "Resources", bunkerProblems: "Problems",
	bunkerFacilityRecord: "Shelter technical record", bunkerOpenImage: "Open bunker image", bunkerMonths: "mo.",
	conditionExcellent: "Excellent", conditionGood: "Good", conditionStable: "Stable", conditionWorn: "Worn",
	conditionDamaged: "Damaged", conditionPoor: "Poor", conditionCritical: "Critical", conditionUnknown: "Unknown"
});
Object.assign(uiTranslations.ru, {
	bunkerBadge: "Бункер", bunkerRooms: "Помещения", bunkerResources: "Ресурсы", bunkerProblems: "Проблемы",
	bunkerFacilityRecord: "Технический паспорт убежища", bunkerOpenImage: "Открыть изображение бункера", bunkerMonths: "мес.",
	conditionExcellent: "Отличный", conditionGood: "Хороший", conditionStable: "Стабильный", conditionWorn: "Изношенный",
	conditionDamaged: "Повреждённый", conditionPoor: "Плохой", conditionCritical: "Критический", conditionUnknown: "Неизвестно"
});
Object.assign(uiTranslations.uk, {
	threatIncidentStatus: "Стан інциденту", threatMode: "Режим", threatActiveOperation: "Активна операція",
	threatRecommendations: "Рекомендації", threatWhatHappens: "Що відбувається", threatIncidentReport: "Оперативне зведення",
	threatOpenImage: "Відкрити зображення загрози", threatSeverityLow: "Низька", threatSeverityMedium: "Середня",
	threatSeverityHigh: "Висока", threatSeverityVeryHigh: "Дуже висока", threatSeverityCritical: "Критична", threatSeverityUnknown: "Не визначено",
	threatStatusPending: "Очікує дій", threatStatusActive: "Операція триває", threatStatusSuccess: "Завершено успішно",
	threatStatusConsequences: "Завершено з наслідками", threatStatusFailure: "Провал", threatStatusCancelled: "Скасовано",
	threatStatusTimeout: "Час вичерпано", threatStatusUnknown: "Стан не визначено"
});
Object.assign(uiTranslations.en, {
	threatIncidentStatus: "Incident status", threatMode: "Mode", threatActiveOperation: "Active operation",
	threatRecommendations: "Recommendations", threatWhatHappens: "What is happening", threatIncidentReport: "Incident report",
	threatOpenImage: "Open threat image", threatSeverityLow: "Low", threatSeverityMedium: "Medium",
	threatSeverityHigh: "High", threatSeverityVeryHigh: "Very high", threatSeverityCritical: "Critical", threatSeverityUnknown: "Not specified",
	threatStatusPending: "Awaiting action", threatStatusActive: "Operation active", threatStatusSuccess: "Completed successfully",
	threatStatusConsequences: "Completed with consequences", threatStatusFailure: "Failure", threatStatusCancelled: "Cancelled",
	threatStatusTimeout: "Time expired", threatStatusUnknown: "Status unavailable"
});
Object.assign(uiTranslations.ru, {
	threatIncidentStatus: "Состояние инцидента", threatMode: "Режим", threatActiveOperation: "Активная операция",
	threatRecommendations: "Рекомендации", threatWhatHappens: "Что происходит", threatIncidentReport: "Оперативная сводка",
	threatOpenImage: "Открыть изображение угрозы", threatSeverityLow: "Низкая", threatSeverityMedium: "Средняя",
	threatSeverityHigh: "Высокая", threatSeverityVeryHigh: "Очень высокая", threatSeverityCritical: "Критическая", threatSeverityUnknown: "Не определено",
	threatStatusPending: "Ожидает действий", threatStatusActive: "Операция продолжается", threatStatusSuccess: "Успешно завершено",
	threatStatusConsequences: "Завершено с последствиями", threatStatusFailure: "Провал", threatStatusCancelled: "Отменено",
	threatStatusTimeout: "Время истекло", threatStatusUnknown: "Состояние не определено"
});
Object.assign(uiTranslations.uk, {
	playerOverviewTitle: "Гравці", playerLabel: "Гравець", notRevealed: "Не розкрито",
	revealedProgress: "Розкрито {shown} із {total}", previousPlayer: "Попередній гравець", nextPlayer: "Наступний гравець",
	noAvailablePlayers: "Немає доступних гравців", activePlayer: "Активний гравець", playerActive: "У грі",
	playerOnline: "У мережі", playerOffline: "Не в мережі", specialNextOrder: "Наступний", specialPreviousOrder: "Попередній",
	allPlayersView: "Усі гравці", singlePlayerView: "Один гравець", playerViewMode: "Режим перегляду", comparisonSort: "Сортування",
	sortBySeat: "За номером", sortByName: "За ім’ям", sortMostRevealed: "Більше розкрито", sortLeastRevealed: "Менше розкрито"
});
Object.assign(uiTranslations.en, {
	playerOverviewTitle: "Players", playerLabel: "Player", notRevealed: "Not revealed",
	revealedProgress: "Revealed {shown} of {total}", previousPlayer: "Previous player", nextPlayer: "Next player",
	noAvailablePlayers: "No available players", activePlayer: "Active player", playerActive: "Active",
	playerOnline: "Online", playerOffline: "Offline", specialNextOrder: "Next", specialPreviousOrder: "Previous",
	allPlayersView: "All players", singlePlayerView: "One player", playerViewMode: "View mode", comparisonSort: "Sort",
	sortBySeat: "By number", sortByName: "By name", sortMostRevealed: "Most revealed", sortLeastRevealed: "Least revealed"
});
Object.assign(uiTranslations.ru, {
	playerOverviewTitle: "Игроки", playerLabel: "Игрок", notRevealed: "Не раскрыто",
	revealedProgress: "Раскрыто {shown} из {total}", previousPlayer: "Предыдущий игрок", nextPlayer: "Следующий игрок",
	noAvailablePlayers: "Нет доступных игроков", activePlayer: "Активный игрок", playerActive: "В игре",
	playerOnline: "В сети", playerOffline: "Не в сети", specialNextOrder: "Следующий", specialPreviousOrder: "Предыдущий",
	allPlayersView: "Все игроки", singlePlayerView: "Один игрок", playerViewMode: "Режим просмотра", comparisonSort: "Сортировка",
	sortBySeat: "По номеру", sortByName: "По имени", sortMostRevealed: "Больше раскрыто", sortLeastRevealed: "Меньше раскрыто"
});

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

function normalizeRoundState(source) {
	if (!source) return null;

	const revealedPlayers = source.revealedPlayers || source.RevealedPlayers || [];
	const readyStatuses = source.readyStatuses || source.ReadyStatuses || [];
	const specialCards = source.specialCards || source.SpecialCards || [];
	const threatRevealed = !!(source.threatRevealed ?? source.ThreatRevealed);
	return {
		currentRound: source.currentRound ?? source.CurrentRound ?? 0,
		state: source.state || source.State || source.roomState || source.RoomState || currentRoom?.state || "Lobby",
		roomState: source.roomState || source.RoomState || currentRoom?.state || "Lobby",
		currentPhase: source.currentPhase || source.CurrentPhase || source.phase || source.Phase || currentRoundState?.phase || "Lobby",
		phase: source.phase || source.Phase || currentRoundState?.phase || "Lobby",
		completion: normalizeGameCompletion(source.completion || source.Completion || null),
		isPaused: source.isPaused ?? source.IsPaused ?? false,
		pauseReason: source.pauseReason || source.PauseReason || null,
		pausedAtUtc: source.pausedAtUtc || source.PausedAtUtc || null,
		gameTimer: normalizeGameTimer(source.gameTimer || source.GameTimer || null),
		activePlayerSeatNumber: source.activePlayerSeatNumber ?? source.ActivePlayerSeatNumber ?? source.currentPlayerSeatNumber ?? source.CurrentPlayerSeatNumber ?? source.turnPlayerSeatNumber ?? source.TurnPlayerSeatNumber ?? 0,
		activePlayerConnectionId: source.activePlayerConnectionId || source.ActivePlayerConnectionId || source.currentPlayerConnectionId || source.CurrentPlayerConnectionId || source.turnPlayerConnectionId || source.TurnPlayerConnectionId || "",
		activePlayerStableId: source.activePlayerStableId || source.ActivePlayerStableId || source.currentPlayerStableId || source.CurrentPlayerStableId || source.turnPlayerStableId || source.TurnPlayerStableId || "",
		activePlayerCount: source.activePlayerCount ?? source.ActivePlayerCount ?? 0,
		revealedCount: source.revealedCount ?? source.RevealedCount ?? 0,
		allPlayersRevealed: source.allPlayersRevealed ?? source.AllPlayersRevealed ?? false,
		canStartVoting: source.canStartVoting ?? source.CanStartVoting ?? false,
		votingStartBlockedCode: source.votingStartBlockedCode || source.VotingStartBlockedCode || null,
		threatRevealed,
		threatRevealedAtRound: source.threatRevealedAtRound ?? source.ThreatRevealedAtRound ?? null,
		threat: threatRevealed ? (source.threat || source.Threat || null) : null,
		threatState: normalizeThreatState(source.threatState || source.ThreatState || null),
		diceRoll: normalizeDiceRoll(source.diceRoll || source.DiceRoll || null),
		diceRolls: (source.diceRolls || source.DiceRolls || []).map(roll => normalizeDiceRoll(roll)).filter(Boolean),
		readyStatuses: readyStatuses.map(player => ({
			connectionId: player.connectionId || player.ConnectionId || "",
			stablePlayerId: player.stablePlayerId || player.StablePlayerId || "",
			name: player.name || player.Name || "",
			seatNumber: player.seatNumber ?? player.SeatNumber ?? 0,
			status: player.status || player.Status || "pending"
		})),
		specialCards: specialCards.map(card => normalizeSpecialCardState(card)),
		revealedPlayers: revealedPlayers.map(player => ({
			connectionId: player.connectionId || player.ConnectionId || "",
			stablePlayerId: player.stablePlayerId || player.StablePlayerId || "",
			name: player.name || player.Name || "",
			characteristicKey: player.characteristicKey || player.CharacteristicKey || ""
		}))
	};
}

function applyRoundState(source) {
	const normalized = normalizeRoundState(source);
	if (!normalized) return;

	currentRoundState = normalized;
	if (currentRoom) {
		currentRoom.state = normalized.state || normalized.roomState || currentRoom.state;
		currentRoom.currentRound = normalized.currentRound;
		currentRoom.phase = normalized.currentPhase || normalized.phase;
	}
	if (normalized.completion) currentGameCompletion = normalized.completion;
	currentThreat = normalized.threat || (normalized.threatRevealed ? currentThreat : null);
	currentThreatState = normalized.threatState || currentThreatState;
	if (normalized.gameTimer) syncGameTimer(normalized.gameTimer);
	updateRoundStatusUI();
	renderThreatPanel(currentThreat);
	updateReadyCheckUI();
	updateSpecialCardsUI();
}

function normalizeGameCompletion(source) {
	if (!source) return null;
	const winners = source.winners || source.Winners || [];
	return {
		reason: source.reason || source.Reason || 'bunker_capacity_reached',
		source: source.source || source.Source || '',
		bunkerCapacity: source.bunkerCapacity ?? source.BunkerCapacity ?? 0,
		survivorCount: source.survivorCount ?? source.SurvivorCount ?? winners.length,
		completedAtRound: source.completedAtRound ?? source.CompletedAtRound ?? source.currentRound ?? source.CurrentRound ?? 0,
		completedAtUtc: source.completedAtUtc || source.CompletedAtUtc || null,
		winners: winners.map(winner => ({
			name: winner.name || winner.Name || '',
			playerId: winner.playerId || winner.PlayerId || ''
		}))
	};
}

function isFinishedGameState(source, completion = null) {
	const state = source?.state || source?.State || source?.roomState || source?.RoomState || currentRoom?.state;
	const phase = source?.currentPhase || source?.CurrentPhase || source?.phase || source?.Phase || currentRoundState?.phase;
	return state === 'Finished' || phase === 'Finished' || !!completion;
}

function setGameFinishedMutationState(finished) {
	const roomSection = document.getElementById('roomSection');
	if (roomSection) roomSection.classList.toggle('is-game-finished', finished);

	const selectors = [
		'#startVotingBtn', '#startGameBtn', '#gmPanelBtn',
		'#votingPanel button', '#votingResultsPanel button', '#readyCheckPanel button',
		'#gmPanel button:not(.btn-close):not(.gm-tab)',
		'#myPlayerSection .vault-card-reveal', '#myPlayerSection .special-card-use-btn',
		'#myPlayerSection .btn-eliminated-reveal-all', '#threatPanel .char-btn',
		'#threatPanel .btn-scenario-image', '.events-section-wrapper .btn-apply-effect'
	];
	document.querySelectorAll(selectors.join(',')).forEach(button => {
		if (finished) {
			if (!button.dataset.postGameDisabled) {
				button.dataset.postGameDisabled = button.disabled ? 'preserve' : 'restore';
			}
			button.disabled = true;
			button.setAttribute('aria-disabled', 'true');
		} else if (button.dataset.postGameDisabled) {
			if (button.dataset.postGameDisabled === 'restore') button.disabled = false;
			button.removeAttribute('data-post-game-disabled');
			button.removeAttribute('aria-disabled');
		}
	});
}

function renderGameFinished(completion, context = {}) {
	const normalized = normalizeGameCompletion(completion || currentGameCompletion);
	if (!normalized) return false;

	currentGameCompletion = normalized;
	if (currentRoom) {
		currentRoom.state = 'Finished';
		currentRoom.phase = 'Finished';
	}
	currentGameTimer = null;
	gameTimerClockAnchor = null;
	currentVoting = null;
	myVote = null;

	showRoomSection();
	const lobby = document.getElementById('roomLobby');
	const game = document.getElementById('gameSection');
	const personal = document.getElementById('myPlayerSection');
	const panel = document.getElementById('gameFinishedPanel');
	if (lobby) lobby.style.display = 'none';
	if (game) game.style.display = 'block';
	if (personal) personal.style.display = 'block';
	if (panel) panel.style.display = 'grid';

	setText('#gameFinishedTitle', t('gameFinishedTitle'));
	setText('#gameFinishedReason', t('gameFinishedReason'));
	setText('#gameFinishedCapacityLabel', t('gameFinishedCapacity'));
	setText('#gameFinishedSurvivorLabel', t('gameFinishedSurvivors'));
	setText('#gameFinishedRoundLabel', t('gameFinishedRound'));
	setText('#gameFinishedTimeLabel', t('gameFinishedTime'));
	setText('#gameFinishedWinnersTitle', t('gameFinishedWinners'));
	setText('#gameFinishedCapacity', normalized.bunkerCapacity);
	setText('#gameFinishedSurvivorCount', normalized.survivorCount);
	setText('#gameFinishedRound', normalized.completedAtRound || '—');

	const locale = { uk: 'uk-UA', en: 'en-GB', ru: 'ru-RU' }[getCurrentLanguage()] || 'uk-UA';
	const completedDate = normalized.completedAtUtc ? new Date(normalized.completedAtUtc) : null;
	setText('#gameFinishedTime', completedDate && !Number.isNaN(completedDate.getTime()) ? completedDate.toLocaleString(locale) : '—');

	const winnerList = document.getElementById('gameFinishedWinners');
	if (winnerList) {
		winnerList.innerHTML = normalized.winners.length
			? normalized.winners.map(winner => `<li>${escapeHtml(winner.name || t('unknown'))}</li>`).join('')
			: `<li>${escapeHtml(t('gameFinishedNoWinners'))}</li>`;
	}

	const newGameButton = document.getElementById('returnFinishedGameButton');
	if (newGameButton) {
		newGameButton.style.display = isHost ? 'inline-flex' : 'none';
		newGameButton.textContent = returnFinishedGamePending ? t('gameFinishedReturning') : t('gameFinishedNewGame');
		newGameButton.disabled = returnFinishedGamePending;
	}
	const copyButton = document.getElementById('copyGameSummaryButton');
	if (copyButton) copyButton.textContent = t('gameFinishedCopy');
	const waiting = document.getElementById('gameFinishedWaitingForHost');
	if (waiting) {
		waiting.textContent = isHost ? '' : t('gameFinishedWaitHost');
		waiting.style.display = isHost ? 'none' : 'block';
	}
	const stateLabel = document.getElementById('currentRoomState');
	if (stateLabel) stateLabel.textContent = t('gameFinishedTitle');

	setGameFinishedMutationState(true);
	return true;
}

function buildGameSummaryText() {
	const completion = normalizeGameCompletion(currentGameCompletion);
	if (!completion) return '';
	const winnerNames = completion.winners.map(winner => winner.name).filter(Boolean);
	return [
		t('gameFinishedTitle'),
		`${t('gameFinishedCapacity')}: ${completion.bunkerCapacity}`,
		`${t('gameFinishedSurvivors')}: ${completion.survivorCount}`,
		`${t('gameFinishedRound')}: ${completion.completedAtRound || '—'}`,
		`${t('gameFinishedWinners')}: ${winnerNames.length ? winnerNames.join(', ') : t('gameFinishedNoWinners')}`
	].join('\n');
}

async function copyGameSummary() {
	const feedback = document.getElementById('gameFinishedFeedback');
	try {
		const summary = buildGameSummaryText();
		if (!summary || !navigator.clipboard?.writeText) throw new Error('clipboard_unavailable');
		await navigator.clipboard.writeText(summary);
		if (feedback) { feedback.textContent = t('gameFinishedCopied'); feedback.classList.remove('is-error'); }
		addEventMessage(escapeHtml(t('gameFinishedCopied')));
	} catch (_) {
		if (feedback) { feedback.textContent = t('gameFinishedCopyFailed'); feedback.classList.add('is-error'); }
		addEventMessage(escapeHtml(t('gameFinishedCopyFailed')));
	}
}

async function returnFinishedGameToLobby() {
	if (!isHost || returnFinishedGamePending || !currentGameCompletion) return;
	if (!confirm(t('gameFinishedConfirmReturn'))) return;
	returnFinishedGamePending = true;
	renderGameFinished(currentGameCompletion, { source: 'return-request' });
	try {
		await connection.invoke('ReturnFinishedGameToLobby', true, crypto.randomUUID());
	} catch (error) {
		returnFinishedGamePending = false;
		renderGameFinished(currentGameCompletion, { source: 'return-error' });
		const feedback = document.getElementById('gameFinishedFeedback');
		if (feedback) { feedback.textContent = localizeServerMessage(error?.message || 'game_return_failed'); feedback.classList.add('is-error'); }
	}
}

function clearGameFinishedStateForLobby() {
	currentGameCompletion = null;
	returnFinishedGamePending = false;
	currentVoting = null;
	currentRoundState = null;
	currentThreat = null;
	currentThreatState = null;
	currentGameTimer = null;
	gameTimerClockAnchor = null;
	myVote = null;
	currentApocalypse = null;
	currentBunker = null;
	['myPlayerCards', 'mySpecialCardsList', 'votingCandidates', 'votingResultsContent', 'threatContent'].forEach(id => {
		const element = document.getElementById(id);
		if (element) element.innerHTML = '';
	});
	const panel = document.getElementById('gameFinishedPanel');
	if (panel) panel.style.display = 'none';
	const feedback = document.getElementById('gameFinishedFeedback');
	if (feedback) { feedback.textContent = ''; feedback.classList.remove('is-error'); }
	setGameFinishedMutationState(false);
}

function normalizeGameTimer(source) {
	if (!source) return null;
	return {
		status: source.status || source.Status || 'Stopped',
		purpose: source.purpose || source.Purpose || 'Round',
		label: source.label || source.Label || '',
		durationSeconds: source.durationSeconds ?? source.DurationSeconds ?? 300,
		deadlineUtc: source.deadlineUtc || source.DeadlineUtc || null,
		remainingSeconds: Math.max(0, source.remainingSeconds ?? source.RemainingSeconds ?? 0),
		serverTimestampUtc: source.serverTimestampUtc || source.ServerTimestampUtc || new Date().toISOString(),
		updatedAtUtc: source.updatedAtUtc || source.UpdatedAtUtc || null
	};
}

function syncGameTimer(source) {
	currentGameTimer = normalizeGameTimer(source);
	if (!currentGameTimer) return;
	gameTimerClockAnchor = {
		serverMs: Date.parse(currentGameTimer.serverTimestampUtc),
		performanceMs: performance.now(),
		deadlineMs: currentGameTimer.deadlineUtc ? Date.parse(currentGameTimer.deadlineUtc) : null
	};
	const minutes = document.getElementById('gmTimerMinutes');
	const seconds = document.getElementById('gmTimerSeconds');
	if (minutes && seconds && !gameTimerCommandPending) {
		minutes.value = Math.floor(currentGameTimer.remainingSeconds / 60);
		seconds.value = currentGameTimer.remainingSeconds % 60;
	}
	renderGameTimer();
}

function getGameTimerRemaining() {
	if (!currentGameTimer) return 0;
	if (currentGameTimer.status.toLowerCase() !== 'running' || !gameTimerClockAnchor?.deadlineMs) {
		return Math.max(0, currentGameTimer.remainingSeconds);
	}
	const serverNow = gameTimerClockAnchor.serverMs + (performance.now() - gameTimerClockAnchor.performanceMs);
	return Math.max(0, Math.ceil((gameTimerClockAnchor.deadlineMs - serverNow) / 1000));
}

function renderGameTimer() {
	if (!currentGameTimer) return;
	const remaining = getGameTimerRemaining();
	const value = `${String(Math.floor(remaining / 60)).padStart(2, '0')}:${String(remaining % 60).padStart(2, '0')}`;
	const effectiveStatus = currentGameTimer.status.toLowerCase() === 'running' && remaining === 0 ? 'Expired' : currentGameTimer.status;
	const statusKey = effectiveStatus.toLowerCase() === 'expired' ? 'gmTimerExpired' :
		effectiveStatus.toLowerCase() === 'paused' ? 'gmPause' :
			effectiveStatus.toLowerCase() === 'stopped' ? 'gmTimerStopped' : effectiveStatus;
	setText('#publicGameTimerValue', value);
	setText('#publicGameTimerStatus', t(statusKey));
	setText('#publicGameTimerLabel', currentGameTimer.label || t(`timerPurpose${currentGameTimer.purpose}`));
	const publicTimer = document.getElementById('publicGameTimer');
	if (publicTimer) {
		publicTimer.classList.remove('timer-running', 'timer-paused', 'timer-expired', 'timer-stopped');
		const timerState = ['running', 'paused', 'expired', 'stopped'].includes(effectiveStatus.toLowerCase())
			? effectiveStatus.toLowerCase()
			: 'stopped';
		publicTimer.classList.add(`timer-${timerState}`);
	}
	const status = currentGameTimer.status.toLowerCase();
	const setDisabled = (id, disabled) => { const element = document.getElementById(id); if (element) element.disabled = gameTimerCommandPending || disabled; };
	setDisabled('gmTimerStart', false);
	setDisabled('gmTimerPause', status !== 'running');
	setDisabled('gmTimerResume', status !== 'paused');
	setDisabled('gmTimerRestart', !currentGameTimer.durationSeconds);
	setDisabled('gmTimerStop', status === 'stopped');
}

window.setInterval(renderGameTimer, 250);

function getCurrentRoundNumber() {
	return currentRoundState?.currentRound || currentRoom?.currentRound || currentRoom?.CurrentRound || 0;
}

function getCurrentPhase() {
	return currentRoundState?.phase || currentRoom?.phase || currentRoom?.CurrentPhase || "Lobby";
}

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

function normalizeDiceRoll(source) {
	if (!source) return null;
	const value = Number(source.value ?? source.Value ?? 0);
	if (!Number.isFinite(value) || value <= 0) return null;

	return {
		round: source.round ?? source.Round ?? 0,
		value,
		rolledAt: source.rolledAt || source.RolledAt || null,
		rolledByPlayerId: source.rolledByPlayerId || source.RolledByPlayerId || "",
		rolledByConnectionId: source.rolledByConnectionId || source.RolledByConnectionId || "",
		rolledByPlayerName: source.rolledByPlayerName || source.RolledByPlayerName || "GM"
	};
}

function hasCurrentPlayerRevealedThisRound() {
	if (!currentRoundState?.revealedPlayers) return false;

	const self = roomPlayers?.[myConnectionId] || {};
	const selfStableId = self.stablePlayerId || stablePlayerId || "";

	return currentRoundState.revealedPlayers.some(player =>
		player.connectionId === myConnectionId ||
		(selfStableId && player.stablePlayerId === selfStableId)
	);
}

function canRevealThisRound() {
	const state = currentRoom?.state;
	return (state === "Playing" || state === "Started") && getCurrentPhase() === "RoundReveal" && !hasCurrentPlayerRevealedThisRound();
}

function getRevealBlockedReason() {
	const state = currentRoom?.state;
	if (state !== "Playing" && state !== "Started") {
		return getCurrentLanguage() === "en"
			? "The game has not started yet"
			: getCurrentLanguage() === "ru"
				? "Игра еще не началась"
				: "Гра ще не почалась";
	}

	if (getCurrentPhase() !== "RoundReveal") {
		return getCurrentLanguage() === "en"
			? "Revealing is not active now"
			: getCurrentLanguage() === "ru"
				? "Сейчас не фаза раскрытия характеристик"
				: "Зараз не фаза розкриття характеристик";
	}

	if (hasCurrentPlayerRevealedThisRound()) {
		return getCurrentLanguage() === "en"
			? "You already revealed a characteristic this round"
			: getCurrentLanguage() === "ru"
				? "Вы уже раскрыли характеристику в этом раунде"
				: "У цьому раунді ви вже розкрили характеристику";
	}

	return "";
}

function getPhaseLabel(phase = getCurrentPhase()) {
	const labels = {
		Lobby: "Лобі",
		RoundReveal: "Розкриття характеристик",
		RoundEnded: "Раунд завершено",
		Threat: "Загроза",
		ExtraInventory: "Додатковий інвентар",
		PreVotingReadyCheck: "Готовність до голосування",
		Voting: "Голосування",
		VotingResults: "Результати голосування",
		Finished: "Гра завершена"
	};
	return labels[phase] || phase || "Лобі";
}

function canEndRoundNow() {
	return isHost &&
		currentRoom?.state === "Playing" &&
		getCurrentPhase() === "RoundReveal" &&
		currentRoundState?.allPlayersRevealed === true;
}

function canRollRoundDiceNow() {
	return canEndRoundNow() && !currentRoundState?.diceRoll;
}

function canStartVotingNow() {
	return isHost && currentRoundState?.canStartVoting === true;
}

function getRoomStateLabel() {
	if (!currentRoom) return t('lobby');

	if (currentRoom.state === 'Lobby') return t('lobby');
	if (currentRoom.state === 'Finished') return t('gameFinishedTitle');
	if (currentRoom.state === 'Voting') {
		return getCurrentLanguage() === 'en' ? 'Voting' : getCurrentLanguage() === 'ru' ? 'Голосование' : 'Голосування';
	}

	const round = getCurrentRoundNumber();
	if (currentRoom.state === 'Playing' || currentRoom.state === 'Started') {
		return round > 0 ? `${t('game')} · Раунд ${round} · ${getPhaseLabel()}` : t('game');
	}

	return t('game');
}

function updateRoundStatusUI() {
	const round = getCurrentRoundNumber();
	const phase = getCurrentPhase();
	const shouldShow = currentRoom && currentRoom.state !== "Lobby" && round > 0;
	const panel = document.getElementById('roundStatusPanel');

	if (panel) {
		panel.style.display = shouldShow ? 'grid' : 'none';
		panel.classList.toggle('is-paused', shouldShow && currentRoundState?.isPaused === true);
		panel.classList.toggle('is-running', shouldShow && currentRoundState?.isPaused !== true);
	}

	const roundText = round > 0 ? `Раунд ${round}` : 'Раунд -';
	setText('#roundStatusNumber', roundText);
	setText('#roundStatusPhase', getPhaseLabel(phase));
	setText('#roundStatusProgress', `${currentRoundState?.revealedCount ?? 0}/${currentRoundState?.activePlayerCount ?? 0} відкрили`);
	setText('#gmCurrentRound', roundText);
	setText('#gmCurrentPhase', getPhaseLabel(phase));
	setText('#gmRoundProgress', `${currentRoundState?.revealedCount ?? 0}/${currentRoundState?.activePlayerCount ?? 0} відкрили`);
	const pauseBadge = document.getElementById('gmPauseBadge');
	if (pauseBadge) pauseBadge.textContent = currentRoundState?.isPaused ? t('gmStatusPaused') : t('gmStatusRunning');
	const pauseReasonSummary = document.getElementById('gmPauseReasonSummary');
	if (pauseReasonSummary) {
		const pauseReason = currentRoundState?.isPaused ? (currentRoundState.pauseReason || '') : '';
		pauseReasonSummary.textContent = pauseReason;
		pauseReasonSummary.style.display = pauseReason ? '' : 'none';
	}
	const manualRound = document.getElementById('gmManualRound');
	if (manualRound && document.activeElement !== manualRound) manualRound.value = round || 1;
	const diceRoll = currentRoundState?.diceRoll || null;
	const diceText = diceRoll ? `Кубик: ${diceRoll.value}` : '';
	setText('#roundDiceResult', diceText);
	setText('#gmDiceResult', diceText);
	const roundDiceResult = document.getElementById('roundDiceResult');
	if (roundDiceResult) roundDiceResult.style.display = diceRoll ? 'inline-flex' : 'none';
	const gmDiceResult = document.getElementById('gmDiceResult');
	if (gmDiceResult) gmDiceResult.style.display = diceRoll ? 'inline-flex' : 'none';

	const rollDiceBtn = document.getElementById('rollDiceBtn');
	if (rollDiceBtn) {
		rollDiceBtn.style.display = isHost && currentRoom?.state !== "Lobby" ? 'inline-flex' : 'none';
		rollDiceBtn.disabled = !canRollRoundDiceNow();
		rollDiceBtn.title = diceRoll
			? 'Кубик у цьому раунді вже кинуто'
			: canRollRoundDiceNow()
				? ''
				: 'Кубик доступний після reveal усіх активних гравців';
	}

	const endRoundBtn = document.getElementById('endRoundBtn');
	if (endRoundBtn) {
		endRoundBtn.disabled = !canEndRoundNow();
		endRoundBtn.title = endRoundBtn.disabled
			? 'Раунд можна завершити після reveal усіх активних гравців'
			: '';
	}

	const readyBtn = document.getElementById('startReadyCheckBtn');
	if (readyBtn) {
		const canMarkReady = isHost &&
			currentRoom?.state === "Playing" &&
			['RoundReveal', 'ExtraInventory', 'PreVotingReadyCheck', 'VotingResults'].includes(phase);
		readyBtn.style.display = isHost && currentRoom?.state !== "Lobby" ? 'inline-flex' : 'none';
		readyBtn.disabled = !canMarkReady;
		readyBtn.title = canMarkReady ? '' : t('unavailableNow');
	}

	const gmStartVotingBtn = document.getElementById('gmStartVotingBtn');
	if (gmStartVotingBtn) {
		gmStartVotingBtn.style.display = isHost && shouldShow ? 'inline-flex' : 'none';
		gmStartVotingBtn.disabled = !canStartVotingNow();
	}

	const hint = document.getElementById('gmVotingLockedHint');
	if (hint) {
		if (!shouldShow) {
			hint.textContent = 'Голосування відкриється після старту гри.';
		} else if (round < 3) {
			hint.textContent = 'Голосування відкриється після завершення 3 раунду.';
		} else if (phase === "RoundReveal") {
			hint.textContent = 'Завершіть 3 раунд після reveal усіх активних гравців.';
		} else if (canStartVotingNow()) {
			hint.textContent = 'Можна починати голосування.';
		} else if (phase === "Voting" || phase === "VotingResults") {
			hint.textContent = getPhaseLabel(phase);
		} else {
			hint.textContent = getPhaseLabel(phase);
		}
	}

	const topVotingBtn = document.getElementById('startVotingBtn');
	if (topVotingBtn) {
		topVotingBtn.style.display = canStartVotingNow() ? 'inline-block' : 'none';
	}
}

const threatIconSvgRegistry = Object.freeze({
	radiation: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="7" fill="currentColor"/><path d="M27 22 19 8A28 28 0 0 1 31 5v16m6 1 8-14a28 28 0 0 1 9 9L40 25m1 12h16a28 28 0 0 1-5 13L38 41M27 42l-8 14a28 28 0 0 1-10-9l14-8" fill="none" stroke="currentColor" stroke-width="5"/></svg>',
	air: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="5" fill="currentColor"/><path d="M32 27c-2-11 5-18 15-16 3 10-3 18-15 16Zm5 8c11-2 18 5 16 15-10 3-18-3-16-15Zm-10 2c2 11-5 18-15 16-3-10 3-18 15-16Zm-2-10C14 29 7 22 9 12c10-3 18 3 16 15Z" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
	fire: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M35 5c4 12-7 15-3 26 4-7 10-10 15-15 8 11 10 20 5 30-4 9-12 13-21 13S14 55 10 47C4 34 14 23 27 11c0 9 2 13 8 17" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	flood: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M7 22c7 0 7 5 14 5s7-5 14-5 7 5 14 5 7-5 10-5M7 35c7 0 7 5 14 5s7-5 14-5 7 5 14 5 7-5 10-5M7 48c7 0 7 5 14 5s7-5 14-5 7 5 14 5 7-5 10-5" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
	structural: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 56V13h48v43M8 56h48M31 13l-6 14 10 6-8 23M18 24h9m10 0h10M16 41h9m14 0h9" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	contamination: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 7h16M28 7v17L14 50c-2 4 1 7 5 7h26c4 0 7-3 5-7L36 24V7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M20 43c8-5 16 5 25-1" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="28" cy="48" r="2" fill="currentColor"/></svg>',
	medical: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="9" y="13" width="46" height="42" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M27 22h10v10h10v10H37v10H27V42H17V32h10V22Z" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	biological: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 25V8m-6 19L11 18m14 16L9 39m20 0L18 54m20-15 10 15m-9-20 16 5m-16-12 14-9" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="8" r="4"/><circle cx="11" cy="18" r="4"/><circle cx="9" cy="39" r="4"/><circle cx="18" cy="54" r="4"/><circle cx="48" cy="54" r="4"/><circle cx="55" cy="39" r="4"/><circle cx="53" cy="18" r="4"/></svg>',
	security: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 53 14v16c0 13-8 23-21 28C19 53 11 43 11 30V14l21-8Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M22 33h20M32 23v20" stroke="currentColor" stroke-width="4"/></svg>',
	power: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M36 5 15 36h15l-3 23 22-34H34l2-20Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/></svg>',
	environmental: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 42h35c7 0 11-4 11-10s-5-10-11-10c-2-9-9-15-18-15-10 0-18 7-19 18-6 1-9 5-9 9 0 5 4 8 11 8Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m20 49-4 8m17-8-4 8m17-8-4 8" stroke="currentColor" stroke-width="4"/></svg>',
	chemical: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M22 8h20M27 8v18L13 51c-2 4 1 7 5 7h28c4 0 7-3 5-7L37 26V8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M19 44h27" stroke="currentColor" stroke-width="4"/></svg>',
	anomaly: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 5 9 18 18 9-18 9-9 18-9-18-18-9 18-9 9-18Z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="7" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
	generic: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 59 56H5L32 6Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 23v17m0 8v2" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>'
});

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
		<div class="threat-sealed-pattern" aria-hidden="true"></div>
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
	const footerControls = isHost ? `<input type="file" id="threatImageInput" accept="image/*" hidden onchange="uploadThreatImage(this)"><button type="button" class="btn-scenario-image" onclick="document.getElementById('threatImageInput').click()">${escapeHtml(t('uploadImage'))}</button><button type="button" class="btn-scenario-image btn-generate" onclick="generateThreatPrompt()">${escapeHtml(t('generatePrompt'))}</button>${model.imageUrl ? `<button type="button" class="btn-scenario-image" onclick="openCurrentThreatImage()">${escapeHtml(t('threatOpenImage'))}</button><button type="button" class="btn-scenario-image btn-remove" onclick="removeThreatImage()">${escapeHtml(t('remove'))}</button>` : ''}` : '';

	return `<article class="scenario-immersive-shell threat-scenario-shell variant-${variant} severity-${severity.semantic}" aria-labelledby="threat-scenario-title">
		<header class="scenario-immersive-hero threat-hero ${model.imageUrl ? 'has-image' : 'no-image'}">${media}<div class="threat-hero-overlay" aria-hidden="true"></div><div class="threat-hero-pattern" aria-hidden="true"></div>
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
	const content = panel?.querySelector('.panel-content');
	if (!panel || !content) return;
	const enabled = isLobbyConfiguredSystemEnabled('threatsEnabled');
	panel.hidden = !enabled; panel.style.display = enabled ? '' : 'none';
	if (!enabled) { content.innerHTML = ''; updateScenarioSectionVisibility(); return; }
	const isRevealed = !!currentRoundState?.threatRevealed && !!threat;
	content.innerHTML = renderThreatScenario(buildThreatScenarioModel(threat, isRevealed));
	panel.classList.toggle('threat-unknown', !isRevealed);
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

window.setInterval(updateThreatOperationTimer, 1000);

function getReadyStatusLabel(status) {
	const labels = {
		pending: 'Не відповів',
		ready: 'Готовий',
		add: 'Хоче щось додати',
		special: 'Хоче використати карту'
	};
	return labels[status] || labels.pending;
}

function getReadyStatusClass(status) {
	return ['ready', 'add', 'special'].includes(status) ? status : 'pending';
}

function updateReadyCheckUI() {
	const statuses = currentRoundState?.readyStatuses || [];
	const phase = getCurrentPhase();
	const isReadyPhase = currentRoom?.state === 'Playing' && phase === 'PreVotingReadyCheck';
	const hasRoundReadyStatus = statuses.some(player => player.status && player.status !== 'pending');
	const panel = document.getElementById('readyCheckPanel');
	const summary = document.getElementById('readyCheckSummary');
	const gmList = document.getElementById('gmReadyStatusList');

	if (panel) {
		panel.style.display = isReadyPhase ? 'block' : 'none';
	}

	const answered = statuses.filter(player => player.status && player.status !== 'pending').length;
	if (summary) {
		summary.textContent = statuses.length > 0
			? `${answered}/${statuses.length} відповіли`
			: 'Очікуємо відповіді гравців';
	}

	if (gmList) {
		if (isHost && currentRoom?.state === 'Playing' && hasRoundReadyStatus && statuses.length > 0) {
			gmList.style.display = 'grid';
			gmList.innerHTML = statuses.map(player => {
				const seat = player.seatNumber ? `#${player.seatNumber} ` : '';
				const statusClass = getReadyStatusClass(player.status);
				return `
                        <div class="gm-ready-status ${statusClass}">
                            <span>${seat}${escapeHtml(player.name || t('unknown'))}</span>
                            <strong>${getReadyStatusLabel(player.status)}</strong>
                        </div>
                    `;
			}).join('');
		} else {
			gmList.style.display = 'none';
			gmList.innerHTML = '';
		}
	}
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

function setText(selector, value) {
	const el = document.querySelector(selector);
	if (el) el.textContent = value;
}

function setPlaceholder(selector, value) {
	const el = document.querySelector(selector);
	if (el) el.placeholder = value;
}

function applyStaticTranslations() {
	document.querySelectorAll('.language-btn').forEach(btn => {
		btn.classList.toggle('active', btn.dataset.lang === getCurrentLanguage());
	});

	setText('.create-room-panel .section-title', t('createRoom'));
	setText('.rooms-list-panel .section-title', t('availableRooms'));
	setText('#createRoomBtn', t('createRoom'));
	setText('#gmPanelBtn', t('gmPanel'));
	setText('#startVotingBtn', t('voting'));
	setText('#startGameBtn', t('startGame'));
	setText('#startReadyCheckBtn', t('allReady'));

	const leaveBtn = document.querySelector('.room-actions .btn-danger');
	if (leaveBtn) leaveBtn.textContent = t('leaveRoom');

	setPlaceholder('#playerNameCreate', t('playerNamePlaceholder'));
	setPlaceholder('#playerNameJoin', t('playerNamePlaceholder'));
	setPlaceholder('#roomName', t('roomNamePlaceholder'));
	setPlaceholder('#maxPlayers', t('maxPlayersPlaceholder'));
	setPlaceholder('#roomPassword', t('passwordOptionalPlaceholder'));
	setPlaceholder('#joinRoomPassword', t('passwordIfAnyPlaceholder'));

	setText('#myPlayerSection > .section-title', t('myCharacteristics'));
	setText('#mySpecialCardsSection > .section-title', t('mySpecialCards'));
	setText('#specialCardsSection > .section-title', t('revealedSpecialCards'));
	setText('.scenario-section-header .section-header-title', t('bunkerAndApocalypse'));
	setText('.events-section-main > .section-title', t('gameEvents'));
	setText('.events-history-title', t('eventsHistory'));

	const apocTitle = document.querySelector('#apocalypsePanel .panel-title');
	if (apocTitle) apocTitle.textContent = `☢️ ${t('apocalypse')}`;
	const bunkerTitle = document.querySelector('#bunkerPanel .panel-title');
	if (bunkerTitle) bunkerTitle.textContent = `🏠 ${t('bunker')}`;
	const threatTitle = document.querySelector('#threatPanel .panel-title');
	if (threatTitle) threatTitle.textContent = `⚠️ ${t('threat')}`;

	const playersInBunkerTitle = document.querySelector('#gameSection > .section-title');
	if (playersInBunkerTitle) {
		const count = document.getElementById('playerCount')?.textContent || '0/6';
		playersInBunkerTitle.innerHTML = `${t('playersInBunker')} <span class="bunker-count" id="playerCount">${count}</span>`;
	}

	const roomLobbyTitle = document.querySelector('#roomLobby .section-title');
	if (roomLobbyTitle) {
		const count = document.getElementById('roomPlayerCount')?.textContent || '0/12';
		roomLobbyTitle.innerHTML = `${t('players')} ${t('room')}: <span id="roomPlayerCount">${count}</span>`;
	}

	const specialCardHeaders = document.querySelectorAll('#specialCardsSection thead th');
	const specialCardHeaderLabels = ['№', t('players'), t('specialCard'), `${t('description')} / ${t('effect')}`, t('target'), t('status')];
	specialCardHeaders.forEach((th, index) => {
		if (specialCardHeaderLabels[index]) th.textContent = specialCardHeaderLabels[index];
	});

}

function rerenderLocalizedUI() {
	renderCurrentGameUI();
	if (currentVoting && document.getElementById('votingPanel')?.style.display !== 'none' && typeof showVotingPanel === "function") showVotingPanel(currentVoting);
	if (currentVoting && document.getElementById('votingResultsPanel')?.style.display !== 'none' && typeof showVotingResults === "function") showVotingResults(currentVoting);
}

function renderCurrentGameUI() {
	applyStaticTranslations();
	if (typeof updateRoomUI === "function") updateRoomUI();
	if (typeof renderMyPlayerCards === "function") {
		try {
			renderMyPlayerCards(myPlayerData);
			renderMySpecialCards(myPlayerData);
		} catch (error) {
			console.warn("Failed to render current player character cards", error);
			const container = document.getElementById("myPlayerCards");
			if (container) container.innerHTML = `<p style="color: var(--color-text-muted);">${t('noData')}</p>`;
		}
	}
	if (currentApocalypse && typeof renderApocalypse === "function") renderApocalypse(currentApocalypse);
	if (currentBunker && typeof renderBunker === "function") renderBunker(currentBunker);
	if (typeof renderThreatPanel === "function") renderThreatPanel(currentThreat);
	if (typeof updateRoundStatusUI === "function") updateRoundStatusUI();
	if (typeof renderPublicPlayerOverview === "function") renderPublicPlayerOverview();
	if (typeof updateSpecialCardsUI === "function") updateSpecialCardsUI();
	if (typeof updateGMPlayerSelect === "function") updateGMPlayerSelect();
	if (selectedPlayerForGM && typeof loadPlayerDataForGM === "function") loadPlayerDataForGM();
	if (currentGameCompletion) setGameFinishedMutationState(true);
}

function resetClientGameStateForNewRoom() {
	clearOmniscientHiddenState();
	lobbyState = null; lobbyStartPreview = null; lobbyCommandPending = false;
	currentRoom = null;
	myPlayerData = null;
	isHost = false;
	roomPlayers = {};
	selectedPublicPlayerSeat = null;
	gmPlayersData = {};
	selectedPlayerForGM = null;
	pendingJoinRoomId = null;
	hostToken = null;
	currentApocalypse = null;
	currentBunker = null;
	currentThreat = null;
	currentVoting = null;
	currentRoundState = null;
	currentGameCompletion = null;
	returnFinishedGamePending = false;
	myVote = null;
	if (typeof gmRevealedChars !== "undefined") gmRevealedChars = {};

	['myPlayerCards', 'publicPlayerSelector', 'selectedPlayerPanel', 'roomPlayersList', 'apocalypseContent', 'bunkerContent', 'votingCandidates', 'votingResultsContent', 'specialCardsTableBody', 'gmSpecialCardsList'].forEach(id => {
		const el = document.getElementById(id);
		if (el) el.innerHTML = '';
	});

	['gameSection', 'votingPanel', 'votingResultsPanel', 'gmPanel', 'gmPlayerInfo', 'roundStatusPanel', 'specialCardsSection'].forEach(id => {
		const el = document.getElementById(id);
		if (el) el.style.display = 'none';
	});
}

function clearLegacyRoomStateOnly() {
	const cleanupKey = "bunker_https_cleanup_v1";
	if (localStorage.getItem(cleanupKey) === "done") return;

	[
		"currentRoomId",
		"currentPlayerId",
		"playerCharacter",
		"currentRoom",
		"currentPlayerCharacter"
	].forEach(key => localStorage.removeItem(key));

	[
		"currentRoomId",
		"currentPlayerId",
		"playerCharacter",
		"currentRoom",
		"currentPlayerCharacter"
	].forEach(key => sessionStorage.removeItem(key));

	localStorage.setItem(cleanupKey, "done");
}

function changeLanguage(lang) {
	setCurrentLanguage(lang);
	rerenderLocalizedUI();
}

window.changeLanguage = changeLanguage;
document.addEventListener('DOMContentLoaded', function () {
	clearLegacyRoomStateOnly();
	applyStaticTranslations();
});

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

// Normalize player data from server (PascalCase) to client (camelCase)
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
			const professionItem = normalizeItemData(player.professionItem || player.ProfessionItem || src.professionItem || src.ProfessionItem);
			return {
				name: cleanProfessionName(src.name ?? src.Name ?? 'Безробітний'),
				tooltip: cleanTooltipText(src.tooltip ?? src.Tooltip ?? null),
				experienceYears: src.experienceYears ?? src.ExperienceYears ?? 0,
				selectedItem: src.selectedItem ?? src.SelectedItem ?? null,
				selectedItemIndex: src.selectedItemIndex ?? src.SelectedItemIndex ?? null,
				capabilityTags: src.capabilityTags ?? src.CapabilityTags ?? src.tags ?? src.Tags ?? [],
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

// ==================== SIGNALR HANDLERS ====================

// Список кімнат оновлено
function registerSignalREvents() {
	connection.off("RoomsListUpdated");
	connection.on("RoomsListUpdated", function (rooms) {
		console.log("Rooms updated:", rooms);
		renderRoomsList(rooms);
	});

	connection.off("RoomCreated");
	connection.on("RoomCreated", function (data) {
		console.log("[RoomCreated] Room creation payload received");

		resetClientGameStateForNewRoom();

		currentRoom = data.room || data.Room;
		myPlayerData = normalizePlayer(data.player || data.Player);
		isHost = data.isHost ?? data.IsHost ?? true;
		hostToken = data.hostToken || data.HostToken || null;
		reconnectToken = data.reconnectToken || data.ReconnectToken || reconnectToken;
		myConnectionId = myPlayerData.connectionId;

		if (currentRoom) {
			currentRoom.state = currentRoom.state || currentRoom.State || "Lobby";
			currentRoom.name = currentRoom.name || currentRoom.Name || "Кімната";
			currentRoom.id = currentRoom.id || currentRoom.Id;
			currentRoom.maxPlayers = currentRoom.maxPlayers || currentRoom.MaxPlayers || 12;
		}
		applyRoundState(data.roundState || data.RoundState);

		console.log("[RoomCreated] Normalized myPlayerData:", myPlayerData);
		console.log("[RoomCreated] myConnectionId:", myConnectionId);
		console.log("[RoomCreated] isHost:", isHost);

		const btn = document.getElementById('createRoomBtn');
		if (btn) {
			btn.disabled = false;
			btn.textContent = 'Створити кімнату';
		}

		saveSession(currentRoom.id, myPlayerData.name, hostToken);

		roomPlayers = {};
		const players = data.players || data.Players || [];
		players.forEach(p => {
			const connId = p.connectionId || p.ConnectionId;
			if (!connId) return;

			const revealedValues = normalizeRevealedValues(p.revealedValues || p.RevealedValues || {});
			const revealedSources = normalizeRevealedSources(p.revealedSources || p.RevealedSources || {});
			roomPlayers[connId] = {
				name: p.name || p.Name,
				connectionId: connId,
				stablePlayerId: p.stablePlayerId || p.StablePlayerId || "",
				isHost: p.isHost ?? p.IsHost ?? false,
				isSpectatorGm: !!(p.isSpectatorGm ?? p.IsSpectatorGm),
				publicRole: p.publicRole || p.PublicRole || '',
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				revealedData: revealedValues.revealedData,
				fact: normalizeFactFromPlayer({ ...p, fact: revealedSources.fact || p.fact || p.Fact, revealedData: revealedValues.revealedData, revealedTooltips: revealedValues.revealedTooltips }),
				revealedSources: revealedSources,
				revealedTooltips: revealedValues.revealedTooltips,
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(p.additionalConditionEffects || p.AdditionalConditionEffects || []),
				isEliminated: p.isEliminated ?? p.IsEliminated ?? false,
				eliminatedAtRound: p.eliminatedAtRound ?? p.EliminatedAtRound ?? null,
				eliminatedByVote: !!(p.eliminatedByVote ?? p.EliminatedByVote),
				canRevealAllAfterElimination: !!(p.canRevealAllAfterElimination ?? p.CanRevealAllAfterElimination),
				hasRevealedAllAfterElimination: !!(p.hasRevealedAllAfterElimination ?? p.HasRevealedAllAfterElimination),
				seatNumber: p.seatNumber ?? p.SeatNumber ?? 0,
				isConnected: p.isConnected ?? p.IsConnected ?? true
			};
		});

		if (!roomPlayers[myConnectionId]) {
			roomPlayers[myConnectionId] = {
				name: myPlayerData.name,
				connectionId: myConnectionId,
				stablePlayerId: stablePlayerId,
				isHost: isHost,
				revealed: normalizeRevealedState(myPlayerData.revealed || {}),
				revealedData: {},
				fact: myPlayerData.fact,
				revealedSources: {},
				revealedTooltips: {},
				additionalConditionEffects: myPlayerData.additionalConditionEffects || [],
				isEliminated: myPlayerData.isEliminated || false,
				eliminatedAtRound: myPlayerData.eliminatedAtRound || null,
				eliminatedByVote: !!myPlayerData.eliminatedByVote,
				canRevealAllAfterElimination: !!myPlayerData.canRevealAllAfterElimination,
				hasRevealedAllAfterElimination: !!myPlayerData.hasRevealedAllAfterElimination,
				seatNumber: myPlayerData.seatNumber || 0,
				isConnected: true
			};
		}

		console.log("[RoomCreated] roomPlayers:", roomPlayers);

		showRoomSection();
		renderCurrentGameUI();

		addEventMessage(`Ви створили кімнату <span class="event-room">${currentRoom.name}</span>`);
	});

	// Приєднались до кімнати
	connection.off("RoomJoined");
	connection.on("RoomJoined", function (data) {
		console.log("[RoomJoined] Room join payload received");

		currentRoom = data.room || data.Room;
		myPlayerData = normalizePlayer(data.player || data.Player);
		isHost = data.isHost ?? data.IsHost ?? false;
		hostToken = data.hostToken || data.HostToken || null;
		reconnectToken = data.reconnectToken || data.ReconnectToken || reconnectToken;
		myConnectionId = myPlayerData.connectionId;

		if (currentRoom) {
			currentRoom.state = currentRoom.state || currentRoom.State || "Lobby";
			currentRoom.name = currentRoom.name || currentRoom.Name || "Кімната";
			currentRoom.id = currentRoom.id || currentRoom.Id;
			currentRoom.maxPlayers = currentRoom.maxPlayers || currentRoom.MaxPlayers || 12;
		}
		applyRoundState(data.roundState || data.RoundState);

		console.log("[RoomJoined] Normalized myPlayerData:", myPlayerData);
		console.log("[RoomJoined] myConnectionId:", myConnectionId);

		// Закриваємо модалку join якщо була відкрита
		pendingJoinRoomId = null;
		closeJoinModal();

		// Зберігаємо сесію в localStorage
		saveSession(currentRoom.id, myPlayerData.name, hostToken);

		roomPlayers = {};
		const players = data.players || data.Players || [];
		players.forEach(p => {
			const connId = p.connectionId || p.ConnectionId;
			const revealedValues = normalizeRevealedValues(p.revealedValues || p.RevealedValues || {});
			const revealedSources = normalizeRevealedSources(p.revealedSources || p.RevealedSources || {});
			roomPlayers[connId] = {
				name: p.name || p.Name,
				connectionId: connId,
				stablePlayerId: p.stablePlayerId || p.StablePlayerId || "",
				isHost: p.isHost ?? p.IsHost ?? false,
				isSpectatorGm: !!(p.isSpectatorGm ?? p.IsSpectatorGm),
				publicRole: p.publicRole || p.PublicRole || '',
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				fact: normalizeFactFromPlayer({ ...p, fact: revealedSources.fact || p.fact || p.Fact, revealedData: revealedValues.revealedData, revealedTooltips: revealedValues.revealedTooltips }),
				revealedData: revealedValues.revealedData,
				revealedSources: revealedSources,
				revealedTooltips: revealedValues.revealedTooltips,
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(p.additionalConditionEffects || p.AdditionalConditionEffects || []),
				isEliminated: p.isEliminated ?? p.IsEliminated ?? false,
				eliminatedAtRound: p.eliminatedAtRound ?? p.EliminatedAtRound ?? null,
				eliminatedByVote: !!(p.eliminatedByVote ?? p.EliminatedByVote),
				canRevealAllAfterElimination: !!(p.canRevealAllAfterElimination ?? p.CanRevealAllAfterElimination),
				hasRevealedAllAfterElimination: !!(p.hasRevealedAllAfterElimination ?? p.HasRevealedAllAfterElimination),
				seatNumber: p.seatNumber ?? p.SeatNumber ?? 0
			};
		});

		console.log("[RoomJoined] roomPlayers:", roomPlayers);

		showRoomSection();
		renderCurrentGameUI();
		addEventMessage(`Ви приєднались до кімнати <span class="event-room">${currentRoom.name}</span>`);
	});

	// Гравець приєднався до кімнати
	connection.off("PlayerJoinedRoom");
	connection.on("PlayerJoinedRoom", function (info) {
		console.log("Player joined room:", info);
		roomPlayers[info.connectionId] = {
			name: info.name,
			connectionId: info.connectionId,
			stablePlayerId: info.stablePlayerId || info.StablePlayerId || "",
			isHost: info.isHost,
			revealed: normalizeRevealedState(info.revealed || {}),
			fact: normalizeFactFromPlayer(info),
			revealedData: {},
			revealedSources: normalizeRevealedSources(info.revealedSources || info.RevealedSources || {}),
			revealedTooltips: {}
		};
		renderCurrentGameUI();
		addEventMessage(`Гравець <span class="event-player">${info.name}</span> приєднався`);
	});

	// Гравець покинув кімнату
	connection.off("PlayerLeftRoom");
	connection.on("PlayerLeftRoom", function (info) {
		console.log("Player left room:", info);
		const leftPlayer = roomPlayers[info.connectionId];
		const leftName = leftPlayer?.name || info.playerName || 'Гравець';
		delete roomPlayers[info.connectionId];

		// Якщо змінився хост
		if (info.newHostConnectionId) {
			if (roomPlayers[info.newHostConnectionId]) {
				roomPlayers[info.newHostConnectionId].isHost = true;
			}
			if (info.newHostConnectionId === myConnectionId) {
				isHost = true;
				addEventMessage(`Ви тепер хост кімнати!`);
			} else {
				addEventMessage(`<span class="event-player">${info.newHostName}</span> тепер хост`);
			}
		}

		renderCurrentGameUI();
		const reason = info.reason === 'timeout' ? ' (timeout)' : '';
		addEventMessage(`Гравець <span class="event-player">${leftName}</span> покинув кімнату${reason}`);
	});

	connection.off("RoomPlayersUpdated");
	connection.on("RoomPlayersUpdated", function (players) {
		const next = {};
		(players || []).forEach(p => {
			const connectionId = p.connectionId || p.ConnectionId;
			if (!connectionId) return;
			next[connectionId] = {
				...(roomPlayers[connectionId] || {}), ...p, connectionId,
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				revealedData: normalizeRevealedValues(p.revealedValues || p.RevealedValues || {}).revealedData,
				revealedSources: normalizeRevealedSources(p.revealedSources || p.RevealedSources || {}),
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(p.additionalConditionEffects || p.AdditionalConditionEffects || [])
			};
		});
		roomPlayers = next;
		renderCurrentGameUI();
		updateGMPlayerSelect();
		const me = Object.values(roomPlayers).find(p => isMyPlayerRef(p.connectionId, p.stablePlayerId));
		if (me && !(me.isSpectatorGm || me.IsSpectatorGm)) clearOmniscientHiddenState();
	});

	connection.off("LobbyStateUpdated");
	connection.on("LobbyStateUpdated", function (state) {
		const version = Number(state?.stateVersion ?? state?.StateVersion ?? 0);
		const currentVersion = Number(lobbyState?.stateVersion ?? lobbyState?.StateVersion ?? 0);
		if (currentVersion && version < currentVersion) return;
		syncLobbySettingsState(state);
		lobbyState = state; lobbyStartPreview = null; renderLobbyState();
		const guestWarningRevision = Number(state?.guestWarningRevision ?? state?.GuestWarningRevision ?? 0);
		const requestedRevision = Number(state?.guestWarningRequestedRevision ?? state?.GuestWarningRequestedRevision ?? 0);
		if (guestWarningRevision > 0 && requestedRevision === guestWarningRevision) {
			showGuestWarningIfEligible(guestWarningRevision);
		}
		tryRenderRunningGameState();
	});

	connection.off("GameReturnedToLobby");
	connection.on("GameReturnedToLobby", function (data) {
		clearGameFinishedStateForLobby();
		if (currentRoom) {
			currentRoom.state = data?.state || data?.State || 'Lobby';
			currentRoom.phase = data?.currentPhase || data?.CurrentPhase || 'Lobby';
			currentRoom.currentRound = 0;
		}
		const nextLobbyState = data?.lobbyState || data?.LobbyState || null;
		if (nextLobbyState) {
			syncLobbySettingsState(nextLobbyState);
			lobbyState = nextLobbyState;
		}
		showRoomSection();
		renderLobbyState();
	});

	connection.off("LobbyKicked");
	connection.on("LobbyKicked", function () {
		lobbySettingsDraft = null; lobbySettingsDirty = false;
		alert(t('lobbyKicked'));
		window.location.reload();
	});

	connection.off("OmniscientHiddenStateUpdated");
	connection.on("OmniscientHiddenStateUpdated", function (state) {
		const version = Number(state?.stateVersion ?? state?.StateVersion ?? 0);
		if (!version || version <= omniscientHiddenStateVersion) return;
		omniscientHiddenStateVersion = version;
		omniscientHiddenState = state;
		renderOmniscientHiddenState();
	});

	connection.off("PlayerStateResynced");

	connection.on("PlayerStateResynced", function (data) {
		const playerPayload = data?.player ?? data?.Player ?? data;

		console.log("[HANDOFF] PlayerStateResynced", {
			hasPayload: Boolean(playerPayload),
			playerId: playerPayload?.id ?? playerPayload?.Id,
			hasProfession: Boolean(
				playerPayload?.profession ?? playerPayload?.Profession
			),
			hasPhysicalHealth: Boolean(
				playerPayload?.physicalHealth ?? playerPayload?.PhysicalHealth
			),
			hasHobby: Boolean(
				playerPayload?.hobby ?? playerPayload?.Hobby
			),
			hasSpecialCards: Array.isArray(
				playerPayload?.specialCards ?? playerPayload?.SpecialCards
			)
		});

		if (!playerPayload) {
			console.error("[HANDOFF] PlayerStateResynced без player payload");
			return;
		}

		const normalizedPlayer = normalizePlayer(playerPayload);

		if (!normalizedPlayer) {
			console.error("[HANDOFF] Не вдалося нормалізувати player snapshot");
			return;
		}

		myPlayerData = normalizedPlayer;
		pendingCharacteristicReveals.clear();

		tryRenderRunningGameState();

		if (!isLobbyRunning()) {
			renderCurrentGameUI();
		}
	});

	connection.off("PlayerKicked");
	connection.on("PlayerKicked", function (data) {
		alert(data.message || data.Message || 'Вас виключено з кімнати');
		currentRoom = null; myPlayerData = null; isHost = false; roomPlayers = {};
		clearSession(); showLobbySection();
	});

	connection.off("HostChanged");
	connection.on("HostChanged", function (data) {
		const oldId = data.oldHostConnectionId || data.OldHostConnectionId;
		const newId = data.newHostConnectionId || data.NewHostConnectionId;
		if (roomPlayers[oldId]) roomPlayers[oldId].isHost = false;
		if (roomPlayers[newId]) roomPlayers[newId].isHost = true;
		isHost = newId === myConnectionId;
		renderCurrentGameUI();
	});

	connection.off("StaleConnectionInspected");
	connection.on("StaleConnectionInspected", function (data) {
		gmPlayerCommandPending = false;
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
		const result = document.getElementById('gmPlayerCommandResult');
		if (result) result.textContent = data.message || data.Message || '';
	});

	// Гравець відключився (може перепідключитись)
	connection.off("PlayerDisconnecting");
	connection.on("PlayerDisconnecting", function (info) {
		console.log("Player disconnecting:", info);
		addEventMessage(`Гравець <span class="event-player">${info.playerName}</span> втратив з'єднання (очікування ${info.reconnectTimeout}с)...`);
	});

	// Покинув кімнату
	connection.off("RoomLeft");
	connection.on("RoomLeft", function () {
		console.log("Left room");
		clearOmniscientHiddenState();
		lobbyState = null; lobbyStartPreview = null; lobbyCommandPending = false;
		currentRoom = null;
		myPlayerData = null;
		isHost = false;
		roomPlayers = {};
		clearSession();
		showLobbySection();
		addEventMessage(`Ви покинули кімнату`);
	});

	// Гра почалась
	connection.off("GameStarted");
	connection.on("GameStarted", function (data) {
		console.log("=== GAME STARTED ===");
		console.log("[GameStarted] Raw data:", data);
		console.log("[GameStarted] data.roomState:", data.roomState);
		console.log("[GameStarted] data.apocalypse:", data.apocalypse);
		console.log("[GameStarted] data.bunker:", data.bunker);
		console.log("[GameStarted] data.players:", data.players);

		isStartingGame = false;
		hideGuestWarningModal(false);
		clearGameFinishedStateForLobby();
		console.log("[GameStarted] Reset isStartingGame = false");

		// Normalize room state (handle both camelCase and PascalCase)
		const roomState = data.roomState || data.RoomState || "Playing";

		if (currentRoom) {
			currentRoom.state = roomState;
			console.log("[GameStarted] Updated currentRoom.state:", currentRoom.state);
		}
		applyRoundState(data.roundState || data.RoundState);

		// Keep the complete canonical snapshot. The renderer localizes and normalizes it on every render.
		const apocalypse = data.apocalypse || data.Apocalypse;
		currentApocalypse = apocalypse || null;
		console.log("[GameStarted] Normalized apocalypse:", currentApocalypse);

		// Keep the complete canonical bunker snapshot; the renderer normalizes it per language.
		const bunker = data.bunker || data.Bunker;
		currentBunker = bunker || null;
		console.log("[GameStarted] Normalized bunker:", currentBunker);

		// Update players with seat numbers
		const players = data.players || data.Players || [];
		console.log("[GameStarted] Players to update:", players);

		players.forEach(function (p) {
			const connId = p.connectionId || p.ConnectionId;
			const seatNum = p.seatNumber ?? p.SeatNumber ?? 0;

			if (roomPlayers[connId]) {
				roomPlayers[connId].seatNumber = seatNum;
				roomPlayers[connId].isEliminated = p.isEliminated ?? p.IsEliminated ?? false;
				roomPlayers[connId].eliminatedAtRound = p.eliminatedAtRound ?? p.EliminatedAtRound ?? null;
				roomPlayers[connId].eliminatedByVote = !!(p.eliminatedByVote ?? p.EliminatedByVote);
				roomPlayers[connId].canRevealAllAfterElimination = !!(p.canRevealAllAfterElimination ?? p.CanRevealAllAfterElimination);
				roomPlayers[connId].hasRevealedAllAfterElimination = !!(p.hasRevealedAllAfterElimination ?? p.HasRevealedAllAfterElimination);
				console.log(`[GameStarted] Updated player ${connId} seat: ${seatNum}`);
			}
		});

		// Update UI visibility
		console.log("[GameStarted] Updating UI visibility...");

		const roomLobby = document.getElementById('roomLobby');
		const gameSection = document.getElementById('gameSection');
		const myPlayerSection = document.getElementById('myPlayerSection');
		const currentRoomState = document.getElementById('currentRoomState');

		if (roomLobby) {
			roomLobby.style.display = 'none';
			console.log("[GameStarted] roomLobby hidden");
		}
		if (gameSection) {
			gameSection.style.display = 'block';
			console.log("[GameStarted] gameSection shown");
		}
		if (myPlayerSection) {
			myPlayerSection.style.display = 'block';
			console.log("[GameStarted] myPlayerSection shown");
		}
		if (currentRoomState) {
			currentRoomState.textContent = getRoomStateLabel();
			currentRoomState.classList.add('state-playing');
			console.log("[GameStarted] currentRoomState updated");
		}

		const startBtn = document.getElementById('startGameBtn');
		if (startBtn) {
			startBtn.style.display = 'none';
			startBtn.disabled = true;
			startBtn.style.pointerEvents = 'none';
			console.log("[GameStarted] startBtn hidden");
		}

		updateRoundStatusUI();

		// Show GM sections for host using the dedicated function
		console.log("[GameStarted] Calling updateGMSections...");
		updateGMSections();

		// Update bunker capacity display
		if (currentBunker) {
			currentBunkerCapacity = getBunkerCapacityValue(currentBunker, currentBunkerCapacity);
			const gmBunkerCapacity = document.getElementById('gmBunkerCapacity');
			if (isHost && gmBunkerCapacity) {
				gmBunkerCapacity.value = currentBunkerCapacity;
			}
		}

		// Render apocalypse and bunker
		console.log("[GameStarted] Rendering apocalypse...");
		renderApocalypse(currentApocalypse);

		console.log("[GameStarted] Rendering bunker...");
		renderBunker(currentBunker);

		console.log("[GameStarted] Rendering current game UI...");
		tryRenderRunningGameState();

		// Add event messages
		const currentRound = data.currentRound || data.CurrentRound || getCurrentRoundNumber() || 1;
		addEventMessage(`Гра почалась! Раунд ${currentRound}`);

		if (currentApocalypse) {
			addEventMessage(`<span class="event-apocalypse">☢️ ${escapeHtml(t('apocalypse'))}:</span> ${escapeHtml(getLocalizedValue(currentApocalypse, 'name'))}`);
		}

		if (currentBunker) {
			addEventMessage(`<span class="event-bunker">🏠 ${escapeHtml(t('bunker'))}:</span> ${escapeHtml(getLocalizedValue(currentBunker, 'name'))}`);
		}

		console.log("=== GAME STARTED END ===");
	});

	// Характеристику розкрито
	connection.off("CharacteristicRevealed");
	connection.on("CharacteristicRevealed", function (info) {
		console.log("Characteristic revealed:", info);
		applyRoundState(info.roundState || info.RoundState);
		const characteristicKey = normalizeCharacteristicKey(info.characteristicKey || info.CharacteristicKey || '');
		const charKey = normalizeCharacteristicKey(toCamelCase(characteristicKey));
		pendingCharacteristicReveals.delete(characteristicKey);

		if (roomPlayers[info.connectionId]) {
			if (!roomPlayers[info.connectionId].revealed) {
				roomPlayers[info.connectionId].revealed = {};
			}
			if (!roomPlayers[info.connectionId].revealedData) {
				roomPlayers[info.connectionId].revealedData = {};
			}
			if (!roomPlayers[info.connectionId].revealedTooltips) {
				roomPlayers[info.connectionId].revealedTooltips = {};
			}
			if (!roomPlayers[info.connectionId].revealedSources) {
				roomPlayers[info.connectionId].revealedSources = {};
			}
			roomPlayers[info.connectionId].revealed[charKey] = true;
			roomPlayers[info.connectionId].revealedData[charKey] = info.data.value;
			const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact || null;
			if (source) {
				roomPlayers[info.connectionId].revealedSources[charKey] = source;
			}
			if (charKey === 'physicalHealth') {
				roomPlayers[info.connectionId].additionalConditionEffects = normalizeAdditionalPhysicalConditions(
					info.data.additionalConditionEffects || info.data.AdditionalConditionEffects || []
				);
			}
			if (charKey === 'fact') {
				roomPlayers[info.connectionId].fact = normalizeFactFromPlayer({ fact: source || info.data.fact || info.data.Fact, revealedData: { fact: info.data } });
			}
			if (charKey === 'specialCard' && source) {
				roomPlayers[info.connectionId].specialCard = normalizeSpecialCard(source);
			}
			if (info.data.tooltip && info.data.hasTooltip) {
				const kind = charKey === 'physicalHealth' ? 'physicalHealth' : charKey === 'mentalHealth' ? 'mentalHealth' : charKey;
				roomPlayers[info.connectionId].revealedTooltips[charKey] = buildLocalizedTooltip(source, kind) || cleanTooltipText(info.data.tooltip);
			}
		}

		// Оновлюємо свої картки якщо це я
		if (info.connectionId === myConnectionId && myPlayerData) {
			if (!myPlayerData.revealed) {
				myPlayerData.revealed = {};
			}

			myPlayerData.revealed[charKey] = true;

			if (charKey === "fact") {
				const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact;
				myPlayerData.fact = normalizeFactFromPlayer({ fact: source, revealedData: { fact: info.data } });
			}
			if (charKey === "specialCard") {
				const source = info.data.source || info.data.Source;
				if (source) {
					const revealedCard = normalizeSpecialCard(source);
					myPlayerData.specialCard = revealedCard;
					myPlayerData.specialCards = normalizeSpecialCards(myPlayerData.specialCards, revealedCard)
						.map(card => card.id === revealedCard.id ? revealedCard : card);
				}
			}

			renderCurrentGameUI();
		}

		renderPublicPlayerOverview();
		addEventMessage(`<span class="event-player">${info.playerName}</span> розкрив: <span class="revealed-label">${info.data.label}</span>`);
	});

	connection.off("RoundStateUpdated");
	connection.on("RoundStateUpdated", function (data) {
		const wasComplete = currentRoundState?.allPlayersRevealed;
		applyRoundState(data);
		renderCurrentGameUI();
		if (isFinishedGameState(data, currentGameCompletion)) {
			renderGameFinished(currentGameCompletion || data?.completion || data?.Completion, { source: 'round-state' });
			return;
		}

		if (isHost && currentRoundState?.allPlayersRevealed && !wasComplete) {
			addEventMessage(`Усі активні гравці відкрили характеристику в раунді ${getCurrentRoundNumber()}. Можна завершити раунд.`);
		}
	});

	connection.off("RoundEnded");
	connection.on("RoundEnded", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		addEventMessage(`Раунд ${data.completedRound || data.CompletedRound} завершено.`);
	});

	connection.off("RoundAdvanced");
	connection.on("RoundAdvanced", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		addEventMessage(`Почався раунд ${data.currentRound || data.CurrentRound || getCurrentRoundNumber()}.`);
	});

	connection.off("RoundDiceRolled");
	connection.on("RoundDiceRolled", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		const roll = normalizeDiceRoll(data.diceRoll || data.DiceRoll || data.roll || data.Roll);
		const value = roll?.value || '?';
		const round = roll?.round || getCurrentRoundNumber();
		const roller = roll?.rolledByPlayerName || 'GM';
		addEventMessage(`${escapeHtml(roller)} кинув кубик у раунді ${round}: <strong>${value}</strong>`);
	});

	connection.off("ThreatRevealed");
	connection.on("ThreatRevealed", function (data) {
		currentThreat = data.threat || data.Threat || null;
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		const threatName = currentThreat ? (getLocalizedValue(currentThreat, 'name') || currentThreat.name || currentThreat.Name) : 'нова загроза';
		addEventMessage(`<span class="event-warning">${t('threatRevealed')}:</span> ${escapeHtml(threatName)}`);
	});

	connection.off("VotingReadyCheckStarted");
	connection.on("VotingReadyCheckStarted", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		addEventMessage(data.message || data.Message || 'Всі готові до голосування?');
	});

	connection.off("AllPlayersMarkedReady");
	connection.on("AllPlayersMarkedReady", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		addEventMessage(t('allPlayersReady'));
	});

	connection.off("VotingReadyStatusUpdated");
	connection.on("VotingReadyStatusUpdated", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		const playerName = data.playerName || data.PlayerName || t('unknown');
		const status = data.status || data.Status || 'pending';
		addEventMessage(`${playerName}: ${getReadyStatusLabel(status)}`);
	});

	connection.off("SpecialCardStateUpdated");
	connection.on("SpecialCardStateUpdated", function (data) {
		const card = data.card || data.Card;
		const cards = data.cards || data.Cards;
		if (myPlayerData) {
			myPlayerData.specialCards = normalizeSpecialCards(cards, card);
			myPlayerData.specialCard = myPlayerData.specialCards[0] || normalizeSpecialCard(card);
			myPlayerData.specialCards.filter(item => item.isUsed || item.isActive || item.isEffectActive).forEach(item => pendingSpecialCardUses.delete(item.id));
			if (data.inventory || data.Inventory) {
				myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
			}
			if (data.property || data.Property) {
				myPlayerData.property = normalizePropertyData(data.property || data.Property);
			}
		}
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
	});

	connection.off("SpecialCardActivated");
	connection.on("SpecialCardActivated", function (data) {
		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();
		const message = data.message || data.Message;
		const ownerName = data.ownerPlayerName || data.OwnerPlayerName || t('unknown');
		addEventMessage(escapeHtml(message || `${ownerName} використав спеціальну карту.`));
	});

	connection.off("SpecialCardPrivateResult");
	connection.on("SpecialCardPrivateResult", function (data) {
		const message = data.message || data.Message || t('cardUsedSuccessfully');
		addEventMessage(`<span class="event-success">${escapeHtml(message)}</span>`);
	});

	connection.off("SpecialCardTargetStateUpdated");
	connection.on("SpecialCardTargetStateUpdated", function (data) {
		if (myPlayerData) {
			if (data.inventory || data.Inventory) {
				myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
			}
			if (data.property || data.Property) {
				myPlayerData.property = normalizePropertyData(data.property || data.Property);
			}
			const cards = data.specialCards || data.SpecialCards;
			if (cards) {
				myPlayerData.specialCards = normalizeSpecialCards(cards);
				myPlayerData.specialCard = myPlayerData.specialCards[0] || normalizeSpecialCard(null);
			}
		}
		renderCurrentGameUI();
		const message = data.message || data.Message;
		if (message) addEventMessage(`<span class="event-warning">${escapeHtml(message)}</span>`);
	});

	connection.off("CharacteristicHidden");
	connection.on("CharacteristicHidden", function (data) {
		const connectionId = data.connectionId || data.ConnectionId;
		const hiddenCharacteristic = data.characteristicKey || data.CharacteristicKey || '';
		const charKey = normalizeCharacteristicKey(toCamelCase(hiddenCharacteristic));
		pendingCharacteristicReveals.delete(hiddenCharacteristic);
		const player = roomPlayers[connectionId];
		if (player) {
			if (player.revealed) player.revealed[charKey] = false;
			if (player.revealedData) delete player.revealedData[charKey];
			if (player.revealedSources) delete player.revealedSources[charKey];
		}
		if (connectionId === myConnectionId && myPlayerData?.revealed) {
			myPlayerData.revealed[charKey] = false;
		}
		renderCurrentGameUI();
	});

	// Характеристику оновлено (GM змінив)
	connection.off("CharacteristicUpdated");
	connection.on("CharacteristicUpdated", function (info) {
		console.log("Characteristic updated by GM:", info);
		const characteristicKey = normalizeCharacteristicKey(info.characteristicKey);
		const charKey = normalizeCharacteristicKey(toCamelCase(characteristicKey));

		if (roomPlayers[info.connectionId]) {
			if (!roomPlayers[info.connectionId].revealedData) {
				roomPlayers[info.connectionId].revealedData = {};
			}
			if (!roomPlayers[info.connectionId].revealedSources) {
				roomPlayers[info.connectionId].revealedSources = {};
			}
			roomPlayers[info.connectionId].revealedData[charKey] = info.data.value;
			const source = info.data.source || info.data.Source || info.data.fact || info.data.Fact || null;
			if (source) {
				roomPlayers[info.connectionId].revealedSources[charKey] = source;
			}
			if (charKey === 'fact') {
				roomPlayers[info.connectionId].fact = normalizeFactFromPlayer({ fact: source || info.data.fact || info.data.Fact, revealedData: { fact: info.data } });
			}
			if (charKey === 'specialCard' && source) {
				roomPlayers[info.connectionId].specialCard = normalizeSpecialCard(source);
			}
		}

		renderPublicPlayerOverview();
		updateSpecialCardsUI();
		addEventMessage(`<span class="event-gm">GM</span> змінив характеристику <span class="event-player">${info.playerName}</span>`);
	});

	// Мої характеристики відредаговані GM
	connection.off("CharacteristicEdited");
	connection.on("CharacteristicEdited", function (info) {
		console.log("My characteristic edited:", info);
		myPlayerData = normalizePlayer(info.player);
		renderCurrentGameUI();
		addEventMessage(`<span class="event-gm">GM</span> змінив вашу характеристику: ${info.characteristicName}`);
	});

	// Характеристику очищено
	connection.off("CharacteristicCleared");
	connection.on("CharacteristicCleared", function (info) {
		console.log("My characteristic cleared:", info);
		myPlayerData = normalizePlayer(info.player);
		renderCurrentGameUI();
		addEventMessage(`<span class="event-gm">GM</span> очистив вашу характеристику: ${info.characteristicName}`);
	});

	// Характеристику регенеровано
	connection.off("CharacteristicRegenerated");
	connection.on("CharacteristicRegenerated", function (info) {
		console.log("My characteristic regenerated:", info);
		myPlayerData = normalizePlayer(info.player);
		renderCurrentGameUI();
		addEventMessage(`<span class="event-gm">GM</span> регенерував вашу характеристику: ${info.characteristicName}`);
	});

	// Гравця елімінівано
	connection.off("PlayerEliminated");
	connection.on("PlayerEliminated", function (info) {
		console.log("Player eliminated:", info);
		if (roomPlayers[info.connectionId]) {
			roomPlayers[info.connectionId].isEliminated = true;
			roomPlayers[info.connectionId].eliminatedAtRound = info.eliminatedAtRound ?? info.EliminatedAtRound ?? getCurrentRoundNumber();
			roomPlayers[info.connectionId].eliminatedByVote = !!(info.eliminatedByVote ?? info.EliminatedByVote);
			roomPlayers[info.connectionId].canRevealAllAfterElimination = !!(info.canRevealAllAfterElimination ?? info.CanRevealAllAfterElimination ?? true);
			roomPlayers[info.connectionId].hasRevealedAllAfterElimination = !!(info.hasRevealedAllAfterElimination ?? info.HasRevealedAllAfterElimination);
		}
		if (info.connectionId === myConnectionId && myPlayerData) {
			myPlayerData.isEliminated = true;
			myPlayerData.eliminatedAtRound = info.eliminatedAtRound ?? info.EliminatedAtRound ?? getCurrentRoundNumber();
			myPlayerData.eliminatedByVote = !!(info.eliminatedByVote ?? info.EliminatedByVote);
			myPlayerData.canRevealAllAfterElimination = !!(info.canRevealAllAfterElimination ?? info.CanRevealAllAfterElimination ?? true);
			myPlayerData.hasRevealedAllAfterElimination = !!(info.hasRevealedAllAfterElimination ?? info.HasRevealedAllAfterElimination);
		}
		renderCurrentGameUI();
		renderPublicPlayerOverview();
		updateGMPlayerSelect();
		addEventMessage(`<span class="event-eliminate">❌ ${info.playerName}</span> елімінований!`);
	});

	connection.off("GameFinished");
	connection.on("GameFinished", function (data) {
		applyRoundState(data?.roundState || data?.RoundState);
		const completion = normalizeGameCompletion(data);
		renderCurrentGameUI();
		renderGameFinished(completion, { source: 'live' });
	});

	// Гравця повернено
	connection.off("PlayerRestored");
	connection.on("PlayerRestored", function (info) {
		console.log("Player restored:", info);
		if (roomPlayers[info.connectionId]) {
			roomPlayers[info.connectionId].isEliminated = false;
			roomPlayers[info.connectionId].canRevealAllAfterElimination = false;
			roomPlayers[info.connectionId].hasRevealedAllAfterElimination = false;
		}
		if (info.connectionId === myConnectionId && myPlayerData) {
			myPlayerData.isEliminated = false;
			myPlayerData.canRevealAllAfterElimination = false;
			myPlayerData.hasRevealedAllAfterElimination = false;
		}
		renderCurrentGameUI();
		renderPublicPlayerOverview();
		updateGMPlayerSelect();
		addEventMessage(`<span class="event-restore">✅ ${info.playerName}</span> повернено в гру!`);
	});

	connection.off("EliminatedPlayerRevealedAll");
	connection.on("EliminatedPlayerRevealedAll", function (info) {
		console.log("Eliminated player revealed all:", info);
		applyRoundState(info.roundState || info.RoundState);
		const connectionId = info.connectionId || info.ConnectionId;
		if (roomPlayers[connectionId]) {
			roomPlayers[connectionId].canRevealAllAfterElimination = false;
			roomPlayers[connectionId].hasRevealedAllAfterElimination = true;
		}
		if (connectionId === myConnectionId && myPlayerData) {
			myPlayerData.canRevealAllAfterElimination = false;
			myPlayerData.hasRevealedAllAfterElimination = true;
		}
		renderCurrentGameUI();
		addEventMessage(`<span class="event-player">${t('eliminatedRevealedAllLog')}</span>`);
	});

	// GM отримав дані всіх гравців
	connection.off("AllPlayersData");
	connection.on("AllPlayersData", function (data) {
		console.log("All players data received:", data);
		gmPlayersData = {};
		data.forEach(p => {
			const connectionId = p.connectionId || p.ConnectionId;
			gmPlayersData[connectionId] = {
				...p,
				connectionId: connectionId,
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				fact: normalizeFactFromPlayer(p)
			};
		});
		updateGMPlayerSelect();
		updateSpecialCardsUI();
		if (selectedPlayerForGM) loadPlayerDataForGM();
	});

	// GM дія успішна
	connection.off("GMActionSuccess");
	connection.on("GMActionSuccess", function (info) {
		console.log("GM action success:", info);
		const action = info.action || info.Action || 'Дію виконано';
		addEventMessage(`<span class="event-gm">GM</span> ${escapeHtml(action)}`);
		const result = document.getElementById('gmThreatCommandResult');
		if (result) result.textContent = action;
		gmLastCommandError = '';
		gmPlayerCommandPending = false;
		setGmSnapshotPending(false);
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
		const playerResult = document.getElementById('gmPlayerCommandResult');
		if (playerResult) playerResult.textContent = action;
		markGMServerUpdate();
		// Оновлюємо дані гравців
		if (isHost) {
			connection.invoke("GetAllPlayersData").catch(err => console.error(err));
		}
	});

	// Помилка
	connection.off("ReceiveError");
	connection.on("ReceiveError", function (message) {
		if (message === "Гра вже запущена") {
			console.warn("ReceiveError ignored:", message);
			return;
		}

		console.error("ReceiveError:", message);
		addEventMessage("Помилка: " + localizeServerMessage(message));
		const gmThreatResult = document.getElementById('gmThreatCommandResult');
		if (gmThreatResult && gmThreatCommandPending) gmThreatResult.textContent = localizeServerMessage(message);
		if (gmThreatCommandPending) {
			gmLastCommandError = localizeServerMessage(message);
			renderGMPanelState();
		}
		if (gmThreatForcePending) {
			setGMThreatForcePending(false);
			const forceError = document.getElementById('gmThreatForceError');
			if (forceError) forceError.textContent = localizeServerMessage(message);
		}
		if (gmPlayerCommandPending) {
			gmPlayerCommandPending = false;
			document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
			const playerResult = document.getElementById('gmPlayerCommandResult');
			if (playerResult) playerResult.textContent = localizeServerMessage(message);
		}
		if (bunkerCapacityPending) {
			const input = document.getElementById('gmBunkerCapacity');
			if (input) input.value = currentBunker?.capacity ?? currentBunkerCapacity;
			const feedback = document.getElementById('gmBunkerCapacityFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
			setBunkerCapacityPending(false);
		}
		if (gmRoundCommandPending) finishGmRoundCommand(localizeServerMessage(message));
		if (gmDiagnosticsPending) {
			setGmDiagnosticsPending(false);
			const feedback = document.getElementById('gmDiagnosticsFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
		}
		if (gmSnapshotCommandPending) {
			setGmSnapshotPending(false);
			const feedback = document.getElementById('gmSnapshotFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
		}
		if (gmRoomLocalEditorPending) {
			setRoomLocalEditorPending(false);
			const feedback = document.getElementById('gmEditorFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
		}
		if (gameTimerCommandPending) {
			gameTimerCommandPending = false;
			const feedback = document.getElementById('gmTimerFeedback');
			if (feedback) feedback.textContent = localizeServerMessage(message);
			renderGameTimer();
		}
	});

	// ==================== SESSION RESTORE HANDLERS ====================

	// Успішне перепідключення
	connection.off("RejoinSuccess");
	connection.on("RejoinSuccess", function (data) {
		console.log("=== REJOIN SUCCESS START ===");
		console.log("[RejoinSuccess] raw data:", data);
		console.log("[RejoinSuccess] data.players:", data.players);

		currentRoom = data.room || data.Room;
		myPlayerData = normalizePlayer(data.player || data.Player);
		isHost = data.isHost ?? data.IsHost ?? false;
		hostToken = data.hostToken || data.HostToken || null;
		myConnectionId = myPlayerData.connectionId;

		// Normalize room
		if (currentRoom) {
			currentRoom.state = data.roomState || currentRoom.state || currentRoom.State || "Lobby";
			currentRoom.name = currentRoom.name || currentRoom.Name || "Кімната";
			currentRoom.id = currentRoom.id || currentRoom.Id;
			currentRoom.maxPlayers = currentRoom.maxPlayers || currentRoom.MaxPlayers || 12;
		}
		applyRoundState(data.roundState || data.RoundState);
		const rejoinCompletion = normalizeGameCompletion(
			data.completion || data.Completion ||
			data.roundState?.completion || data.RoundState?.Completion ||
			currentGameCompletion);
		if (rejoinCompletion) currentGameCompletion = rejoinCompletion;

		console.log("[RejoinSuccess] currentRoom:", currentRoom);
		console.log("[RejoinSuccess] myPlayerData:", myPlayerData);
		console.log("[RejoinSuccess] myConnectionId:", myConnectionId);

		saveSession(currentRoom.id, myPlayerData.name, hostToken);

		roomPlayers = {};
		(data.players || data.Players || []).forEach(function (p, index) {
			var revealedSources = normalizeRevealedSources(p.revealedSources || p.RevealedSources || {});
			var revealedValues = normalizeRevealedValues(p.revealedValues || p.RevealedValues || {});
			var revealedData = revealedValues.revealedData;
			var revealedTooltips = revealedValues.revealedTooltips;

			const connId = p.connectionId || p.ConnectionId;

			roomPlayers[connId] = {
				name: p.name || p.Name,
				connectionId: connId,
				stablePlayerId: p.stablePlayerId || p.StablePlayerId || "",
				isHost: p.isHost ?? p.IsHost ?? false,
				isSpectatorGm: !!(p.isSpectatorGm ?? p.IsSpectatorGm),
				publicRole: p.publicRole || p.PublicRole || '',
				revealed: normalizeRevealedState(p.revealed || p.Revealed || {}),
				revealedData: revealedData,
				revealedSources: revealedSources,
				revealedTooltips: revealedTooltips,
				fact: normalizeFactFromPlayer({ ...p, fact: revealedSources.fact || p.fact || p.Fact, revealedData: revealedData, revealedTooltips: revealedTooltips }),
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(p.additionalConditionEffects || p.AdditionalConditionEffects || []),
				isEliminated: p.isEliminated ?? p.IsEliminated ?? false,
				eliminatedAtRound: p.eliminatedAtRound ?? p.EliminatedAtRound ?? null,
				eliminatedByVote: !!(p.eliminatedByVote ?? p.EliminatedByVote),
				canRevealAllAfterElimination: !!(p.canRevealAllAfterElimination ?? p.CanRevealAllAfterElimination),
				hasRevealedAllAfterElimination: !!(p.hasRevealedAllAfterElimination ?? p.HasRevealedAllAfterElimination),
				seatNumber: p.seatNumber ?? p.SeatNumber ?? 0
			};

			console.log(`[RejoinSuccess] roomPlayers[${index}]`, roomPlayers[connId]);
		});

		console.log("[RejoinSuccess] roomPlayers final:", roomPlayers);

		console.log("[RejoinSuccess] Object.keys(roomPlayers):", Object.keys(roomPlayers));

		const isFinishedState = isFinishedGameState(
			data.roundState || data.RoundState || data,
			rejoinCompletion);
		const isGameState =
			currentRoom.state === 'Playing' ||
			currentRoom.state === 'Voting' ||
			currentRoom.state === 'Started';

		showRoomSection();
		renderCurrentGameUI();

		if (isFinishedState) {
			currentApocalypse = data.apocalypse || data.Apocalypse;
			currentBunker = data.bunker || data.Bunker;
			currentVoting = null;
			document.getElementById('roomLobby').style.display = 'none';
			document.getElementById('gameSection').style.display = 'block';
			document.getElementById('myPlayerSection').style.display = 'block';
			renderCurrentGameUI();
			renderGameFinished(rejoinCompletion, { source: 'rejoin' });
		} else if (isGameState) {
			currentApocalypse = data.apocalypse || data.Apocalypse;
			currentBunker = data.bunker || data.Bunker;
			currentVoting = data.voting || data.Voting || null;

			document.getElementById('roomLobby').style.display = 'none';
			document.getElementById('gameSection').style.display = 'block';
			document.getElementById('myPlayerSection').style.display = 'block';

			document.getElementById('currentRoomState').textContent =
				getRoomStateLabel();

			const startBtn = document.getElementById('startGameBtn');
			if (startBtn) {
				startBtn.style.display = 'none';
				startBtn.disabled = true;
			}

			updateRoundStatusUI();

			if (currentApocalypse) renderApocalypse(currentApocalypse);
			if (currentBunker) renderBunker(currentBunker);
			if (currentThreat) renderThreatPanel(currentThreat);

			if (currentVoting) {
				const votingState = currentVoting.state || currentVoting.State || currentRoom.state;
				if (votingState === 'Active' || currentRoom.state === 'Voting') {
					showVotingPanel(currentVoting);
					const rejoinedVote = currentVoting.myVote || currentVoting.MyVote;
					if (rejoinedVote) {
						myVote = rejoinedVote;
						const voteStatus = document.getElementById('myVoteStatus');
						const voteTarget = document.getElementById('myVoteTarget');
						if (voteStatus) voteStatus.style.display = 'block';
						if (voteTarget) voteTarget.textContent = rejoinedVote.targetName || rejoinedVote.TargetName || '';
						updateVotingCandidates();
					}
				} else if (votingState === 'Completed' || votingState === 'Resolved') {
					document.getElementById('votingPanel').style.display = 'none';
					showVotingResults(currentVoting);
				}
			}
		} else {
			document.getElementById('roomLobby').style.display = 'block';
			document.getElementById('gameSection').style.display = 'none';
			document.getElementById('myPlayerSection').style.display = 'block';
		}

		renderCurrentGameUI();

		console.log("=== REJOIN SUCCESS END ===");

		addEventMessage(`Сесію відновлено! Ви знову в кімнаті <span class="event-room">${currentRoom.name}</span>`);
	});

	// Перепідключення не вдалося
	connection.off("RejoinFailed");
	connection.on("RejoinFailed", function (message) {
		console.log("Rejoin failed:", message);
		clearSession();
		currentRoom = null;
		myPlayerData = null;
		isHost = false;
		roomPlayers = {};
		showLobbySection();
		connection.invoke("GetRooms").catch(err => console.error("GetRooms after RejoinFailed error:", err));
		// Не показуємо alert — просто залишаємо в лобі
	});

	// Інший гравець перепідключився
	connection.off("PlayerReconnected");
	connection.on("PlayerReconnected", function (info) {
		console.log("Player reconnected:", info);
		// Оновлюємо connectionId гравця
		var oldKey = null;
		var reconnectedStableId = info.stablePlayerId || info.StablePlayerId || "";
		for (var key in roomPlayers) {
			if (reconnectedStableId && roomPlayers[key].stablePlayerId === reconnectedStableId) {
				oldKey = key;
				break;
			}
		}
		if (!oldKey) {
			for (var key in roomPlayers) {
				if (roomPlayers[key].name === info.name) {
					oldKey = key;
					break;
				}
			}
		}
		if (oldKey && oldKey !== info.connectionId) {
			var playerData = roomPlayers[oldKey];
			delete roomPlayers[oldKey];
			playerData.connectionId = info.connectionId;
			playerData.stablePlayerId = reconnectedStableId || playerData.stablePlayerId || "";
			playerData.isHost = info.isHost;
			roomPlayers[info.connectionId] = playerData;
		}
		renderCurrentGameUI();
		addEventMessage(`Гравець <span class="event-player">${info.name}</span> перепідключився`);
	});

	// ==================== PEEK CHARACTERISTIC HANDLER ====================

	// Хост підглянув приховану характеристику
	connection.off("CharacteristicPeeked");
	connection.on("CharacteristicPeeked", function (info) {
		console.log("Characteristic peeked:", info);
		showPeekModal(info.playerName, info.characteristicKey, info.data, info.isRevealed);
	});

	// ==================== SCENARIO & EVENT SIGNALR HANDLERS ====================

	// Кількість слотів бункера змінено
	connection.off("BunkerCapacityUpdated");
	connection.on("BunkerCapacityUpdated", function (data) {
		console.log("Bunker capacity updated:", data);
		const bunker = data.bunker || data.Bunker;
		const capacity = data.capacity ?? data.Capacity ?? getBunkerCapacityValue(bunker, currentBunkerCapacity);
		if (bunker) currentBunker = bunker;
		else if (currentBunker) {
			currentBunker.capacity = capacity;
			if ('Capacity' in currentBunker) currentBunker.Capacity = capacity;
		}
		currentBunkerCapacity = capacity;
		const input = document.getElementById('gmBunkerCapacity');
		if (input) input.value = capacity;
		setBunkerCapacityPending(false);
		const feedback = document.getElementById('gmBunkerCapacityFeedback');
		if (feedback) feedback.textContent = t('gmCapacitySaved');
		renderBunker(currentBunker);
		addEventMessage(`<span class="event-gm">GM</span> ${escapeHtml(t('capacity'))}: <strong>${escapeHtml(capacity)}</strong>`);
	});

	connection.off("GamePauseUpdated");
	connection.on("GamePauseUpdated", function (data) {
		currentRoundState = currentRoundState || {};
		currentRoundState.isPaused = data.isPaused ?? data.IsPaused ?? false;
		currentRoundState.pauseReason = data.reason || data.Reason || null;
		finishGmRoundCommand(currentRoundState.isPaused ? t('gmPause') : t('gmResume'));
		renderCurrentGameUI();
		if (gmRoundCommandPending) finishGmRoundCommand('');
	});

	connection.off("GameTimerUpdated");
	connection.on("GameTimerUpdated", function (data) {
		syncGameTimer(data);
		gameTimerCommandPending = false;
		document.querySelectorAll('.gm-timer-command').forEach(button => button.disabled = false);
		const feedback = document.getElementById('gmTimerFeedback');
		if (feedback) feedback.textContent = data.status || data.Status || '';
		renderGameTimer();
	});

	connection.off("RoundChangePreview");
	connection.on("RoundChangePreview", function (data) {
		if (!(data.allowed ?? data.Allowed)) {
			finishGmRoundCommand(data.blockedReason || data.BlockedReason || t('unavailableNow'));
			return;
		}
		const target = data.targetRound ?? data.TargetRound;
		const clears = data.clears || data.Clears || [];
		if (confirm(`${t('gmSetRound')} ${target}? ${clears.join(', ')}`)) {
			connection.invoke('SetRoundNumber', String(target), gmRoundCommandId()).catch(handleGmRoundCommandError);
		} else finishGmRoundCommand('');
	});

	connection.off("BunkerCapacityRejected");
	connection.on("BunkerCapacityRejected", function (data) {
		currentBunkerCapacity = data.capacity ?? data.Capacity ?? currentBunkerCapacity;
		const input = document.getElementById('gmBunkerCapacity');
		if (input) input.value = currentBunkerCapacity;
		setBunkerCapacityPending(false);
		const feedback = document.getElementById('gmBunkerCapacityFeedback');
		if (feedback) feedback.textContent = t('gmCapacityInvalid');
	});

	// Бункер змінено
	connection.off("BunkerChanged");
	connection.on("BunkerChanged", function (data) {
		console.log("Bunker changed:", data);
		const bunker = data.bunker || data.Bunker || data;
		currentBunker = bunker;
		currentBunkerCapacity = getBunkerCapacityValue(bunker, currentBunkerCapacity);
		const capacityInput = document.getElementById('gmBunkerCapacity');
		if (capacityInput) capacityInput.value = currentBunkerCapacity;
		renderBunker(currentBunker);
		addEventMessage(`<span class="event-bunker">🏠 ${escapeHtml(t('bunker'))}:</span> ${escapeHtml(getLocalizedValue(bunker, 'name'))}`);
	});

	// Апокаліпсис змінено
	connection.off("ApocalypseChanged");
	connection.on("ApocalypseChanged", function (data) {
		console.log("Apocalypse changed:", data);
		const apocalypse = data.apocalypse || data.Apocalypse || data;
		currentApocalypse = apocalypse;
		renderApocalypse(currentApocalypse);
		addEventMessage(`<span class="event-apocalypse">☢️ ${escapeHtml(t('apocalypse'))}:</span> ${escapeHtml(getLocalizedValue(apocalypse, 'name'))}`);
	});

	// Ігрова подія від GM
	connection.off("GameEvent");
	connection.on("GameEvent", function (data) {
		console.log("Game event:", data);
		var typeClass = 'event-' + data.type;
		addEventMessage(`<span class="${typeClass}"><strong>[Подія ${data.timestamp}]</strong> ${data.text}</span>`);
	});

	// Нова подія з ефектом (показується всім)
	connection.off("NewGameEvent");
	connection.on("NewGameEvent", function (eventData) {
		console.log("New game event:", eventData);
		showCurrentEvent(eventData);
		addEventToHistory(`<strong>${eventData.name || eventData.Name}</strong>: ${eventData.description || eventData.Description}`, 'game');
	});

	// Ефект події застосовано
	connection.off("EventEffectApplied");
	connection.on("EventEffectApplied", function (data) {
		console.log("Event effect applied:", data);
		// Оновлюємо бункер якщо потрібно
		const bunker = data.bunker || data.Bunker;
		if (bunker) {
			currentBunker = bunker;
			currentBunkerCapacity = getBunkerCapacityValue(bunker, currentBunkerCapacity);
			renderBunker(currentBunker);
		}
		addEventToHistory(`<span class="event-special">Застосовано ефект: ${data.effectDescription}</span>`, 'special');
	});

	connection.off("AdditionalInventoryGranted");
	connection.on("AdditionalInventoryGranted", function (data) {
		console.log("Additional inventory granted:", data);
		const grants = data.grants || data.Grants || [];
		const receivedItems = [];

		grants.forEach(grant => {
			const connId = grant.connectionId || grant.ConnectionId;
			const stableId = grant.stablePlayerId || grant.StablePlayerId || "";
			const inventory = grant.inventory || grant.Inventory;
			const item = grant.item || grant.Item || {};
			const itemName = getLocalizedValue(item, 'item') || getLocalizedValue(item, 'name') || grant.itemName || grant.ItemName || item.name || item.Name || t('unknown');
			const normalizedInventory = normalizeInventoryData(inventory);

			let playerKey = connId;
			if (!roomPlayers[playerKey] && stableId) {
				playerKey = Object.keys(roomPlayers).find(key => roomPlayers[key]?.stablePlayerId === stableId) || connId;
			}

			if (roomPlayers[playerKey]) {
				roomPlayers[playerKey].revealedSources = roomPlayers[playerKey].revealedSources || {};
				roomPlayers[playerKey].revealedData = roomPlayers[playerKey].revealedData || {};
				roomPlayers[playerKey].revealedTooltips = roomPlayers[playerKey].revealedTooltips || {};

				if (grant.isInventoryRevealed || grant.IsInventoryRevealed) {
					roomPlayers[playerKey].revealedSources.inventory = inventory;
					roomPlayers[playerKey].revealedData.inventory = normalizedInventory.items
						.map(inventoryItem => getLocalizedValue(inventoryItem, 'item') || getLocalizedValue(inventoryItem, 'name') || inventoryItem.name)
						.filter(Boolean)
						.join(', ');
				}
			}

			const isMine = connId === myConnectionId || (stableId && roomPlayers[myConnectionId]?.stablePlayerId === stableId);
			if (isMine && myPlayerData) {
				myPlayerData.inventory = normalizedInventory;
				receivedItems.push(itemName);
			}
		});

		applyRoundState(data.roundState || data.RoundState);
		renderCurrentGameUI();

		if (receivedItems.length > 0) {
			addEventMessage(`<span class="event-success">📦 Ви отримали додатковий інвентар:</span> ${receivedItems.join(', ')}`);
		} else if (grants.length > 0) {
			addEventMessage(`<span class="event-success">📦 Активні гравці отримали додатковий інвентар після 3 раунду.</span>`);
		}
	});

	connection.off("ThreatStateUpdated");
	connection.on("ThreatStateUpdated", function (data) {
		currentThreatState = normalizeThreatState(data.threatState || data.ThreatState || currentThreatState);
		applyRoundState(data.roundState || data.RoundState);
		mergeThreatPlayerSnapshots(data);
		if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
			renderThreatOperationModal();
			document.getElementById('threatOperationModal').style.display = 'flex';
		}
		renderCurrentGameUI();
		markGMServerUpdate();
		markGMServerUpdate();
	});

	connection.off("RoomDiagnosticsUpdated");
	connection.on("RoomDiagnosticsUpdated", function (data) {
		gmDiagnosticsData = {
			isHealthy: data.isHealthy ?? data.IsHealthy ?? false,
			checkedAtUtc: data.checkedAtUtc || data.CheckedAtUtc,
			errorCount: data.errorCount ?? data.ErrorCount ?? 0,
			warningCount: data.warningCount ?? data.WarningCount ?? 0,
			infoCount: data.infoCount ?? data.InfoCount ?? 0,
			issues: data.issues || data.Issues || [],
			serverTimestampUtc: data.serverTimestampUtc || data.ServerTimestampUtc
		};
		gmAutoFixPreview = null;
		gmDiagnosticsPending = false;
		setGmDiagnosticsPending(false);
		renderRoomDiagnostics();
		markGMServerUpdate();
	});

	connection.off("RoomAutoFixPreviewed");
	connection.on("RoomAutoFixPreviewed", function (data) {
		gmAutoFixPreview = {
			changes: data.changes || data.Changes || [],
			changeCount: data.changeCount ?? data.ChangeCount ?? 0,
			hasChanges: data.hasChanges ?? data.HasChanges ?? false
		};
		setGmDiagnosticsPending(false);
		const feedback = document.getElementById('gmDiagnosticsFeedback');
		if (feedback) feedback.textContent = gmAutoFixPreview.hasChanges
			? `${gmAutoFixPreview.changeCount} safe fix(es)` : t('gmNoAutoFix');
		const apply = document.getElementById('gmApplyAutoFix');
		if (apply) apply.disabled = !gmAutoFixPreview.hasChanges;
	});

	connection.off("RoomSnapshotsUpdated");
	connection.on("RoomSnapshotsUpdated", function (data) {
		gmSnapshotsData = data.snapshots || data.Snapshots || [];
		setGmSnapshotPending(false);
		renderRoomSnapshots();
	});

	connection.off("RoomSnapshotRestorePreviewed");
	connection.on("RoomSnapshotRestorePreviewed", function (data) {
		gmSnapshotRestorePreview = {
			snapshot: data.snapshot || data.Snapshot || null,
			canRestore: data.canRestore ?? data.CanRestore ?? false,
			blockedReason: data.blockedReason || data.BlockedReason || '',
			changes: data.changes || data.Changes || []
		};
		setGmSnapshotPending(false);
		renderRoomSnapshots();
	});

	connection.off("RoomLocalEditorUpdated");
	connection.on("RoomLocalEditorUpdated", function (data) {
		gmRoomLocalEditorData = {
			bunkerFields: data.bunkerFields || data.BunkerFields || [],
			apocalypseFields: data.apocalypseFields || data.ApocalypseFields || [],
			players: data.players || data.Players || []
		};
		setRoomLocalEditorPending(false);
		renderRoomLocalEditor();
	});

	connection.off("RoomLocalEditPreviewed");
	connection.on("RoomLocalEditPreviewed", function (data) {
		gmRoomLocalEditPreview = {
			category: data.category || data.Category || '', targetPlayerId: data.targetPlayerId || data.TargetPlayerId || null,
			fieldId: data.fieldId || data.FieldId || '', sanitizedProposedValue: data.sanitizedProposedValue || data.SanitizedProposedValue || '',
			canApply: data.canApply ?? data.CanApply ?? false, warning: data.warning || data.Warning || ''
		};
		setRoomLocalEditorPending(false);
		const feedback = document.getElementById('gmEditorFeedback');
		if (feedback) feedback.textContent = gmRoomLocalEditPreview.canApply ? gmRoomLocalEditPreview.sanitizedProposedValue : gmRoomLocalEditPreview.warning;
		const apply = document.getElementById('gmEditorApplyButton');
		if (apply) apply.disabled = !gmRoomLocalEditPreview.canApply;
	});

	connection.off("GmAuditLogUpdated");
	connection.on("GmAuditLogUpdated", function (data) {
		gmAuditData = { entries: data.entries || data.Entries || [] };
		setGmDiagnosticsPending(false);
		renderUnifiedGmAudit();
	});

	connection.off("GMThreatControlData");
	connection.on("GMThreatControlData", function (data) {
		gmThreatControlData = {
			threats: data.threats || data.Threats || [],
			currentThreat: data.currentThreat || data.CurrentThreat || null,
			auditLog: data.auditLog || data.AuditLog || [],
			canBrowseFutureThreatCatalog: data.canBrowseFutureThreatCatalog ?? data.CanBrowseFutureThreatCatalog ?? false
		};
		if (!(gmThreatControlData.currentThreat?.canForceOutcome ?? gmThreatControlData.currentThreat?.CanForceOutcome ?? false)) {
			setGMThreatForcePending(false);
			closeGMThreatForceModal();
		}
		renderGMThreatControl();
		markGMServerUpdate();
	});

	connection.off("GMThreatForcePreview");
	connection.on("GMThreatForcePreview", function (data) {
		gmThreatForcePreview = data;
		gmThreatForceRequestedOutcome = data.requestedOutcome || data.RequestedOutcome || '';
		setGMThreatForcePending(false);
		renderGMThreatForcePreview();
		const modal = document.getElementById('gmThreatForceModal');
		if (modal) modal.style.display = 'flex';
	});

	connection.off("GMThreatForceRejected");
	connection.on("GMThreatForceRejected", function (data) {
		setGMThreatForcePending(false);
		gmThreatForcePreview = null;
		const error = document.getElementById('gmThreatForceError');
		if (error) error.textContent = t('gmThreatForceStale');
		const refresh = document.getElementById('gmThreatForceRefresh');
		if (refresh) refresh.style.display = '';
		const confirmButton = document.getElementById('gmThreatForceConfirm');
		if (confirmButton) confirmButton.disabled = true;
	});

	function mergeThreatPlayerSnapshots(data) {
		const players = data.players || data.Players || [];
		players.forEach(player => {
			const connectionId = player.connectionId || player.ConnectionId;
			if (!connectionId) return;

			const previous = roomPlayers[connectionId] || {};
			const revealedValues = normalizeRevealedValues(player.revealedValues || player.RevealedValues || {});
			roomPlayers[connectionId] = {
				...previous,
				...player,
				connectionId,
				revealed: normalizeRevealedState(player.revealed || player.Revealed || previous.revealed || {}),
				revealedData: revealedValues.revealedData,
				revealedTooltips: revealedValues.revealedTooltips,
				revealedSources: normalizeRevealedSources(player.revealedSources || player.RevealedSources || {}),
				additionalConditionEffects: normalizeAdditionalPhysicalConditions(
					player.additionalPhysicalConditions || player.AdditionalPhysicalConditions ||
					player.additionalConditionEffects || player.AdditionalConditionEffects || []
				),
				additionalPhysicalConditions: normalizeAdditionalPhysicalConditions(
					player.additionalPhysicalConditions || player.AdditionalPhysicalConditions ||
					player.additionalConditionEffects || player.AdditionalConditionEffects || []
				)
			};
		});

		const privatePlayer = data.player || data.Player;
		if (privatePlayer) myPlayerData = normalizePlayer(privatePlayer);
	}

	connection.off("ThreatSupportDiceRolled");
	connection.on("ThreatSupportDiceRolled", function (data) {
		addEventMessage(`<span class="event-success">${escapeHtml(data.message || 'Кубик кинуто. Предмет підтримки видано.')}</span>`);
	});

	connection.off("ThreatSupportDropAnnounced");
	connection.on("ThreatSupportDropAnnounced", function (data) {
		addEventMessage(`<span class="event-special">${escapeHtml(data.message || 'Один із гравців отримав предмет підтримки.')}</span>`);
	});

	connection.off("ThreatSupportItemReceived");
	connection.on("ThreatSupportItemReceived", function (data) {
		if (myPlayerData && data.inventory) {
			myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
		}
		addEventMessage(`<span class="event-success">${escapeHtml(data.message || 'Ви отримали предмет підтримки.')}</span>`);
		renderCurrentGameUI();
	});

	connection.off("ThreatPrivateMessage");
	connection.on("ThreatPrivateMessage", function (data) {
		addEventMessage(`<span class="event-special">${escapeHtml(data.message || data.Message || '')}</span>`);
	});

	connection.off("ThreatContributionWithdrawn");
	connection.on("ThreatContributionWithdrawn", function (data) {
		addEventMessage(`<span class="event-warning">${escapeHtml(data.message || data.Message || 'Внесок оновлено.')}</span>`);
	});

	connection.off("ThreatVolunteerSelected");
	connection.on("ThreatVolunteerSelected", function (data) {
		addEventMessage(`<span class="event-special">${escapeHtml(data.message || data.Message || 'Добровольця вибрано.')}</span>`);
	});

	connection.off("ThreatVolunteerVoteStarted");
	connection.on("ThreatVolunteerVoteStarted", function (data) {
		addEventMessage(`<span class="event-voting">${escapeHtml(data.message || data.Message || 'Голосування загрози почалось.')}</span>`);
	});

	connection.off("ThreatVolunteerVoteProgress");
	connection.on("ThreatVolunteerVoteProgress", function (data) {
		if (currentThreatState) {
			currentThreatState.threatVolunteerVote = normalizeThreatState({ threatVolunteerVote: data }).threatVolunteerVote;
			renderThreatPanel(currentThreat);
		}
	});

	connection.off("ThreatVolunteerVoteCompleted");
	connection.on("ThreatVolunteerVoteCompleted", function (data) {
		addEventMessage(`<span class="event-voting">${escapeHtml(data.message || data.Message || 'Голосування загрози завершено.')}</span>`);
	});

	connection.off("ThreatVolunteerVoteClosed");
	connection.on("ThreatVolunteerVoteClosed", function (data) {
		addEventMessage(`<span class="event-warning">${escapeHtml(data.message || data.Message || 'Голосування загрози закрито.')}</span>`);
	});

	connection.off("ThreatResolved");
	connection.on("ThreatResolved", function (data) {
		const results = data.results || data.Results || [];
		addEventMessage(`<span class="event-success">${results.map(escapeHtml).join(' ') || 'Загрозу завершено.'}</span>`);
	});

	connection.off("ThreatMiniGameStarted");
	connection.on("ThreatMiniGameStarted", function (data) {
		if (currentThreatState) {
			currentThreatState.miniGame = normalizeThreatState({ miniGame: data }).miniGame;
		}
		renderThreatPanel(currentThreat);
		if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
			renderThreatOperationModal();
			document.getElementById('threatOperationModal').style.display = 'flex';
		}
		addEventMessage(`<span class="event-special">${escapeHtml(t('startOperation'))}</span>`);
	});

	connection.off("ThreatMiniGameUpdated");
	connection.on("ThreatMiniGameUpdated", function (data) {
		if (currentThreatState) {
			currentThreatState.miniGame = normalizeThreatState({ miniGame: data }).miniGame;
		}
		renderThreatPanel(currentThreat);
		if (document.getElementById('threatOperationModal')?.style.display === 'flex') {
			renderThreatOperationModal();
			document.getElementById('threatOperationModal').style.display = 'flex';
		}
	});

	// ==================== VOTING SIGNALR HANDLERS ====================

	// Голосування почалось
	connection.off("VotingStarted");
	connection.on("VotingStarted", function (data) {
		console.log("Voting started:", data);
		currentVoting = data;
		if (currentRoom) currentRoom.state = "Voting";
		applyRoundState(data.roundState || data.RoundState);
		myVote = null;
		showVotingPanel(data);
		renderCurrentGameUI();
		addEventMessage(`<span class="event-voting">🗳️ Голосування почалось!</span> Раунд ${data.round || data.Round || getCurrentRoundNumber()}`);
	});

	// Голос зараховано
	connection.off("VoteCast");
	connection.on("VoteCast", function (data) {
		console.log("Vote cast:", data);
		myVote = data;
		document.getElementById('myVoteStatus').style.display = 'block';
		document.getElementById('myVoteTarget').textContent = data.targetName;
		updateVotingCandidates();
		addEventMessage(`Ви проголосували за ${data.targetName}${data.changed ? ' (змінено)' : ''}`);
	});

	// Прогрес голосування
	connection.off("VotingProgress");
	connection.on("VotingProgress", function (data) {
		console.log("Voting progress:", data);
		document.getElementById('votingProgressText').textContent = `${data.votedCount}/${data.totalVoters} проголосували`;
	});

	// Голосування завершено
	connection.off("VotingEnded");
	connection.on("VotingEnded", function (data) {
		console.log("Voting ended:", data);
		currentVoting = data;

		// Ховаємо панель голосування
		document.getElementById('votingPanel').style.display = 'none';

		// Показуємо результати (тільки хосту показуємо кнопки)
		showVotingResults(data);

		addEventMessage(`<span class="event-voting">🗳️ Голосування завершено!</span> Лідер: ${data.topVotedPlayerName || 'Нічия'}`);
	});

	// Рішення по голосуванню прийнято
	connection.off("VotingResolved");
	connection.on("VotingResolved", function (data) {
		console.log("Voting resolved:", data);
		currentVoting = data.voting || data.Voting || currentVoting;
		if (currentRoom) {
			currentRoom.state = "Playing";
			currentRoom.currentRound = data.currentRound || data.CurrentRound || data.nextRound || data.NextRound || currentRoom.currentRound;
		}
		applyRoundState(data.roundState || data.RoundState);
		document.getElementById('votingPanel').style.display = 'none';
		if (currentVoting) {
			showVotingResults(currentVoting);
		}

		// Оновлюємо UI
		renderCurrentGameUI();

		addEventMessage(`<span class="event-voting">⚖️</span> ${data.message}`);
	});

	// Голосування скасовано
	connection.off("VotingCancelled");
	connection.on("VotingCancelled", function (data) {
		console.log("Voting cancelled:", data);
		currentVoting = null;
		if (currentRoom) currentRoom.state = "Playing";
		applyRoundState(data.roundState || data.RoundState);

		document.getElementById('votingPanel').style.display = 'none';
		document.getElementById('votingResultsPanel').style.display = 'none';

		addEventMessage(`<span class="event-warning">⚠️ ${data.message}</span>`);
	});

	connection.off("VotingAdminUpdated");
	connection.on("VotingAdminUpdated", function (data) {
		gmVotingAdminState = {
			active: data.active ?? data.Active ?? false,
			state: data.state || data.State || 'none',
			votedCount: data.votedCount ?? data.VotedCount ?? 0,
			totalVoters: data.totalVoters ?? data.TotalVoters ?? 0,
			nonVoters: data.nonVoters || data.NonVoters || [],
			eligibleVoters: data.eligibleVoters || data.EligibleVoters || []
		};
		renderGmVotingAdmin();
		finishGmRoundCommand('');
	});

	// ==================== SCENARIO IMAGE HANDLERS ====================

	// Зображення апокаліпсису оновлено
	connection.off("ApocalypseImageUpdated");
	connection.on("ApocalypseImageUpdated", function (data) {
		console.log("[ApocalypseImageUpdated]", data);
		if (currentApocalypse && (currentApocalypse.id || currentApocalypse.Id) === (data.apocalypseId || data.ApocalypseId)) {
			const imageUrl = data.imageUrl || data.ImageUrl || null;
			currentApocalypse.imageUrl = imageUrl;
			if ('ImageUrl' in currentApocalypse) currentApocalypse.ImageUrl = imageUrl;
			renderApocalypse(currentApocalypse);
			addEventMessage(`<span class="event-image">🖼️</span> Зображення апокаліпсису оновлено`);
		}
	});

	// Зображення бункера оновлено
	connection.off("BunkerImageUpdated");
	connection.on("BunkerImageUpdated", function (data) {
		console.log("[BunkerImageUpdated]", data);
		if (currentBunker && (currentBunker.id || currentBunker.Id) === (data.bunkerId || data.BunkerId)) {
			const imageUrl = data.imageUrl || data.ImageUrl || null;
			currentBunker.imageUrl = imageUrl;
			if ('ImageUrl' in currentBunker) currentBunker.ImageUrl = imageUrl;
			renderBunker(currentBunker);
			addEventMessage(`<span class="event-image">🖼️</span> Зображення бункера оновлено`);
		}
	});

	connection.off("ThreatImageUpdated");
	connection.on("ThreatImageUpdated", function (data) {
		console.log("[ThreatImageUpdated]", data);
		const currentThreatId = currentThreat?.id || currentThreat?.Id;
		if (currentThreat && currentThreatId === data.threatId) {
			currentThreat.imageUrl = data.imageUrl;
			currentThreat.uploadedImagePath = data.imageUrl;
			renderThreatPanel(currentThreat);
			addEventMessage(`<span class="event-image">🖼️</span> Зображення загрози оновлено`);
		}
	});

	// Зображення апокаліпсису видалено
	connection.off("ApocalypseImageRemoved");
	connection.on("ApocalypseImageRemoved", function (data) {
		console.log("[ApocalypseImageRemoved]", data);
		if (currentApocalypse && (currentApocalypse.id || currentApocalypse.Id) === (data.apocalypseId || data.ApocalypseId)) {
			currentApocalypse.imageUrl = null;
			if ('ImageUrl' in currentApocalypse) currentApocalypse.ImageUrl = null;
			renderApocalypse(currentApocalypse);
			addEventMessage(`<span class="event-image">🗑️</span> Зображення апокаліпсису видалено`);
		}
	});

	// Зображення бункера видалено
	connection.off("BunkerImageRemoved");
	connection.on("BunkerImageRemoved", function (data) {
		console.log("[BunkerImageRemoved]", data);
		if (currentBunker && (currentBunker.id || currentBunker.Id) === (data.bunkerId || data.BunkerId)) {
			currentBunker.imageUrl = null;
			if ('ImageUrl' in currentBunker) currentBunker.ImageUrl = null;
			renderBunker(currentBunker);
			addEventMessage(`<span class="event-image">🗑️</span> Зображення бункера видалено`);
		}
	});

	connection.off("ThreatImageRemoved");
	connection.on("ThreatImageRemoved", function (data) {
		console.log("[ThreatImageRemoved]", data);
		const currentThreatId = currentThreat?.id || currentThreat?.Id;
		if (currentThreat && currentThreatId === data.threatId) {
			currentThreat.imageUrl = null;
			currentThreat.uploadedImagePath = null;
			renderThreatPanel(currentThreat);
			addEventMessage(`<span class="event-image">🗑️</span> Зображення загрози видалено`);
		}
	});

	// ==================== BUNKER SUPPLIES HANDLERS ====================

	// Запаси бункера додано
	connection.off("BunkerSuppliesAdded");
	connection.on("BunkerSuppliesAdded", function (data) {
		console.log("[BunkerSuppliesAdded]", data);

		if (currentBunker) {
			const supplies = data.totalSuppliesMonths ?? data.TotalSuppliesMonths;
			currentBunker.suppliesMonths = supplies;
			if ('SuppliesMonths' in currentBunker) currentBunker.SuppliesMonths = supplies;
			renderBunker(currentBunker);
		}

		addEventMessage(`<span class="event-success">📦 GM додав запаси їжі: +${data.addedMonths} місяців</span>`);
	});

	// Запаси бункера зменшено
	connection.off("BunkerSuppliesRemoved");
	connection.on("BunkerSuppliesRemoved", function (data) {
		console.log("[BunkerSuppliesRemoved]", data);

		if (currentBunker) {
			const supplies = data.totalSuppliesMonths ?? data.TotalSuppliesMonths;
			currentBunker.suppliesMonths = supplies;
			if ('SuppliesMonths' in currentBunker) currentBunker.SuppliesMonths = supplies;
			renderBunker(currentBunker);
		}

		addEventMessage(`<span class="event-warning">📦 Запаси бункера зменшено на ${data.removedMonths} місяців</span>`);
	});

} // End of registerSignalREvents()

// ==================== GLOBAL FUNCTIONS ====================

let isStartingGame = false;

async function previewLobbyStart() {
	if (lobbyCommandPending) return; lobbyCommandPending = true; renderLobbyState();
	try { lobbyStartPreview = await connection.invoke('PreviewStartGameFromLobby'); renderLobbyPreviewSummary(); }
	catch (_) { lobbyStartPreview = null; renderLobbyPreviewSummary(true); }
	finally { lobbyCommandPending = false; renderLobbyState(); }
}

async function startGame() {
	if (isStartingGame || lobbyCommandPending) return;
	if (!lobbyStartPreview?.canStart) { await previewLobbyStart(); return; }
	if (!confirm(getCurrentLanguage() === 'en' ? 'Start the game?' : getCurrentLanguage() === 'ru' ? 'Начать игру?' : 'Почати гру?')) return;
	isStartingGame = true; lobbyCommandPending = true; renderLobbyState();
	try { await connection.invoke('StartGameFromLobby', lobbyStartPreview.previewToken, true, crypto.randomUUID()); }
	catch (_) { isStartingGame = false; lobbyStartPreview = null; renderLobbyPreviewSummary(true); }
	finally { lobbyCommandPending = false; renderLobbyState(); }
}

async function toggleLobbyReady() {
	if (lobbyCommandPending) return; const members = lobbyState?.members || lobbyState?.Members || [];
	const me = members.find(member => member.playerId === getMyStablePlayerId() || member.PlayerId === getMyStablePlayerId());
	lobbyCommandPending = true; renderLobbyState();
	try { await connection.invoke('SetLobbyReady', !(me?.isReady ?? me?.IsReady ?? false), crypto.randomUUID()); }
	finally { lobbyCommandPending = false; renderLobbyState(); }
}

async function setLobbyParticipation(playerId, spectator) {
	if (lobbyCommandPending) return; lobbyCommandPending = true; renderLobbyState();
	try { const role = spectator ? 1 : 0; const preview = await connection.invoke('PreviewSetLobbyParticipation', playerId, role); if (!(preview.canApply ?? preview.CanApply) || !confirm(`${preview.targetName || preview.TargetName}: ${preview.requestedRole || preview.RequestedRole}?`)) return; await connection.invoke('SetLobbyParticipation', playerId, role, true, crypto.randomUUID()); }
	finally { lobbyCommandPending = false; renderLobbyState(); }
}

async function transferLobbyHost(playerId) {
	if (lobbyCommandPending || !confirm('Transfer host?')) return; lobbyCommandPending = true;
	try { await connection.invoke('TransferHost', playerId, crypto.randomUUID()); } finally { lobbyCommandPending = false; }
}

// ==================== CONNECTION STATUS UI ====================

function updateConnectionStatus(status, isError = false) {
	const statusEl = document.getElementById('connectionStatus');
	const createBtn = document.getElementById('createRoomBtn');
	if (statusEl) {
		statusEl.style.display = 'block';
		statusEl.style.color = isError ? 'var(--color-red)' : 'var(--color-green)';
		statusEl.textContent = status;
		// Ховаємо статус через 3 секунди якщо успішно
		if (!isError) {
			setTimeout(() => { statusEl.style.display = 'none'; }, 3000);
		}
	}
	if (createBtn) {
		createBtn.disabled = isError;
		createBtn.style.opacity = isError ? '0.5' : '1';
	}
}

// ==================== SCENARIO IMAGE FUNCTIONS ====================

// Відкрити зображення в модальному вікні
function openImageModal(imageUrl, title) {
	let modal = document.getElementById('imageModal');
	if (!modal) {
		modal = document.createElement('div');
		modal.id = 'imageModal';
		modal.className = 'image-modal-overlay';
		modal.onclick = function (e) {
			if (e.target === modal) closeImageModal();
		};
		modal.innerHTML = `
            <div class="image-modal">
                <div class="image-modal-header">
                    <h3 id="imageModalTitle"></h3>
                    <button class="image-modal-close" onclick="closeImageModal()">×</button>
                </div>
                <div class="image-modal-body">
                    <img id="imageModalImg" src="" alt="" />
                </div>
            </div>
        `;
		document.body.appendChild(modal);
	}

	document.getElementById('imageModalTitle').textContent = title;
	document.getElementById('imageModalImg').src = imageUrl;
	document.getElementById('imageModalImg').alt = title;
	modal.style.display = 'flex';
}

// Закрити модальне вікно із зображенням
function closeImageModal() {
	const modal = document.getElementById('imageModal');
	if (modal) {
		modal.style.display = 'none';
	}
}

// ==================== BUNKER SUPPLIES FUNCTIONS ====================

// Додати запаси до бункера
async function addBunkerSupplies(months = null) {
	if (!isHost) {
		alert("Тільки хост може додавати запаси");
		return;
	}

	if (!currentBunker) {
		alert("Бункер не визначено. Спочатку почніть гру.");
		return;
	}

	let amount = months;

	if (amount === null || amount === undefined) {
		const input = prompt(
			"Скільки місяців запасів додати?",
			"3"
		);

		if (input === null) {
			return;
		}

		amount = Number.parseInt(input, 10);
	}

	if (!Number.isInteger(amount) || amount < 1 || amount > 120) {
		alert("Вкажіть ціле число від 1 до 120");
		return;
	}

	try {
		console.log("[addBunkerSupplies] Invoking with:", amount);

		await connection.invoke(
			"AddBunkerSupplies",
			amount
		);

		console.log("[addBunkerSupplies] Success");
	} catch (err) {
		console.error("[addBunkerSupplies] Error:", err);

		alert(
			"Помилка додавання запасів:\n" +
			(err?.message ?? String(err))
		);
	}
}
// Зменшити запаси бункера
function removeBunkerSupplies(months) {
	if (!isHost) {
		alert('Тільки хост може змінювати запаси');
		return;
	}

	if (!currentBunker) {
		alert('Бункер не визначено');
		return;
	}

	const amount = months || parseInt(prompt('Скільки місяців забрати?', '3'));
	if (isNaN(amount) || amount <= 0) return;

	console.log("[removeBunkerSupplies] Invoking with:", amount);

	connection.invoke("RemoveBunkerSupplies", amount)
		.then(() => {
			console.log("[removeBunkerSupplies] Success");
		})
		.catch(err => {
			console.error("[removeBunkerSupplies] Error:", err);
			alert('Помилка зменшення запасів');
		});
}

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

// Sanitize player name input - max 10 chars
function sanitizeNameInput(input) {
	// Trim and limit to 10 characters
	let value = input.value;
	if (value.length > 10) {
		input.value = value.substring(0, 10);
	}
}

// Validate player name before submission
function validatePlayerName(name) {
	if (!name || name.trim().length === 0) {
		return { valid: false, error: "Ім'я гравця обов'язкове" };
	}
	name = name.trim();
	if (name.length > 10) {
		return { valid: false, error: "Ім'я гравця не може перевищувати 10 символів" };
	}
	return { valid: true, name: name };
}

// ==================== SESSION & PROFILE FUNCTIONS ====================

const sessionKeys = {
	roomId: 'bunker_roomId',
	playerName: 'bunker_playerName',
	hostToken: 'bunker_hostToken',
	stablePlayerId: 'bunker_stablePlayerId',
	reconnectToken: 'bunker_reconnectToken',
	isHost: 'bunker_isHost'
};

function saveSession(roomId, playerName, currentHostToken) {
	try {
		const hostValue = currentHostToken || '';
		const isHostValue = (!!hostValue || isHost).toString();

		sessionStorage.setItem(sessionKeys.roomId, roomId);
		sessionStorage.setItem(sessionKeys.playerName, playerName);
		sessionStorage.setItem(sessionKeys.stablePlayerId, stablePlayerId);
		if (currentHostToken) {
			sessionStorage.setItem(sessionKeys.hostToken, currentHostToken);
		} else {
			sessionStorage.removeItem(sessionKeys.hostToken);
		}
		sessionStorage.setItem(sessionKeys.isHost, isHostValue);

		localStorage.setItem(sessionKeys.roomId, roomId);
		localStorage.setItem(sessionKeys.playerName, playerName);
		localStorage.setItem(sessionKeys.stablePlayerId, stablePlayerId);
		if (reconnectToken) {
			sessionStorage.setItem(sessionKeys.reconnectToken, reconnectToken);
			localStorage.setItem(sessionKeys.reconnectToken, reconnectToken);
		}
		localStorage.setItem(sessionKeys.isHost, isHostValue);
		if (currentHostToken) {
			localStorage.setItem(sessionKeys.hostToken, currentHostToken);
		} else {
			localStorage.removeItem(sessionKeys.hostToken);
		}

		// Також зберігаємо ім'я в localStorage для автозаповнення
		localStorage.setItem('bunker_lastPlayerName', playerName);
	} catch (e) { console.warn('Session save failed:', e); }
}

// Генеруємо або отримуємо стабільний playerId
function getOrCreatePlayerId() {
	let playerId = localStorage.getItem(sessionKeys.stablePlayerId) || localStorage.getItem('bunker_playerId');
	if (!playerId) {
		playerId = 'player_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
	}
	localStorage.setItem(sessionKeys.stablePlayerId, playerId);
	localStorage.setItem('bunker_playerId', playerId);
	return playerId;
}

const stablePlayerId = getOrCreatePlayerId();

function clearSession() {
	try {
		Object.values(sessionKeys).forEach(key => {
			sessionStorage.removeItem(key);
			if (key !== sessionKeys.stablePlayerId) {
				localStorage.removeItem(key);
			}
		});
	} catch (e) { }
}

function loadSession() {
	try {
		return {
			roomId: sessionStorage.getItem(sessionKeys.roomId) || localStorage.getItem(sessionKeys.roomId),
			playerName: sessionStorage.getItem(sessionKeys.playerName) || localStorage.getItem(sessionKeys.playerName),
			hostToken: sessionStorage.getItem(sessionKeys.hostToken) || localStorage.getItem(sessionKeys.hostToken),
			stablePlayerId: sessionStorage.getItem(sessionKeys.stablePlayerId) || localStorage.getItem(sessionKeys.stablePlayerId)
			, reconnectToken: sessionStorage.getItem(sessionKeys.reconnectToken) || localStorage.getItem(sessionKeys.reconnectToken)
		};
	} catch (e) { return { roomId: null, playerName: null }; }
}

function tryRejoin() {
	var session = loadSession();
	var rejoinStablePlayerId = session.stablePlayerId || stablePlayerId;
	if (session.roomId && session.playerName && rejoinStablePlayerId) {
		hostToken = session.hostToken || null;
		reconnectToken = session.reconnectToken || null;
		console.log('Attempting rejoin with playerId:', rejoinStablePlayerId);
		connection.invoke("RejoinRoom", session.roomId, session.playerName, rejoinStablePlayerId, session.reconnectToken || null)
			.catch(function (err) {
				console.error("RejoinRoom error:", err);
				clearSession();
				connection.invoke("GetRooms").catch(getRoomsErr => console.error("GetRooms after failed rejoin error:", getRoomsErr));
			});
		return true;
	}
	return false;
}

// Автозаповнення імені з localStorage
function prefillPlayerName() {
	try {
		var lastPlayerName = localStorage.getItem('bunker_lastPlayerName');
		if (lastPlayerName) {
			var createInput = document.getElementById('playerNameCreate');
			if (createInput && !createInput.value) {
				createInput.value = lastPlayerName;
			}
		}
	} catch (e) { }
}

// ==================== PEEK (EYE ICON) FUNCTIONS ====================

function peekCharacteristic(charName) {
	var selectedId = document.getElementById('gmPlayerSelect').value;
	if (!selectedId) {
		alert(getCurrentLanguage() === 'en' ? 'Choose a player first' : getCurrentLanguage() === 'ru' ? 'Сначала выберите игрока' : 'Спочатку виберіть гравця');
		return;
	}

	// Locally reveal the value in GM panel immediately
	revealCharInGMPanel(charName);

	// Also call server to get full data
	connection.invoke("PeekCharacteristic", selectedId, charName)
		.catch(function (err) { console.error("PeekCharacteristic error:", err); });
}

// Reveal a specific characteristic value in the GM panel
function revealCharInGMPanel(charName) {
	const playerData = gmPlayersData[selectedPlayerForGM];
	if (!playerData) return;

	let value = t('unknown');
	let elementId = '';

	switch (charName) {
		case 'Personality':
			value = formatPersonality(playerData.personality || playerData.Personality);
			elementId = 'gmPersonality';
			break;
		case 'Body':
			value = formatBody(playerData.body || playerData.Body);
			elementId = 'gmBody';
			break;
		case 'Profession':
			value = getCharValue(playerData, 'profession', 'Profession') || t('unknown');
			elementId = 'gmProfession';
			break;
		case 'PhysicalHealth':
			value = getCharValue(playerData, 'physicalHealth', 'PhysicalHealth') || t('unknown');
			elementId = 'gmPhysicalHealth';
			break;
		case 'MentalHealth':
			value = getCharValue(playerData, 'mentalHealth', 'MentalHealth') || t('unknown');
			elementId = 'gmMentalHealth';
			break;
		case 'Hobby':
			value = getCharValue(playerData, 'hobby', 'Hobby') || t('unknown');
			elementId = 'gmHobby';
			break;
		case 'CharacterTrait':
			value = getCharValue(playerData, 'characterTrait', 'CharacterTrait') || t('unknown');
			elementId = 'gmCharacterTrait';
			break;
		case 'Phobia':
			value = getCharValue(playerData, 'phobia', 'Phobia') || t('unknown');
			elementId = 'gmPhobia';
			break;
		case 'Inventory':
			value = getCharValue(playerData, 'inventory', 'Inventory') || t('unknown');
			elementId = 'gmInventory';
			break;
		case 'Property':
			value = getCharValue(playerData, 'property', 'Property') || t('propertyUnavailable');
			elementId = 'gmProperty';
			break;
		case 'Fact':
			const fact = playerData.fact ?? playerData.Fact;
			value = fact ? (getLocalizedValue(fact, 'fact') || getLocalizedValue(fact, 'name') || fact.name || fact.Name || t('unknown')) : t('unknown');
			elementId = 'gmFact';
			break;
	}

	const el = document.getElementById(elementId);
	if (el) {
		el.textContent = value;
		el.classList.remove('gm-char-hidden');
		el.classList.add('gm-char-revealed');
	}

	// Track what's been revealed
	gmRevealedChars[charName] = true;
}

function showPeekModal(playerName, charKey, data, isAlreadyRevealed) {
	var statusText = isAlreadyRevealed ? '(вже розкрита для всіх)' : '(прихована від інших)';
	var content = '<div class="peek-info">' +
		'<p><strong>Гравець:</strong> ' + playerName + '</p>' +
		'<p><strong>' + data.label + ':</strong> ' + data.value + '</p>' +
		(data.tooltip ? '<p class="peek-tooltip"><em>' + data.tooltip + '</em></p>' : '') +
		'<p class="peek-status">' + statusText + '</p>' +
		'</div>';

	document.getElementById('peekModalContent').innerHTML = content;
	document.getElementById('peekModal').style.display = 'flex';
}

function closePeekModal() {
	document.getElementById('peekModal').style.display = 'none';
}

// ==================== SCENARIO & EVENT FUNCTIONS ====================

var currentBunkerCapacity = 6;

function setBunkerCapacityPending(pending) {
	bunkerCapacityPending = pending;
	const input = document.getElementById('gmBunkerCapacity');
	const button = document.getElementById('gmBunkerCapacitySubmit');
	if (input) input.disabled = pending;
	if (button) button.disabled = pending;
}

function submitBunkerCapacity() {
	if (bunkerCapacityPending) return;
	const input = document.getElementById('gmBunkerCapacity');
	const raw = input?.value?.trim() || '';
	const parsed = Number(raw);
	const feedback = document.getElementById('gmBunkerCapacityFeedback');
	if (!/^\d+$/.test(raw) || !Number.isInteger(parsed) || parsed < 1 || parsed > 99) {
		if (input) input.value = currentBunkerCapacity;
		if (feedback) feedback.textContent = t('gmCapacityInvalid');
		return;
	}
	setBunkerCapacityPending(true);
	if (feedback) feedback.textContent = '';
	connection.invoke("SetBunkerCapacity", raw).catch(function (err) {
		console.error("SetBunkerCapacity error:", err);
		if (input) input.value = currentBunkerCapacity;
		if (feedback) feedback.textContent = localizeServerMessage(err?.message || t('gmCapacityInvalid'));
		setBunkerCapacityPending(false);
	});
}

function handleBunkerCapacityKeydown(event) {
	if (event.key === 'Enter') {
		event.preventDefault();
		submitBunkerCapacity();
	}
}

function regenerateBunker() {
	if (confirm('Згенерувати новий бункер?')) {
		connection.invoke("RegenerateBunker")
			.catch(function (err) { console.error("RegenerateBunker error:", err); });
	}
}

function regenerateApocalypse() {
	if (confirm('Згенерувати новий апокаліпсис?')) {
		connection.invoke("RegenerateApocalypse")
			.catch(function (err) { console.error("RegenerateApocalypse error:", err); });
	}
}

function sendGameEvent() {
	var text = document.getElementById('gmEventText').value.trim();
	var type = document.getElementById('gmEventType').value;
	if (!text) {
		alert('Введіть текст події');
		return;
	}
	connection.invoke("SendGameEvent", text, type)
		.catch(function (err) { console.error("SendGameEvent error:", err); });
	document.getElementById('gmEventText').value = '';
}

function sendQuickEvent(text, type) {
	connection.invoke("SendGameEvent", text, type)
		.catch(function (err) { console.error("SendGameEvent error:", err); });
}

// ==================== MOBILE TOOLTIPS ====================

// Ініціалізація tooltip для мобільних
function initMobileTooltips() {
	window.reinitTooltips?.();
}

// ==================== ROOM FUNCTIONS ====================

function createRoom() {
	console.log('[CreateRoom] Function called');

	const playerName = document.getElementById('playerNameCreate').value.trim();
	const roomName = document.getElementById('roomName').value.trim();
	const maxPlayers = parseInt(document.getElementById('maxPlayers').value) || 12;
	const password = document.getElementById('roomPassword').value || null;
	const btn = document.getElementById('createRoomBtn');

	// Валідація
	if (!playerName) {
		alert("Введіть ім’я гравця");
		document.getElementById('playerNameCreate').focus();
		return;
	}

	if (!roomName) {
		alert("Введіть назву кімнати");
		document.getElementById('roomName').focus();
		return;
	}

	// Перевіряємо з'єднання
	if (connection.state !== signalR.HubConnectionState.Connected) {
		updateConnectionStatus("✗ Немає з'єднання. Зачекайте...", true);
		return;
	}

	// Блокуємо кнопку на час запиту
	if (btn) {
		btn.disabled = true;
		btn.textContent = 'Створення...';
	}

	clearSession();
	resetClientGameStateForNewRoom();

	console.log('[CreateRoom] Invoking CreateRoom with:', { roomName, playerName, maxPlayers, hasPassword: !!password, playerId: stablePlayerId });

	connection.invoke("CreateRoom", roomName, playerName, maxPlayers, password, stablePlayerId)
		.then(() => {
			console.log('[CreateRoom] Invoke successful');
		})
		.catch(function (err) {
			console.error("[CreateRoom] Error:", err);
			alert("Помилка створення кімнати: " + (err.message || err));
			// Повертаємо кнопку
			if (btn) {
				btn.disabled = false;
				btn.textContent = 'Створити кімнату';
			}
		});
}

function getInviteLink(roomId) {
	if (!roomId) return '';
	return `${window.location.origin}/room/${encodeURIComponent(roomId)}`;
}

function fallbackCopyText(text) {
	const textarea = document.createElement('textarea');
	textarea.value = text;
	textarea.setAttribute('readonly', '');
	textarea.style.position = 'fixed';
	textarea.style.top = '-1000px';
	textarea.style.left = '-1000px';
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand('copy');
	textarea.remove();
}

async function copyInviteLink() {
	const inviteLink = getInviteLink(currentRoom?.id);
	if (!inviteLink) return '';

	try {
		if (navigator.clipboard && window.isSecureContext) {
			await navigator.clipboard.writeText(inviteLink);
		} else {
			fallbackCopyText(inviteLink);
		}
	} catch (err) {
		console.warn('Clipboard API failed, using fallback copy:', err);
		fallbackCopyText(inviteLink);
	}

	const btn = document.getElementById('copyInviteLinkBtn');
	if (btn) {
		const originalText = btn.textContent;
		btn.textContent = getCurrentLanguage() === 'en' ? 'Copied' : getCurrentLanguage() === 'ru' ? 'Скопировано' : 'Скопійовано';
		window.setTimeout(() => {
			btn.textContent = originalText;
		}, 1600);
	}

	return inviteLink;
}

window.copyInviteLink = copyInviteLink;

function openJoinRoomModal(roomId) {
	const modal = document.getElementById('joinModal');
	const roomInput = document.getElementById('joinRoomId');
	const joinNameInput = document.getElementById('playerNameJoin');
	const createNameInput = document.getElementById('playerNameCreate');

	if (!modal || !roomInput) return;

	roomInput.value = roomId;
	if (joinNameInput && !joinNameInput.value.trim()) {
		joinNameInput.value = createNameInput?.value?.trim() || localStorage.getItem('bunker_lastPlayerName') || '';
	}
	modal.style.display = 'flex';
	joinNameInput?.focus();
}

function joinRoom(roomId, hasPassword) {
	if (hasPassword) {
		openJoinRoomModal(roomId);
	} else {
		const typedName = document.getElementById('playerNameJoin')?.value?.trim()
			|| document.getElementById('playerNameCreate')?.value?.trim()
			|| '';
		let playerName = typedName || prompt("Введіть ваше ім'я (макс. 10 символів):");
		if (playerName && playerName.trim()) {
			// Validate and sanitize name
			const validation = validatePlayerName(playerName);
			if (!validation.valid) {
				alert(validation.error);
				return;
			}
			connection.invoke("JoinRoom", roomId, validation.name, null, stablePlayerId, loadSession().reconnectToken || null)
				.catch(err => console.error("JoinRoom error:", err));
		}
	}
}

function submitJoinRoom() {
	const playerNameRaw = document.getElementById('playerNameJoin').value;
	const password = document.getElementById('joinRoomPassword').value || null;
	const roomId = document.getElementById('joinRoomId').value;

	// Validate name
	const validation = validatePlayerName(playerNameRaw);
	if (!validation.valid) {
		alert(validation.error);
		document.getElementById('playerNameJoin').focus();
		return;
	}

	const playerName = validation.name;

	// Зберігаємо roomId для перевірки в RoomJoined handler
	pendingJoinRoomId = roomId;

	connection.invoke("JoinRoom", roomId, playerName, password, stablePlayerId, loadSession().reconnectToken || null)
		.catch(err => {
			console.error("JoinRoom error:", err);
			pendingJoinRoomId = null;
		});
	// Модалка закриється автоматично в RoomJoined handler
}

function closeJoinModal() {
	document.getElementById('joinModal').style.display = 'none';
	document.getElementById('playerNameJoin').value = '';
	document.getElementById('joinRoomPassword').value = '';
}

function leaveRoom() {
	if (confirm("Ви впевнені, що хочете покинути кімнату?")) {
		connection.invoke("LeaveRoom")
			.catch(err => console.error("LeaveRoom error:", err));
	}
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

// ==================== APOCALYPSE & BUNKER FUNCTIONS ====================

const apocalypseIconSvgRegistry = Object.freeze({
	nuclear: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="7"/><path d="M29 25 18 7A28 28 0 0 1 46 7L35 25a10 10 0 0 0-6 0ZM38 31h21a28 28 0 0 1-14 24L35 38a10 10 0 0 0 3-7ZM29 38 19 55A28 28 0 0 1 5 31h21a10 10 0 0 0 3 7Z"/></svg>',
	biological: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="6"/><path d="M32 26c-8-14-24-9-24 5h17M38 32c16 0 19 16 7 23l-8-15M29 38c-8 14-24 8-24-6h17" fill="none" stroke="currentColor" stroke-width="5"/><circle cx="32" cy="32" r="4"/></svg>',
	climate: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 37h40a11 11 0 0 0-4-21 16 16 0 0 0-30 7A8 8 0 0 0 9 37Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m18 46-4 8m18-8-4 8m18-8-4 8" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>',
	cosmic: '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="31" cy="32" r="16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M7 42c9 7 29 4 43-7 7-6 9-11 6-14" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="49" cy="10" r="3"/></svg>',
	ai: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="14" width="36" height="36" rx="6" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 25h16v14H24zM6 24h8M6 40h8M50 24h8M50 40h8M24 6v8M40 6v8M24 50v8M40 50v8" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	alien: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 7c15 0 23 10 19 25-3 13-12 24-19 25-7-1-16-12-19-25C9 17 17 7 32 7Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M18 27c7-3 11 1 12 9-7 1-11-2-12-9Zm28 0c-7-3-11 1-12 9 7 1 11-2 12-9ZM26 46h12" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
	fungal: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M13 32C15 16 25 8 36 9c12 1 19 10 20 23H13Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M27 32c2 8 1 15-4 22h21c-5-7-6-14-4-22" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="25" cy="23" r="2"/><circle cx="39" cy="18" r="2"/><circle cx="47" cy="26" r="2"/></svg>',
	zombie: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M18 48c-5-6-8-13-8-21C10 14 20 6 32 6s22 8 22 21c0 8-3 15-8 21v8H18v-8Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m20 28 9 5-9 4m24-9-9 5 9 4M28 45h8M25 56v-7m14 7v-7" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	mystical: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M5 32s10-17 27-17 27 17 27 17-10 17-27 17S5 32 5 32Z" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="32" cy="32" r="8" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 4v7M8 9l6 6m42-6-6 6M32 53v7" stroke="currentColor" stroke-width="3"/></svg>',
	anomaly: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m32 5 8 17 19 2-14 13 4 19-17-9-17 9 4-19L5 24l19-2 8-17Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m25 20 14 24M40 18 23 45" stroke="currentColor" stroke-width="3"/></svg>',
	collapse: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M9 57h46M15 57V13h19v44M34 24h15v33M21 21h7m-7 10h7m-7 10h7m19-9-8 8 7 6-9 11" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	generic: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 59 55H5L32 6Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 22v17m0 8v2" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>'
});

function normalizeApocalypseMetadataValue(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function resolveApocalypseVisualVariant(model) {
	const metadata = [
		...(Array.isArray(model?.tags) ? model.tags : []),
		model?.category, model?.type, model?.classification, model?.imageCategory, model?.imageType
	].map(normalizeApocalypseMetadataValue).filter(Boolean).join(' ');
	const rules = [
		['nuclear', /nuclear|radiation|atomic|fallout/],
		['fungal', /fungal|fungus|spore|mushroom/],
		['zombie', /zombie|undead/],
		['biological', /biological|biohazard|infection|virus|pandemic|parasite|toxic_contamination/],
		['climate', /weather_climate|climate|winter_cold|heat_fire|volcanic_ash|storm|flood|drought|ice/],
		['cosmic', /cosmic|space|asteroid|meteor|solar|planetary/],
		['ai', /ai_machines|artificial_intelligence|technology|nanotech|cyber|robot|machine/],
		['alien', /alien|extraterrestrial|ufo|unknown_signal/],
		['mystical', /mystical|occult|magic|supernatural|rune/],
		['anomaly', /anomaly_reality|anomaly|reality_distortion|dimensional/],
		['collapse', /structural_damage|social_conflict|collapse|industrial|infrastructure/]
	];
	return rules.find(([, pattern]) => pattern.test(metadata))?.[0] || 'generic';
}

function normalizeLocalScenarioImageUrl(value) {
	const url = String(value ?? '').trim().replace(/\\/g, '/');
	if (!url || /^(?:https?:)?\/\//i.test(url) || /^[a-z][a-z0-9+.-]*:/i.test(url) || url.includes('..')) return '';
	return url.startsWith('/') ? url : `/${url.replace(/^\.\//, '')}`;
}

function getApocalypseDangerKey(value) {
	const normalized = normalizeApocalypseMetadataValue(value);
	if (['low', 'minor'].includes(normalized)) return 'low';
	if (['medium', 'moderate'].includes(normalized)) return 'medium';
	if (['high', 'severe'].includes(normalized)) return 'high';
	if (['very_high', 'veryhigh'].includes(normalized)) return 'very-high';
	if (['critical', 'extreme', 'catastrophic'].includes(normalized)) return 'critical';
	return 'unknown';
}

function getApocalypseDangerLabel(key) {
	return t({ low: 'dangerLow', medium: 'dangerMedium', high: 'dangerHigh', 'very-high': 'dangerVeryHigh', critical: 'dangerCritical' }[key] || 'dangerUnknown');
}

function buildApocalypseScenarioModel(source) {
	if (!source) return null;
	const rawTags = source.tags || source.Tags || [];
	const dangerLevel = source.dangerLevel ?? source.DangerLevel ?? source.severity ?? source.Severity ?? '';
	const model = {
		id: source.id || source.Id || '',
		name: getLocalizedValue(source, 'name') || t('unknown'),
		shortDescription: getLocalizedByFields(source, ['shortDescription', 'subtitle', 'description']),
		description: getLocalizedValue(source, 'description'),
		dangerLevel,
		survivalChance: source.survivalChance ?? source.SurvivalChance ?? '',
		duration: getLocalizedValue(source, 'duration') || '',
		threats: getLocalizedArray(source, 'threats'),
		requirements: getLocalizedArray(source, 'requirements'),
		consequences: getLocalizedArray(source, 'consequences'),
		imageUrl: normalizeLocalScenarioImageUrl(source.imageUrl || source.ImageUrl || source.uploadedImagePath || source.UploadedImagePath),
		tags: Array.isArray(rawTags) ? rawTags : [],
		category: source.category || source.Category || '',
		type: source.type || source.Type || '',
		classification: source.classification || source.Classification || '',
		imageCategory: source.imageCategory || source.ImageCategory || '',
		imageType: source.imageType || source.ImageType || ''
	};
	model.visualVariant = resolveApocalypseVisualVariant(model);
	model.dangerKey = getApocalypseDangerKey(dangerLevel);
	return model;
}

function renderApocalypseIcon(variant) {
	return apocalypseIconSvgRegistry[variant] || apocalypseIconSvgRegistry.generic;
}

function renderApocalypseContentSection(kind, title, items) {
	if (!Array.isArray(items) || !items.length) return '';
	return `<section class="apocalypse-content-card content-${kind}" aria-labelledby="apoc-${kind}-title">
		<h5 id="apoc-${kind}-title" class="apocalypse-content-title"><span aria-hidden="true"></span>${escapeHtml(title)}</h5>
		<ul>${items.map(item => `<li><span aria-hidden="true"></span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>
	</section>`;
}

function renderApocalypseScenario(model) {
	if (!model) return `<p class="apocalypse-empty">${escapeHtml(t('unknown'))}</p>`;
	const variant = model.visualVariant || resolveApocalypseVisualVariant(model);
	const survivalValue = model.survivalChance === '' || model.survivalChance == null
		? t('unknown')
		: `${escapeHtml(model.survivalChance)}${typeof model.survivalChance === 'number' || /^\d+(?:[.,]\d+)?$/.test(String(model.survivalChance)) ? '%' : ''}`;
	const durationValue = model.duration || t('unknown');
	const heroImage = model.imageUrl
		? `<div class="apocalypse-hero-media" aria-hidden="true">
			<img class="apocalypse-hero-image" src="${escapeHtml(model.imageUrl)}" alt="" loading="eager" onerror="handleApocalypseHeroImageError(this)">
		</div>`
		: '';
	const imageButton = model.imageUrl
		? `<button type="button" class="apocalypse-open-image" onclick="openCurrentApocalypseImage()">${escapeHtml(t('apocOpenImage'))}</button>`
		: '';
	const hostControls = isHost ? `<div class="scenario-image-controls apocalypse-image-controls">
		<input type="file" id="apocalypseImageInput" accept="image/*" hidden onchange="uploadApocalypseImage(this)">
		<button type="button" class="btn-scenario-image" onclick="document.getElementById('apocalypseImageInput').click()">${escapeHtml(t('uploadImage'))}</button>
		<button type="button" class="btn-scenario-image btn-generate" onclick="generateApocalypsePrompt()">${escapeHtml(t('generatePrompt'))}</button>
		${model.imageUrl ? `<button type="button" class="btn-scenario-image btn-remove" onclick="removeApocalypseImage()">${escapeHtml(t('remove'))}</button>` : ''}
	</div>` : '';
	const details = model.description && model.description !== model.shortDescription
		? `<p class="apocalypse-footer-description">${escapeHtml(model.description)}</p>` : '';

	return `<article class="scenario-immersive-shell apocalypse-scenario-shell variant-${variant}" aria-labelledby="apocalypse-scenario-title">
		<header class="scenario-immersive-hero apocalypse-hero ${model.imageUrl ? 'has-image' : 'no-image'}">
			${heroImage}
			<div class="apocalypse-hero-overlay" aria-hidden="true"></div>
			<div class="apocalypse-hero-pattern" aria-hidden="true"></div>
			<div class="apocalypse-theme-mark" aria-hidden="true">${renderApocalypseIcon(variant)}</div>
			<div class="apocalypse-hero-content apocalypse-hero-copy">
				<span class="apocalypse-badge">${escapeHtml(t('apocBadge'))}</span>
				<h4 id="apocalypse-scenario-title" class="apocalypse-title">${escapeHtml(model.name)}</h4>
				${model.shortDescription ? `<p class="apocalypse-subtitle">${escapeHtml(model.shortDescription)}</p>` : ''}
			</div>
		</header>
		<section class="apocalypse-metrics" aria-label="${escapeHtml(t('apocBadge'))}">
			<div class="apocalypse-metric metric-danger" data-danger="${model.dangerKey}"><span class="apocalypse-metric-label">${escapeHtml(t('apocDanger'))}</span><strong>${escapeHtml(getApocalypseDangerLabel(model.dangerKey))}</strong></div>
			<div class="apocalypse-metric metric-survival"><span class="apocalypse-metric-label">${escapeHtml(t('survivalChance'))}</span><strong>${survivalValue}</strong></div>
			<div class="apocalypse-metric metric-duration"><span class="apocalypse-metric-label">${escapeHtml(t('duration'))}</span><strong>${escapeHtml(durationValue)}</strong></div>
		</section>
		<div class="apocalypse-content-grid">
			${renderApocalypseContentSection('threats', t('apocMainThreats'), model.threats)}
			${renderApocalypseContentSection('requirements', t('apocSurvivalRequirements'), model.requirements)}
			${renderApocalypseContentSection('consequences', t('apocConsequences'), model.consequences)}
		</div>
		<footer class="apocalypse-footer"><div><span class="apocalypse-footer-kicker">${escapeHtml(t('apocScenarioBrief'))}</span>${details}</div><div class="apocalypse-footer-actions">${imageButton}${hostControls}</div></footer>
	</article>`;
}

function renderApocalypse(apocalypse) {
	const container = document.getElementById('apocalypseContent');
	if (!container) return;
	const panel = document.getElementById('apocalypsePanel');
	const enabled = isLobbyConfiguredSystemEnabled('apocalypseEnabled');
	if (panel) { panel.hidden = !enabled; panel.style.display = enabled ? '' : 'none'; }
	if (!enabled) { container.innerHTML = ''; updateScenarioSectionVisibility(); return; }
	container.innerHTML = renderApocalypseScenario(buildApocalypseScenarioModel(apocalypse));
	updateScenarioSectionVisibility();
}

function handleApocalypseHeroImageError(image) {
	const hero = image?.closest?.('.apocalypse-hero');
	if (!hero) return;
	hero.classList.remove('has-image');
	hero.classList.add('no-image');
	image.closest('.apocalypse-hero-media')?.remove();
}

function openCurrentApocalypseImage() {
	const model = buildApocalypseScenarioModel(currentApocalypse);
	if (model?.imageUrl) openImageModal(model.imageUrl, model.name);
}

// ==================== VOTING FUNCTIONS ====================

function endRound() {
	if (!canEndRoundNow()) {
		addEventMessage('Помилка: раунд можна завершити після reveal усіх активних гравців');
		return;
	}

	if (confirm('Завершити поточний раунд?')) {
		connection.invoke("EndRound")
			.catch(err => console.error("EndRound error:", err));
	}
}

function rollRoundDice() {
	if (!canRollRoundDiceNow()) {
		addEventMessage('Помилка: кубик доступний після reveal усіх активних гравців і тільки один раз за раунд');
		return;
	}

	connection.invoke("RollRoundDice")
		.catch(err => console.error("RollRoundDice error:", err));
}

function markAllPlayersReady() {
	if (!isHost) return;
	connection.invoke("MarkAllPlayersReady")
		.catch(err => console.error("MarkAllPlayersReady error:", err));
}

function submitVotingReadyStatus(status) {
	connection.invoke("SubmitVotingReadyStatus", status)
		.catch(err => console.error("SubmitVotingReadyStatus error:", err));
}

function startVoting() {
	if (!canStartVotingNow()) {
		addEventMessage('Помилка: голосування доступне тільки після завершення 3 раунду та готовності гравців');
		return;
	}

	if (confirm('Почати голосування?')) {
		connection.invoke("StartVoting")
			.catch(err => console.error("StartVoting error:", err));
	}
}

function showVotingPanel(data) {
	document.getElementById('votingRound').textContent = data.round || data.Round || data.roundNumber || data.RoundNumber || getCurrentRoundNumber();
	const votedCount = data.votedCount ?? data.VotedCount ?? 0;
	const totalVoters = data.totalVoters ?? data.TotalVoters ?? data.eligibleVoters ?? data.EligibleVoters ?? 0;
	document.getElementById('votingProgressText').textContent = `${votedCount}/${totalVoters} проголосували`;
	document.getElementById('myVoteStatus').style.display = 'none';
	const blockedVoterIds = data.blockedVoterIds || data.BlockedVoterIds || [];
	const voteMultipliers = data.voteMultipliers || data.VoteMultipliers || {};
	const myStable = getMyStablePlayerId();
	const isMyVoteBlocked = blockedVoterIds.includes(myStable) || blockedVoterIds.includes(myConnectionId);

	// Показуємо кнопки хоста
	document.getElementById('votingHostControls').style.display = isHost ? 'flex' : 'none';

	// Рендеримо кандидатів
	const candidatesContainer = document.getElementById('votingCandidates');
	const candidates = data.candidates || data.Candidates || [];
	const blockedNotice = isMyVoteBlocked
		? '<div class="voting-blocked-notice">Ваш голос заблоковано активованою спеціальною картою. Ви можете бачити перебіг голосування, але не голосуєте.</div>'
		: '';
	candidatesContainer.innerHTML = blockedNotice + candidates.map(c => {
		var badges = '';
		const connectionId = c.connectionId || c.ConnectionId;
		const candidateStableId = c.stablePlayerId || c.StablePlayerId || '';
		const playerName = c.name || c.Name || t('unknown');
		const seatNumber = c.seatNumber ?? c.SeatNumber ?? 0;
		const isProtected = c.isProtected ?? c.IsProtected ?? false;
		const extraVotes = c.extraVotes ?? c.ExtraVotes ?? 0;
		const multiplier = voteMultipliers[candidateStableId] || voteMultipliers[connectionId] || 1;

		if (isProtected) badges += '<span class="badge-protected" title="Захищений від голосування">🛡️</span>';
		if (extraVotes > 0) badges += `<span class="badge-extra-votes" title="Має ${extraVotes} додаткових голосів">+${extraVotes}🗳️</span>`;
		if (multiplier > 1) badges += `<span class="badge-vote-multiplier" title="Голоси проти цього гравця множаться">×${multiplier}</span>`;

		var voteBtn = '';
		if (connectionId === myConnectionId) {
			voteBtn = '<span class="self-label">(Ви)</span>';
		} else if (isMyVoteBlocked) {
			voteBtn = '<span class="blocked-voter-label">Ваш голос заблоковано</span>';
		} else if (isProtected) {
			voteBtn = '<span class="protected-label">Захищений</span>';
		} else {
			voteBtn = `<button class="btn-vote-for" onclick="voteFor('${connectionId}')">Голосувати</button>`;
		}

		return `<div class="voting-candidate ${connectionId === myConnectionId ? 'self-candidate' : ''} ${isProtected ? 'protected-candidate' : ''}"
                 data-connection-id="${connectionId}">
                <span class="candidate-name">${seatNumber ? `#${seatNumber} ` : ''}${escapeHtml(playerName)} ${badges}</span>
                ${voteBtn}
            </div>`;
	}).join('');

	document.getElementById('votingPanel').style.display = 'block';

	// Ховаємо кнопку голосування
	document.getElementById('startVotingBtn').style.display = 'none';
}

function updateVotingCandidates() {
	if (!myVote) return;

	// Позначаємо вибраного кандидата
	document.querySelectorAll('.voting-candidate').forEach(el => {
		const connId = el.dataset.connectionId;
		if (connId === myVote.targetConnectionId) {
			el.classList.add('voted-for');
			const btn = el.querySelector('.btn-vote-for');
			if (btn) btn.textContent = '✓ Ваш голос';
		} else {
			el.classList.remove('voted-for');
			const btn = el.querySelector('.btn-vote-for');
			if (btn) btn.textContent = 'Голосувати';
		}
	});
}

function voteFor(targetConnectionId) {
	connection.invoke("Vote", targetConnectionId)
		.catch(err => console.error("Vote error:", err));
}

function endVotingEarly() {
	if (confirm('Завершити голосування достроково?')) {
		connection.invoke("EndVoting")
			.catch(err => console.error("EndVoting error:", err));
	}
}

function cancelVoting() {
	if (confirm('Скасувати голосування?')) {
		connection.invoke("CancelVoting")
			.catch(err => console.error("CancelVoting error:", err));
	}
}

function showVotingResults(data) {
	const resultsContainer = document.getElementById('votingResultsContent');

	const results = data.results || data.Results || [];
	const nonVoters = data.nonVoters || data.NonVoters || [];
	const effects = data.specialCardEffects || data.SpecialCardEffects || [];
	const roundNumber = data.roundNumber || data.RoundNumber || data.round || data.Round || getCurrentRoundNumber();
	const totalVotes = data.totalVotes ?? data.TotalVotes ?? results.reduce((sum, r) => sum + (r.voteCount ?? r.VoteCount ?? 0), 0);
	const votedCount = data.votedCount ?? data.VotedCount ?? 0;
	const totalVoters = data.totalVoters ?? data.TotalVoters ?? 0;
	const state = data.state || data.State || '';
	const isResolved = state === 'Resolved';

	let resultsHtml = `
            <div class="voting-results-title">
                <span>Результат останнього голосування</span>
                <strong>Результат голосування — Раунд ${escapeHtml(roundNumber)}</strong>
                <small>${votedCount}/${totalVoters} учасників проголосували · ${totalVotes} голосів загалом</small>
            </div>
        `;

	if (results.length === 0) {
		resultsHtml += '<p class="no-votes">Голосів немає.</p>';
	} else {
		resultsHtml += '<div class="voting-results-list detailed">';
		results.forEach((r, i) => {
			const voteCount = r.voteCount ?? r.VoteCount ?? 0;
			const percentage = Number(r.percentage ?? r.Percentage ?? (totalVotes > 0 ? (voteCount * 100 / totalVotes) : 0));
			const seatNumber = r.seatNumber ?? r.SeatNumber ?? 0;
			const playerName = r.playerName || r.PlayerName || t('unknown');
			const voters = r.voters || r.Voters || [];
			const isTop = i === 0;
			const votersText = voters.length > 0
				? voters.map(v => {
					const voterSeat = v.voterSeatNumber ?? v.VoterSeatNumber ?? 0;
					const voterName = v.voterName || v.VoterName || t('unknown');
					const weight = v.voteWeight ?? v.VoteWeight ?? 1;
					const weightLabel = weight > 1 ? ` ×${weight}` : '';
					return `<span class="vote-voter">${voterSeat ? `#${voterSeat} ` : ''}${escapeHtml(voterName)}${weightLabel}</span>`;
				}).join('')
				: '<span class="vote-voter muted">Ніхто</span>';

			resultsHtml += `
                    <div class="vote-result-detailed ${isTop ? 'top-voted' : ''}" data-connection-id="${escapeHtml(r.connectionId || r.ConnectionId || '')}">
                        <div class="vote-result-main">
                            <span class="result-seat">${seatNumber ? `#${seatNumber}` : `#${i + 1}`}</span>
                            <strong class="result-name">${escapeHtml(playerName)}</strong>
                            <span class="result-votes">${voteCount} голосів</span>
                            <span class="result-percent">${percentage.toFixed(1)}%</span>
                        </div>
                        <div class="vote-progress-bar" aria-hidden="true">
                            <span style="width: ${Math.max(0, Math.min(100, percentage))}%"></span>
                        </div>
                        <div class="vote-voters-list">
                            <span class="vote-voters-label">Голосували проти:</span>
                            <div>${votersText}</div>
                        </div>
                    </div>
                `;
		});
		resultsHtml += '</div>';
	}

	if (data.isTie || data.IsTie) {
		resultsHtml += '<p class="tie-warning">Нічия. Ведучий вирішує фінальну дію.</p>';
	}

	resultsHtml += `
            <div class="non-voters-block">
                <h4>Не голосували</h4>
                ${nonVoters.length > 0
			? `<div class="non-voters-list">${nonVoters.map(v => {
				const seat = v.seatNumber ?? v.SeatNumber ?? 0;
				const name = v.voterName || v.VoterName || t('unknown');
				const isBlocked = v.isBlocked ?? v.IsBlocked ?? false;
				const reason = v.reason || v.Reason || '';
				return `<span class="${isBlocked ? 'blocked-non-voter' : ''}">${seat ? `#${seat} ` : ''}${escapeHtml(name)}${reason ? ` — ${escapeHtml(reason)}` : ''}</span>`;
			}).join('')}</div>`
			: '<p>Усі доступні гравці проголосували.</p>'}
            </div>
        `;

	if (effects.length > 0) {
		resultsHtml += `
                <div class="special-effects-block">
                    <h4>Ефекти спеціальних карт</h4>
                    <ul>${effects.map(effect => `<li>${escapeHtml(effect)}</li>`).join('')}</ul>
                </div>
            `;
	}

	resultsContainer.innerHTML = resultsHtml;

	// Показуємо/ховаємо кнопки рішення (тільки для хоста)
	document.getElementById('votingDecisionControls').style.display = isHost && !isResolved ? 'block' : 'none';

	// Оновлюємо кнопку елімінації
	const eliminateBtn = document.getElementById('eliminateTopBtn');
	const topName = data.topVotedPlayerName || data.TopVotedPlayerName;
	const topId = data.topVotedPlayerId || data.TopVotedPlayerId;
	if (topName) {
		eliminateBtn.textContent = `Елімінувати ${topName}`;
		eliminateBtn.dataset.targetId = topId;
	}

	document.getElementById('votingResultsPanel').style.display = 'block';
}

function eliminateTopVoted() {
	const btn = document.getElementById('eliminateTopBtn');
	const targetId = btn.dataset.targetId;

	if (!targetId) {
		alert('Немає кандидата для елімінації');
		return;
	}

	if (confirm('Елімінувати цього гравця?')) {
		connection.invoke("ResolveVoting", targetId)
			.catch(err => console.error("ResolveVoting error:", err));
	}
}

function resolveNoElimination() {
	if (confirm('Нікого не елімінувати?')) {
		connection.invoke("ResolveVoting", null)
			.catch(err => console.error("ResolveVoting error:", err));
	}
}

const bunkerIconSvgRegistry = Object.freeze({
	military: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 53 14v16c0 13-8 23-21 28C19 53 11 43 11 30V14l21-8Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M21 38V26l11-7 11 7v12M27 38v-8h10v8" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	industrial: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 56V26l16 9V25l16 10V16h10v40H8Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M16 46h6m8 0h6m8 0h6M44 8h10" stroke="currentColor" stroke-width="4"/></svg>',
	underground: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M7 55V35C7 18 18 8 32 8s25 10 25 27v20M17 55V35c0-10 6-17 15-17s15 7 15 17v20M6 55h52" fill="none" stroke="currentColor" stroke-width="4"/><path d="M27 55V36h10v19" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	scientific: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M24 7h16M28 7v17L14 50c-2 4 1 7 5 7h26c4 0 7-3 5-7L36 24V7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M21 42h22M25 35h14" stroke="currentColor" stroke-width="3"/><circle cx="31" cy="49" r="2"/></svg>',
	medical: '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="8" y="14" width="48" height="42" rx="5" fill="none" stroke="currentColor" stroke-width="4"/><path d="M24 14V8h16v6M27 25h10v8h8v10h-8v8H27v-8h-8V33h8v-8Z" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	civilian: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m7 30 25-21 25 21M13 27v29h38V27M25 56V39h14v17" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	luxury: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m8 22 10-13 14 13L46 9l10 13-7 34H15L8 22Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M14 29h36M22 43h20" stroke="currentColor" stroke-width="4"/></svg>',
	emergency: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M17 47h30l-3-24c-1-8-6-13-12-13s-11 5-12 13l-3 24ZM10 56h44M8 26H2m60 0h-6M13 9 8 4m43 5 5-5" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	natural: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M7 55h50M13 55V37C13 20 22 9 32 9s19 11 19 28v18M22 55V39c0-9 4-15 10-15s10 6 10 15v16" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 38c-8-8-14 0 0 12 14-12 8-20 0-12Z" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
	remote: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m5 53 16-25 9 12L41 19l18 34H5Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 8a22 22 0 0 1 22 22M32 16a14 14 0 0 1 14 14M32 24a6 6 0 0 1 6 6" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
	damaged: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="m8 29 24-20 24 20v27H8V29Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="m31 10-5 18 10 5-8 23M16 43h8m17 0h7" fill="none" stroke="currentColor" stroke-width="4"/></svg>',
	critical: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6 59 56H5L32 6Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M32 23v17m0 8v2" stroke="currentColor" stroke-width="5" stroke-linecap="round"/></svg>',
	generic: '<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M8 56V24L32 8l24 16v32H8Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M17 34h30M17 43h30M25 56V43h14v13" fill="none" stroke="currentColor" stroke-width="3"/></svg>'
});

function normalizeBunkerMetadataValue(value) {
	return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function resolveBunkerCondition(value) {
	const condition = normalizeBunkerMetadataValue(value);
	const groups = [
		['excellent', 'positive', /^(excellent|відмінний|відмінна|отличный|отличное)$/],
		['good', 'positive', /^(good|хороший|хороша|хорошее)$/],
		['stable', 'neutral', /^(stable|стабільний|стабільна|стабильный|стабильное)$/],
		['worn', 'warning-soft', /^(worn|fair|зношений|зношена|задовільний|изношенный|удовлетворительный)$/],
		['damaged', 'damaged', /^(damaged|пошкоджений|пошкоджена|поврежденный|повреждённый)$/],
		['poor', 'damaged', /^(poor|поганий|погана|плохой|плохое)$/],
		['critical', 'critical', /^(critical|критичний|критична|критический|критическое)$/]
	];
	const match = groups.find(([, , pattern]) => pattern.test(condition));
	return match ? { key: match[0], semantic: match[1] } : { key: 'unknown', semantic: 'neutral' };
}

function getBunkerConditionLabel(key) {
	return t({ excellent: 'conditionExcellent', good: 'conditionGood', stable: 'conditionStable', worn: 'conditionWorn', damaged: 'conditionDamaged', poor: 'conditionPoor', critical: 'conditionCritical' }[key] || 'conditionUnknown');
}

function getBunkerCapacityValue(source, fallback = '') {
	return source?.capacity ?? source?.Capacity ?? fallback;
}

function resolveBunkerVisualVariant(model) {
	if (model?.conditionSemantic === 'critical') return 'critical';
	if (model?.conditionSemantic === 'damaged') return 'damaged';
	const metadata = [
		...(Array.isArray(model?.tags) ? model.tags : []), model?.category, model?.type,
		model?.classification, model?.locationMetadata, model?.imageCategory, model?.imageType
	].map(normalizeBunkerMetadataValue).filter(Boolean).join(' ');
	const rules = [
		['military', /military|tactical|defen[cs]e|security_complex/],
		['scientific', /scientific|research_lab|laboratory|science_facility/],
		['industrial', /industrial|factory|manufacturing|power_plant/],
		['underground', /underground|subterranean|tunnel|mine|cave_bunker/],
		['luxury', /luxury|premium|executive|vip/],
		['emergency', /emergency|temporary_shelter|rapid_response/],
		['remote', /isolated_location|mountain_location|remote|arctic|offshore/],
		['natural', /natural|rural_location|agriculture|forest|cavern|spring/],
		['medical', /medical|hospital|clinic|healthcare/],
		['civilian', /civilian|residential|public_shelter|community/]
	];
	return rules.find(([, pattern]) => pattern.test(metadata))?.[0] || 'generic';
}

function buildBunkerFacilityModel(source) {
	if (!source) return null;
	const rawCondition = source.condition ?? source.Condition ?? '';
	const condition = resolveBunkerCondition(rawCondition);
	const tags = source.bunkerTags || source.BunkerTags || source.tags || source.Tags || [];
	const supplies = source.supplies ?? source.Supplies ?? source.suppliesMonths ?? source.SuppliesMonths ?? '';
	const model = {
		id: source.id || source.Id || '',
		name: getLocalizedValue(source, 'name') || t('unknown'),
		shortDescription: getLocalizedByFields(source, ['shortDescription', 'subtitle', 'description']),
		description: getLocalizedValue(source, 'description'),
		capacity: source.capacity ?? source.Capacity ?? '',
		condition: rawCondition,
		conditionKey: condition.key,
		conditionSemantic: condition.semantic,
		supplies,
		location: getLocalizedValue(source, 'location') || '',
		locationMetadata: source.location || source.Location || '',
		rooms: getLocalizedArray(source, 'rooms').length ? getLocalizedArray(source, 'rooms') : getLocalizedArray(source, 'facilities'),
		resources: getLocalizedArray(source, 'resources'),
		problems: getLocalizedArray(source, 'problems'),
		imageUrl: normalizeLocalScenarioImageUrl(source.imageUrl || source.ImageUrl || source.uploadedImagePath || source.UploadedImagePath),
		tags: Array.isArray(tags) ? tags : [],
		category: source.category || source.Category || '',
		type: source.type || source.Type || '',
		classification: source.classification || source.Classification || '',
		imageCategory: source.imageCategory || source.ImageCategory || '',
		imageType: source.imageType || source.ImageType || ''
	};
	model.visualVariant = resolveBunkerVisualVariant(model);
	return model;
}

function renderBunkerIcon(variant) {
	return bunkerIconSvgRegistry[variant] || bunkerIconSvgRegistry.generic;
}

function renderBunkerSectionIcon(kind) {
	const icons = {
		rooms: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 21V5h16v16M8 9h3v3H8zm5 0h3v3h-3zM8 15h3v3H8zm5 0h3v3h-3z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
		resources: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 8 8-4 8 4-8 4-8-4Zm0 0v8l8 4 8-4V8M12 12v8" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
		problems: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v1" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>'
	};
	return icons[kind] || '';
}

function renderBunkerContentSection(kind, title, items) {
	if (!Array.isArray(items) || !items.length) return '';
	return `<section class="bunker-content-card content-${kind}" aria-labelledby="bunker-${kind}-title">
		<h5 id="bunker-${kind}-title" class="bunker-content-title">${renderBunkerSectionIcon(kind)}<span>${escapeHtml(title)}</span></h5>
		<ul>${items.map(item => `<li><span aria-hidden="true"></span><span>${escapeHtml(item)}</span></li>`).join('')}</ul>
	</section>`;
}

function renderBunkerFacility(model) {
	if (!model) return `<p class="bunker-empty">${escapeHtml(t('unknown'))}</p>`;
	const variant = bunkerIconSvgRegistry[model.visualVariant] ? model.visualVariant : resolveBunkerVisualVariant(model);
	const capacityValue = model.capacity === '' || model.capacity == null ? t('unknown') : model.capacity;
	const suppliesValue = model.supplies === '' || model.supplies == null
		? t('unknown')
		: `${escapeHtml(model.supplies)}${typeof model.supplies === 'number' ? ` ${escapeHtml(t('bunkerMonths'))}` : ''}`;
	const locationValue = model.location || t('unknown');
	const media = model.imageUrl ? `<div class="bunker-hero-media" aria-hidden="true">
		<img class="bunker-hero-image" src="${escapeHtml(model.imageUrl)}" alt="" loading="eager" onerror="handleBunkerHeroImageError(this)">
	</div>` : '';
	const imageButton = model.imageUrl ? `<button type="button" class="bunker-open-image" onclick="openCurrentBunkerImage()">${escapeHtml(t('bunkerOpenImage'))}</button>` : '';
	const hostControls = isHost ? `<div class="scenario-image-controls bunker-image-controls">
		<input type="file" id="bunkerImageInput" accept="image/*" hidden onchange="uploadBunkerImage(this)">
		<button type="button" class="btn-scenario-image" onclick="document.getElementById('bunkerImageInput').click()">${escapeHtml(t('uploadImage'))}</button>
		<button type="button" class="btn-scenario-image btn-generate" onclick="generateBunkerPrompt()">${escapeHtml(t('generatePrompt'))}</button>
		${model.imageUrl ? `<button type="button" class="btn-scenario-image btn-remove" onclick="removeBunkerImage()">${escapeHtml(t('remove'))}</button>` : ''}
	</div>` : '';
	const actions = `${imageButton}${hostControls}`;

	return `<article class="scenario-immersive-shell bunker-facility-shell variant-${variant} condition-${model.conditionSemantic}" aria-labelledby="bunker-facility-title">
		<header class="scenario-immersive-hero bunker-hero ${model.imageUrl ? 'has-image' : 'no-image'}">
			${media}<div class="bunker-hero-overlay" aria-hidden="true"></div><div class="bunker-hero-pattern" aria-hidden="true"></div>
			<div class="bunker-status-medallion" aria-hidden="true"><span class="bunker-status-icon">${renderBunkerIcon(variant)}</span></div>
			<div class="bunker-hero-content">
				<span class="bunker-badge">${escapeHtml(t('bunkerBadge'))}</span>
				<h4 id="bunker-facility-title" class="bunker-title">${escapeHtml(model.name)}</h4>
				${model.shortDescription ? `<p class="bunker-subtitle">${escapeHtml(model.shortDescription)}</p>` : ''}
			</div>
		</header>
		<section class="bunker-metrics" aria-label="${escapeHtml(t('bunkerFacilityRecord'))}">
			<div class="bunker-metric metric-capacity"><span class="bunker-metric-label">${escapeHtml(t('capacity'))}</span><strong>${escapeHtml(capacityValue)}</strong></div>
			<div class="bunker-metric metric-condition"><span class="bunker-metric-label">${escapeHtml(t('condition'))}</span><strong>${escapeHtml(getBunkerConditionLabel(model.conditionKey))}</strong></div>
			<div class="bunker-metric metric-supplies"><span class="bunker-metric-label">${escapeHtml(t('supplies'))}</span><strong>${suppliesValue}</strong></div>
			<div class="bunker-metric metric-location"><span class="bunker-metric-label">${escapeHtml(t('location'))}</span><strong>${escapeHtml(locationValue)}</strong></div>
		</section>
		<div class="bunker-content-grid">
			${renderBunkerContentSection('rooms', t('bunkerRooms'), model.rooms)}
			${renderBunkerContentSection('resources', t('bunkerResources'), model.resources)}
			${renderBunkerContentSection('problems', t('bunkerProblems'), model.problems)}
		</div>
		${actions ? `<footer class="bunker-footer"><span class="bunker-footer-kicker">${escapeHtml(t('bunkerFacilityRecord'))}</span><div class="bunker-footer-actions">${actions}</div></footer>` : ''}
	</article>`;
}

function renderBunker(bunker) {
	const container = document.getElementById('bunkerContent');
	if (!container) return;
	const panel = document.getElementById('bunkerPanel');
	const enabled = isLobbyConfiguredSystemEnabled('bunkerScenarioEnabled');
	if (panel) { panel.hidden = !enabled; panel.style.display = enabled ? '' : 'none'; }
	if (!enabled) { container.innerHTML = ''; updateScenarioSectionVisibility(); return; }
	container.innerHTML = renderBunkerFacility(buildBunkerFacilityModel(bunker));
	updateScenarioSectionVisibility();
}

function handleBunkerHeroImageError(image) {
	const hero = image?.closest?.('.bunker-hero');
	if (!hero) return;
	hero.classList.remove('has-image');
	hero.classList.add('no-image');
	image.closest('.bunker-hero-media')?.remove();
}

function openCurrentBunkerImage() {
	const model = buildBunkerFacilityModel(currentBunker);
	if (model?.imageUrl) openImageModal(model.imageUrl, model.name);
}

// ==================== EVENTS SYSTEM ====================

let currentEvent = null;
let eventsHistory = [];

function showCurrentEvent(event) {
	currentEvent = event;

	const panel = document.getElementById('currentEventPanel');
	const content = document.getElementById('currentEventContent');
	const effectSection = document.getElementById('currentEventEffect');
	const effectText = document.getElementById('currentEventEffectText');
	const timeEl = document.getElementById('currentEventTime');
	const hostControls = document.getElementById('eventHostControls');

	if (!panel || !content) return;

	content.innerHTML = `
            <h3 style="margin-bottom: 0.5rem; color: var(--color-gold);">${event.name || event.Name || 'Подія'}</h3>
            <p>${event.description || event.Description || ''}</p>
        `;

	if (event.effect || event.Effect) {
		const effect = event.effect || event.Effect;
		effectSection.style.display = 'block';
		effectText.textContent = formatEventEffect(effect);
	} else {
		effectSection.style.display = 'none';
	}

	timeEl.textContent = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

	// Показуємо кнопки керування тільки для ведучого
	hostControls.style.display = isHost ? 'flex' : 'none';

	panel.style.display = 'block';
}

function formatEventEffect(effect) {
	if (typeof effect === 'string') return effect;

	// Якщо це об'єкт з полями
	if (effect.type && effect.value) {
		const effectTypes = {
			'addFood': `Додати ${effect.value} місяців їжі`,
			'removeFood': `Забрати ${effect.value} місяців їжі`,
			'addSpace': `Додати ${effect.value} місць`,
			'removeSpace': `Забрати ${effect.value} місць`,
			'addTime': `Додати ${effect.value} місяців часу`,
			'removeTime': `Забрати ${effect.value} місяців часу`,
			'custom': effect.description || effect.value
		};
		return effectTypes[effect.type] || JSON.stringify(effect);
	}

	return JSON.stringify(effect);
}

function applyCurrentEventEffect() {
	if (!currentEvent || !isHost) return;

	if (confirm('Застосувати ефект події?')) {
		connection.invoke("ApplyEventEffect", currentEvent.id || currentEvent.Id)
			.then(() => {
				addEventMessage(`<span class="event-special">Ведучий застосував ефект події: ${currentEvent.name || currentEvent.Name}</span>`);
				dismissCurrentEvent();
			})
			.catch(err => {
				console.error("ApplyEventEffect error:", err);
				alert("Помилка застосування ефекту: " + err.message);
			});
	}
}

function dismissCurrentEvent() {
	if (!currentEvent) return;

	// Додаємо в історію
	eventsHistory.unshift({
		...currentEvent,
		dismissedAt: new Date()
	});

	currentEvent = null;
	document.getElementById('currentEventPanel').style.display = 'none';
}

function addEventToHistory(event, type = 'game') {
	const eventsContainer = document.getElementById('events');
	if (!eventsContainer) return;

	// Прибираємо placeholder якщо є
	const placeholder = eventsContainer.querySelector('p');
	if (placeholder) placeholder.remove();

	const time = new Date().toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

	const eventItem = document.createElement('div');
	eventItem.className = `event-item event-type-${type}`;
	eventItem.innerHTML = `
            <span class="event-time">${time}</span>
            <span class="event-text">${event}</span>
        `;

	eventsContainer.insertBefore(eventItem, eventsContainer.firstChild);

	// Обмежуємо кількість подій у списку
	while (eventsContainer.children.length > 50) {
		eventsContainer.removeChild(eventsContainer.lastChild);
	}
}

// ==================== GAME MASTER FUNCTIONS ====================

function setOmniscientPending(pending) {
	omniscientCommandPending = pending;
	document.querySelectorAll('.omniscient-command').forEach(button => button.disabled = pending || (button.id === 'omniscientEnterButton' && !omniscientPreview?.canApply && !omniscientPreview?.CanApply));
}
async function previewEnterOmniscientGm() {
	if (omniscientCommandPending) return; setOmniscientPending(true); const output = document.getElementById('omniscientPreviewResult');
	try { const key = document.getElementById('omniscientBootstrapKey')?.value || ''; omniscientPreview = await connection.invoke('PreviewEnterOmniscientGm', key); if (output) output.textContent = JSON.stringify(omniscientPreview, null, 2); }
	catch (error) { omniscientPreview = null; if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setOmniscientPending(false); }
}
async function enterOmniscientGm() {
	if (omniscientCommandPending || !(omniscientPreview?.canApply ?? omniscientPreview?.CanApply) || !confirm('Enter spectator GM mode?') || !confirm('This cannot be undone in this room. Confirm again.')) return;
	setOmniscientPending(true); const output = document.getElementById('omniscientPreviewResult');
	try { const key = document.getElementById('omniscientBootstrapKey')?.value || ''; await connection.invoke('EnterOmniscientGm', key, crypto.randomUUID(), true); omniscientPreview = null; if (output) output.textContent = t('omniscientPublicBadge'); }
	catch (error) { if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setOmniscientPending(false); }
}

function clearOmniscientHiddenState() {
	omniscientHiddenState = null;
	omniscientHiddenStateVersion = 0;
	directorPreview = null;
	directorCommandPending = false;
	const tab = document.getElementById('omniscientHiddenTab');
	const section = document.getElementById('omniscientHiddenSection');
	if (tab) tab.style.display = 'none';
	if (section) section.style.display = 'none';
	['omniscientRoomSummary', 'omniscientSecretVotes', 'omniscientHiddenPlayers'].forEach(id => { const element = document.getElementById(id); if (element) element.replaceChildren(); });
}

async function resyncOmniscientHiddenState() {
	const status = document.getElementById('omniscientHiddenStatus');
	if (status) status.textContent = t('omniscientHiddenPending');
	try { await connection.invoke('ResyncOmniscientState'); }
	catch (_) { clearOmniscientHiddenState(); if (status) status.textContent = t('omniscientHiddenError'); }
}

function buildDirectorRequest() {
	return {
		actionType: document.getElementById('directorAction')?.value || '',
		targetPlayerId: document.getElementById('directorTargetPlayer')?.value || null,
		category: document.getElementById('directorCategory')?.value || null,
		option: document.getElementById('directorOption')?.value || null
	};
}
function syncDirectorControls() {
	directorPreview = null; const apply = document.getElementById('directorApplyButton'); if (apply) apply.disabled = true;
	const labels = {
		uk: { reveal: 'Розкрити характеристику', hide: 'Приховати характеристику', reveal_all: 'Розкрити все', hide_all: 'Приховати все', eliminate: 'Елімінувати', restore: 'Відновити', condition_severity: 'Змінити тяжкість стану', condition_remove: 'Видалити стан', pause: 'Пауза', resume: 'Продовжити', round_forward: 'Раунд уперед', reset_readiness: 'Скинути готовність', clear_votes: 'Очистити голоси', remove_vote: 'Видалити голос', voting_resync: 'Синхронізувати голосування', threat_force_success: 'Force success загрози', threat_force_failure: 'Force failure загрози', threat_cancel: 'Скасувати загрозу', threat_restart: 'Перезапустити загрозу', threat_resync: 'Синхронізувати загрозу' },
		en: { reveal: 'Reveal characteristic', hide: 'Hide characteristic', reveal_all: 'Reveal all', hide_all: 'Hide all', eliminate: 'Eliminate', restore: 'Restore', condition_severity: 'Change condition severity', condition_remove: 'Remove condition', pause: 'Pause', resume: 'Resume', round_forward: 'Forward round', reset_readiness: 'Reset readiness', clear_votes: 'Clear votes', remove_vote: 'Remove vote', voting_resync: 'Voting resync', threat_force_success: 'Force threat success', threat_force_failure: 'Force threat failure', threat_cancel: 'Cancel threat', threat_restart: 'Restart threat', threat_resync: 'Threat resync' },
		ru: { reveal: 'Раскрыть характеристику', hide: 'Скрыть характеристику', reveal_all: 'Раскрыть всё', hide_all: 'Скрыть всё', eliminate: 'Исключить', restore: 'Восстановить', condition_severity: 'Изменить тяжесть состояния', condition_remove: 'Удалить состояние', pause: 'Пауза', resume: 'Продолжить', round_forward: 'Раунд вперёд', reset_readiness: 'Сбросить готовность', clear_votes: 'Очистить голоса', remove_vote: 'Удалить голос', voting_resync: 'Синхронизировать голосование', threat_force_success: 'Force success угрозы', threat_force_failure: 'Force failure угрозы', threat_cancel: 'Отменить угрозу', threat_restart: 'Перезапустить угрозу', threat_resync: 'Синхронизировать угрозу' }
	}[getCurrentLanguage()] || {};
	document.querySelectorAll('#directorAction option').forEach(option => { if (labels[option.value]) option.textContent = labels[option.value]; });
	const action = document.getElementById('directorAction')?.value || '';
	const category = document.getElementById('directorCategory');
	if (category) {
		const previous = category.value;
		if (action === 'condition_severity' || action === 'condition_remove') {
			const get = (object, camel, pascal) => object?.[camel] ?? object?.[pascal];
			const targetId = document.getElementById('directorTargetPlayer')?.value;
			const player = (get(omniscientHiddenState, 'players', 'Players') || []).find(item => get(item, 'playerId', 'PlayerId') === targetId);
			const conditions = get(player, 'additionalPhysicalConditions', 'AdditionalPhysicalConditions') || [];
			category.innerHTML = conditions.map(item => `<option value="${escapeHtml(String(get(item, 'conditionId', 'ConditionId') || ''))}">${escapeHtml(String(get(item, 'name', 'Name') || ''))}</option>`).join('');
		} else if (action === 'reveal' || action === 'hide') {
			const characteristics = ['Personality', 'Body', 'Profession', 'PhysicalHealth', 'MentalHealth', 'Hobby', 'CharacterTrait', 'Phobia', 'Inventory', 'Property', 'Fact', 'SpecialCard'];
			category.innerHTML = characteristics.map(key => `<option value="${key}">${escapeHtml(t(key) || key)}</option>`).join('');
		}
		if ([...category.options].some(option => option.value === previous)) category.value = previous;
	}
}
function setDirectorPending(pending) { directorCommandPending = pending; document.querySelectorAll('.director-command').forEach(button => button.disabled = pending || (button.id === 'directorApplyButton' && !directorPreview?.canApply)); }
async function previewDirectorAction() {
	if (directorCommandPending) return; setDirectorPending(true); const output = document.getElementById('directorPreviewResult');
	try { directorPreview = await connection.invoke('PreviewDirectorAction', buildDirectorRequest()); if (output) output.textContent = JSON.stringify(directorPreview, null, 2); }
	catch (error) { directorPreview = null; if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setDirectorPending(false); }
}
async function applyDirectorAction() {
	if (directorCommandPending || !directorPreview?.canApply) return;
	const irreversible = !!directorPreview.irreversibleWarning;
	if (!confirm('Apply director action?') || (irreversible && !confirm('Undo unavailable. Confirm irreversible threat action.'))) return;
	setDirectorPending(true); const output = document.getElementById('directorPreviewResult');
	try { const result = await connection.invoke('ApplyDirectorAction', buildDirectorRequest(), directorPreview.previewToken, directorPreview.currentStateVersion, crypto.randomUUID(), true); directorPreview = null; if (output) output.textContent = result?.applied ? 'Applied' : 'No change'; }
	catch (error) { directorPreview = null; if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setDirectorPending(false); }
}

function renderOmniscientHiddenState() {
	const state = omniscientHiddenState; if (!state) return;
	const get = (object, camel, pascal) => object?.[camel] ?? object?.[pascal];
	const tab = document.getElementById('omniscientHiddenTab'); if (tab) tab.style.display = '';
	const status = document.getElementById('omniscientHiddenStatus'); if (status) status.textContent = `${get(state, 'updatedAtUtc', 'UpdatedAtUtc') || ''}`;
	const summary = document.getElementById('omniscientRoomSummary');
	if (summary) summary.innerHTML = [
		['Round', get(state, 'round', 'Round')], ['Phase', get(state, 'phase', 'Phase')],
		['Players', get(state, 'activeGameplayPlayerCount', 'ActiveGameplayPlayerCount')],
		['Threat', get(get(state, 'currentThreat', 'CurrentThreat'), 'title', 'Title') || '—']
	].map(([label, value]) => `<div class="gm-status-card"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value ?? '—'))}</strong></div>`).join('');
	const query = (document.getElementById('omniscientHiddenSearch')?.value || '').trim().toLocaleLowerCase();
	const players = get(state, 'players', 'Players') || [];
	const targetSelect = document.getElementById('directorTargetPlayer');
	if (targetSelect) { const selected = targetSelect.value; targetSelect.innerHTML = players.filter(player => !get(player, 'isSpectatorGm', 'IsSpectatorGm')).map(player => `<option value="${escapeHtml(String(get(player, 'playerId', 'PlayerId') || ''))}">${escapeHtml(String(get(player, 'displayName', 'DisplayName') || ''))}</option>`).join(''); if ([...targetSelect.options].some(option => option.value === selected)) targetSelect.value = selected; }
	syncDirectorControls();
	const target = document.getElementById('omniscientHiddenPlayers');
	if (target) target.innerHTML = players.filter(player => {
		const searchable = `${get(player, 'displayName', 'DisplayName')} ${(get(player, 'characteristics', 'Characteristics') || []).map(c => `${get(c, 'key', 'Key')} ${get(c, 'value', 'Value')}`).join(' ')}`.toLocaleLowerCase();
		return !query || searchable.includes(query);
	}).map(player => {
		const characteristics = get(player, 'characteristics', 'Characteristics') || [];
		const inventory = get(player, 'inventory', 'Inventory') || [];
		const cards = get(player, 'specialCards', 'SpecialCards') || [];
		const conditions = get(player, 'additionalPhysicalConditions', 'AdditionalPhysicalConditions') || [];
		const rows = characteristics.map(c => { const key = String(get(c, 'key', 'Key') || ''); return `<li><strong>${escapeHtml(t(key) || key)}</strong> <span class="gm-status-badge">${get(c, 'isRevealed', 'IsRevealed') ? t('revealed') : t('hidden')}</span><br>${escapeHtml(String(get(c, 'value', 'Value') || ''))}${get(c, 'description', 'Description') ? `<br><small>${escapeHtml(String(get(c, 'description', 'Description')))}</small>` : ''}</li>`; }).join('');
		return `<details class="gm-threat-audit"><summary>${escapeHtml(String(get(player, 'displayName', 'DisplayName') || ''))} · ${get(player, 'isEliminated', 'IsEliminated') ? 'eliminated' : get(player, 'isSpectatorGm', 'IsSpectatorGm') ? 'spectator' : 'active'}</summary>
                <ul>${rows}</ul>
                <details><summary>${t('inventory')} (${inventory.length})</summary><ul>${inventory.map(i => `<li>${escapeHtml(String(get(i, 'name', 'Name') || ''))} — ${escapeHtml(String(get(i, 'description', 'Description') || ''))}</li>`).join('')}</ul></details>
                <details><summary>${t('specialCards')} (${cards.length})</summary><ul>${cards.map(c => `<li>${escapeHtml(String(get(c, 'name', 'Name') || ''))} — ${escapeHtml(String(get(c, 'description', 'Description') || ''))}</li>`).join('')}</ul></details>
                <details><summary>Additional conditions (${conditions.length})</summary><ul>${conditions.map(c => `<li>${escapeHtml(String(get(c, 'name', 'Name') || ''))} ${escapeHtml(String(get(c, 'severityLevel', 'SeverityLevel') || ''))}</li>`).join('')}</ul></details>
            </details>`;
	}).join('');
	const voting = get(state, 'currentVoting', 'CurrentVoting'); const votes = get(voting, 'secretVotes', 'SecretVotes');
	const votesTarget = document.getElementById('omniscientSecretVotes');
	if (votesTarget) { votesTarget.style.display = Array.isArray(votes) ? '' : 'none'; votesTarget.innerHTML = Array.isArray(votes) ? `<h5>${t('omniscientSecretVotes')}</h5><ul>${votes.map(v => `<li>${escapeHtml(String(get(v, 'voterName', 'VoterName') || ''))} → ${escapeHtml(String(get(v, 'candidateName', 'CandidateName') || ''))}</li>`).join('')}</ul>` : ''; }
}

async function refreshGlobalContentCatalogAccess() {
	const panel = document.getElementById('globalContentCatalog');
	if (!panel) return;
	const roomId = currentRoom?.id || currentRoom?.Id || null;
	if (!isHost || !roomId) {
		panel.style.display = 'none';
		globalCatalogAllowed = false;
		globalCatalogAccessRoomId = null;
		return;
	}
	if (globalCatalogAccessRoomId === roomId) return;
	globalCatalogAccessRoomId = roomId;
	try {
		const access = await connection.invoke('GetGlobalContentCatalogAccess');
		globalCatalogAllowed = access?.allowed === true || access?.Allowed === true;
		panel.style.display = globalCatalogAllowed ? 'block' : 'none';
		if (globalCatalogAllowed) await loadGlobalContentCategories();
	} catch {
		globalCatalogAllowed = false;
		panel.style.display = 'none';
	}
}

async function loadGlobalContentCategories() {
	if (!globalCatalogAllowed) return;
	try {
		globalCatalogMetadata = await connection.invoke('GetGlobalContentCategories') || [];
		const selector = document.getElementById('globalCatalogCategory');
		if (!selector) return;
		selector.replaceChildren(...globalCatalogMetadata.map(metadata => {
			const option = document.createElement('option');
			option.value = metadata.category || metadata.Category;
			option.textContent = option.value;
			return option;
		}));
		await loadGlobalContentPage(1);
		await loadGlobalContentDrafts();
	} catch (error) {
		renderGlobalCatalogError(error);
	}
}

async function loadGlobalContentPage(page) {
	if (!globalCatalogAllowed) return;
	const category = document.getElementById('globalCatalogCategory')?.value;
	if (!category) return;
	const search = document.getElementById('globalCatalogSearch')?.value || '';
	try {
		const data = await connection.invoke('GetGlobalContentEntries', category, page, 25, search);
		globalCatalogPage = data.page ?? data.Page ?? 1;
		globalCatalogTotal = data.totalEntries ?? data.TotalEntries ?? 0;
		renderGlobalContentPage(data);
	} catch (error) {
		renderGlobalCatalogError(error);
	}
}

function renderGlobalContentPage(data) {
	const metadata = data.metadata || data.Metadata || {};
	const metadataPanel = document.getElementById('globalCatalogMetadata');
	if (metadataPanel) {
		metadataPanel.replaceChildren();
		const values = [
			`${metadata.category || metadata.Category}: ${metadata.entryCount ?? metadata.EntryCount ?? 0}`,
			`${t('globalCatalogSchema')}: ${metadata.schemaStatus || metadata.SchemaStatus}`,
			`${t('globalCatalogStableIds')}: ${metadata.stableIdStatus || metadata.StableIdStatus}`,
			`${t('globalCatalogLocalization')}: ${metadata.localizationStatus || metadata.LocalizationStatus}`
		];
		values.forEach(value => { const badge = document.createElement('span'); badge.className = 'global-catalog-badge'; badge.textContent = value; metadataPanel.appendChild(badge); });
	}
	const entriesPanel = document.getElementById('globalCatalogEntries');
	if (entriesPanel) {
		entriesPanel.replaceChildren();
		(data.entries || data.Entries || []).forEach(entry => {
			const button = document.createElement('button');
			button.type = 'button';
			button.className = 'global-catalog-entry';
			button.textContent = `${entry.displayName || entry.DisplayName} ${entry.summary || entry.Summary || ''}`.trim();
			const stableId = entry.stableId || entry.StableId;
			button.disabled = !stableId;
			if (stableId) button.addEventListener('click', () => loadGlobalContentEntry(stableId));
			entriesPanel.appendChild(button);
		});
	}
	const pageLabel = document.getElementById('globalCatalogPage');
	if (pageLabel) pageLabel.textContent = `${globalCatalogPage} · ${globalCatalogTotal}`;
	const previous = document.getElementById('globalCatalogPrevious');
	const next = document.getElementById('globalCatalogNext');
	if (previous) previous.disabled = globalCatalogPage <= 1;
	if (next) next.disabled = globalCatalogPage * 25 >= globalCatalogTotal;
}

async function loadGlobalContentEntry(stableId) {
	const category = document.getElementById('globalCatalogCategory')?.value;
	if (!globalCatalogAllowed || !category) return;
	try {
		const entry = await connection.invoke('GetGlobalContentEntry', category, stableId);
		const details = document.getElementById('globalCatalogDetails');
		if (details) details.textContent = Object.entries(entry.fields || entry.Fields || {}).map(([key, value]) => `${key}: ${value}`).join('\n');
	} catch (error) { renderGlobalCatalogError(error); }
}

function changeGlobalContentPage(delta) { loadGlobalContentPage(Math.max(1, globalCatalogPage + delta)); }
function scheduleGlobalContentSearch() {
	clearTimeout(globalCatalogSearchTimer);
	globalCatalogSearchTimer = setTimeout(() => loadGlobalContentPage(1), 250);
}
function renderGlobalCatalogError(error) {
	const details = document.getElementById('globalCatalogDetails');
	if (details) details.textContent = error?.message || t('unavailableNow');
}

function setGlobalDraftPending(pending) {
	globalDraftPending = pending;
	document.querySelectorAll('.global-draft-command').forEach(button => button.disabled = pending);
	if (!pending) {
		const execute = document.getElementById('globalRollbackExecute');
		if (execute) execute.disabled = !(globalRollbackPreview?.canRollback ?? globalRollbackPreview?.CanRollback);
		const migrationApply = document.getElementById('globalMigrationApply');
		if (migrationApply) migrationApply.disabled = !(globalMigrationPreview?.canApply ?? globalMigrationPreview?.CanApply);
		renderGlobalDraftState();
	}
}
function selectedGlobalDraftId() { return document.getElementById('globalDraftSelect')?.value || ''; }
async function loadGlobalContentDrafts() {
	if (!globalCatalogAllowed) return;
	globalDrafts = await connection.invoke('GetGlobalContentDrafts');
	const select = document.getElementById('globalDraftSelect'); if (!select) return;
	const selected = select.value; select.replaceChildren(...globalDrafts.map(draft => { const option = document.createElement('option'); option.value = draft.draftId || draft.DraftId; option.textContent = `${draft.category || draft.Category} · ${draft.status || draft.Status}`; return option; }));
	if (globalDrafts.some(draft => (draft.draftId || draft.DraftId) === selected)) select.value = selected;
	renderGlobalDraftState();
}
function renderGlobalDraftState() {
	const id = selectedGlobalDraftId(); const draft = globalDrafts.find(x => (x.draftId || x.DraftId) === id); const status = document.getElementById('globalDraftStatus');
	if (status) status.textContent = draft ? `${draft.status || draft.Status} · ${draft.entryCount ?? draft.EntryCount} · ${draft.expiresAtUtc || draft.ExpiresAtUtc}` : '';
	const category = document.getElementById('globalCatalogCategory')?.value; const blocked = ['hobbies', 'character_traits'].includes(category); const warning = document.getElementById('globalDraftBlocked');
	if (warning) warning.textContent = blocked ? 'BlockedMissingStableIds' : '';
	const create = document.getElementById('globalDraftCreate'); if (create) create.disabled = globalDraftPending || blocked;
	const migration = document.getElementById('globalStableIdMigration'); if (migration) migration.style.display = blocked ? 'block' : 'none';
	const commit = document.getElementById('globalDraftCommit'); if (commit) commit.disabled = globalDraftPending || !draft || (draft.status || draft.Status) !== 'Validated';
}
async function runGlobalDraftCommand(action) {
	if (globalDraftPending) return; setGlobalDraftPending(true); const result = document.getElementById('globalDraftResult');
	try { const value = await action(); if (result) result.textContent = JSON.stringify(value, null, 2); await loadGlobalContentDrafts(); }
	catch (error) { if (result) result.textContent = error?.message || t('unavailableNow'); }
	finally { setGlobalDraftPending(false); renderGlobalDraftState(); }
}
function createGlobalContentDraft() { const category = document.getElementById('globalCatalogCategory')?.value; if (category) runGlobalDraftCommand(() => connection.invoke('CreateGlobalContentDraft', category, crypto.randomUUID())); }
function applyGlobalDraftCommand() {
	const draftId = selectedGlobalDraftId(); const category = globalDrafts.find(x => (x.draftId || x.DraftId) === draftId)?.category; const type = document.getElementById('globalDraftOperation')?.value; const entryId = document.getElementById('globalDraftEntryId')?.value.trim();
	if (!draftId || !entryId) return; const fields = {}; const name = document.getElementById('globalDraftName')?.value.trim(); const description = document.getElementById('globalDraftDescription')?.value.trim(); const nameField = category === 'professions' ? 'profession' : category === 'items' ? 'item' : category === 'facts' ? 'fact' : 'name'; if (name) fields[nameField] = name; if (description) fields.description = description;
	const deleting = type === 'DeleteEntry'; if (deleting && !confirm('Delete entry from draft?')) return;
	runGlobalDraftCommand(() => connection.invoke('ApplyGlobalContentDraftCommand', { draftId, category, type, entryId, fields: deleting ? null : fields, confirmDelete: deleting, commandId: crypto.randomUUID() }));
}
function validateGlobalDraft() { const id = selectedGlobalDraftId(); if (id) runGlobalDraftCommand(() => connection.invoke('ValidateGlobalContentDraft', id)); }
function previewGlobalDraftDiff() { const id = selectedGlobalDraftId(); if (id) runGlobalDraftCommand(() => connection.invoke('PreviewGlobalContentDraftDiff', id, 1, 100)); }
function discardGlobalDraft() { const id = selectedGlobalDraftId(); if (id && confirm('Discard draft?')) runGlobalDraftCommand(() => connection.invoke('DiscardGlobalContentDraft', id, crypto.randomUUID())); }
async function commitGlobalDraft() {
	const id = selectedGlobalDraftId(); if (!id || globalDraftPending) return;
	setGlobalDraftPending(true); const output = document.getElementById('globalDraftResult');
	try {
		const diff = await connection.invoke('PreviewGlobalContentDraftDiff', id, 1, 100);
		if (!confirm(`Commit draft? +${diff.addedCount ?? diff.AddedCount} ~${diff.updatedCount ?? diff.UpdatedCount} -${diff.deletedCount ?? diff.DeletedCount}`)) return;
		const result = await connection.invoke('CommitGlobalContentDraft', id, crypto.randomUUID()); if (output) output.textContent = JSON.stringify(result, null, 2);
		await loadGlobalContentDrafts(); await loadGlobalContentBackups();
	} catch (error) { if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setGlobalDraftPending(false); renderGlobalDraftState(); }
}
async function loadGlobalContentBackups() {
	if (!globalCatalogAllowed) return; const category = document.getElementById('globalCatalogCategory')?.value; if (!category) return;
	try { const backups = await connection.invoke('GetGlobalContentBackups', category); const select = document.getElementById('globalBackupSelect'); if (select) select.replaceChildren(...backups.map(backup => { const option = document.createElement('option'); option.value = backup.backupId || backup.BackupId; option.textContent = `${backup.sourceVersion ?? backup.SourceVersion} · ${backup.createdAtUtc || backup.CreatedAtUtc} · ${backup.actorId || backup.ActorId} · ${backup.reason || backup.Reason}`; return option; })); }
	catch (error) { const result = document.getElementById('globalRollbackResult'); if (result) result.textContent = error?.message || t('unavailableNow'); }
}
async function previewGlobalRollback() {
	if (globalDraftPending) return; const category = document.getElementById('globalCatalogCategory')?.value; const backupId = document.getElementById('globalBackupSelect')?.value; if (!category || !backupId) return;
	setGlobalDraftPending(true); try { globalRollbackPreview = await connection.invoke('PreviewGlobalContentRollback', category, backupId); const result = document.getElementById('globalRollbackResult'); if (result) result.textContent = JSON.stringify(globalRollbackPreview, null, 2); const execute = document.getElementById('globalRollbackExecute'); if (execute) execute.disabled = !(globalRollbackPreview.canRollback ?? globalRollbackPreview.CanRollback); } finally { setGlobalDraftPending(false); }
}
async function executeGlobalRollback() {
	if (!globalRollbackPreview || globalDraftPending || !confirm('Rollback global content?') || !confirm('Confirm destructive rollback again.')) return;
	const category = globalRollbackPreview.category || globalRollbackPreview.Category; const backupId = globalRollbackPreview.backupId || globalRollbackPreview.BackupId; const token = globalRollbackPreview.previewToken || globalRollbackPreview.PreviewToken;
	await runGlobalDraftCommand(() => connection.invoke('RollbackGlobalContent', category, backupId, token, true, crypto.randomUUID())); globalRollbackPreview = null; await loadGlobalContentBackups();
}
async function previewStableIdMigration() {
	if (globalDraftPending) return; const category = document.getElementById('globalCatalogCategory')?.value; if (!['hobbies', 'character_traits'].includes(category)) return;
	setGlobalDraftPending(true); const output = document.getElementById('globalMigrationResult');
	try { globalMigrationPreview = await connection.invoke('PreviewStableIdMigration', category, 1, 100); if (output) output.textContent = JSON.stringify(globalMigrationPreview, null, 2); const apply = document.getElementById('globalMigrationApply'); if (apply) apply.disabled = !(globalMigrationPreview.canApply ?? globalMigrationPreview.CanApply); }
	catch (error) { if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setGlobalDraftPending(false); const apply = document.getElementById('globalMigrationApply'); if (apply) apply.disabled = !(globalMigrationPreview?.canApply ?? globalMigrationPreview?.CanApply); }
}
async function applyStableIdMigration() {
	if (!globalMigrationPreview || globalDraftPending || !confirm('Apply stable IDs to canonical JSON?') || !confirm('Only missing id fields will be added. Confirm again.')) return;
	const category = globalMigrationPreview.category || globalMigrationPreview.Category; const token = globalMigrationPreview.previewToken || globalMigrationPreview.PreviewToken; const output = document.getElementById('globalMigrationResult'); setGlobalDraftPending(true);
	try { const result = await connection.invoke('ApplyStableIdMigration', category, token, true, crypto.randomUUID()); if (output) output.textContent = JSON.stringify(result, null, 2); globalMigrationPreview = null; await loadGlobalContentCategories(); await loadGlobalContentBackups(); }
	catch (error) { if (output) output.textContent = error?.message || t('unavailableNow'); }
	finally { setGlobalDraftPending(false); }
}

function toggleGMPanel() {
	const panel = document.getElementById('gmPanel');
	const isVisible = panel.style.display !== 'none';
	panel.style.display = isVisible ? 'none' : 'flex';

	if (!isVisible && isHost) {
		// Завантажуємо дані гравців при відкритті панелі
		connection.invoke("GetAllPlayersData").catch(err => console.error(err));
		connection.invoke("GetGMThreatControlData").catch(err => console.error(err));
		connection.invoke("ResyncVotingState").catch(err => console.error(err));
		connection.invoke("RunRoomIntegrityCheck", getCurrentLanguage()).catch(err => console.error(err));
		connection.invoke("GetGmAuditLog").catch(err => console.error(err));
		connection.invoke("GetRoomSnapshots").catch(err => console.error(err));
		connection.invoke("GetRoomLocalEditorData").catch(err => console.error(err));
		renderGMPanelState();
	}
}

function setGmDiagnosticsPending(pending) {
	gmDiagnosticsPending = pending;
	document.querySelectorAll('.gm-diagnostics-command').forEach(button => {
		button.disabled = pending || (button.id === 'gmApplyAutoFix' && !gmAutoFixPreview?.hasChanges);
	});
}

function diagnosticsCommand(method, args = []) {
	if (gmDiagnosticsPending) return;
	setGmDiagnosticsPending(true);
	const feedback = document.getElementById('gmDiagnosticsFeedback');
	if (feedback) feedback.textContent = '';
	connection.invoke(method, ...args).catch(error => {
		setGmDiagnosticsPending(false);
		if (feedback) feedback.textContent = error?.message || t('unavailableNow');
	});
}

function runRoomIntegrityCheck() {
	diagnosticsCommand('RunRoomIntegrityCheck', [getCurrentLanguage()]);
}

function previewRoomAutoFix() {
	gmAutoFixPreview = null;
	diagnosticsCommand('PreviewRoomAutoFix', [getCurrentLanguage()]);
}

function applyRoomAutoFix() {
	if (gmDiagnosticsPending || !gmAutoFixPreview?.hasChanges || !confirm(t('gmAutoFixConfirm'))) return;
	diagnosticsCommand('ApplyRoomAutoFix', [gmRoundCommandId(), true, getCurrentLanguage()]);
}

function refreshGmAudit() {
	diagnosticsCommand('GetGmAuditLog');
}

function setGmSnapshotPending(pending) {
	gmSnapshotCommandPending = pending;
	document.querySelectorAll('.gm-snapshot-command').forEach(button => button.disabled = pending);
	document.querySelectorAll('[data-snapshot-action]').forEach(button => button.disabled = pending || button.dataset.snapshotBlocked === 'true');
}

function invokeSnapshotCommand(method, args = []) {
	if (gmSnapshotCommandPending) return;
	setGmSnapshotPending(true);
	const feedback = document.getElementById('gmSnapshotFeedback');
	if (feedback) feedback.textContent = '';
	connection.invoke(method, ...args).catch(error => {
		setGmSnapshotPending(false);
		if (feedback) feedback.textContent = error?.message || t('unavailableNow');
	});
}

function refreshRoomSnapshots() {
	invokeSnapshotCommand('GetRoomSnapshots');
}

function createManualRoomSnapshot() {
	const reason = (document.getElementById('gmSnapshotReason')?.value || '').trim().slice(0, 120);
	invokeSnapshotCommand('CreateManualRoomSnapshot', [reason, gmRoundCommandId()]);
}

function previewRoomSnapshot(snapshotId) {
	gmSnapshotRestorePreview = null;
	invokeSnapshotCommand('PreviewRoomSnapshotRestore', [snapshotId]);
}

function restoreRoomSnapshot(snapshotId) {
	const previewId = gmSnapshotRestorePreview?.snapshot?.snapshotId || gmSnapshotRestorePreview?.snapshot?.SnapshotId;
	if (gmSnapshotCommandPending || previewId !== snapshotId || !gmSnapshotRestorePreview?.canRestore) return;
	if (!confirm(t('gmSnapshotConfirm'))) return;
	const active = String(currentRoundState?.roomState || currentRoom?.state || '').toLowerCase() === 'playing';
	if (active && !confirm(t('gmSnapshotActiveConfirm'))) return;
	invokeSnapshotCommand('RestoreRoomSnapshot', [snapshotId, gmRoundCommandId(), true, active]);
}

function undoLastGmAction() {
	if (gmSnapshotCommandPending || !confirm(t('gmUndoLastAction'))) return;
	invokeSnapshotCommand('UndoLastGmAction', [gmRoundCommandId()]);
}

function setRoomLocalEditorPending(pending) {
	gmRoomLocalEditorPending = pending;
	document.querySelectorAll('.gm-editor-command').forEach(button => button.disabled = pending || (button.id === 'gmEditorApplyButton' && !gmRoomLocalEditPreview?.canApply));
}

function currentRoomLocalEditorSelection() {
	return {
		category: document.getElementById('gmEditorCategory')?.value || 'bunker',
		target: document.getElementById('gmEditorPlayer')?.value || null,
		field: document.getElementById('gmEditorField')?.value || '',
		value: document.getElementById('gmEditorValue')?.value || ''
	};
}

function previewRoomLocalEdit() {
	if (gmRoomLocalEditorPending) return;
	const selection = currentRoomLocalEditorSelection();
	setRoomLocalEditorPending(true);
	connection.invoke('PreviewRoomLocalEdit', selection.category, selection.target, selection.field, selection.value).catch(error => {
		setRoomLocalEditorPending(false);
		const feedback = document.getElementById('gmEditorFeedback'); if (feedback) feedback.textContent = error?.message || t('unavailableNow');
	});
}

function applyRoomLocalEdit() {
	const selection = currentRoomLocalEditorSelection();
	if (gmRoomLocalEditorPending || !gmRoomLocalEditPreview?.canApply || gmRoomLocalEditPreview.fieldId !== selection.field || !confirm(t('gmEditorApply'))) return;
	setRoomLocalEditorPending(true);
	connection.invoke('ApplyRoomLocalEdit', selection.category, selection.target, selection.field, selection.value, gmRoundCommandId()).catch(error => {
		setRoomLocalEditorPending(false);
		const feedback = document.getElementById('gmEditorFeedback'); if (feedback) feedback.textContent = error?.message || t('unavailableNow');
	});
}

function renderRoomLocalEditor() {
	const category = document.getElementById('gmEditorCategory');
	const players = document.getElementById('gmEditorPlayer');
	const fields = document.getElementById('gmEditorField');
	if (!category || !players || !fields) return;
	const previousPlayer = players.value, previousField = fields.value;
	players.innerHTML = gmRoomLocalEditorData.players.map(player => `<option value="${escapeHtml(player.playerId || player.PlayerId)}">${escapeHtml(player.name || player.Name)}</option>`).join('');
	if ([...players.options].some(option => option.value === previousPlayer)) players.value = previousPlayer;
	players.style.display = category.value === 'player' ? '' : 'none';
	const player = gmRoomLocalEditorData.players.find(item => (item.playerId || item.PlayerId) === players.value);
	const available = category.value === 'bunker' ? gmRoomLocalEditorData.bunkerFields : category.value === 'apocalypse' ? gmRoomLocalEditorData.apocalypseFields : (player?.fields || player?.Fields || []);
	fields.innerHTML = available.map(field => `<option value="${escapeHtml(field.fieldId || field.FieldId)}">${escapeHtml(field.label || field.Label)}</option>`).join('');
	if ([...fields.options].some(option => option.value === previousField)) fields.value = previousField;
	gmRoomLocalEditPreview = null;
	syncRoomLocalEditorField();
}

function syncRoomLocalEditorField() {
	const selection = currentRoomLocalEditorSelection();
	const player = gmRoomLocalEditorData.players.find(item => (item.playerId || item.PlayerId) === selection.target);
	const available = selection.category === 'bunker' ? gmRoomLocalEditorData.bunkerFields : selection.category === 'apocalypse' ? gmRoomLocalEditorData.apocalypseFields : (player?.fields || player?.Fields || []);
	const field = available.find(item => (item.fieldId || item.FieldId) === selection.field);
	const current = document.getElementById('gmEditorCurrent'); if (current) current.value = field?.currentPublicValue || field?.CurrentPublicValue || '';
	const value = document.getElementById('gmEditorValue'); if (value) { value.value = ''; value.maxLength = field?.maxLength || field?.MaxLength || 80; }
	const apply = document.getElementById('gmEditorApplyButton'); if (apply) apply.disabled = true;
}

function gmRoundCommandId() {
	return globalThis.crypto?.randomUUID?.() || `gm-round-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setGmRoundCommandPending(pending) {
	gmRoundCommandPending = pending;
	document.querySelectorAll('.gm-round-command').forEach(button => button.disabled = pending || button.dataset.permanentlyDisabled === 'true');
}

function finishGmRoundCommand(message) {
	setGmRoundCommandPending(false);
	const result = document.getElementById('gmRoundCommandResult');
	if (result && message) result.textContent = message;
}

function handleGmRoundCommandError(error) {
	finishGmRoundCommand(error?.message || t('unavailableNow'));
}

function invokeGmRoundCommand(method, args = []) {
	if (gmRoundCommandPending) return;
	setGmRoundCommandPending(true);
	connection.invoke(method, ...args, gmRoundCommandId()).catch(handleGmRoundCommandError);
}

function setGamePause(paused) {
	const reason = document.getElementById('gmPauseReason')?.value || '';
	invokeGmRoundCommand('SetGamePaused', [paused, reason]);
}

function previewManualRoundChange() {
	if (gmRoundCommandPending) return;
	const raw = document.getElementById('gmManualRound')?.value?.trim() || '';
	if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 99) {
		finishGmRoundCommand(t('gmCapacityInvalid'));
		return;
	}
	setGmRoundCommandPending(true);
	connection.invoke('PreviewRoundChange', raw).catch(handleGmRoundCommandError);
}

function resetRoundReadiness() {
	if (confirm(t('gmResetReadiness'))) invokeGmRoundCommand('ResetRoundReadiness');
}

function clearCurrentVotes() {
	if (confirm(t('gmClearVotes'))) invokeGmRoundCommand('ClearCurrentVotes');
}

function removeSelectedVote() {
	const voterId = document.getElementById('gmRemoveVoterSelect')?.value;
	if (voterId && confirm(t('gmRemoveVote'))) invokeGmRoundCommand('RemoveCurrentVote', [voterId]);
}

function resyncVotingAdmin() {
	if (gmRoundCommandPending) return;
	setGmRoundCommandPending(true);
	connection.invoke('ResyncVotingState').catch(handleGmRoundCommandError);
}

function gameTimerDurationValue() {
	const minutes = Number(document.getElementById('gmTimerMinutes')?.value || 0);
	const seconds = Number(document.getElementById('gmTimerSeconds')?.value || 0);
	if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || minutes > 120 || seconds < 0 || seconds > 59) return null;
	const total = minutes * 60 + seconds;
	return total >= 10 && total <= 7200 ? String(total) : null;
}

function gameTimerCommandId() {
	return globalThis.crypto?.randomUUID?.() || `gm-timer-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function invokeGameTimerCommand(method, args = []) {
	if (gameTimerCommandPending) return;
	gameTimerCommandPending = true;
	document.querySelectorAll('.gm-timer-command').forEach(button => button.disabled = true);
	const feedback = document.getElementById('gmTimerFeedback');
	if (feedback) feedback.textContent = '';
	connection.invoke(method, ...args, gameTimerCommandId()).catch(error => {
		gameTimerCommandPending = false;
		if (feedback) feedback.textContent = error?.message || t('unavailableNow');
		renderGameTimer();
	});
}

function startGameTimer() {
	const duration = gameTimerDurationValue();
	if (!duration) { const feedback = document.getElementById('gmTimerFeedback'); if (feedback) feedback.textContent = '10..7200'; return; }
	invokeGameTimerCommand('StartGameTimer', [duration, document.getElementById('gmTimerPurpose')?.value || 'Round', document.getElementById('gmTimerLabel')?.value || '']);
}

function setGameTimer() {
	const duration = gameTimerDurationValue();
	if (!duration) { const feedback = document.getElementById('gmTimerFeedback'); if (feedback) feedback.textContent = '10..7200'; return; }
	invokeGameTimerCommand('SetGameTimer', [duration]);
}

function adjustGameTimer(delta) { invokeGameTimerCommand('AdjustGameTimer', [delta]); }

function restartGameTimer() {
	if (currentGameTimer?.status?.toLowerCase() === 'running' && !confirm(t('gmTimerRestart'))) return;
	invokeGameTimerCommand('RestartGameTimer');
}

function stopGameTimer() {
	if (currentGameTimer?.status?.toLowerCase() !== 'stopped' && !confirm(t('gmTimerStop'))) return;
	invokeGameTimerCommand('StopGameTimer');
}

function handleGameTimerKeydown(event) {
	if (event.key === 'Enter') { event.preventDefault(); startGameTimer(); }
}

function renderGmVotingAdmin() {
	const select = document.getElementById('gmRemoveVoterSelect');
	if (select) select.innerHTML = `<option value="">—</option>` + gmVotingAdminState.eligibleVoters.map(voter => {
		const id = voter.playerId || voter.PlayerId || voter.connectionId || voter.ConnectionId;
		return `<option value="${escapeHtml(id)}">${escapeHtml(voter.name || voter.Name || '')}</option>`;
	}).join('');
	const list = document.getElementById('gmNonVotersList');
	if (list) list.innerHTML = gmVotingAdminState.nonVoters.map(voter =>
		`<div>${escapeHtml(voter.name || voter.Name || '')}</div>`).join('');
}

function switchGMTab(tab) {
	activeGMTab = ['state', 'round', 'threat', 'content', 'diagnostics', 'omniscient'].includes(tab) ? tab : 'state';
	renderGMTabsVisibility();
	renderGMPanelState();
}

function renderGMTabsVisibility() {
	document.querySelectorAll('[data-gm-tab]').forEach(section => {
		const active = section.dataset.gmTab === activeGMTab;
		if (section.id === 'gmPlayerInfo') section.style.display = active && selectedPlayerForGM ? 'block' : 'none';
		else if (section.dataset.gmTab === 'omniscient') section.style.display = active && !!omniscientHiddenState ? 'block' : 'none';
		else section.style.display = active && isHost ? 'block' : 'none';
	});
	document.querySelectorAll('[data-gm-tab-button]').forEach(button => {
		button.classList.toggle('active', button.dataset.gmTabButton === activeGMTab);
	});
}

function markGMServerUpdate() {
	gmLastServerUpdateAt = new Date();
	renderGMPanelState();
}

function renderGMPanelState() {
	document.querySelectorAll('[data-gm-i18n]').forEach(element => {
		element.textContent = t(element.dataset.gmI18n);
	});
	document.querySelectorAll('[data-gm-i18n-placeholder]').forEach(element => {
		element.placeholder = t(element.dataset.gmI18nPlaceholder);
	});
	const round = getCurrentRoundNumber();
	const capacityInput = document.getElementById('gmBunkerCapacity');
	if (capacityInput && !bunkerCapacityPending && currentBunker?.capacity != null) {
		currentBunkerCapacity = currentBunker.capacity;
		capacityInput.value = currentBunker.capacity;
	}
	const phase = getPhaseLabel(getCurrentPhase());
	const players = Object.values(roomPlayers || {});
	const activePlayers = players.filter(player => !(player.isEliminated || player.IsEliminated));
	const connectedPlayers = activePlayers.filter(player => player.isConnected ?? player.IsConnected ?? true);
	const threatName = currentThreat ? getLocalizedValue(currentThreat, 'name') || currentThreat.name || currentThreat.Name : '—';
	const interactionStatus = currentThreatState ? getThreatStatusLabel(currentThreatState.threatStatus) : '—';
	const stateSummary = document.getElementById('gmGameStateSummary');
	if (stateSummary) stateSummary.innerHTML = [
		['Кімната', currentRoom?.name || currentRoom?.Name || '—'],
		['Раунд', round], ['Етап', phase], ['Активні гравці', activePlayers.length],
		['Готовність', `${currentRoundState?.revealedCount ?? 0}/${currentRoundState?.activePlayerCount ?? activePlayers.length}`],
		['Поточна загроза', threatName], ['Interaction status', interactionStatus]
	].map(([label, value]) => `<div class="gm-status-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join('');
	renderRoomDiagnostics();
	const error = document.getElementById('gmLastCommandError');
	if (error) {
		error.textContent = gmLastCommandError;
		error.style.display = gmLastCommandError ? 'block' : 'none';
	}
	renderRoomSnapshots();
	renderUnifiedGmAudit();
}

function renderGMThreatControl() {
	const current = document.getElementById('gmThreatCurrent');
	const select = document.getElementById('gmThreatSelect');
	const specificControls = document.getElementById('gmSpecificThreatControls');
	if (specificControls) specificControls.style.display = gmThreatControlData.canBrowseFutureThreatCatalog ? '' : 'none';
	if (current) {
		const threat = gmThreatControlData.currentThreat;
		current.textContent = threat
			? `${threat.name || threat.Name} — ${getThreatStatusLabel(threat.status || threat.Status || '—')}`
			: 'Поточна загроза відсутня';
	}
	if (select) {
		const previous = select.value;
		select.innerHTML = gmThreatControlData.threats.map(threat => {
			const id = threat.id || threat.Id;
			const name = threat.name || threat.Name;
			const type = threat.type || threat.Type || 'text';
			const available = threat.available ?? threat.Available ?? true;
			return `<option value="${escapeHtml(id)}" data-search="${escapeHtml(`${name} ${id} ${type}`.toLowerCase())}" ${available ? '' : 'disabled'}>${escapeHtml(name)} — ${escapeHtml(type)}</option>`;
		}).join('');
		if ([...select.options].some(option => option.value === previous)) select.value = previous;
	}
	const currentThreat = gmThreatControlData.currentThreat;
	const canRecover = currentThreat?.canRecoverAttempt ?? currentThreat?.CanRecoverAttempt ?? false;
	const canForce = currentThreat?.canForceOutcome ?? currentThreat?.CanForceOutcome ?? false;
	const hasThreat = !!currentThreat;
	const resync = document.getElementById('gmThreatResync');
	const reset = document.getElementById('gmThreatReset');
	const abort = document.getElementById('gmThreatAbort');
	const forceSuccess = document.getElementById('gmThreatForceSuccess');
	const forceFailure = document.getElementById('gmThreatForceFailure');
	if (resync) resync.style.display = hasThreat ? '' : 'none';
	if (reset) reset.style.display = canRecover ? '' : 'none';
	if (abort) abort.style.display = canRecover ? '' : 'none';
	if (forceSuccess) forceSuccess.style.display = canForce ? '' : 'none';
	if (forceFailure) forceFailure.style.display = canForce ? '' : 'none';
	renderUnifiedGmAudit();
}

function renderGMThreatAudit() {
	renderUnifiedGmAudit();
}

function renderRoomDiagnostics() {
	const summary = document.getElementById('gmDiagnosticsSummary');
	const issuesList = document.getElementById('gmDiagnosticsIssues');
	if (!summary || !issuesList) return;
	if (!gmDiagnosticsData) {
		summary.innerHTML = `<div class="gm-status-card"><span>${escapeHtml(t('gmDiagnostics'))}</span><strong>—</strong></div>`;
		issuesList.innerHTML = '';
		return;
	}
	const status = gmDiagnosticsData.errorCount > 0 ? 'error' : gmDiagnosticsData.warningCount > 0 ? 'warning' : 'healthy';
	const statusLabel = t(status === 'error' ? 'gmError' : status === 'warning' ? 'gmWarning' : 'gmHealthy');
	const checked = gmDiagnosticsData.checkedAtUtc ? new Date(gmDiagnosticsData.checkedAtUtc) : null;
	summary.innerHTML = [
		[t('status'), statusLabel],
		[t('gmRunDiagnostics'), checked && !Number.isNaN(checked.getTime()) ? checked.toLocaleString() : '—'],
		['Errors', gmDiagnosticsData.errorCount], ['Warnings', gmDiagnosticsData.warningCount], ['Info', gmDiagnosticsData.infoCount]
	].map(([label, value]) => `<div class="gm-status-card"><span>${escapeHtml(label)}</span><strong class="gm-status-badge">${escapeHtml(value)}</strong></div>`).join('');
	const severityFilter = document.getElementById('gmIssueSeverity')?.value || 'all';
	const issues = gmDiagnosticsData.issues.filter(issue => {
		const severity = (issue.severity || issue.Severity || '').toLowerCase();
		return severityFilter === 'all' || severity === severityFilter;
	});
	issuesList.innerHTML = issues.length ? issues.map(issue => {
		const severity = (issue.severity || issue.Severity || 'info').toLowerCase();
		const message = issue.message || issue.Message || '';
		const playerName = issue.affectedPlayerName || issue.AffectedPlayerName || '';
		const canFix = issue.canAutoFix ?? issue.CanAutoFix ?? false;
		return `<div class="gm-diagnostic-issue">
                <span class="gm-diagnostic-severity ${escapeHtml(severity)}">${escapeHtml(severity)}</span>
                <span>${escapeHtml(message)}${playerName ? ` · ${escapeHtml(playerName)}` : ''}</span>
                ${canFix ? `<span class="gm-diagnostic-autofix">${escapeHtml(t('gmAutoFixAvailable'))}</span>` : ''}
            </div>`;
	}).join('') : `<p class="gm-threat-audit-empty">${escapeHtml(t('gmNoIssues'))}</p>`;
}

function renderRoomSnapshots() {
	const list = document.getElementById('gmSnapshotsList');
	const previewBox = document.getElementById('gmSnapshotPreview');
	if (!list || !previewBox) return;
	const snapshots = Array.isArray(gmSnapshotsData) ? gmSnapshotsData.slice(0, 20) : [];
	if (!snapshots.length) list.innerHTML = `<p class="gm-threat-audit-empty">${escapeHtml(t('gmSnapshotEmpty'))}</p>`;
	else list.innerHTML = snapshots.map(snapshot => {
		const id = snapshot.snapshotId || snapshot.SnapshotId || '';
		const reason = snapshot.reason || snapshot.Reason || '';
		const action = snapshot.relatedActionType || snapshot.RelatedActionType || '';
		const round = snapshot.roundNumber ?? snapshot.RoundNumber ?? 0;
		const phase = snapshot.phase || snapshot.Phase || '';
		const status = (snapshot.restoreStatus || snapshot.RestoreStatus || 'blocked').toLowerCase();
		const blocked = snapshot.blockedReason || snapshot.BlockedReason || '';
		const dateValue = snapshot.createdAtUtc || snapshot.CreatedAtUtc;
		const date = dateValue ? new Date(dateValue) : null;
		const time = date && !Number.isNaN(date.getTime()) ? date.toLocaleString() : '';
		const selectedPreviewId = gmSnapshotRestorePreview?.snapshot?.snapshotId || gmSnapshotRestorePreview?.snapshot?.SnapshotId;
		const canRestore = status === 'restorable' && gmSnapshotRestorePreview?.canRestore && selectedPreviewId === id;
		return `<article class="gm-snapshot-entry">
                <header><strong>${escapeHtml(reason)}</strong><span class="gm-snapshot-badge ${escapeHtml(status)}">${escapeHtml(status)}</span></header>
                <p>${escapeHtml(time)} · ${escapeHtml(action || 'manual_snapshot')} · ${escapeHtml(t('round'))} ${escapeHtml(round)} / ${escapeHtml(phase)}</p>
                ${blocked ? `<p>${escapeHtml(t('gmSnapshotBlocked'))}: ${escapeHtml(blocked)}</p>` : ''}
                <div class="gm-snapshot-actions">
                    <button type="button" class="btn-gm-action" data-snapshot-action onclick="previewRoomSnapshot('${escapeHtml(id)}')">${escapeHtml(t('gmSnapshotPreview'))}</button>
                    <button type="button" class="btn-gm-action" data-snapshot-action data-snapshot-blocked="${canRestore ? 'false' : 'true'}" onclick="restoreRoomSnapshot('${escapeHtml(id)}')" ${canRestore ? '' : 'disabled'}>${escapeHtml(t('gmSnapshotRestore'))}</button>
                </div>
            </article>`;
	}).join('');

	if (!gmSnapshotRestorePreview) previewBox.innerHTML = '';
	else {
		const changes = gmSnapshotRestorePreview.changes.map(change => {
			const category = change.category || change.Category || '';
			const count = change.changedCount ?? change.ChangedCount ?? 0;
			return `${category}: ${count}`;
		});
		previewBox.innerHTML = `<strong>${escapeHtml(t('gmSnapshotChanges'))}</strong><p>${escapeHtml(changes.join(' · ') || '0')}</p>${gmSnapshotRestorePreview.blockedReason ? `<p>${escapeHtml(t('gmSnapshotBlocked'))}: ${escapeHtml(gmSnapshotRestorePreview.blockedReason)}</p>` : ''}`;
	}
}

function renderUnifiedGmAudit() {
	const list = document.getElementById('gmThreatAuditList');
	if (!list) return;
	const general = (Array.isArray(gmAuditData.entries) ? gmAuditData.entries : []).map(entry => ({
		source: 'gm',
		time: entry.occurredAtUtc || entry.OccurredAtUtc,
		action: entry.actionType || entry.ActionType || '',
		result: (entry.result || entry.Result || '').toLowerCase(),
		target: entry.targetPlayerId || entry.TargetPlayerId || '',
		summary: entry.summary || entry.Summary || '',
		errorCode: entry.errorCode || entry.ErrorCode || '',
		canUndo: entry.canUndo ?? entry.CanUndo ?? false,
		wasUndone: entry.wasUndone ?? entry.WasUndone ?? false
	}));
	const threat = (Array.isArray(gmThreatControlData.auditLog) ? gmThreatControlData.auditLog : []).map(entry => ({
		source: 'threat',
		time: entry.timestampUtc || entry.TimestampUtc,
		action: `threat_${entry.eventType || entry.EventType || ''}`,
		result: 'success',
		target: entry.threatId || entry.ThreatId || '',
		summary: `${entry.threatName || entry.ThreatName || entry.threatId || entry.ThreatId || ''} · ${t('gmThreatRound')} ${entry.round ?? entry.Round ?? 0}`,
		threatType: entry.eventType || entry.EventType || ''
	}));
	const query = (document.getElementById('gmAuditSearch')?.value || '').trim().toLowerCase();
	const resultFilter = document.getElementById('gmAuditResult')?.value || 'all';
	const events = [...general, ...threat]
		.filter(entry => (resultFilter === 'all' || entry.result === resultFilter) &&
			(!query || `${entry.action} ${entry.summary} ${entry.target}`.toLowerCase().includes(query)))
		.sort((a, b) => new Date(b.time || 0) - new Date(a.time || 0)).slice(0, 50);
	if (!events.length) {
		list.innerHTML = `<p class="gm-threat-audit-empty">${escapeHtml(t('gmThreatHistoryEmpty'))}</p>`;
		return;
	}
	const eventKeys = {
		revealed: 'gmThreatEventRevealed', attempt_started: 'gmThreatEventAttemptStarted',
		attempt_reset: 'gmThreatEventAttemptReset', aborted: 'gmThreatEventAborted',
		forced_success: 'gmThreatEventForcedSuccess', forced_failure: 'gmThreatEventForcedFailure',
		completed_success: 'gmThreatEventCompletedSuccess', completed_failure: 'gmThreatEventCompletedFailure',
		effects_applied: 'gmThreatEventEffectsApplied'
	};
	const locale = { uk: 'uk-UA', ru: 'ru-RU', en: 'en-GB' }[getCurrentLanguage()] || 'uk-UA';
	list.innerHTML = events.map(entry => {
		const type = entry.threatType || '';
		const rawTime = entry.time;
		const parsedTime = rawTime ? new Date(rawTime) : null;
		const time = parsedTime && !Number.isNaN(parsedTime.getTime())
			? parsedTime.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' })
			: '';
		const title = entry.source === 'threat' ? t(eventKeys[type] || type) : entry.action;
		const undoState = entry.wasUndone ? ' · undone' : entry.canUndo ? ' · undo available' : '';
		return `<details class="gm-threat-audit-entry">
                <summary><time>${escapeHtml(time)}</time><strong>${escapeHtml(title)}</strong><span class="gm-audit-result ${escapeHtml(entry.result)}">${escapeHtml(entry.result)}</span></summary>
                <div><span>${escapeHtml(entry.summary + undoState)}</span>${entry.target ? `<span>${escapeHtml(t('target'))}: ${escapeHtml(entry.target)}</span>` : ''}${entry.errorCode ? `<span>${escapeHtml(entry.errorCode)}</span>` : ''}</div>
            </details>`;
	}).join('');
}

function filterGMThreatOptions() {
	const query = (document.getElementById('gmThreatSearch')?.value || '').trim().toLowerCase();
	document.querySelectorAll('#gmThreatSelect option').forEach(option => {
		option.hidden = !!query && !option.dataset.search.includes(query);
	});
}

function gmThreatCommandId() {
	return globalThis.crypto?.randomUUID?.() || `gm-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function confirmGMThreatReplacement(message) {
	if (!gmThreatControlData.currentThreat) return true;
	return confirm(message) && confirm('Підтвердіть ще раз: стара interaction state буде закрита без застосування її наслідків.');
}

function invokeGMThreatCommand(method, args, confirmationMessage) {
	if (gmThreatCommandPending) return;
	const confirmed = confirmationMessage ? confirmGMThreatReplacement(confirmationMessage) : true;
	if (!confirmed) return;
	gmThreatCommandPending = true;
	document.querySelectorAll('#gmThreatControlSection button').forEach(button => button.disabled = true);
	connection.invoke(method, ...args, confirmed)
		.catch(err => {
			const result = document.getElementById('gmThreatCommandResult');
			if (result) result.textContent = err?.message || 'Помилка GM-команди';
		})
		.finally(() => {
			gmThreatCommandPending = false;
			document.querySelectorAll('#gmThreatControlSection button').forEach(button => button.disabled = false);
		});
}

function gmGenerateRareThreat() {
	invokeGMThreatCommand('GMGenerateRandomRareThreat', [gmThreatCommandId()], 'Замінити поточну загрозу випадковою рідкісною?');
}
function gmGenerateTextThreat() {
	invokeGMThreatCommand('GMGenerateTextThreat', [gmThreatCommandId()], 'Замінити поточну загрозу випадковою текстовою?');
}
function gmSelectSpecificThreat() {
	const id = document.getElementById('gmThreatSelect')?.value;
	if (id) invokeGMThreatCommand('GMSelectThreat', [id, gmThreatCommandId()], 'Замінити поточну загрозу обраною?');
}
function gmCancelThreat() {
	invokeGMThreatEmergency('GMCancelCurrentThreat', 'Загрозу буде завершено без застосування нових наслідків. Уже застосовані наслідки залишаться.');
}
function gmRestartThreat() {
	invokeGMThreatEmergency('GMRestartCurrentThreat', 'Поточний прогрес спроби буде очищено. Уже застосовані наслідки не буде скасовано.');
}
function gmResyncThreatRoom() {
	invokeGMThreatEmergency('GMResyncThreatRoom');
}

function setGMThreatForcePending(pending) {
	gmThreatForcePending = pending;
	document.querySelectorAll('#gmThreatEmergencyBlock button, #gmThreatForceModal button').forEach(button => {
		button.disabled = pending;
	});
	if (!pending) {
		const confirmButton = document.getElementById('gmThreatForceConfirm');
		if (confirmButton) confirmButton.disabled = !gmThreatForcePreview;
	}
}

function requestGMThreatForcePreview(outcome) {
	if (gmThreatForcePending || !['success', 'failure'].includes(outcome)) return;
	gmThreatForceRequestedOutcome = outcome;
	gmThreatForcePreview = null;
	const error = document.getElementById('gmThreatForceError');
	if (error) error.textContent = '';
	const refresh = document.getElementById('gmThreatForceRefresh');
	if (refresh) refresh.style.display = 'none';
	setGMThreatForcePending(true);
	connection.invoke('GMPreviewForceThreat', outcome, getCurrentLanguage()).catch(err => {
		if (error) error.textContent = err?.message || t('unavailableNow');
		setGMThreatForcePending(false);
	});
}

function refreshGMThreatForcePreview() {
	if (gmThreatForceRequestedOutcome) requestGMThreatForcePreview(gmThreatForceRequestedOutcome);
}

function renderGMThreatForcePreview() {
	const preview = gmThreatForcePreview;
	const content = document.getElementById('gmThreatForcePreviewContent');
	if (!content || !preview) return;
	const value = key => preview[key] ?? preview[key[0].toUpperCase() + key.slice(1)];
	const outcome = value('requestedOutcome');
	const effects = !!value('effectsWillBeApplied');
	content.innerHTML = `<div class="gm-threat-force-preview">
            <strong>${escapeHtml(value('threatName') || value('threatId') || '')}</strong>
            <dl>
                <div><dt>${escapeHtml(t('gmThreatForceOutcome'))}</dt><dd>${escapeHtml(t(outcome === 'success' ? 'gmThreatForceSuccess' : 'gmThreatForceFailure'))}</dd></div>
                <div><dt>${escapeHtml(t('gmThreatForceEffects'))}</dt><dd>${escapeHtml(t(effects ? 'gmThreatForceWillApply' : 'gmThreatForceWillNotApply'))}</dd></div>
                <div><dt>${escapeHtml(t('gmThreatForceScope'))}</dt><dd>${escapeHtml(value('consequenceScope') || '')}</dd></div>
                <div><dt>${escapeHtml(t('gmThreatForceAffected'))}</dt><dd>${escapeHtml(value('potentiallyAffectedPlayers') ?? 0)}</dd></div>
            </dl>
            <p>${escapeHtml(value('description') || '')}</p>
            <p class="gm-threat-force-warning">${escapeHtml(value('irreversibleWarning') || '')}</p>
        </div>`;
	const error = document.getElementById('gmThreatForceError');
	if (error) error.textContent = '';
	const refresh = document.getElementById('gmThreatForceRefresh');
	if (refresh) refresh.style.display = 'none';
	setGMThreatForcePending(false);
}

function confirmGMThreatForce() {
	if (gmThreatForcePending || !gmThreatForcePreview) return;
	const fingerprint = gmThreatForcePreview.fingerprint || gmThreatForcePreview.Fingerprint;
	if (!fingerprint) return;
	setGMThreatForcePending(true);
	connection.invoke('GMConfirmForceThreat', gmThreatForceRequestedOutcome, fingerprint, gmThreatCommandId(), getCurrentLanguage())
		.catch(err => {
			const error = document.getElementById('gmThreatForceError');
			if (error) error.textContent = err?.message || t('unavailableNow');
			setGMThreatForcePending(false);
		});
}

function closeGMThreatForceModal() {
	if (gmThreatForcePending) return;
	const modal = document.getElementById('gmThreatForceModal');
	if (modal) modal.style.display = 'none';
	gmThreatForcePreview = null;
}

function invokeGMThreatEmergency(method, confirmationMessage) {
	if (gmThreatCommandPending) return;
	if (confirmationMessage && !confirm(confirmationMessage)) return;
	gmThreatCommandPending = true;
	document.querySelectorAll('#gmThreatEmergencyBlock button').forEach(button => button.disabled = true);
	connection.invoke(method, gmThreatCommandId()).catch(error => {
		const result = document.getElementById('gmThreatCommandResult');
		if (result) result.textContent = error?.message || t('unavailableNow');
	}).finally(() => {
		gmThreatCommandPending = false;
		document.querySelectorAll('#gmThreatEmergencyBlock button').forEach(button => button.disabled = false);
		renderGMThreatControl();
	});
}

function updateGMPlayerSelect() {
	const select = document.getElementById('gmPlayerSelect');
	if (!select) return;

	const players = Object.values(roomPlayers);
	select.innerHTML = `<option value="">-- ${getCurrentLanguage() === 'en' ? 'Choose player' : getCurrentLanguage() === 'ru' ? 'Выберите игрока' : 'Виберіть гравця'} --</option>` +
		players.map(p => `<option value="${p.connectionId}" ${p.isEliminated ? 'class="eliminated-option"' : ''}>
                ${escapeHtml(p.name)}${p.isEliminated ? ` (${t('eliminated').toLowerCase()})` : ''}${p.connectionId === myConnectionId ? ` (${t('you')})` : ''}
            </option>`).join('');
	if (selectedPlayerForGM && [...select.options].some(option => option.value === selectedPlayerForGM)) {
		select.value = selectedPlayerForGM;
	}
}

function loadPlayerDataForGM() {
	const select = document.getElementById('gmPlayerSelect');
	const connectionId = select.value;

	if (!connectionId) {
		document.getElementById('gmPlayerInfo').style.display = 'none';
		selectedPlayerForGM = null;
		// Reset all revealed states
		gmRevealedChars = {};
		return;
	}

	selectedPlayerForGM = connectionId;
	const playerData = gmPlayersData[connectionId];

	if (!playerData) {
		document.getElementById('gmPlayerInfo').style.display = 'none';
		return;
	}

	// Reset revealed characteristics for new player
	gmRevealedChars = {};

	document.getElementById('gmPlayerInfo').style.display = 'block';

	// Get player name with elimination status
	const playerName = playerData.name || playerData.Name || t('players');
	const isEliminated = playerData.isEliminated ?? playerData.IsEliminated ?? false;
	document.getElementById('gmPlayerName').textContent = playerName + (isEliminated ? ` (${t('eliminated')})` : '');

	// Заповнюємо характеристики - приховано по дефолту
	const hiddenText = t('hidden');
	const hiddenClass = 'gm-char-hidden';

	// Всі характеристики
	const charElements = ['gmPersonality', 'gmBody', 'gmProfession', 'gmPhysicalHealth', 'gmMentalHealth',
		'gmHobby', 'gmCharacterTrait', 'gmPhobia', 'gmInventory', 'gmProperty', 'gmFact'];
	charElements.forEach(id => {
		const el = document.getElementById(id);
		if (el) {
			el.textContent = hiddenText;
			el.classList.add(hiddenClass);
			el.classList.remove('gm-char-revealed');
		}
	});

	// Оновлюємо кнопки елімінації
	const eliminateBtn = document.querySelector('.btn-eliminate');
	const restoreBtn = document.querySelector('.btn-restore');
	if (isEliminated) {
		if (eliminateBtn) eliminateBtn.style.display = 'none';
		if (restoreBtn) restoreBtn.style.display = 'inline-block';
	} else {
		if (eliminateBtn) eliminateBtn.style.display = 'inline-block';
		if (restoreBtn) restoreBtn.style.display = 'none';
	}
	renderGMAdditionalConditions(playerData);
}

function renderGMAdditionalConditions(playerData) {
	const container = document.getElementById('gmAdditionalConditions');
	if (!container) return;
	const conditions = playerData.additionalPhysicalConditions || playerData.AdditionalPhysicalConditions || [];
	container.innerHTML = conditions.map(condition => {
		const id = condition.id || condition.Id;
		const name = condition.name || condition.Name || '';
		const severity = condition.severityCode || condition.SeverityCode || 'medium';
		const source = condition.sourceId || condition.SourceId || '';
		const round = condition.appliedRound ?? condition.AppliedRound;
		return `<div class="gm-condition-repair" data-condition-id="${escapeHtml(id)}">
                <strong>${escapeHtml(name)}</strong>
                <small>${source ? `${escapeHtml(source)}${round != null ? ` · ${round}` : ''}` : ''}</small>
                <select class="gm-select gm-condition-severity">
                    ${['light', 'medium', 'hard', 'veryHard', 'critical'].map(code => `<option value="${code}" ${code === severity ? 'selected' : ''}>${escapeHtml(code)}</option>`).join('')}
                </select>
                <button class="btn-gm-action gm-player-command" onclick="changeSelectedConditionSeverity('${escapeHtml(id)}', this)">✓</button>
                <button class="btn-gm-action btn-danger gm-player-command" onclick="removeSelectedCondition('${escapeHtml(id)}')">×</button>
            </div>`;
	}).join('');
}

// Об'єкт для зберігання розкритих характеристик у GM панелі
var gmRevealedChars = {};

// Форматування особистості
function formatPersonality(personality) {
	if (!personality) return t('unknown');
	const p = personality;
	const age = p.age ?? p.Age ?? '?';
	const sex = p.sex ?? p.Sex ?? '?';
	const sexOrientation = p.sexOrientation ?? p.SexOrientation ?? '';
	const isChildfree = p.isChildfree ?? p.IsChildfree ?? false;

	let result = `${age} років, ${sex}`;
	if (sexOrientation && sexOrientation !== 'Гетеросексуал') {
		result += `, ${sexOrientation}`;
	}
	if (isChildfree) {
		result += ', Чайлдфрі';
	}
	return result;
}

// Форматування статури
function formatBody(body) {
	if (!body) return t('unknown');
	const height = body.height ?? body.Height ?? '?';
	const weight = body.weight ?? body.Weight ?? '?';
	const bodyType = body.bodyType ?? body.BodyType ?? '';
	return `${height} см, ${weight} кг${bodyType ? ', ' + bodyType : ''}`;
}

// Безпечне отримання значення характеристики з обох регістрів
function getCharValue(obj, camelKey, pascalKey) {
	const src = obj?.[camelKey] || obj?.[pascalKey];
	if (!src) return null;
	if (camelKey === 'profession') return getLocalizedValue(src, 'profession') || getLocalizedValue(src, 'name') || src.name || src.Name || src;
	if (camelKey === 'hobby') return getLocalizedValue(src, 'hobby') || getLocalizedValue(src, 'name') || src.name || src.Name || src;
	if (camelKey === 'characterTrait') return getLocalizedValue(src, 'trait') || getLocalizedValue(src, 'name') || src.name || src.Name || src;
	if (camelKey === 'physicalHealth' || camelKey === 'mentalHealth') return getConditionDisplayName(src) || src.name || src.Name || src;
	if (camelKey === 'phobia') return getLocalizedValue(src, 'name') || src.name || src.Name || src;
	if (camelKey === 'inventory') {
		const items = src.items ?? src.Items ?? [];
		if (Array.isArray(items)) return items.map(item => getLocalizedValue(item, 'item') || item.name || item.Name || '').filter(Boolean).join(', ');
	}
	if (camelKey === 'property') return getPropertyDisplay(src);
	return src.name ?? src.Name ?? src.goal ?? src.Goal ?? src;
}

function editCharacteristic(charName) {
	if (!selectedPlayerForGM) {
		alert('Виберіть гравця');
		return;
	}

	const playerData = gmPlayersData[selectedPlayerForGM];
	if (!playerData) return;

	let currentValue = '';
	switch (charName) {
		case 'Personality': currentValue = formatPersonality(playerData.personality || playerData.Personality); break;
		case 'Body': currentValue = formatBody(playerData.body || playerData.Body); break;
		case 'Profession': currentValue = getCharValue(playerData, 'profession', 'Profession') || ''; break;
		case 'PhysicalHealth': currentValue = getCharValue(playerData, 'physicalHealth', 'PhysicalHealth') || ''; break;
		case 'MentalHealth': currentValue = getCharValue(playerData, 'mentalHealth', 'MentalHealth') || ''; break;
		case 'Hobby': currentValue = getCharValue(playerData, 'hobby', 'Hobby') || ''; break;
		case 'CharacterTrait': currentValue = getCharValue(playerData, 'characterTrait', 'CharacterTrait') || ''; break;
		case 'Phobia': currentValue = getCharValue(playerData, 'phobia', 'Phobia') || ''; break;
		case 'Fact':
			const fact = playerData.fact || playerData.Fact;
			const factName = fact?.name ?? fact?.Name ?? '';
			currentValue = factName;
			break;
		case 'Inventory':
			const inv = playerData.inventory || playerData.Inventory;
			const items = inv?.items ?? inv?.Items ?? [];
			currentValue = Array.isArray(items)
				? items.map(item => item.name ?? item.Name).filter(Boolean).join(', ')
				: '';
			break;
	}

	const playerName = playerData.name || playerData.Name || 'Гравець';
	document.getElementById('editCharInfo').textContent = `Гравець: ${playerName} | Характеристика: ${charName}`;
	document.getElementById('editCharValue').value = currentValue;
	document.getElementById('editCharName').value = charName;
	document.getElementById('editCharModal').style.display = 'flex';
}

function submitEditCharacteristic() {
	if (!selectedPlayerForGM) return;

	const charName = document.getElementById('editCharName').value;
	const newValue = document.getElementById('editCharValue').value.trim();

	if (!newValue) {
		alert('Введіть значення');
		return;
	}

	connection.invoke("EditPlayerCharacteristic", selectedPlayerForGM, charName, newValue)
		.catch(err => console.error(err));

	closeEditCharModal();
}

function clearCharacteristic() {
	if (!selectedPlayerForGM) return;

	const charName = document.getElementById('editCharName').value;

	if (confirm(`Очистити характеристику ${charName}?`)) {
		connection.invoke("ClearPlayerCharacteristic", selectedPlayerForGM, charName)
			.catch(err => console.error(err));
		closeEditCharModal();
	}
}

function closeEditCharModal() {
	document.getElementById('editCharModal').style.display = 'none';
	document.getElementById('editCharValue').value = '';
}

function regenerateCharacteristic(charName) {
	if (!selectedPlayerForGM) {
		alert('Виберіть гравця');
		return;
	}

	if (confirm(`Регенерувати характеристику ${charName}?`)) {
		connection.invoke("RegeneratePlayerCharacteristic", selectedPlayerForGM, charName)
			.catch(err => console.error(err));
	}
}

function forceReveal(charName) {
	if (!selectedPlayerForGM) {
		alert('Виберіть гравця');
		return;
	}

	if (confirm(`Примусово розкрити характеристику ${charName}?`)) {
		connection.invoke("ForceRevealCharacteristic", selectedPlayerForGM, charName)
			.catch(err => console.error(err));
	}
}

function eliminateSelectedPlayer() {
	if (!selectedPlayerForGM) {
		alert('Виберіть гравця');
		return;
	}

	const playerData = gmPlayersData[selectedPlayerForGM];
	if (confirm(`Елімінувати гравця ${playerData?.name}?`)) {
		connection.invoke("EliminatePlayer", selectedPlayerForGM)
			.catch(err => console.error(err));
	}
}

function restoreSelectedPlayer() {
	if (!selectedPlayerForGM) {
		alert('Виберіть гравця');
		return;
	}

	const playerData = gmPlayersData[selectedPlayerForGM];
	if (confirm(`Повернути гравця ${playerData?.name} в гру?`)) {
		connection.invoke("RestorePlayer", selectedPlayerForGM)
			.catch(err => console.error(err));
	}
}

function gmPlayerCommandId() {
	return globalThis.crypto?.randomUUID?.() || `gm-player-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function invokeGMPlayerCommand(method, args) {
	if (gmPlayerCommandPending || !selectedPlayerForGM) return;
	gmPlayerCommandPending = true;
	document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = true);
	connection.invoke(method, ...args, gmPlayerCommandId()).catch(error => {
		gmPlayerCommandPending = false;
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
		const result = document.getElementById('gmPlayerCommandResult');
		if (result) result.textContent = error?.message || 'Помилка команди';
	});
}

function resyncSelectedPlayer() {
	invokeGMPlayerCommand('ResyncPlayer', [selectedPlayerForGM]);
}

function inspectSelectedConnection() {
	if (gmPlayerCommandPending || !selectedPlayerForGM) return;
	gmPlayerCommandPending = true;
	document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = true);
	connection.invoke('InspectStalePlayerConnection', selectedPlayerForGM, false).catch(() => {
		gmPlayerCommandPending = false;
		document.querySelectorAll('.gm-player-command').forEach(button => button.disabled = false);
	});
}

function hideSelectedCharacteristic() {
	const characteristic = document.getElementById('gmHideCharacteristicSelect')?.value;
	if (characteristic) invokeGMPlayerCommand('HideRevealedCharacteristic', [selectedPlayerForGM, characteristic]);
}

function transferHostToSelectedPlayer() {
	const player = gmPlayersData[selectedPlayerForGM];
	if (confirm(`${t('gmTransferHost')}: ${player?.name || player?.Name || ''}?`))
		invokeGMPlayerCommand('TransferHost', [selectedPlayerForGM]);
}

function kickSelectedPlayer() {
	const player = gmPlayersData[selectedPlayerForGM];
	if (confirm(`${t('gmKickPlayer')}: ${player?.name || player?.Name || ''}?`))
		invokeGMPlayerCommand('KickPlayer', [selectedPlayerForGM]);
}

function changeSelectedConditionSeverity(conditionId, button) {
	const severity = button.closest('.gm-condition-repair')?.querySelector('.gm-condition-severity')?.value;
	if (severity) invokeGMPlayerCommand('ChangeAdditionalConditionSeverity', [selectedPlayerForGM, conditionId, severity]);
}

function removeSelectedCondition(conditionId) {
	if (confirm(t('remove'))) invokeGMPlayerCommand('RemoveAdditionalCondition', [selectedPlayerForGM, conditionId]);
}

// ==================== UI FUNCTIONS ====================

function showLobbySection() {
	document.getElementById('lobbySection').style.display = 'block';
	document.getElementById('roomSection').style.display = 'none';
}

function showRoomSection() {
	document.getElementById('lobbySection').style.display = 'none';
	document.getElementById('roomSection').style.display = 'block';
	document.getElementById('roomLobby').style.display = 'block';
	document.getElementById('gameSection').style.display = 'none';
	document.getElementById('myPlayerSection').style.display = 'block';
}

function updateRoomUI() {
	if (!currentRoom) return;

	console.log("[updateRoomUI] Called with currentRoom:", currentRoom);
	console.log("[updateRoomUI] isHost:", isHost);
	console.log("[updateRoomUI] currentRoom.state:", currentRoom.state);

	const roomNameElement = document.getElementById('currentRoomName');
	if (roomNameElement) {
		roomNameElement.textContent = currentRoom.name || t('room');
	}

	const roomIdElement = document.getElementById('currentRoomId');
	if (roomIdElement) {
		roomIdElement.textContent = `ID: ${currentRoom.id || ''}`;
	}

	const roomStateElement = document.getElementById('currentRoomState');
	if (roomStateElement) {
		roomStateElement.textContent = getRoomStateLabel();
		roomStateElement.classList.remove('state-lobby', 'state-playing', 'state-voting');
		const roomState = String(currentRoom.state || '').toLowerCase();
		roomStateElement.classList.add(roomState === 'lobby' ? 'state-lobby' : roomState === 'voting' ? 'state-voting' : 'state-playing');
	}

	const playerCount = Object.keys(roomPlayers).length;

	const roomPlayerCountElement = document.getElementById('roomPlayerCount');

	if (roomPlayerCountElement) {
		roomPlayerCountElement.textContent =
			`${playerCount}/${currentRoom.maxPlayers || 12}`;
	}

	// Показуємо кнопку старту тільки хосту в лобі
	const startBtn = document.getElementById('startGameBtn');
	if (startBtn) {
		if (isHost && currentRoom.state === 'Lobby') {
			startBtn.style.display = 'inline-block';
			startBtn.disabled = playerCount < 2; // Changed from 4 to 2 for testing
			startBtn.title = playerCount < 2 ? (getCurrentLanguage() === 'en' ? 'At least 2 players required' : getCurrentLanguage() === 'ru' ? 'Нужно минимум 2 игрока' : 'Потрібно мінімум 2 гравці') : '';
		} else {
			startBtn.style.display = 'none';
		}
	}

	// Показуємо кнопку голосування тільки хосту під час гри
	const votingBtn = document.getElementById('startVotingBtn');
	if (votingBtn) {
		if (canStartVotingNow()) {
			votingBtn.style.display = 'inline-block';
		} else {
			votingBtn.style.display = 'none';
		}
	}
	updateRoundStatusUI();

	// Показуємо кнопку GM панелі хосту ЗАВЖДИ (і в лобі, і під час гри)
	const gmPanelBtn = document.getElementById('gmPanelBtn');
	if (gmPanelBtn) {
		if (isHost || !!omniscientHiddenState) {
			gmPanelBtn.style.display = 'inline-block';
			console.log("[updateRoomUI] GM Panel button shown for host");
		} else {
			gmPanelBtn.style.display = 'none';
		}
	}

	// Текст очікування
	const waitingText = document.getElementById('waitingText');
	if (waitingText) {
		if (playerCount < 2) {
			waitingText.textContent = getCurrentLanguage() === 'en'
				? `Waiting for players... (${2 - playerCount} more needed)`
				: getCurrentLanguage() === 'ru'
					? `Ожидание игроков... (нужно еще ${2 - playerCount})`
					: `Очікування гравців... (потрібно ще ${2 - playerCount})`;
			waitingText.style.display = 'block';
		} else if (!isHost) {
			waitingText.textContent = getCurrentLanguage() === 'en'
				? 'Waiting for the host to start the game...'
				: getCurrentLanguage() === 'ru'
					? 'Ожидание старта игры от ведущего...'
					: 'Очікування старту гри від хоста...';
			waitingText.style.display = 'block';
		} else {
			waitingText.style.display = 'none';
		}
	}

	// Оновлюємо GM секції якщо гра почалась
	updateGMSections();
	refreshGlobalContentCatalogAccess();

	renderRoomPlayers();
	renderLobbyState();
}

// Нова функція для оновлення GM секцій
function updateGMSections() {
	const isGameActive = currentRoom && (currentRoom.state === 'Playing' || currentRoom.state === 'Started' || currentRoom.state === 'Voting');
	renderGMTabsVisibility();
	const roundTab = document.querySelector('[data-gm-tab-button="round"]');
	if (roundTab) roundTab.disabled = !isGameActive;
	updateRoundStatusUI();
	renderGMPanelState();
	console.log("[updateGMSections] isHost:", isHost, "isGameActive:", isGameActive);
}

function renderRoomsList(rooms) {
	const container = document.getElementById('roomsList');

	if (!rooms || rooms.length === 0) {
		container.innerHTML = `<p class="no-rooms">${t('noRooms')}</p>`;
		return;
	}

	container.innerHTML = rooms.map(room => `
            <div class="room-card ${!room.canJoin ? 'room-full' : ''}">
                <div class="room-card-header">
                    <span class="room-card-name">${escapeHtml(room.name)}</span>
                    ${room.hasPassword ? '<span class="room-lock">🔒</span>' : ''}
                </div>
                <div class="room-card-info">
                    <span class="room-host">${t('host')}: ${escapeHtml(room.hostName)}</span>
                    <span class="room-players">${room.playerCount}/${room.maxPlayers} ${t('players')}</span>
                </div>
                <button class="btn-join" onclick="joinRoom('${room.id}', ${room.hasPassword})" ${!room.canJoin ? 'disabled' : ''}>
                    ${room.canJoin ? (getCurrentLanguage() === 'en' ? 'Join' : getCurrentLanguage() === 'ru' ? 'Присоединиться' : 'Приєднатися') : (getCurrentLanguage() === 'en' ? 'Full' : getCurrentLanguage() === 'ru' ? 'Заполнено' : 'Заповнено')}
                </button>
            </div>
        `).join('');
}

function renderRoomPlayers() {
	const container = document.getElementById('roomPlayersList');
	const players = Object.values(roomPlayers);

	// Сортуємо за seatNumber якщо є (після старту гри)
	players.sort(function (a, b) { return (a.seatNumber || 999) - (b.seatNumber || 999); });

	container.innerHTML = players.map((p, i) => {
		var seatLabel = p.seatNumber ? '#' + p.seatNumber : '#' + (i + 1);
		const isEliminated = p.isEliminated || p.IsEliminated || false;
		const isSpectatorGm = p.isSpectatorGm || p.IsSpectatorGm || false;

		let cardClasses = ['room-player-card'];
		if (p.connectionId === myConnectionId) cardClasses.push('my-player');
		if (p.isHost) cardClasses.push('host-player');
		if (isEliminated) cardClasses.push('room-player-eliminated');
		if (isSpectatorGm) cardClasses.push('room-player-spectator-gm');

		return `
            <div class="${cardClasses.join(' ')}">
                <span class="player-number">${seatLabel}</span>
                <span class="player-name">${escapeHtml(p.name)}</span>
                ${p.isHost ? `<span class="host-badge">${t('host')}</span>` : ''}
                ${p.connectionId === myConnectionId ? `<span class="you-badge">${t('you')}</span>` : ''}
                ${isEliminated ? `<span class="eliminated-badge-small">${t('eliminated')}</span>` : ''}
                ${isSpectatorGm ? `<span class="host-badge">${t('omniscientPublicBadge')}</span>` : ''}
            </div>`;
	}).join('');
	const spectator = players.find(p => p.isSpectatorGm || p.IsSpectatorGm);
	const banner = document.getElementById('omniscientGmBanner');
	if (banner) { banner.style.display = spectator ? 'block' : 'none'; banner.textContent = spectator ? `${t('omniscientPublicBadge')}: ${spectator.name}. ${getCurrentLanguage() === 'en' ? 'Does not participate in gameplay or voting.' : getCurrentLanguage() === 'ru' ? 'Не участвует в игре и голосовании.' : 'Не бере участі у грі та голосуванні.'}` : ''; }
}

const lobbyGet = (object, camel, pascal) => object?.[camel] ?? object?.[pascal];
const lobbySettingNumberKeys = new Set(['maxGameplayPlayers','minGameplayPlayers','manualBunkerCapacity','randomBunkerCapacityMin','randomBunkerCapacityMax','firstThreatRound','maxThreatsPerGame','roundTimerDurationSeconds','votingStartRound','specialCardsPerPlayer','bonusInventoryRound','bonusInventoryCount','startingInventoryCount']);
const lobbySettingNullableNumberKeys = new Set(['manualBunkerCapacity','randomBunkerCapacityMin','randomBunkerCapacityMax','maxThreatsPerGame']);
const lobbySettingBooleanKeys = new Set(['spectatorsAllowed','allowSpectatorsAfterStart','allowLateGameplayJoin','lockRoomOnStart','joinsLocked','hostCanStartWithoutAllReady','resetReadinessAfterSettingsChange','apocalypseEnabled','bunkerScenarioEnabled','threatsEnabled','avoidRepeatedThreats','roundTimerEnabled','autoStartRoundTimer','pauseTimerOnHostDisconnect','votingEnabled','specialCardsEnabled','bonusInventoryEnabled']);

function normalizeLobbySettings(source) {
	const get = key => source?.[key] ?? source?.[key.charAt(0).toUpperCase() + key.slice(1)];
	return {
		version:Number(get('version') ?? 1), preset:String(get('preset') ?? 'Classic'),
		maxGameplayPlayers:Number(get('maxGameplayPlayers') ?? 12), minGameplayPlayers:Number(get('minGameplayPlayers') ?? 2),
		spectatorsAllowed:Boolean(get('spectatorsAllowed') ?? true), allowSpectatorsAfterStart:Boolean(get('allowSpectatorsAfterStart') ?? false),
		allowLateGameplayJoin:Boolean(get('allowLateGameplayJoin') ?? false), lockRoomOnStart:Boolean(get('lockRoomOnStart') ?? true), joinsLocked:Boolean(get('joinsLocked') ?? false),
		readyRequirement:String(get('readyRequirement') ?? 'AllPlayers'), hostCanStartWithoutAllReady:Boolean(get('hostCanStartWithoutAllReady') ?? false), resetReadinessAfterSettingsChange:Boolean(get('resetReadinessAfterSettingsChange') ?? true),
		bunkerCapacityMode:String(get('bunkerCapacityMode') ?? 'Automatic'), manualBunkerCapacity:get('manualBunkerCapacity') == null ? null : Number(get('manualBunkerCapacity')), randomBunkerCapacityMin:get('randomBunkerCapacityMin') == null ? null : Number(get('randomBunkerCapacityMin')), randomBunkerCapacityMax:get('randomBunkerCapacityMax') == null ? null : Number(get('randomBunkerCapacityMax')),
		apocalypseEnabled:Boolean(get('apocalypseEnabled') ?? true), bunkerScenarioEnabled:Boolean(get('bunkerScenarioEnabled') ?? true),
		threatsEnabled:Boolean(get('threatsEnabled') ?? true), interactiveThreatRate:String(get('interactiveThreatRate') ?? 'Rare'), firstThreatRound:Number(get('firstThreatRound') ?? 3), threatFrequency:String(get('threatFrequency') ?? 'OncePerGame'), maxThreatsPerGame:get('maxThreatsPerGame') == null ? null : Number(get('maxThreatsPerGame')), avoidRepeatedThreats:Boolean(get('avoidRepeatedThreats') ?? true),
		roundTimerEnabled:Boolean(get('roundTimerEnabled') ?? false), roundTimerDurationSeconds:Number(get('roundTimerDurationSeconds') ?? 300), autoStartRoundTimer:Boolean(get('autoStartRoundTimer') ?? false), pauseTimerOnHostDisconnect:Boolean(get('pauseTimerOnHostDisconnect') ?? false),
		votingEnabled:Boolean(get('votingEnabled') ?? true), votingStartRound:Number(get('votingStartRound') ?? 3), votingFrequency:String(get('votingFrequency') ?? 'EveryRound'),
		specialCardsEnabled:Boolean(get('specialCardsEnabled') ?? true), specialCardsPerPlayer:Number(get('specialCardsPerPlayer') ?? 1), bonusInventoryEnabled:Boolean(get('bonusInventoryEnabled') ?? true), bonusInventoryRound:Number(get('bonusInventoryRound') ?? 3), bonusInventoryCount:Number(get('bonusInventoryCount') ?? 1), startingInventoryCount:Number(get('startingInventoryCount') ?? 1), characterGenerationMode:String(get('characterGenerationMode') ?? 'Classic')
	};
}

function isLobbyConfiguredSystemEnabled(key) {
	const source = lobbyGet(lobbyState, 'settings', 'Settings');
	return !source || normalizeLobbySettings(source)[key] !== false;
}

function updateScenarioSectionVisibility() {
	const section = document.querySelector('#gameSection > .scenario-immersive-section');
	if (!section) return;
	const anyVisible = ['apocalypsePanel','bunkerPanel','threatPanel'].some(id => document.getElementById(id)?.style.display !== 'none');
	section.hidden = !anyVisible; section.style.display = anyVisible ? '' : 'none';
}

function lobbyAmCurrentHost(state = lobbyState) {
	const meId = getMyStablePlayerId();
	return (lobbyGet(state, 'members', 'Members') || []).some(member => lobbyGet(member, 'playerId', 'PlayerId') === meId && lobbyGet(member, 'isCurrentHost', 'IsCurrentHost'));
}

function syncLobbySettingsState(state) {
	const hostNow = lobbyAmCurrentHost(state); const ownerId = getMyStablePlayerId();
	const revision = Number(lobbyGet(state, 'settingsRevision', 'SettingsRevision') || 1);
	const canonical = lobbyGet(state, 'settings', 'Settings');
	if (!hostNow) { lobbySettingsDraft = null; lobbySettingsDirty = false; lobbySettingsOwnerId = ''; lobbySettingsBaseRevision = revision; return; }
	if (!lobbySettingsDraft || lobbySettingsOwnerId !== ownerId || lobbySettingsBaseRevision !== revision) {
		lobbySettingsDraft = normalizeLobbySettings(canonical); lobbySettingsBaseRevision = revision; lobbySettingsDirty = false; lobbySettingsOwnerId = ownerId;
	}
}

function lobbyPresetLabel(value) { return t({ Classic:'lobbyPresetClassic', Calm:'lobbyPresetCalm', Dangerous:'lobbyPresetDangerous', Hardcore:'lobbyPresetHardcore', Quick:'lobbyPresetQuick', Long:'lobbyPresetLong', Custom:'lobbyPresetCustom' }[value] || 'lobbyPresetCustom'); }
function lobbyFrequencyLabel(value) { return t({ OncePerGame:'lobbyOnce', EveryOtherRound:'lobbyEveryOther', EveryRound:'lobbyEveryRound', RandomEligibleRounds:'lobbyRandomRounds', EveryTwoRounds:'lobbyEveryOther' }[value] || 'lobbyOnce'); }
function lobbyCapacityLabel(settings) {
	if (settings.bunkerCapacityMode === 'Manual') return `${t('lobbyManual')}: ${settings.manualBunkerCapacity ?? '—'}`;
	if (settings.bunkerCapacityMode === 'RandomRange') return `${t('lobbyRandomRange')}: ${settings.randomBunkerCapacityMin ?? '—'}–${settings.randomBunkerCapacityMax ?? '—'}`;
	return t('lobbyAutomatic');
}
function setLobbySettingsFeedback(key, error = false) {
	const element = document.getElementById('lobbySettingsFeedback'); if (!element) return;
	element.textContent = key ? t(key) : ''; element.className = `lobby-settings-feedback${key ? error ? ' error' : ' success' : ''}`;
}
function lobbyWarningText(code) { return t({ bunker_capacity_not_restrictive:'lobbyWarningCapacity', spectators_present:'lobbyWarningSpectators', player_count_exceeds_max:'lobbyWarningPlayers' }[code] || 'lobbySettingsInvalid'); }
function lobbyAuditLabel(action) { return t({ lobby_settings_applied:'lobbyAuditSettings', lobby_readiness_changed:'lobbyAuditReady', lobby_readiness_reset:'lobbyAuditReadyReset', lobby_role_changed:'lobbyAuditRole', host_transfer:'lobbyAuditHost', lobby_player_kicked:'lobbyAuditKick', lobby_player_joined:'lobbyAuditJoined', lobby_player_reconnected:'lobbyAuditReconnected', lobby_player_left:'lobbyAuditLeft', lobby_password_changed:'lobbyAuditPassword', game_started_from_lobby:'lobbyAuditStarted' }[action] || 'lobbyAuditGeneric'); }

function renderLobbyGameSetup() {
	const state = lobbyState; const setup = document.getElementById('lobbyGameSetup'); if (!state || !setup) return;
	const host = lobbyAmCurrentHost(state); const canonical = normalizeLobbySettings(lobbyGet(state, 'settings', 'Settings'));
	if (host && !lobbySettingsDraft) syncLobbySettingsState(state);
	const displayed = host && lobbySettingsDraft ? lobbySettingsDraft : canonical;
	const revision = Number(lobbyGet(state, 'settingsRevision', 'SettingsRevision') || 1);
	const revisionElement = document.getElementById('lobbySettingsRevision'); if (revisionElement) revisionElement.textContent = `${t('lobbyRevision')}: ${revision}`;
	const dirty = document.getElementById('lobbySettingsDirty'); if (dirty) dirty.textContent = host && lobbySettingsDirty ? t('lobbyUnsaved') : '';
	const editor = document.getElementById('lobbySettingsHostEditor'); const readOnly = document.getElementById('lobbySettingsReadOnly');
	if (editor) editor.hidden = !host; if (readOnly) readOnly.hidden = host;
	const chipValues = [
		`${lobbyPresetLabel(displayed.preset)}`,
		`${displayed.minGameplayPlayers}–${displayed.maxGameplayPlayers} ${t('players').toLowerCase()}`,
		`${t('lobbySummaryBunker')}: ${lobbyCapacityLabel(displayed)}`,
		`${t('lobbySummaryThreats')}: ${displayed.threatsEnabled ? `${displayed.interactiveThreatRate} ${displayed.firstThreatRound}+` : t('lobbyOff')}`,
		`${t('lobbySummaryTimer')}: ${displayed.roundTimerEnabled ? `${Math.round(displayed.roundTimerDurationSeconds / 60)} min` : t('lobbyOff')}`,
		`${t('lobbySummaryVoting')}: ${displayed.votingEnabled ? `${t('lobbyFromRound')} ${displayed.votingStartRound}` : t('lobbyOff')}`,
		`${t('lobbySummaryCards')}: ${displayed.specialCardsEnabled ? displayed.specialCardsPerPlayer : 0}`
	];
	const chips = document.getElementById('lobbySettingsChips'); if (chips) chips.innerHTML = chipValues.map(value => `<span class="lobby-settings-chip">${escapeHtml(String(value))}</span>`).join('');
	const warnings = lobbyGet(state, 'settingsWarnings', 'SettingsWarnings') || []; const warningsElement = document.getElementById('lobbySettingsWarnings');
	if (warningsElement) warningsElement.innerHTML = warnings.map(warning => `<div class="lobby-settings-warning">${escapeHtml(lobbyWarningText(lobbyGet(warning,'code','Code')))}</div>`).join('');

	if (host) {
		const preset = document.getElementById('lobbyPresetSelect');
		if (preset && preset.dataset.language !== getCurrentLanguage()) {
			preset.innerHTML = ['Classic','Calm','Dangerous','Hardcore','Quick','Long','Custom'].map(value => `<option value="${value}">${escapeHtml(lobbyPresetLabel(value))}</option>`).join(''); preset.dataset.language = getCurrentLanguage();
		}
		setup.querySelectorAll('.lobby-setting-input[data-setting]').forEach(control => {
			const key = control.dataset.setting; const value = displayed[key];
			if (control.type === 'checkbox') control.checked = Boolean(value); else control.value = value ?? '';
			control.disabled = lobbySettingsPending;
		});
		const mode = displayed.bunkerCapacityMode;
		for (const [id, visible] of [['lobbyManualCapacityRow',mode === 'Manual'],['lobbyRandomCapacityMinRow',mode === 'RandomRange'],['lobbyRandomCapacityMaxRow',mode === 'RandomRange']]) { const row = document.getElementById(id); if (row) row.hidden = !visible; }
		setup.querySelectorAll('[data-settings-tab]').forEach(button => { const active = button.dataset.settingsTab === lobbySettingsActiveTab; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); });
		setup.querySelectorAll('[data-settings-pane]').forEach(pane => { const active = pane.dataset.settingsPane === lobbySettingsActiveTab; pane.classList.toggle('active', active); pane.hidden = !active; });
		for (const id of ['lobbySettingsApply','lobbySettingsReset','lobbySettingsClassic','lobbyPresetSave','lobbyPresetLoad','lobbyPresetDelete','lobbyPresetExport','lobbyPresetImport','lobbyPasswordApply']) { const button = document.getElementById(id); if (button) button.disabled = lobbySettingsPending || (id === 'lobbySettingsApply' && !lobbySettingsDirty); }
		renderLobbyLocalPresetOptions();
	} else if (readOnly) {
		const rows = [[t('lobbyPreset'),lobbyPresetLabel(canonical.preset)],[t('lobbyBunkerCapacityMode'),lobbyCapacityLabel(canonical)],[t('lobbySummaryThreats'),canonical.threatsEnabled ? `${canonical.interactiveThreatRate}, ${t('lobbyFromRound')} ${canonical.firstThreatRound}` : t('lobbyOff')],[t('lobbySummaryTimer'),canonical.roundTimerEnabled ? `${canonical.roundTimerDurationSeconds / 60} min` : t('lobbyOff')],[t('lobbySummaryVoting'),canonical.votingEnabled ? `${t('lobbyFromRound')} ${canonical.votingStartRound}` : t('lobbyOff')],[t('lobbySpecialCardsCount'),canonical.specialCardsEnabled ? canonical.specialCardsPerPlayer : 0]];
		readOnly.innerHTML = rows.map(([label,value]) => `<article><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></article>`).join('');
	}
	const events = lobbyGet(state, 'recentEvents', 'RecentEvents') || []; const audit = document.getElementById('lobbyAuditEvents');
	if (audit) audit.innerHTML = events.length ? events.map(event => `<div class="lobby-audit-event"><time>${escapeHtml(new Date(lobbyGet(event,'occurredAtUtc','OccurredAtUtc')).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}))}</time><span>${escapeHtml(lobbyAuditLabel(lobbyGet(event,'actionType','ActionType')))}</span></div>`).join('') : `<p>${escapeHtml(t('lobbyNoAudit'))}</p>`;
}

function updateLobbySettingsDraft(control) {
	if (!lobbySettingsDraft || !control?.dataset?.setting) return;
	const key = control.dataset.setting;
	if (key === 'preset') { loadLobbyServerPreset(control.value); return; }
	let value = control.type === 'checkbox' ? control.checked : control.value;
	if (lobbySettingNumberKeys.has(key)) value = value === '' && lobbySettingNullableNumberKeys.has(key) ? null : Number(value);
	lobbySettingsDraft[key] = value;
	if (key === 'specialCardsPerPlayer') lobbySettingsDraft.specialCardsEnabled = Number(value) > 0;
	lobbySettingsDraft.preset = 'Custom'; lobbySettingsDirty = true; setLobbySettingsFeedback(''); renderLobbyGameSetup();
}

async function loadLobbyServerPreset(preset) {
	if (lobbySettingsPending || preset === 'Custom') return;
	lobbySettingsPending = true; renderLobbyGameSetup();
	try { lobbySettingsDraft = normalizeLobbySettings(await connection.invoke('GetLobbyGamePreset', preset)); lobbySettingsDirty = true; setLobbySettingsFeedback('lobbyPresetLoaded'); }
	catch (_) { setLobbySettingsFeedback('lobbySettingsInvalid', true); }
	finally { lobbySettingsPending = false; renderLobbyGameSetup(); }
}

function lobbySettingsHubPayload(settings) {
	const enumValue = (value, values) => Math.max(0, values.indexOf(value));
	return { ...settings,
		preset:enumValue(settings.preset,['Classic','Calm','Dangerous','Hardcore','Quick','Long','Custom']),
		readyRequirement:enumValue(settings.readyRequirement,['AllPlayers','HostDecision']),
		bunkerCapacityMode:enumValue(settings.bunkerCapacityMode,['Automatic','Manual','RandomRange']),
		interactiveThreatRate:enumValue(settings.interactiveThreatRate,['Off','Rare','Standard','Often','Always']),
		threatFrequency:enumValue(settings.threatFrequency,['OncePerGame','EveryOtherRound','EveryRound','RandomEligibleRounds']),
		votingFrequency:enumValue(settings.votingFrequency,['EveryRound','EveryTwoRounds']), characterGenerationMode:0
	};
}

async function applyLobbySettings() {
	if (!lobbySettingsDraft || !lobbySettingsDirty || lobbySettingsPending) return;
	lobbySettingsPending = true; renderLobbyGameSetup();
	try {
		const result = await connection.invoke('ApplyLobbyGameSettings', { expectedRevision:lobbySettingsBaseRevision, commandId:crypto.randomUUID(), settings:lobbySettingsHubPayload(lobbySettingsDraft) });
		if (!(result?.success ?? result?.Success)) {
			const code = result?.errorCode ?? result?.ErrorCode; setLobbySettingsFeedback(code === 'settings_revision_conflict' ? 'lobbySettingsConflict' : 'lobbySettingsInvalid', true);
			lobbySettingsDraft = normalizeLobbySettings(result?.settings ?? result?.Settings); lobbySettingsBaseRevision = Number(result?.settingsRevision ?? result?.SettingsRevision ?? lobbySettingsBaseRevision); lobbySettingsDirty = false;
		} else { lobbySettingsDirty = false; setLobbySettingsFeedback('lobbySettingsApplied'); }
	} catch (_) { setLobbySettingsFeedback('lobbySettingsInvalid', true); }
	finally { lobbySettingsPending = false; renderLobbyGameSetup(); }
}

function readLobbyLocalPresets() { try { const value = JSON.parse(localStorage.getItem(lobbyLocalPresetStorageKey) || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch (_) { return {}; } }
function writeLobbyLocalPresets(value) { localStorage.setItem(lobbyLocalPresetStorageKey, JSON.stringify(value)); }
function renderLobbyLocalPresetOptions() { const select = document.getElementById('lobbyLocalPresetSelect'); if (!select) return; const value = select.value; const presets = readLobbyLocalPresets(); select.innerHTML = Object.keys(presets).sort().map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join(''); if (presets[value]) select.value = value; }
function saveLobbyLocalPreset() { const input = document.getElementById('lobbyLocalPresetName'); const name = String(input?.value || '').trim().slice(0,40); if (!name || !lobbySettingsDraft) return setLobbySettingsFeedback('lobbySettingsInvalid', true); const presets = readLobbyLocalPresets(); presets[name] = { version:1, settings:normalizeLobbySettings(lobbySettingsDraft) }; writeLobbyLocalPresets(presets); renderLobbyLocalPresetOptions(); setLobbySettingsFeedback('lobbyPresetSaved'); }
function loadLobbyLocalPreset() { const name = document.getElementById('lobbyLocalPresetSelect')?.value; const entry = readLobbyLocalPresets()[name]; if (!entry || entry.version !== 1) return setLobbySettingsFeedback('lobbyPresetImportError', true); lobbySettingsDraft = normalizeLobbySettings(entry.settings); lobbySettingsDraft.preset = 'Custom'; lobbySettingsDirty = true; setLobbySettingsFeedback('lobbyPresetLoaded'); renderLobbyGameSetup(); }
function deleteLobbyLocalPreset() { const name = document.getElementById('lobbyLocalPresetSelect')?.value; if (!name) return; const presets = readLobbyLocalPresets(); delete presets[name]; writeLobbyLocalPresets(presets); renderLobbyLocalPresetOptions(); setLobbySettingsFeedback('lobbyPresetDeleted'); }
function exportLobbyPreset() { if (!lobbySettingsDraft) return; const name = String(document.getElementById('lobbyLocalPresetName')?.value || 'bunker-preset').trim() || 'bunker-preset'; const data = { schema:'bunker-room-game-settings', version:1, name, settings:normalizeLobbySettings(lobbySettingsDraft) }; const url = URL.createObjectURL(new Blob([JSON.stringify(data,null,2)], {type:'application/json'})); const link = document.createElement('a'); link.href = url; link.download = `${name.replace(/[^a-z0-9_-]+/gi,'-')}.json`; link.click(); URL.revokeObjectURL(url); }
async function importLobbyPresetFile(file) { try { const data = JSON.parse(await file.text()); if (data?.schema !== 'bunker-room-game-settings' || data?.version !== 1 || data?.settings?.version !== 1) throw new Error('version'); lobbySettingsDraft = normalizeLobbySettings(data.settings); lobbySettingsDraft.preset = 'Custom'; lobbySettingsDirty = true; setLobbySettingsFeedback('lobbyPresetImportOk'); renderLobbyGameSetup(); } catch (_) { setLobbySettingsFeedback('lobbyPresetImportError', true); } }

async function updateLobbyPassword() { if (lobbySettingsPending) return; lobbySettingsPending = true; renderLobbyGameSetup(); try { await connection.invoke('SetLobbyPassword', document.getElementById('lobbyPasswordInput')?.value || null, crypto.randomUUID()); document.getElementById('lobbyPasswordInput').value = ''; setLobbySettingsFeedback('lobbyPasswordUpdated'); } catch (_) { setLobbySettingsFeedback('lobbySettingsInvalid', true); } finally { lobbySettingsPending = false; renderLobbyGameSetup(); } }
async function resetLobbyMemberReady(playerId) { if (lobbyCommandPending) return; lobbyCommandPending = true; try { await connection.invoke('ResetLobbyReady', playerId, crypto.randomUUID()); } finally { lobbyCommandPending = false; } }
async function kickLobbyMember(playerId) { if (lobbyCommandPending || !confirm(t('lobbyKickMember') + '?')) return; lobbyCommandPending = true; try { await connection.invoke('KickLobbyPlayer', playerId, crypto.randomUUID()); } finally { lobbyCommandPending = false; } }

function bindLobbySettingsControls() {
	const setup = document.getElementById('lobbyGameSetup'); if (!setup || setup.dataset.bound === 'true') return; setup.dataset.bound = 'true';
	setup.addEventListener('input', event => { if (event.target.matches('.lobby-setting-input') && event.target.tagName === 'INPUT' && event.target.type !== 'checkbox') updateLobbySettingsDraft(event.target); });
	setup.addEventListener('change', event => { if (event.target.matches('.lobby-setting-input')) updateLobbySettingsDraft(event.target); if (event.target.id === 'lobbyPresetFile' && event.target.files?.[0]) { importLobbyPresetFile(event.target.files[0]); event.target.value = ''; } });
	setup.addEventListener('click', event => { const tab = event.target.closest('[data-settings-tab]'); if (tab) { lobbySettingsActiveTab = tab.dataset.settingsTab; renderLobbyGameSetup(); return; } const actions = { lobbySettingsApply:applyLobbySettings, lobbySettingsReset:()=>{ lobbySettingsDraft=normalizeLobbySettings(lobbyGet(lobbyState,'settings','Settings')); lobbySettingsDirty=false; setLobbySettingsFeedback(''); renderLobbyGameSetup(); }, lobbySettingsClassic:()=>loadLobbyServerPreset('Classic'), lobbyPresetSave:saveLobbyLocalPreset, lobbyPresetLoad:loadLobbyLocalPreset, lobbyPresetDelete:deleteLobbyLocalPreset, lobbyPresetExport:exportLobbyPreset, lobbyPresetImport:()=>document.getElementById('lobbyPresetFile')?.click(), lobbyPasswordApply:updateLobbyPassword }; const action = actions[event.target.closest('button')?.id]; if (action) action(); });
}
function isLobbyRunning() {
	const lifecycle = lobbyGet(lobbyState, 'lifecycle', 'Lifecycle');
	const roomState = currentRoom?.state || currentRoom?.State;
	return lifecycle === 'Running' || roomState === 'Playing' || roomState === 'Started' || roomState === 'Voting';
}

function tryRenderRunningGameState() {
	if (!isLobbyRunning()) return false;

	if (currentRoom && (currentRoom.state === 'Lobby' || currentRoom.State === 'Lobby')) {
		currentRoom.state = 'Playing';
	}

	renderLobbyState();
	renderCurrentGameUI();
	return true;
}

function localizeLobbyLifecycle(value) { return t({ Lobby: 'lobbyLifecycleLobby', Running: 'lobbyLifecycleRunning', Finished: 'lobbyLifecycleFinished' }[value] || 'lobbyLifecycleLobby'); }
function localizeLobbyRole(value) { return t({ HostPlayer: 'lobbyRoleHostPlayer', Player: 'lobbyRolePlayer', Spectator: 'lobbyRoleSpectator', TechnicalGm: 'lobbyRoleTechnicalGm', OmniscientGm: 'lobbyRoleOmniscientGm' }[value] || 'lobbyRolePlayer'); }
function lobbyRoleHelp(value) { return t(value === 'Spectator' ? 'lobbyRoleSpectatorHelp' : value === 'TechnicalGm' ? 'lobbyRoleTechnicalHelp' : value === 'OmniscientGm' ? 'lobbyRoleOmniscientHelp' : 'lobbyRolePlayerHelp'); }
function localizeLobbyBlocker(code) {
	const key = { minimum_gameplay_players: 'lobbyBlockMinimum', maximum_gameplay_players:'lobbyWarningPlayers', connected_members_not_ready: 'lobbyBlockReady', invalid_lobby_role: 'lobbyBlockRole', active_voting: 'lobbyBlockVoting', active_threat: 'lobbyBlockThreat', not_current_host: 'lobbyBlockHost', host_missing: 'lobbyBlockHost', bunker_capacity_exceeds_players:'lobbyWarningCapacity', settings_revision_conflict:'lobbySettingsConflict' }[code];
	return t(key || 'lobbyBlockFallback');
}
function renderLobbyPreviewSummary(failed = false) {
	const output = document.getElementById('lobbyStartPreview'); if (!output) return;
	if (failed) { output.textContent = t('lobbyBlockFallback'); return; }
	if (!lobbyStartPreview) { output.textContent = ''; return; }
	const status = lobbyStartPreview.canStart ? t('lobbyPreviewReady') : t('lobbyPreviewBlocked');
	const guestCount = Number(lobbyStartPreview.guestGameplayPlayerCount ?? lobbyStartPreview.GuestGameplayPlayerCount ?? 0);
	const warning = guestCount > 0
		? `<div class="lobby-guest-warning"><strong>${escapeHtml(t('lobbyGuestCount').replace('{count}', String(guestCount)))}</strong><p>${escapeHtml(t('lobbyGuestRisk'))}</p></div>`
		: '';
	output.innerHTML = `<span>${escapeHtml(status)}</span>${warning}`;
}

function isGuestGameplayLobbyMember(member) {
	return Boolean(member &&
		lobbyGet(member, 'isGameplayParticipant', 'IsGameplayParticipant') &&
		!lobbyGet(member, 'isAccountBound', 'IsAccountBound') &&
		!lobbyGet(member, 'isSpectator', 'IsSpectator') &&
		!lobbyGet(member, 'isTechnicalGm', 'IsTechnicalGm') &&
		!lobbyGet(member, 'isOmniscientGm', 'IsOmniscientGm'));
}

function guestWarningStorageKey(roomCode, playerId, revision) {
	return `bunker:guest-warning:${roomCode}:${playerId}:${revision}`;
}

function showGuestWarningIfEligible(revision) {
	const members = lobbyGet(lobbyState, 'members', 'Members') || [];
	const playerId = getMyStablePlayerId();
	const member = members.find(item => lobbyGet(item, 'playerId', 'PlayerId') === playerId);
	const roomCode = currentRoom?.id || currentRoom?.Id || '';
	const numericRevision = Number(revision);
	if (!isGuestGameplayLobbyMember(member) || !roomCode || !playerId || !Number.isSafeInteger(numericRevision) || numericRevision < 1) return false;
	const key = guestWarningStorageKey(roomCode, playerId, numericRevision);
	if (localStorage.getItem(key) === 'acknowledged') return false;
	pendingGuestWarningStorageKey = key;
	const modal = document.getElementById('guestAccountWarningModal');
	if (!modal) return false;
	modal.hidden = false;
	document.getElementById('guestWarningContinueButton')?.focus();
	return true;
}

function hideGuestWarningModal(acknowledge = true) {
	if (acknowledge && pendingGuestWarningStorageKey) {
		localStorage.setItem(pendingGuestWarningStorageKey, 'acknowledged');
	}
	pendingGuestWarningStorageKey = '';
	const modal = document.getElementById('guestAccountWarningModal');
	if (modal) modal.hidden = true;
}

function continueAsGuest() {
	hideGuestWarningModal(true);
}

function registerFromGuestWarning() {
	window.open('/account/register', '_blank', 'noopener');
	hideGuestWarningModal(true);
}

function handleGuestWarningKeydown(event) {
	if (event.key === 'Escape') {
		event.preventDefault();
		hideGuestWarningModal(true);
		return;
	}
	if (event.key !== 'Tab') return;
	const modal = document.getElementById('guestAccountWarningModal');
	const controls = [...(modal?.querySelectorAll('button:not([disabled])') || [])];
	if (!controls.length) return;
	const first = controls[0];
	const last = controls[controls.length - 1];
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

function renderLobbyState() {
	const state = lobbyState; if (!state) return;
	document.querySelectorAll('[data-lobby-i18n]').forEach(element => { element.textContent = t(element.dataset.lobbyI18n); });
	document.querySelectorAll('[data-lobby-i18n-placeholder]').forEach(element => { element.placeholder = t(element.dataset.lobbyI18nPlaceholder); });
	const lifecycle = lobbyGet(state, 'lifecycle', 'Lifecycle') || 'Lobby';
	const members = lobbyGet(state, 'members', 'Members') || []; const connectedCount = lobbyGet(state, 'totalConnectedMembers', 'TotalConnectedMembers') || 0;
	const readyCount = lobbyGet(state, 'readyCount', 'ReadyCount') || 0; const readyRequiredCount = lobbyGet(state, 'readyRequiredCount', 'ReadyRequiredCount') || 0; const gameplayCount = lobbyGet(state, 'gameplayPlayerCount', 'GameplayPlayerCount') || 0;
	const meId = getMyStablePlayerId(); const me = members.find(member => lobbyGet(member, 'playerId', 'PlayerId') === meId);
	isHost = Boolean(lobbyGet(me, 'isCurrentHost', 'IsCurrentHost'));
	const focusedKey = document.activeElement?.dataset?.lobbyFocus || null;
	const summary = document.getElementById('lobbySummary');
	const countSeparator = getCurrentLanguage() === 'en' ? 'of' : getCurrentLanguage() === 'ru' ? 'из' : 'із';
	if (summary) summary.innerHTML = [
		[t('lobbyActivePlayers'), gameplayCount], [t('lobbySpectators'), lobbyGet(state, 'spectatorCount', 'SpectatorCount') || 0],
		[t('lobbyReadySummary'), `${readyCount} ${countSeparator} ${readyRequiredCount}`, 'lobby-summary-ready-legacy']
	].map(([label, value, className = '']) => `<article class="lobby-summary-card ${className}"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></article>`).join('');
	const list = document.getElementById('lobbyMembers');
	if (list) list.innerHTML = members.map(member => {
		const id = lobbyGet(member, 'playerId', 'PlayerId'); const role = lobbyGet(member, 'role', 'Role'); const host = lobbyGet(member, 'isCurrentHost', 'IsCurrentHost');
		const ready = lobbyGet(member, 'isReady', 'IsReady'); const connected = lobbyGet(member, 'isConnected', 'IsConnected'); const self = id === meId; const gameplay = lobbyGet(member, 'isGameplayParticipant', 'IsGameplayParticipant');
		const gmRole = lobbyGet(member, 'isTechnicalGm', 'IsTechnicalGm') || lobbyGet(member, 'isOmniscientGm', 'IsOmniscientGm');
		const displayName = String(lobbyGet(member, 'displayName', 'DisplayName') || '');
		const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part.charAt(0)).join('').toUpperCase() || '?';
		return `<article class="lobby-member-card ${ready ? 'is-ready' : ''} ${connected ? '' : 'is-offline'} ${role === 'Spectator' ? 'is-spectator' : ''}" data-player-id="${escapeHtml(String(id))}">
                <header class="lobby-member-header">
                    <div class="lobby-member-identity"><span class="lobby-member-avatar" aria-hidden="true">${escapeHtml(initials)}</span><div class="lobby-member-name"><strong>${escapeHtml(displayName)}</strong><div class="lobby-badges"><span class="lobby-role-badge">${escapeHtml(localizeLobbyRole(role))}</span>${host ? `<span class="lobby-host-badge">${t('lobbyHostBadge')}</span>` : ''}</div></div></div>
                    <div class="lobby-member-state"><span class="lobby-connection-state"><span class="lobby-connection-indicator ${connected ? 'online' : 'offline'}" aria-hidden="true"></span>${connected ? t('lobbyConnected') : t('lobbyDisconnected')}</span><span class="${ready ? 'lobby-ready-status' : 'lobby-not-ready-status'}">${ready ? t('lobbyReady') : t('lobbyNotReady')}</span></div>
                </header>
                ${self && gameplay ? `<button id="lobbyReadyButton" type="button" class="btn-success lobby-self-ready lobby-command" data-lobby-focus="ready-${escapeHtml(String(id))}" onclick="toggleLobbyReady()" ${lobbyCommandPending || lifecycle !== 'Lobby' ? 'disabled' : ''}>${ready ? t('lobbyCancelReady') : t('lobbyIAmReady')}</button>` : ''}
                ${isHost && lifecycle === 'Lobby' && !gmRole ? `<div class="lobby-host-controls"><div class="lobby-role-control"><span>${t('lobbyRoleLabel')}</span><span class="characteristic-with-tooltip"><button type="button" class="tooltip-trigger" aria-label="${escapeHtml(lobbyRoleHelp(role))}">?</button><span class="tooltip-content">${escapeHtml(lobbyRoleHelp(role))}</span></span></div><div class="lobby-segmented"><button class="lobby-command ${role === 'Player' || role === 'HostPlayer' ? 'active' : ''}" data-lobby-focus="player-${escapeHtml(String(id))}" onclick="setLobbyParticipation('${escapeHtml(String(id))}', false)">${t('lobbyRolePlayer')}</button><button class="lobby-command ${role === 'Spectator' ? 'active' : ''}" data-lobby-focus="spectator-${escapeHtml(String(id))}" onclick="setLobbyParticipation('${escapeHtml(String(id))}', true)">${t('lobbyRoleSpectator')}</button></div>${!host ? `<details class="lobby-player-menu"><summary aria-label="${escapeHtml(t('lobbyRoleLabel'))}">⋯</summary><div class="lobby-player-menu-panel"><button class="btn-secondary lobby-command" data-lobby-focus="reset-${escapeHtml(String(id))}" onclick="resetLobbyMemberReady('${escapeHtml(String(id))}')">${t('lobbyResetMemberReady')}</button><button class="btn-danger lobby-command" data-lobby-focus="kick-${escapeHtml(String(id))}" onclick="kickLobbyMember('${escapeHtml(String(id))}')">${t('lobbyKickMember')}</button><button class="btn-secondary lobby-transfer-host lobby-command" data-lobby-focus="host-${escapeHtml(String(id))}" onclick="transferLobbyHost('${escapeHtml(String(id))}')">${t('lobbyTransferHost')}</button></div></details>` : ''}</div>` : ''}
            </article>`;
	}).join('');
	if (focusedKey) [...document.querySelectorAll('[data-lobby-focus]')].find(element => element.dataset.lobbyFocus === focusedKey)?.focus({ preventScroll: true });
	window.reinitTooltips?.();
	const blockers = lobbyGet(state, 'blockers', 'Blockers') || []; const blockersEl = document.getElementById('lobbyBlockers');
	const waitingMembers = members.filter(member => lobbyGet(member, 'isGameplayParticipant', 'IsGameplayParticipant') && !lobbyGet(member, 'isReady', 'IsReady'));
	const waitingNames = waitingMembers.map(member => String(lobbyGet(member, 'displayName', 'DisplayName') || '')).filter(Boolean);
	const allReady = readyRequiredCount > 0 && readyCount >= readyRequiredCount && waitingMembers.length === 0;
	const validationBlockers = blockers.filter(blocker => blocker !== 'connected_members_not_ready');
	if (blockersEl) {
		const readinessMessage = allReady ? t('lobbyPreviewReady') : `${t('lobbyBlockReady')}${waitingNames.length ? `: ${waitingNames.join(', ')}` : ''}`;
		blockersEl.innerHTML = `<div class="lobby-waiting-row ${allReady ? 'is-ready' : ''}"><span aria-hidden="true">${allReady ? '✓' : '…'}</span><p>${escapeHtml(readinessMessage)}</p></div>${validationBlockers.map(blocker => `<div class="lobby-blocker-row"><span aria-hidden="true">!</span><p>${escapeHtml(localizeLobbyBlocker(blocker))}</p></div>`).join('')}`;
	}
	const readyProgress = document.getElementById('lobbyReadyProgress'); if (readyProgress) readyProgress.textContent = `${t('lobbyReadyProgress')}: ${readyCount} ${countSeparator} ${readyRequiredCount}`;
	const gameplayProgress = document.getElementById('lobbyGameplayProgress'); if (gameplayProgress) gameplayProgress.textContent = allReady ? t('lobbyPreviewReady') : t('lobbyHint');
	const readyMeter = document.getElementById('lobbyReadyMeter'); if (readyMeter) { readyMeter.max = Math.max(readyRequiredCount, 1); readyMeter.value = Math.min(readyCount, readyMeter.max); }
	const startSection = document.getElementById('lobbyStartSection'); if (startSection) startSection.classList.toggle('is-ready', allReady);
	const roomCode = document.getElementById('lobbyRoomCode'); if (roomCode) roomCode.textContent = `${t('lobbyRoomCode')}: ${currentRoom?.id || currentRoom?.Id || '—'}`;
	const capacity = document.getElementById('lobbyMemberCapacity'); if (capacity) capacity.textContent = `${t('lobbyParticipants')}: ${gameplayCount}`;
	const previewButton = document.getElementById('lobbyStartPreviewButton'); if (previewButton) { previewButton.style.display = isHost && lifecycle === 'Lobby' ? '' : 'none'; previewButton.disabled = lobbyCommandPending; }
	const canApplyStart = !!lobbyStartPreview?.canStart && !!lobbyGet(state, 'canStart', 'CanStart');
	['startGameBtn', 'lobbyStartPrimaryButton'].forEach(id => { const button = document.getElementById(id); if (!button) return; button.style.display = isHost && lifecycle === 'Lobby' ? 'inline-flex' : 'none'; button.disabled = lobbyCommandPending || !canApplyStart; button.style.pointerEvents = button.disabled ? 'none' : 'auto'; button.textContent = t('startGame'); });
	const copy = document.getElementById('copyInviteLinkBtn'); if (copy && lifecycle === 'Lobby') copy.textContent = t('lobbyCopyLink');
	const gm = document.getElementById('gmPanelBtn'); if (gm && lifecycle === 'Lobby') gm.textContent = t('lobbyGmPanel');
	const leave = document.querySelector('#roomSection .room-actions .btn-danger'); if (leave && lifecycle === 'Lobby') leave.textContent = t('lobbyLeave');
	document.getElementById('roomPlayersList').style.display = lifecycle === 'Lobby' ? 'none' : '';
	const waiting = document.getElementById('waitingText'); if (waiting) waiting.style.display = 'none';
	const roomLobby = document.getElementById('roomLobby'); const game = document.getElementById('gameSection'); const mine = document.getElementById('myPlayerSection');
	if (lifecycle === 'Lobby') { if (roomLobby) roomLobby.style.display = 'block'; if (game) game.style.display = 'none'; if (mine) mine.style.display = 'none'; }
	else if (lifecycle === 'Running') { if (roomLobby) roomLobby.style.display = 'none'; if (game) game.style.display = 'block'; if (mine) mine.style.display = lobbyGet(me, 'isGameplayParticipant', 'IsGameplayParticipant') ? 'block' : 'none'; }
	bindLobbySettingsControls(); renderLobbyGameSetup();
	renderLobbyPreviewSummary();
}

function toCamelCase(str) {
	return str.charAt(0).toLowerCase() + str.slice(1);
}

function getMyStablePlayerId() {
	return myPlayerData?.stablePlayerId ||
		roomPlayers?.[myConnectionId]?.stablePlayerId ||
		stablePlayerId ||
		"";
}

function isMyPlayerRef(connectionId, stableId) {
	const myStable = getMyStablePlayerId();
	return (!!connectionId && connectionId === myConnectionId) ||
		(!!stableId && !!myStable && stableId === myStable);
}

const specialCardIconSvgRegistry = Object.freeze({
	star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
	eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
	shield:'<path d="M12 2 4 5v6c0 5 3 9 8 11 5-2 8-6 8-11V5l-8-3Z"/><path d="m8 12 3 3 5-6"/>',
	hand:'<path d="M6 12V7a2 2 0 0 1 4 0v4-6a2 2 0 0 1 4 0v6-4a2 2 0 0 1 4 0v7c0 5-3 8-8 8-4 0-7-2-8-6l-1-4a2 2 0 0 1 4-1l1 1Z"/>',
	swap:'<path d="m7 7 3-3-3-3M10 4H5a3 3 0 0 0-3 3v3M17 17l-3 3 3 3M14 20h5a3 3 0 0 0 3-3v-3"/><path d="M5 14h14M19 10H5"/>',
	dice:'<rect x="3" y="3" width="18" height="18" rx="4"/><circle cx="8" cy="8" r="1"/><circle cx="16" cy="8" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="8" cy="16" r="1"/><circle cx="16" cy="16" r="1"/>',
	refresh:'<path d="M20 7V3l-3 3a8 8 0 1 0 2 9M4 17v4l3-3"/>',
	globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
	warning:'<path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5M12 18h.01"/>',
	backpack:'<path d="M7 8V6c0-5 10-5 10 0v2M5 8h14v13H5V8Z"/><path d="M8 13h8M3 11v7M21 11v7"/>',
	briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V4h8v3M3 12h18M10 12v2h4v-2"/>',
	heart:'<path d="M12 21S3 16 3 9c0-5 6-7 9-3 3-4 9-2 9 3 0 7-9 12-9 12Z"/><path d="M7 12h3l2-4 2 8 2-4h2"/>',
	brain:'<path d="M9 4a3 3 0 0 0-5 3 4 4 0 0 0 0 7 3 3 0 0 0 5 4M15 4a3 3 0 0 1 5 3 4 4 0 0 1 0 7 3 3 0 0 1-5 4M9 4v16M15 4v16M9 8h3M12 15h3"/>'
});

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
	return { reveal:'eye', protect:'shield', steal:'hand', swap:'swap', reroll:'dice', change:'refresh', global:'globe', threat:'warning', inventory:'backpack', neutral:'star' }[visualVariant] || 'star';
}

function getSpecialCardVariantLabel(variant) {
	const key = { reveal:'specialVariantReveal', protect:'specialVariantProtect', steal:'specialVariantSteal', swap:'specialVariantSwap', reroll:'specialVariantReroll', change:'specialVariantChange', global:'specialVariantGlobal', threat:'specialVariantThreat', inventory:'specialVariantInventory', neutral:'specialVariantNeutral' }[variant] || 'specialVariantNeutral';
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
		model.targetType ? { label:t('target'), value:model.targetLabel } : null,
		model.stageRestriction ? { label:t('specialStageLabel'), value:model.stageRestriction } : null
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

function updateSpecialCardsUI() {
	const section = document.getElementById('specialCardsSection');
	const tbody = document.getElementById('specialCardsTableBody');
	const gmList = document.getElementById('gmSpecialCardsList');
	const shouldShow = currentRoom && currentRoom.state !== 'Lobby';
	const rows = buildSpecialCardRows();

	if (section && tbody) {
		section.style.display = shouldShow ? 'block' : 'none';
		tbody.innerHTML = renderSpecialCardRows(rows, false);
	}

	if (gmList) {
		if (isHost && shouldShow) {
			gmList.style.display = 'grid';
			gmList.innerHTML = renderSpecialCardRows(buildGMSpecialCardRows(), true);
		} else {
			gmList.style.display = 'none';
			gmList.innerHTML = '';
		}
	}
}

const publicCharacteristicDefinitions = Object.freeze([
	{ key: 'personality', labelKey: 'personality', icon: 'user' },
	{ key: 'body', labelKey: 'body', icon: 'body' },
	{ key: 'profession', labelKey: 'profession', icon: 'briefcase' },
	{ key: 'physicalHealth', labelKey: 'physicalHealth', icon: 'heart' },
	{ key: 'mentalHealth', labelKey: 'mentalHealth', icon: 'brain' },
	{ key: 'hobby', labelKey: 'hobby', icon: 'star' },
	{ key: 'characterTrait', labelKey: 'characterTrait', icon: 'mask' },
	{ key: 'phobia', labelKey: 'phobia', icon: 'eye' },
	{ key: 'inventory', labelKey: 'inventory', icon: 'backpack' },
	{ key: 'property', labelKey: 'property', icon: 'home' },
	{ key: 'fact', labelKey: 'fact', icon: 'document' }
]);

function isPublicGameplayPlayer(player) {
	if (!player || player.isSpectatorGm || player.IsSpectatorGm) return false;
	const role = String(player.publicRole || player.PublicRole || 'player').toLowerCase().replace(/[_\s-]/g, '');
	return !['spectator', 'technicalgm', 'omniscientgm'].includes(role);
}

function getCanonicalPublicPlayerModels(options = null) {
	const activeOnly = options?.activeOnly === true;
	const players = Object.values(roomPlayers || {})
		.filter(isPublicGameplayPlayer)
		.filter(player => !activeOnly || (!(player.isEliminated || player.IsEliminated) && (player.isConnected ?? player.IsConnected ?? true)))
		.sort((a, b) => {
			const seatA = Number(a.seatNumber ?? a.SeatNumber) || Number.MAX_SAFE_INTEGER;
			const seatB = Number(b.seatNumber ?? b.SeatNumber) || Number.MAX_SAFE_INTEGER;
			return seatA - seatB;
		});

	return players.map((player, index) => ({
		player,
		seat: Number(player.seatNumber ?? player.SeatNumber) || index + 1
	}));
}

function getPublicActivePlayerSeat(models = getCanonicalPublicPlayerModels()) {
	const directSeat = Number(currentRoundState?.activePlayerSeatNumber || 0);
	if (directSeat > 0 && models.some(model => model.seat === directSeat)) return directSeat;
	const connectionRef = currentRoundState?.activePlayerConnectionId || '';
	const stableRef = currentRoundState?.activePlayerStableId || '';
	return models.find(({ player }) =>
		(connectionRef && (player.connectionId || player.ConnectionId) === connectionRef) ||
		(stableRef && (player.stablePlayerId || player.StablePlayerId) === stableRef)
	)?.seat || null;
}

function resolveSelectedPublicPlayer(models) {
	if (models.length === 0) return null;
	const retained = models.find(model => model.seat === selectedPublicPlayerSeat);
	if (retained) return retained;

	if (Number.isFinite(selectedPublicPlayerSeat)) {
		return models.reduce((nearest, model) =>
			Math.abs(model.seat - selectedPublicPlayerSeat) < Math.abs(nearest.seat - selectedPublicPlayerSeat) ? model : nearest,
		models[0]);
	}

	const self = models.find(({ player }) =>
		!(player.isEliminated || player.IsEliminated) &&
		isMyPlayerRef(player.connectionId || player.ConnectionId, player.stablePlayerId || player.StablePlayerId));
	if (self) return self;
	const activeSeat = getPublicActivePlayerSeat(models);
	return models.find(model => model.seat === activeSeat) ||
		models.find(({ player }) => !(player.isEliminated || player.IsEliminated)) ||
		models[0];
}

function selectPublicPlayerSeat(seat, focusSelector = false) {
	const parsedSeat = Number(seat);
	if (!Number.isInteger(parsedSeat)) return;
	selectedPublicPlayerSeat = parsedSeat;
	renderPublicPlayerOverview();
	if (focusSelector) document.querySelector(`#publicPlayerSelector [data-player-seat="${parsedSeat}"]`)?.focus({ preventScroll: true });
}

function navigatePublicPlayerOverview(direction) {
	const models = getCanonicalPublicPlayerModels();
	if (models.length === 0) return;
	const current = resolveSelectedPublicPlayer(models) || models[0];
	const index = Math.max(0, models.findIndex(model => model.seat === current.seat));
	const nextIndex = (index + direction + models.length) % models.length;
	selectPublicPlayerSeat(models[nextIndex].seat, true);
}

function ensurePublicPlayerOverviewEvents() {
	const shell = document.getElementById('publicPlayerOverview');
	if (!shell || shell.dataset.overviewEventsBound === 'true') return;
	shell.dataset.overviewEventsBound = 'true';
	shell.addEventListener('click', event => {
		const viewButton = event.target.closest('[data-player-view]');
		if (viewButton && shell.contains(viewButton)) {
			publicPlayerViewMode = viewButton.dataset.playerView === 'single' ? 'single' : 'all';
			renderPublicPlayerOverview();
			return;
		}
		const playerButton = event.target.closest('[data-player-seat]');
		if (playerButton && shell.contains(playerButton)) {
			selectPublicPlayerSeat(playerButton.dataset.playerSeat, true);
			return;
		}
		const navigation = event.target.closest('[data-overview-nav]');
		if (navigation && shell.contains(navigation)) navigatePublicPlayerOverview(navigation.dataset.overviewNav === 'next' ? 1 : -1);
	});
	shell.addEventListener('keydown', event => {
		if (!event.target.closest('#publicPlayerSelector')) return;
		if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
		event.preventDefault();
		navigatePublicPlayerOverview(['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1);
	});
	shell.addEventListener('change', event => {
		if (event.target.id !== 'playerComparisonSort') return;
		publicPlayerSortMode = ['seat', 'name', 'revealed-desc', 'revealed-asc'].includes(event.target.value) ? event.target.value : 'seat';
		renderAllPlayersComparison();
	});
}

function renderPublicPlayerBadges(player, seat, activeSeat) {
	const isMe = isMyPlayerRef(player.connectionId || player.ConnectionId, player.stablePlayerId || player.StablePlayerId);
	const eliminated = !!(player.isEliminated || player.IsEliminated);
	const badges = [
		player.isHost || player.IsHost ? `<span class="player-overview-badge badge-host">${t('host')}</span>` : '',
		isMe ? `<span class="player-overview-badge badge-you">${t('you')}</span>` : '',
		seat === activeSeat ? `<span class="player-overview-badge badge-turn">${t('activePlayer')}</span>` : '',
		eliminated ? `<span class="player-overview-badge badge-eliminated">${t('eliminated')}</span>` : `<span class="player-overview-badge badge-active">${t('playerActive')}</span>`
	];
	if (player.isConnected !== undefined || player.IsConnected !== undefined) {
		const connected = player.isConnected ?? player.IsConnected;
		badges.push(`<span class="player-overview-badge ${connected ? 'badge-online' : 'badge-offline'}">${connected ? t('playerOnline') : t('playerOffline')}</span>`);
	}
	return badges.filter(Boolean).join('');
}

function renderPublicPlayerSelectorItem(model, activeSeat) {
	const { player, seat } = model;
	const selected = seat === selectedPublicPlayerSeat;
	const eliminated = !!(player.isEliminated || player.IsEliminated);
	const connected = player.isConnected ?? player.IsConnected ?? true;
	return `<button type="button" class="player-selector-item${selected ? ' is-selected' : ''}${eliminated ? ' is-eliminated' : ''}${connected ? '' : ' is-offline'}" role="option" aria-selected="${selected}" data-player-seat="${seat}">
		<span class="player-selector-seat">#${seat}</span>
		<span class="player-selector-name">${escapeHtml(player.name || player.Name || t('playerLabel'))}</span>
		<span class="player-selector-badges">${renderPublicPlayerBadges(player, seat, activeSeat)}</span>
	</button>`;
}

function renderPublicCharacteristicCard(player, definition) {
	const { key, labelKey, icon } = definition;
	const label = t(labelKey);
	const revealed = !!player.revealed?.[key];
	if (!revealed) {
		return `<article class="public-characteristic-card is-sealed type-${key}" data-characteristic="${key}" data-revealed="false">
			<header><span class="public-characteristic-icon">${renderCharacteristicIcon(icon)}</span><h4>${escapeHtml(label)}</h4></header>
			<div class="public-characteristic-seal"><span class="public-lock-icon" aria-hidden="true">${renderCharacteristicIcon('lock')}</span><span>${t('notRevealed')}</span></div>
		</article>`;
	}

	const value = getLocalizedRevealedValue(player, key) || t('noData');
	const tooltipData = getLocalizedRevealedTooltip(player, key);
	const tooltip = tooltipData ? `<span class="characteristic-with-tooltip public-characteristic-tooltip"><button type="button" class="tooltip-trigger ${getTooltipTypeClass(key)}" aria-label="${escapeHtml(label)}" aria-expanded="false">!</button><span class="tooltip-content">${escapeHtml(tooltipData)}</span></span>` : '';
	const additional = key === 'physicalHealth'
		? renderAdditionalPhysicalConditionsForOverview(player)
		: key === 'property'
			? renderPublicPropertyDetails(player)
			: '';
	return `<article class="public-characteristic-card is-revealed type-${key}" data-characteristic="${key}" data-revealed="true">
		<header><span class="public-characteristic-icon">${renderCharacteristicIcon(icon)}</span><h4>${escapeHtml(label)}</h4>${tooltip}</header>
		<div class="public-characteristic-value">${escapeHtml(value)}</div>${additional}
	</article>`;
}

function renderPublicPropertyDetails(player) {
	const presentation = getPropertyPresentation(getRevealedSource(player, 'property'));
	return presentation.details.length
		? `<div class="public-property-details">${presentation.details.map(detail =>
			`<div class="public-property-detail"><span>${escapeHtml(detail.label)}</span><strong>${escapeHtml(detail.value)}</strong></div>`
		).join('')}</div>`
		: '';
}

function getPublicRevealedCount(player) {
	return publicCharacteristicDefinitions.reduce((count, definition) => count + (player?.revealed?.[definition.key] ? 1 : 0), 0);
}

function sortPublicPlayerModels(models, sortMode = publicPlayerSortMode) {
	const sorted = [...models];
	const bySeat = (a, b) => a.seat - b.seat;
	if (sortMode === 'name') {
		return sorted.sort((a, b) => String(a.player.name || a.player.Name || '').localeCompare(String(b.player.name || b.player.Name || ''), getCurrentLanguage(), { sensitivity: 'base' }) || bySeat(a, b));
	}
	if (sortMode === 'revealed-desc' || sortMode === 'revealed-asc') {
		const direction = sortMode === 'revealed-desc' ? -1 : 1;
		return sorted.sort((a, b) => direction * (getPublicRevealedCount(a.player) - getPublicRevealedCount(b.player)) || bySeat(a, b));
	}
	return sorted.sort(bySeat);
}

function renderComparisonCharacteristic(player, definition) {
	const { key, labelKey, icon } = definition;
	const label = t(labelKey);
	const revealed = !!player?.revealed?.[key];
	if (!revealed) {
		return `<div class="comparison-characteristic is-sealed type-${key}" data-characteristic="${key}" data-revealed="false">
			<span class="comparison-characteristic-icon" aria-hidden="true">${renderCharacteristicIcon(icon)}</span>
			<span class="comparison-characteristic-copy"><strong>${escapeHtml(label)}</strong><span class="comparison-sealed-value"><span class="comparison-lock" aria-hidden="true">${renderCharacteristicIcon('lock')}</span>${t('notRevealed')}</span></span>
		</div>`;
	}

	const value = getLocalizedRevealedValue(player, key) || t('noData');
	const tooltipData = getLocalizedRevealedTooltip(player, key);
	const tooltip = tooltipData ? `<span class="characteristic-with-tooltip comparison-tooltip"><button type="button" class="tooltip-trigger ${getTooltipTypeClass(key)}" aria-label="${escapeHtml(label)}" aria-expanded="false">!</button><span class="tooltip-content">${escapeHtml(tooltipData)}</span></span>` : '';
	const additional = key === 'physicalHealth'
		? renderAdditionalPhysicalConditionsForOverview(player)
		: key === 'property'
			? renderPublicPropertyDetails(player)
			: '';
	return `<div class="comparison-characteristic is-revealed type-${key}" data-characteristic="${key}" data-revealed="true">
		<span class="comparison-characteristic-icon" aria-hidden="true">${renderCharacteristicIcon(icon)}</span>
		<span class="comparison-characteristic-copy"><strong>${escapeHtml(label)}</strong><span class="comparison-public-value">${escapeHtml(value)}</span>${additional}</span>${tooltip}
	</div>`;
}

function renderPlayerDossierCard(model, activeSeat) {
	const { player, seat } = model;
	const revealedCount = getPublicRevealedCount(player);
	const progress = t('revealedProgress').replace('{shown}', revealedCount).replace('{total}', publicCharacteristicDefinitions.length);
	return `<article class="player-dossier-card${player.isEliminated || player.IsEliminated ? ' is-eliminated' : ''}" data-canonical-seat="${seat}">
		<header class="player-dossier-header">
			<div class="player-dossier-identity"><span class="player-dossier-seat">#${seat}</span><div><h3>${escapeHtml(player.name || player.Name || t('playerLabel'))}</h3><span class="player-dossier-progress">${escapeHtml(progress)}</span></div></div>
			<div class="player-dossier-badges">${renderPublicPlayerBadges(player, seat, activeSeat)}</div>
		</header>
		<div class="player-dossier-characteristics">${publicCharacteristicDefinitions.map(definition => renderComparisonCharacteristic(player, definition)).join('')}</div>
	</article>`;
}

function renderAllPlayersComparison(state = null) {
	const grid = document.getElementById('playerDossierGrid');
	if (!grid) return;
	const models = state?.models || getCanonicalPublicPlayerModels();
	if (!models.length) {
		grid.innerHTML = `<div class="player-overview-empty">${t('noAvailablePlayers')}</div>`;
		return;
	}
	const activeSeat = state?.activeSeat ?? getPublicActivePlayerSeat(models);
	grid.innerHTML = sortPublicPlayerModels(models).map(model => renderPlayerDossierCard(model, activeSeat)).join('');
	window.reinitTooltips?.();
}

function updatePublicPlayerComparisonToolbar() {
	const shell = document.getElementById('publicPlayerOverview');
	if (!shell) return;
	const labels = { all: t('allPlayersView'), single: t('singlePlayerView') };
	for (const button of shell.querySelectorAll('[data-player-view]')) {
		const active = button.dataset.playerView === publicPlayerViewMode;
		button.textContent = labels[button.dataset.playerView] || labels.all;
		button.classList.toggle('is-active', active);
		button.setAttribute('aria-pressed', String(active));
	}
	const toggle = shell.querySelector('.view-mode-toggle');
	if (toggle) toggle.setAttribute('aria-label', t('playerViewMode'));
	const sortField = shell.querySelector('.comparison-sort-field');
	if (sortField) {
		sortField.hidden = publicPlayerViewMode !== 'all';
		const label = sortField.querySelector('span');
		if (label) label.textContent = t('comparisonSort');
	}
	const sort = document.getElementById('playerComparisonSort');
	if (sort) {
		const labelsByValue = { seat: t('sortBySeat'), name: t('sortByName'), 'revealed-desc': t('sortMostRevealed'), 'revealed-asc': t('sortLeastRevealed') };
		for (const option of sort.options) option.textContent = labelsByValue[option.value] || option.textContent;
		sort.value = publicPlayerSortMode;
	}
}

function renderPublicPlayerOverview() {
	const shell = document.getElementById('publicPlayerOverview');
	const comparison = document.getElementById('allPlayersComparison');
	const singleOverview = document.getElementById('singlePlayerOverview');
	const selector = document.getElementById('publicPlayerSelector');
	const panel = document.getElementById('selectedPlayerPanel');
	if (!shell || !comparison || !singleOverview || !selector || !panel) return;
	ensurePublicPlayerOverviewEvents();
	updatePublicPlayerComparisonToolbar();
	const title = document.getElementById('publicPlayerOverviewTitle');
	if (title) title.textContent = t('playerOverviewTitle');
	selector.setAttribute('aria-label', t('playerOverviewTitle'));
	const roomState = String(currentRoom?.state || currentRoom?.State || '').toLowerCase();
	if (!roomState || roomState === 'lobby') {
		selectedPublicPlayerSeat = null;
		publicPlayerViewMode = 'all';
		selector.innerHTML = '';
		panel.innerHTML = '';
		document.getElementById('playerDossierGrid').innerHTML = '';
		return;
	}

	const models = getCanonicalPublicPlayerModels();
	const activePlayers = models.filter(({ player }) => !(player.isEliminated || player.IsEliminated));
	const count = document.getElementById('playerCount');
	if (count) count.textContent = `${activePlayers.length}/${currentBunkerCapacity || currentRoom?.maxPlayers || 12}`;
	if (models.length === 0) {
		selectedPublicPlayerSeat = null;
		selector.innerHTML = '';
		panel.innerHTML = `<div class="player-overview-empty">${t('noAvailablePlayers')}</div>`;
		renderAllPlayersComparison({ models });
		return;
	}
	const canonicalSeatsReady = models.every(({ player }) => Number(player.seatNumber ?? player.SeatNumber) > 0);
	if (!canonicalSeatsReady) {
		selectedPublicPlayerSeat = null;
		selector.innerHTML = '';
		panel.innerHTML = '';
		document.getElementById('playerDossierGrid').innerHTML = '';
		return;
	}

	const selected = resolveSelectedPublicPlayer(models);
	selectedPublicPlayerSeat = selected.seat;
	const activeSeat = getPublicActivePlayerSeat(models);
	comparison.hidden = publicPlayerViewMode !== 'all';
	singleOverview.hidden = publicPlayerViewMode !== 'single';
	renderAllPlayersComparison({ models, activeSeat });
	selector.innerHTML = models.map(model => renderPublicPlayerSelectorItem(model, activeSeat)).join('');
	const { player, seat } = selected;
	const revealedCount = publicCharacteristicDefinitions.filter(definition => !!player.revealed?.[definition.key]).length;
	const progress = t('revealedProgress').replace('{shown}', revealedCount).replace('{total}', publicCharacteristicDefinitions.length);
	const disableNavigation = models.length < 2 ? ' disabled aria-disabled="true"' : '';
	panel.innerHTML = `<header class="selected-player-header">
		<div class="selected-player-heading"><span class="selected-player-kicker">${t('playerLabel')} #${seat}</span><h3>${escapeHtml(player.name || player.Name || t('playerLabel'))}</h3><div class="selected-player-status">${renderPublicPlayerBadges(player, seat, activeSeat)}</div></div>
		<div class="selected-player-tools"><span class="selected-player-progress">${escapeHtml(progress)}</span><div class="selected-player-navigation" aria-label="${t('playerOverviewTitle')}"><button type="button" data-overview-nav="previous" aria-label="${t('previousPlayer')}"${disableNavigation}>‹</button><button type="button" data-overview-nav="next" aria-label="${t('nextPlayer')}"${disableNavigation}>›</button></div></div>
	</header><div class="public-characteristics-grid">${publicCharacteristicDefinitions.map(definition => renderPublicCharacteristicCard(player, definition)).join('')}</div>`;
	window.reinitTooltips?.();
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

const characteristicIconRegistry = Object.freeze({
	personality: 'user', body: 'body', profession: 'briefcase', physicalHealth: 'heart', mentalHealth: 'brain',
	hobby: 'star', characterTrait: 'mask', phobia: 'eye', inventory: 'backpack', property: 'home', fact: 'document'
});

const professionIconRegistry = Object.freeze({
	violin: 'violin', string_instrument: 'violin', guitar: 'guitar', music: 'music', medical: 'medical', medicine: 'medical', healthcare: 'medical',
	engineering: 'engineering', engineer: 'engineering', military: 'shield', agriculture: 'wheat', transport: 'steeringWheel', science: 'flask',
	technology: 'cpu', education: 'book', construction: 'hammer', law: 'scales', food: 'utensils', restaurant: 'cloche', hospitality: 'cloche',
	food_service: 'cloche', service: 'serviceBell', chef: 'chefHat', waiter: 'serviceBell', generic: 'briefcase'
});

const characteristicIconSvgRegistry = Object.freeze({
	user:'<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-5 3.5-7 8-7s7.2 2 8 7"/>',
	body:'<path d="M8 3h8l2 6-3 12H9L6 9l2-6Z"/><path d="M8 8h8M9 14h6"/>',
	briefcase:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18M10 12v2h4v-2"/>',
	violin:'<path d="M15 3c-2 1-2 4-1 6l-4 4c-2-1-5-1-6 1s1 6 4 6c2 0 3-2 3-4l4-4c2 1 5 0 5-2 0-3-3-5-5-4"/><path d="m16 8 5-5M18 5l2 2"/>',
	guitar:'<path d="m15 3 6 6-3 3-2-2-5 5c1 3-2 6-5 5s-3-5-1-7 4-2 6-1l5-5-2-2 1-3Z"/>',
	music:'<path d="M9 18V5l11-2v13M9 8l11-2"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
	medical:'<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z"/>',
	engineering:'<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
	shield:'<path d="M12 2 20 5v6c0 5-3 9-8 11-5-2-8-6-8-11V5l8-3Z"/>',
	wheat:'<path d="M12 22V6M12 10C7 9 6 6 6 4c4 0 6 2 6 6ZM12 15c-5-1-6-4-6-6 4 0 6 2 6 6ZM12 10c5-1 6-4 6-6-4 0-6 2-6 6ZM12 15c5-1 6-4 6-6-4 0-6 2-6 6Z"/>',
	steeringWheel:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M3 11h18M12 14v7M10 10 6 6M14 10l4-4"/>',
	flask:'<path d="M9 2h6M10 2v6l-6 11c-.5 1 .2 2 1.5 2h13c1.3 0 2-1 1.5-2L14 8V2M7 15h10"/>',
	cpu:'<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 1v5M15 1v5M9 18v5M15 18v5M1 9h5M18 9h5M1 15h5M18 15h5"/>',
	book:'<path d="M3 4h7c2 0 2 2 2 2v15s0-2-2-2H3V4Zm18 0h-7c-2 0-2 2-2 2v15s0-2 2-2h7V4Z"/>',
	hammer:'<path d="m4 20 9-9M10 4l3-2 7 7-2 3-8-8ZM2 18l4 4"/>',
	scales:'<path d="M12 3v18M6 21h12M4 7h16M7 7 3 14h8L7 7Zm10 0-4 7h8l-4-7Z"/>',
	utensils:'<path d="M6 2v8M3 2v5c0 2 6 2 6 0V2M6 10v12M16 2v20M16 2c5 3 5 9 0 11"/>',
	cloche:'<path d="M3 17h18M5 17a7 7 0 0 1 14 0M12 7V5M9 5h6"/>',
	serviceBell:'<path d="M4 17h16M6 17c0-5 2-8 6-8s6 3 6 8M12 9V7M9 7h6M3 20h18"/>',
	chefHat:'<path d="M7 11a4 4 0 1 1 2-7 4 4 0 0 1 7 0 4 4 0 1 1 2 7v9H6v-9M9 15v5M15 15v5"/>',
	heart:'<path d="M12 21S3 16 3 9c0-5 6-7 9-3 3-4 9-2 9 3 0 7-9 12-9 12Z"/><path d="M7 12h3l2-4 2 8 2-4h2"/>',
	brain:'<path d="M9 4a3 3 0 0 0-5 3 4 4 0 0 0 0 7 3 3 0 0 0 5 4M15 4a3 3 0 0 1 5 3 4 4 0 0 1 0 7 3 3 0 0 1-5 4M9 4v16M15 4v16M9 8h3M12 15h3"/>',
	star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
	mask:'<path d="M3 5c6-3 12-3 18 0v7c0 6-5 10-9 10S3 18 3 12V5Z"/><path d="M6 10c2-2 4-2 5 0M13 10c2-2 4-2 5 0M9 16c2 1 4 1 6 0"/>',
	eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
	backpack:'<path d="M7 8V6c0-5 10-5 10 0v2M5 8h14v13H5V8Z"/><path d="M8 13h8M3 11v7M21 11v7"/>',
	home:'<path d="m3 11 9-8 9 8v10H3V11Z"/><path d="M9 21v-7h6v7M7 10h10"/>',
	document:'<path d="M6 2h9l4 4v16H6V2Z"/><path d="M14 2v5h5M9 12h7M9 16h7"/>'
	,lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>'
});

function normalizeProfessionIconTags(profession) {
	const raw = profession?.capabilityTags || profession?.CapabilityTags || profession?.tags || profession?.Tags || [];
	return (Array.isArray(raw) ? raw : [raw]).map(tag => String(tag).trim().toLowerCase().replace(/[\s-]+/g, '_')).filter(Boolean);
}

function resolveProfessionIconKey(profession) {
	const tags = normalizeProfessionIconTags(profession);
	const priority = ['violin','string_instrument','guitar','chef','waiter','restaurant','food_service','hospitality','service','music','medical','medicine','healthcare','engineering','engineer','military','agriculture','transport','science','technology','education','construction','law','food'];
	const match = priority.find(tag => tags.includes(tag));
	return professionIconRegistry[match] || professionIconRegistry.generic;
}

function renderCharacteristicIcon(iconKey) {
	const body = characteristicIconSvgRegistry[iconKey] || characteristicIconSvgRegistry.briefcase;
	return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

function nonEmptyCardDetail(label, value) {
	return value !== null && value !== undefined && String(value).trim() !== '' ? { label, value: String(value) } : null;
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
		uk: { one:'рік', few:'роки', many:'років', other:'року' },
		ru: { one:'год', few:'года', many:'лет', other:'года' },
		en: { one:'year', few:'years', many:'years', other:'years' }
	};
	const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(numericValue);
	return `${number} ${labels[language][plural] || labels[language].other}`;
}

function formatHobbyRelatedItem(value) {
	if (value === null || value === undefined) return '';
	if (typeof value !== 'object') return String(value).trim();
	return cleanTooltipText(getLocalizedValue(value, 'item') || getLocalizedValue(value, 'name') || value.item || value.Item || value.name || value.Name || '');
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
	if (tags.some(tag => ['dark','violent','criminal','dangerous','disturbing','horror'].includes(tag))) return 'dark';
	if (tags.some(tag => ['positive','supportive','beneficial','healing'].includes(tag))) return 'positive';
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

// Рендер карток моїх характеристик
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
	const profession = player.profession || {};
	const physicalHealth = player.physicalHealth || {};
	const mentalHealth = player.mentalHealth || {};
	const hobby = player.hobby || {};
	const characterTrait = player.characterTrait || {};
	const phobia = player.phobia || {};
	const inventory = player.inventory || {};
	const property = player.property || {};
	const fact = normalizeFactFromPlayer(player);
	const professionItem = profession.professionItem || player.professionItem || {};
	const localizedProfessionItem = getLocalizedValue(professionItem, 'item') || getLocalizedValue(professionItem, 'name') || professionItem.name || professionItem.Name || profession.selectedItem || '';
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
		{ type:'Personality', categoryLabel:t('personality'), value:`${personality.age} ${t('years')}`, iconKey:characteristicIconRegistry.personality, details:[nonEmptyCardDetail(t('sex'), `${personality.sex || ''}${personality.isChildfree ? ` · ${t('cardChildfree')}` : ''}`), nonEmptyCardDetail(t('orientation'), personality.sexOrientation)], tooltip:'', isRevealed:revealed.personality, canReveal:true, revealAction:'Personality' },
		{ type:'Body', categoryLabel:t('body'), value:body.bodyType || t('body'), iconKey:characteristicIconRegistry.body, details:[nonEmptyCardDetail(t('height'), body.height ? `${body.height} см` : ''), nonEmptyCardDetail(t('weight'), body.weight ? `${body.weight} кг` : '')], tooltip:'', isRevealed:revealed.body, canReveal:true, revealAction:'Body' },
		{ type:'Profession', categoryLabel:t('profession'), value:getLocalizedValue(profession, 'profession') || getLocalizedValue(profession, 'name') || profession.name || t('profession'), iconKey:resolveProfessionIconKey(profession), details:[nonEmptyCardDetail(t('cardExperience'), Number(profession.experienceYears) > 0 ? `${profession.experienceYears} ${t('years')}` : ''), nonEmptyCardDetail(t('cardAdditionalItem'), localizedProfessionItem)], tooltip:profession.tooltip, variantSource:profession, isRevealed:revealed.profession, canReveal:true, revealAction:'Profession' },
		{ type:'PhysicalHealth', categoryLabel:t('physicalHealth'), value:physicalPresentation.value || t('physicalHealth'), iconKey:characteristicIconRegistry.physicalHealth, details:[nonEmptyCardDetail(t('cardSeverity'), physicalPresentation.severity)], tooltipHtml:buildSharedHealthTooltip(physicalHealth, { requireExplanation:true }), variantSource:physicalHealth, visualFamily:'medical', isRevealed:revealed.physicalHealth, canReveal:true, revealAction:'PhysicalHealth', supplementalHtml:additionalConditionsHtml },
		{ type:'MentalHealth', categoryLabel:t('mentalHealth'), value:mentalPresentation.value || t('mentalHealth'), iconKey:characteristicIconRegistry.mentalHealth, details:[nonEmptyCardDetail(t('cardSeverity'), mentalPresentation.severity)], tooltipHtml:buildSharedHealthTooltip(mentalHealth, { requireExplanation:true }), variantSource:mentalHealth, visualFamily:'mental', isRevealed:revealed.mentalHealth, canReveal:true, revealAction:'MentalHealth' },
		{ type:'Hobby', categoryLabel:t('hobby'), value:getLocalizedValue(hobby, 'hobby') || getLocalizedValue(hobby, 'name') || hobby.name || t('hobby'), iconKey:characteristicIconRegistry.hobby, details:hobbyCardDetails.details, tooltip:resolveHobbyCardTooltip(hobby, hobbyCardDetails.item), variantSource:hobby, isRevealed:revealed.hobby, canReveal:true, revealAction:'Hobby' },
		{ type:'CharacterTrait', categoryLabel:t('characterTrait'), value:getLocalizedValue(characterTrait, 'trait') || getLocalizedValue(characterTrait, 'name') || characterTrait.name || t('characterTrait'), iconKey:characteristicIconRegistry.characterTrait, details:[], tooltip:characterTrait.description || characterTrait.gameEffect || characterTrait.bunkerEffect || characterTrait.tooltip, variantSource:characterTrait, isRevealed:revealed.characterTrait, canReveal:true, revealAction:'CharacterTrait' },
		{ type:'Phobia', categoryLabel:t('phobia'), value:getLocalizedValue(phobia, 'phobia') || getLocalizedValue(phobia, 'name') || phobia.name || t('phobia'), iconKey:characteristicIconRegistry.phobia, details:[], tooltip:getLocalizedValue(phobia, 'description') || phobia.description || phobia.gameEffect || phobia.tooltip, variantSource:phobia, isRevealed:revealed.phobia, canReveal:true, revealAction:'Phobia' },
		{ type:'Inventory', categoryLabel:t('inventory'), value:inventoryItems.join(', ') || t('empty'), iconKey:characteristicIconRegistry.inventory, details:[], tooltip:inventoryTooltip, variantSource:inventory, isRevealed:revealed.inventory, canReveal:true, revealAction:'Inventory' },
		{ type:'Property', categoryLabel:t('property'), value:propertyPresentation.title, iconKey:characteristicIconRegistry.property, details:propertyPresentation.details, tooltip:'', variantSource:property, isRevealed:revealed.property, canReveal:!!property.definitionId, revealAction:'Property' },
		{ type:'Fact', categoryLabel:t('fact'), value:getLocalizedValue(fact, 'fact') || getLocalizedValue(fact, 'name') || fact.name || t('noFact'), iconKey:characteristicIconRegistry.fact, details:[], tooltip:fact.description || fact.tooltip || '', variantSource:fact, isRevealed:revealed.fact || revealed.Fact, canReveal:true, revealAction:'Fact' }
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

function addEventMessage(message) {
	const eventDiv = document.getElementById("events");
	const eventItem = document.createElement("div");
	eventItem.className = "event-item";
	eventItem.innerHTML = message;

	const placeholder = eventDiv.querySelector('p');
	if (placeholder) placeholder.remove();

	eventDiv.insertBefore(eventItem, eventDiv.firstChild);
	while (eventDiv.children.length > 50) {
		eventDiv.removeChild(eventDiv.lastChild);
	}
}

