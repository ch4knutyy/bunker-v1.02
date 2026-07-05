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
    let pendingCardApprovals = []; // Запити на підтвердження карт
    let currentCardToUse = null;
    let pendingJoinRoomId = null; // Для закриття модалки після успішного join
    let hostToken = null;
    let currentApocalypse = null;
    let currentBunker = null;
    let currentVoting = null;
    let myVote = null;
    let activatedCardsTable = {}; // connectionId -> [card1, card2]

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

    const uiTranslations = {
        uk: {
            createRoom: "Створити кімнату", availableRooms: "Доступні кімнати", loadingRooms: "Завантаження кімнат...", noRooms: "Немає доступних кімнат. Створіть свою!", playerNamePlaceholder: "Ваше ім'я...", roomNamePlaceholder: "Назва кімнати...", maxPlayersPlaceholder: "Макс. гравців", passwordOptionalPlaceholder: "Пароль (необов'язково)", passwordIfAnyPlaceholder: "Пароль (якщо є)", room: "Кімната", lobby: "Лобі", game: "Гра", gmPanel: "🎮 GM Панель", voting: "🗳️ Голосування", startGame: "Почати гру", leaveRoom: "Покинути кімнату", players: "Гравці", host: "Хост", you: "Ви", eliminated: "ВИБУВ", myCharacteristics: "Мої характеристики (бачу тільки я)", mySpecialCards: "🃏 Мої спеціальні карти", bunkerAndApocalypse: "🎭 Бункер та Апокаліпсис", apocalypse: "Апокаліпсис", bunker: "Бункер", playersInBunker: "Гравці в бункері:", specialCardsTable: "Таблиця спец. можливостей", gameEvents: "Ігрові події", eventsHistory: "Історія подій", eventsPlaceholder: "Тут будуть відображатися події гри...", reveal: "Розкрити всім", revealed: "Відкрито для всіх", hidden: "Приховано", unknown: "Невідомо", profession: "Професія", inventory: "Інвентар", vote: "Голосувати", roomCode: "Код кімнати", name: "Назва", age: "Вік", years: "років", sex: "Стать", orientation: "Орієнтація", personality: "Особистість", body: "Статура", height: "Зріст", weight: "Вага", bodyType: "Тип тіла", physicalHealth: "Фізичне здоров'я", mentalHealth: "Психічне здоров'я", state: "Стан", hobby: "Хобі", activity: "Заняття", characterTrait: "Риса характеру", trait: "Риса", phobia: "Фобія", fear: "Страх", items: "Предмети", fact: "Факт", empty: "Порожній", noFact: "Немає факту", noData: "Немає даних гравця", noCards: "Немає карт", use: "Використати", close: "Закрити", capacity: "Місткість", condition: "Стан", supplies: "Запаси", location: "Локація", threats: "⚠️ Загрози:", requirements: "✓ Потрібно:", facilities: "🏗️ Приміщення:", resources: "📦 Ресурси:", problems: "⚠️ Проблеми:", survivalChance: "Шанс виживання", duration: "Тривалість", threatLevel: "Загроза", uploadImage: "📤 Завантажити зображення", generatePrompt: "✨ Згенерувати промпт", remove: "🗑️ Видалити", noActivatedCards: "Ще ніхто не активував спецкарти", ordinary: "Звичайна", rare: "Рідкісна", epic: "Епічна", legendary: "Легендарна", available: "✓ Доступна", pending: "⏳ Очікує", approved: "✓ Підтверджена", used: "✗ Використана", rejected: "✗ Відхилена"
        },
        en: {
            createRoom: "Create Room", availableRooms: "Available Rooms", loadingRooms: "Loading rooms...", noRooms: "No available rooms. Create your own!", playerNamePlaceholder: "Your name...", roomNamePlaceholder: "Room name...", maxPlayersPlaceholder: "Max players", passwordOptionalPlaceholder: "Password (optional)", passwordIfAnyPlaceholder: "Password (if any)", room: "Room", lobby: "Lobby", game: "Game", gmPanel: "🎮 GM Panel", voting: "🗳️ Voting", startGame: "Start Game", leaveRoom: "Leave Room", players: "Players", host: "Host", you: "You", eliminated: "ELIMINATED", myCharacteristics: "My characteristics (only I can see)", mySpecialCards: "🃏 My Special Cards", bunkerAndApocalypse: "🎭 Bunker and Apocalypse", apocalypse: "Apocalypse", bunker: "Bunker", playersInBunker: "Players in bunker:", specialCardsTable: "Special Abilities Table", gameEvents: "Game Events", eventsHistory: "Event History", eventsPlaceholder: "Game events will appear here...", reveal: "Reveal to all", revealed: "Revealed to all", hidden: "Hidden", unknown: "Unknown", profession: "Profession", inventory: "Inventory", vote: "Vote", roomCode: "Room Code", name: "Name", age: "Age", years: "years", sex: "Sex", orientation: "Orientation", personality: "Personality", body: "Body", height: "Height", weight: "Weight", bodyType: "Body type", physicalHealth: "Physical health", mentalHealth: "Mental health", state: "State", hobby: "Hobby", activity: "Activity", characterTrait: "Character trait", trait: "Trait", phobia: "Phobia", fear: "Fear", items: "Items", fact: "Fact", empty: "Empty", noFact: "No fact", noData: "No player data", noCards: "No cards", use: "Use", close: "Close", capacity: "Capacity", condition: "Condition", supplies: "Supplies", location: "Location", threats: "⚠️ Threats:", requirements: "✓ Required:", facilities: "🏗️ Facilities:", resources: "📦 Resources:", problems: "⚠️ Problems:", survivalChance: "Survival chance", duration: "Duration", threatLevel: "Threat", uploadImage: "📤 Upload image", generatePrompt: "✨ Generate prompt", remove: "🗑️ Remove", noActivatedCards: "No one has activated special cards yet", ordinary: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", available: "✓ Available", pending: "⏳ Pending", approved: "✓ Approved", used: "✗ Used", rejected: "✗ Rejected"
        },
        ru: {
            createRoom: "Создать комнату", availableRooms: "Доступные комнаты", loadingRooms: "Загрузка комнат...", noRooms: "Нет доступных комнат. Создайте свою!", playerNamePlaceholder: "Ваше имя...", roomNamePlaceholder: "Название комнаты...", maxPlayersPlaceholder: "Макс. игроков", passwordOptionalPlaceholder: "Пароль (необязательно)", passwordIfAnyPlaceholder: "Пароль (если есть)", room: "Комната", lobby: "Лобби", game: "Игра", gmPanel: "🎮 GM Панель", voting: "🗳️ Голосование", startGame: "Начать игру", leaveRoom: "Покинуть комнату", players: "Игроки", host: "Ведущий", you: "Вы", eliminated: "ВЫБЫЛ", myCharacteristics: "Мои характеристики (вижу только я)", mySpecialCards: "🃏 Мои специальные карты", bunkerAndApocalypse: "🎭 Бункер и Апокалипсис", apocalypse: "Апокалипсис", bunker: "Бункер", playersInBunker: "Игроки в бункере:", specialCardsTable: "Таблица спец. возможностей", gameEvents: "Игровые события", eventsHistory: "История событий", eventsPlaceholder: "Здесь будут отображаться события игры...", reveal: "Раскрыть всем", revealed: "Открыто для всех", hidden: "Скрыто", unknown: "Неизвестно", profession: "Профессия", inventory: "Инвентарь", vote: "Голосовать", roomCode: "Код комнаты", name: "Название", age: "Возраст", years: "лет", sex: "Пол", orientation: "Ориентация", personality: "Личность", body: "Телосложение", height: "Рост", weight: "Вес", bodyType: "Тип тела", physicalHealth: "Физическое здоровье", mentalHealth: "Психическое здоровье", state: "Состояние", hobby: "Хобби", activity: "Занятие", characterTrait: "Черта характера", trait: "Черта", phobia: "Фобия", fear: "Страх", items: "Предметы", fact: "Факт", empty: "Пусто", noFact: "Нет факта", noData: "Нет данных игрока", noCards: "Нет карт", use: "Использовать", close: "Закрыть", capacity: "Вместимость", condition: "Состояние", supplies: "Запасы", location: "Локация", threats: "⚠️ Угрозы:", requirements: "✓ Нужно:", facilities: "🏗️ Помещения:", resources: "📦 Ресурсы:", problems: "⚠️ Проблемы:", survivalChance: "Шанс выживания", duration: "Длительность", threatLevel: "Угроза", uploadImage: "📤 Загрузить изображение", generatePrompt: "✨ Сгенерировать промпт", remove: "🗑️ Удалить", noActivatedCards: "Еще никто не активировал спецкарты", ordinary: "Обычная", rare: "Редкая", epic: "Эпическая", legendary: "Легендарная", available: "✓ Доступна", pending: "⏳ Ожидает", approved: "✓ Подтверждена", used: "✗ Использована", rejected: "✗ Отклонена"
        }
    };

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

    function getI18n(source) {
        return source?._i18n || source?.i18n || source?.I18n || null;
    }

    function getRawField(source, field) {
        if (!source) return "";
        const pascal = field ? field.charAt(0).toUpperCase() + field.slice(1) : field;
        return source[field] ?? source[pascal] ?? "";
    }

    function getLocalizedValue(source, field, lang = getCurrentLanguage()) {
        if (!source) return "";
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

        const leaveBtn = document.querySelector('.room-actions .btn-danger');
        if (leaveBtn) leaveBtn.textContent = t('leaveRoom');

        setPlaceholder('#playerNameCreate', t('playerNamePlaceholder'));
        setPlaceholder('#playerNameJoin', t('playerNamePlaceholder'));
        setPlaceholder('#roomName', t('roomNamePlaceholder'));
        setPlaceholder('#maxPlayers', t('maxPlayersPlaceholder'));
        setPlaceholder('#roomPassword', t('passwordOptionalPlaceholder'));
        setPlaceholder('#joinRoomPassword', t('passwordIfAnyPlaceholder'));

        setText('#myPlayerSection > .section-title', t('myCharacteristics'));
        const myCardsTitle = document.querySelector('#myPlayerSection > .section-title[style]');
        if (myCardsTitle) myCardsTitle.textContent = t('mySpecialCards');
        setText('.scenario-section-header .section-header-title', t('bunkerAndApocalypse'));
        setText('#specialCardsTableSection .section-title', t('specialCardsTable'));
        setText('.events-section-main > .section-title', t('gameEvents'));
        setText('.events-history-title', t('eventsHistory'));

        const apocTitle = document.querySelector('#apocalypsePanel .panel-title');
        if (apocTitle) apocTitle.textContent = `☢️ ${t('apocalypse')}`;
        const bunkerTitle = document.querySelector('#bunkerPanel .panel-title');
        if (bunkerTitle) bunkerTitle.textContent = `🏠 ${t('bunker')}`;

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

        const cardHeaders = document.querySelectorAll('#specialCardsTable thead th');
        const cardHeaderLabels = ['№', t('name'), `${t('use')} 1`, `${t('use')} 2`];
        cardHeaders.forEach((th, index) => {
            if (cardHeaderLabels[index]) th.textContent = cardHeaderLabels[index];
        });
    }

    function rerenderLocalizedUI() {
        renderCurrentGameUI();
        if (currentVoting && document.getElementById('votingPanel')?.style.display !== 'none' && typeof showVotingPanel === "function") showVotingPanel(currentVoting);
        if (currentVoting && document.getElementById('votingResultsPanel')?.style.display !== 'none' && typeof showVotingResults === "function") showVotingResults(currentVoting);
        if (currentCardToUse && document.getElementById('useCardModal')?.style.display !== 'none') {
            document.getElementById('useCardTitle').textContent = `${t('use')}: ${getLocalizedValue(currentCardToUse, 'name') || currentCardToUse.name}`;
            document.getElementById('useCardDescription').textContent = getLocalizedValue(currentCardToUse, 'description') || currentCardToUse.description || '';
        }
    }

    function renderCurrentGameUI() {
        applyStaticTranslations();
        if (typeof updateRoomUI === "function") updateRoomUI();
        if (typeof renderMyPlayerCards === "function") {
            try {
                renderMyPlayerCards(myPlayerData);
            } catch (error) {
                console.warn("Failed to render current player character cards", error);
                const container = document.getElementById("myPlayerCards");
                if (container) container.innerHTML = `<p style="color: var(--color-text-muted);">${t('noData')}</p>`;
            }
        }
        if (typeof renderMyCards === "function") {
            try {
                renderMyCards();
            } catch (error) {
                console.warn("Failed to render current player special cards", error);
                const container = document.getElementById("myCardsSection");
                if (container) container.innerHTML = `<p style="color: var(--color-text-muted);">${t('noCards')}</p>`;
            }
        }
        if (currentApocalypse && typeof renderApocalypse === "function") renderApocalypse(currentApocalypse);
        if (currentBunker && typeof renderBunker === "function") renderBunker(currentBunker);
        if (typeof updatePlayersTable === "function") updatePlayersTable();
        if (typeof updateActivatedCardsTable === "function") updateActivatedCardsTable();
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
        pendingCardApprovals = [];
        currentCardToUse = null;
        pendingJoinRoomId = null;
        hostToken = null;
        currentApocalypse = null;
        currentBunker = null;
        currentVoting = null;
        myVote = null;
        activatedCardsTable = {};
        if (typeof gmRevealedChars !== "undefined") gmRevealedChars = {};

        ['myPlayerCards', 'myCardsSection', 'playersTableBody', 'roomPlayersList', 'apocalypseContent', 'bunkerContent', 'specialCardsTableBody', 'votingCandidates', 'votingResultsContent'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '';
        });

        ['gameSection', 'votingPanel', 'votingResultsPanel', 'specialCardsTableSection', 'gmPanel', 'gmPlayerInfo'].forEach(id => {
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
            "specialCards",
            "currentRoom",
            "currentPlayerCharacter",
            "currentPlayerSpecialCards"
        ].forEach(key => localStorage.removeItem(key));

        [
            "currentRoomId",
            "currentPlayerId",
            "playerCharacter",
            "specialCards",
            "currentRoom",
            "currentPlayerCharacter",
            "currentPlayerSpecialCards"
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
            .replace(/\b(?:weak|medium|strong|adult content|слабка|середня|сильна|дорослий контент|слабая|средняя|сильная|взрослый контент)\b/giu, '');
        return cleaned
            .split('.')
            .map(part => part.trim())
            .filter(Boolean)
            .join('. ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/([^.!?])$/, '$1.');
    }

    function getSeverityCode(source) {
        const stableCode = (source?.severityCode ?? source?.SeverityCode ?? '').toString();
        const stableMap = {
            Mild: 'mild',
            Moderate: 'moderate',
            Severe: 'severe',
            VerySevere: 'verySevere',
            Critical: 'critical'
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
            uk: { mild: 'Легка форма', moderate: 'Середня форма', severe: 'Важка форма', verySevere: 'Дуже важка форма', critical: 'Критична форма' },
            en: { mild: 'Mild form', moderate: 'Moderate form', severe: 'Severe form', verySevere: 'Very severe form', critical: 'Critical form' },
            ru: { mild: 'Лёгкая форма', moderate: 'Средняя форма', severe: 'Тяжёлая форма', verySevere: 'Очень тяжёлая форма', critical: 'Критическая форма' }
        };
        return labels[getCurrentLanguage()]?.[code] || '';
    }

    function getConditionSeverityLabel(condition, lang = getCurrentLanguage()) {
        if (!condition) return "";
        const code = condition.severityCode || condition.SeverityCode;
        if (!code || code === "None") return "";

        const labels = {
            uk: {
                Mild: "легка форма",
                Moderate: "середня форма",
                Severe: "важка форма",
                VerySevere: "дуже важка форма",
                Critical: "критична форма"
            },
            ru: {
                Mild: "лёгкая форма",
                Moderate: "средняя форма",
                Severe: "тяжёлая форма",
                VerySevere: "очень тяжёлая форма",
                Critical: "критическая форма"
            },
            en: {
                Mild: "mild form",
                Moderate: "moderate form",
                Severe: "severe form",
                VerySevere: "very severe form",
                Critical: "critical form"
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
        const name = getLocalizedPhysicalField(source, ["назва", "name"], ["baseName", "name"]);
        const description = getLocalizedPhysicalField(source, ["опис", "description"], ["description"]);
        const effect = getLocalizedPhysicalField(source, ["ефект_у_грі", "gameEffect"], ["gameEffect"]);
        const severity = conditionShouldShowSeverity(source) ? getConditionSeverityLabel(source) : "";
        const header = name
            ? severity
                ? `${name} — ${severity}.`
                : `${name}.`
            : "";

        return [header, description, effect]
            .map(part => cleanTooltipText(part))
            .filter(Boolean)
            .map(sentenceCase)
            .join(" ");
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
            fact: !!(src.fact ?? src.Fact)
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
            const name = getLocalizedValue(source, 'profession') || getLocalizedValue(source, 'name') || source?.name || source?.Name || '';
            const selectedItem = getLocalizedValue(source, 'selectedItem') || source?.selectedItem || source?.SelectedItem || '';
            const experience = source?.experienceYears ?? source?.ExperienceYears;
            const parts = [name || t('profession')];
            if (selectedItem) parts.push(`(+${selectedItem})`);
            if (Number.isFinite(Number(experience)) && Number(experience) > 0) parts.push(`(${experience} ${t('years')})`);
            return parts.join(' ');
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
                _i18n: getI18n(source)
            };
        }
        
        const normalized = {
            name: player.name ?? player.Name ?? 'Гравець',
            connectionId: player.connectionId ?? player.ConnectionId ?? null,
            isHost: player.isHost ?? player.IsHost ?? false,
            isEliminated: player.isEliminated ?? player.IsEliminated ?? false,
            seatNumber: player.seatNumber ?? player.SeatNumber ?? 0,
            _hasCharacter: hasGeneratedCharacterData(player),
            revealed: normalizeRevealedState(player.revealed ?? player.Revealed ?? {}),
            
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
                return {
                    name: src.name ?? src.Name ?? 'Безробітний',
                    tooltip: cleanTooltipText(src.tooltip ?? src.Tooltip ?? null),
                    experienceYears: src.experienceYears ?? src.ExperienceYears ?? 0,
                    selectedItem: src.selectedItem ?? src.SelectedItem ?? null,
                    _i18n: getI18n(src)
                };
            })(),
            
            // Health
            physicalHealth: normalizeSimple(player, 'physicalHealth', 'PhysicalHealth'),
            mentalHealth: normalizeSimple(player, 'mentalHealth', 'MentalHealth'),
            
            // Other characteristics
            hobby: normalizeSimple(player, 'hobby', 'Hobby'),
            characterTrait: normalizeSimple(player, 'characterTrait', 'CharacterTrait'),
            phobia: normalizeSimple(player, 'phobia', 'Phobia'),
            fact: normalizeFactFromPlayer(player),
            
            // Inventory
            inventory: (() => {
                const src = player.inventory || player.Inventory || {};
                const items = src.items ?? src.Items ?? [];
                return {
                    items: items.map(item => ({
                        name: item.name ?? item.Name ?? 'Предмет',
                        description: item.description ?? item.Description ?? '',
                        _i18n: getI18n(item)
                    }))
                };
            })(),
            
            // Cards
            cards: (player.cards || player.Cards || []).map(card => ({
                id: card.id ?? card.Id ?? null,
                name: card.name ?? card.Name ?? 'Карта',
                description: card.description ?? card.Description ?? '',
                rarity: card.rarity ?? card.Rarity ?? 'common',
                effectType: card.effectType ?? card.EffectType ?? null,
                effectValue: card.effectValue ?? card.EffectValue ?? null,
                state: card.state ?? card.State ?? 'Available',
                _i18n: getI18n(card)
            }))
        };
        
        return normalized;
    }

    // Render activated card badge with tooltip
    function renderActivatedCardBadge(card) {
        const rarity = card?.rarity || "common";
        const name = getLocalizedValue(card, "name") || card?.name || "Карта";
        const description = getLocalizedValue(card, "description") || card?.description || "";

        return `
            <span class="activated-card-badge rarity-${rarity} card-tooltip-wrapper"
                  data-tooltip="${escapeHtml(description)}">
                <span class="card-badge-text">${escapeHtml(name)}</span>
                <span class="card-badge-icon">!</span>
            </span>
        `;
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
        console.log("[RoomCreated] Player cards:", data.player.cards || data.player.Cards);

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
                isEliminated: p.isEliminated ?? p.IsEliminated ?? false,
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
                isEliminated: myPlayerData.isEliminated || false,
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
        console.log("[RoomJoined] Player cards:", data.player?.cards || data.player?.Cards);
        
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
                revealedTooltips: revealedValues.revealedTooltips
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
            currentRoomState.textContent = t('game');
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

        // Show voting button for host now that game is active
        const votingBtn = document.getElementById('startVotingBtn');
        if (votingBtn) {
            if (isHost && !currentVoting) {
                votingBtn.style.display = 'inline-block';
                console.log("[GameStarted] Voting button shown for host");
            } else {
                votingBtn.style.display = 'none';
            }
        }

        // Update activated cards table
        console.log("[GameStarted] Calling updateActivatedCardsTable...");
        updateActivatedCardsTable();

        // Show GM sections for host using the dedicated function
        console.log("[GameStarted] Calling updateGMSections...");
        updateGMSections();
        
        // Update bunker capacity display
        if (isHost && currentBunker) {
            currentBunkerCapacity = currentBunker.capacity;
            const gmBunkerCapacity = document.getElementById('gmBunkerCapacity');
            if (gmBunkerCapacity) {
                gmBunkerCapacity.textContent = currentBunker.capacity;
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
        const currentRound = data.currentRound || data.CurrentRound || 1;
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
            if (charKey === 'fact') {
                roomPlayers[info.connectionId].fact = normalizeFactFromPlayer({ fact: source || info.data.fact || info.data.Fact, revealedData: { fact: info.data } });
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

        renderCurrentGameUI();
    }
        
        updatePlayersTable();
        // Реініціалізуємо tooltip після оновлення DOM
        if (typeof initMobileTooltips === 'function') {
            setTimeout(initMobileTooltips, 100);
        }
        addEventMessage(`<span class="event-player">${info.playerName}</span> розкрив: <span class="revealed-label">${info.data.label}</span>`);
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
        }
        
        updatePlayersTable();
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
        }
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
        }
        updatePlayersTable();
        updateGMPlayerSelect();
        addEventMessage(`<span class="event-restore">✅ ${info.playerName}</span> повернено в гру!`);
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
    });

    // GM дія успішна
    connection.off("GMActionSuccess");
    connection.on("GMActionSuccess", function (info) {
        console.log("GM action success:", info);
        addEventMessage(`<span class="event-gm">GM</span> ${info.action}: ${info.playerName} - ${info.characteristicName || ''}`);
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
        addEventMessage("Помилка: " + message);
    });

    // ==================== SESSION RESTORE HANDLERS ====================

    // Успішне перепідключення
    connection.off("RejoinSuccess");
    connection.on("RejoinSuccess", function (data) {
        console.log("=== REJOIN SUCCESS START ===");
        console.log("[RejoinSuccess] raw data:", data);
        console.log("[RejoinSuccess] data.activatedCards:", data.activatedCards);
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
                isEliminated: p.isEliminated ?? p.IsEliminated ?? false,
                seatNumber: p.seatNumber ?? p.SeatNumber ?? 0
            };

            console.log(`[RejoinSuccess] roomPlayers[${index}]`, roomPlayers[connId]);
        });

        console.log("[RejoinSuccess] roomPlayers final:", roomPlayers);

        activatedCards = (data.activatedCards || data.ActivatedCards || []).map(function (card, index) {
            const normalized = {
                cardId: card.cardId || card.CardId || '',
                name: card.name || card.Name || card.cardName || card.CardName || '',
                rarity: card.rarity || card.Rarity || 'common',
                description: card.description || card.Description || card.cardDescription || card.CardDescription || '',
                playerId: card.playerId || card.PlayerId || card.connectionId || card.ConnectionId || '',
                playerName: card.playerName || card.PlayerName || '',
                targetPlayerId: card.targetPlayerId || card.TargetPlayerId || null,
                targetPlayerName: card.targetPlayerName || card.TargetPlayerName || null,
                targetCharacteristic: card.targetCharacteristic || card.TargetCharacteristic || null,
                activatedAt: card.activatedAt || card.ActivatedAt || null
            };

            console.log(`[RejoinSuccess] normalized activatedCard[${index}]`, normalized);
            return normalized;
        });

        console.log("[RejoinSuccess] activatedCards final:", activatedCards);

        activatedCardsTable = {};

        activatedCards.forEach(function (card, index) {
            const connectionId = card.playerId;

            console.log(`[RejoinSuccess] rebuild card[${index}] connectionId=`, connectionId);

            if (!connectionId) {
                console.warn(`[RejoinSuccess] card[${index}] skipped because no connectionId`, card);
                return;
            }

            if (!activatedCardsTable[connectionId]) {
                activatedCardsTable[connectionId] = [];
            }

            if (activatedCardsTable[connectionId].length < 2) {
                activatedCardsTable[connectionId].push({
                    name: card.name || 'Карта',
                    rarity: card.rarity || 'common',
                    description: card.description || ''
                });
            }
        });

        console.log("[RejoinSuccess] activatedCardsTable final:", activatedCardsTable);
        console.log("[RejoinSuccess] Object.keys(activatedCardsTable):", Object.keys(activatedCardsTable));
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
                currentRoom.state === 'Voting' ? 'Голосування' : 'Гра';

            const startBtn = document.getElementById('startGameBtn');
            if (startBtn) {
                startBtn.style.display = 'none';
                startBtn.disabled = true;
            }

            // Show voting button for host in game state
            const votingBtn = document.getElementById('startVotingBtn');
            if (votingBtn) {
                if (isHost && !currentVoting && currentRoom.state !== 'Voting') {
                    votingBtn.style.display = 'inline-block';
                    console.log("[RejoinSuccess] Voting button shown for host");
                } else {
                    votingBtn.style.display = 'none';
                }
            }

            if (currentApocalypse) renderApocalypse(currentApocalypse);
            if (currentBunker) renderBunker(currentBunker);

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
                } else if (votingState === 'Completed') {
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

    // ==================== CARD SIGNALR HANDLERS ====================

    // Карта очікує підтвердження
    connection.off("CardPending");
    connection.on("CardPending", function (card) {
        console.log("Card pending:", card);
        renderCurrentGameUI();
        addEventMessage(`Карта <span class="card-name">${card.name}</span> очікує підтвердження хоста`);
    });

    // Запит на підтвердження карти (для хоста)
    connection.off("CardApprovalRequest");
    connection.on("CardApprovalRequest", function (data) {
        console.log("Card approval request:", data);
        pendingCardApprovals.push(data);
        showCardApprovalModal(data);
        addEventMessage(`<span class="event-gm">🃏</span> ${data.playerName} хоче використати карту <span class="card-name">${data.card.name}</span>`);
    });

    // Карта використана
    connection.off("CardUsed");
    connection.on("CardUsed", function (data) {
        console.log("Card used:", data);
        if (myPlayerData) {
            const cardIndex = myPlayerData.cards.findIndex(c => c.id === data.card.id);
            if (cardIndex >= 0) {
                myPlayerData.cards[cardIndex] = data.card;
            }
        }
        renderCurrentGameUI();
        addEventMessage(`Карта <span class="card-name">${data.card.name}</span> використана: ${data.result}`);
    });

    // Карта відхилена
    connection.off("CardRejected");
    connection.on("CardRejected", function (data) {
        console.log("Card rejected:", data);
        if (myPlayerData) {
            const cardIndex = myPlayerData.cards.findIndex(c => c.id === data.card.id);
            if (cardIndex >= 0) {
                myPlayerData.cards[cardIndex] = data.card;
            }
        }
        renderCurrentGameUI();
        addEventMessage(`<span class="event-error">Карта ${data.card.name} відхилена: ${data.reason}</span>`);
    });

    // Нова карта отримана
    connection.off("CardReceived");
    connection.on("CardReceived", function (card) {
        console.log("Card received:", card);
        if (myPlayerData) {
            if (!myPlayerData.cards) myPlayerData.cards = [];
            myPlayerData.cards.push(card);
        }
        renderCurrentGameUI();
        addEventMessage(`<span class="event-card">🃏</span> Ви отримали нову карту: <span class="card-name">${card.name}</span>`);
    });

    // Карта активована (для всіх)
    connection.off("CardActivated");
    connection.on("CardActivated", function (data) {
        console.log("=== CardActivated START ===");
        console.log("[CardActivated] RAW DATA:", data);

        const connectionId =
            data.connectionId ||
            data.playerConnectionId ||
            data.ConnectionId ||
            data.PlayerConnectionId;

        const card = data.card || data.Card || data;

        const normalizedCard = {
            name:
                data.cardName ||
                data.CardName ||
                card?.name ||
                card?.Name ||
                data.name ||
                data.Name ||
                "Карта",

            rarity:
                data.cardRarity ||
                data.CardRarity ||
                card?.rarity ||
                card?.Rarity ||
                data.rarity ||
                data.Rarity ||
                "common",

            description:
                data.cardDescription ||
                data.CardDescription ||
                card?.description ||
                card?.Description ||
                data.description ||
                data.Description ||
                "",
            _i18n: getI18n(card)
        };

        console.log("[CardActivated] normalizedCard:", normalizedCard);

        if (!connectionId) return;

        addActivatedCard(connectionId, normalizedCard);

        const section = document.getElementById("specialCardsTableSection");
        if (section) {
            section.style.display = "block";
        }

        addEventMessage(
            `<span class="event-card">🃏</span> ${data.playerName || data.PlayerName || "Гравець"} активував карту <span class="card-name">${normalizedCard.name}</span>`
        );
    });

    // Факт переглянуто (тільки власнику карти)
    connection.off("FactViewed");
    connection.on("FactViewed", function (data) {
        alert(`Факт гравця ${data.targetPlayerName}:\n\n${data.factValue}`);
        addEventMessage(`Ви дізналися факт гравця ${data.targetPlayerName}`);
    });

    // Характеристику обміняно
    connection.off("CharacteristicSwapped");
    connection.on("CharacteristicSwapped", function (data) {
        console.log("Characteristic swapped:", data);
        myPlayerData = normalizePlayer(data.player);
        renderCurrentGameUI();
        addEventMessage(`Вашу характеристику ${data.characteristicName} обміняно з ${data.withPlayerName}`);
    });

    // ==================== SCENARIO & EVENT SIGNALR HANDLERS ====================

    // Кількість слотів бункера змінено
    connection.off("BunkerCapacityUpdated");
    connection.on("BunkerCapacityUpdated", function (data) {
        console.log("Bunker capacity updated:", data);
        if (currentBunker) currentBunker.capacity = data.capacity;
        document.getElementById('gmBunkerCapacity').textContent = data.capacity;
        renderBunker(data.bunker);
        addEventMessage(`<span class="event-gm">GM</span> змінив кількість слотів бункера на <strong>${data.capacity}</strong>`);
    });

    // Бункер змінено
    connection.off("BunkerChanged");
    connection.on("BunkerChanged", function (data) {
        console.log("Bunker changed:", data);
        currentBunker = data.bunker;
        document.getElementById('gmBunkerCapacity').textContent = data.bunker.capacity;
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

    // ==================== VOTING SIGNALR HANDLERS ====================

    // Голосування почалось
    connection.off("VotingStarted");
    connection.on("VotingStarted", function (data) {
        console.log("Voting started:", data);
        currentVoting = data;
        myVote = null;
        showVotingPanel(data);
        addEventMessage(`<span class="event-voting">🗳️ Голосування почалось!</span> Раунд ${data.round}`);
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
        currentVoting = null;
        
        // Ховаємо панель результатів
        document.getElementById('votingResultsPanel').style.display = 'none';
        
        // Оновлюємо UI
        renderCurrentGameUI();
        
        addEventMessage(`<span class="event-voting">⚖️</span> ${data.message}. Раунд ${data.nextRound}`);
    });

    // Голосування скасовано
    connection.off("VotingCancelled");
    connection.on("VotingCancelled", function (data) {
        console.log("Voting cancelled:", data);
        currentVoting = null;
        
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

function addActivatedCard(connectionId, card) {
    console.log("=== addActivatedCard START ===");
    console.log("[addActivatedCard] connectionId:", connectionId);
    console.log("[addActivatedCard] card:", card);

    if (!connectionId) return;

    if (!activatedCardsTable[connectionId]) {
        activatedCardsTable[connectionId] = [];
    }

    const normalizedCard = {
        name: card.name || card.cardName || "Карта",
        rarity: card.rarity || card.cardRarity || "common",
        description: card.description || card.cardDescription || ""
    };

    if (activatedCardsTable[connectionId].length < 2) {
        activatedCardsTable[connectionId].push(normalizedCard);
    }

    console.log("[addActivatedCard] activatedCardsTable AFTER:", activatedCardsTable);

    updateActivatedCardsTable();

    console.log("=== addActivatedCard END ===");
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

    function changeBunkerCapacity(delta) {
        currentBunkerCapacity += delta;
        if (currentBunkerCapacity < 1) currentBunkerCapacity = 1;
        document.getElementById('gmBunkerCapacity').textContent = currentBunkerCapacity;
        connection.invoke("UpdateBunkerCapacity", currentBunkerCapacity)
            .catch(function(err) { console.error("UpdateBunkerCapacity error:", err); });
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
        console.log('[Tooltip] Initializing mobile tooltips');
        initActivatedCardTooltips();
    }
    
    // Initialize tooltips for activated cards with proper positioning
    function initActivatedCardTooltips() {
        document.querySelectorAll('.activated-card-badge').forEach(badge => {
            // Check if badge is near the top of viewport and adjust positioning
            badge.addEventListener('mouseenter', function() {
                const rect = this.getBoundingClientRect();
                const tooltipContent = this.querySelector('.card-tooltip-content');
                if (tooltipContent) {
                    // Check if tooltip would go above viewport
                    const tooltipHeight = 100; // approximate height
                    if (rect.top < tooltipHeight + 20) {
                        this.classList.add('tooltip-bottom');
                    } else {
                        this.classList.remove('tooltip-bottom');
                    }
                }
            });
        });
    }
    
    // Глобальний обробник для всіх кліків - працює і для динамічно створених елементів
    document.addEventListener('click', function(e) {
        // Handle .tooltip-trigger (original tooltips)
        const trigger = e.target.closest('.tooltip-trigger');
        
        // Handle .activated-card-badge (new card tooltips)
        const cardBadge = e.target.closest('.activated-card-badge');
        
        if (cardBadge) {
            e.preventDefault();
            e.stopPropagation();
            
            const wasActive = cardBadge.classList.contains('tooltip-active');
            
            // Close all other tooltips
            document.querySelectorAll('.activated-card-badge.tooltip-active').forEach(t => {
                t.classList.remove('tooltip-active');
            });
            document.querySelectorAll('.tooltip-trigger.active').forEach(t => {
                t.classList.remove('active');
            });
            closeMobileTooltipOverlay();
            
            if (!wasActive) {
                if (isMobileDevice()) {
                    showMobileCardTooltipOverlay(cardBadge);
                } else {
                    cardBadge.classList.add('tooltip-active');
                }
            }
            return;
        }
        
        if (trigger) {
            e.preventDefault();
            e.stopPropagation();
            
            const wasActive = trigger.classList.contains('active');
            
            // Закриваємо всі інші тултіпи
            document.querySelectorAll('.tooltip-trigger.active').forEach(t => {
                t.classList.remove('active');
            });
            document.querySelectorAll('.activated-card-badge.tooltip-active').forEach(t => {
                t.classList.remove('tooltip-active');
            });
            
            // Закриваємо мобільний оверлей
            closeMobileTooltipOverlay();
            
            if (!wasActive) {
                // На мобільних показуємо модальний оверлей
                if (isMobileDevice()) {
                    showMobileTooltipOverlay(trigger);
                } else {
                    trigger.classList.add('active');
                }
            }
            return;
        }
        
        // Клік поза тултіпом - закрити всі
        if (!e.target.closest('.tooltip-content') && 
            !e.target.closest('.card-tooltip-content') && 
            !e.target.closest('.mobile-tooltip-overlay')) {
            document.querySelectorAll('.tooltip-trigger.active').forEach(t => {
                t.classList.remove('active');
            });
            document.querySelectorAll('.activated-card-badge.tooltip-active').forEach(t => {
                t.classList.remove('tooltip-active');
            });
            closeMobileTooltipOverlay();
        }
    }, true);
    
    // Touch events для мобільних
    document.addEventListener('touchend', function(e) {
        const trigger = e.target.closest('.tooltip-trigger');
        const cardBadge = e.target.closest('.activated-card-badge');
        if (trigger || cardBadge) {
            e.preventDefault();
            // Імітуємо клік
            (trigger || cardBadge).click();
        }
    }, { passive: false });
    
    function isMobileDevice() {
        return window.innerWidth <= 768 || 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    }
    
    // Mobile overlay for activated card tooltips
    function showMobileCardTooltipOverlay(badge) {
        closeMobileTooltipOverlay();
        
        const tooltipContent = badge.querySelector('.card-tooltip-content');
        const cardName = badge.querySelector('.card-badge-text')?.textContent || 'Карта';
        const tooltipText = tooltipContent?.textContent || badge.getAttribute('data-tooltip') || 'Без опису';
        
        const overlay = document.createElement('div');
        overlay.className = 'mobile-tooltip-overlay';
        overlay.innerHTML = `
            <div class="mobile-tooltip-backdrop"></div>
            <div class="mobile-tooltip-card">
                <div class="mobile-tooltip-header" style="font-weight: 700; color: var(--color-gold); margin-bottom: 8px; font-size: 1.1rem;">${escapeHtml(cardName)}</div>
                <div class="mobile-tooltip-content">${escapeHtml(tooltipText)}</div>
                <button class="mobile-tooltip-close" onclick="closeMobileTooltipOverlay()">Закрити</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        overlay.querySelector('.mobile-tooltip-backdrop').addEventListener('click', closeMobileTooltipOverlay);
    }
    
    function showMobileTooltipOverlay(trigger) {
        // Видаляємо старий оверлей якщо є
        closeMobileTooltipOverlay();
        
        const tooltipContent = trigger.nextElementSibling;
        if (!tooltipContent || !tooltipContent.classList.contains('tooltip-content')) return;
        
        const tooltipText = tooltipContent.textContent || tooltipContent.innerText;
        
        // Створюємо мобільний оверлей
        const overlay = document.createElement('div');
        overlay.className = 'mobile-tooltip-overlay';
        overlay.innerHTML = `
            <div class="mobile-tooltip-backdrop"></div>
            <div class="mobile-tooltip-card">
                <div class="mobile-tooltip-content">${tooltipText}</div>
                <button class="mobile-tooltip-close" onclick="closeMobileTooltipOverlay()">Закрити</button>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // Закриття по кліку на backdrop
        overlay.querySelector('.mobile-tooltip-backdrop').addEventListener('click', closeMobileTooltipOverlay);
    }
    
    function closeMobileTooltipOverlay() {
        const overlay = document.querySelector('.mobile-tooltip-overlay');
        if (overlay) {
            overlay.remove();
        }
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
            alert("Введіть ваше ім'я");
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

    function joinRoom(roomId, hasPassword) {
        if (hasPassword) {
            document.getElementById('joinRoomId').value = roomId;
            const joinNameInput = document.getElementById('playerNameJoin');
            const createNameInput = document.getElementById('playerNameCreate');
            if (joinNameInput && !joinNameInput.value.trim()) {
                joinNameInput.value = createNameInput?.value?.trim() || localStorage.getItem('bunker_lastPlayerName') || '';
            }
            document.getElementById('joinModal').style.display = 'flex';
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

    function startVoting() {
        if (confirm('Почати голосування?')) {
            connection.invoke("StartVoting")
                .catch(err => console.error("StartVoting error:", err));
        }
    }

    function showVotingPanel(data) {
        document.getElementById('votingRound').textContent = data.round;
        const votedCount = data.votedCount ?? data.VotedCount ?? 0;
        const totalVoters = data.eligibleVoters ?? data.EligibleVoters ?? data.totalVoters ?? data.TotalVoters ?? 0;
        document.getElementById('votingProgressText').textContent = `${votedCount}/${totalVoters} проголосували`;
        document.getElementById('myVoteStatus').style.display = 'none';
        
        // Показуємо кнопки хоста
        document.getElementById('votingHostControls').style.display = isHost ? 'flex' : 'none';
        
        // Рендеримо кандидатів
        const candidatesContainer = document.getElementById('votingCandidates');
        const candidates = data.candidates || data.Candidates || [];
        candidatesContainer.innerHTML = candidates.map(c => {
            var badges = '';
            if (c.isProtected) badges += '<span class="badge-protected" title="Захищений від голосування">🛡️</span>';
            if (c.extraVotes > 0) badges += `<span class="badge-extra-votes" title="Має ${c.extraVotes} додаткових голосів">+${c.extraVotes}🗳️</span>`;
            
            var voteBtn = '';
            if (c.connectionId === myConnectionId) {
                voteBtn = '<span class="self-label">(Ви)</span>';
            } else if (c.isProtected) {
                voteBtn = '<span class="protected-label">Захищений</span>';
            } else {
                voteBtn = `<button class="btn-vote-for" onclick="voteFor('${c.connectionId}')">Голосувати</button>`;
            }
            
            return `<div class="voting-candidate ${c.connectionId === myConnectionId ? 'self-candidate' : ''} ${c.isProtected ? 'protected-candidate' : ''}" 
                 data-connection-id="${c.connectionId}">
                <span class="candidate-name">${c.name} ${badges}</span>
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
        
        let resultsHtml = '<div class="voting-results-list">';
        data.results.forEach((r, i) => {
            const isTop = i === 0;
            resultsHtml += `
                <div class="vote-result ${isTop ? 'top-voted' : ''}" data-connection-id="${r.connectionId}">
                    <span class="result-rank">#${i + 1}</span>
                    <span class="result-name">${r.playerName}</span>
                    <span class="result-votes">${r.voteCount} голосів</span>
                </div>
            `;
        });
        resultsHtml += '</div>';
        
        if (data.isTie) {
            resultsHtml += '<p class="tie-warning">⚠️ Нічия! Ведучий вирішує.</p>';
        }
        
        // Показуємо хто за кого голосував
        if (data.votes && data.votes.length > 0) {
            resultsHtml += '<div class="votes-breakdown"><h4>Деталі голосування:</h4><ul>';
            data.votes.forEach(v => {
                resultsHtml += `<li><span class="voter">${v.voterName}</span> → <span class="target">${v.targetName}</span></li>`;
            });
            resultsHtml += '</ul></div>';
        }
        
        resultsContainer.innerHTML = resultsHtml;
        
        // Показуємо/ховаємо кнопки рішення (тільки для хоста)
        document.getElementById('votingDecisionControls').style.display = isHost ? 'block' : 'none';
        
        // Оновлюємо кнопку елімінації
        const eliminateBtn = document.getElementById('eliminateTopBtn');
        if (data.topVotedPlayerName) {
            eliminateBtn.textContent = `❌ Елімінувати ${data.topVotedPlayerName}`;
            eliminateBtn.dataset.targetId = data.topVotedPlayerId;
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

    // ==================== SPECIAL CARDS FUNCTIONS ====================

    function renderMyCards() {
        const container = document.getElementById('myCardsSection');
        console.log('[renderMyCards] myPlayerData:', myPlayerData);
        
        if (!container) {
            console.log('[renderMyCards] Container not found');
            return;
        }
        
        if (!myPlayerData) {
            console.warn("No current player data for special cards", {
                currentPlayerId: myConnectionId,
                currentRoomId: currentRoom?.id,
                currentRoomState: currentRoom?.state
            });
            container.innerHTML = `<p style="color: var(--color-text-muted);">${t('noData')}</p>`;
            return;
        }
        
        // Підтримка обох варіантів: cards та Cards (через різну серіалізацію)
        const cards = myPlayerData.cards || myPlayerData.Cards || [];
        console.log('[renderMyCards] Cards:', cards);
        
        if (cards.length === 0) {
            container.innerHTML = `<p style="color: var(--color-text-muted);">${t('noCards')}</p>`;
            return;
        }

        container.innerHTML = cards.map(card => {
            const rarityClass = `rarity-${card.rarity || card.Rarity || 'common'}`;
            const rawState = card.state ?? card.State ?? 'Available';
            const state = typeof rawState === 'string'
             ? rawState
            : (rawState === 0 ? 'Available'
            : rawState === 1 ? 'Pending'
            : rawState === 2 ? 'Approved'
            : rawState === 3 ? 'Used'
            : rawState === 4 ? 'Rejected'
            : 'Available');

const stateClass = `state-${state.toLowerCase()}`;
            const isUsable = state === 'Available';
            const cardId = card.id || card.Id;
            const cardName = getLocalizedValue(card, 'name') || card.name || card.Name || 'Карта';
            const cardDesc = getLocalizedValue(card, 'description') || card.description || card.Description || '';
            const cardRarity = card.rarity || card.Rarity || 'common';
            
            return `
                <div class="special-card ${rarityClass} ${stateClass}">
                    <div class="card-header">
                        <span class="card-name">${escapeHtml(cardName)}</span>
                        <span class="card-rarity">${getRarityLabel(cardRarity)}</span>
                    </div>
                    <p class="card-description">${escapeHtml(cardDesc)}</p>
                    <div class="card-footer">
                        <span class="card-state">${getCardStateLabel(state)}</span>
                        ${isUsable ? `<button class="btn-use-card" onclick="openUseCardModal('${cardId}')">${t('use')}</button>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function getRarityLabel(rarity) {
        const labels = {
            'common': t('ordinary'),
            'rare': t('rare'),
            'epic': t('epic'),
            'legendary': t('legendary')
        };
        return labels[rarity] || rarity;
    }

    function getCardStateLabel(state) {
        const labels = {
            'Available': t('available'),
            'Pending': t('pending'),
            'Approved': t('approved'),
            'Used': t('used'),
            'Rejected': t('rejected')
        };
        return labels[state] || state;
    }

    function openUseCardModal(cardId) {
        if (!myPlayerData || !myPlayerData.cards) return;
        
        const card = myPlayerData.cards.find(c => c.id === cardId);
        if (!card) return;
        
        currentCardToUse = card;
        
        document.getElementById('useCardTitle').textContent = `${t('use')}: ${getLocalizedValue(card, 'name') || card.name}`;
        document.getElementById('useCardDescription').textContent = getLocalizedValue(card, 'description') || card.description;
        document.getElementById('useCardId').value = cardId;
        
        // Визначаємо чи потрібно вибирати ціль
        const needsTarget = ['RevealOther', 'SwapCharacteristic', 'SkipTurn', 'StealItem', 'ViewFact', 'Custom'].includes(card.effectType);
        const needsCharacteristic = card.effectType === 'RevealOther' && !card.effectValue;
        
        // Заповнюємо список гравців
        const targetSelect = document.getElementById('cardTargetPlayer');
        const players = Object.values(roomPlayers).filter(p => p.connectionId !== myConnectionId);
        targetSelect.innerHTML = `<option value="">-- ${getCurrentLanguage() === 'en' ? 'Choose player' : getCurrentLanguage() === 'ru' ? 'Выберите игрока' : 'Виберіть гравця'} --</option>` + 
            players.map(p => `<option value="${p.connectionId}">${escapeHtml(p.name)}</option>`).join('');
        
        document.getElementById('cardTargetSection').style.display = needsTarget ? 'block' : 'none';
        document.getElementById('cardCharacteristicSection').style.display = needsCharacteristic ? 'block' : 'none';
        
        document.getElementById('useCardModal').style.display = 'flex';
    }

    function closeUseCardModal() {
        document.getElementById('useCardModal').style.display = 'none';
        currentCardToUse = null;
    }

 function submitUseCard() {
    const cardId = document.getElementById('useCardId').value;
    const targetPlayerId = document.getElementById('cardTargetPlayer').value || null;
    const targetCharacteristic = document.getElementById('cardTargetCharacteristic').value || null;

    console.log("UseCard submit:", {
        cardId,
        targetPlayerId,
        targetCharacteristic
    });
    
    connection.invoke("UseCard", cardId, targetPlayerId, targetCharacteristic)
        .catch(err => console.error("UseCard error:", err));
    
    closeUseCardModal();
}

    function showCardApprovalModal(data) {
        document.getElementById('cardApprovalContent').innerHTML = `
            <div class="approval-info">
                <p><strong>Гравець:</strong> ${data.playerName}</p>
                <p><strong>Карта:</strong> ${data.card.name}</p>
                <p><strong>Опис:</strong> ${data.card.description}</p>
                ${data.targetPlayerName ? `<p><strong>Ціль:</strong> ${data.targetPlayerName}</p>` : ''}
            </div>
        `;
        document.getElementById('approvalCardId').value = data.card.id;
        document.getElementById('approvalPlayerId').value = data.playerConnectionId;
        document.getElementById('cardApprovalModal').style.display = 'flex';
    }

    function approveCardApproval() {
        const cardId = document.getElementById('approvalCardId').value;
        const playerId = document.getElementById('approvalPlayerId').value;
        
        connection.invoke("ApproveCard", playerId, cardId)
            .catch(err => console.error("ApproveCard error:", err));
        
        document.getElementById('cardApprovalModal').style.display = 'none';
    }

    function rejectCardApproval() {
        const cardId = document.getElementById('approvalCardId').value;
        const playerId = document.getElementById('approvalPlayerId').value;
        const reason = prompt("Причина відхилення (необов'язково):");
        
        connection.invoke("RejectCard", playerId, cardId, reason)
            .catch(err => console.error("RejectCard error:", err));
        
        document.getElementById('cardApprovalModal').style.display = 'none';
    }

    // ==================== ACTIVATED SPECIAL CARDS TABLE ====================
    
function updateActivatedCardsTable() {
    console.log("=== updateActivatedCardsTable START ===");

    const tbody = document.getElementById('specialCardsTableBody');
    const section = document.getElementById('specialCardsTableSection');

    console.log("[updateActivatedCardsTable] tbody:", tbody);
    console.log("[updateActivatedCardsTable] section:", section);
    console.log("[updateActivatedCardsTable] myConnectionId:", myConnectionId);
    console.log("[updateActivatedCardsTable] roomPlayers:", roomPlayers);
    console.log("[updateActivatedCardsTable] activatedCardsTable:", activatedCardsTable);

    if (!tbody) {
        console.error("[updateActivatedCardsTable] tbody not found");
        return;
    }

    const players = Object.values(roomPlayers || {});
    console.log("[updateActivatedCardsTable] players array:", players);

    if (players.length === 0) {
        console.warn("[updateActivatedCardsTable] no players in roomPlayers");
        tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">
            ${t('noActivatedCards')}
        </td></tr>`;

        if (section) {
            section.style.display = 'none';
            console.log("[updateActivatedCardsTable] section display set to none because no players");
        }

        return;
    }

    let hasActivatedCards = false;
    let html = '';

    players.forEach((player, index) => {
        const playerCards = activatedCardsTable[player.connectionId] || [];
        const card1 = playerCards[0];
        const card2 = playerCards[1];

        console.log(`[updateActivatedCardsTable] player[${index}]`, player);
        console.log(`[updateActivatedCardsTable] player[${index}] connectionId=`, player.connectionId);
        console.log(`[updateActivatedCardsTable] player[${index}] cards=`, playerCards);
        console.log(`[updateActivatedCardsTable] card1=`, card1);
        console.log(`[updateActivatedCardsTable] card2=`, card2);

        if (card1 || card2) hasActivatedCards = true;

        const isMe = player.connectionId === myConnectionId;

        html += `
            <tr class="${isMe ? 'my-player-row' : ''}">
                <td>${index + 1}</td>
                <td>
                    ${escapeHtml(player.name)}
                    ${isMe ? `<span class="my-badge">${t('you')}</span>` : ''}
                    ${player.isHost ? `<span class="host-badge-small">${t('host')}</span>` : ''}
                </td>
               <td>${card1 ? (typeof renderActivatedCardBadge === 'function'
                        ? renderActivatedCardBadge(card1)
                        : `<span class="activated-card-badge rarity-${card1.rarity || 'common'}">${escapeHtml(getLocalizedValue(card1, 'name') || card1.name || 'Карта')}</span>`)
                        : '<span class="char-hidden">—</span>'}</td>
                    <td>${card2 ? (typeof renderActivatedCardBadge === 'function'
                        ? renderActivatedCardBadge(card2)
                        : `<span class="activated-card-badge rarity-${card2.rarity || 'common'}">${escapeHtml(getLocalizedValue(card2, 'name') || card2.name || 'Карта')}</span>`)
                        : '<span class="char-hidden">—</span>'}</td>
            </tr>
        `;
    });

    console.log("[updateActivatedCardsTable] hasActivatedCards:", hasActivatedCards);
    console.log("[updateActivatedCardsTable] generated html:", html);

    tbody.innerHTML = html || `<tr><td colspan="4" style="text-align: center; color: var(--color-text-muted); padding: 2rem;">
        ${t('noActivatedCards')}
    </td></tr>`;

    console.log("[updateActivatedCardsTable] tbody.innerHTML AFTER:", tbody.innerHTML);

    if (section) {
        section.style.display = hasActivatedCards ? 'block' : 'none';
        console.log("[updateActivatedCardsTable] section display set to:", section.style.display);

        setTimeout(() => {
            console.log("[updateActivatedCardsTable] section display after 100ms:", section.style.display);
            console.log("[updateActivatedCardsTable] section outerHTML:", section.outerHTML);
            // Re-init tooltips after DOM update
            if (typeof initActivatedCardTooltips === 'function') {
                initActivatedCardTooltips();
            }
        }, 100);
    }

    console.log("=== updateActivatedCardsTable END ===");
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
        panel.style.display = isVisible ? 'none' : 'block';
        
        if (!isVisible && isHost) {
            // Завантажуємо дані гравців при відкритті панелі
            connection.invoke("GetAllPlayersData").catch(err => console.error(err));
        }
    }

    function updateGMPlayerSelect() {
        const select = document.getElementById('gmPlayerSelect');
        if (!select) return;
        
        const players = Object.values(roomPlayers);
        select.innerHTML = `<option value="">-- ${getCurrentLanguage() === 'en' ? 'Choose player' : getCurrentLanguage() === 'ru' ? 'Выберите игрока' : 'Виберіть гравця'} --</option>` + 
            players.map(p => `<option value="${p.connectionId}" ${p.isEliminated ? 'class="eliminated-option"' : ''}>
                ${escapeHtml(p.name)}${p.isEliminated ? ` (${t('eliminated').toLowerCase()})` : ''}${p.connectionId === myConnectionId ? ` (${t('you')})` : ''}
            </option>`).join('');
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
        document.getElementById('currentRoomState').textContent = currentRoom.state === 'Lobby' ? t('lobby') : t('game');
        
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
            if (isHost && (currentRoom.state === 'Playing' || currentRoom.state === 'Started') && !currentVoting) {
                votingBtn.style.display = 'inline-block';
            } else {
                votingBtn.style.display = 'none';
            }
        }
        
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
        const gmScenarioSection = document.getElementById('gmScenarioSection');
        const gmEventsSection = document.getElementById('gmEventsSection');
        
        const isGameActive = currentRoom && (currentRoom.state === 'Playing' || currentRoom.state === 'Started');
        
        if (gmScenarioSection) {
            gmScenarioSection.style.display = (isHost && isGameActive) ? 'block' : 'none';
        }
        if (gmEventsSection) {
            gmEventsSection.style.display = (isHost && isGameActive) ? 'block' : 'none';
        }
        
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
            const eliminatedBadge = isEliminated ? `<span class="eliminated-badge">${t('eliminated')}</span>` : '';
            
            return `
            <tr class="${rowClasses.join(' ')}" data-player="${player.connectionId}">
                <td class="player-number">${seatLabel}</td>
                <td class="player-name-cell">
                    <span class="player-name-text">${escapeHtml(player.name)}</span>
                    ${isMe ? `<span class="my-badge">(${t('you')})</span>` : ''}
                    ${player.isHost ? `<span class="host-badge-small">${t('host')}</span>` : ''}
                    ${eliminatedBadge}
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
                </div>`;
            }
            return `<div class="char-revealed">${escapeHtml(value)}</div>`;
        }
        return `<span class="char-hidden">${t('hidden')}</span>`;
    }
    
    function getTooltipTypeClass(charKey) {
        const typeClasses = {
            'profession': 'profession',
            'physicalHealth': 'physical',
            'mentalHealth': 'mental',
            'hobby': 'hobby',
            'phobia': 'phobia',
            'fact': 'fact'
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
        const professionName = getLocalizedValue(profession, 'profession') || getLocalizedValue(profession, 'name') || profession.name || 'Безробітний';
        const physicalHealthName = getConditionDisplayName(physicalHealth) || physicalHealth.name || 'Здоровий';
        const mentalHealthName = getConditionDisplayName(mentalHealth) || mentalHealth.name || 'Стабільний';
        const hobbyName = getLocalizedValue(hobby, 'hobby') || getLocalizedValue(hobby, 'name') || hobby.name || 'Немає хобі';
        const traitName = getLocalizedValue(characterTrait, 'trait') || getLocalizedValue(characterTrait, 'name') || characterTrait.name || 'Невизначений';
        const phobiaName = getLocalizedValue(phobia, 'name') || getLocalizedValue(phobia, 'phobia') || phobia.name || 'Немає фобій';
        const localizedSelectedItem = getLocalizedValue(profession, 'selectedItem') || profession.selectedItem || '';
        const inventoryItems = inventory.items && inventory.items.length > 0
            ? inventory.items.map(i => getLocalizedValue(i, 'item') || getLocalizedValue(i, 'name') || i.name || i.Name || '').filter(Boolean).join(', ')
            : t('empty');
        
        function createTooltipHtml(text, typeClass) {
            if (!text) return '';
            return `<span class="tooltip-trigger ${typeClass}" title="">!</span><div class="tooltip-content">${text}</div>`;
        }
        
        function charWithTooltip(name, tooltip, typeClass) {
            const cleanTooltip = cleanTooltipText(tooltip);
            if (!cleanTooltip) return name;
            return `<span class="characteristic-with-tooltip"><span>${name}</span>${createTooltipHtml(cleanTooltip, typeClass)}</span>`;
        }
        
        container.innerHTML = `
            <!-- Особистість -->
            <div class="char-card ${revealed.personality ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('personality')}</h3>
                <div class="char-row"><span class="char-label">${t('age')}:</span><span class="char-value">${personality.age ?? '?'} ${t('years')}</span></div>
                <div class="char-row"><span class="char-label">${t('sex')}:</span><span class="char-value">${personality.sex || t('unknown')}${personality.isChildfree ? " (чайлдфрі)" : ""}</span></div>
                <div class="char-row"><span class="char-label">${t('orientation')}:</span><span class="char-value">${personality.sexOrientation || t('unknown')}</span></div>
                <div class="char-row">${revealed.personality ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('Personality')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Статура -->
            <div class="char-card ${revealed.body ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('body')}</h3>
                <div class="char-row"><span class="char-label">${t('height')}:</span><span class="char-value">${body.height ?? '?'} см</span></div>
                <div class="char-row"><span class="char-label">${t('weight')}:</span><span class="char-value">${body.weight ?? '?'} кг</span></div>
                <div class="char-row"><span class="char-label">${t('bodyType')}:</span><span class="char-value">${body.bodyType || t('unknown')}</span></div>
                <div class="char-row">${revealed.body ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('Body')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Професія -->
            <div class="char-card ${revealed.profession ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('profession')}</h3>
                <div class="char-row"><span class="char-label">${t('name')}:</span><span class="char-value">${charWithTooltip(professionName + (localizedSelectedItem ? ' <span class="selected-item-badge">(+' + localizedSelectedItem + ')</span>' : ''), profession.tooltip, 'profession')}</span></div>
                <div class="char-row"><span class="char-label">Досвід:</span><span class="char-value">${profession.experienceYears || 0} ${t('years')}</span></div>
                <div class="char-row">${revealed.profession ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('Profession')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Фізичне здоров'я -->
            <div class="char-card ${revealed.physicalHealth ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('physicalHealth')}</h3>
                <div class="char-row"><span class="char-label">${t('state')}:</span><span class="char-value">${charWithTooltip(physicalHealthName, buildLocalizedTooltip(physicalHealth, 'physicalHealth') || physicalHealth.tooltip, 'physical')}</span></div>
                <div class="char-row">${revealed.physicalHealth ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('PhysicalHealth')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Психічне здоров'я -->
            <div class="char-card ${revealed.mentalHealth ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('mentalHealth')}</h3>
                <div class="char-row"><span class="char-label">${t('state')}:</span><span class="char-value">${charWithTooltip(mentalHealthName, buildLocalizedTooltip(mentalHealth, 'mentalHealth') || mentalHealth.tooltip, 'mental')}</span></div>
                <div class="char-row">${revealed.mentalHealth ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('MentalHealth')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Хобі -->
            <div class="char-card ${revealed.hobby ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('hobby')}</h3>
                <div class="char-row"><span class="char-label">${t('activity')}:</span><span class="char-value">${charWithTooltip(hobbyName, hobby.tooltip, 'hobby')}</span></div>
                <div class="char-row">${revealed.hobby ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('Hobby')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Риса характеру -->
            <div class="char-card ${revealed.characterTrait ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('characterTrait')}</h3>
                <div class="char-row"><span class="char-label">${t('trait')}:</span><span class="char-value">${traitName}</span></div>
                <div class="char-row">${revealed.characterTrait ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('CharacterTrait')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Фобія -->
            <div class="char-card ${revealed.phobia ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('phobia')}</h3>
                <div class="char-row"><span class="char-label">${t('fear')}:</span><span class="char-value">${charWithTooltip(phobiaName, getLocalizedValue(phobia, 'description') || phobia.tooltip, 'phobia')}</span></div>
                <div class="char-row">${revealed.phobia ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('Phobia')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Інвентар -->
            <div class="char-card ${revealed.inventory ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('inventory')}</h3>
                <div class="char-row"><span class="char-label">${t('items')}:</span><span class="char-value">${inventoryItems}</span></div>
                <div class="char-row">${revealed.inventory ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('Inventory')">${t('reveal')}</button>`}</div>
            </div>

            <!-- Факт -->
            <div class="char-card ${revealed.fact || revealed.Fact ? 'card-revealed' : ''}">
                <h3 class="char-card-title">${t('fact')}</h3>
             <div class="char-row">
                    <span class="char-label">${t('fact')}:</span>
                    <span class="char-value">${charWithTooltip(factName, factTooltip, 'fact')}</span>
                </div>
             <div class="char-row">
                    ${revealed.fact || revealed.Fact ? `<span class="status-revealed">${t('revealed')}</span>` : `<button class="char-btn locked" onclick="reveal('Fact')">${t('reveal')}</button>`}
                </div>
        </div>
        `;
        
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

