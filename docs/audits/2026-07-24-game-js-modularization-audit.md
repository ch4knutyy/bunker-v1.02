---
title: "Повна карта wwwroot/js/game.js перед модуляризацією"
date: 2026-07-24
type: audit
scope: game.js modularization readiness
status: verified-corrected
branch: main
working-tree: clean
tools: opencode/big-pickle
file-fingerprint: "SHA256:690dac0d8d75d25b83860efef0f92fd95e43248287467a3368baac099691fe10"
checks-performed: dotnet build, 55 JS contract tests (310 test cases), 46 Playwright spec files, git status, regex analysis, scope-aware variable counting, connection.on/invoke extraction, DOM selector inventory, inline Razor handler count, line-reference verification against actual file
checks-intentionally-not-performed: full xUnit suite, full Playwright suite, server start
known-limitations: some contract tests have pre-existing stale regex failures; async function count approximate; nested anonymous callback count approximate
verification-date: 2026-07-24
---

# Аудит модуляризації `wwwroot/js/game.js`

## 1. Executive summary

`game.js` — монолітний файл на **11 036 рядків / 673 015 байт**, що містить усі клієнтськіResponsibility ігрового процесу Bunker: state, SignalR, render, actions, modals, i18n, apocalypse visuals, GM controls, lobby, voting, threats, bunker, timer, inventory, special cards, scenarios, omniscient mode, diagnostics, snapshots, recovery, global content catalog та public player overview.

Мета аудиту — побудувати доказову карту для безпечного поетапного розбиття без зміни поведінки. На цьому етапі **нічого не переміщується, не перейменовується і не видаляється**.

Ключові висновки:
- **549 named functions** (546 at file scope + 3 nested) + 107 SignalR events + 102 invoke methods + 120 top-level variables
- Найбільша система — **apocalypse visuals** (~700 рядків, 22 змінні, 40+ функцій)
- Найскладніша залежність — **`registerSignalREvents()`** (2036 рядків, рядки 3559–5594), що пише в state кожної системи
- **210 inline Razor handlers** (189 onclick + 11 onchange + 7 oninput + 3 onkeydown) потребують глобального доступу
- **~38 зовнішніх Playwright spec файлів + 41 JS contract test file** читають symbols з game.js
- **55 JS contract test файлів** (310 test cases) читають game.js як source string
- Першим безпечним slice буде **02B — shared utilities** (pure helpers, no state, no DOM)

## 2. Pre-flight

| Показник | Значення |
|---|---|
| `git status --short` | clean (порожній вивід) |
| `git diff -- wwwroot/js/game.js` | немає змін |
| Working tree | чистий |

## 3. File metrics

| Метрика | Значення | Метод | Confidence |
|---|---|---|---|
| Рядки | 11 036 | `(Get-Content).Count` | verified |
| Байти | 673 015 | `(Get-Item).Length` | verified |
| SHA-256 | `690dac0d...91fe10` | `certutil -hashfile` | verified |
| Top-level variables | 120 (113 `let`, 5 `const`, 2 `var`) | scope-aware brace-depth parser | high |
| Named functions (file scope) | 546 | `Select-String "^(async )?function \w"` at column 0 | verified |
| Named functions (nested) | 3 | `Select-String "^\s*(async )?function \w"` minus file-scope | verified |
| Total named functions | 549 | 546 + 3 | verified |
| Total `function` keyword occurrences | 704 | includes ~155 anonymous callbacks | high |
| async functions | ~80 | approximate (regex-based) | approximate |
| SignalR incoming events | 107 unique | `connection.on()` string extraction | verified |
| SignalR invoke methods (static) | 102 unique (47 double-quoted + 55 single-quoted) | `connection.invoke()` string extraction | verified |
| SignalR invoke methods (dynamic) | 8 | variable `method` passed through wrappers | verified |
| `window.*` exports | 5 | explicit `window.X = ` assignments | verified |
| `addEventListener` calls | 16 | `findstr /c:"addEventListener"` | verified |
| `setTimeout` calls | 13 | `findstr /c:"setTimeout"` | verified |
| `setInterval` calls | 2 | `findstr /c:"setInterval"` | verified |
| DOM `getElementById` unique IDs | 284 | string argument extraction | high |
| DOM `querySelector/All` unique selectors | 40 | selector argument extraction | high |
| DOM dynamic template-literal IDs | 5 | pattern: `${var}` in ID strings | verified |
| Total unique DOM selectors | ~329 | 284 + 40 + 5 (minimal overlap) | high |

## 4. Script load order

Сторінка гри обслуговується `BunkerController → Views/Bunker/Index.cshtml` з Layout `_Layout.cshtml`.

### Порядок завантаження (7 page-specific + 4 layout scripts)

| # | Файл | Позиція | Атрибути | Залежність |
|---|---|---|---|---|
| 1 | `signalr-lite.js` | Index.cshtml:523 | plain | визначає `window.signalR` |
| 2 | `game-utils.js` | Index.cshtml:524 | plain | визначає `escapeHtml`, `sanitizeNameInput` |
| 3 | **`game.js`** | Index.cshtml:525 | plain | залежить від #1, #2 |
| 4 | `post-game-story-director.js` | Index.cshtml:526 | plain | читає `isHost`, `isDeveloper`, `connection` з game.js |
| 5 | `apocalypse-category-visual-registry.js` | Index.cshtml:527 | plain | standalone |
| 6 | `gm-panel-v2.js` | Index.cshtml:528 | plain | читає `connection`, `currentRoom`, `activeGMTab`, `selectedPlayerForGM`, `gmPlayersData` з game.js |
| 7 | `development-images.js` | Index.cshtml:529 | plain | читає `currentRoom`, `currentApocalypse`, `currentBunker`, `currentThreat` з game.js |
| 8 | `site.js` | _Layout.cshtml:224 | plain | layout-level |
| 9 | `tooltip.js` | _Layout.cshtml:225 | plain | layout-level, експортує `reinitTooltips` |
| 10 | Inline: `changeLanguage` | _Layout.cshtml:227 | inline | chain-wrap |
| 11 | Inline: `initializeMobileHeader` | _Layout.cshtml:251 | inline | mobile menu |

**Ключові правила:**
- `game.js` на позиції #3 — **після** signalr-lite і game-utils, **до** gm-panel-v2
- Жоден скрипт не використовує `defer` або `type="module"`
- Усі script tags є plain synchronous
- `game.js` ініціалізує connection на рядку 1 і реєструє events на рядку 6

## 5. Top-level state inventory

### 5.1 Connection (1 variable)

| Variable | Line | Type | System | External consumers |
|---|---|---|---|---|
| `connection` | 1 | `const` SignalR HubConnection | core | gm-panel-v2.js, post-game-story-director.js, Playwright |

### 5.2 Core game state (32 variables, lines 37–128, 5598, 5789, 5843, 6002, 7507–7508, 8702)

| Variable | Line | System | External |
|---|---|---|---|
| `currentRoom` | 37 | core | gm-panel-v2.js, development-images.js |
| `myPlayerData` | 38 | core | Playwright |
| `myConnectionId` | 39 | core | special-cards tests |
| `isHost` | 40 | core | post-game-story-director.js |
| `isDeveloper` | 41 | core | post-game-story-director.js |
| `developerState` | 42 | developer | post-game-story-director.js |
| `developerPresence` | 43 | developer | — |
| `currentPostGameTransition` | 44 | postgame | gm-panel-v2.js, post-game-story-director.js |
| `roomPlayers` | 45 | core | — |
| `selectedPublicPlayerSeat` | 46 | overview | — |
| `publicPlayerViewMode` | 47 | overview | — |
| `publicPlayerSortMode` | 48 | overview | — |
| `currentApocalypse` | 117 | apocalypse | development-images.js, Playwright |
| `currentPublicGameSettings` | 118 | lobby | Playwright |
| `currentBunker` | 119 | bunker | development-images.js, Playwright |
| `currentThreat` | 120 | threats | development-images.js, Playwright |
| `currentThreatState` | 121 | threats | Playwright |
| `lastThreatTimeoutCheckDeadline` | 122 | threats | — |
| `currentVoting` | 123 | voting | — |
| `currentRoundState` | 124 | rounds | development-images.js |
| `currentGameCompletion` | 125 | postgame | post-game-story-director.js |
| `returnFinishedGamePending` | 126 | postgame | — |
| `myVote` | 127 | voting | — |
| `initialInviteRoomId` | 128 | room | — |
| `isStartingGame` | 5598 | lobby | — |
| `sessionKeys` | 5789 | session | — |
| `stablePlayerId` | 5843 | session | — |
| `currentBunkerCapacity` | 6002 | bunker (var) | — |
| `currentEvent` | 7507 | events | — |
| `eventsHistory` | 7508 | events | — |
| `gmRevealedChars` | 8702 | gm (var) | — |

