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
            minPlayersRequired: "Потрібно мінімум 3 гравці"
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
            minPlayersRequired: "At least 3 players required"
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
            minPlayersRequired: "Нужно минимум 3 игрока"
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
