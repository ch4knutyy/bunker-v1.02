(function setupGmPanelV2() {
    const allowedTabs = ["game", "players", "events", "history", "tools", "diagnostics", "recovery", "overview"];
    let gmPanelV2State = null;
    let selectedStablePlayerId = null;
    let refreshTimer = null;
    let commandPending = false;
    let propertyEditorData = null;
    let propertyEditorPending = false;

    function panelScrollState() {
        const container = document.querySelector("#gmPanel .gm-panel-v2-content");
        if (!container) return null;
        return {
            container,
            top: container.scrollTop,
            nearBottom: container.scrollHeight - container.clientHeight - container.scrollTop <= 48
        };
    }

    function restorePanelScroll(state) {
        if (!state || !state.container.isConnected) return;
        const restore = () => {
            const maxTop = Math.max(0, state.container.scrollHeight - state.container.clientHeight);
            state.container.scrollTop = state.nearBottom ? maxTop : Math.min(state.top, maxTop);
        };
        restore();
        globalThis.requestAnimationFrame?.(restore);
    }

    // Legacy GM renderers update journal and diagnostic fragments independently.
    // They use this small shared boundary instead of ever taking ownership of scroll.
    window.preserveGmPanelScroll = function preserveGmPanelScroll(render) {
        const state = panelScrollState();
        render();
        restorePanelScroll(state);
    };

    function value(source, camel, pascal) {
        return source?.[camel] ?? source?.[pascal];
    }

    function text(key, fallback = "—") {
        if (typeof t !== "function") return fallback;
        const translated = t(key);
        return translated && translated !== key ? translated : fallback;
    }

    const statusTranslationKeys = Object.freeze({
        waiting: "gmValueWaiting",
        lobby: "gmValueLobby",
        playing: "gmValuePlaying",
        voting: "gmValueVoting",
        finished: "gmValueFinished",
        roundreveal: "gmValueRoundReveal",
        roundended: "gmValueRoundEnded",
        threat: "gmValueThreat",
        discussion: "gmValueDiscussion",
        results: "gmValueResults",
        extrainventory: "gmValueExtraInventory",
        prevotingreadycheck: "gmValuePreVotingReadyCheck",
        votingresults: "gmValueVotingResults",
        finaldiscussion: "gmValueFinalDiscussion",
        hostdecision: "gmValueHostDecision",
        storyrequested: "gmValueStoryRequested",
        storypreparation: "gmValueStoryPreparation",
        storypublished: "gmValueStoryPublished",
        inactive: "gmValueInactive",
        active: "gmValueActive",
        completed: "gmValueCompleted",
        resolved: "gmValueResolved",
        hidden: "gmValueHidden",
        visible: "gmValueVisible",
        revealed: "gmValueRevealed",
        stopped: "gmValueStopped",
        running: "gmValueRunning",
        paused: "gmValuePaused",
        expired: "gmValueExpired",
        aborted: "gmValueAborted",
        resolvedsafely: "gmValueSuccess",
        resolvedwithcasualty: "gmValueCompleted",
        failed: "gmValueFailure",
        success: "gmValueSuccess",
        failure: "gmValueFailure",
        collectingcontributions: "gmValueCollecting",
        none: "gmValueNone",
        unknown: "gmValueUnknown"
    });
    const roleTranslationKeys = Object.freeze({
        host: "gmRoleHost",
        developer: "gmRoleDeveloper",
        omniscientgm: "gmRoleOmniscient",
        technicalgm: "gmRoleTechnical"
    });

    function normalizedTechnicalValue(rawValue) {
        return String(rawValue ?? "")
            .trim()
            .toLocaleLowerCase()
            .replace(/[^a-z0-9]/g, "");
    }

    function localizedGmValue(rawValue, domain = "") {
        const normalized = normalizedTechnicalValue(rawValue);
        const domainKey = domain === "threat" && normalized === "hidden"
            ? "gmValueThreatHidden"
            : null;
        const key = domainKey || statusTranslationKeys[normalized];
        return key ? text(key, text("gmValueUnknown", "—")) : text("gmValueUnknown", "—");
    }

    function localizedRole(rawRole) {
        const key = roleTranslationKeys[normalizedTechnicalValue(rawRole)];
        return key ? text(key, text("gmValueUnknown", "—")) : text("gmValueUnknown", "—");
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

    function readStorage(storageName, key) {
        try {
            return globalThis[storageName]?.getItem(key) ?? null;
        } catch {
            return null;
        }
    }

    function writeStorage(storageName, key, content) {
        try {
            globalThis[storageName]?.setItem(key, content);
        } catch {
            // Storage may be disabled by browser privacy settings.
        }
    }

    function removeStorage(storageName, key) {
        try {
            globalThis[storageName]?.removeItem(key);
        } catch {
            // Storage may be disabled by browser privacy settings.
        }
    }

    function setAccordionOpen(accordion, opening, persist = true) {
        const toggle = accordion?.querySelector(":scope > .gm-accordion-toggle");
        const panelId = toggle?.getAttribute("aria-controls");
        const panel = panelId ? document.getElementById(panelId) : null;
        if (!toggle || !panel) return;

        if (opening) {
            document.querySelectorAll("[data-gm-accordion].is-open").forEach(other => {
                if (other !== accordion) setAccordionOpen(other, false, false);
            });
        }
        accordion.classList.toggle("is-open", opening);
        toggle.setAttribute("aria-expanded", String(opening));
        panel.hidden = !opening;
        if (persist && roomCode()) {
            if (opening) {
                writeStorage("localStorage", preferenceKey("accordion"), accordion.id || toggle.id);
            } else {
                removeStorage("localStorage", preferenceKey("accordion"));
            }
        }
    }

    function restoreAccordionPreference() {
        if (document.querySelector("[data-gm-accordion].is-open")) return;
        const stored = readStorage("localStorage", preferenceKey("accordion"));
        if (!stored) return;
        const accordion = document.getElementById(stored)?.matches("[data-gm-accordion]")
            ? document.getElementById(stored)
            : document.getElementById(stored)?.closest("[data-gm-accordion]");
        if (accordion && getComputedStyle(accordion).display !== "none") {
            setAccordionOpen(accordion, true, false);
        }
    }

    function canShowTab(tab) {
        const access = permissions();
        if (tab === "tools" || tab === "diagnostics")
            return Boolean(value(access, "canUseTechnicalTools", "CanUseTechnicalTools"));
        if (tab === "recovery") {
            return Boolean(value(access, "canRestoreSnapshots", "CanRestoreSnapshots"));
        }
        if (tab === "overview") return Boolean(value(access, "canViewOmniscientData", "CanViewOmniscientData"));
        if (tab === "players") return Boolean(value(access, "canManagePlayers", "CanManagePlayers"));
        if (tab === "events") {
            return Boolean(
                value(access, "canManageRounds", "CanManageRounds") ||
                value(access, "canManageThreats", "CanManageThreats") ||
                value(access, "canManageBunker", "CanManageBunker"));
        }
        if (tab === "history") {
            return Boolean(
                value(access, "canManageRounds", "CanManageRounds") ||
                value(access, "canUseTechnicalTools", "CanUseTechnicalTools"));
        }
        return Boolean(value(access, "canManageRounds", "CanManageRounds"));
    }

    function safeTab(requested) {
        if (allowedTabs.includes(requested) && canShowTab(requested)) return requested;
        if (canShowTab("overview")) return "overview";
        return allowedTabs.find(canShowTab) || "game";
    }

    function setPanelOpen(opening, persist) {
        const panel = document.getElementById("gmPanel");
        if (!panel) return;
        panel.style.removeProperty("display");
        panel.classList.toggle("is-open", opening);
        panel.setAttribute("aria-hidden", String(!opening));
        if (persist && roomCode()) {
            writeStorage("localStorage", preferenceKey("open"), opening ? "1" : "0");
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
            connection_unavailable: text("gmPanelConnectionUnavailable"),
            room_not_joined: text("gmPanelRoomNotJoined"),
            room_not_found: text("gmPanelRoomNotFound"),
            gm_panel_access_denied: text("gmPanelAccessDenied"),
            gm_panel_state_failed: text("gmPanelStateFailed")
        };
        message.textContent = state === "error"
            ? errors[errorCode] || text("gmPanelLoadFailed")
            : text("gmPanelLoading");
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

    function syncGMTabVisibility() {
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
    }

    window.switchGMTab = function switchGMTabV2(tab) {
        activeGMTab = safeTab(tab);
        if (roomCode()) writeStorage("localStorage", preferenceKey("active-tab"), activeGMTab);
        syncGMTabVisibility();
        renderGmPanelV2();
    };

    window.toggleGMPanel = function toggleGmPanelV2() {
        const panel = document.getElementById("gmPanel");
        if (!panel) return;
        const opening = !panel.classList.contains("is-open");
        setPanelOpen(opening, true);
        if (opening) {
            setPanelLoadState("loading");
            refreshGmPanelV2State();
            window.setTimeout(() => panel.querySelector('[role="tab"]:not([hidden])')?.focus({ preventScroll: true }), 0);
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
                status.textContent = text("gmPanelSyncFailed");
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
        const previousPlayerId = selectedStablePlayerId;
        gmPanelV2State = state;
        const players = value(state, "players", "Players") || [];
        const restoredPlayerId =
            selectedStablePlayerId ||
            readStorage("sessionStorage", preferenceKey("selected-player"));
        selectedStablePlayerId = players.some(player =>
            value(player, "playerId", "PlayerId") === restoredPlayerId)
            ? restoredPlayerId
            : null;
        if (!selectedStablePlayerId) {
            selectedPlayerForGM = null;
            removeStorage("sessionStorage", preferenceKey("selected-player"));
        }
        const restored = readStorage("localStorage", preferenceKey("active-tab"));
        activeGMTab = safeTab(restored || activeGMTab || "game");
        if (readStorage("localStorage", preferenceKey("open")) === "1") {
            setPanelOpen(true, false);
        }
        const scrollState = panelScrollState();
        syncGMTabVisibility();
        renderGmPanelV2();
        restoreAccordionPreference();
        restorePanelScroll(scrollState);
        if (selectedStablePlayerId && selectedStablePlayerId !== previousPlayerId) {
            selectPlayerImmediately(selectedStablePlayerId);
        }
    }

    function renderGmPanelV2() {
        if (!gmPanelV2State) return;
        renderHeader();
        renderRecommendedAction();
        renderTabs();
        renderOverview();
        renderActionAvailability();
        renderVoting();
        renderPlayerCards();
    }

    function renderRecommendedAction() {
        const target = document.getElementById("gmRecommendedActionText");
        const button = document.getElementById("gmPrimaryActionButton");
        if (!target || !button) return;
        const actions = value(gmPanelV2State, "availableActions", "AvailableActions") || {};
        const action = value(actions, "primaryAction", "PrimaryAction") || "none";
        const labels = {
            "finish-discussion": text("gmPrimaryFinishDiscussion"),
            "start-game": text("gmPrimaryStartGame"),
            "resume-timer": text("gmPrimaryResumeTimer"),
            "end-voting": text("gmPrimaryEndVoting"),
            "open-threat": text("gmPrimaryOpenThreat"),
            "end-round": text("gmPrimaryEndRound"),
            "start-voting": text("gmPrimaryStartVoting"),
            "none": text("gmPrimaryNone")
        };
        target.textContent = labels[action] || labels.none;
        button.hidden = action === "none";
        button.dataset.gmPrimaryAction = action;
        button.textContent = labels[action] || labels.none;
    }

    function renderHeader() {
        const roleBadge = document.getElementById("gmPanelRoleBadge");
        const room = document.getElementById("gmPanelRoomCode");
        const connectionStatus = document.getElementById("gmPanelConnectionStatus");
        if (roleBadge) {
            roleBadge.textContent = localizedRole(role());
            roleBadge.title = Boolean(value(
                permissions(),
                "canUseTechnicalTools",
                "CanUseTechnicalTools")) ? role() : "";
        }
        if (room) room.textContent = roomCode();
        if (connectionStatus) connectionStatus.textContent = text("gmConnectionSynced");
    }

    function renderTabs() {
        const technical = Boolean(value(
            permissions(),
            "canUseTechnicalTools",
            "CanUseTechnicalTools"));
        const canRestore = Boolean(value(
            permissions(),
            "canRestoreSnapshots",
            "CanRestoreSnapshots"));
        syncCapabilityContent(
            "gmToolsCapabilityTemplate",
            "tools",
            technical);
        syncCapabilityContent(
            "gmDiagnosticsCapabilityTemplate",
            "diagnostics",
            technical);
        syncCapabilityContent(
            "gmRecoveryCapabilityTemplate",
            "recovery",
            canRestore);
        document.querySelectorAll("[data-gm-tab-button]").forEach(button => {
            button.hidden = !canShowTab(button.dataset.gmTabButton);
        });
        const emergency = document.getElementById("gmThreatEmergencyBlock");
        if (emergency) {
            emergency.hidden = !Boolean(value(
                permissions(),
                "canManageThreats",
                "CanManageThreats"));
        }
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
        document.querySelectorAll('[data-gm-requires-capability="CanUseTechnicalTools"]').forEach(section => {
            section.hidden = !technical;
        });
        document.querySelectorAll('[data-gm-requires-capability="CanRestoreSnapshots"]').forEach(section => {
            section.hidden = !canRestore;
        });
    }

    function syncCapabilityContent(templateId, contentKey, allowed) {
        const existing = document.querySelector(
            `[data-gm-capability-content="${contentKey}"]`);
        if (!allowed) {
            existing?.remove();
            return;
        }
        if (existing) return;
        const template = document.getElementById(templateId);
        if (template instanceof HTMLTemplateElement) {
            const content = template.content.cloneNode(true);
            content.querySelectorAll("[data-gm-i18n]").forEach(element => {
                element.textContent = text(element.dataset.gmI18n, element.textContent);
            });
            content.querySelectorAll("[data-gm-i18n-placeholder]").forEach(element => {
                element.placeholder = text(
                    element.dataset.gmI18nPlaceholder,
                    element.placeholder);
            });
            template.before(content);
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
        const cards = [
            summaryCard(text("gmSummaryStateFull"), localizedGmValue(value(gmPanelV2State, "roomState", "RoomState"), "room")),
            summaryCard(text("gmSummaryPhaseFull"), localizedGmValue(value(gmPanelV2State, "phase", "Phase"), "phase")),
            summaryCard(text("gmSummaryRound"), value(gmPanelV2State, "round", "Round")),
            summaryCard(text("gmSummaryActiveFull"), value(gmPanelV2State, "activePlayerCount", "ActivePlayerCount")),
            summaryCard(
                text("gmSummaryReadinessFull"),
                `${value(gmPanelV2State, "readyPlayerCount", "ReadyPlayerCount") || 0} ${text("gmOf")} ${value(gmPanelV2State, "readyRequiredCount", "ReadyRequiredCount") || 0}`),
            summaryCard(text("gmSummaryTimerFull"), localizedGmValue(value(gmPanelV2State, "timerStatus", "TimerStatus"), "timer")),
            summaryCard(text("gmSummaryVotingFull"), localizedGmValue(value(gmPanelV2State, "votingStatus", "VotingStatus"), "voting")),
            summaryCard(text("gmSummaryThreatFull"), localizedGmValue(value(gmPanelV2State, "threatStatus", "ThreatStatus"), "threat"))
        ];
        const postGamePhase = value(gmPanelV2State, "postGamePhase", "PostGamePhase");
        if (normalizedTechnicalValue(postGamePhase) !== "none") {
            cards.push(summaryCard(
                text("gmSummaryPostGameFull"),
                localizedGmValue(postGamePhase, "postgame")));
        }
        target.replaceChildren(...cards);
    }

    function renderVoting() {
        const target = document.getElementById("gmVotingV2Summary");
        if (!target) return;
        target.replaceChildren(
            summaryCard(text("gmSummaryVotingFull"), localizedGmValue(value(gmPanelV2State, "votingStatus", "VotingStatus"), "voting")),
            summaryCard(
                text("gmSummaryVotes"),
                `${value(gmPanelV2State, "votesCast", "VotesCast") || 0} ${text("gmOf")} ${value(gmPanelV2State, "requiredVotes", "RequiredVotes") || 0}`),
            summaryCard(text("gmSummaryTie"), value(gmPanelV2State, "votingIsTie", "VotingIsTie") ? text("gmYes") : text("gmNo"))
        );
        const hint = document.getElementById("gmVotingV2Hint");
        if (hint) {
            hint.hidden = false;
            hint.textContent = value(gmPanelV2State, "isEarlyVoting", "IsEarlyVoting")
                ? text("gmEarlyVotingHint")
                : text("gmVotingAvailabilityHint");
        }
        const actions = value(gmPanelV2State, "availableActions", "AvailableActions") || {};
        const start = document.getElementById("gmVotingStartButton");
        const end = document.getElementById("gmEndVotingBtn");
        const cancel = document.getElementById("gmVotingCancelButton");
        if (start) {
            start.disabled = !Boolean(value(actions, "canStartVoting", "CanStartVoting"));
            start.textContent = value(gmPanelV2State, "isEarlyVoting", "IsEarlyVoting")
                ? text("gmStartEarlyVotingAction")
                : text("gmStartVotingAction");
        }
        if (end) end.disabled = !Boolean(value(actions, "canEndVoting", "CanEndVoting"));
        if (cancel) cancel.disabled = !Boolean(value(actions, "canCancelVoting", "CanCancelVoting"));
    }

    function renderActionAvailability() {
        const actions = value(gmPanelV2State, "availableActions", "AvailableActions") || {};
        const setDisabled = (id, camel, pascal) => {
            const button = document.getElementById(id);
            if (button) button.disabled = !Boolean(value(actions, camel, pascal));
        };
        setDisabled("endRoundBtn", "canEndRound", "CanEndRound");
        setDisabled("gmStartVotingBtn", "canStartVoting", "CanStartVoting");
        setDisabled("gmTimerStart", "canStartTimer", "CanStartTimer");
        setDisabled("gmTimerPause", "canPauseTimer", "CanPauseTimer");
        setDisabled("gmTimerResume", "canResumeTimer", "CanResumeTimer");
        setDisabled("gmTimerRestart", "canAdjustTimer", "CanAdjustTimer");
        setDisabled("gmTimerStop", "canAdjustTimer", "CanAdjustTimer");
        const threatAction = document.getElementById("gmThreatPrimaryAction");
        if (threatAction) {
            threatAction.hidden = !Boolean(value(
                actions,
                "canManageActiveThreat",
                "CanManageActiveThreat"));
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
            name.textContent = value(player, "name", "Name") || text("gmValueUnknown");
            const state = document.createElement("span");
            state.textContent = [
                value(player, "isConnected", "IsConnected") ? text("gmPlayerOnline") : text("gmPlayerOffline"),
                value(player, "isEliminated", "IsEliminated") ? text("gmPlayerEliminated") : text("gmPlayerActive"),
                `${text("gmPlayerRevealed")}: ${value(player, "revealedCount", "RevealedCount") || 0}`,
                value(player, "isCurrentTurn", "IsCurrentTurn") ? text("gmPlayerCurrentTurn") : ""
            ].filter(Boolean).join(" · ");
            button.append(name, state);
            button.addEventListener("click", () => selectPlayerImmediately(playerId));
            target.append(button);
        });
    }

    function selectPlayerImmediately(stablePlayerId) {
        selectedStablePlayerId = stablePlayerId;
        writeStorage("sessionStorage", preferenceKey("selected-player"), stablePlayerId);
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
            if (result) result.textContent = text("gmPlayerDataUnavailable");
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
    window.refreshGmPanelV2State = refreshGmPanelV2State;
    window.localizeGmStatus = localizedGmValue;

    const delegatedLegacyCommands = new Set([
        "addBunkerSupplies", "addBunkerWater", "adjustGameTimer",
        "applyDirectorAction", "applyRoomAutoFix", "applyRoomLocalEdit",
        "cancelVoting", "clearCurrentVotes", "closeGmPropertyEditor",
        "createManualRoomSnapshot", "editCharacteristic", "eliminateSelectedPlayer",
        "endRound", "enterOmniscientGm", "executeHostCharacteristicOverride", "forceReveal", "gmCancelThreat",
        "gmGenerateRareThreat", "gmGenerateTextThreat", "gmRestartThreat",
        "gmResyncThreatRoom", "gmSelectSpecificThreat", "gmSkipScenarioChoice",
        "hideSelectedCharacteristic", "inspectSelectedConnection",
        "invokeGameTimerCommand", "kickSelectedPlayer",
        "openGmPropertyEditor", "peekCharacteristic", "previewDirectorAction",
        "previewEnterOmniscientGm", "previewManualRoundChange",
        "previewRoomAutoFix", "previewRoomLocalEdit", "refreshGmAudit",
        "refreshRoomSnapshots", "regenerateApocalypse", "regenerateBunker",
        "regenerateCharacteristic", "regenerateGmPropertyPreview",
        "removeBunkerSupplies", "removeBunkerWater", "removeSelectedVote",
        "requestGMThreatForcePreview", "resetRoundReadiness", "restartGameTimer",
        "restoreSelectedPlayer", "resyncOmniscientHiddenState",
        "resyncSelectedPlayer", "resyncVotingAdmin", "rollRoundDice",
        "runRoomIntegrityCheck", "saveGmPropertyEdit", "sendGameEvent",
        "sendQuickEvent", "setGamePause", "setGameTimer", "startGameTimer",
        "startVoting", "startVotingReadyCheck", "cancelVotingReadyCheck", "stopGameTimer", "submitBunkerCapacity", "toggleGMPanel",
        "transferHostToSelectedPlayer", "undoLastGmAction"
    ]);

    function parseDelegatedArguments(source) {
        if (!source.trim()) return [];
        const tokenPattern = /'(?:\\.|[^'])*'|"(?:\\.|[^"])*"|true|false|null|-?\d+(?:\.\d+)?/g;
        const tokens = source.match(tokenPattern) || [];
        const remainder = source.replace(tokenPattern, "").replace(/[\s,]/g, "");
        if (remainder) return null;
        return tokens.map(token => {
            if (token === "true") return true;
            if (token === "false") return false;
            if (token === "null") return null;
            if (/^-?\d/.test(token)) return Number(token);
            return token
                .slice(1, -1)
                .replace(/\\'/g, "'")
                .replace(/\\"/g, '"')
                .replace(/\\\\/g, "\\");
        });
    }

    function invokeDelegatedCommand(command) {
        const match = command.trim().match(/^([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)$/);
        if (!match || !delegatedLegacyCommands.has(match[1])) return;
        const args = parseDelegatedArguments(match[2]);
        const handler = globalThis[match[1]];
        if (args && typeof handler === "function") handler(...args);
    }

    document.addEventListener("click", async event => {
        const accordionToggle = event.target.closest(".gm-accordion-toggle");
        if (accordionToggle) {
            const accordion = accordionToggle.closest("[data-gm-accordion]");
            setAccordionOpen(
                accordion,
                accordionToggle.getAttribute("aria-expanded") !== "true");
            return;
        }

        const eventTemplate = event.target.closest("[data-gm-event-template]");
        if (eventTemplate) {
            const templateKey = eventTemplate.dataset.gmEventTemplate;
            const eventText = document.getElementById("gmEventText");
            const eventType = document.getElementById("gmEventType");
            const translationKey = {
                earthquake: "gmEventTemplateEarthquakeText",
                infection: "gmEventTemplateInfectionText",
                survivors: "gmEventTemplateSurvivorsText",
                generator: "gmEventTemplateGeneratorText"
            }[templateKey];
            if (eventText && translationKey) {
                eventText.value = text(translationKey, "");
                eventText.focus();
            }
            if (eventType) eventType.value = eventTemplate.dataset.gmEventType || "info";
            return;
        }

        const resourceAction = event.target.closest("[data-gm-resource-action]");
        if (resourceAction) {
            const months = Number.parseInt(
                document.getElementById("gmBunkerResourceMonths")?.value || "",
                10);
            switch (resourceAction.dataset.gmResourceAction) {
                case "add-supplies":
                    addBunkerSupplies(months);
                    break;
                case "remove-supplies":
                    removeBunkerSupplies(months);
                    break;
                case "add-water":
                    addBunkerWater(months);
                    break;
                case "remove-water":
                    removeBunkerWater(months);
                    break;
            }
            return;
        }

        if (event.target.closest('[data-gm-panel-action="open-threat-controls"]')) {
            const threatAccordion = document.getElementById("gmThreatOperations");
            if (threatAccordion) setAccordionOpen(threatAccordion, true);
            return;
        }

        const delegated = event.target.closest("[data-gm-click]");
        if (delegated) {
            invokeDelegatedCommand(delegated.dataset.gmClick || "");
            return;
        }

        const tab = event.target.closest("[data-gm-tab-button]");
        if (tab) {
            window.switchGMTab(tab.dataset.gmTabButton);
            return;
        }

        if (event.target.closest('[data-gm-panel-action="retry"]')) {
            window.retryGmPanelV2();
            return;
        }

        const primary = event.target.closest("[data-gm-primary-action]");
        if (!primary) return;
        switch (primary.dataset.gmPrimaryAction) {
            case "finish-discussion":
                if (typeof finishPostGameDiscussion === "function") {
                    finishPostGameDiscussion();
                }
                break;
            case "start-game":
                if (typeof startGame === "function") startGame();
                break;
            case "resume-timer":
                if (typeof invokeGameTimerCommand === "function") {
                    invokeGameTimerCommand("ResumeGameTimer");
                }
                break;
            case "end-voting":
                if (typeof endVotingEarly === "function") endVotingEarly();
                break;
            case "open-threat":
                window.switchGMTab("events");
                break;
            case "end-round":
                if (typeof endRound === "function") endRound();
                break;
            case "start-voting":
                if (typeof startVoting === "function") startVoting();
                break;
        }
    });

    document.addEventListener("input", event => {
        if (event.target.id !== "gmDeveloperToolSearch") return;
        const query = event.target.value.trim().toLocaleLowerCase();
        document.querySelectorAll("[data-gm-developer-tool]").forEach(tool => {
            const searchText = `${tool.dataset.gmDeveloperTool || ""} ${tool.querySelector(".gm-accordion-toggle")?.textContent || ""}`
                .toLocaleLowerCase();
            tool.hidden = Boolean(query) && !searchText.includes(query);
        });
    });

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

})();
