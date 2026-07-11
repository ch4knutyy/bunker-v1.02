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
    let gmPlayersData = {}; // Повні дані гравців для GM
    let selectedPlayerForGM = null;
    let gmThreatControlData = { threats: [], currentThreat: null };
    let gmThreatCommandPending = false;
    let gmPlayerCommandPending = false;
    let bunkerCapacityPending = false;
    let activeGMTab = 'state';
    let gmLastServerUpdateAt = null;
    let gmLastCommandError = '';
    let pendingJoinRoomId = null; // Для закриття модалки після успішного join
    let hostToken = null;
    let currentApocalypse = null;
    let currentBunker = null;
    let currentThreat = null;
    let currentThreatState = null;
    let lastThreatTimeoutCheckDeadline = null;
    let currentVoting = null;
    let currentRoundState = null;
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
            createRoom: "Створити кімнату", availableRooms: "Доступні кімнати", loadingRooms: "Завантаження кімнат...", noRooms: "Немає доступних кімнат. Створіть свою!", playerNamePlaceholder: "Ваше ім'я...", roomNamePlaceholder: "Назва кімнати...", maxPlayersPlaceholder: "Макс. гравців", passwordOptionalPlaceholder: "Пароль (необов'язково)", passwordIfAnyPlaceholder: "Пароль (якщо є)", room: "Кімната", lobby: "Лобі", game: "Гра", gmPanel: "🎮 GM Панель", voting: "🗳️ Голосування", startGame: "Почати гру", leaveRoom: "Покинути кімнату", players: "Гравці", host: "Хост", you: "Ви", eliminated: "ВИБУВ", myCharacteristics: "Мої характеристики (бачу тільки я)", bunkerAndApocalypse: "🎭 Бункер та Апокаліпсис", apocalypse: "Апокаліпсис", bunker: "Бункер", playersInBunker: "Гравці в бункері:", gameEvents: "Ігрові події", eventsHistory: "Історія подій", eventsPlaceholder: "Тут будуть відображатися події гри...", reveal: "Розкрити всім", revealed: "Відкрито для всіх", hidden: "Приховано", unknown: "Невідомо", profession: "Професія", inventory: "Інвентар", vote: "Голосувати", roomCode: "Код кімнати", name: "Назва", age: "Вік", years: "років", sex: "Стать", orientation: "Орієнтація", personality: "Особистість", body: "Статура", height: "Зріст", weight: "Вага", bodyType: "Тип тіла", physicalHealth: "Фізичне здоров'я", mentalHealth: "Психічне здоров'я", state: "Стан", hobby: "Хобі", activity: "Заняття", characterTrait: "Риса характеру", trait: "Риса", phobia: "Фобія", fear: "Страх", items: "Предмети", fact: "Факт", empty: "Порожній", noFact: "Немає факту", noData: "Немає даних гравця", use: "Використати", close: "Закрити", capacity: "Місткість", condition: "Стан", supplies: "Запаси", location: "Локація", threats: "⚠️ Загрози:", requirements: "✓ Потрібно:", facilities: "🏗️ Приміщення:", resources: "📦 Ресурси:", problems: "⚠️ Проблеми:", survivalChance: "Шанс виживання", duration: "Тривалість", threatLevel: "Загроза", uploadImage: "📤 Завантажити зображення", generatePrompt: "✨ Згенерувати промпт", remove: "🗑️ Видалити", specialCards: "Спеціальні карти", mySpecialCards: "Мої спеціальні карти", revealedSpecialCards: "Розкриті спеціальні карти", noRevealedSpecialCards: "Поки що немає розкритих спеціальних карт.", cardInHand: "У руці", cardRevealed: "Розкрита", cardUsed: "Використана", cardActive: "Активна", specialCard: "Спеціальна карта", description: "Опис", effect: "Ефект", target: "Ціль", status: "Статус", threat: "Загроза", threatUnknownDescription: "Загроза ще не розкрита." },
        en: {
            createRoom: "Create Room", availableRooms: "Available Rooms", loadingRooms: "Loading rooms...", noRooms: "No available rooms. Create your own!", playerNamePlaceholder: "Your name...", roomNamePlaceholder: "Room name...", maxPlayersPlaceholder: "Max players", passwordOptionalPlaceholder: "Password (optional)", passwordIfAnyPlaceholder: "Password (if any)", room: "Room", lobby: "Lobby", game: "Game", gmPanel: "🎮 GM Panel", voting: "🗳️ Voting", startGame: "Start Game", leaveRoom: "Leave Room", players: "Players", host: "Host", you: "You", eliminated: "ELIMINATED", myCharacteristics: "My characteristics (only I can see)", bunkerAndApocalypse: "🎭 Bunker and Apocalypse", apocalypse: "Apocalypse", bunker: "Bunker", playersInBunker: "Players in bunker:", gameEvents: "Game Events", eventsHistory: "Event History", eventsPlaceholder: "Game events will appear here...", reveal: "Reveal to all", revealed: "Revealed to all", hidden: "Hidden", unknown: "Unknown", profession: "Profession", inventory: "Inventory", vote: "Vote", roomCode: "Room Code", name: "Name", age: "Age", years: "years", sex: "Sex", orientation: "Orientation", personality: "Personality", body: "Body", height: "Height", weight: "Weight", bodyType: "Body type", physicalHealth: "Physical health", mentalHealth: "Mental health", state: "State", hobby: "Hobby", activity: "Activity", characterTrait: "Character trait", trait: "Trait", phobia: "Phobia", fear: "Fear", items: "Items", fact: "Fact", empty: "Empty", noFact: "No fact", noData: "No player data", use: "Use", close: "Close", capacity: "Capacity", condition: "Condition", supplies: "Supplies", location: "Location", threats: "⚠️ Threats:", requirements: "✓ Required:", facilities: "🏗️ Facilities:", resources: "📦 Resources:", problems: "⚠️ Problems:", survivalChance: "Survival chance", duration: "Duration", threatLevel: "Threat", uploadImage: "📤 Upload image", generatePrompt: "✨ Generate prompt", remove: "🗑️ Remove", specialCards: "Special cards", mySpecialCards: "My special cards", revealedSpecialCards: "Revealed special cards", noRevealedSpecialCards: "No special cards have been revealed yet.", cardInHand: "In hand", cardRevealed: "Revealed", cardUsed: "Used", cardActive: "Active", specialCard: "Special card", description: "Description", effect: "Effect", target: "Target", status: "Status", threat: "Threat", threatUnknownDescription: "The threat has not been revealed yet." },
        ru: {
            createRoom: "Создать комнату", availableRooms: "Доступные комнаты", loadingRooms: "Загрузка комнат...", noRooms: "Нет доступных комнат. Создайте свою!", playerNamePlaceholder: "Ваше имя...", roomNamePlaceholder: "Название комнаты...", maxPlayersPlaceholder: "Макс. игроков", passwordOptionalPlaceholder: "Пароль (необязательно)", passwordIfAnyPlaceholder: "Пароль (если есть)", room: "Комната", lobby: "Лобби", game: "Игра", gmPanel: "🎮 GM Панель", voting: "🗳️ Голосование", startGame: "Начать игру", leaveRoom: "Покинуть комнату", players: "Игроки", host: "Ведущий", you: "Вы", eliminated: "ВЫБЫЛ", myCharacteristics: "Мои характеристики (вижу только я)", bunkerAndApocalypse: "🎭 Бункер и Апокалипсис", apocalypse: "Апокалипсис", bunker: "Бункер", playersInBunker: "Игроки в бункере:", gameEvents: "Игровые события", eventsHistory: "История событий", eventsPlaceholder: "Здесь будут отображаться события игры...", reveal: "Раскрыть всем", revealed: "Открыто для всех", hidden: "Скрыто", unknown: "Неизвестно", profession: "Профессия", inventory: "Инвентарь", vote: "Голосовать", roomCode: "Код комнаты", name: "Название", age: "Возраст", years: "лет", sex: "Пол", orientation: "Ориентация", personality: "Личность", body: "Телосложение", height: "Рост", weight: "Вес", bodyType: "Тип тела", physicalHealth: "Физическое здоровье", mentalHealth: "Психическое здоровье", state: "Состояние", hobby: "Хобби", activity: "Занятие", characterTrait: "Черта характера", trait: "Черта", phobia: "Фобия", fear: "Страх", items: "Предметы", fact: "Факт", empty: "Пусто", noFact: "Нет факта", noData: "Нет данных игрока", use: "Использовать", close: "Закрыть", capacity: "Вместимость", condition: "Состояние", supplies: "Запасы", location: "Локация", threats: "⚠️ Угрозы:", requirements: "✓ Нужно:", facilities: "🏗️ Помещения:", resources: "📦 Ресурсы:", problems: "⚠️ Проблемы:", survivalChance: "Шанс выживания", duration: "Длительность", threatLevel: "Угроза", uploadImage: "📤 Загрузить изображение", generatePrompt: "✨ Сгенерировать промпт", remove: "🗑️ Удалить", specialCards: "Специальные карты", mySpecialCards: "Мои специальные карты", revealedSpecialCards: "Раскрытые специальные карты", noRevealedSpecialCards: "Пока нет раскрытых специальных карт.", cardInHand: "В руке", cardRevealed: "Раскрыта", cardUsed: "Использована", cardActive: "Активна", specialCard: "Специальная карта", description: "Описание", effect: "Эффект", target: "Цель", status: "Статус", threat: "Угроза", threatUnknownDescription: "Угроза ещё не раскрыта." }
    };

    Object.assign(uiTranslations.uk, {
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
        ,gmGameState: "Стан гри", gmRoundControl: "Керування раундом", gmThreatControl: "Керування загрозою", gmContent: "Контент", gmDiagnostics: "Діагностика"
        ,gmPlayerSecondaryActions: "Додаткові дії", gmResyncPlayer: "Синхронізувати гравця", gmInspectConnection: "Перевірити connection", gmTransferHost: "Передати host", gmHideCharacteristic: "Сховати розкриту характеристику", gmHide: "Сховати", gmDangerousActions: "Небезпечні дії", gmKickPlayer: "Виключити з кімнати"
        ,gmBunkerCapacityLabel: "Місткість бункера", gmCapacitySubmit: "ОК", gmCapacitySaved: "Місткість збережено", gmCapacityInvalid: "Введіть ціле число від 1 до 99"
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
        ,gmGameState: "Game state", gmRoundControl: "Round control", gmThreatControl: "Threat control", gmContent: "Content", gmDiagnostics: "Diagnostics"
        ,gmPlayerSecondaryActions: "Additional actions", gmResyncPlayer: "Resync player", gmInspectConnection: "Inspect connection", gmTransferHost: "Transfer host", gmHideCharacteristic: "Hide revealed characteristic", gmHide: "Hide", gmDangerousActions: "Dangerous actions", gmKickPlayer: "Kick from room"
        ,gmBunkerCapacityLabel: "Bunker capacity", gmCapacitySubmit: "OK", gmCapacitySaved: "Capacity saved", gmCapacityInvalid: "Enter an integer from 1 to 99"
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
        ,gmGameState: "Состояние игры", gmRoundControl: "Управление раундом", gmThreatControl: "Управление угрозой", gmContent: "Контент", gmDiagnostics: "Диагностика"
        ,gmPlayerSecondaryActions: "Дополнительные действия", gmResyncPlayer: "Синхронизировать игрока", gmInspectConnection: "Проверить connection", gmTransferHost: "Передать host", gmHideCharacteristic: "Скрыть открытую характеристику", gmHide: "Скрыть", gmDangerousActions: "Опасные действия", gmKickPlayer: "Исключить из комнаты"
        ,gmBunkerCapacityLabel: "Вместимость бункера", gmCapacitySubmit: "ОК", gmCapacitySaved: "Вместимость сохранена", gmCapacityInvalid: "Введите целое число от 1 до 99"
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
            roomState: source.roomState || source.RoomState || currentRoom?.state || "Lobby",
            phase: source.phase || source.Phase || currentRoundState?.phase || "Lobby",
            activePlayerCount: source.activePlayerCount ?? source.ActivePlayerCount ?? 0,
            revealedCount: source.revealedCount ?? source.RevealedCount ?? 0,
            allPlayersRevealed: source.allPlayersRevealed ?? source.AllPlayersRevealed ?? false,
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
            currentRoom.state = normalized.roomState || currentRoom.state;
            currentRoom.currentRound = normalized.currentRound;
            currentRoom.phase = normalized.phase;
        }
        currentThreat = normalized.threat || (normalized.threatRevealed ? currentThreat : null);
        currentThreatState = normalized.threatState || currentThreatState;
        updateRoundStatusUI();
        renderThreatPanel(currentThreat);
        updateReadyCheckUI();
        updateSpecialCardsUI();
    }

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
        return isHost &&
            currentRoom?.state === "Playing" &&
            getCurrentRoundNumber() >= 3 &&
            getCurrentPhase() === "PreVotingReadyCheck" &&
            !(currentVoting && ["Active", "Completed"].includes(currentVoting.state || currentVoting.State));
    }

    function getRoomStateLabel() {
        if (!currentRoom) return t('lobby');

        if (currentRoom.state === 'Lobby') return t('lobby');
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
            panel.style.display = shouldShow ? 'flex' : 'none';
        }

        const roundText = round > 0 ? `Раунд ${round}` : 'Раунд -';
        setText('#roundStatusNumber', roundText);
        setText('#roundStatusPhase', getPhaseLabel(phase));
        setText('#roundStatusProgress', `${currentRoundState?.revealedCount ?? 0}/${currentRoundState?.activePlayerCount ?? 0} відкрили`);
        setText('#gmCurrentRound', roundText);
        setText('#gmCurrentPhase', getPhaseLabel(phase));
        setText('#gmRoundProgress', `${currentRoundState?.revealedCount ?? 0}/${currentRoundState?.activePlayerCount ?? 0} відкрили`);
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
            gmStartVotingBtn.style.display = canStartVotingNow() ? 'inline-flex' : 'none';
        }

        const hint = document.getElementById('gmVotingLockedHint');
        if (hint) {
            if (!shouldShow) {
                hint.textContent = 'Голосування відкриється після старту гри.';
            } else if (round < 3) {
                hint.textContent = 'Голосування відкриється після завершення 3 раунду.';
            } else if (phase === "RoundReveal") {
                hint.textContent = 'Завершіть 3 раунд після reveal усіх активних гравців.';
            } else if (phase === "ExtraInventory") {
                hint.textContent = 'Загрозу відкрито, інвентар видано. Запитайте, чи всі готові.';
            } else if (phase === "PreVotingReadyCheck") {
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

    function renderThreatPanel(threat) {
        const panel = document.getElementById('threatPanel');
        if (!panel) return;

        const isRevealed = !!currentRoundState?.threatRevealed && !!threat;
        const content = panel.querySelector('.panel-content');
        if (!content) return;

        if (!isRevealed) {
            content.innerHTML = `
                <h4 class="threat-name">${escapeHtml(t('unknown'))}</h4>
                <p class="threat-description">${escapeHtml(t('threatUnknownDescription'))}</p>
            `;
            panel.classList.add('threat-unknown');
            return;
        }

        const name = getLocalizedValue(threat, 'name') || threat.name || threat.Name || t('unknown');
        const description = getLocalizedValue(threat, 'description') || threat.description || threat.Description || '';
        const severity = threat.severity || threat.Severity || '';
        const category = threat.category || threat.Category || '';
        const round = threat.revealRound || threat.RevealRound || threat.round || threat.Round || '';
        const imageUrl = threat.imageUrl || threat.ImageUrl || threat.uploadedImagePath || threat.UploadedImagePath || threat.imagePath || threat.ImagePath || '';
        const requirements = getLocalizedArray(threat, 'requirements');
        const risks = getLocalizedArray(threat, 'risks');
        const consequences = getLocalizedArray(threat, 'consequences');

        const imageSection = imageUrl ? `
            <div class="scenario-image-container">
                <img src="${escapeHtml(imageUrl)}" alt="${escapeHtml(name)}" class="scenario-image" onclick="openImageModal(this.src, this.alt)" />
            </div>
        ` : '';

        const hostControls = isHost ? `
            <div class="scenario-image-controls">
                <input type="file" id="threatImageInput" accept="image/*" style="display: none;" onchange="uploadThreatImage(this)" />
                <button class="btn-scenario-image" onclick="document.getElementById('threatImageInput').click()">
                    ${t('uploadImage')}
                </button>
                <button class="btn-scenario-image btn-generate" onclick="generateThreatPrompt()">
                    ${t('generatePrompt')}
                </button>
                ${imageUrl ? `<button class="btn-scenario-image btn-remove" onclick="removeThreatImage()">${t('remove')}</button>` : ''}
            </div>
        ` : '';

        const metaItems = [
            severity ? { label: t('severity'), value: severity } : null,
            category ? { label: t('category'), value: category } : null,
            round ? { label: t('round'), value: round } : null
        ].filter(Boolean);
        const metaHtml = metaItems.length ? `
            <div class="threat-stats">
                ${metaItems.map(item => `
                    <div class="stat-item">
                        <span class="stat-label">${escapeHtml(item.label)}:</span>
                        <span class="stat-value">${escapeHtml(item.value)}</span>
                    </div>
                `).join('')}
            </div>
        ` : '';

        const listSections = [
            { title: t('requirements'), items: requirements },
            { title: t('risks'), items: risks },
            { title: t('consequences'), items: consequences }
        ].filter(section => section.items.length > 0);
        const listsHtml = listSections.length ? `
            <div class="threat-lists">
                ${listSections.map(section => `
                    <div class="list-section threat-list-section">
                        <span class="list-title">${escapeHtml(section.title)}</span>
                        <ul>${section.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                    </div>
                `).join('')}
            </div>
        ` : '';

        content.innerHTML = `
            <h4 class="threat-name">${escapeHtml(name)}</h4>
            <p class="threat-description">${escapeHtml(description)}</p>
            ${imageSection}
            ${hostControls}
            ${metaHtml}
            ${listsHtml}
            ${renderThreatInteractionPanel(threat)}
        `;
        panel.classList.remove('threat-unknown');
    }

    function renderThreatInteractionPanel(threat) {
        const threatId = (threat?.id || threat?.Id || currentThreatState?.currentThreatId || '').toLowerCase();
        if (!currentThreatState) return '';
        if (threatId === 'air_filter_failure' && currentThreatState.planChoice?.plans?.length) {
            return renderAirFilterPlanChoice(currentThreatState);
        }
        if (threatId !== 'radiation_leak') return '';

        const state = currentThreatState;
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
                        <strong>${escapeHtml(getLocalizedValue(threat, 'name') || threat.name || threat.Name || 'radiation_leak')}</strong>
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
        const guide = choice.solutionGuide || {};
        const leaderId = state.volunteerSelection?.selectedPlayerId || '';
        const canChoose = !choice.isLocked && (isCurrentPlayerId(leaderId) || isHost);
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
        const discussionControls = !choice.isLocked ? `<section class="plan-choice-contributions">
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
        return `<section class="plan-choice-panel">${guideHtml}${discussionControls}<div class="plan-choice-grid">${plansHtml}</div>${isHost && choice.selectedPlanId && !choice.isLocked ? `<button type="button" class="char-btn public-use" onclick="resolveCurrentThreat()">${escapeHtml(planChoiceLabel('start'))}</button>` : ''}</section>`;
    }

    function getThreatStatusLabel(status) {
        return t(status || 'notStarted') || status || t('notStarted');
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
                    <h3>${escapeHtml(t('operation'))}: radiation_leak</h3>
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
        const isFinal = ['resolved_safely', 'resolved_with_casualty', 'failed'].includes(status);
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
        const items = [...professionItems, ...inventoryItems];
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

        const headers = document.querySelectorAll('#playersTable thead th');
        const headerLabels = ['№', `${t('name')} ${t('players')}`, t('personality'), t('body'), t('profession'), t('physicalHealth'), t('mentalHealth'), t('hobby'), t('characterTrait'), t('phobia'), t('inventory'), t('fact')];
        headers.forEach((th, index) => {
            if (headerLabels[index]) th.textContent = headerLabels[index];
        });

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
        if (typeof updatePlayersTable === "function") updatePlayersTable();
        if (typeof updateSpecialCardsUI === "function") updateSpecialCardsUI();
        if (typeof updateGMPlayerSelect === "function") updateGMPlayerSelect();
        if (selectedPlayerForGM && typeof loadPlayerDataForGM === "function") loadPlayerDataForGM();
    }

    function resetClientGameStateForNewRoom() {
        currentRoom = null;
        myPlayerData = null;
        isHost = false;
        roomPlayers = {};
        gmPlayersData = {};
        selectedPlayerForGM = null;
        pendingJoinRoomId = null;
        hostToken = null;
        currentApocalypse = null;
        currentBunker = null;
        currentThreat = null;
        currentVoting = null;
        currentRoundState = null;
        myVote = null;
        if (typeof gmRevealedChars !== "undefined") gmRevealedChars = {};

        ['myPlayerCards', 'playersTableBody', 'roomPlayersList', 'apocalypseContent', 'bunkerContent', 'votingCandidates', 'votingResultsContent', 'specialCardsTableBody', 'gmSpecialCardsList'].forEach(id => {
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
        console.log("[RoomCreated] Received:", data);

        resetClientGameStateForNewRoom();

        currentRoom = data.room || data.Room;
        myPlayerData = normalizePlayer(data.player || data.Player);
        isHost = data.isHost ?? data.IsHost ?? true;
        hostToken = data.hostToken || data.HostToken || null;
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
        console.log("[RoomJoined] Received:", data);
        
        currentRoom = data.room || data.Room;
        myPlayerData = normalizePlayer(data.player || data.Player);
        isHost = data.isHost ?? data.IsHost ?? false;
        hostToken = data.hostToken || data.HostToken || null;
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
    });

    connection.off("PlayerStateResynced");
    connection.on("PlayerStateResynced", function (data) {
        myPlayerData = normalizePlayer(data.player || data.Player);
        renderCurrentGameUI();
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
        console.log("[GameStarted] Reset isStartingGame = false");

        // Normalize room state (handle both camelCase and PascalCase)
        const roomState = data.roomState || data.RoomState || "Playing";
        
        if (currentRoom) {
            currentRoom.state = roomState;
            console.log("[GameStarted] Updated currentRoom.state:", currentRoom.state);
        }
        applyRoundState(data.roundState || data.RoundState);

        // Normalize apocalypse (handle both camelCase and PascalCase)
        const apocalypse = data.apocalypse || data.Apocalypse;
        currentApocalypse = apocalypse ? {
            id: apocalypse.id || apocalypse.Id,
            name: apocalypse.name || apocalypse.Name || 'Невідомо',
            description: apocalypse.description || apocalypse.Description || '',
            severity: apocalypse.severity || apocalypse.Severity || 'medium',
            survivalChance: apocalypse.survivalChance ?? apocalypse.SurvivalChance ?? 50,
            duration: apocalypse.duration || apocalypse.Duration || '',
            threats: apocalypse.threats || apocalypse.Threats || [],
            requirements: apocalypse.requirements || apocalypse.Requirements || [],
            imageUrl: apocalypse.imageUrl || apocalypse.ImageUrl || null,
            _i18n: getI18n(apocalypse)
        } : null;
        console.log("[GameStarted] Normalized apocalypse:", currentApocalypse);

        // Normalize bunker (handle both camelCase and PascalCase)
        const bunker = data.bunker || data.Bunker;
        currentBunker = bunker ? {
            id: bunker.id || bunker.Id,
            name: bunker.name || bunker.Name || 'Невідомо',
            description: bunker.description || bunker.Description || '',
            capacity: bunker.capacity ?? bunker.Capacity ?? 6,
            location: bunker.location || bunker.Location || '',
            suppliesMonths: bunker.suppliesMonths ?? bunker.SuppliesMonths ?? 12,
            facilities: bunker.facilities || bunker.Facilities || [],
            resources: bunker.resources || bunker.Resources || [],
            threatAssets: bunker.threatAssets || bunker.ThreatAssets || { resources: [], facilities: [] },
            problems: bunker.problems || bunker.Problems || [],
            condition: bunker.condition || bunker.Condition || 'good',
            imageUrl: bunker.imageUrl || bunker.ImageUrl || null,
            _i18n: getI18n(bunker)
        } : null;
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
        if (isHost && currentBunker) {
            currentBunkerCapacity = currentBunker.capacity;
            const gmBunkerCapacity = document.getElementById('gmBunkerCapacity');
            if (gmBunkerCapacity) {
                gmBunkerCapacity.value = currentBunker.capacity;
            }
        }

        // Render apocalypse and bunker
        console.log("[GameStarted] Rendering apocalypse...");
        renderApocalypse(currentApocalypse);
        
        console.log("[GameStarted] Rendering bunker...");
        renderBunker(currentBunker);
        
        console.log("[GameStarted] Rendering current game UI...");
        renderCurrentGameUI();

        // Add event messages
        const currentRound = data.currentRound || data.CurrentRound || getCurrentRoundNumber() || 1;
        addEventMessage(`Гра почалась! Раунд ${currentRound}`);

        if (currentApocalypse && currentApocalypse.name) {
            addEventMessage(`<span class="event-apocalypse">☢️ Апокаліпсис:</span> ${currentApocalypse.name}`);
        }

        if (currentBunker && currentBunker.name) {
            addEventMessage(`<span class="event-bunker">🏠 Бункер:</span> ${currentBunker.name}`);
        }

        console.log("=== GAME STARTED END ===");
    });

    // Характеристику розкрито
    connection.off("CharacteristicRevealed");
    connection.on("CharacteristicRevealed", function (info) {
        console.log("Characteristic revealed:", info);
        applyRoundState(info.roundState || info.RoundState);
        const characteristicKey = normalizeCharacteristicKey(info.characteristicKey);
        const charKey = normalizeCharacteristicKey(toCamelCase(characteristicKey));
        
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
        
        updatePlayersTable();
        // Реініціалізуємо tooltip після оновлення DOM
        if (typeof initMobileTooltips === 'function') {
            setTimeout(initMobileTooltips, 100);
        }
        addEventMessage(`<span class="event-player">${info.playerName}</span> розкрив: <span class="revealed-label">${info.data.label}</span>`);
    });

    connection.off("RoundStateUpdated");
    connection.on("RoundStateUpdated", function (data) {
        const wasComplete = currentRoundState?.allPlayersRevealed;
        applyRoundState(data);
        renderCurrentGameUI();

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
            if (data.inventory || data.Inventory) {
                myPlayerData.inventory = normalizeInventoryData(data.inventory || data.Inventory);
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
        const charKey = normalizeCharacteristicKey(toCamelCase(data.characteristicKey || data.CharacteristicKey || ''));
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
        
        updatePlayersTable();
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
        updatePlayersTable();
        updateGMPlayerSelect();
        addEventMessage(`<span class="event-eliminate">❌ ${info.playerName}</span> елімінований!`);
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
        updatePlayersTable();
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

        const isGameState =
            currentRoom.state === 'Playing' ||
            currentRoom.state === 'Voting' ||
            currentRoom.state === 'Started';

        showRoomSection();
        renderCurrentGameUI();

        if (isGameState) {
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
        if (currentBunker) currentBunker.capacity = data.capacity;
        currentBunkerCapacity = data.capacity;
        const input = document.getElementById('gmBunkerCapacity');
        if (input) input.value = data.capacity;
        setBunkerCapacityPending(false);
        const feedback = document.getElementById('gmBunkerCapacityFeedback');
        if (feedback) feedback.textContent = t('gmCapacitySaved');
        renderBunker(data.bunker);
        addEventMessage(`<span class="event-gm">GM</span> змінив кількість слотів бункера на <strong>${data.capacity}</strong>`);
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
        currentBunker = data.bunker;
        currentBunkerCapacity = data.bunker.capacity;
        const capacityInput = document.getElementById('gmBunkerCapacity');
        if (capacityInput) capacityInput.value = data.bunker.capacity;
        renderBunker(data.bunker);
        addEventMessage(`<span class="event-bunker">🏠 Новий бункер:</span> ${data.bunker.name}`);
    });

    // Апокаліпсис змінено
    connection.off("ApocalypseChanged");
    connection.on("ApocalypseChanged", function (data) {
        console.log("Apocalypse changed:", data);
        currentApocalypse = data.apocalypse;
        renderApocalypse(data.apocalypse);
        addEventMessage(`<span class="event-apocalypse">☢️ Новий апокаліпсис:</span> ${data.apocalypse.name}`);
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
        if (data.bunker) {
            currentBunker = data.bunker;
            renderBunker(data.bunker);
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

    connection.off("GMThreatControlData");
    connection.on("GMThreatControlData", function (data) {
        gmThreatControlData = {
            threats: data.threats || data.Threats || [],
            currentThreat: data.currentThreat || data.CurrentThreat || null,
            canBrowseFutureThreatCatalog: data.canBrowseFutureThreatCatalog ?? data.CanBrowseFutureThreatCatalog ?? false
        };
        renderGMThreatControl();
        markGMServerUpdate();
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

    // ==================== SCENARIO IMAGE HANDLERS ====================
    
    // Зображення апокаліпсису оновлено
    connection.off("ApocalypseImageUpdated");
    connection.on("ApocalypseImageUpdated", function (data) {
        console.log("[ApocalypseImageUpdated]", data);
        if (currentApocalypse && currentApocalypse.id === data.apocalypseId) {
            currentApocalypse.imageUrl = data.imageUrl;
            renderApocalypse(currentApocalypse);
            addEventMessage(`<span class="event-image">🖼️</span> Зображення апокаліпсису оновлено`);
        }
    });
    
    // Зображення бункера оновлено
    connection.off("BunkerImageUpdated");
    connection.on("BunkerImageUpdated", function (data) {
        console.log("[BunkerImageUpdated]", data);
        if (currentBunker && currentBunker.id === data.bunkerId) {
            currentBunker.imageUrl = data.imageUrl;
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
        if (currentApocalypse && currentApocalypse.id === data.apocalypseId) {
            currentApocalypse.imageUrl = null;
            renderApocalypse(currentApocalypse);
            addEventMessage(`<span class="event-image">🗑️</span> Зображення апокаліпсису видалено`);
        }
    });
    
    // Зображення бункера видалено
    connection.off("BunkerImageRemoved");
    connection.on("BunkerImageRemoved", function (data) {
        console.log("[BunkerImageRemoved]", data);
        if (currentBunker && currentBunker.id === data.bunkerId) {
            currentBunker.imageUrl = null;
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
            currentBunker.suppliesMonths = data.totalSuppliesMonths;
            renderBunker(currentBunker);
        }
        
        addEventMessage(`<span class="event-success">📦 GM додав запаси їжі: +${data.addedMonths} місяців</span>`);
    });
    
    // Запаси бункера зменшено
    connection.off("BunkerSuppliesRemoved");
    connection.on("BunkerSuppliesRemoved", function (data) {
        console.log("[BunkerSuppliesRemoved]", data);
        
        if (currentBunker) {
            currentBunker.suppliesMonths = data.totalSuppliesMonths;
            renderBunker(currentBunker);
        }
        
        addEventMessage(`<span class="event-warning">📦 Запаси бункера зменшено на ${data.removedMonths} місяців</span>`);
    });

} // End of registerSignalREvents()

// ==================== GLOBAL FUNCTIONS ====================

let isStartingGame = false;

function startGame() {
    console.log("[startGame] Called, isStartingGame:", isStartingGame);
    
    if (isStartingGame) {
        console.log("[startGame] Already starting, returning");
        return;
    }
    if (!confirm("Почати гру?")) {
        console.log("[startGame] User cancelled");
        return;
    }

    isStartingGame = true;
    console.log("[startGame] Set isStartingGame = true");

    const btn = document.getElementById("startGameBtn");
    if (btn) {
        btn.disabled = true;
        btn.style.pointerEvents = "none";
        console.log("[startGame] Button disabled");
    }

    console.log("[startGame] Invoking StartGame on server...");
    connection.invoke("StartGame")
        .then(() => {
            console.log("[startGame] Invoke successful, waiting for GameStarted event...");
        })
        .catch(err => {
            console.error("[startGame] Invoke error:", err);
            isStartingGame = false;

            if (btn) {
                btn.disabled = false;
                btn.style.pointerEvents = "auto";
            }
        });
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

// Завантаження зображення апокаліпсису
async function uploadApocalypseImage(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    
    // Валідація розміру (5 MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл занадто великий. Максимум 5 MB');
        return;
    }
    
    // Валідація типу
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        alert('Непідтримуваний формат. Дозволено: JPG, PNG, WebP, GIF');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', currentRoom?.id || '');
    formData.append('connectionId', myConnectionId || '');
    formData.append('hostToken', hostToken || '');
    formData.append('apocalypseId', currentApocalypse?.id || '');
    
    try {
        const response = await fetch('/api/ScenarioImage/apocalypse', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Помилка завантаження');
            return;
        }
        
        console.log('[uploadApocalypseImage] Success');
    } catch (error) {
        console.error('[uploadApocalypseImage] Error:', error);
        alert('Помилка завантаження зображення');
    }
    
    // Очищаємо input
    input.value = '';
}

// Завантаження зображення бункера
async function uploadBunkerImage(input) {
    if (!input.files || !input.files[0]) return;
    
    const file = input.files[0];
    
    // Валідація розміру (5 MB)
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл занадто великий. Максимум 5 MB');
        return;
    }
    
    // Валідація типу
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        alert('Непідтримуваний формат. Дозволено: JPG, PNG, WebP, GIF');
        return;
    }
    
    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', currentRoom?.id || '');
    formData.append('connectionId', myConnectionId || '');
    formData.append('hostToken', hostToken || '');
    formData.append('bunkerId', currentBunker?.id || '');
    
    try {
        const response = await fetch('/api/ScenarioImage/bunker', {
            method: 'POST',
            body: formData
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Помилка завантаження');
            return;
        }
        
        console.log('[uploadBunkerImage] Success');
    } catch (error) {
        console.error('[uploadBunkerImage] Error:', error);
        alert('Помилка завантаження зображення');
    }
    
    // Очищаємо input
    input.value = '';
}

// Завантаження зображення загрози
async function uploadThreatImage(input) {
    if (!input.files || !input.files[0]) return;
    if (!currentRoundState?.threatRevealed || !currentThreat) {
        alert(t('threatUnknownDescription'));
        input.value = '';
        return;
    }

    const file = input.files[0];

    if (file.size > 5 * 1024 * 1024) {
        alert('Файл занадто великий. Максимум 5 MB');
        input.value = '';
        return;
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
        alert('Непідтримуваний формат. Дозволено: JPG, PNG, WebP, GIF');
        input.value = '';
        return;
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('roomId', currentRoom?.id || '');
    formData.append('connectionId', myConnectionId || '');
    formData.append('hostToken', hostToken || '');
    formData.append('threatId', currentThreat?.id || currentThreat?.Id || '');

    try {
        const response = await fetch('/api/ScenarioImage/threat', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Помилка завантаження');
            return;
        }

        console.log('[uploadThreatImage] Success');
    } catch (error) {
        console.error('[uploadThreatImage] Error:', error);
        alert('Помилка завантаження зображення');
    }

    input.value = '';
}

// Видалення зображення апокаліпсису
async function removeApocalypseImage() {
    if (!confirm('Видалити зображення апокаліпсису?')) return;
    
    try {
        const params = new URLSearchParams({
            roomId: currentRoom?.id || '',
            connectionId: myConnectionId || '',
            hostToken: hostToken || '',
            apocalypseId: currentApocalypse?.id || ''
        });
        
        const response = await fetch(`/api/ScenarioImage/apocalypse?${params}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Помилка видалення');
            return;
        }
        
        console.log('[removeApocalypseImage] Success');
    } catch (error) {
        console.error('[removeApocalypseImage] Error:', error);
        alert('Помилка видалення зображення');
    }
}

// Видалення зображення бункера
async function removeBunkerImage() {
    if (!confirm('Видалити зображення бункера?')) return;
    
    try {
        const params = new URLSearchParams({
            roomId: currentRoom?.id || '',
            connectionId: myConnectionId || '',
            hostToken: hostToken || '',
            bunkerId: currentBunker?.id || ''
        });
        
        const response = await fetch(`/api/ScenarioImage/bunker?${params}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Помилка видалення');
            return;
        }
        
        console.log('[removeBunkerImage] Success');
    } catch (error) {
        console.error('[removeBunkerImage] Error:', error);
        alert('Помилка видалення зображення');
    }
}

// Видалення зображення загрози
async function removeThreatImage() {
    if (!currentRoundState?.threatRevealed || !currentThreat) {
        alert(t('threatUnknownDescription'));
        return;
    }

    if (!confirm('Видалити зображення загрози?')) return;

    try {
        const params = new URLSearchParams({
            roomId: currentRoom?.id || '',
            connectionId: myConnectionId || '',
            hostToken: hostToken || '',
            threatId: currentThreat?.id || currentThreat?.Id || ''
        });

        const response = await fetch(`/api/ScenarioImage/threat?${params}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.json();
            alert(error.error || 'Помилка видалення');
            return;
        }

        console.log('[removeThreatImage] Success');
    } catch (error) {
        console.error('[removeThreatImage] Error:', error);
        alert('Помилка видалення зображення');
    }
}

// Генерація промпту для апокаліпсису
async function generateApocalypsePrompt() {
    try {
        const response = await fetch(`/api/ScenarioImage/apocalypse/prompt?roomId=${currentRoom?.id || ''}`);
        
        if (!response.ok) {
            alert('Помилка отримання промпту');
            return;
        }
        
        const data = await response.json();
        showPromptModal('Промпт для апокаліпсису', data.prompt);
    } catch (error) {
        console.error('[generateApocalypsePrompt] Error:', error);
        alert('Помилка отримання промпту');
    }
}

// Генерація промпту для бункера
async function generateBunkerPrompt() {
    try {
        const response = await fetch(`/api/ScenarioImage/bunker/prompt?roomId=${currentRoom?.id || ''}`);
        
        if (!response.ok) {
            alert('Помилка отримання промпту');
            return;
        }
        
        const data = await response.json();
        showPromptModal('Промпт для бункера', data.prompt);
    } catch (error) {
        console.error('[generateBunkerPrompt] Error:', error);
        alert('Помилка отримання промпту');
    }
}

// Генерація промпту для загрози
async function generateThreatPrompt() {
    if (!currentRoundState?.threatRevealed || !currentThreat) {
        alert(t('threatUnknownDescription'));
        return;
    }

    try {
        const response = await fetch(`/api/ScenarioImage/threat/prompt?roomId=${currentRoom?.id || ''}`);

        if (!response.ok) {
            alert('Помилка отримання промпту');
            return;
        }

        const data = await response.json();
        showPromptModal(`${t('generatePrompt')}: ${t('threat')}`, data.prompt);
    } catch (error) {
        console.error('[generateThreatPrompt] Error:', error);
        alert('Помилка отримання промпту');
    }
}

// Показати модальне вікно з промптом
function showPromptModal(title, prompt) {
    // Створюємо модальне вікно якщо його немає
    let modal = document.getElementById('promptModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'promptModal';
        modal.className = 'prompt-modal-overlay';
        modal.innerHTML = `
            <div class="prompt-modal">
                <div class="prompt-modal-header">
                    <h3 id="promptModalTitle"></h3>
                    <button class="prompt-modal-close" onclick="closePromptModal()">×</button>
                </div>
                <div class="prompt-modal-body">
                    <textarea id="promptModalText" readonly></textarea>
                    <button class="btn-copy-prompt" onclick="copyPromptToClipboard()">📋 Копіювати промпт</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    document.getElementById('promptModalTitle').textContent = title;
    document.getElementById('promptModalText').value = prompt;
    modal.style.display = 'flex';
}

// Закрити модальне вікно з промптом
function closePromptModal() {
    const modal = document.getElementById('promptModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Копіювати промпт в буфер обміну
function copyPromptToClipboard() {
    const textarea = document.getElementById('promptModalText');
    if (textarea) {
        textarea.select();
        document.execCommand('copy');
        
        // Показуємо підтвердження
        const btn = document.querySelector('.btn-copy-prompt');
        const originalText = btn.textContent;
        btn.textContent = '✓ Скопійовано!';
        setTimeout(() => { btn.textContent = originalText; }, 2000);
    }
}

// Відкрити зображення в модальному вікні
function openImageModal(imageUrl, title) {
    let modal = document.getElementById('imageModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'imageModal';
        modal.className = 'image-modal-overlay';
        modal.onclick = function(e) {
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

// Додати випадкову кількість запасів до бункера (1-12 місяців)
function addBunkerSupplies() {
    if (!isHost) {
        alert('Тільки хост може додавати запаси');
        return;
    }
    
    if (!currentBunker) {
        alert('Бункер не визначено. Спочатку почніть гру.');
        return;
    }
    
    console.log("[addBunkerSupplies] Invoking...");
    
    connection.invoke("AddBunkerSupplies")
        .then(() => {
            console.log("[addBunkerSupplies] Success");
        })
        .catch(err => {
            console.error("[addBunkerSupplies] Error:", err);
            alert('Помилка додавання запасів');
        });
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
    document.addEventListener('DOMContentLoaded', function() {
        const createRoomBtn = document.getElementById('createRoomBtn');
        if (createRoomBtn) {
            createRoomBtn.addEventListener('click', function(e) {
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
        } catch (e) {}
    }

    function loadSession() {
        try {
            return {
                roomId: sessionStorage.getItem(sessionKeys.roomId) || localStorage.getItem(sessionKeys.roomId),
                playerName: sessionStorage.getItem(sessionKeys.playerName) || localStorage.getItem(sessionKeys.playerName),
                hostToken: sessionStorage.getItem(sessionKeys.hostToken) || localStorage.getItem(sessionKeys.hostToken),
                stablePlayerId: sessionStorage.getItem(sessionKeys.stablePlayerId) || localStorage.getItem(sessionKeys.stablePlayerId)
            };
        } catch (e) { return { roomId: null, playerName: null }; }
    }

    function tryRejoin() {
        var session = loadSession();
        var rejoinStablePlayerId = session.stablePlayerId || stablePlayerId;
        if (session.roomId && session.playerName && rejoinStablePlayerId) {
            hostToken = session.hostToken || null;
            console.log('Attempting rejoin with playerId:', rejoinStablePlayerId);
            connection.invoke("RejoinRoom", session.roomId, session.playerName, rejoinStablePlayerId)
                .catch(function(err) {
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
        } catch (e) {}
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
            .catch(function(err) { console.error("PeekCharacteristic error:", err); });
    }
    
    // Reveal a specific characteristic value in the GM panel
    function revealCharInGMPanel(charName) {
        const playerData = gmPlayersData[selectedPlayerForGM];
        if (!playerData) return;
        
        let value = t('unknown');
        let elementId = '';
        
        switch(charName) {
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
        connection.invoke("SetBunkerCapacity", raw).catch(function(err) {
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
                .catch(function(err) { console.error("RegenerateBunker error:", err); });
        }
    }

    function regenerateApocalypse() {
        if (confirm('Згенерувати новий апокаліпсис?')) {
            connection.invoke("RegenerateApocalypse")
                .catch(function(err) { console.error("RegenerateApocalypse error:", err); });
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
            .catch(function(err) { console.error("SendGameEvent error:", err); });
        document.getElementById('gmEventText').value = '';
    }

    function sendQuickEvent(text, type) {
        connection.invoke("SendGameEvent", text, type)
            .catch(function(err) { console.error("SendGameEvent error:", err); });
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
            .catch(function(err) {
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
                connection.invoke("JoinRoom", roomId, validation.name, null, stablePlayerId)
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
        
        connection.invoke("JoinRoom", roomId, playerName, password, stablePlayerId)
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


    function reveal(characteristicName) {
        if (!canRevealThisRound()) {
            const reason = getRevealBlockedReason();
            if (reason) addEventMessage(`Помилка: ${reason}`);
            return;
        }

        connection.invoke("RevealCharacteristic", characteristicName)
            .catch(err => console.error("RevealCharacteristic error:", err));
    }

    // ==================== APOCALYPSE & BUNKER FUNCTIONS ====================

    function renderApocalypse(apocalypse) {
        const container = document.getElementById('apocalypseContent');
        if (!container) return;
        
        if (!apocalypse) {
            container.innerHTML = `<p>${t('unknown')}</p>`;
            return;
        }
        const apocalypseName = getLocalizedValue(apocalypse, 'name') || t('unknown');
        const apocalypseDescription = getLocalizedValue(apocalypse, 'description');
        const apocalypseDuration = getLocalizedValue(apocalypse, 'duration') || apocalypse.duration || apocalypse.Duration || '';
        const apocalypseThreats = getLocalizedArray(apocalypse, 'threats');
        const apocalypseRequirements = getLocalizedArray(apocalypse, 'requirements');
        
        const severityColors = {
            'low': '#27ae60',
            'medium': '#f39c12',
            'high': '#e74c3c',
            'extreme': '#8e44ad'
        };
        
        const severityLabels = {
            uk: { low: 'Низька', medium: 'Середня', high: 'Висока', extreme: 'Екстремальна' },
            en: { low: 'Low', medium: 'Medium', high: 'High', extreme: 'Extreme' },
            ru: { low: 'Низкая', medium: 'Средняя', high: 'Высокая', extreme: 'Экстремальная' }
        };
        
        // Перевіряємо наявність зображення
        const imageUrl = apocalypse.imageUrl || apocalypse.ImageUrl;
        const imageSection = imageUrl ? `
            <div class="scenario-image-container">
                <img src="${imageUrl}" alt="${escapeHtml(apocalypseName)}" class="scenario-image" onclick="openImageModal('${imageUrl}', '${escapeHtml(apocalypseName)}')" />
            </div>
        ` : '';
        
        // Контроли хоста для зображення
        const hostControls = isHost ? `
            <div class="scenario-image-controls">
                <input type="file" id="apocalypseImageInput" accept="image/*" style="display: none;" onchange="uploadApocalypseImage(this)" />
                <button class="btn-scenario-image" onclick="document.getElementById('apocalypseImageInput').click()">
                    ${t('uploadImage')}
                </button>
                <button class="btn-scenario-image btn-generate" onclick="generateApocalypsePrompt()">
                    ${t('generatePrompt')}
                </button>
                ${imageUrl ? `<button class="btn-scenario-image btn-remove" onclick="removeApocalypseImage()">${t('remove')}</button>` : ''}
            </div>
        ` : '';
        
        container.innerHTML = `
            <h4 class="apocalypse-name">${escapeHtml(apocalypseName)}</h4>
            <p class="apocalypse-desc">${escapeHtml(apocalypseDescription)}</p>
            ${imageSection}
            ${hostControls}
            <div class="apocalypse-stats">
                <div class="stat-item">
                    <span class="stat-label">${t('threatLevel')}:</span>
                    <span class="stat-value" style="color: ${severityColors[apocalypse.severity]}">${severityLabels[getCurrentLanguage()]?.[apocalypse.severity] || apocalypse.severity}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">${t('survivalChance')}:</span>
                    <span class="stat-value">${apocalypse.survivalChance}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">${t('duration')}:</span>
                    <span class="stat-value">${escapeHtml(apocalypseDuration)}</span>
                </div>
            </div>
            <div class="apocalypse-lists">
                <div class="list-section">
                    <span class="list-title">${t('threats')}</span>
                    <ul>${apocalypseThreats.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                </div>
                <div class="list-section">
                    <span class="list-title">${t('requirements')}</span>
                    <ul>${apocalypseRequirements.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                </div>
            </div>
        `;
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

    function renderBunker(bunker) {
        const container = document.getElementById('bunkerContent');
        if (!container) return;
        
        if (!bunker) {
            container.innerHTML = `<p>${t('unknown')}</p>`;
            return;
        }
        const bunkerName = getLocalizedValue(bunker, 'name') || t('unknown');
        const bunkerDescription = getLocalizedValue(bunker, 'description');
        const bunkerLocation = getLocalizedValue(bunker, 'location') || bunker.location || bunker.Location || '';
        const bunkerFacilities = getLocalizedArray(bunker, 'facilities');
        const bunkerResources = getLocalizedArray(bunker, 'resources');
        const bunkerProblems = getLocalizedArray(bunker, 'problems');
        
        const conditionColors = {
            'poor': '#e74c3c',
            'fair': '#f39c12',
            'good': '#27ae60',
            'excellent': '#3498db'
        };
        
        const conditionLabels = {
            uk: { poor: 'Поганий', fair: 'Задовільний', good: 'Хороший', excellent: 'Відмінний' },
            en: { poor: 'Poor', fair: 'Fair', good: 'Good', excellent: 'Excellent' },
            ru: { poor: 'Плохой', fair: 'Удовлетворительный', good: 'Хороший', excellent: 'Отличный' }
        };
        
        // Перевіряємо наявність зображення
        const imageUrl = bunker.imageUrl || bunker.ImageUrl;
        const imageSection = imageUrl ? `
            <div class="scenario-image-container">
                <img src="${imageUrl}" alt="${escapeHtml(bunkerName)}" class="scenario-image" onclick="openImageModal('${imageUrl}', '${escapeHtml(bunkerName)}')" />
            </div>
        ` : '';
        
        // Контроли хоста для зображення
        const hostControls = isHost ? `
            <div class="scenario-image-controls">
                <input type="file" id="bunkerImageInput" accept="image/*" style="display: none;" onchange="uploadBunkerImage(this)" />
                <button class="btn-scenario-image" onclick="document.getElementById('bunkerImageInput').click()">
                    ${t('uploadImage')}
                </button>
                <button class="btn-scenario-image btn-generate" onclick="generateBunkerPrompt()">
                    ${t('generatePrompt')}
                </button>
                ${imageUrl ? `<button class="btn-scenario-image btn-remove" onclick="removeBunkerImage()">${t('remove')}</button>` : ''}
            </div>
        ` : '';
        
        container.innerHTML = `
            <h4 class="bunker-name">${escapeHtml(bunkerName)}</h4>
            <p class="bunker-desc">${escapeHtml(bunkerDescription)}</p>
            ${imageSection}
            ${hostControls}
            <div class="bunker-stats">
                <div class="stat-item">
                    <span class="stat-label">${t('capacity')}:</span>
                    <span class="stat-value">${bunker.capacity}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">${t('condition')}:</span>
                    <span class="stat-value" style="color: ${conditionColors[bunker.condition]}">${conditionLabels[getCurrentLanguage()]?.[bunker.condition] || bunker.condition}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">${t('supplies')}:</span>
                    <span class="stat-value">${bunker.suppliesMonths}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">${t('location')}:</span>
                    <span class="stat-value">${escapeHtml(bunkerLocation)}</span>
                </div>
            </div>
            <div class="bunker-lists">
                <div class="list-section">
                    <span class="list-title">${t('facilities')}</span>
                    <ul>${bunkerFacilities.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                </div>
                <div class="list-section">
                    <span class="list-title">${t('resources')}</span>
                    <ul>${bunkerResources.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                </div>
                ${bunkerProblems.length > 0 ? `
                <div class="list-section problems">
                    <span class="list-title">${t('problems')}</span>
                    <ul>${bunkerProblems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>
                </div>
                ` : ''}
            </div>
        `;
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

    function toggleGMPanel() {
        const panel = document.getElementById('gmPanel');
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'flex';
        
        if (!isVisible && isHost) {
            // Завантажуємо дані гравців при відкритті панелі
            connection.invoke("GetAllPlayersData").catch(err => console.error(err));
            connection.invoke("GetGMThreatControlData").catch(err => console.error(err));
            renderGMPanelState();
        }
    }

    function switchGMTab(tab) {
        activeGMTab = ['state', 'round', 'threat', 'content', 'diagnostics'].includes(tab) ? tab : 'state';
        renderGMTabsVisibility();
        renderGMPanelState();
    }

    function renderGMTabsVisibility() {
        document.querySelectorAll('[data-gm-tab]').forEach(section => {
            const active = section.dataset.gmTab === activeGMTab;
            if (section.id === 'gmPlayerInfo') section.style.display = active && selectedPlayerForGM ? 'block' : 'none';
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
        const diagnostics = document.getElementById('gmDiagnosticsSummary');
        if (diagnostics) diagnostics.innerHTML = [
            ['Останнє серверне оновлення', gmLastServerUpdateAt ? gmLastServerUpdateAt.toLocaleTimeString() : '—'],
            ['Підключені активні', connectedPlayers.length],
            ['Незавершений interaction', currentThreat && !currentThreatState?.resolution?.effectsApplied ? 'Так' : 'Ні']
        ].map(([label, value]) => `<div class="gm-status-card"><span>${escapeHtml(label)}</span><strong class="gm-status-badge">${escapeHtml(value)}</strong></div>`).join('');
        const error = document.getElementById('gmLastCommandError');
        if (error) {
            error.textContent = gmLastCommandError;
            error.style.display = gmLastCommandError ? 'block' : 'none';
        }
    }

    function renderGMThreatControl() {
        const current = document.getElementById('gmThreatCurrent');
        const select = document.getElementById('gmThreatSelect');
        const specificControls = document.getElementById('gmSpecificThreatControls');
        if (specificControls) specificControls.style.display = gmThreatControlData.canBrowseFutureThreatCatalog ? '' : 'none';
        if (current) {
            const threat = gmThreatControlData.currentThreat;
            current.textContent = threat
                ? `${threat.name || threat.Name} — ${threat.status || threat.Status || '—'}`
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
        invokeGMThreatCommand('GMCancelCurrentThreat', [gmThreatCommandId()], 'Скасувати поточну загрозу без наслідків?');
    }
    function gmRestartThreat() {
        invokeGMThreatCommand('GMRestartCurrentThreat', [gmThreatCommandId()], 'Перезапустити interaction state поточної загрози?');
    }
    function gmResyncThreatRoom() {
        if (gmThreatCommandPending) return;
        gmThreatCommandPending = true;
        connection.invoke('GMResyncThreatRoom').finally(() => gmThreatCommandPending = false);
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
                             'gmHobby', 'gmCharacterTrait', 'gmPhobia', 'gmInventory', 'gmFact'];
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
                    ${['light','medium','hard','veryHard','critical'].map(code => `<option value="${code}" ${code === severity ? 'selected' : ''}>${escapeHtml(code)}</option>`).join('')}
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
        switch(charName) {
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
        
        document.getElementById('currentRoomName').textContent = currentRoom.name || t('room');
        document.getElementById('currentRoomId').textContent = `ID: ${currentRoom.id || ''}`;
        document.getElementById('currentRoomState').textContent = getRoomStateLabel();
        
        const playerCount = Object.keys(roomPlayers).length;
        document.getElementById('roomPlayerCount').textContent = `${playerCount}/${currentRoom.maxPlayers || 12}`;
        
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
            if (isHost) {
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
        
        renderRoomPlayers();
        
        if (currentRoom.state !== 'Lobby') {
            updatePlayersTable();
        }
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
        players.sort(function(a, b) { return (a.seatNumber || 999) - (b.seatNumber || 999); });
        
        container.innerHTML = players.map((p, i) => {
            var seatLabel = p.seatNumber ? '#' + p.seatNumber : '#' + (i + 1);
            const isEliminated = p.isEliminated || p.IsEliminated || false;
            
            let cardClasses = ['room-player-card'];
            if (p.connectionId === myConnectionId) cardClasses.push('my-player');
            if (p.isHost) cardClasses.push('host-player');
            if (isEliminated) cardClasses.push('room-player-eliminated');
            
            return `
            <div class="${cardClasses.join(' ')}">
                <span class="player-number">${seatLabel}</span>
                <span class="player-name">${escapeHtml(p.name)}</span>
                ${p.isHost ? `<span class="host-badge">${t('host')}</span>` : ''}
                ${p.connectionId === myConnectionId ? `<span class="you-badge">${t('you')}</span>` : ''}
                ${isEliminated ? `<span class="eliminated-badge-small">${t('eliminated')}</span>` : ''}
            </div>`;
        }).join('');
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
            .filter(player => player && !(player.isEliminated || player.IsEliminated))
            .filter(player => !isMyPlayerRef(player.connectionId || player.ConnectionId, player.stablePlayerId || player.StablePlayerId))
            .sort((a, b) => (a.seatNumber || 999) - (b.seatNumber || 999));
    }

    function renderSpecialCardControls(card, cardIndex = 0) {
        const normalized = normalizeSpecialCard(card);
        if (!normalized.id || normalized.id === 'no_special_card') {
            return '<p class="special-card-note">Спеціальна карта не видана.</p>';
        }

        if (normalized.isEffectActive || normalized.isActive || normalized.status === 'active') {
            const target = normalized.targetPlayerName ? ` проти ${escapeHtml(normalized.targetPlayerName)}` : '';
            const note = normalized.effectDuration === 'untilRoundEnd'
                ? t('activeUntilRoundEnd')
                : `Карта активована${target}. Ефект спрацює в цьому голосуванні.`;
            return `<p class="special-card-note active">${note}</p>`;
        }

        if (normalized.isUsed || normalized.status === 'used') {
            return `<p class="special-card-note used">${t('cardWasUsed')}</p>`;
        }

        const phase = getCurrentPhase();
        const canUseNow = currentRoom?.state === 'Playing' &&
            (normalized.phase === 'beforeVoting'
                ? phase === 'PreVotingReadyCheck'
                : normalized.phase === 'discussion' &&
                    ['RoundReveal', 'RoundEnded', 'Threat', 'ExtraInventory', 'PreVotingReadyCheck', 'VotingResults'].includes(phase));
        if (!canUseNow) {
            return `<button type="button" class="char-btn special-card-use-btn" disabled aria-disabled="true">${t('unavailableNow')}</button>`;
        }

        const targets = getSpecialCardTargets();
        const targetSelectId = `specialCardTargetSelect-${cardIndex}`;
        const characteristicSelectId = `specialCardCharacteristicSelect-${cardIndex}`;
        const needsCharacteristicSelect = [
            'swapSelectedCharacteristicWithTarget',
            'rerollTargetSelectedCharacteristic'
        ].includes(normalized.effectType);
        const characteristicOptions = [
            ['Profession', 'Професія'],
            ['PersonalInfo', 'Особистість'],
            ['Body', 'Статура'],
            ['PhysicalHealth', 'Фізичне здоровʼя'],
            ['MentalHealth', 'Психічне здоровʼя'],
            ['Hobby', 'Хобі'],
            ['CharacterTrait', 'Риса характеру'],
            ['Fact', 'Факт']
        ];
        const targetSelect = normalized.requiresTarget
            ? `<select id="${targetSelectId}" class="special-card-target-select" aria-label="${t('target')}">
                <option value="">${t('choosePlayer')}</option>
                ${targets.map(player => {
                    const connectionId = player.connectionId || player.ConnectionId || '';
                    const seat = player.seatNumber || player.SeatNumber || 0;
                    const name = player.name || player.Name || t('unknown');
                    return `<option value="${escapeHtml(connectionId)}">${seat ? `#${seat} ` : ''}${escapeHtml(name)}</option>`;
                }).join('')}
            </select>`
            : '';
        const characteristicSelect = needsCharacteristicSelect
            ? `<select id="${characteristicSelectId}" class="special-card-target-select" aria-label="Характеристика">
                <option value="">Оберіть характеристику</option>
                ${characteristicOptions.map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}
            </select>`
            : '';
        if (normalized.requiresTarget && targets.length === 0) {
            return `<button type="button" class="char-btn special-card-use-btn" disabled aria-disabled="true">${t('noAvailableTarget')}</button>`;
        }

        const useButtons = normalized.isSecret
            ? `
                <button type="button" class="char-btn special-card-use-btn" data-testid="special-card-use-silent" onclick="useSpecialCardFromCard(${cardIndex}, 'silent')">${t('useSecretly')}</button>
                <button type="button" class="char-btn special-card-use-btn public-use" data-testid="special-card-use-public" onclick="useSpecialCardFromCard(${cardIndex}, 'public')">${t('usePublicly')}</button>
            `
            : `<button type="button" class="char-btn special-card-use-btn" data-testid="special-card-use" onclick="useSpecialCardFromCard(${cardIndex}, 'public')">${t('useSpecialCard')}</button>`;

        return `
            <div class="special-card-controls">
                ${targetSelect}
                ${characteristicSelect}
                <div class="special-card-use-actions">${useButtons}</div>
            </div>
        `;
    }

    function useSpecialCardFromCard(cardIndex = 0, useMode = null) {
        const cards = normalizeSpecialCards(myPlayerData?.specialCards, myPlayerData?.specialCard);
        const card = cards[cardIndex] || normalizeSpecialCard(myPlayerData?.specialCard);
        const select = document.getElementById(`specialCardTargetSelect-${cardIndex}`);
        const targetConnectionId = select ? select.value : null;
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
        connection.invoke("UseSpecialCardById", card.id, targetConnectionId || null, resolvedUseMode, selectedCharacteristic || null)
            .catch(err => console.error("UseSpecialCard error:", err));
    }

    function renderMySpecialCards(player) {
        const section = document.getElementById('mySpecialCardsSection');
        const container = document.getElementById('mySpecialCardsList');
        if (!section || !container) return;

        const cards = normalizeSpecialCards(player?.specialCards || player?.SpecialCards, player?.specialCard || player?.SpecialCard);
        if (cards.length === 0) {
            container.innerHTML = `<p class="special-cards-empty">${t('noData')}</p>`;
            return;
        }

        container.innerHTML = cards.map((card, index) => {
            const status = card.isEffectActive || card.isActive
                ? 'active'
                : card.isUsed || card.usedAtRound
                    ? (card.effectDuration === 'untilRoundEnd' ? 'ended' : 'used')
                    : 'hand';

            return `
                <article class="my-special-card ${status}">
                    <div class="my-special-card-header">
                        <strong>${escapeHtml(getSpecialCardName(card))}</strong>
                        <span class="special-card-status ${status}">${getSpecialCardStatusLabel(status)}</span>
                    </div>
                    <span class="special-card-privacy ${getSpecialCardPrivacyClass(card)}">${getSpecialCardPrivacyLabel(card)}</span>
                    <p>${escapeHtml(getSpecialCardDescription(card))}</p>
                    <div class="my-special-card-actions">
                        ${renderSpecialCardControls(card, index)}
                    </div>
                </article>
            `;
        }).join('');
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

    function updatePlayersTable() {
        const tbody = document.getElementById('playersTableBody');
        if (!tbody) return;
        const players = Object.values(roomPlayers);
        
        if (players.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">${t('players')}: 0</td></tr>`;
            return;
        }
        
        // Сортуємо за номером місця (якщо призначено)
        players.sort(function(a, b) { return (a.seatNumber || 999) - (b.seatNumber || 999); });
        
        tbody.innerHTML = players.map((player, index) => {
            var seatLabel = player.seatNumber ? '#' + player.seatNumber : '#' + (index + 1);
            const isMe = player.connectionId === myConnectionId;
            const isEliminated = player.isEliminated || player.IsEliminated || false;
            
            // Build CSS classes
            let rowClasses = [];
            if (isMe) rowClasses.push('my-player-row');
            if (isEliminated) rowClasses.push('player-eliminated');
            
            // Eliminated badge
            const eliminatedBadge = isEliminated
                ? `<span class="eliminated-badge">${player.hasRevealedAllAfterElimination ? t('eliminatedRevealedBadge') : t('eliminated')}</span>`
                : '';
            const immunity = normalizeEliminationVoteImmunity(player.eliminationVoteImmunity || player.EliminationVoteImmunity);
            const immunityBadge = immunity.isActive && immunity.remainingUses > 0
                ? `<span class="immunity-badge">Імунітет до наступного голосування</span>`
                : '';
            
            return `
            <tr class="${rowClasses.join(' ')}" data-player="${player.connectionId}">
                <td class="player-number">${seatLabel}</td>
                <td class="player-name-cell">
                    <span class="player-name-text">${escapeHtml(player.name)}</span>
                    ${isMe ? `<span class="my-badge">(${t('you')})</span>` : ''}
                    ${player.isHost ? `<span class="host-badge-small">${t('host')}</span>` : ''}
                    ${eliminatedBadge}
                    ${immunityBadge}
                </td>
                <td>${renderTableCell(player, 'personality')}</td>
                <td>${renderTableCell(player, 'body')}</td>
                <td>${renderTableCell(player, 'profession')}</td>
                <td>${renderTableCell(player, 'physicalHealth')}</td>
                <td>${renderTableCell(player, 'mentalHealth')}</td>
                <td>${renderTableCell(player, 'hobby')}</td>
                <td>${renderTableCell(player, 'characterTrait')}</td>
                <td>${renderTableCell(player, 'phobia')}</td>
                <td>${renderTableCell(player, 'inventory')}</td>
                <td>${renderTableCell(player, 'fact')}</td>
            </tr>
            `;
            }).join('');
        
        // Count non-eliminated players for bunker capacity display
        const activePlayers = players.filter(p => !(p.isEliminated || p.IsEliminated));
        document.getElementById('playerCount').textContent = `${activePlayers.length}/${currentBunkerCapacity || currentRoom?.maxPlayers || 12}`;
    }

    function renderTableCell(player, charKey) {
        const revealed = player.revealed && player.revealed[charKey];
        if (revealed) {
            const value = getLocalizedRevealedValue(player, charKey);
            const additionalPhysicalConditions = charKey === 'physicalHealth'
                ? renderAdditionalPhysicalConditionsForTable(player)
                : '';
            // Додаємо tooltip якщо є
            const tooltipData = getLocalizedRevealedTooltip(player, charKey);
            if (tooltipData) {
                const typeClass = getTooltipTypeClass(charKey);
                return `<div class="char-revealed">
                    <span class="characteristic-with-tooltip">
                        <span>${escapeHtml(value)}</span>
                        <span class="tooltip-trigger ${typeClass}">!</span>
                        <div class="tooltip-content">${escapeHtml(tooltipData)}</div>
                    </span>
                    ${additionalPhysicalConditions}
                </div>`;
            }
            return `<div class="char-revealed">${escapeHtml(value)}${additionalPhysicalConditions}</div>`;
        }
        return `<span class="char-hidden">${t('hidden')}</span>`;
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

    function buildAdditionalPhysicalConditionTooltip(effect, lang = getCurrentLanguage()) {
        if (!effect) return '';
        const localization = getLocalization(effect) || {};
        const localized = localization[lang] || localization.uk || null;
        const name = cleanTooltipText(
            localized?.name || localized?.Name || effect.baseName || effect.BaseName || ''
        );
        const severity = cleanTooltipText(getConditionSeverityLabel(effect, lang));
        const severityCode = effect.severityCode || effect.SeverityCode || '';
        const descriptions = localized?.descriptions || localized?.Descriptions || {};
        const localizedDescription = descriptions[severityCode] || localized?.description || localized?.Description || '';
        const description = cleanTooltipText(localized
            ? localizedDescription
            : effect.description || effect.Description || effect.tooltip || effect.Tooltip || '');
        const validName = /^(невідомо|неизвестно|unknown)$/i.test(name) ? '' : name;
        if (!validName && !severity && !description) return '';

        return [
            validName ? `<span class="tooltip-medical-name">${escapeHtml(validName)}</span>` : '',
            severity ? `<span class="tooltip-medical-severity">${escapeHtml(severity.charAt(0).toUpperCase() + severity.slice(1))}</span>` : '',
            description ? `<span class="tooltip-medical-description">${escapeHtml(description)}</span>` : ''
        ].filter(Boolean).join('');
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

    function renderAdditionalPhysicalConditionsForTable(player) {
        const sourcePlayer = player.connectionId === myConnectionId ? myPlayerData : player;
        const conditions = (sourcePlayer?.additionalPhysicalConditions || sourcePlayer?.additionalConditionEffects || [])
            .map(effect => renderAdditionalPhysicalCondition(effect, '+ '))
            .filter(Boolean);
        if (!conditions.length) return '';

        return `<div class="additional-conditions-table">${conditions.join('')}</div>`;
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
        const selfPlayer = roomPlayers?.[myConnectionId] || {};
        const personality = player.personality || {};
        const body = player.body || {};
        const profession = player.profession || {};
        const physicalHealth = player.physicalHealth || {};
        const mentalHealth = player.mentalHealth || {};
        const hobby = player.hobby || {};
        const characterTrait = player.characterTrait || {};
        const phobia = player.phobia || {};
        const inventory = player.inventory || {};
        const fact = normalizeFactFromPlayer({
            ...selfPlayer,
            ...player,
            fact: player.fact || player.Fact || selfPlayer.fact || selfPlayer.Fact
        });
        const factName = getLocalizedValue(fact, 'fact') || getLocalizedValue(fact, 'name') || fact.name || t('noFact');
        const factTooltip = buildLocalizedTooltip(fact, 'fact') || cleanTooltipText(fact.tooltip || fact.description || '');
        const professionName = getProfessionDisplayName(profession);
        const physicalHealthName = getConditionDisplayName(physicalHealth) || physicalHealth.name || 'Здоровий';
        const mentalHealthName = getConditionDisplayName(mentalHealth) || mentalHealth.name || 'Стабільний';
        const additionalConditionEffects = player.additionalPhysicalConditions || player.additionalConditionEffects || [];
        const additionalConditionsHtml = additionalConditionEffects.length
            ? `<div class="additional-conditions">
                    <span class="char-label">${escapeHtml(t('additionalConditions'))}:</span>
                    ${additionalConditionEffects.map(effect => {
                        return renderAdditionalPhysicalCondition(effect);
                    }).filter(Boolean).join('')}
               </div>`
            : '';
        const hobbyName = getLocalizedValue(hobby, 'hobby') || getLocalizedValue(hobby, 'name') || hobby.name || 'Немає хобі';
        const traitName = getLocalizedValue(characterTrait, 'trait') || getLocalizedValue(characterTrait, 'name') || characterTrait.name || 'Невизначений';
        const phobiaName = getLocalizedValue(phobia, 'name') || getLocalizedValue(phobia, 'phobia') || phobia.name || 'Немає фобій';
        const inventoryItems = inventory.items && inventory.items.length > 0
            ? inventory.items.map(i => getLocalizedValue(i, 'item') || getLocalizedValue(i, 'name') || i.name || i.Name || '').filter(Boolean).join(', ')
            : t('empty');
        const eliminationPanel = renderEliminatedRevealAllPanel(player);
        
        function createTooltipHtml(text, typeClass) {
            if (!text) return '';
            return `<span class="tooltip-trigger ${typeClass}" title="">!</span><div class="tooltip-content">${text}</div>`;
        }
        
        function charWithTooltip(name, tooltip, typeClass) {
            const cleanTooltip = cleanTooltipText(tooltip);
            if (!cleanTooltip) return name;
            return `<span class="characteristic-with-tooltip"><span>${name}</span>${createTooltipHtml(cleanTooltip, typeClass)}</span>`;
        }

        function revealControl(characteristicName, isRevealed) {
            if (isRevealed) {
                return `<span class="status-revealed">${t('revealed')}</span>`;
            }

            const disabledReason = getRevealBlockedReason();
            const disabled = disabledReason ? ' disabled aria-disabled="true"' : '';
            const disabledClass = disabledReason ? ' disabled' : '';
            const title = disabledReason ? ` title="${escapeHtml(disabledReason)}"` : '';
            return `<button class="char-btn locked${disabledClass}" onclick="reveal('${characteristicName}')"${disabled}${title}>${t('reveal')}</button>`;
        }
        
        container.innerHTML = `
            ${eliminationPanel}
            <!-- Особистість -->
            <div class="char-card ${revealed.personality ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('personality')}</h3>
                <div class="char-row"><span class="char-label">${t('age')}:</span><span class="char-value">${personality.age ?? '?'} ${t('years')}</span></div>
                <div class="char-row"><span class="char-label">${t('sex')}:</span><span class="char-value">${personality.sex || t('unknown')}${personality.isChildfree ? " (чайлдфрі)" : ""}</span></div>
                <div class="char-row"><span class="char-label">${t('orientation')}:</span><span class="char-value">${personality.sexOrientation || t('unknown')}</span></div>
                <div class="char-row">${revealControl('Personality', revealed.personality)}</div>
            </div>

            <!-- Статура -->
            <div class="char-card ${revealed.body ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('body')}</h3>
                <div class="char-row"><span class="char-label">${t('height')}:</span><span class="char-value">${body.height ?? '?'} см</span></div>
                <div class="char-row"><span class="char-label">${t('weight')}:</span><span class="char-value">${body.weight ?? '?'} кг</span></div>
                <div class="char-row"><span class="char-label">${t('bodyType')}:</span><span class="char-value">${body.bodyType || t('unknown')}</span></div>
                <div class="char-row">${revealControl('Body', revealed.body)}</div>
            </div>

            <!-- Професія -->
            <div class="char-card ${revealed.profession ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('profession')}</h3>
                <div class="char-row"><span class="char-label">${t('name')}:</span><span class="char-value">${charWithTooltip(professionName, profession.tooltip, 'profession')}</span></div>
                <div class="char-row"><span class="char-label">Досвід:</span><span class="char-value">${profession.experienceYears || 0} ${t('years')}</span></div>
                <div class="char-row">${revealControl('Profession', revealed.profession)}</div>
            </div>

            <!-- Фізичне здоров'я -->
            <div class="char-card ${revealed.physicalHealth ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('physicalHealth')}</h3>
                <div class="char-row"><span class="char-label">${t('state')}:</span><span class="char-value">${charWithTooltip(physicalHealthName, buildLocalizedTooltip(physicalHealth, 'physicalHealth') || physicalHealth.tooltip, 'physical')}</span></div>
                ${additionalConditionsHtml}
                <div class="char-row">${revealControl('PhysicalHealth', revealed.physicalHealth)}</div>
            </div>

            <!-- Психічне здоров'я -->
            <div class="char-card ${revealed.mentalHealth ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('mentalHealth')}</h3>
                <div class="char-row"><span class="char-label">${t('state')}:</span><span class="char-value">${charWithTooltip(mentalHealthName, buildLocalizedTooltip(mentalHealth, 'mentalHealth') || mentalHealth.tooltip, 'mental')}</span></div>
                <div class="char-row">${revealControl('MentalHealth', revealed.mentalHealth)}</div>
            </div>

            <!-- Хобі -->
            <div class="char-card ${revealed.hobby ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('hobby')}</h3>
                <div class="char-row"><span class="char-label">${t('activity')}:</span><span class="char-value">${charWithTooltip(hobbyName, hobby.tooltip, 'hobby')}</span></div>
                <div class="char-row">${revealControl('Hobby', revealed.hobby)}</div>
            </div>

            <!-- Риса характеру -->
            <div class="char-card ${revealed.characterTrait ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('characterTrait')}</h3>
                <div class="char-row"><span class="char-label">${t('trait')}:</span><span class="char-value">${traitName}</span></div>
                <div class="char-row">${revealControl('CharacterTrait', revealed.characterTrait)}</div>
            </div>

            <!-- Фобія -->
            <div class="char-card ${revealed.phobia ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('phobia')}</h3>
                <div class="char-row"><span class="char-label">${t('fear')}:</span><span class="char-value">${charWithTooltip(phobiaName, getLocalizedValue(phobia, 'description') || phobia.tooltip, 'phobia')}</span></div>
                <div class="char-row">${revealControl('Phobia', revealed.phobia)}</div>
            </div>

            <!-- Інвентар -->
            <div class="char-card ${revealed.inventory ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('inventory')}</h3>
                <div class="char-row"><span class="char-label">${t('items')}:</span><span class="char-value">${inventoryItems}</span></div>
                <div class="char-row">${revealControl('Inventory', revealed.inventory)}</div>
            </div>

            <!-- Факт -->
            <div class="char-card ${revealed.fact || revealed.Fact ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('fact')}</h3>
             <div class="char-row">
                    <span class="char-label">${t('fact')}:</span>
                    <span class="char-value">${charWithTooltip(factName, factTooltip, 'fact')}</span>
                </div>
             <div class="char-row">
                    ${revealControl('Fact', revealed.fact || revealed.Fact)}
                </div>
        </div>
        `;
        
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

