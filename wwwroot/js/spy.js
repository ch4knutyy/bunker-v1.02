(function () {
    const translations = {
        uk: {
            round: "Раунд", roomCode: "Код кімнати", players: "Гравці", host: "Host",
            connectedPlayer: "у грі", disconnectedPlayer: "offline", ready: "Готовий",
            notReady: "Не готовий", cancelReady: "Скасувати готовність", you: "Ви",
            waitingPlayers: "Очікування гравців", roundActive: "Раунд активний",
            roundEnded: "Раунд завершено", youAreSpy: "Ти шпигун",
            spyHint: "Спробуй дізнатися локацію за відповідями інших.",
            yourLocation: "Твоя локація", locationHidden: "Локація прихована від шпигуна.",
            spyWas: "Шпигун був", locationWas: "Локація була", invite: "Запрошення",
            nameRequired: "Введи ім’я гравця.", codeRequired: "Введи код кімнати.",
            connectionError: "Не вдалося підключитися до SpyHub.", reconnecting: "Відновлення з’єднання…",
            copyCode: "Копіювати", copied: "Код скопійовано", hostControls: "Керування host",
            roundDuration: "Тривалість раунду (сек.)", minimumPlayers: "Мінімум гравців",
            saveSettings: "Зберегти", startRound: "Почати раунд", endRound: "Завершити раунд",
            newRound: "Новий раунд", returnLobby: "Повернутися до lobby",
            minPlayersRequired: "Усі підключені гравці мають бути готові",
            leaveRoom: "Вийти з кімнати", kick: "Вигнати", vote: "Голосувати",
            guessLocation: "Вгадати локацію", submitGuess: "Підтвердити здогад",
            recovery: "Відновлення", preview: "Переглянути", restore: "Відновити",
            cancel: "Скасувати", noSnapshots: "Немає доступних snapshots",
            changedCategories: "Буде відновлено", snapshotBlocked: "Відновлення заблоковано",
            eventJournal: "Події гри", roundResult: "Результат раунду",
            winnerAgents: "Перемогли мирні гравці", winnerSpy: "Переміг шпигун",
            winnerNone: "Раунд завершено без переможця", timeRemaining: "Залишилось",
            score: "Очки", votes: "Голоси", confirmKick: "Вигнати {name} з кімнати? Гравця буде негайно видалено.",
            confirmEnd: "Завершити активний раунд і розкрити шпигуна та локацію?",
            confirmReturn: "Повернути кімнату до lobby? Поточний раунд буде завершено.",
            confirmLeave: "Вийти з кімнати?", confirmGuess: "Підтвердити здогад «{name}»? Спробу не можна повторити.",
            confirmRestore: "Відновити вибраний snapshot? Поточний стан буде збережено як safety snapshot.",
            confirmActiveRestore: "Активний раунд буде замінено станом snapshot. Продовжити?",
            spyKickedMessage: "Вас вигнано host із кімнати.",
            spyErrorRoomNotFound: "Кімнату не знайдено.", spyErrorPlayerNotFound: "Гравця не знайдено.",
            spyErrorHostOnly: "Дія доступна лише host.", spyErrorRoundAlreadyActive: "Раунд уже активний.",
            spyErrorMinimumPlayers: "Недостатньо активних гравців.", spyErrorEveryoneMustBeReady: "Не всі гравці готові.",
            spyErrorInvalidSettings: "Налаштування поза дозволеним діапазоном.",
            spyErrorNoActiveRound: "Активного раунду немає.", spyErrorInvalidVoteTarget: "Ціль голосування недоступна.",
            spyErrorCannotVoteSelf: "Не можна голосувати за себе.", spyErrorSpyOnly: "Дія доступна лише шпигуну.",
            spyErrorGuessAlreadyUsed: "Спробу вже використано.", spyErrorInvalidLocation: "Невідома локація.",
            spyErrorCannotKickSelf: "Host не може вигнати себе.", spyErrorConfirmationRequired: "Потрібне підтвердження.",
            spyErrorSnapshotNotFound: "Snapshot не знайдено.", spyErrorSnapshotVersion: "Несумісна версія snapshot.",
            spyErrorSnapshotScope: "Snapshot належить іншій кімнаті або грі.",
            spyErrorSnapshotFingerprint: "Fingerprint snapshot не збігається.",
            spyErrorHostTopologyChanged: "Host topology змінилася.", spyErrorPlayerTopologyChanged: "Склад гравців змінився.",
            spyErrorActionFailed: "Дію не виконано.", spyEventRoomCreated: "Кімнату створено",
            spyEventPlayerJoined: "{name} приєднався", spyEventPlayerReconnected: "{name} повернувся",
            spyEventPlayerDisconnected: "{name} відключився", spyEventPlayerLeft: "{name} вийшов",
            spyEventPlayerKicked: "{name} вигнано", spyEventPlayerReady: "{name} готовий",
            spyEventPlayerNotReady: "{name} скасував готовність", spyEventSettingsChanged: "Налаштування змінено",
            spyEventRoundStarted: "Раунд розпочато", spyEventVoteCast: "{name} проголосував",
            spyEventGuessMade: "{name} зробив спробу вгадати локацію",
            spyEventRoundCompleted: "Раунд завершено", spyEventReturnedToLobby: "Кімната повернулася до lobby",
            spyEventSnapshotRestored: "Стан кімнати відновлено", snapshotBy: "Автор",
            spySnapshotRoomCreated: "Кімнату створено", spySnapshotParticipants: "Склад учасників",
            spySnapshotSettings: "Налаштування гри", spySnapshotBeforeRound: "Перед зміною раунду",
            spySnapshotRoundStarted: "Після старту раунду", spySnapshotRoundEnded: "Після завершення раунду",
            spySnapshotLobby: "Повернення до lobby", spySnapshotBeforeKick: "Перед вигнанням гравця",
            spySnapshotAfterKick: "Після вигнання гравця", spySnapshotSafety: "Safety snapshot перед відновленням"
        },
        en: {
            round: "Round", roomCode: "Room code", players: "Players", host: "Host",
            connectedPlayer: "in game", disconnectedPlayer: "offline", ready: "Ready",
            notReady: "Not ready", cancelReady: "Cancel ready", you: "You",
            waitingPlayers: "Waiting for players", roundActive: "Round active", roundEnded: "Round ended",
            youAreSpy: "You are the spy", spyHint: "Try to learn the location from other players' answers.",
            yourLocation: "Your location", locationHidden: "The location is hidden from the spy.",
            spyWas: "The spy was", locationWas: "The location was", invite: "Invite",
            nameRequired: "Enter your player name.", codeRequired: "Enter the room code.",
            connectionError: "Could not connect to SpyHub.", reconnecting: "Reconnecting…",
            copyCode: "Copy", copied: "Code copied", hostControls: "Host controls",
            roundDuration: "Round duration (sec.)", minimumPlayers: "Minimum players", saveSettings: "Save",
            startRound: "Start round", endRound: "End round", newRound: "New round", returnLobby: "Return to lobby",
            minPlayersRequired: "All connected players must be ready", leaveRoom: "Leave room",
            kick: "Kick", vote: "Vote", guessLocation: "Guess location", submitGuess: "Confirm guess",
            recovery: "Recovery", preview: "Preview", restore: "Restore", cancel: "Cancel",
            noSnapshots: "No snapshots available", changedCategories: "Will be restored",
            snapshotBlocked: "Restore blocked", eventJournal: "Game events", roundResult: "Round result",
            winnerAgents: "The agents won", winnerSpy: "The spy won", winnerNone: "Round ended without a winner",
            timeRemaining: "Remaining", score: "Score", votes: "Votes",
            confirmKick: "Kick {name} from the room? The player will be removed immediately.",
            confirmEnd: "End the active round and reveal the spy and location?",
            confirmReturn: "Return the room to the lobby? The current round will end.",
            confirmLeave: "Leave the room?", confirmGuess: "Confirm “{name}”? This guess cannot be repeated.",
            confirmRestore: "Restore this snapshot? The current state will be preserved as a safety snapshot.",
            confirmActiveRestore: "The active round will be replaced by the snapshot. Continue?",
            spyKickedMessage: "The host kicked you from the room.",
            spyErrorRoomNotFound: "Room not found.", spyErrorPlayerNotFound: "Player not found.",
            spyErrorHostOnly: "Only the host can perform this action.", spyErrorRoundAlreadyActive: "A round is already active.",
            spyErrorMinimumPlayers: "Not enough active players.", spyErrorEveryoneMustBeReady: "Not every player is ready.",
            spyErrorInvalidSettings: "Settings are outside the allowed range.", spyErrorNoActiveRound: "There is no active round.",
            spyErrorInvalidVoteTarget: "Vote target is unavailable.", spyErrorCannotVoteSelf: "You cannot vote for yourself.",
            spyErrorSpyOnly: "Only the spy can perform this action.", spyErrorGuessAlreadyUsed: "The guess was already used.",
            spyErrorInvalidLocation: "Unknown location.", spyErrorCannotKickSelf: "The host cannot kick themselves.",
            spyErrorConfirmationRequired: "Confirmation is required.", spyErrorSnapshotNotFound: "Snapshot not found.",
            spyErrorSnapshotVersion: "Snapshot version is incompatible.", spyErrorSnapshotScope: "Snapshot belongs to another room or game.",
            spyErrorSnapshotFingerprint: "Snapshot fingerprint does not match.", spyErrorHostTopologyChanged: "Host topology changed.",
            spyErrorPlayerTopologyChanged: "Player topology changed.", spyErrorActionFailed: "Action failed.",
            spyEventRoomCreated: "Room created", spyEventPlayerJoined: "{name} joined",
            spyEventPlayerReconnected: "{name} reconnected", spyEventPlayerDisconnected: "{name} disconnected",
            spyEventPlayerLeft: "{name} left", spyEventPlayerKicked: "{name} was kicked",
            spyEventPlayerReady: "{name} is ready", spyEventPlayerNotReady: "{name} is not ready",
            spyEventSettingsChanged: "Settings changed", spyEventRoundStarted: "Round started",
            spyEventVoteCast: "{name} voted", spyEventGuessMade: "{name} guessed a location",
            spyEventRoundCompleted: "Round completed", spyEventReturnedToLobby: "Room returned to lobby",
            spyEventSnapshotRestored: "Room state restored", snapshotBy: "Author",
            spySnapshotRoomCreated: "Room created", spySnapshotParticipants: "Participant topology",
            spySnapshotSettings: "Game settings", spySnapshotBeforeRound: "Before round change",
            spySnapshotRoundStarted: "After round start", spySnapshotRoundEnded: "After round completion",
            spySnapshotLobby: "Returned to lobby", spySnapshotBeforeKick: "Before player kick",
            spySnapshotAfterKick: "After player kick", spySnapshotSafety: "Safety snapshot before restore"
        },
        ru: {
            round: "Раунд", roomCode: "Код комнаты", players: "Игроки", host: "Host",
            connectedPlayer: "в игре", disconnectedPlayer: "offline", ready: "Готов",
            notReady: "Не готов", cancelReady: "Отменить готовность", you: "Вы",
            waitingPlayers: "Ожидание игроков", roundActive: "Раунд активен", roundEnded: "Раунд завершён",
            youAreSpy: "Ты шпион", spyHint: "Попробуй узнать локацию по ответам других.",
            yourLocation: "Твоя локация", locationHidden: "Локация скрыта от шпиона.",
            spyWas: "Шпионом был", locationWas: "Локация была", invite: "Приглашение",
            nameRequired: "Введи имя игрока.", codeRequired: "Введи код комнаты.",
            connectionError: "Не удалось подключиться к SpyHub.", reconnecting: "Восстановление соединения…",
            copyCode: "Копировать", copied: "Код скопирован", hostControls: "Управление host",
            roundDuration: "Длительность раунда (сек.)", minimumPlayers: "Минимум игроков", saveSettings: "Сохранить",
            startRound: "Начать раунд", endRound: "Завершить раунд", newRound: "Новый раунд",
            returnLobby: "Вернуться в lobby", minPlayersRequired: "Все подключённые игроки должны быть готовы",
            leaveRoom: "Выйти из комнаты", kick: "Выгнать", vote: "Голосовать",
            guessLocation: "Угадать локацию", submitGuess: "Подтвердить догадку",
            recovery: "Восстановление", preview: "Просмотреть", restore: "Восстановить", cancel: "Отмена",
            noSnapshots: "Нет доступных snapshots", changedCategories: "Будет восстановлено",
            snapshotBlocked: "Восстановление заблокировано", eventJournal: "События игры",
            roundResult: "Результат раунда", winnerAgents: "Победили мирные игроки",
            winnerSpy: "Победил шпион", winnerNone: "Раунд завершён без победителя",
            timeRemaining: "Осталось", score: "Очки", votes: "Голоса",
            confirmKick: "Выгнать {name} из комнаты? Игрок будет немедленно удалён.",
            confirmEnd: "Завершить активный раунд и раскрыть шпиона и локацию?",
            confirmReturn: "Вернуть комнату в lobby? Текущий раунд будет завершён.",
            confirmLeave: "Выйти из комнаты?", confirmGuess: "Подтвердить «{name}»? Попытку нельзя повторить.",
            confirmRestore: "Восстановить snapshot? Текущее состояние будет сохранено как safety snapshot.",
            confirmActiveRestore: "Активный раунд будет заменён состоянием snapshot. Продолжить?",
            spyKickedMessage: "Host выгнал вас из комнаты.",
            spyErrorRoomNotFound: "Комната не найдена.", spyErrorPlayerNotFound: "Игрок не найден.",
            spyErrorHostOnly: "Действие доступно только host.", spyErrorRoundAlreadyActive: "Раунд уже активен.",
            spyErrorMinimumPlayers: "Недостаточно активных игроков.", spyErrorEveryoneMustBeReady: "Не все игроки готовы.",
            spyErrorInvalidSettings: "Настройки вне допустимого диапазона.", spyErrorNoActiveRound: "Активного раунда нет.",
            spyErrorInvalidVoteTarget: "Цель голосования недоступна.", spyErrorCannotVoteSelf: "Нельзя голосовать за себя.",
            spyErrorSpyOnly: "Действие доступно только шпиону.", spyErrorGuessAlreadyUsed: "Попытка уже использована.",
            spyErrorInvalidLocation: "Неизвестная локация.", spyErrorCannotKickSelf: "Host не может выгнать себя.",
            spyErrorConfirmationRequired: "Требуется подтверждение.", spyErrorSnapshotNotFound: "Snapshot не найден.",
            spyErrorSnapshotVersion: "Несовместимая версия snapshot.", spyErrorSnapshotScope: "Snapshot другой комнаты или игры.",
            spyErrorSnapshotFingerprint: "Fingerprint snapshot не совпадает.", spyErrorHostTopologyChanged: "Host topology изменилась.",
            spyErrorPlayerTopologyChanged: "Состав игроков изменился.", spyErrorActionFailed: "Действие не выполнено.",
            spyEventRoomCreated: "Комната создана", spyEventPlayerJoined: "{name} присоединился",
            spyEventPlayerReconnected: "{name} вернулся", spyEventPlayerDisconnected: "{name} отключился",
            spyEventPlayerLeft: "{name} вышел", spyEventPlayerKicked: "{name} выгнан",
            spyEventPlayerReady: "{name} готов", spyEventPlayerNotReady: "{name} отменил готовность",
            spyEventSettingsChanged: "Настройки изменены", spyEventRoundStarted: "Раунд начат",
            spyEventVoteCast: "{name} проголосовал", spyEventGuessMade: "{name} попытался угадать локацию",
            spyEventRoundCompleted: "Раунд завершён", spyEventReturnedToLobby: "Комната вернулась в lobby",
            spyEventSnapshotRestored: "Состояние комнаты восстановлено", snapshotBy: "Автор",
            spySnapshotRoomCreated: "Комната создана", spySnapshotParticipants: "Состав участников",
            spySnapshotSettings: "Настройки игры", spySnapshotBeforeRound: "Перед изменением раунда",
            spySnapshotRoundStarted: "После старта раунда", spySnapshotRoundEnded: "После завершения раунда",
            spySnapshotLobby: "Возврат в lobby", spySnapshotBeforeKick: "Перед удалением игрока",
            spySnapshotAfterKick: "После удаления игрока", spySnapshotSafety: "Safety snapshot перед восстановлением"
        }
    };

    const page = document.querySelector(".spy-page");
    if (!page) return;

    const connection = new signalR.HubConnectionBuilder().withUrl("/spyHub").withAutomaticReconnect().build();
    const pendingCommands = new Set();
    let currentState = null;
    let selectedSnapshotId = null;
    let validRestorePreview = null;
    let timerInterval = null;

    function getLanguage() {
        const language = localStorage.getItem("language") || "uk";
        return ["uk", "en", "ru"].includes(language) ? language : "uk";
    }

    function t(key, values) {
        let text = translations[getLanguage()]?.[key] || translations.uk[key] || key;
        Object.entries(values || {}).forEach(([name, value]) => {
            text = text.replaceAll(`{${name}}`, String(value ?? ""));
        });
        return text;
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
            .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    function commandId(action) {
        const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        return `spy-${action}-${id}`;
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
            localStorage.getItem("spyPlayerName") || "";
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

    async function invokePending(action, method, args, button) {
        if (pendingCommands.has(action)) return;
        pendingCommands.add(action);
        if (button) button.disabled = true;
        try {
            await connection.invoke(method, ...(args || []));
        } catch (error) {
            console.error(error);
            alert(t("spyErrorActionFailed"));
        } finally {
            pendingCommands.delete(action);
            if (button) button.disabled = false;
        }
    }

    window.createSpyRoom = async function () {
        const name = getPlayerName();
        if (!name) return alert(t("nameRequired"));
        localStorage.setItem("spyPlayerName", name);
        if (await ensureConnected())
            await invokePending("create", "CreateSpyRoom", [name, getOrCreatePlayerId(), getLanguage()]);
    };

    window.joinSpyRoom = async function () {
        const name = getPlayerName();
        const code = document.getElementById("spyJoinCode")?.value.trim().toUpperCase() || "";
        if (!name) return alert(t("nameRequired"));
        if (!code) return alert(t("codeRequired"));
        localStorage.setItem("spyPlayerName", name);
        if (await ensureConnected())
            await invokePending("join", "JoinSpyRoom", [code, name, getOrCreatePlayerId(), getLanguage()]);
    };

    connection.off("SpyError");
    connection.on("SpyError", payload => {
        const code = typeof payload === "string" ? payload : payload?.code;
        alert(t(code || "spyErrorActionFailed"));
    });
    connection.off("SpyStateUpdated");
    connection.on("SpyStateUpdated", state => {
        currentState = state;
        localStorage.setItem("spyCurrentRoomCode", state.roomCode);
        renderState(state);
    });
    connection.off("SpySnapshotRestorePreviewed");
    connection.on("SpySnapshotRestorePreviewed", renderSnapshotPreview);
    connection.off("SpyPlayerKicked");
    connection.on("SpyPlayerKicked", payload => {
        alert(t(payload?.messageKey || "spyKickedMessage"));
        resetRoomUi();
    });
    connection.off("SpyRoomLeft");
    connection.on("SpyRoomLeft", resetRoomUi);

    connection.onreconnecting(() => {
        pendingCommands.clear();
        const status = document.getElementById("spyRoundStatus");
        if (status) status.textContent = t("reconnecting");
    });
    connection.onreconnected(async () => {
        const code = localStorage.getItem("spyCurrentRoomCode");
        const name = getPlayerName();
        if (code && name)
            await connection.invoke("JoinSpyRoom", code, name, getOrCreatePlayerId(), getLanguage());
    });

    function renderState(state) {
        document.getElementById("spySetup").hidden = true;
        document.getElementById("spyGame").hidden = false;
        document.getElementById("spyRoomCode").textContent = state.roomCode || "-";
        document.getElementById("spyRoundNumber").textContent =
            state.currentRound ? `${t("round")} ${state.currentRound}` : "";
        document.getElementById("spyRoundStatus").textContent =
            state.isRoundActive ? t("roundActive") : state.currentRound ? t("roundEnded") : t("waitingPlayers");
        renderTimer(state);
        renderPrivateCard(state);
        renderPlayers(state);
        renderPlayerActions(state);
        renderReveal(state);
        renderHostControls(state);
        renderSnapshots(state);
        renderJournal(state);
        renderReady(state);
        document.getElementById("spyInviteInfo").textContent =
            `${t("invite")}: ${window.location.origin}${state.inviteUrl}`;
    }

    function renderTimer(state) {
        const timer = document.getElementById("spyTimer");
        if (!timer) return;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        timer.hidden = !state.isRoundActive;
        if (!state.isRoundActive) return;
        const update = () => {
            const seconds = state.roundEndsAtUtc
                ? Math.max(0, Math.ceil((new Date(state.roundEndsAtUtc).getTime() - Date.now()) / 1000))
                : Math.max(0, state.remainingSeconds || 0);
            timer.textContent = `${t("timeRemaining")}: ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
        };
        update();
        timerInterval = setInterval(update, 1000);
    }

    function renderPrivateCard(state) {
        const card = document.getElementById("spyPrivateCard");
        card.classList.remove("spy-private-card-danger");
        if (!state.isRoundActive && !state.rolesRevealed) {
            card.innerHTML = `<p>${escapeHtml(t("waitingPlayers"))}</p>`;
        } else if (state.rolesRevealed) {
            card.innerHTML = `<p>${escapeHtml(t("spyWas"))}: <strong>${escapeHtml(state.revealedSpyName || "-")}</strong></p>
                <p>${escapeHtml(t("locationWas"))}: <strong>${escapeHtml(state.revealedLocationName || "-")}</strong></p>`;
        } else if (state.isSpy) {
            card.classList.add("spy-private-card-danger");
            card.innerHTML = `<h3>${escapeHtml(t("youAreSpy"))}</h3><p>${escapeHtml(t("spyHint"))}</p>
                <small>${escapeHtml(t("locationHidden"))}</small>`;
        } else {
            card.innerHTML = `<span>${escapeHtml(t("yourLocation"))}</span>
                <strong>${escapeHtml(state.locationName || "-")}</strong>`;
        }
    }

    function renderPlayers(state) {
        const list = document.getElementById("spyPlayersList");
        list.innerHTML = (state.players || []).map(player => {
            const canKick = state.isHost && player.isConnected && !player.isHost && !player.isCurrentPlayer;
            const canVote = state.isRoundActive && player.isConnected && !player.isCurrentPlayer;
            return `<div class="spy-player-row ${player.isConnected ? "" : "is-offline"} ${player.isSpy ? "is-spy" : ""}">
                <span>${escapeHtml(player.name)} ${player.isCurrentPlayer ? `<small>(${escapeHtml(t("you"))})</small>` : ""}</span>
                <div>
                    ${player.isHost ? `<em>${escapeHtml(t("host"))}</em>` : ""}
                    <small>${escapeHtml(player.isConnected ? t("connectedPlayer") : t("disconnectedPlayer"))}</small>
                    <small>${escapeHtml(player.isReady ? t("ready") : t("notReady"))}</small>
                    <small>${escapeHtml(t("score"))}: ${Number(player.score || 0)}</small>
                    ${player.voteCount ? `<small>${escapeHtml(t("votes"))}: ${Number(player.voteCount)}</small>` : ""}
                    ${canVote ? `<button type="button" class="spy-button compact" data-spy-vote="${escapeHtml(player.playerId)}">${escapeHtml(t("vote"))}</button>` : ""}
                    ${canKick ? `<button type="button" class="spy-button compact danger" data-spy-kick="${escapeHtml(player.playerId)}" data-player-name="${escapeHtml(player.name)}">${escapeHtml(t("kick"))}</button>` : ""}
                </div>
            </div>`;
        }).join("");
        list.querySelectorAll("[data-spy-kick]").forEach(button => button.addEventListener("click", () => kickPlayer(button)));
        list.querySelectorAll("[data-spy-vote]").forEach(button => button.addEventListener("click", () =>
            invokePending(`vote-${button.dataset.spyVote}`, "VoteSpyPlayer",
                [button.dataset.spyVote, commandId("vote")], button)));
    }

    async function kickPlayer(button) {
        const playerName = button.dataset.playerName || "";
        if (!confirm(t("confirmKick", { name: playerName }))) return;
        await invokePending(`kick-${button.dataset.spyKick}`, "KickSpyPlayer",
            [button.dataset.spyKick, commandId("kick")], button);
    }

    function renderPlayerActions(state) {
        const actions = document.getElementById("spyPlayerActions");
        if (!state.isRoundActive || !state.isSpy || state.spyGuessUsed) {
            actions.innerHTML = "";
            return;
        }
        actions.innerHTML = `<label for="spyGuessLocation">${escapeHtml(t("guessLocation"))}</label>
            <select id="spyGuessLocation" class="spy-input">
                ${(state.availableLocations || []).map(location =>
                    `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join("")}
            </select>
            <button id="spySubmitGuess" type="button" class="spy-button danger">${escapeHtml(t("submitGuess"))}</button>`;
        document.getElementById("spySubmitGuess")?.addEventListener("click", async event => {
            const select = document.getElementById("spyGuessLocation");
            const selected = select?.options[select.selectedIndex];
            if (!selected || !confirm(t("confirmGuess", { name: selected.textContent }))) return;
            await invokePending("guess", "GuessSpyLocation",
                [selected.value, commandId("guess"), true], event.currentTarget);
        });
    }

    function renderReveal(state) {
        const panel = document.getElementById("spyRevealPanel");
        panel.hidden = !state.rolesRevealed;
        if (!state.rolesRevealed) return;
        document.getElementById("spyRevealedSpy").textContent = state.revealedSpyName || "-";
        document.getElementById("spyRevealedLocation").textContent = state.revealedLocationName || "-";
        const winner = state.roundResult?.winner;
        document.getElementById("spyResultSummary").textContent =
            winner === "agents" ? t("winnerAgents") : winner === "spy" ? t("winnerSpy") : t("winnerNone");
    }

    function renderHostControls(state) {
        const panel = document.getElementById("spyHostControls");
        panel.hidden = !state.isHost;
        if (!state.isHost) return;
        const duration = document.getElementById("spyRoundDuration");
        const minimum = document.getElementById("spyMinimumPlayers");
        if (document.activeElement !== duration) duration.value = state.settings?.roundDurationSeconds || 480;
        if (document.activeElement !== minimum) minimum.value = state.settings?.minimumPlayers || 3;
        duration.disabled = state.isRoundActive;
        minimum.disabled = state.isRoundActive;
        document.getElementById("spySaveSettings").disabled = state.isRoundActive;
        document.getElementById("spyStartRound").hidden = state.isRoundActive || Boolean(state.roundResult);
        document.getElementById("spyStartRound").disabled = !state.canStart;
        document.getElementById("spyEndRound").hidden = !state.isRoundActive;
        document.getElementById("spyNewRound").hidden = !state.roundResult;
        document.getElementById("spyNewRound").disabled = !state.canStart;
        document.getElementById("spyReturnLobby").hidden = !state.isRoundActive && !state.roundResult;
    }

    function renderSnapshots(state) {
        const list = document.getElementById("spySnapshotsList");
        if (!state.isHost) return;
        list.innerHTML = (state.snapshots || []).length ? state.snapshots.map(snapshot =>
            `<div class="spy-snapshot-entry">
                <strong>${escapeHtml(t(snapshot.description))}</strong>
                <small>${escapeHtml(new Date(snapshot.createdAtUtc).toLocaleString())}</small>
                <small>${escapeHtml(t("snapshotBy"))}: ${escapeHtml(snapshot.createdByPlayerId)}</small>
                <button type="button" class="spy-button compact" data-spy-preview="${escapeHtml(snapshot.id)}"
                    ${snapshot.canRestore ? "" : "disabled"}>${escapeHtml(t("preview"))}</button>
                ${snapshot.blockedReason ? `<small>${escapeHtml(t(snapshot.blockedReason))}</small>` : ""}
            </div>`).join("") : `<p>${escapeHtml(t("noSnapshots"))}</p>`;
        list.querySelectorAll("[data-spy-preview]").forEach(button => button.addEventListener("click", async () => {
            selectedSnapshotId = button.dataset.spyPreview;
            validRestorePreview = null;
            document.getElementById("spyRestoreSnapshot").disabled = true;
            await invokePending("preview", "PreviewSpySnapshotRestore", [selectedSnapshotId], button);
        }));
    }

    function renderSnapshotPreview(preview) {
        const panel = document.getElementById("spySnapshotPreview");
        panel.hidden = false;
        validRestorePreview = preview?.canRestore && preview.snapshotId === selectedSnapshotId ? preview : null;
        panel.innerHTML = validRestorePreview
            ? `<strong>${escapeHtml(t("changedCategories"))}</strong><p>${(preview.changedCategories || []).map(escapeHtml).join(", ") || "-"}</p>`
            : `<strong>${escapeHtml(t("snapshotBlocked"))}</strong><p>${escapeHtml(t(preview?.blockedReason || "spyErrorActionFailed"))}</p>`;
        document.getElementById("spyRestoreSnapshot").disabled = !validRestorePreview;
    }

    function renderJournal(state) {
        document.getElementById("spyJournal").innerHTML = (state.journal || []).map(entry =>
            `<p><time>${escapeHtml(new Date(entry.createdAtUtc).toLocaleTimeString())}</time>
                ${escapeHtml(t(entry.messageKey, { name: entry.playerName || "" }))}</p>`).join("");
    }

    function renderReady(state) {
        const button = document.getElementById("spyReady");
        button.hidden = state.isRoundActive;
        button.textContent = state.isReady ? t("cancelReady") : t("ready");
        button.classList.toggle("danger", state.isReady);
    }

    function resetRoomUi() {
        localStorage.removeItem("spyCurrentRoomCode");
        currentState = null;
        selectedSnapshotId = null;
        validRestorePreview = null;
        if (timerInterval) clearInterval(timerInterval);
        timerInterval = null;
        document.getElementById("spyGame").hidden = true;
        document.getElementById("spySetup").hidden = false;
        document.getElementById("spyRoomCode").textContent = "-";
    }

    document.getElementById("spyCopyRoomCode")?.addEventListener("click", async event => {
        if (!currentState?.roomCode) return;
        await navigator.clipboard.writeText(currentState.roomCode);
        const original = event.currentTarget.textContent;
        event.currentTarget.textContent = t("copied");
        setTimeout(() => { event.currentTarget.textContent = original; }, 1200);
    });
    document.getElementById("spyReady")?.addEventListener("click", event =>
        invokePending("ready", "SetSpyReady", [!currentState?.isReady, commandId("ready")], event.currentTarget));
    document.getElementById("spySaveSettings")?.addEventListener("click", event =>
        invokePending("settings", "UpdateSpySettings", [
            Number(document.getElementById("spyRoundDuration").value),
            Number(document.getElementById("spyMinimumPlayers").value),
            commandId("settings")
        ], event.currentTarget));
    document.getElementById("spyStartRound")?.addEventListener("click", event =>
        invokePending("start", "StartSpyRound", [commandId("start")], event.currentTarget));
    document.getElementById("spyNewRound")?.addEventListener("click", event =>
        invokePending("new-round", "NewSpyRound", [commandId("new-round")], event.currentTarget));
    document.getElementById("spyEndRound")?.addEventListener("click", event => {
        if (confirm(t("confirmEnd")))
            invokePending("end", "EndSpyRound", [commandId("end")], event.currentTarget);
    });
    document.getElementById("spyReturnLobby")?.addEventListener("click", event => {
        if (confirm(t("confirmReturn")))
            invokePending("return-lobby", "ReturnSpyToLobby", [commandId("lobby"), true], event.currentTarget);
    });
    document.getElementById("spyLeaveRoom")?.addEventListener("click", event => {
        if (confirm(t("confirmLeave")))
            invokePending("leave", "LeaveSpyRoom", [commandId("leave")], event.currentTarget);
    });
    document.getElementById("spyRestoreSnapshot")?.addEventListener("click", event => {
        if (!validRestorePreview || validRestorePreview.snapshotId !== selectedSnapshotId) return;
        if (!confirm(t("confirmRestore"))) return;
        if (currentState?.isRoundActive && !confirm(t("confirmActiveRestore"))) return;
        invokePending("restore", "RestoreSpySnapshot",
            [selectedSnapshotId, commandId("restore"), true, Boolean(currentState?.isRoundActive)], event.currentTarget);
    });
    document.getElementById("spyCancelRestore")?.addEventListener("click", () => {
        selectedSnapshotId = null;
        validRestorePreview = null;
        document.getElementById("spySnapshotPreview").hidden = true;
        document.getElementById("spyRestoreSnapshot").disabled = true;
    });

    async function bootstrap() {
        const savedName = localStorage.getItem("spyPlayerName") || "";
        const nameInput = document.getElementById("spyPlayerName");
        if (nameInput) nameInput.value = savedName;
        const inviteCode = page.dataset.inviteRoom || "";
        const joinInput = document.getElementById("spyJoinCode");
        if (joinInput && inviteCode) joinInput.value = inviteCode;
        document.querySelectorAll("[data-i18n]").forEach(element => {
            if (translations[getLanguage()]?.[element.dataset.i18n])
                element.textContent = t(element.dataset.i18n);
        });
        await ensureConnected();
        const savedRoomCode = inviteCode || localStorage.getItem("spyCurrentRoomCode");
        if (savedRoomCode && savedName)
            await connection.invoke("JoinSpyRoom", savedRoomCode, savedName, getOrCreatePlayerId(), getLanguage());
    }

    if (document.readyState === "loading")
        document.addEventListener("DOMContentLoaded", bootstrap);
    else
        bootstrap();
})();
