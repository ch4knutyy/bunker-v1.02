(function () {
    const translations = {
        uk: {
            connected: "Підключено",
            round: "Раунд",
            roomCode: "Код кімнати",
            players: "Гравці",
            host: "Host",
            connectedPlayer: "у грі",
            disconnectedPlayer: "offline",
            waitingPlayers: "Очікування гравців",
            roundActive: "Раунд активний",
            roundEnded: "Раунд завершено",
            youAreSpy: "Ти шпигун",
            spyHint: "Спробуй дізнатися локацію за відповідями інших.",
            yourLocation: "Твоя локація",
            locationHidden: "Локація прихована від шпигуна.",
            spyWas: "Шпигун був",
            locationWas: "Локація була",
            invite: "Запрошення",
            nameRequired: "Введи ім’я гравця.",
            codeRequired: "Введи код кімнати.",
            connectionError: "Не вдалося підключитися до SpyHub."
        },
        en: {
            connected: "Connected",
            round: "Round",
            roomCode: "Room code",
            players: "Players",
            host: "Host",
            connectedPlayer: "in game",
            disconnectedPlayer: "offline",
            waitingPlayers: "Waiting for players",
            roundActive: "Round active",
            roundEnded: "Round ended",
            youAreSpy: "You are the spy",
            spyHint: "Try to learn the location from other players' answers.",
            yourLocation: "Your location",
            locationHidden: "The location is hidden from the spy.",
            spyWas: "The spy was",
            locationWas: "The location was",
            invite: "Invite",
            nameRequired: "Enter your player name.",
            codeRequired: "Enter the room code.",
            connectionError: "Could not connect to SpyHub."
        },
        ru: {
            connected: "Подключено",
            round: "Раунд",
            roomCode: "Код комнаты",
            players: "Игроки",
            host: "Host",
            connectedPlayer: "в игре",
            disconnectedPlayer: "offline",
            waitingPlayers: "Ожидание игроков",
            roundActive: "Раунд активен",
            roundEnded: "Раунд завершён",
            youAreSpy: "Ты шпион",
            spyHint: "Попробуй узнать локацию по ответам других.",
            yourLocation: "Твоя локация",
            locationHidden: "Локация скрыта от шпиона.",
            spyWas: "Шпионом был",
            locationWas: "Локация была",
            invite: "Приглашение",
            nameRequired: "Введи имя игрока.",
            codeRequired: "Введи код комнаты.",
            connectionError: "Не удалось подключиться к SpyHub."
        }
    };

    const page = document.querySelector(".spy-page");
    if (!page) return;

    const connection = new signalR.HubConnectionBuilder()
        .withUrl("/spyHub")
        .withAutomaticReconnect()
        .build();

    let currentState = null;

    function getLanguage() {
        const lang = localStorage.getItem("language") || "uk";
        return ["uk", "en", "ru"].includes(lang) ? lang : "uk";
    }

    function t(key) {
        const lang = getLanguage();
        return translations[lang]?.[key] || translations.uk[key] || key;
    }

    function getOrCreatePlayerId() {
        let id = localStorage.getItem("spyPlayerId");
        if (!id) {
            id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
            localStorage.setItem("spyPlayerId", id);
        }
        return id;
    }

    function getPlayerName() {
        return document.getElementById("spyPlayerName")?.value.trim() ||
            localStorage.getItem("spyPlayerName") ||
            "";
    }

    function setStatusMessage(message) {
        const card = document.getElementById("spyPrivateCard");
        if (card && !currentState) {
            card.innerHTML = `<p>${escapeHtml(message)}</p>`;
        }
    }

    function escapeHtml(value) {
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    async function ensureConnected() {
        if (connection.state === signalR.HubConnectionState.Connected) return true;
        try {
            await connection.start();
            return true;
        } catch (error) {
            console.error(error);
            alert(t("connectionError"));
            return false;
        }
    }

    window.createSpyRoom = async function () {
        const name = getPlayerName();
        if (!name) {
            alert(t("nameRequired"));
            return;
        }

        localStorage.setItem("spyPlayerName", name);
        if (!(await ensureConnected())) return;
        await connection.invoke("CreateSpyRoom", name, getOrCreatePlayerId());
    };

    window.joinSpyRoom = async function () {
        const name = getPlayerName();
        const code = document.getElementById("spyJoinCode")?.value.trim().toUpperCase() || "";
        if (!name) {
            alert(t("nameRequired"));
            return;
        }
        if (!code) {
            alert(t("codeRequired"));
            return;
        }

        localStorage.setItem("spyPlayerName", name);
        if (!(await ensureConnected())) return;
        await connection.invoke("JoinSpyRoom", code, name, getOrCreatePlayerId());
    };

    window.startSpyRound = function () {
        return connection.invoke("StartSpyRound");
    };

    window.endSpyRound = function () {
        return connection.invoke("EndSpyRound");
    };

    window.newSpyRound = function () {
        return connection.invoke("NewSpyRound");
    };

    window.revealSpyRoles = function () {
        return connection.invoke("RevealSpyRoles");
    };

    connection.on("SpyError", function (message) {
        alert(message);
    });

    connection.on("SpyStateUpdated", function (state) {
        currentState = state;
        localStorage.setItem("spyCurrentRoomCode", state.roomCode);
        renderState(state);
    });

    connection.onreconnected(async function () {
        const code = localStorage.getItem("spyCurrentRoomCode");
        const name = getPlayerName();
        if (code && name) {
            await connection.invoke("JoinSpyRoom", code, name, getOrCreatePlayerId());
        }
    });

    function renderState(state) {
        document.getElementById("spySetup").hidden = true;
        document.getElementById("spyGame").hidden = false;
        document.getElementById("spyRoomCode").textContent = state.roomCode || "-";
        document.getElementById("spyRoundNumber").textContent = state.currentRound
            ? `${t("round")} ${state.currentRound}`
            : "";

        const roundStatus = document.getElementById("spyRoundStatus");
        roundStatus.textContent = state.isRoundActive
            ? t("roundActive")
            : state.currentRound
                ? t("roundEnded")
                : t("waitingPlayers");

        renderPrivateCard(state);
        renderPlayers(state.players || []);
        renderReveal(state);
        renderHostControls(state);
        renderInvite(state);
    }

    function renderPrivateCard(state) {
        const card = document.getElementById("spyPrivateCard");
        if (!card) return;
        card.classList.remove("spy-private-card-danger");

        if (!state.isRoundActive && !state.rolesRevealed) {
            card.innerHTML = `<p>${escapeHtml(t("waitingPlayers"))}</p>`;
            return;
        }

        if (state.rolesRevealed) {
            card.innerHTML = `
                <p><span>${escapeHtml(t("spyWas"))}</span>: <strong>${escapeHtml(state.revealedSpyName || "-")}</strong></p>
                <p><span>${escapeHtml(t("locationWas"))}</span>: <strong>${escapeHtml(state.revealedLocationName || "-")}</strong></p>
            `;
            return;
        }

        if (state.isSpy) {
            card.classList.add("spy-private-card-danger");
            card.innerHTML = `
                <h3>${escapeHtml(t("youAreSpy"))}</h3>
                <p>${escapeHtml(t("spyHint"))}</p>
                <small>${escapeHtml(t("locationHidden"))}</small>
            `;
            return;
        }

        card.innerHTML = `
            <span>${escapeHtml(t("yourLocation"))}</span>
            <strong>${escapeHtml(state.locationName || "-")}</strong>
        `;
    }

    function renderPlayers(players) {
        const list = document.getElementById("spyPlayersList");
        if (!list) return;

        list.innerHTML = players.map(player => `
            <div class="spy-player-row ${player.isConnected ? "" : "is-offline"} ${player.isSpy ? "is-spy" : ""}">
                <span>${escapeHtml(player.name)}</span>
                <div>
                    ${player.isHost ? `<em>${escapeHtml(t("host"))}</em>` : ""}
                    ${player.isSpy ? `<strong>${escapeHtml(t("youAreSpy"))}</strong>` : ""}
                    <small>${escapeHtml(player.isConnected ? t("connectedPlayer") : t("disconnectedPlayer"))}</small>
                </div>
            </div>
        `).join("");
    }

    function renderReveal(state) {
        const panel = document.getElementById("spyRevealPanel");
        if (!panel) return;

        panel.hidden = !state.rolesRevealed;
        document.getElementById("spyRevealedSpy").textContent = state.revealedSpyName || "-";
        document.getElementById("spyRevealedLocation").textContent = state.revealedLocationName || "-";
    }

    function renderHostControls(state) {
        const panel = document.getElementById("spyHostControls");
        if (panel) panel.hidden = !state.isHost;
    }

    function renderInvite(state) {
        const info = document.getElementById("spyInviteInfo");
        if (!info) return;

        const url = `${window.location.origin}${state.inviteUrl}`;
        info.textContent = `${t("invite")}: ${url}`;
    }

    async function bootstrap() {
        const savedName = localStorage.getItem("spyPlayerName") || "";
        const nameInput = document.getElementById("spyPlayerName");
        if (nameInput) nameInput.value = savedName;

        const inviteCode = page.dataset.inviteRoom || "";
        const joinInput = document.getElementById("spyJoinCode");
        if (joinInput && inviteCode) joinInput.value = inviteCode;

        await ensureConnected();

        const savedRoomCode = inviteCode || localStorage.getItem("spyCurrentRoomCode");
        if (savedRoomCode && savedName) {
            await connection.invoke("JoinSpyRoom", savedRoomCode, savedName, getOrCreatePlayerId());
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", bootstrap);
    } else {
        bootstrap();
    }
})();