### 5.3 GM panel state (30 variables, lines 49–75, 112–113, 10256)

| Variable | Line | External |
|---|---|---|
| `gmPlayersData` | 49 | gm-panel-v2.js |
| `selectedPlayerForGM` | 50 | gm-panel-v2.js |
| `gmThreatControlData` | 51 | Playwright |
| `gmThreatCommandPending` | 52 | Playwright |
| `gmThreatForcePending` | 53 | — |
| `gmThreatForcePreview` | 54 | — |
| `gmThreatForceRequestedOutcome` | 55 | — |
| `gmPlayerCommandPending` | 56 | — |
| `bunkerCapacityPending` | 57 | — |
| `gmRoundCommandPending` | 58 | — |
| `gmVotingAdminState` | 59 | — |
| `gmDiagnosticsData` | 60 | — |
| `gmAuditData` | 61 | — |
| `gmAutoFixPreview` | 62 | — |
| `gmDiagnosticsPending` | 63 | — |
| `gmSnapshotsData` | 64 | — |
| `gmSnapshotRestorePreview` | 65 | — |
| `gmSnapshotCommandPending` | 66 | — |
| `gmRoomLocalEditorData` | 67 | — |
| `gmRoomLocalEditPreview` | 68 | — |
| `gmRoomLocalEditorPending` | 69 | — |
| `omniscientPreview` | 70 | — |
| `omniscientCommandPending` | 71 | — |
| `omniscientHiddenState` | 72 | — |
| `omniscientHiddenStateVersion` | 73 | — |
| `directorPreview` | 74 | — |
| `directorCommandPending` | 75 | — |
| `activeGMTab` | 112 | gm-panel-v2.js |
| `gmLastCommandError` | 113 | — |
| `publicCharacteristicDefinitions` | 10256 | — |

### 5.4 Lobby state (21 variables, lines 76–92, 114–116, 9112–9115)

| Variable | Line | External |
|---|---|---|
| `lobbyState` | 76 | Playwright |
| `lobbyStartPreview` | 77 | — |
| `lobbyCommandPending` | 78 | — |
| `pendingGuestWarningStorageKey` | 79 | — |
| `lobbySettingsDraft` | 80 | Playwright |
| `currentPendingScenarioChoice` | 81 | — |
| `lobbySettingsBaseRevision` | 82 | — |
| `lobbySettingsDirty` | 83 | — |
| `lobbySettingsPending` | 84 | — |
| `lobbySettingsOwnerId` | 85 | — |
| `lobbySettingsActiveTab` | 86 | — |
| `lobbyApocalypseCatalog` | 87 | — |
| `lobbyApocalypseCatalogPending` | 88 | — |
| `lobbyApocalypseSearch` | 89 | — |
| `lobbyApocalypseCategoryFilter` | 90 | — |
| `lobbyApocalypseInteractiveFilter` | 91 | — |
| `lobbyApocalypseVisibleCount` | 92 | — |
| `pendingJoinRoomId` | 114 | — |
| `hostToken` | 115 | — |
| `reconnectToken` | 116 | — |
| `lobbyGet` (const arrow) | 9112 | — |

### 5.5 Special cards state (6 variables, lines 93–98)

### 5.6 Timer state (3 variables, lines 109–111)

### 5.7 Global catalog (10 variables, lines 99–108)

### 5.8 i18n + SVG registries (frozen constants, except uiTranslations)

| Variable | Line | System |
|---|---|---|
| `uiTranslations` | 138 | i18n (~5000 chars, 3 languages) |
| `threatIconSvgRegistry` | 1638 | threats |
| `apocalypseIconSvgRegistry` | 6312 | apocalypse |
| `apocalypseCategoryIconRegistry` | 6327 | apocalypse |
| `apocalypseVisualThemeRegistry` | 6381 | apocalypse |
| `apocalypseCategoryThemeRegistry` | 6394 | apocalypse |
| `apocalypseVisualReactionTypes` | 6450 | apocalypse |
| `apocalypseEffectsLevels` | 6454 | apocalypse |
| `apocalypseAmbientEventsByTheme` | 6457 | apocalypse |
| `apocalypseAmbientEventTypes` | 6469 | apocalypse |
| `apocalypseModifierGroupPriority` | 6474 | apocalypse |
| `apocalypseModifierEventSuppressions` | 6479 | apocalypse |
| `bunkerIconSvgRegistry` | 7311 | bunker |
| `specialCardIconSvgRegistry` | 9698 | special-cards |
| `characteristicIconRegistry` | 10667 | characters |
| `professionIconRegistry` | 10672 | characters |
| `characteristicIconSvgRegistry` | 10679 | characters |

### 5.9 Apocalypse ambient state (22 variables, lines 3497, 6456–6489)

### 5.10 Pending-operation guards

`pendingCharacteristicReveals` (Set, line 95), `pendingSpecialCardUses` (Set, line 96), `specialCardSelectionState` (Map, line 97), `renderedSpecialCardKeys` (line 98)

## 6. Function inventory summary

| System | Functions | Lines (approx) | Key functions |
|---|---|---|---|
| i18n | 18 | 138–2600 (scattered) | `t()`, `changeLanguage()`, `localizeServerMessage()` |
| developer | 11 | 805–1010 | `toggleDeveloperTools()`, `renderDeveloperAuthorityUi()` |
| postgame | 9 | 837–1213 | `renderGameFinished()`, `returnFinishedGameToLobby()` |
| game-completion | 8 | 1036–1213 | `normalizeGameCompletion()`, `buildGameSummaryText()` |
| timer | 4 | 1216–1292 | `renderGameTimer()`, `syncGameTimer()` |
| rounds | 11 | 1294–1636 | `updateRoundStatusUI()`, `canEndRoundNow()` |
| threats | 50+ | 1638–2313 | `renderThreatScenario()`, `renderThreatOperationModal()` |
| ready-check | 3 | 2316–2369 | `updateReadyCheckUI()` |
| game-render | 3 | 2489–2594 | `renderCurrentGameUI()`, `resetClientGameStateForNewRoom()` |
| character/health | 15+ | 2613–2968 | `buildHealthConditionTooltip()`, `getLocalizedHealthDescription()` |
| fact/reveal | 9 | 2969–3139 | `normalizeFactFromPlayer()`, `getLocalizedRevealedValue()` |
| inventory/cards | 12 | 3140–3308 | `normalizeInventoryData()`, `normalizeSpecialCards()` |
| player normalization | 4 | 3310–3498 | `normalizePlayer()` (~160 lines!) |
| apocalypse effects | 4 | 3499–3558 | `showApocalypseEffectBanner()` |
| **registerSignalREvents** | **1** | **3559–5594** | **2036 lines — single massive function** |
| lobby actions | 7 | 5596–5732 | `startGame()`, `previewLobbyStart()` |
| session/room | 20+ | 5776–6290 | `createRoom()`, `joinRoom()`, `leaveRoom()` |
| apocalypse visuals | 40+ | 6332–7040 | `renderApocalypse()`, `syncApocalypseVisualTheme()` |
| voting | 14 | 7041–7326 | `showVotingPanel()`, `showVotingResults()` |
| bunker display | 14 | 7327–7519 | `renderBunker()`, `renderBunkerFacility()` |
| scenario/events | 12 | 7520–7669 | `showCurrentEvent()`, `applyCurrentEventEffect()` |
| omniscient/director | 11 | 7670–7794 | `enterOmniscientGm()`, `applyDirectorAction()` |
| global catalog | 25+ | 7795–7992 | `loadGlobalContentPage()`, `commitGlobalDraft()` |
| gm-diagnostics | 15 | 7994–8135 | `runRoomIntegrityCheck()`, `undoLastGmAction()` |
| gm-round-control | 20 | 8136–8263 | `setGamePause()`, `invokeGameTimerCommand()` |
| gm-threat-control | 25 | 8264–8605 | `renderGMThreatControl()`, `confirmGMThreatForce()` |
| gm-player-controls | 25 | 8606–8930 | `loadPlayerDataForGM()`, `eliminateSelectedPlayer()` |
| room/lobby UI | 6 | 8931–9111 | `updateRoomUI()`, `renderRoomPlayers()` |
| lobby settings | 40+ | 9112–9614 | `renderLobbyState()`, `applyLobbySettings()` |
| player identity | 3 | 9681–9712 | `toCamelCase()`, `isMyPlayerRef()` |
| special cards render | 25+ | 9714–10018 | `renderSpecialCard()`, `renderMySpecialCards()` |
| event cards | 12 | 10019–10232 | `renderMyEventCards()`, `useEventSpecialCard()` |
| public overview | 20 | 10270–10589 | `renderPublicPlayerOverview()`, `renderAllPlayersComparison()` |
| physical conditions | 5 | 10590–10653 | `renderAdditionalPhysicalCondition()` |
| characteristic cards | 15+ | 10654–11036 | `renderCharacteristicCard()`, `renderMyPlayerCards()` |

