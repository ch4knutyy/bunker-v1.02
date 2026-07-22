(function setupGmPanelV2() {
    const allowedTabs = ["game", "players", "voting", "threats", "bunker", "events", "technical", "overview"];
    const liveEvents = [
        "RoundStateUpdated",
        "GameTimerUpdated",
        "VotingStarted",
        "VotingProgress",
        "VotingEnded",
        "VotingResolved",
        "VotingCancelled",
        "VotingAdminUpdated",
        "ThreatStateUpdated",
        "GMThreatControlData",
        "BunkerCapacityUpdated",
        "BunkerSuppliesAdded",
        "BunkerSuppliesRemoved",
        "BunkerWaterAdded",
        "BunkerWaterRemoved",
        "BunkerUpdated",
        "RoomJoined",
        "RejoinSuccess",
        "RoomPlayersUpdated",
        "PlayerReconnected",
        "PlayerEliminated",
        "PlayerRestored",
        "GameCompleted"
    ];
    let gmPanelV2State = null;
    let selectedStablePlayerId = null;
    let refreshTimer = null;
    let commandPending = false;
    let propertyEditorData = null;
    let propertyEditorPending = false;
    let panelMode = "simple";

    function value(source, camel, pascal) {
        return source?.[camel] ?? source?.[pascal];
    }

    function permissions() {
        return value(gmPanelV2State, "permissions", "Permissions") || {};
    }

    function roomCode() {
        return value(gmPanelV2State, "roomCode", "RoomCode") ||
            currentRoom?.id ||
            currentRoom?.Id ||
            "";
    }

    function role() {
        return value(gmPanelV2State, "role", "Role") || "Host";
    }

    function preferenceKey(suffix) {
        return `gm-panel-v2:${roomCode()}:${role()}:${suffix}`;
    }

    function canShowTab(tab) {
        const access = permissions();
        if (panelMode === "simple" && tab === "events") return false;
        if (tab === "technical") return Boolean(value(access, "canUseTechnicalTools", "CanUseTechnicalTools"));
        if (tab === "overview") return Boolean(value(access, "canViewOmniscientData", "CanViewOmniscientData"));
        if (tab === "players") return Boolean(value(access, "canManagePlayers", "CanManagePlayers"));
        if (tab === "voting") return Boolean(value(access, "canManageVoting", "CanManageVoting"));
        if (tab === "threats") return Boolean(value(access, "canManageThreats", "CanManageThreats"));
        if (tab === "bunker") return Boolean(value(access, "canManageBunker", "CanManageBunker"));
        if (tab === "events") return Boolean(value(access, "canManageRounds", "CanManageRounds"));
        return Boolean(value(access, "canManageRounds", "CanManageRounds"));
    }

    function safeTab(requested) {
        if (allowedTabs.includes(requested) && canShowTab(requested)) return requested;
        if (canShowTab("overview")) return "overview";
        return allowedTabs.find(canShowTab) || "game";
    }

    function setPanelOpen(opening, persist) {
        const panel = document.getElementById("gmPanel");
        const backdrop = document.getElementById("gmPanelBackdrop");
        if (!panel || !backdrop) return;
        panel.style.removeProperty("display");
        panel.classList.toggle("is-open", opening);
        backdrop.classList.toggle("is-open", opening);
        panel.setAttribute("aria-hidden", String(!opening));
        backdrop.setAttribute("aria-hidden", String(!opening));
        document.body.classList.toggle("gm-panel-v2-open", opening);
        if (persist && roomCode()) {
            localStorage.setItem(preferenceKey("open"), opening ? "1" : "0");
        }
    }

    function setPanelLoadState(state, errorCode) {
        const container = document.getElementById("gmPanelV2LoadState");
        const message = document.getElementById("gmPanelV2LoadMessage");
        const retry = document.getElementById("gmPanelV2Retry");
        if (!container || !message || !retry) return;
        container.hidden = state === "ready";
        retry.hidden = state !== "error";
        const errors = {
            connection_unavailable: "З’єднання із сервером ще не готове.",
            room_not_joined: "Спочатку приєднайтеся до кімнати.",
            room_not_found: "Кімнату для поточного з’єднання не знайдено.",
            gm_panel_access_denied: "Немає доступу до GM-панелі.",
            gm_panel_state_failed: "Сервер не зміг побудувати стан GM-панелі."
        };
        message.textContent = state === "error"
            ? errors[errorCode] || "Не вдалося завантажити стан GM-панелі."
            : "Завантаження панелі ведучого…";
    }

    function gmPanelErrorCode(error) {
        const message = String(error?.message || error || "");
        return [
            "room_not_found",
            "gm_panel_access_denied",
            "gm_panel_state_failed"
        ].find(code => message.includes(code)) || "unknown";
    }

    function hasJoinedRoom() {
        return Boolean(currentRoom?.id || currentRoom?.Id);
    }

    window.switchGMTab = function switchGMTabV2(tab) {
        activeGMTab = safeTab(tab);
        if (roomCode()) localStorage.setItem(preferenceKey("active-tab"), activeGMTab);
        document.querySelectorAll("[data-gm-tab]").forEach(section => {
            const active = section.dataset.gmTab === activeGMTab;
            if (section.id === "gmPlayerInfo") {
                section.style.display = active && selectedPlayerForGM ? "block" : "none";
            } else {
                section.style.display = active ? "block" : "none";
            }
        });
        document.querySelectorAll("[data-gm-tab-button]").forEach(button => {
            const active = button.dataset.gmTabButton === activeGMTab;
            button.classList.toggle("active", active);
            button.setAttribute("aria-selected", String(active));
            button.tabIndex = active ? 0 : -1;
        });
        renderGmPanelV2();
    };

    window.setGmPanelMode = function setGmPanelMode(mode) {
        panelMode = mode === "advanced" ? "advanced" : "simple";
        if (roomCode()) localStorage.setItem(preferenceKey("mode"), panelMode);
        activeGMTab = safeTab(activeGMTab);
        renderGmPanelV2();
        window.switchGMTab(activeGMTab);
    };

    window.toggleGMPanel = function toggleGmPanelV2() {
        const panel = document.getElementById("gmPanel");
        if (!panel) return;
        const opening = !panel.classList.contains("is-open");
        setPanelOpen(opening, true);
        if (opening) {
            setPanelLoadState("loading");
            refreshGmPanelV2State();
            window.setTimeout(() => panel.querySelector('[role="tab"]:not([hidden])')?.focus(), 0);
        }
    };

    async function refreshGmPanelV2State() {
        if (typeof connection === "undefined" ||
            connection.state !== signalR.HubConnectionState.Connected) {
            setPanelLoadState("error", "connection_unavailable");
            return;
        }

        if (!hasJoinedRoom()) {
            setPanelLoadState("error", "room_not_joined");
            return;
        }

        try {
            const state = await connection.invoke("GetGmPanelState");
            applyGmPanelV2State(state);
            setPanelLoadState("ready");
        } catch (error) {
            console.error("GetGmPanelState failed", error);

            const status = document.getElementById("gmPanelConnectionStatus");
            if (status) {
                status.textContent = "Не вдалося синхронізувати";
            }

            setPanelLoadState("error", gmPanelErrorCode(error));
        }
    }

    window.retryGmPanelV2 = function retryGmPanelV2() {
        setPanelLoadState("loading");
        refreshGmPanelV2State();
    };

    function scheduleGmPanelV2Refresh() {
        globalThis.clearTimeout(refreshTimer);
        refreshTimer = globalThis.setTimeout(refreshGmPanelV2State, 120);
        renderGmPanelV2();
    }

    function applyGmPanelV2State(state) {
        gmPanelV2State = state;
        const players = value(state, "players", "Players") || [];
        const restoredPlayerId =
            selectedStablePlayerId ||
            sessionStorage.getItem(preferenceKey("selected-player"));
        selectedStablePlayerId = players.some(player =>
            value(player, "playerId", "PlayerId") === restoredPlayerId)
            ? restoredPlayerId
            : null;
        if (!selectedStablePlayerId) {
            selectedPlayerForGM = null;
            sessionStorage.removeItem(preferenceKey("selected-player"));
        }
        const restored = localStorage.getItem(preferenceKey("active-tab"));
        panelMode = localStorage.getItem(preferenceKey("mode")) === "advanced" ? "advanced" : "simple";
        activeGMTab = safeTab(restored || activeGMTab || "game");
        if (localStorage.getItem(preferenceKey("open")) === "1") {
            setPanelOpen(true, false);
        }
        renderGmPanelV2();
        window.switchGMTab(activeGMTab);
        if (selectedStablePlayerId) {
            selectPlayerImmediately(selectedStablePlayerId);
        }
    }

    function renderGmPanelV2() {
        if (!gmPanelV2State) return;
        renderHeader();
        renderPanelMode();
        renderRecommendedAction();
        renderTabs();
        renderOverview();
        renderVoting();
        renderPlayerCards();
    }

    function renderPanelMode() {
        const panel = document.getElementById("gmPanel");
        if (panel) panel.dataset.gmMode = panelMode;
        const simple = document.getElementById("gmPanelSimpleMode");
        const advanced = document.getElementById("gmPanelAdvancedMode");
        if (simple) simple.setAttribute("aria-pressed", String(panelMode === "simple"));
        if (advanced) advanced.setAttribute("aria-pressed", String(panelMode === "advanced"));
    }

    function renderRecommendedAction() {
        const target = document.getElementById("gmRecommendedActionText");
        if (!target) return;
        const roomState = value(gmPanelV2State, "roomState", "RoomState") || "Lobby";
        const phase = value(gmPanelV2State, "phase", "Phase") || "Lobby";
        const votingState = value(gmPanelV2State, "votingStatus", "VotingStatus") || "Inactive";
        const threatState = value(gmPanelV2State, "threatStatus", "ThreatStatus") || "Inactive";
        const postGamePhase = typeof currentPostGameTransition !== "undefined" ? currentPostGameTransition?.phase : null;
        target.textContent = postGamePhase === "FinalDiscussion" ? "Завершіть фінальне обговорення"
            : postGamePhase === "HostDecision" ? "Оберіть нову гру або фінальну історію"
            : postGamePhase === "StoryRequested" || postGamePhase === "StoryPreparation" ? "Дочекайтеся публікації або скасуйте фінальну історію"
            : roomState === "Lobby" ? "Перевірте готовність гравців і почніть гру"
            : votingState !== "Inactive" ? "Завершіть поточне голосування"
            : threatState !== "Inactive" && threatState !== "Resolved" ? "Розв’яжіть поточну загрозу"
            : phase === "RoundReveal" ? "Дочекайтеся розкриття характеристик і завершіть раунд"
            : "Перевірте стан раунду та виконайте наступну основну дію";
    }

    function renderHeader() {
        const roleBadge = document.getElementById("gmPanelRoleBadge");
        const room = document.getElementById("gmPanelRoomCode");
        const connectionStatus = document.getElementById("gmPanelConnectionStatus");
        if (roleBadge) roleBadge.textContent = role();
        if (room) room.textContent = roomCode();
        if (connectionStatus) connectionStatus.textContent = "Синхронізовано";
    }

    function renderTabs() {
        const technical = Boolean(value(
            permissions(),
            "canUseTechnicalTools",
            "CanUseTechnicalTools"));
        document.querySelectorAll("[data-gm-tab-button]").forEach(button => {
            button.hidden = !canShowTab(button.dataset.gmTabButton);
        });
        const emergency = document.getElementById("gmThreatEmergencyBlock");
        if (emergency) emergency.hidden = !technical;
        const manualRound = document.getElementById("gmManualRoundHeading")?.closest("section");
        if (manualRound) manualRound.hidden = !technical;
        document.querySelectorAll(".gm-round-danger-zone, .gm-player-danger").forEach(section => {
            section.hidden = !technical;
        });
        document.querySelectorAll('[data-gm-i18n="gmInspectConnection"]').forEach(button => {
            button.hidden = !technical;
        });
        const ownerLink = document.getElementById("gmOwnerContentEditorLink");
        if (ownerLink) {
            ownerLink.hidden = !Boolean(value(
                permissions(),
                "canOpenContentEditor",
                "CanOpenContentEditor"));
        }
        const propertyEditButton = document.getElementById("gmEditPropertyButton");
        if (propertyEditButton) {
            propertyEditButton.hidden = !Boolean(value(
                permissions(),
                "canManagePlayers",
                "CanManagePlayers"));
        }
    }

    function summaryCard(label, content) {
        const card = document.createElement("div");
        card.className = "gm-status-card";
        const caption = document.createElement("span");
        caption.textContent = label;
        const strong = document.createElement("strong");
        strong.textContent = String(content ?? "—");
        card.append(caption, strong);
        return card;
    }

    function renderOverview() {
        const target = document.getElementById("gmGameStateSummary");
        if (!target) return;
        target.replaceChildren(
            summaryCard("Стан", value(gmPanelV2State, "roomState", "RoomState")),
            summaryCard("Фаза", value(gmPanelV2State, "phase", "Phase")),
            summaryCard("Раунд", value(gmPanelV2State, "round", "Round")),
            summaryCard("Активні", value(gmPanelV2State, "activePlayerCount", "ActivePlayerCount")),
            summaryCard("Місткість", value(gmPanelV2State, "bunkerCapacity", "BunkerCapacity")),
            summaryCard("Таймер", value(gmPanelV2State, "timerStatus", "TimerStatus")),
            summaryCard("Голосування", value(gmPanelV2State, "votingStatus", "VotingStatus")),
            summaryCard("Загроза", value(gmPanelV2State, "threatStatus", "ThreatStatus"))
        );
    }

    function renderVoting() {
        const target = document.getElementById("gmVotingV2Summary");
        if (!target) return;
        target.replaceChildren(
            summaryCard("Стан", value(gmPanelV2State, "votingStatus", "VotingStatus")),
            summaryCard(
                "Голоси",
                `${value(gmPanelV2State, "votesCast", "VotesCast") || 0}/${value(gmPanelV2State, "requiredVotes", "RequiredVotes") || 0}`),
            summaryCard("Нічия", value(gmPanelV2State, "votingIsTie", "VotingIsTie") ? "Так" : "Ні")
        );
        const hint = document.getElementById("gmVotingV2Hint");
        if (hint) {
            const round = Number(value(gmPanelV2State, "round", "Round") || 0);
            hint.hidden = round >= 3;
        }
    }

    function renderPlayerCards() {
        const target = document.getElementById("gmPlayerCardsV2");
        if (!target) return;
        target.replaceChildren();
        const players = value(gmPanelV2State, "players", "Players") || [];
        players.forEach(player => {
            const playerId = value(player, "playerId", "PlayerId");
            const button = document.createElement("button");
            button.type = "button";
            button.className = "gm-player-card-v2";
            button.classList.toggle("is-selected", playerId === selectedStablePlayerId);
            const name = document.createElement("strong");
            name.textContent = value(player, "name", "Name") || "Unknown";
            const state = document.createElement("span");
            state.textContent = [
                value(player, "isConnected", "IsConnected") ? "online" : "offline",
                value(player, "isEliminated", "IsEliminated") ? "eliminated" : "active",
                `${value(player, "revealedCount", "RevealedCount") || 0} відкрито`,
                value(player, "isCurrentTurn", "IsCurrentTurn") ? "хід" : ""
            ].filter(Boolean).join(" · ");
            button.append(name, state);
            button.addEventListener("click", () => selectPlayerImmediately(playerId));
            target.append(button);
        });
    }

    function selectPlayerImmediately(stablePlayerId) {
        selectedStablePlayerId = stablePlayerId;
        sessionStorage.setItem(preferenceKey("selected-player"), stablePlayerId);
        const entry = Object.entries(gmPlayersData || {}).find(([, player]) =>
            value(player, "stablePlayerId", "StablePlayerId") === stablePlayerId);
        if (entry) {
            selectedPlayerForGM = entry[0];
            const select = document.getElementById("gmPlayerSelect");
            if (select) select.value = selectedPlayerForGM;
            loadPlayerDataForGM();
            renderPlayerCards();
            return;
        }
        connection.invoke("GetAllPlayersData").catch(() => {
            const result = document.getElementById("gmPlayerCommandResult");
            if (result) result.textContent = "Дані гравця недоступні.";
        });
    }

    window.gmPanelV2Command = async function gmPanelV2Command(button, action) {
        if (commandPending) return;
        commandPending = true;
        if (button) {
            button.disabled = true;
            button.classList.add("is-pending");
        }
        try {
            return await action(crypto.randomUUID());
        } finally {
            commandPending = false;
            if (button) {
                button.disabled = false;
                button.classList.remove("is-pending");
            }
        }
    };

    function propertyDefinitions() {
        return value(propertyEditorData, "definitions", "Definitions") || [];
    }

    function selectedPropertyDefinition() {
        const definitionId = document.getElementById("gmPropertyDefinitionSelect")?.value;
        return propertyDefinitions().find(definition =>
            value(definition, "id", "Id") === definitionId);
    }

    function setPropertyEditorPending(pending) {
        propertyEditorPending = pending;
        ["gmPropertySaveButton", "gmPropertyRegenerateButton", "gmPropertyDefinitionSelect"]
            .forEach(id => {
                const element = document.getElementById(id);
                if (element) element.disabled = pending;
            });
    }

    function propertyEditorFeedback(message) {
        const feedback = document.getElementById("gmPropertyEditorFeedback");
        if (feedback) feedback.textContent = message || "";
    }

    function renderPropertyEditorPreview(presentation) {
        const target = document.getElementById("gmPropertyEditorPreview");
        if (!target) return;
        target.replaceChildren();
        if (!presentation) return;
        const title = document.createElement("strong");
        title.textContent = value(presentation, "title", "Title") || "—";
        target.append(title);
        const details = value(presentation, "details", "Details") || [];
        details.slice(0, 4).forEach(detail => {
            const row = document.createElement("div");
            row.className = "gm-property-editor-preview-row";
            const label = document.createElement("span");
            label.textContent = value(detail, "label", "Label") || "";
            const content = document.createElement("span");
            content.textContent = value(detail, "value", "Value") || "—";
            row.append(label, content);
            target.append(row);
        });
    }

    function renderPropertyEditorFields(generatedValues) {
        const target = document.getElementById("gmPropertyEditorFields");
        const definition = selectedPropertyDefinition();
        if (!target || !definition) return;
        target.replaceChildren();
        const values = generatedValues || {};
        const fields = value(definition, "fields", "Fields") || [];
        fields.forEach(field => {
            const key = value(field, "key", "Key");
            const wrapper = document.createElement("label");
            wrapper.className = "gm-field";
            const caption = document.createElement("span");
            caption.textContent = value(field, "label", "Label") || key;
            let input;
            if (value(field, "isCondition", "IsCondition")) {
                input = document.createElement("select");
                const options = value(field, "options", "Options") || [];
                options.forEach(optionData => {
                    const option = document.createElement("option");
                    option.value = String(value(optionData, "level", "Level"));
                    option.textContent = value(optionData, "label", "Label") || option.value;
                    input.append(option);
                });
            } else {
                input = document.createElement("input");
                input.type = "number";
                input.min = String(value(field, "min", "Min"));
                input.max = String(value(field, "max", "Max"));
                input.step = "1";
            }
            input.className = "gm-select gm-property-value";
            input.dataset.propertyKey = key;
            const currentValue = values[key];
            if (Number.isInteger(currentValue)) input.value = String(currentValue);
            wrapper.append(caption, input);
            target.append(wrapper);
        });

        const conditionProfile = document.getElementById("gmPropertyConditionProfile");
        if (conditionProfile) {
            conditionProfile.textContent =
                `Профіль стану: ${value(definition, "conditionProfile", "ConditionProfile") || "—"}`;
        }
    }

    function collectPropertyEditorValues() {
        const values = {};
        document.querySelectorAll("#gmPropertyEditorFields [data-property-key]")
            .forEach(input => {
                const parsed = Number(input.value);
                if (!Number.isInteger(parsed)) {
                    throw new Error("property_values_invalid");
                }
                values[input.dataset.propertyKey] = parsed;
            });
        return values;
    }

    window.openGmPropertyEditor = async function openGmPropertyEditor() {
        if (propertyEditorPending ||
            !selectedStablePlayerId ||
            !Boolean(value(permissions(), "canManagePlayers", "CanManagePlayers"))) {
            return;
        }
        setPropertyEditorPending(true);
        propertyEditorFeedback("");
        try {
            propertyEditorData = await connection.invoke(
                "GetPlayerPropertyEditor",
                selectedStablePlayerId,
                getCurrentLanguage());
            const player = document.getElementById("gmPropertyEditorPlayer");
            if (player) {
                player.textContent = value(propertyEditorData, "playerName", "PlayerName") || "—";
            }
            const select = document.getElementById("gmPropertyDefinitionSelect");
            if (!select) return;
            select.replaceChildren(...propertyDefinitions().map(definition => {
                const option = document.createElement("option");
                option.value = value(definition, "id", "Id");
                option.textContent = value(definition, "title", "Title") || option.value;
                return option;
            }));
            const currentDefinitionId = value(
                propertyEditorData,
                "currentDefinitionId",
                "CurrentDefinitionId");
            if ([...select.options].some(option => option.value === currentDefinitionId)) {
                select.value = currentDefinitionId;
            }
            const dialog = document.getElementById("gmPropertyEditorDialog");
            if (!dialog?.open) dialog?.showModal();
            if (currentDefinitionId) {
                renderPropertyEditorFields(value(
                    propertyEditorData,
                    "currentValues",
                    "CurrentValues") || {});
                renderPropertyEditorPreview(value(
                    propertyEditorData,
                    "currentPresentation",
                    "CurrentPresentation"));
            } else {
                setPropertyEditorPending(false);
                await window.regenerateGmPropertyPreview();
            }
        } catch (error) {
            propertyEditorFeedback(String(error?.message || error));
        } finally {
            setPropertyEditorPending(false);
        }
    };

    window.closeGmPropertyEditor = function closeGmPropertyEditor() {
        if (propertyEditorPending) return;
        document.getElementById("gmPropertyEditorDialog")?.close();
        propertyEditorData = null;
        const search = document.getElementById("gmPropertyDefinitionSearch");
        if (search) search.value = "";
    };

    window.filterGmPropertyDefinitions = function filterGmPropertyDefinitions() {
        const query = document.getElementById("gmPropertyDefinitionSearch")
            ?.value.trim().toLocaleLowerCase() || "";
        const select = document.getElementById("gmPropertyDefinitionSelect");
        if (!select) return;
        [...select.options].forEach(option => {
            option.hidden = Boolean(query) &&
                !option.textContent.toLocaleLowerCase().includes(query);
        });
        if (select.selectedOptions[0]?.hidden) {
            const firstVisible = [...select.options].find(option => !option.hidden);
            if (firstVisible) {
                select.value = firstVisible.value;
                window.regenerateGmPropertyPreview();
            }
        }
    };

    window.regenerateGmPropertyPreview = async function regenerateGmPropertyPreview() {
        const definition = selectedPropertyDefinition();
        if (!definition || propertyEditorPending) return;
        setPropertyEditorPending(true);
        propertyEditorFeedback("");
        try {
            const preview = await connection.invoke(
                "PreviewPlayerProperty",
                value(definition, "id", "Id"),
                getCurrentLanguage());
            renderPropertyEditorFields(value(
                preview,
                "generatedValues",
                "GeneratedValues") || {});
            renderPropertyEditorPreview(value(preview, "presentation", "Presentation"));
        } catch (error) {
            propertyEditorFeedback(String(error?.message || error));
        } finally {
            setPropertyEditorPending(false);
        }
    };

    window.saveGmPropertyEdit = async function saveGmPropertyEdit() {
        const definition = selectedPropertyDefinition();
        if (!definition || propertyEditorPending || !selectedStablePlayerId) return;
        setPropertyEditorPending(true);
        propertyEditorFeedback("");
        try {
            const generatedValues = collectPropertyEditorValues();
            await connection.invoke(
                "UpdatePlayerProperty",
                selectedStablePlayerId,
                value(definition, "id", "Id"),
                generatedValues,
                crypto.randomUUID());
            document.getElementById("gmPropertyEditorDialog")?.close();
            propertyEditorData = null;
            await connection.invoke("GetAllPlayersData");
            scheduleGmPanelV2Refresh();
        } catch (error) {
            propertyEditorFeedback(String(error?.message || error));
        } finally {
            setPropertyEditorPending(false);
        }
    };

    window.gmPanelV2OnStateChanged = scheduleGmPanelV2Refresh;

    document.addEventListener("keydown", event => {
        const panel = document.getElementById("gmPanel");
        if (event.key === "Escape" && panel?.classList.contains("is-open")) {
            window.toggleGMPanel();
        }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
            const tabs = [...document.querySelectorAll('[data-gm-tab-button]:not([hidden])')];
            const index = tabs.indexOf(document.activeElement);
            if (index < 0) return;
            event.preventDefault();
            const offset = event.key === "ArrowRight" ? 1 : -1;
            tabs[(index + offset + tabs.length) % tabs.length].click();
        }
    });

    if (globalThis.connection?.on) {
        liveEvents.forEach(eventName => connection.on(eventName, scheduleGmPanelV2Refresh));
        connection.on("AllPlayersData", () => {
            if (selectedStablePlayerId) selectPlayerImmediately(selectedStablePlayerId);
            renderPlayerCards();
        });
        connection.onreconnected?.(() => refreshGmPanelV2State());
    }
})();
