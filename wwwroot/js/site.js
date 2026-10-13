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
            navAuthor: "Про проєкт",
            navGithub: "GitHub",
            authLogin: "Увійти",
            authRegister: "Реєстрація",
            authLogout: "Вийти",
            profileMenu: "Профіль",
            contentEditor: "Редактор контенту",
            landingKicker: "Місце в укритті не гарантоване",
            landingHeroLead: "Соціальна гра про виживання: отримай персонажа, переконай інших і доведи, що саме ти маєш залишитися в бункері.",
            landingStartPlaying: "Почати гру",
            landingHowToPlay: "Як грати",
            landingPreviousSessionEyebrow: "Активна сесія",
            landingPreviousSessionTitle: "Поверніться до гри",
            landingPlayerName: "Ім’я гравця",
            landingRoom: "Кімната",
            landingResume: "Повернутися",
            landingForgetSession: "Забути сесію",
            landingHowItWorksEyebrow: "Як це працює",
            landingHowItWorksTitle: "Три кроки до вироку",
            landingStepOneTitle: "Зберіть команду",
            landingStepOneText: "Створіть кімнату або приєднайтеся до друзів — хост налаштовує майбутню партію.",
            landingStepTwoTitle: "Розкрийте себе",
            landingStepTwoText: "Випадковий персонаж приховує професію, здоров’я, речі та інші характеристики, які відкриваються раундами.",
            landingStepThreeTitle: "Переконайте або вибувайте",
            landingStepThreeText: "Обговорюйте, укладайте союзи та голосуйте: лише частина групи переживе апокаліпсис.",
            landingFeaturesEyebrow: "У кожній партії — нова історія",
            landingFeaturesTitle: "Все, що потрібно для напруги за столом",
            landingFeatureCharactersTitle: "Випадкові персонажі",
            landingFeatureCharactersText: "У кожного гравця — власний набір переваг, вад і приводів для суперечок.",
            landingFeatureRevealTitle: "Прихована інформація",
            landingFeatureRevealText: "Відкривайте характеристики поступово й обирайте, коли сказати правду.",
            landingFeatureVotingTitle: "Голосування",
            landingFeatureVotingText: "Кожен раунд завершується рішенням групи — хтось залишає бункер.",
            landingFeatureWorldsTitle: "Світ після катастрофи",
            landingFeatureWorldsText: "Апокаліпсиси й бункери змінюють ставки та дають кожній історії власний контекст.",
            landingFeatureCardsTitle: "Спеціальні карти",
            landingFeatureCardsText: "Неочікувані ефекти можуть перевернути розмову в найважливіший момент.",
            landingFeatureHostTitle: "Ритм ведучого",
            landingFeatureHostText: "Хост керує раундами та темпом гри, щоб не втрачати напругу.",
            landingAboutEyebrow: "Про проєкт",
            landingAboutTitle: "Зберіть друзів. Зробіть свій вибір.",
            landingAboutText: "Vault Judgment — незалежна браузерна гра для живих розмов, несподіваних аргументів і вечорів, які хочеться повторити.",
            landingGithub: "Проєкт на GitHub",
            landingFinalEyebrow: "Час вирішувати",
            landingFinalTitle: "У бункері місць менше, ніж охочих вижити.",
            landingFinalText: "Створіть кімнату, запросіть друзів і дізнайтеся, кому ви довірите останнє місце.",
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
            rulesIntro: "Правила режимів гри.",
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
			profileLeftEarly: "Покинуто достроково",
			profileGameAbandoned: "Партію перервано",
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
            navAuthor: "About",
            navGithub: "GitHub",
            authLogin: "Sign in",
            authRegister: "Register",
            authLogout: "Sign out",
            profileMenu: "Profile",
            contentEditor: "Content editor",
            landingKicker: "A place in the shelter is never guaranteed",
            landingHeroLead: "A social survival game: get a character, persuade the group, and prove that you deserve a place in the bunker.",
            landingStartPlaying: "Start playing",
            landingHowToPlay: "How to play",
            landingPreviousSessionEyebrow: "Active session",
            landingPreviousSessionTitle: "Return to your game",
            landingPlayerName: "Player name",
            landingRoom: "Room",
            landingResume: "Return",
            landingForgetSession: "Forget session",
            landingHowItWorksEyebrow: "How it works",
            landingHowItWorksTitle: "Three steps to judgment",
            landingStepOneTitle: "Gather your group",
            landingStepOneText: "Create a room or join your friends — the host sets up the next game.",
            landingStepTwoTitle: "Reveal your hand",
            landingStepTwoText: "A random character hides a profession, health, belongings, and other traits revealed round by round.",
            landingStepThreeTitle: "Persuade or leave",
            landingStepThreeText: "Discuss, make alliances, and vote: only part of the group will outlast the apocalypse.",
            landingFeaturesEyebrow: "A new story every game",
            landingFeaturesTitle: "Everything a tense table needs",
            landingFeatureCharactersTitle: "Random characters",
            landingFeatureCharactersText: "Every player gets a unique mix of strengths, flaws, and reasons to be doubted.",
            landingFeatureRevealTitle: "Hidden information",
            landingFeatureRevealText: "Reveal traits gradually and choose exactly when to tell the truth.",
            landingFeatureVotingTitle: "Voting",
            landingFeatureVotingText: "Each round ends with the group’s decision — someone leaves the bunker.",
            landingFeatureWorldsTitle: "A world after disaster",
            landingFeatureWorldsText: "Apocalypses and bunkers change the stakes and give every story its own setting.",
            landingFeatureCardsTitle: "Special cards",
            landingFeatureCardsText: "Unexpected effects can turn the conversation at its most important moment.",
            landingFeatureHostTitle: "Host-led pace",
            landingFeatureHostText: "The host guides the rounds and the pace, so the tension never fades.",
            landingAboutEyebrow: "About the project",
            landingAboutTitle: "Gather your friends. Make your choice.",
            landingAboutText: "Vault Judgment is an independent browser game for lively conversations, unexpected arguments, and evenings worth repeating.",
            landingGithub: "Project on GitHub",
            landingFinalEyebrow: "Time to decide",
            landingFinalTitle: "There are fewer seats in the bunker than people who want to survive.",
            landingFinalText: "Create a room, invite your friends, and discover whom you would trust with the last place.",
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
            rulesIntro: "Game mode rules.",
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
			profileLeftEarly: "Left early",
			profileGameAbandoned: "Game interrupted",
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
            navAuthor: "О проекте",
            navGithub: "GitHub",
            authLogin: "Войти",
            authRegister: "Регистрация",
            authLogout: "Выйти",
            profileMenu: "Профиль",
            contentEditor: "Редактор контента",
            landingKicker: "Место в убежище не гарантировано",
            landingHeroLead: "Социальная игра о выживании: получи персонажа, убеди остальных и докажи, что именно ты должен остаться в бункере.",
            landingStartPlaying: "Начать игру",
            landingHowToPlay: "Как играть",
            landingPreviousSessionEyebrow: "Активная сессия",
            landingPreviousSessionTitle: "Вернитесь к игре",
            landingPlayerName: "Имя игрока",
            landingRoom: "Комната",
            landingResume: "Вернуться",
            landingForgetSession: "Забыть сессию",
            landingHowItWorksEyebrow: "Как это работает",
            landingHowItWorksTitle: "Три шага к приговору",
            landingStepOneTitle: "Соберите команду",
            landingStepOneText: "Создайте комнату или присоединитесь к друзьям — хост настраивает будущую партию.",
            landingStepTwoTitle: "Раскройте себя",
            landingStepTwoText: "Случайный персонаж скрывает профессию, здоровье, вещи и другие характеристики, которые открываются по раундам.",
            landingStepThreeTitle: "Убедите или выбывайте",
            landingStepThreeText: "Обсуждайте, заключайте союзы и голосуйте: лишь часть группы переживёт апокалипсис.",
            landingFeaturesEyebrow: "В каждой партии — новая история",
            landingFeaturesTitle: "Всё для напряжённой игры за столом",
            landingFeatureCharactersTitle: "Случайные персонажи",
            landingFeatureCharactersText: "У каждого игрока — свой набор преимуществ, недостатков и поводов для споров.",
            landingFeatureRevealTitle: "Скрытая информация",
            landingFeatureRevealText: "Открывайте характеристики постепенно и решайте, когда сказать правду.",
            landingFeatureVotingTitle: "Голосование",
            landingFeatureVotingText: "Каждый раунд заканчивается решением группы — кто-то покидает бункер.",
            landingFeatureWorldsTitle: "Мир после катастрофы",
            landingFeatureWorldsText: "Апокалипсисы и бункеры меняют ставки и дают каждой истории свой контекст.",
            landingFeatureCardsTitle: "Специальные карты",
            landingFeatureCardsText: "Неожиданные эффекты могут перевернуть разговор в самый важный момент.",
            landingFeatureHostTitle: "Темп ведущего",
            landingFeatureHostText: "Хост управляет раундами и темпом игры, чтобы не терять напряжение.",
            landingAboutEyebrow: "О проекте",
            landingAboutTitle: "Соберите друзей. Сделайте свой выбор.",
            landingAboutText: "Vault Judgment — независимая браузерная игра для живых разговоров, неожиданных аргументов и вечеров, которые хочется повторить.",
            landingGithub: "Проект на GitHub",
            landingFinalEyebrow: "Время решать",
            landingFinalTitle: "Мест в бункере меньше, чем желающих выжить.",
            landingFinalText: "Создайте комнату, пригласите друзей и узнайте, кому вы доверите последнее место.",
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
            rulesIntro: "Правила режимов игры.",
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
			profileLeftEarly: "Покинуто досрочно",
			profileGameAbandoned: "Партия прервана",
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
        window.BunkerRulesContent?.refresh?.();
        window.dispatchEvent(new Event("bunker:language-changed"));
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