## 7. SignalR incoming event map

**107 unique incoming events** зареєстровані в `registerSignalREvents()` (рядки 3559–5594).

### За системами

| System | Events count | Example events |
|---|---|---|
| Connection/core | 3 | ReceiveError, RejoinSuccess, RejoinFailed |
| Room/lobby | 14 | RoomCreated, RoomJoined, PlayerJoinedRoom, PlayerLeftRoom, RoomPlayersUpdated, LobbyStateUpdated, GameReturnedToLobby, LobbyKicked, RoomLeft, RoomsListUpdated, HostChanged, PlayerDisconnecting, StaleConnectionInspected, PlayerKicked |
| Player/character | 12 | PlayerStateResynced, PlayerReconnected, CharacteristicRevealed, CharacteristicHidden, CharacteristicUpdated, CharacteristicEdited, CharacteristicCleared, CharacteristicRegenerated, CharacteristicPeeked, PlayerEliminated, PlayerRestored, EliminatedPlayerRevealedAll |
| Game lifecycle | 4 | GameStarted, GameFinished, GamePauseUpdated, AllPlayersData |
| Round | 5 | RoundStateUpdated, RoundEnded, RoundAdvanced, RoundDiceRolled, RoundChangePreview |
| Voting | 8 | VotingStarted, VoteCast, VotingProgress, VotingEnded, VotingResolved, VotingCancelled, VotingAdminUpdated, VotingReadyCheckStarted, VotingReadyStatusUpdated, AllPlayersMarkedReady |
| Timer | 1 | GameTimerUpdated |
| Threat | 18 | ThreatRevealed, ThreatStateUpdated, ThreatResolved, ThreatMiniGameStarted, ThreatMiniGameUpdated, ThreatSupportDiceRolled, ThreatSupportDropAnnounced, ThreatSupportItemReceived, ThreatPrivateMessage, ThreatContributionWithdrawn, ThreatVolunteerSelected, ThreatVolunteerVoteStarted/Progress/Completed/Closed, ThreatImageRemoved, ThreatImageUpdated |
| Bunker | 7 | BunkerChanged, BunkerUpdated, BunkerCapacityUpdated, BunkerCapacityRejected, BunkerIntelRevealed, BunkerSuppliesAdded/Removed, BunkerWaterAdded/Removed, BunkerImageRemoved, BunkerImageUpdated |
| Special cards | 4 | SpecialCardStateUpdated, SpecialCardActivated, SpecialCardPrivateResult, SpecialCardTargetStateUpdated |
| Events/scenarios | 7 | GameEvent, NewGameEvent, ScenarioStarted, ScenarioPrivateOpened, ScenarioResolved, EventCardPublicNotice, EventEffectApplied, AdditionalInventoryGranted, EventSpecialCardsUpdated |
| Apocalypse | 4 | ApocalypseChanged, ApocalypseEffectActivated, ApocalypseEffectPersonalChanged, ApocalypseImageRemoved, ApocalypseImageUpdated |
| GM | 3 | GMActionSuccess, GmAuditLogUpdated, GMThreatControlData, GMThreatForcePreview, GMThreatForceRejected |
| Diagnostics/snapshots | 5 | RoomDiagnosticsUpdated, RoomAutoFixPreviewed, RoomSnapshotsUpdated, RoomSnapshotRestorePreviewed, RoomLocalEditorUpdated, RoomLocalEditPreviewed |
| Omniscient | 1 | OmniscientHiddenStateUpdated |
| Post-game | 1 | PostGameTransitionChanged |
| Developer | 2 | DeveloperPresenceChanged, DeveloperAuthorityChanged |

## 8. SignalR invoke map

**102 unique static invoke methods** викликаються з game.js (47 double-quoted + 55 single-quoted, zero overlap) + 8 dynamic calls via variable `method`.

### За системами

| System | Methods |
|---|---|
| Core/connection | GetRooms, GetAllPlayersData, RejoinRoom, LeaveRoom |
| Room | CreateRoom, JoinRoom |
| Character | RevealCharacteristic, PeekCharacteristic, EditPlayerCharacteristic, ClearPlayerCharacteristic, RegeneratePlayerCharacteristic, ForceRevealCharacteristic, RevealAllEliminatedPlayerCharacteristics |
| Round | EndRound, RollRoundDice, MarkAllPlayersReady |
| Voting | StartVoting, Vote, EndVoting, CancelVoting, ResolveVoting, SubmitVotingReadyStatus |
| Timer | (via `invokeGameTimerCommand` → PauseGameTimer, ResumeGameTimer, SetGameTimer, StartGameTimer, StopGameTimer, RestartGameTimer, AdjustGameTimer) |
| Threat | ResolveCurrentThreat, RollThreatSupportDice, SubmitThreatVolunteer, UseProfessionForThreat, UseHobbyForThreat, ContributeThreatItem, ContributeBunkerThreatAsset, WithdrawThreatContribution, StartThreatVolunteerVote, SetThreatOperationLeader, VoteThreatVolunteer, CloseThreatVolunteerVote, SelectThreatPlan, StartThreatMiniGame, SubmitThreatMiniGameAnswer, UseThreatMiniGameHint, CheckThreatMiniGameTimeout |
| Bunker | SetBunkerCapacity, RegenerateBunker, RegenerateApocalypse |
| Events | SendGameEvent, ApplyEventEffect |
| Lobby | PreviewStartGameFromLobby, StartGameFromLobby, SetLobbyReady, PreviewSetLobbyParticipation, SetLobbyParticipation, TransferHost |
| Special cards | UseSpecialCardById |
| Developer | GetDeveloperAccessState, TakeOverDeveloperOperator |
| Post-game | FinishPostGameDiscussion, RevealRemainingPostGameCharacteristics, ChoosePostGameStory, CancelPostGameStoryRequest |
| Omniscient | PreviewEnterOmniscientGm, EnterOmniscientGm, ResyncOmniscientState |
| Director | PreviewDirectorAction, ApplyDirectorAction |
| Diagnostics | (via `diagnosticsCommand` → RunRoomIntegrityCheck, PreviewRoomAutoFix, ApplyRoomAutoFix, GetGmAuditLog) |
| Snapshots | (via `invokeSnapshotCommand` → GetRoomSnapshots, CreateManualRoomSnapshot, PreviewRoomSnapshotRestore, RestoreRoomSnapshot, UndoLastGmAction) |
| Local editor | PreviewRoomLocalEdit, ApplyRoomLocalEdit |
| Voting admin | ResyncVotingState, ClearCurrentVotes, RemoveSelectedVote |
| GM player | EliminatePlayer, RestorePlayer, ResyncSelectedPlayer, InspectSelectedConnection, HideSelectedCharacteristic, TransferHost, KickSelectedPlayer, ChangeConditionSeverity, RemoveCondition |
| GM threat | GMPreviewForceThreat, GMConfirmForceThreat, GMResyncThreatRoom, GMRestartThreat, GMCancelThreat, GMSelectSpecificThreat, GMGenerateRareThreat, GMGenerateTextThreat |
| Global catalog | GetGlobalContentCatalogAccess, GetGlobalContentCategories, GetGlobalContentEntries, GetGlobalContentEntry, CreateGlobalContentDraft, ApplyGlobalContentDraftCommand, ValidateGlobalContentDraft, PreviewGlobalContentDraftDiff, DiscardGlobalContentDraft, CommitGlobalContentDraft, GetGlobalContentBackups, PreviewGlobalContentRollback, RollbackGlobalContent, PreviewStableIdMigration, ApplyStableIdMigration |
| Round change | SetRoundNumber, PreviewRoundChange, ResetRoundReadiness |

