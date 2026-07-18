function restoreVisibleSections() {
    const ids = [
        "gameArea",
        "playersSection",
        "developerMenu"
    ];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = "block";
            el.style.visibility = "visible";
            el.classList.remove("hidden", "d-none");
        }
    });
}

function safeRenderAll() {
    try {
        if (typeof renderPlayersTable === "function") {
            renderPlayersTable();
        }
    } catch (e) {
        console.error("renderPlayersTable failed", e);
    }

    try {
        if (typeof updateDeveloperMenu === "function") {
            updateDeveloperMenu();
        }
    } catch (e) {
        console.error("updateDeveloperMenu failed", e);
    }
}

(function setupStaticPageLocalization() {
    const translations = {
        uk: {
            navHome: "Головна",
            navPlay: "Грати",
            navRules: "Правила",
            navAuthor: "Автор",
            navGithub: "GitHub",
            authLogin: "Увійти",
            authRegister: "Реєстрація",
            authLogout: "Вийти",
            chooseGameMode: "Оберіть режим гри",
            bunkerMode: "Бункер",
            spyMode: "Шпіон",
            mafiaMode: "Мафія",
            playAction: "Грати",
            inDevelopment: "В розробці",
            soon: "Скоро",
            mvpReady: "MVP",
            bunkerModeDescription: "Класичний режим виживання та голосування в бункері.",
            spyModeDescription: "Режим соціальної дедукції: один шпигун не знає локацію.",
            mafiaModeDescription: "Класична мафія з ролями. Буде додано пізніше.",
            rulesTitle: "Правила",
            rulesIntro: "Тут будуть правила для режимів гри.",
            bunkerRulesText: "Правила режиму Бункер будуть додані тут.",
            spyRulesText: "Правила режиму Шпіон будуть додані пізніше.",
            mafiaRulesText: "Правила режиму Мафія будуть додані пізніше.",
            spyTitle: "Шпіон",
            createSpyRoom: "Створити кімнату Шпіона",
            joinRoom: "Приєднатися до кімнати",
            roomCode: "Код кімнати",
            playerName: "Ім’я гравця",
            players: "Гравці",
            roundStatus: "Статус раунду",
            startRound: "Почати раунд",
            endRound: "Завершити раунд",
            newRound: "Новий раунд",
            revealRoles: "Розкрити ролі",
            youAreSpy: "Ти шпигун",
            yourLocation: "Твоя локація",
            roundActive: "Раунд активний",
            roundEnded: "Раунд завершено",
            spyWas: "Шпигун був",
            locationWas: "Локація була",
            waitingPlayers: "Очікування гравців",
            minPlayersRequired: "Потрібно мінімум 3 гравці",
            profileStatistics: "Статистика партій",
            profileCompletedGames: "Завершено партій",
            profileCompletedStatus: "Завершено",
            profileActiveGames: "Активних партій",
            profileWins: "Перемог",
            profileLosses: "Поразок",
            profileWinRate: "Відсоток перемог",
            profileHostedGames: "Проведено як хост (усі партії)",
            profileRecentGames: "Останні партії",
            profileFullHistory: "Переглянути всю історію",
            profileGameHistory: "Історія партій",
            profileVictory: "Перемога",
            profileEliminated: "Елімінований",
            profileCompletedWithoutVictory: "Завершено без перемоги",
            profileGameInProgress: "Партія триває",
            profileHost: "Хост",
            profilePlayer: "Гравець",
            profilePlayersCount: "гравців",
            profileDuration: "Тривалість",
            profileEliminationRound: "Раунд елімінування",
            profilePrevious: "Попередня",
            profileNext: "Наступна",
            profilePage: "Сторінка",
            profileEmptyHistory: "У вас ще немає зіграних партій.",
            profileTotalGames: "Усього записів",
            profileBackToProfile: "До профілю"
        },
        en: {
            navHome: "Home",
            navPlay: "Play",
            navRules: "Rules",
            navAuthor: "Author",
            navGithub: "GitHub",
            authLogin: "Sign in",
            authRegister: "Register",
            authLogout: "Sign out",
            chooseGameMode: "Choose game mode",
            bunkerMode: "Bunker",
            spyMode: "Spy",
            mafiaMode: "Mafia",
            playAction: "Play",
            inDevelopment: "In development",
            soon: "Soon",
            mvpReady: "MVP",
            bunkerModeDescription: "Classic survival and voting mode inside a bunker.",
            spyModeDescription: "Social deduction mode: one spy does not know the location.",
            mafiaModeDescription: "Classic mafia with roles. Coming later.",
            rulesTitle: "Rules",
            rulesIntro: "Game mode rules will be added here.",
            bunkerRulesText: "Bunker mode rules will be added here.",
            spyRulesText: "Spy mode rules will be added later.",
            mafiaRulesText: "Mafia mode rules will be added later.",
            spyTitle: "Spy",
            createSpyRoom: "Create Spy room",
            joinRoom: "Join room",
            roomCode: "Room code",
            playerName: "Player name",
            players: "Players",
            roundStatus: "Round status",
            startRound: "Start round",
            endRound: "End round",
            newRound: "New round",
            revealRoles: "Reveal roles",
            youAreSpy: "You are the spy",
            yourLocation: "Your location",
            roundActive: "Round active",
            roundEnded: "Round ended",
            spyWas: "The spy was",
            locationWas: "The location was",
            waitingPlayers: "Waiting for players",
            minPlayersRequired: "At least 3 players required",
            profileStatistics: "Game statistics",
            profileCompletedGames: "Completed games",
            profileCompletedStatus: "Completed",
            profileActiveGames: "Active games",
            profileWins: "Wins",
            profileLosses: "Losses",
            profileWinRate: "Win rate",
            profileHostedGames: "Hosted games (all sessions)",
            profileRecentGames: "Recent games",
            profileFullHistory: "View full history",
            profileGameHistory: "Game history",
            profileVictory: "Victory",
            profileEliminated: "Eliminated",
            profileCompletedWithoutVictory: "Completed without victory",
            profileGameInProgress: "Game in progress",
            profileHost: "Host",
            profilePlayer: "Player",
            profilePlayersCount: "players",
            profileDuration: "Duration",
            profileEliminationRound: "Elimination round",
            profilePrevious: "Previous",
            profileNext: "Next",
            profilePage: "Page",
            profileEmptyHistory: "You have no games in your history yet.",
            profileTotalGames: "Total records",
            profileBackToProfile: "Back to profile"
        },
        ru: {
            navHome: "Главная",
            navPlay: "Играть",
            navRules: "Правила",
            navAuthor: "Автор",
            navGithub: "GitHub",
            authLogin: "Войти",
            authRegister: "Регистрация",
            authLogout: "Выйти",
            chooseGameMode: "Выберите режим игры",
            bunkerMode: "Бункер",
            spyMode: "Шпион",
            mafiaMode: "Мафия",
            playAction: "Играть",
            inDevelopment: "В разработке",
            soon: "Скоро",
            mvpReady: "MVP",
            bunkerModeDescription: "Классический режим выживания и голосования в бункере.",
            spyModeDescription: "Режим социальной дедукции: один шпион не знает локацию.",
            mafiaModeDescription: "Классическая мафия с ролями. Будет добавлена позже.",
            rulesTitle: "Правила",
            rulesIntro: "Здесь будут правила для режимов игры.",
            bunkerRulesText: "Правила режима Бункер будут добавлены здесь.",
            spyRulesText: "Правила режима Шпион будут добавлены позже.",
            mafiaRulesText: "Правила режима Мафия будут добавлены позже.",
            spyTitle: "Шпион",
            createSpyRoom: "Создать комнату Шпиона",
            joinRoom: "Присоединиться к комнате",
            roomCode: "Код комнаты",
            playerName: "Имя игрока",
            players: "Игроки",
            roundStatus: "Статус раунда",
            startRound: "Начать раунд",
            endRound: "Завершить раунд",
            newRound: "Новый раунд",
            revealRoles: "Раскрыть роли",
            youAreSpy: "Ты шпион",
            yourLocation: "Твоя локация",
            roundActive: "Раунд активен",
            roundEnded: "Раунд завершён",
            spyWas: "Шпионом был",
            locationWas: "Локация была",
            waitingPlayers: "Ожидание игроков",
            minPlayersRequired: "Нужно минимум 3 игрока",
            profileStatistics: "Статистика партий",
            profileCompletedGames: "Завершено партий",
            profileCompletedStatus: "Завершено",
            profileActiveGames: "Активных партий",
            profileWins: "Побед",
            profileLosses: "Поражений",
            profileWinRate: "Процент побед",
            profileHostedGames: "Проведено как хост (все партии)",
            profileRecentGames: "Последние партии",
            profileFullHistory: "Посмотреть всю историю",
            profileGameHistory: "История партий",
            profileVictory: "Победа",
            profileEliminated: "Элиминирован",
            profileCompletedWithoutVictory: "Завершено без победы",
            profileGameInProgress: "Партия продолжается",
            profileHost: "Хост",
            profilePlayer: "Игрок",
            profilePlayersCount: "игроков",
            profileDuration: "Длительность",
            profileEliminationRound: "Раунд элиминации",
            profilePrevious: "Предыдущая",
            profileNext: "Следующая",
            profilePage: "Страница",
            profileEmptyHistory: "У вас ещё нет сыгранных партий.",
            profileTotalGames: "Всего записей",
            profileBackToProfile: "К профилю"
        }
    };

    function normalizeLanguage(lang) {
        if (lang === "gb") return "en";
        return ["uk", "en", "ru"].includes(lang) ? lang : "uk";
    }

    function applyStaticTranslations() {
        const lang = normalizeLanguage(localStorage.getItem("language") || "uk");
        if (localStorage.getItem("language") !== lang) {
            localStorage.setItem("language", lang);
        }

        document.documentElement.lang = lang;
        document.querySelectorAll("[data-i18n]").forEach(function (element) {
            const key = element.dataset.i18n;
            const value = translations[lang]?.[key] || translations.uk[key];
            if (value) element.textContent = value;
        });
        document.querySelectorAll(".language-btn").forEach(function (button) {
            button.classList.toggle("active", button.dataset.lang === lang);
        });
        localizeProfileValues(lang);
    }

    function localizeProfileValues(lang) {
        const locale = { uk: "uk-UA", en: "en-GB", ru: "ru-RU" }[lang];
        const durationUnits = {
            uk: { hour: "год", minute: "хв" },
            en: { hour: "h", minute: "min" },
            ru: { hour: "ч", minute: "мин" }
        }[lang];

        document.querySelectorAll("[data-profile-utc]").forEach(function (element) {
            const date = new Date(element.dataset.profileUtc);
            if (!Number.isNaN(date.getTime())) {
                element.textContent = new Intl.DateTimeFormat(locale, {
                    dateStyle: "medium",
                    timeStyle: "short"
                }).format(date);
            }
        });

        document.querySelectorAll("[data-profile-duration-minutes]").forEach(function (element) {
            const totalMinutes = Number.parseInt(element.dataset.profileDurationMinutes, 10);
            if (!Number.isFinite(totalMinutes)) return;
            const hours = Math.floor(totalMinutes / 60);
            const minutes = totalMinutes % 60;
            element.textContent = hours > 0
                ? `${hours} ${durationUnits.hour} ${minutes} ${durationUnits.minute}`
                : `${minutes} ${durationUnits.minute}`;
        });
    }

    const existingChangeLanguage = window.changeLanguage;
    window.changeLanguage = function (lang) {
        const normalized = normalizeLanguage(lang);
        localStorage.setItem("language", normalized);
        if (typeof existingChangeLanguage === "function") {
            existingChangeLanguage(normalized);
        }
        applyStaticTranslations();
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", applyStaticTranslations);
    } else {
        applyStaticTranslations();
    }
})();