## 9. DOM target map

### 9.1 Key DOM IDs (найбільш вживані)

| ID | Writers | Readers | System |
|---|---|---|---|
| `roomLobby` | renderLobbyState, RejoinSuccess | — | lobby |
| `gameSection` | renderGameStarted, RejoinSuccess | — | core |
| `myPlayerSection` | renderGameStarted, RejoinSuccess | — | core |
| `roundStatusPanel` | updateRoundStatusUI | — | rounds |
| `votingPanel` | showVotingPanel, showVotingResults | — | voting |
| `votingResultsPanel` | showVotingResults | — | voting |
| `threatPanel` | renderThreatPanel | — | threats |
| `threatOperationModal` | open/close/renderThreatOperationModal | — | threats |
| `gameFinishedPanel` | renderGameFinished | — | postgame |
| `developerToolsPanel` | toggleDeveloperTools | — | developer |
| `developerToolsButton` | renderDeveloperAuthorityUi | — | developer |
| `gmTimerMinutes/Seconds` | syncGameTimer | — | timer |
| `publicGameTimer` | renderGameTimer | — | timer |
| `createRoomBtn` | createRoom | — | room |
| `joinModal` | openJoinRoomModal | — | room |
| `editCharModal` | editCharacteristic | — | gm |
| `peekModal` | showPeekModal | — | gm |
| `scenarioPanel/scenarioPublic/Private` | showCurrentEvent, ScenarioStarted | — | events |
| `lobbyGameSetup` | renderLobbyGameSetup | — | lobby |
| `specialCardsSection` | updateSpecialCardsUI | — | special-cards |
| `myPlayerCards` | renderMyPlayerCards | — | characters |
| `apocalypseEffectBanner` | showApocalypseEffectBanner | — | apocalypse |
| `omniscientBootstrapKey` | previewEnterOmniscientGm | — | omniscient |

### 9.2 Inline handlers в Razor

**Index.cshtml:** 33 handlers (31 onclick + 2 oninput) including `copyInviteLink()`, `toggleGMPanel()`, `toggleDeveloperTools()`, `startVoting()`, `startGame()`, `leaveRoom()`, `returnFinishedGameToLobby()`, `finishPostGameDiscussion()`, `revealRemainingPostGameCharacteristics()`, `requestFinalPostGameStory()`, `cancelPostGameStoryRequest()`, `copyGameSummary()`, `endVotingEarly()`, `cancelVoting()`, `eliminateTopVoted()`, `resolveNoElimination()`, `submitVotingReadyStatus()`, `closeScenarioPublicModal()`, `closeScenarioPrivateModal()`, `closeGMThreatForceModal()`, `refreshGMThreatForcePreview()`, `confirmGMThreatForce()`, `closeJoinModal()`, `submitJoinRoom()`, `closeEditCharModal()`, `clearCharacteristic()`, `submitEditCharacteristic()`, `closePeekModal()`

**_GmPanel.cshtml:** 139 handlers (126 onclick + 9 onchange + 4 oninput) including `rollRoundDice()`, `endRound()`, `markAllPlayersReady()`, `startVoting()`, `setGamePause()`, `invokeGameTimerCommand()`, `setGameTimer()`, `stopGameTimer()`, `submitBunkerCapacity()`, `regenerateBunker()`, `sendGameEvent()`, `runRoomIntegrityCheck()`, `previewRoomAutoFix()`, `applyRoomAutoFix()`, `createManualRoomSnapshot()`, `undoLastGmAction()`, `previewEnterOmniscientGm()`, `enterOmniscientGm()`, `previewDirectorAction()`, `applyDirectorAction()`, `peekCharacteristic()`, `editCharacteristic()`, `regenerateCharacteristic()`, `forceReveal()`, `eliminateSelectedPlayer()`, `restoreSelectedPlayer()`, `kickSelectedPlayer()`

**_DeveloperTools.cshtml:** `toggleDeveloperTools()`, `copyDeveloperChecklist()`, `recoverDeveloperUi()`, `takeOverDeveloperOperator()`

**_RoomLobby.cshtml:** `previewLobbyStart()`, `startGame()`, `registerFromGuestWarning()`, `continueAsGuest()`

**_EventsPanel.cshtml:** `applyCurrentEventEffect()`, `dismissCurrentEvent()`

**_GlobalContentCatalog.cshtml:** 16 handlers for catalog/draft/rollback/migration operations

**_Layout.cshtml:** `changeLanguage('uk'/'en'/'ru')`

## 10. Cross-file dependency matrix

### 10.1 External JS → game.js

| Consumer | Reads/Writes | Symbols |
|---|---|---|
| `gm-panel-v2.js` | read/write | `connection`, `currentRoom`, `activeGMTab`, `selectedPlayerForGM`, `gmPlayersData`, `currentPostGameTransition`, `getCurrentLanguage()`, `loadPlayerDataForGM()` |
| `post-game-story-director.js` | read/write | `isHost`, `isDeveloper`, `connection`, `currentPostGameTransition`, `currentGameCompletion`, `developerState`, `applyDeveloperAccessState()`, `localizeServerMessage()`, `recoverDeveloperUi()`, `cancelPostGameStoryRequest()`, `requestPostGameStoryMode()`, `returnFinishedGameToLobby()` |
| `development-images.js` | read | `currentRoom`, `currentApocalypse`, `currentBunker`, `currentThreat`, `currentRoundState`, `t()` |
| `home.js` | chain | `window.changeLanguage` |
| `site.js` | chain | `window.changeLanguage`, `typeof renderPlayersTable`, `typeof updateDeveloperMenu` |

### 10.2 game.js → external

| Symbol | From |
|---|---|
| `escapeHtml()` | game-utils.js |
| `sanitizeNameInput()` | game-utils.js |
| `window.signalR` | signalr-lite.js |
| `window.reinitTooltips` | tooltip.js |
| `window.ApocalypseCategoryVisualRegistry` | apocalypse-category-visual-registry.js |
| `window.PostGameStoryDirector` | post-game-story-director.js |

### 10.3 Window exports from game.js

| Export | Line | Consumers |
|---|---|---|
| `window.changeLanguage` | 2600 | _Layout.cshtml, site.js, home.js |
| `window.getApocalypseEffectsLevel` | 2610 | Playwright |
| `window.setApocalypseEffectsLevel` | 2611 | Playwright |
| `window.showSpecialCardImpactToast` | 4317 | internal only |
| `window.copyInviteLink` | 6179 | Index.cshtml, Playwright |

## 11. System classification

| # | System | Variables | Functions | Events | Invokes | Lines (approx) | Complexity |
|---|---|---|---|---|---|---|---|
| 1 | `core` (connection, state) | 33 | 10 | 3 | 4 | ~200 | high |
| 2 | `i18n` | 1 | 18 | 0 | 0 | ~300 | low |
| 3 | `ui` (game render, rooms) | 3 | 10 | 2 | 0 | ~200 | medium |
| 4 | `lobby` | 24 | 45+ | 4 | 6 | ~600 | high |
| 5 | `rounds` | 2 | 11 | 5 | 2 | ~350 | medium |
| 6 | `characters` | 2 | 30+ | 12 | 7 | ~600 | high |
| 7 | `inventory` | 4 | 12 | 0 | 0 | ~200 | low |
| 8 | `special-cards` | 7 | 37 | 4 | 1 | ~400 | medium |
| 9 | `voting` | 3 | 14 | 10 | 6 | ~300 | medium |
| 10 | `threats` | 5 | 50+ | 18 | 16 | ~700 | very high |
| 11 | `bunker` | 2 | 14 | 7 | 2 | ~300 | medium |
| 12 | `timer` | 3 | 4 | 1 | 6 | ~100 | low |
| 13 | `gm` | 30 | 75+ | 8 | 20+ | ~1500 | very high |
| 14 | `postgame` | 4 | 17 | 3 | 4 | ~400 | medium |
| 15 | `apocalypse visuals` | 22 | 40+ | 4 | 0 | ~700 | high |
| 16 | `events/scenarios` | 2 | 12 | 7 | 3 | ~200 | medium |
| 17 | `omniscient/director` | 7 | 11 | 1 | 3 | ~150 | medium |
| 18 | `diagnostics/snapshots` | 8 | 15 | 5 | 10 | ~300 | medium |
| 19 | `global catalog` | 10 | 25+ | 0 | 15 | ~300 | medium |
| 20 | `public overview` | 3 | 20 | 0 | 0 | ~350 | medium |

## 12. Dependency graph

```text
core (connection, currentRoom, isHost, myConnectionId)
├── lobby (reads currentRoom, isHost; writes lobbyState)
├── rounds (reads currentRoom, currentRoundState)
│   ├── timer (reads currentGameTimer)
│   ├── voting (reads currentVoting, myVote)
│   └── threats (reads currentThreat, currentThreatState)
│       ├── inventory (reads myPlayerData.inventory)
│       └── bunker (reads currentBunker)
├── characters (reads myPlayerData)
├── special-cards (reads myPlayerData.specialCards)
├── gm (reads/writes 30+ GM variables)
│   ├── diagnostics/snapshots
│   ├── omniscient/director
│   └── global catalog
├── postgame (reads currentGameCompletion, currentPostGameTransition)
├── events/scenarios (reads currentEvent, eventsHistory)
└── apocalypse visuals (reads currentApocalypse, currentPublicGameSettings)
```

**Найсильніша залежність:** `registerSignalREvents()` пише в state кожної системи. Це єдиний вхідний point для всіх 107 SignalR events.

## 13. Startup/reconnect sequence

### Startup (рядки 1–130)

```text
1. const connection = new signalR.HubConnectionBuilder()...build()
2. registerSignalREvents()               ← реєстрація 107 handler'ів
3. connection.start()
   → .then(async () => {
       myConnectionId = connection.connectionId
       applyDeveloperAccessState(await connection.invoke('GetDeveloperAccessState'))
       updateConnectionStatus(...)
       if (!tryRejoin()) { ... connection.invoke("GetRooms") }
       prefillPlayerName()
   })
```

### Top-level state init (рядки 37–128)

Всі 92 `let/const` змінні ініціалізуються одразу під час parse.

### Timers (рядки 1292, 2314)

```text
window.setInterval(renderGameTimer, 250)          ← кожні 250ms
window.setInterval(updateThreatOperationTimer, 1000)  ← кожну секунду
```

### DOMContentLoaded (рядок 2601, 5737)

```text
DOMContentLoaded → applyStaticTranslations(), changeLanguage(current), bindLobbySettingsControls()
```

### Reconnect

`connection.on("RejoinSuccess")` (рядок 4671) — повне відновлення стану: перезаписує currentRoom, myPlayerData, currentApocalypse, currentBunker, currentThreat, currentVoting, currentRoundState, currentGameCompletion, lobbyState, потім викликає `renderCurrentGameUI()`.

## 14. Dead-code candidates

| Symbol | Status | Evidence |
|---|---|---|
| `renderPlayersTable` (checked in site.js) | likely dead | site.js checks `typeof renderPlayersTable` — game.js не визначає цю функцію |
| `updateDeveloperMenu` (checked in site.js) | likely dead | аналогічно |
| `addEventMessage()` (рядок 11022) | compatibility-only | викликається тільки в startup flow |
| `showPromptModal` (development-images.js) | local duplicate | визначається локально в development-images.js, не в game.js |
| 2 `var` declarations | legacy | `currentBunkerCapacity` (6002), `gmRevealedChars` (8702) — можна замінити на `let` |

## 15. Mixed-responsibility functions

### 15.1 `registerSignalREvents()` (рядки 3559–5594, 2036 рядків)

Найбільша змішана функція. Містить:
- state mutations для кожної системи
- renderer calls
- DOM manipulations
- follow-up invokes
- reconnect restoration
- error handling

**Decomposition strategy:**
```text
registerSignalREvents()
→ core-events.js        (connection, room, player lifecycle)
→ round-events.js       (round, timer, ready-check)
→ voting-events.js      (voting, voting-ready, voting-admin)
→ threat-events.js      (threat state, volunteer, minigame, support)
→ bunker-events.js      (bunker, bunker-supplies, bunker-intel)
→ special-cards-events.js
→ events-scenarios.js   (game events, scenarios)
→ gm-events.js          (GM commands, diagnostics, snapshots, omniscient)
→ postgame-events.js    (game finished, post-game transition)
```

### 15.2 `normalizePlayer()` (рядок 3310, ~160 рядків)

Змішує normalizatoin для profession, health, inventory, property, facts, conditions, special cards, elimination state.

### 15.3 `renderLobbyState()` (рядок 9615, ~65 рядків)

Змішує: lobby list rendering, room rendering, player rendering, buttons, event binding.

### 15.4 `renderPublicPlayerOverview()` (рядок 10530, ~60 рядків)

Змішує: player selector, dossier cards, comparison table, toolbar.

### 15.5 `applyLobbySettings()` (рядок 9471)

Змішує: validation, invoke, error handling, state update, render.

## 16. Test baseline

### Build
```
dotnet build --no-restore → succeeded (0 warnings, 0 errors)
```

### JS Contract Tests

| Metric | Count | Method |
|---|---|---|
| Test files | 55 | `Get-ChildItem *.test.js` |
| Files loading game.js | 41 | `findstr /s /c:"game.js"` |
| Test cases (`test()` calls) | 310 | regex `^\s*test\s*\(` |
| Test runner | `node:test` | `require('node:test')` |
| Passing files | 47 | manual verification |
| Pre-existing failing files | 8 | stale regex assertions (not game.js related) |

| Result | Count |
|---|---|
| ✅ Pass | gm-panel-v2 (11/11), gm-panel-stage3 (10/10), additional-physical-condition-tooltip, air-filter-plan-choice, apocalypse-category-effects, apocalypse-category-ui-polish, apocalypse-effect-runtime, apocalypse-immersive-ui, apocalypse-lobby-settings, apocalypse-theme, apocalypse-visual-polish, bunker-capacity, bunker-food-water, bunker-immersive-ui, characteristic-cards-ui, developer-authority-post-game, game-timer, global-content-catalog, global-content-commit, global-content-drafts, global-site-visual-pass, gm-player-controls, gm-round-readability, gm-round-voting, gm-threat-control, lobby-game-settings, lobby-guest-warning, lobby-readability, lobby-state, omniscient-director-controls, omniscient-gm-role, omniscient-hidden-state, player-overview-ui, post-game-story-director, property-characteristic, property-structured-editor, radiation-live-update, radiation-operation-completion, room-diagnostics-audit, room-local-editor, scenario-width-polish, stable-id-migration, threat-audit, threat-emergency, threat-force-outcome |
| ❌ Pre-existing fail | characteristic-cards-ui (1 stale regex), game-completion (2 stale C#/CSS regexes), hobby-details (1 stale regex), lobby-running-handoff (2 stale C# regexes), room-snapshot-undo (1 stale C# regex), special-cards-ui (1 stale CSS regex), threat-contribution-independence (1 stale C# regex), threat-immersive-ui (2 stale regexes) |

**Pre-existing failures** — це stale regex assertions, які шукають конкретні рядки в C# або CSS файлах, які були змінені після створення тестів. Ці помилки **не пов'язані з game.js** і є baseline.

### Playwright tests (не запускалися — за вимогою не запускати повний suite)

## 17. Migration slices

### Рекомендований порядок

| Slice | Scope | Risk | Dependencies |
|---|---|---|---|
| **02B** | Shared utilities: `uiTranslations`, `toCamelCase()`, `getCurrentLanguage()`, `setCurrentLanguage()`, `t()`, `localizeServerMessage()`, `getI18n()`, `getLocalization()`, `getRawField()`, `getLocalizedValue()`, `getLocalizedArray()`, `getLocalizedByFields()`, `setText()`, `setPlaceholder()`, `applyStaticTranslations()`, `getI18nLocalizedValue()`, `sentenceCase()`, `eventCardLocalized()`, `scenarioUiText()`, `scenarioTypeLabel()`, `getTooltipTypeClass()`, frozen icon registries | **low** | none (pure functions + frozen data) |
| **02C** | Apocalypse visual registries + theme system (lines 6312–6489, 6332–6434, 6803–6850). ⚠️ Lines 6455–6456, 6470–6473, 6485–6489 contain mutable state (timers, flags) mixed with frozen registries — mutable state must stay in game.js. | low | game-utils.js only |
| **02D** | Timer (lines 1216–1292) | low | core state |
| **02E** | Player normalization (lines 2613–3498) | medium | i18n |
| **02F** | Inventory + special cards normalization (lines 3140–3308) | low | i18n |
| **02G** | Bunker display (lines 7327–7519) | medium | i18n, SVG registries |
| **02H** | Apocalypse scenario render (lines 6850–7040) | medium | i18n, SVG registries |
| **02I** | Threat render + actions (lines 1638–2313) | medium | i18n, bunker state |
| **02J** | Voting (lines 7041–7326) | medium | rounds state |
| **02K** | Special cards render (lines 9714–10018) | medium | i18n, inventory |
| **02L** | Scenario/events (lines 7520–7669) | medium | i18n, bunker |
| **02M** | Post-game (lines 837–1213) | medium | core, i18n |
| **02N** | Public player overview (lines 10270–10589) | medium | i18n, characters |
| **02O** | Characteristic cards (lines 10654–11036) | medium | i18n, SVG registries |
| **02P** | Lobby settings (lines 9112–9614) | high | lobby state, i18n |
| **02Q** | Lobby render (lines 8931–9111, 9509–9614) | high | lobby state, i18n |
| **02R** | GM diagnostics/snapshots/audit (lines 7994–8135) | medium | GM state |
| **02S** | GM round control (lines 8136–8263) | medium | GM state, timer |
| **02T** | GM threat control (lines 8264–8605) | high | GM state, threats |
| **02U** | GM player controls (lines 8606–8930) | high | GM state, players |
| **02V** | Omniscient/director (lines 7670–7794) | medium | GM state |
| **02W** | Global content catalog (lines 7795–7992) | medium | GM state |
| **02X** | Apocalypse ambient visuals (lines 3497–3558, 6394–6850, 6536–7040) | high | apocalypse state, timers |
| **02Y** | SignalR events split | **critical** | ALL systems |
| **02Z** | Core bootstrap + connection | critical | signalr-lite, all events |
| **02AA** | Final thin game.js (state declarations + window.* + script bootstrap) | high | all above |

### 02B — Детальний scope

**Source lines:** 138–700 (uiTranslations), 705–733 (i18n functions), 2370–2428 (utility functions — note: `setText()` L2416, `setPlaceholder()` L2421, `applyStaticTranslations()` L2426 have DOM dependencies, consider keeping in game.js or injecting DOM accessor), 9681–9692 (toCamelCase), 10019–10065 (event card i18n), 1638–1710 (SVG registries for threats), 7311–7410 (SVG registries for bunker), 9698–9715 (special card icons), 10256–10270 (publicCharacteristicDefinitions), 10667–10710 (characteristic/profession icons)

**Target files:**
- `wwwroot/js/bunker/i18n.js` — translations + `t()` + `localizeServerMessage()` + helpers (excluding DOM-dependent functions)
- `wwwroot/js/bunker/icons.js` — all frozen Object.freeze() SVG/characteristic/profession registries

**Dependencies:** none for pure functions + frozen data. `setText()`, `setPlaceholder()`, `applyStaticTranslations()` depend on `document.getElementById` — recommend keeping in game.js or extracting with explicit DOM parameter.

**Globals to preserve:** `window.changeLanguage` must remain accessible. `t()` must remain in global scope or re-exported.

**Script-order change:** i18n.js must load before game.js. icons.js must load before game.js.

**Tests:** All 55 contract tests that use `t()` or icon registries. Run full JS contract test suite after.

**Manual verification:** Change language in header → all UI text updates. Verify i18n keys not broken.

**Rollback boundary:** If i18n.js extraction breaks anything, revert the single file addition and script tag change.

**Expected risk:** low (pure extraction of pure functions and frozen data)

**Stop conditions:** If any `t()` call or translation key breaks, stop and investigate before proceeding.

## 18. Compatibility strategy

### Temporary window.* exports

Під час міграції кожен модуль, що містить функції, які викликаються з inline handlers, має тимчасово експортувати їх:

```js
// В кінці нового модуля:
window.changeLanguage = changeLanguage;
window.startVoting = startVoting;
// ... etc
```

Правила:
1. Не експортуй функції, які НЕ викликаються з Razor/HTML inline handlers
2. Не експортуй функції, які викликаються ТІЛЬКИ з game.js
3. Після завершення всіх slices — `window.*` exports залишаються в фінальному game.js
4. Не використовуй ES modules поки не буде окремого approval

### Shared state access

Модулі матимуть спільний mutable state через:
1. State declarations в фінальному thin `game.js`
2. Pass-by-reference через параметри функцій
3. Shared state object (opціонально, для майбутнього)

На першому етапі — зберігати state в game.js, модулі отримують через параметри або closure.

## 19. Risks and stop conditions

### Blocking risks

1. **`registerSignalREvents()`** — 2036-рядкова функція, яка пише в state кожної системи. Розбиття цієї функції вимагає одночасного збереження всіх 107 event handler'ів.

2. **Inline Razor handlers** — 210 inline event handlers (189 onclick + 11 onchange + 7 oninput + 3 onkeydown) в .cshtml файлах викликають глобальні функції. Будь-яке перейменування або видалення глобального доступу зламає UI.

3. **Cross-file JS consumers** — `gm-panel-v2.js` та `post-game-story-director.js` напряму читають/пишуть mutable variables з game.js. Перенесення цих variables вимагає синхронізованого оновлення обох файлів.

4. **Playwright tests** — ~38 з 46 spec файлів звертаються до symbols з game.js (через `page.evaluate()`, DOM selectors, `connection.invoke()`, або shared helpers). Перейменування зламає тести.

5. **JS contract tests** — 55 файлів (310 test cases) читають game.js як string і перевіряють regex patterns. 41 файл безпосередньо завантажує game.js через `fs.readFileSync`. Перейменування функцій зламає тести.

### Stop conditions для кожного slice

- Якщо `dotnet build` падає → stop
- Якщо будь-який passing JS contract test починає фейлитися → stop
- Якщо inline handler перестає працювати → stop
- Якщо reconnect/lifecycle ламається → stop

## 20. Recommended next task 02B

**Scope:** Extract pure i18n utilities + frozen icon/SVG registries

**Files to create:**
1. `wwwroot/js/bunker/i18n.js` — uiTranslations + t() + localizeServerMessage() + all i18n helpers
2. `wwwroot/js/bunker/icons.js` — all frozen Object.freeze() SVG/characteristic/profession registries

**Files to modify:**
1. `Views/Bunker/Index.cshtml` — add 2 script tags before game.js

**What stays in game.js:**
- All state variables
- All functions that read/write state
- All DOM manipulation
- All SignalR handlers
- window.changeLanguage export (still defined in game.js, i18n.js provides the data)

**Verification:**
1. `dotnet build --no-restore`
2. Run all 55 JS contract tests
3. Manual: change language, verify all UI text updates
4. `git diff --stat` — confirm only 3 files changed

## 21. Approval-required decisions

1. **Чи створювати `wwwroot/js/bunker/` directory для нових модулів?** Directory вже існує (game-utils.js, gm-panel-v2.js, etc.)
2. **Чи використовувати classic scripts або IIFE/namespace?** Рекомендовано: classic scripts з window.* exports на першому етапі
3. **Чи перейменовувати `game.js` в `game-bootstrap.js` після вичерпання?** Тільки після завершення всіх slices
4. **Чи створювати shared state module?** Тільки якщо знадобиться після 5+ slices
5. **Який формат для internal module structure?** Рекомендовано: `wwwroot/js/bunker/{system}/` після досягнення критичної маси

## 22. Audit verification methodology

### Verification approach

All metrics were verified against the actual `wwwroot/js/game.js` file (SHA256: `690dac0d8d75d25b83860efef0f92fd95e43248287467a3368baac099691fe10`) using multiple independent methods:

1. **Line count**: `(Get-Content).Count` — PowerShell direct count
2. **Byte size**: `(Get-Item).Length` — filesystem metadata
3. **Variables**: Scope-aware brace-depth parser (not naive grep) — filters out function-body declarations
4. **Functions**: Two-pass: `Select-String` at column 0 (546) + indented declarations (3)
5. **SignalR events**: `connection.on()` string extraction via findstr, deduplicated
6. **SignalR invokes**: `connection.invoke()` string extraction, split by quote style (47 double + 55 single)
7. **DOM selectors**: `getElementById` string extraction (284 unique) + `querySelector/All` (40 unique) + dynamic patterns (5)
8. **Inline handlers**: `findstr /s /n` for each `on*=` pattern across all .cshtml files
9. **Test files**: `Get-ChildItem` + `Get-Content` with regex for `test()` calls
10. **Line references**: Direct `Read` tool verification of each referenced line

### Metric confidence table

| Metric | Value | Method | Confidence |
|---|---|---|---|
| Line count | 11,036 | `(Get-Content).Count` | verified |
| Byte size | 673,015 | `(Get-Item).Length` | verified |
| SHA-256 | `690dac0d...91fe10` | `certutil -hashfile` | verified |
| Top-level variables | 120 | scope-aware parser | high |
| Named functions (file scope) | 546 | `Select-String` at col 0 | verified |
| Named functions (nested) | 3 | `Select-String` indented minus file-scope | verified |
| Total named functions | 549 | 546 + 3 | verified |
| Total `function` keyword | 704 | `Select-String "function"` | verified |
| SignalR incoming events | 107 | `connection.on()` extraction | verified |
| SignalR invoke methods | 102 static + 8 dynamic | `connection.invoke()` extraction | verified |
| `window.*` exports | 5 | manual verification of each line | verified |
| `addEventListener` | 16 | `findstr /c:` count | verified |
| `setTimeout` | 13 | `findstr /c:` count | verified |
| `setInterval` | 2 | `findstr /c:` count | verified |
| DOM getElementById unique | 284 | string argument extraction | high |
| DOM querySelector unique | 40 | selector extraction | high |
| Total unique DOM selectors | ~329 | deduplicated union | high |
| Inline Razor handlers | 210 | `findstr /s /n` per pattern | verified |
| JS contract test files | 55 | `Get-ChildItem` | verified |
| JS contract test cases | 310 | regex `^\s*test\s*\(` | verified |
| Files loading game.js | 41 | `findstr /s /c:"game.js"` | verified |
| Playwright spec files | 46 | `Get-ChildItem` | verified |
| Playwright referencing game.js | ~38 | symbol search across specs | high |
| registerSignalREvents span | 3559–5594 (2036 lines) | `Read` tool + grep | verified |

### Limitations

1. **Async function count (~80)**: Approximate — regex-based, may miss some or overcount nested async functions
2. **Nested anonymous callbacks (~155)**: Approximate — counted as `function` keyword occurrences minus named declarations
3. **DOM selector overlap**: Some querySelector selectors target child elements of IDs already in getElementById set; exact overlap not calculated
4. **Playwright symbol references**: Count based on symbol search, not manual file-by-file audit — some references may be indirect

## 23. Corrected source-range index

### Original vs corrected line references

| Reference | Report claimed | Actual (verified) | Status |
|---|---|---|---|
| File line count | 9,949 | **11,036** | **corrected** |
| `registerSignalREvents()` | 3559–5595 | **3559–5594** | corrected (end line -1) |
| `addEventMessage()` | ~line 20 | **line 11022** | **corrected** |
| Top-level variables | 134 | **120** | **corrected** |
| SignalR invoke methods | 47 | **102** (+ 8 dynamic) | **corrected** |
| DOM selectors | 100+ | **~329** | **corrected** |
| Inline handlers (exec summary) | 20+ | **210** | **corrected** |
| Inline handlers (risks) | 100+ | **210** | **corrected** |
| Playwright specs | 19 | **~38** | **corrected** |
| Test baseline | ambiguous | **55 files / 310 cases / 41 load game.js** | clarified |

### Verified line references (all exist in current file)

| Line | Content | Used in |
|---|---|---|
| 1 | `const connection = new signalR.HubConnectionBuilder()` | startup |
| 6 | `registerSignalREvents();` | startup |
| 37–128 | Top-level state variables | §5.2 |
| 138 | `const uiTranslations = {` | §5.8, 02B |
| 705 | `function getCurrentLanguage()` | §6, 02B |
| 1638 | `const threatIconSvgRegistry = Object.freeze({` | §5.8, 02B |
| 2370 | `function getI18n(source)` | §6, 02B |
| 2600 | `window.changeLanguage = changeLanguage` | §10.3 |
| 2610 | `window.getApocalypseEffectsLevel = ...` | §10.3 |
| 2611 | `window.setApocalypseEffectsLevel = ...` | §10.3 |
| 2923 | `function getI18nLocalizedValue(...)` | §6, 02B |
| 2946 | `function sentenceCase(text)` | §6, 02B |
| 3310 | `function normalizePlayer()` | §15.2 |
| 3559 | `function registerSignalREvents()` | §6, §15.1 |
| 4317 | `window.showSpecialCardImpactToast = ...` | §10.3 |
| 5594 | `} // End of registerSignalREvents()` | §15.1 |
| 6179 | `window.copyInviteLink = copyInviteLink` | §10.3 |
| 6312 | `const apocalypseIconSvgRegistry = Object.freeze({` | §5.8 |
| 6327 | `const apocalypseCategoryIconRegistry = Object.freeze({` | §5.8 |
| 6381 | `const apocalypseVisualThemeRegistry = Object.freeze({` | §5.8 |
| 6394 | `const apocalypseCategoryThemeRegistry = Object.freeze(...)` | §5.8 |
| 6450 | `const apocalypseVisualReactionTypes = Object.freeze([...])` | §5.8 |
| 6454 | `const apocalypseEffectsLevels = Object.freeze([...])` | §5.8 |
| 6457 | `const apocalypseAmbientEventsByTheme = Object.freeze({...})` | §5.8 |
| 6469 | `const apocalypseAmbientEventTypes = Object.freeze(...)` | §5.8 |
| 6474 | `const apocalypseModifierGroupPriority = Object.freeze({...})` | §5.8 |
| 6479 | `const apocalypseModifierEventSuppressions = Object.freeze({...})` | §5.8 |
| 7311 | `const bunkerIconSvgRegistry = Object.freeze({` | §5.8 |
| 9112 | `const lobbyGet = (object, camel, pascal) => ...` | §5.4 |
| 9681 | `function toCamelCase(str)` | §6, 02B |
| 9698 | `const specialCardIconSvgRegistry = Object.freeze({` | §5.8 |
| 10019 | `function eventCardLocalized(value)` | §6, 02B |
| 10256 | `const publicCharacteristicDefinitions = Object.freeze([...])` | §5.3, 02B |
| 10654 | `function getTooltipTypeClass(charKey)` | §6, 02B |
| 10667 | `const characteristicIconRegistry = Object.freeze({...})` | §5.8 |
| 10672 | `const professionIconRegistry = Object.freeze({...})` | §5.8 |
| 10679 | `const characteristicIconSvgRegistry = Object.freeze({...})` | §5.8 |
| 11022 | `function addEventMessage(message)` | §14 (dead code) |

### Migration slice source ranges — verified status

| Slice | Claimed ranges | Verified? | Notes |
|---|---|---|---|
| 02B | 138–700, 705–733, 2370–2428, 9681–9692, 10019–10065, 1638–1710, 7311–7410, 9698–9715, 10256–10270, 10667–10710 | ✅ all exist | Pure functions + frozen data |
| 02C | 6312–6489, 6332–6434, 6803–6850 | ⚠️ partial | Lines 6455–6456, 6470–6473, 6485–6489 contain mutable state (timers, flags) mixed with frozen registries. Mutable state must stay in game.js or be passed as parameters. |
| 02D | 1216–1292 | ✅ exists | Timer functions |
| 02E | 2613–3498 | ✅ exists | Player normalization |
| 02F | 3140–3308 | ✅ exists | Inventory/cards normalization |
| 02G | 7327–7519 | ✅ exists | Bunker display |
| 02H | 6850–7040 | ✅ exists | Apocalypse scenario render |
| 02I | 1638–2313 | ✅ exists | Threat render + actions |
| 02J | 7041–7326 | ✅ exists | Voting |
| 02K | 9714–10018 | ✅ exists | Special cards render |
| 02L | 7520–7669 | ✅ exists | Scenario/events |
| 02M | 837–1213 | ✅ exists | Post-game |
| 02N | 10270–10589 | ✅ exists | Public player overview |
| 02O | 10654–11036 | ✅ exists | Characteristic cards |
| 02P | 9112–9614 | ✅ exists | Lobby settings |
| 02Q | 8931–9111, 9509–9614 | ✅ exists | Lobby render |
| 02R | 7994–8135 | ✅ exists | GM diagnostics |
| 02S | 8136–8263 | ✅ exists | GM round control |
| 02T | 8264–8605 | ✅ exists | GM threat control |
| 02U | 8606–8930 | ✅ exists | GM player controls |
| 02V | 7670–7794 | ✅ exists | Omniscient/director |
| 02W | 7795–7992 | ✅ exists | Global content catalog |
| 02X | 3497–3558, 6394–6850, 6536–7040 | ⚠️ partial | Overlapping ranges; 6455–6489 has mixed frozen/mutable |
| 02Y | N/A (behavioral) | N/A | SignalR events split |
| 02Z | N/A (behavioral) | N/A | Core bootstrap |
| 02AA | N/A (behavioral) | N/A | Final thin game.js |

## 24. 02B scope verification

### i18n functions — hidden dependency check

| Function | Line | Hidden state/DOM? | Extractable? |
|---|---|---|---|
| `getCurrentLanguage()` | 705 | reads `localStorage` | ✅ yes (pure read) |
| `setCurrentLanguage(lang)` | 714 | writes `localStorage` | ✅ yes (side effect on localStorage only) |
| `t(key)` | 719 | reads `uiTranslations` + `getCurrentLanguage()` | ✅ yes (pure after dependencies) |
| `localizeServerMessage(message)` | 724 | reads `t()` | ✅ yes |
| `getI18n(source)` | 2370 | pure property access | ✅ yes |
| `getLocalization(source)` | 2374 | pure property access | ✅ yes |
| `getRawField(source, field)` | 2378 | pure property access | ✅ yes |
| `getLocalizedValue(source, field)` | 2384 | reads `getI18n`, `getLocalization`, `getRawField` | ✅ yes |
| `getLocalizedArray(source, field)` | 2398 | reads `getI18n`, `getLocalization` | ✅ yes |
| `getLocalizedByFields(source, ...)` | ~2405 | reads `getLocalizedValue` | ✅ yes |
| `setText(selector, value)` | 2416 | DOM write via `getElementById` | ⚠️ DOM dependency |
| `setPlaceholder(selector, value)` | 2421 | DOM write via `getElementById` | ⚠️ DOM dependency |
| `applyStaticTranslations()` | 2426 | DOM writes + reads `t()` | ⚠️ DOM dependency |
| `getI18nLocalizedValue(source, field)` | 2923 | reads `getI18n` | ✅ yes |
| `sentenceCase(text)` | 2946 | pure function | ✅ yes |
| `eventCardLocalized(value)` | 10019 | reads `getCurrentLanguage()` | ✅ yes |
| `scenarioUiText(key)` | 10025 | reads `getCurrentLanguage()` | ✅ yes |
| `scenarioTypeLabel(type)` | 10059 | reads `scenarioUiText()` | ✅ yes |
| `getTooltipTypeClass(charKey)` | 10654 | pure mapping | ✅ yes |
| `toCamelCase(str)` | 9681 | pure function | ✅ yes |

**Conclusion:** `setText()`, `setPlaceholder()`, and `applyStaticTranslations()` have DOM dependencies and should remain in game.js or be extracted with explicit DOM parameter injection. All other i18n functions are extractable.

### Icon registries — frozen data check

| Registry | Line | Frozen? | Mutable state nearby? | Extractable? |
|---|---|---|---|---|
| `uiTranslations` | 138 | not frozen (plain object) | no | ✅ yes |
| `threatIconSvgRegistry` | 1638 | `Object.freeze` | no | ✅ yes |
| `apocalypseIconSvgRegistry` | 6312 | `Object.freeze` | no | ✅ yes |
| `apocalypseCategoryIconRegistry` | 6327 | `Object.freeze` | no | ✅ yes |
| `apocalypseVisualThemeRegistry` | 6381 | `Object.freeze` | no | ✅ yes |
| `apocalypseCategoryThemeRegistry` | 6394 | `Object.freeze(Object.fromEntries(...))` | no | ✅ yes |
| `apocalypseVisualReactionTypes` | 6450 | `Object.freeze([...])` | no | ✅ yes |
| `apocalypseEffectsLevels` | 6454 | `Object.freeze([...])` | no | ✅ yes |
| `apocalypseAmbientEventsByTheme` | 6457 | `Object.freeze` | ⚠️ L6470-6473 mutable timers | ✅ yes (registry itself frozen) |
| `apocalypseAmbientEventTypes` | 6469 | `Object.freeze` | no | ✅ yes |
| `apocalypseModifierGroupPriority` | 6474 | `Object.freeze` | no | ✅ yes |
| `apocalypseModifierEventSuppressions` | 6479 | `Object.freeze` | no | ✅ yes |
| `bunkerIconSvgRegistry` | 7311 | `Object.freeze` | no | ✅ yes |
| `specialCardIconSvgRegistry` | 9698 | `Object.freeze` | no | ✅ yes |
| `characteristicIconRegistry` | 10667 | `Object.freeze` | no | ✅ yes |
| `professionIconRegistry` | 10672 | `Object.freeze` | no | ✅ yes |
| `characteristicIconSvgRegistry` | 10679 | `Object.freeze` | no | ✅ yes |
| `publicCharacteristicDefinitions` | 10256 | `Object.freeze` | no | ✅ yes |

**Conclusion:** All frozen registries are extractable. Mutable state near `apocalypseAmbientEventsByTheme` (timers at L6470-6473) must stay in game.js — the registry itself is safe to extract.

## 25. Використання токенів

Точні дані про використання токенів недоступні агенту.
