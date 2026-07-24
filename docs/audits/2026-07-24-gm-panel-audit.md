# Аудит GM Panel — Bunker

- **Дата**: 2026-07-24
- **Режим**: Read-only audit
- **Модель/інструмент**: opencode / big-pickle
- **Статус**: Завершено
- **Scope**: Повний аудит UI, клієнт-серверних ланцюжків, стану, прав, життєвого циклу, UX та безпеки GM Panel у проєкті Bunker
- **Перевірки, які НЕ запускалися**: `dotnet build`, `dotnet test`, Playwright, запуск сервера, `git add`/`git commit`

---

## 1. Карта реалізації

### Архітектурні шари

GM Panel складається з **двох паралельних систем** — legacy (`game.js`) та v2 (`gm-panel-v2.js`). V2 є IIFE, який перезаписує `window.toggleGMPanel` та `window.switchGMTab`. Обидві системи використовують **однаковий DOM** (`_GmPanel.cshtml`).

| Функція / Секція | UI файл + елемент | JS handler / render | Hub method / event | Service / model / state | Permission source | Reconnect source |
|---|---|---|---|---|---|---|
| **Відкриття панелі** | `Index.cshtml:110` → `#gmPanelBtn` onclick | `gm-panel-v2.js:153` `toggleGMPanel()` (override) | — | — | `game.js:8988-8996` (isHost/isDeveloper/omniscientHiddenState) | — |
| **Стан панелі (v2)** | `_GmPanel.cshtml:14` `#gmPanel` | `gm-panel-v2.js:165` `refreshGmPanelV2State()` → `GetGmPanelState` | `GameHub.GmPanel.cs:9` `GetGmPanelState()` | `GmPanelStateBuilder.cs:14` `TryBuild()` → `GmPanelStateDto` | `GmPanelStateBuilder.cs:23-31` (isHost/isOmniscient/isDeveloper) | `gm-panel-v2.js:670` onreconnected |
| **Стан панелі (legacy)** | `_GmPanel.cshtml:60-62` `#gmGameStateSummary` | `game.js:8237` `renderGMPanelState()` — рендерить summary-картки | — | Дані з `roomPlayers`, `currentRoom`, `currentRoundState`, `currentThreat` | — | — |
| **Вкладки** | `_GmPanel.cshtml:35-44` кнопки `data-gm-tab-button` | `gm-panel-v2.js:125` `switchGMTab()` | — | — | `gm-panel-v2.js:59-69` `canShowTab()` — permission-based | — |
| **Рекомендована дія** | `_GmPanel.cshtml:46-49` `#gmRecommendedAction` | `gm-panel-v2.js:251` `renderRecommendedAction()` | — | Локальне обчислення на основі v2 state | — | — |
| **Раунд (state)** | `_GmPanel.cshtml:120-131` `#gmRoundSection` | `game.js:8237` (legacy renderGMPanelState) | `RoundStateUpdated` event | `room.CurrentRound`, `room.CurrentPhase` | `IsCallerHost()` / `HasGmCapability()` | `game.js:4162` RoundStateUpdated handler |
| **End round** | `_GmPanel.cshtml:143` `#endRoundBtn` onclick=`endRound()` | `game.js` → `connection.invoke('EndRound')` | `GameHub.GameMaster.cs:451` `EndRound()` | `Room.CurrentPhase`, `room.CurrentRoundReveals` | `IsCallerHost()` | — |
| **Roll dice** | `_GmPanel.cshtml:142` `#rollDiceBtn` onclick=`rollRoundDice()` | `game.js` → invoke `RollRoundDice` | `GameHub.GameMaster.cs:568` | Room state | `IsCallerHost()` | — |
| **Ready check / Mark all** | `_GmPanel.cshtml:144` `#startReadyCheckBtn` | `game.js` → `markAllPlayersReady()` | `GameHub.GameMaster.cs:718` `MarkAllPlayersReady()` | `Room.VotingReadyResponses` | `HasGmCapability(ManagePublicGameState)` | — |
| **Pause/Resume** | `_GmPanel.cshtml:138-139` | `game.js:8115` `setGamePause()` | `GameHub.GameMaster.cs:1330` `SetGamePaused()` | `Room.IsPaused`, `RoundVotingAdminService` | `HasGmCapability(ManagePublicGameState)` | — |
| **Таймер** | `_GmPanel.cshtml:167-194` `#gmGameTimerCard` | `game.js:8150-8201` (startGameTimer, stopGameTimer, etc.) | `GameHub.GameMaster.cs:1382-1446` (StartGameTimer..StopGameTimer) | `GameTimerState`, `GameTimerService` | `HasGmCapability(ManagePublicGameState)` + `RememberPlayerCommand` | — |
| **Manual round** | `_GmPanel.cshtml:151-161` `data-gm-advanced` | `game.js:8120` `previewManualRoundChange()` | `GameHub.GameMaster.cs:1359` `PreviewRoundChange()` + `SetRoundNumber()` | `RoundVotingAdminService.TryParseRound` | `HasGmCapability(ManagePublicGameState)` | — |
| **Reset readiness** | `_GmPanel.cshtml:162-166` `data-gm-advanced` | `game.js:8131` `resetRoundReadiness()` | `GameHub.GameMaster.cs:1511` `ResetRoundReadiness()` | `Room.VotingReadyResponses` | `HasGmCapability(ManagePublicGameState)` | — |
| **Voting admin** | `_GmPanel.cshtml:195-204` `data-gm-advanced` | `game.js:8135-8148` (clearCurrentVotes, removeSelectedVote, resyncVotingAdmin) | `GameHub.Voting.cs:429-523` | `Room.CurrentVoting` | `HasGmCapability(ManagePublicGameState)` | — |
| **Голосування (tab)** | `_GmPanel.cshtml:212-222` `#gmVotingV2Section` | `gm-panel-v2.js:338` `renderVoting()` | — | `gmPanelV2State.votingStatus` | `canShowTab('voting')` | `gm-panel-v2.js:664-665` liveEvents |
| **Загрози (tab)** | `_GmPanel.cshtml:224-246` `#gmThreatControlSection` | `game.js:8273` `renderGMThreatControl()` | `GameHub.GMThreats.cs` (GetGMThreatControlData, GMGenerate*, GMSelect*, etc.) | `gmThreatControlData` | `HasGmCapability(ManageThreats)` | — |
| **Threat emergency** | `_GmPanel.cshtml:237-244` `#gmThreatEmergencyBlock` | `game.js:8492-8579` (gmCancelThreat, gmRestartThreat, force preview/confirm) | `GameHub.GMThreats.cs:147-202` | Threat state + `fingerprint` | `canUseTechnicalTools` (hidden через `gm-panel-v2.js:287`) | — |
| **Гравці (tab)** | `_GmPanel.cshtml:248-264` `#gmPlayerSelectSection` + `#gmPlayerInfo` | `game.js` `loadPlayerDataForGM()`, `updateGMPlayerSelect()` | `GameHub.GameMaster.cs:159` `GetAllPlayersData()` | `gmPlayersData` | `canShowTab('players')` + `canManagePlayers` | — |
| **Player cards (v2 — BROKEN)** | MISSING: `#gmPlayerCardsV2` not in any Razor | `gm-panel-v2.js:355` `renderPlayerCards()` → `getElementById("gmPlayerCardsV2")` → **null → return** | — | — | — | — |
| **Вибір гравця (legacy)** | `_GmPanel.cshtml:258` `#gmPlayerSelect` | `gm-panel-v2.js:381` `selectPlayerImmediately()` → `loadPlayerDataForGM()` (legacy) | `GetAllPlayersData` + `GetPlayerPropertyEditor` | `gmPlayersData`, `selectedPlayerForGM` | — | — |
| **Characteristic actions** | `_GmPanel.cshtml:369-486` (11 characteristic blocks × 4 buttons) | `game.js` → `peekCharacteristic()`, `editCharacteristic()`, `regenerateCharacteristic()`, `forceReveal()` | `GameHub.GameMaster.cs:812,176,248,311,376` | Player characteristics | `HasGmCapability` (varies) | — |
| **Eliminate/Restore** | `_GmPanel.cshtml:276-287` | `game.js` → `eliminateSelectedPlayer()`, `restoreSelectedPlayer()` | `GameHub.GameMaster.cs:1230,1287` | Player state | `HasGmCapability(ManagePlayersWithoutHiddenData)` | — |
| **Kick player** | `_GmPanel.cshtml:355-366` `data-gm-advanced` (danger zone) | `game.js` → `kickSelectedPlayer()` | `GameHub.GameMaster.cs:1545` `KickPlayer()` | Player connection | `HasGmCapability(ManagePlayersWithoutHiddenData)` + `!IsHost(player)` check | — |
| **Transfer host** | `_GmPanel.cshtml:313-318` `data-gm-advanced` | `game.js` → `transferHostToSelectedPlayer()` | `GameHub.GameMaster.cs:1720` `TransferHost()` | `Room.HostPlayerId` | `HasGmCapability` | — |
| **Property editor** | `_GmPanel.cshtml:657-713` `<dialog>` | `gm-panel-v2.js:521-645` (openGmPropertyEditor, regenerate, save) | `GameHub.GmPanel.cs:93,124,145` (GetPlayerPropertyEditor, PreviewPlayerProperty, UpdatePlayerProperty) | `PropertyEditorDataDto` | `TryGetPropertyEditorContext` — `HasActiveRoomCapability(ManagePlayers)` OR `(IsHost && !IsSpectatorGm && !Omniscient)` | — |
| **Бункер / Апокаліпсис** | `_GmPanel.cshtml:489-512` `#gmBunkerScenarioSection` | `game.js` → `regenerateBunker()`, `regenerateApocalypse()`, `submitBunkerCapacity()`, add/remove supplies | `GameHub.GameMaster.cs:853,906,938,1040-1052` | `Room.Bunker`, `Room.Apocalypse` | `HasGmCapability(ManagePublicGameState)` | — |
| **Події (events)** | `_GmPanel.cshtml:514-580` `#gmEventsSection` | `game.js` → `sendGameEvent()`, `sendQuickEvent()` | `GameHub.GameMaster.cs:974` `SendGameEvent()` | `GameEventType` | `HasGmCapability(ManagePublicGameState)` | — |
| **Diagnostics** | `_GmPanel.cshtml:582-602` `#gmDiagnosticsSection` | `game.js:7948-7977` | `GameHub.Diagnostics.cs:9` `RunRoomIntegrityCheck()` | `gmDiagnosticsData` | `canUseTechnicalTools` | — |
| **Snapshots** | `_GmPanel.cshtml:603-614` `details` | `game.js:7984-8027` | `GameHub.Diagnostics.cs:86-136` | `gmSnapshotsData`, `gmSnapshotRestorePreview` | `CanRestoreSnapshots` | — |
| **Room local editor** | `_GmPanel.cshtml:615-631` `details` | `game.js:8029-8074` | `GameHub.RoomLocalEditor.cs:9-62` | `gmRoomLocalEditorData` | `canUseTechnicalTools` | — |
| **Omniscient bootstrap** | `_GmPanel.cshtml:632-639` `details#gmOmniscientMode` | `game.js:7612-7623` `previewEnterOmniscientGm()` / `enterOmniscientGm()` | `GameHub.OmniscientGm.cs:9,46` | `OmniscientGmPreviewDto` | `bootstrapKey` validation | — |
| **Audit log** | `_GmPanel.cshtml:640-653` `details#gmThreatAudit` | `game.js:8392` `renderUnifiedGmAudit()` | `GameHub.Diagnostics.cs:76` `GetGmAuditLog()` | `gmAuditData` + `gmThreatControlData.auditLog` | `hasGmCapability` | — |
| **Omniscient hidden (overview)** | `_GmPanel.cshtml:73-118` `#omniscientHiddenSection` | `game.js:7695` `renderOmniscientHiddenState()` | `GameHub.OmniscientGm.cs:82,94` | `omniscientHiddenState` | `canViewOmniscientData` | `game.js:3849` OmniscientHiddenStateUpdated |
| **Director controls** | `_GmPanel.cshtml:83-116` `details#omniscientDirectorControls` | `game.js:7645-7693` `buildDirectorRequest()`, `previewDirectorAction()`, `applyDirectorAction()` | `GameHub.Director.cs:13,49` | `DirectorActionRequestDto` | `IsOmniscientGm + UseDirectorPlayerControls` | — |
| **Developer tools** | `Index.cshtml:118-123` `#developerToolsButton` | `game.js:973` `toggleDeveloperTools()` | `GameHub.PostGameTransition.cs:25` | Developer authority | `isDeveloper` | — |

---

## 2. Поточна структура панелі

### Вкладки (Razor `_GmPanel.cshtml:35-44`, v2 IDs)

| Tab ID | Label | Контент секцій | Доступно ordinary host | Доступно omniscient GM | Доступно developer |
|---|---|---|---|---|---|
| `game` | Гра | `gmGameStateSection` (summary cards), `gmRoundSection` (round controls, timer, voting admin, readiness reset) | ✅ CanManageRounds | ❌ (permissions.CanManageRounds=false) | ✅ if isActiveOperator |
| `players` | Гравці | `gmPlayerSelectSection`, `gmPlayerInfo` (select, quick actions, characteristics, property editor) | ✅ CanManagePlayers | ❌ | ✅ |
| `voting` | Голосування | `gmVotingV2Section` (status cards, start/end/cancel buttons, non-voters) | ✅ CanManageVoting | ❌ | ✅ |
| `threats` | Загрози | `gmThreatControlSection` (current threat, specific controls, generate, emergency block) | ✅ CanManageThreats | ❌ | ✅ |
| `bunker` | Бункер | `gmBunkerScenarioSection` (capacity, regenerate, supplies) | ✅ CanManageBunker | ❌ | ✅ |
| `events` | Події | `gmEventsSection` (event form, quick events), `gmScenarioSection` (data-gm-advanced) | ✅ CanManageRounds | ❌ | ✅ |
| `technical` | Технічне | `gmDiagnosticsSection` (diagnostics, snapshots, local editor, omniscient bootstrap, audit) | ❌ CanUseTechnicalTools=false | ❌ | ✅ |
| `overview` | Огляд | `omniscientHiddenSection` (room summary, secret votes, director controls, hidden players) | ❌ | ✅ CanViewOmniscientData | ❌ |

### Simple/Advanced mode (`gm-panel-v2.js:145-151`)

- **Simple**: приховує всі елементи з `data-gm-advanced` (CSS rule `game.css:9051`). Прибирає: manual round, readiness reset, voting admin, threat-specific controls, scenario skip, player secondary/danger actions.
- **Advanced**: показує все.

### Primary / Secondary / Danger actions

- **Primary**: End round, Start timer, Force threat success/failure
- **Secondary**: Pause, Resume, Roll dice, Mark all ready, Generate threats, Resync
- **Danger**: Cancel threat, Restart threat, Kick player, Stop timer, Snapshot restore, Undo

---

## 3. Знайдені проблеми

### Critical

**C1. Відсутній контейнер `#gmPlayerCardsV2` — v2 player cards не рендеряться**

- **Доказ**: `gm-panel-v2.js:356` `getElementById("gmPlayerCardsV2")` повертає `null`, функція `renderPlayerCards()` нічого не робить. В `_GmPanel.cshtml` та `Index.cshtml` елемент з id `gmPlayerCardsV2` не існує (Grep по `*.cshtml` — 0 результатів).
- **Наслідок**: V2 player cards ніколи не відображаються. Гравці бачать лише legacy `#gmPlayerSelect` dropdown + `#gmPlayerInfo` секцію.
- **Мінімальне виправлення**: Додати `<div id="gmPlayerCardsV2" class="gm-player-cards-v2"></div>` до `_GmPanel.cshtml` перед `#gmPlayerSelectSection`.
- **Ризик регресії**: Низький — просто створює порожній контейнер.

### High

**H1. Подвійний рендер `#gmGameStateSummary`**

- **Доказ**: `gm-panel-v2.js:323` `renderOverview()` рендерить `gmGameStateSummary` через `replaceChildren`. `game.js:8237` `renderGMPanelState()` також рендерить `gmGameStateSummary` через `innerHTML`. Обидві функції викликаються під час оновлення.
- **Наслідок**: V2 перезаписує legacy-вміст кожного разу, або навпаки. Це створює race condition та мерехтіння.
- **Мінімальне виправлення**: В `renderGMPanelState()` (game.js:8257) пропустити рендер `gmGameStateSummary`, якщо v2 state активний.
- **Ризик**: Середній — потрібно перевірити, що v2 state завжди наявний при відкритій панелі.

**H2. Подвійна система вкладок (legacy vs v2)**

- **Доказ**: `game.js:8214` `switchGMTab()` використовує legacy tab IDs: `['state', 'round', 'threat', 'content', 'diagnostics', 'omniscient']`. `gm-panel-v2.js:125` перезаписує `window.switchGMTab` з v2 IDs: `['game', 'players', 'voting', ...]`. Але Razor шаблон використовує v2 IDs (`data-gm-tab-button="game"`, `data-gm-tab="game"`).
- **Наслідок**: Якщо v2 JS завантажиться пізніше game.js, існує вікно, коли legacy `switchGMTab` буде викликано з Razor onclick → отримає `'game'` → legacy не визнає цей ID → `activeGMTab = 'state'`. Після завантаження v2, `switchGMTab` перезаписується, але перший виклик міг залишити неправильний стан.
- **Мінімальне виправлення**: Видалити legacy `switchGMTab` та `renderGMTabsVisibility` з game.js. Залишити лише v2 реалізацію.
- **Ризик**: Середній — потрібно знайти всі виклики legacy функцій.

**H3. V2 панель глибоко залежить від legacy state (`gmPlayersData`, `selectedPlayerForGM`, `isHost`)**

- **Доказ**: `gm-panel-v2.js:384-390` `selectPlayerImmediately()` шукає в `gmPlayersData` (game.js:49), встановлює `selectedPlayerForGM` (game.js:50), та викликає `loadPlayerDataForGM()` (game.js). `gm-panel-v2.js:46` звертається до `currentRoom`.
- **Наслідок**: V2 панель не може функціонувати без legacy state. Будь-який рефакторинг game.js може зламати v2.
- **Мінімальне виправлення**: Перенести `gmPlayersData` та `selectedPlayerForGM` до v2 модуля, або створити shared state object.
- **Ризик**: Високий — потребує координації між двома файлами.

### Medium

**M1. `toggleGMPanel` legacy в game.js:7930 — мертвий код**

- **Доказ**: `gm-panel-v2.js:153` перезаписує `window.toggleGMPanel`. Legacy функція ніколи не викликається після завантаження v2.
- **Наслідок**: ~17 рядків мертвого коду + 7 непотрібних `connection.invoke()` при відкритті панелі.
- **Мінімальне виправлення**: Видалити legacy `toggleGMPanel` з game.js.
- **Ризик**: Низький.

**M2. Загрози: дублювання emergency controls між v2 tabs та legacy render**

- **Доказ**: `_GmPanel.cshtml:237-244` `#gmThreatEmergencyBlock` рендериться в tab `threats`. `game.js:8273` `renderGMThreatControl()` також оновлює ті самі елементи (`#gmThreatResync`, `#gmThreatReset`, `#gmThreatAbort`, `#gmThreatForceSuccess`, `#gmThreatForceFailure`). V2 не має свого render для загроз.
- **Наслідок**: Візуальне оновлення загроз йде виключно через legacy renderGMThreatControl, що не залежить від v2 state.
- **Мінімальне виправлення**: Перенести `renderGMThreatControl` до v2 або створити v2 обгортку.
- **Ризик**: Середній.

**M3. Немає `data-gm-advanced` для omniscient bootstrap entry — visible для будь-якого host**

- **Доказ**: `_GmPanel.cshtml:632-639` `<details id="gmOmniscientMode">` НЕ має `data-gm-advanced`. Але `gm-panel-v2.js:289-292` ховає `.gm-player-danger` та `.gm-round-danger-zone` для non-technical, але НЕ ховає `#gmOmniscientMode`.
- **Наслідок**: Будь-який ordinary host бачить секцію входу в omniscient mode, хоча сервер заблокує цю дію (bootstrap key validation).
- **Мінімальне виправлення**: Додати `data-gm-advanced` до `#gmOmniscientMode`, або ховати через JS для non-technical.
- **Ризик**: Низький.

**M4. `#gmPanelBtn` visibility check використовує `omniscientHiddenState` замість permission**

- **Доказ**: `game.js:8990` `if (isHost || isDeveloper || !!omniscientHiddenState)`. Але `omniscientHiddenState` встановлюється ТІЛЬКИ після `OmniscientHiddenStateUpdated` event. Якщо event ще не прийшов (затримка), кнопка буде прихована навіть для omniscient GM.
- **Наслідок**: Тимчасова невидимість кнопки після входу в omniscient mode.
- **Мінімальне виправлення**: Додати check для `currentRoom?.omniscientGm` або `isOmniscientGm` flag.
- **Ризик**: Низький.

### Low

**L1. `console.log` debug statements в game.js**

- **Доказ**: `game.js:8992` `console.log("[updateRoomUI] GM Panel button shown for host")`, `game.js:9038` `console.log("[updateGMSections] ...")`, `game.js:4529` `console.log("GM action success:", info)` та десятки інших.
- **Наслідок**: Debug output в production.
- **Мінімальне виправлення**: Видалити або загорнути за `if (debug)`.
- **Ризик**: Низький.

**L2. `#gmPlayerSelect` legacy dropdown залишається при наявності v2 player cards**

- **Доказ**: `_GmPanel.cshtml:258-263` `#gmPlayerSelect` та `#gmPlayerCardsV2` (якщо буде створений) — обидва будуть на сторінці.
- **Наслідок**: Дублювання вибору гравця (dropdown + cards).
- **Мінімальне виправлення**: Приховати `#gmPlayerSelectSection` для v2, або використовувати лише cards.
- **Ризик**: Низький.

**L3. Відсутність aria-label для кнопок characteristic actions**

- **Доказ**: `_GmPanel.cshtml:374-378` — кнопки використовують emoji в `title`, але не `aria-label`.
- **Наслідок**: Скрінрідери не розпізнають призначення кнопок.
- **Мінімальне виправлення**: Додати `aria-label` до кожної кнопки.
- **Ризик**: Низький.

---

## 4. Дублювання та неузгодженість

### Дубльовані buttons/handlers

1. **`toggleGMPanel`**: `game.js:7930` (legacy) та `gm-panel-v2.js:153` (override). V2 перезаписує, legacy — мертвий код.

2. **`switchGMTab`**: `game.js:8214` (legacy tabs: state/round/threat/content/diagnostics/omniscient) та `gm-panel-v2.js:125` (v2 tabs: game/players/voting/threats/bunker/events/technical/overview). V2 override, але Razor використовує v2 tab IDs.

3. **`renderGMPanelState` (game.js:8237) vs `renderOverview` (gm-panel-v2.js:323)**: Обидві рендерять `#gmGameStateSummary`.

4. **Emergency threat buttons**: `#gmThreatResync` в `_GmPanel.cshtml:239` викликає `gmResyncThreatRoom()`, але також `#gmThreatEmergencyBlock` містить `onclick="gmResyncThreatRoom()"`. Обидва викликають ту саму функцію.

5. **`ResyncVotingState`**: Викликається з `toggleGMPanel` legacy (game.js:7939) та з `resyncVotingAdmin` (game.js:8147).

### Дубльовані visibility rules

1. **Tab visibility**: `canShowTab()` (gm-panel-v2.js:59) перевіряє permissions з v2 state. `renderGMTabsVisibility()` (game.js:8220) перевіряє `isHost`. V2 обидва правила, але legacy rules можуть конфліктувати.

2. **GM button visibility**: `game.js:8988-8996` показує `#gmPanelBtn` для `isHost || isDeveloper || !!omniscientHiddenState`. Але v2 panel state має `permissions` з сервера. Ці правила можуть розходитися.

3. **Danger zone visibility**: `gm-panel-v2.js:290` ховає `.gm-round-danger-zone` та `.gm-player-danger` для non-technical. Але Razor секції вже не мають `data-gm-advanced` для деяких危险 елементів (e.g., `#gmOmniscientMode`).

### Клієнтські правила, які повинні бути server-driven

1. **`isHost` flag** (`game.js:40`): Встановлюється при `RoomCreated` / `RoomJoined` events клієнтом. Не оновлюється при `TransferHost`. Але сервер оновлює `Room.HostPlayerId`.

2. **Voting round threshold**: `gm-panel-v2.js:350-351` `hint.hidden = round >= 3` — клієнтське правило, хоча сервер теж блокує. Може розійтися.

3. **`canStartVotingNow()`** (`game.js:8979`): Невідома функція, але використовується для show/hide кнопки голосування — клієнтська логіка.

### Паралельні state sources

1. **`gmPanelV2State`** (gm-panel-v2.js:28) — server-driven DTO
2. **`gmPlayersData`** (game.js:49) — отримується з `AllPlayersData` event
3. **`currentRoom`** (game.js:37) — отримується з `RoomCreated`/`RoomJoined`
4. **`currentRoundState`** (game.js) — отримується з `RoundStateUpdated`
5. **`gmThreatControlData`** (game.js:51) — отримується з `GetGMThreatControlData`
6. **`gmDiagnosticsData`, `gmAuditData`, `gmSnapshotsData`** — окремі state

V2 state є summary, але більшість actual controls (timer, round, voting, threats) використовують legacy state.

---

## 5. Рекомендована цільова структура

### Порівняння з цільовою з задачі

| Цільова вкладка | Призначення | Наявні блоки | Адаптація |
|---|---|---|---|
| **Гра** | Round, phase, active players, readiness, voting, threat, timer, одна контекстна дія | `gmGameStateSection`, `gmRoundSection` (round + timer), `gmVotingV2Section` (status) | Об'єднати round + timer + voting summary + threat summary в одну секцію. Прибрати звідси detailed threat controls (перенести в Загрози). |
| **Гравці** | Player list, selected player, quick actions | `gmPlayerSelectSection`, `gmPlayerInfo`, `#gmPlayerCardsV2` (створити) | Замінити legacy dropdown на v2 cards. Залишити detailed player management тут. |
| **Події** | Quick game events, scenario controls | `gmEventsSection`, `gmScenarioSection` | Об'єднати event form + quick events + scenario controls. |
| **Історія** | Audit log, threat audit | `gmThreatAudit` (audit log details) | Винести audit log з technical в окрему секцію. Додати timeline view. |
| **Діагностика** | Room integrity, auto-fix, diagnostics issues | `gmDiagnosticsSection` (diagnostics summary + issues) | Залишити тут diagnostics + auto-fix + error display. |
| **Відновлення** | Snapshots, undo, local editor, omniscient bootstrap | `gmSnapshotsSection`, `gmRoomLocalEditor`, `gmOmniscientMode` | Об'єднати snapshots + undo + local editor. Omniscent bootstrap — в окремий підсекцію. |

### Що НЕ змінювати

- `GmPanelStateDto` та `GmPanelPermissionsDto` — вже мають правильну структуру
- `GmPanelStateBuilder.TryBuild()` — server-side permission logic коректний
- Всі hub methods та permission checks на сервері
- `GmMode`, `GmCapability` enum та `GmCapabilities.Allows()`
- Snapshot/audit/undo architecture
- Omniscient GM entry flow (bootstrap key → preview → confirm)
- Director controls
- Property editor dialog

---

## 6. Мінімальний implementation plan

### Крок 1: Додати контейнер `#gmPlayerCardsV2`
- **Файли**: `_GmPanel.cshtml`
- **Символи**: додати `<div id="gmPlayerCardsV2">` перед `#gmPlayerSelectSection` (рядок ~248)
- **Очікувана зміна**: V2 player cards починають рендеритися
- **Вузька перевірка**: Відкрити панель → бачити список гравців у вигляді cards
- **Ризики**: Низький — просто порожній контейнер
- **Approval required**: Ні

### Крок 2: Видалити legacy `toggleGMPanel` з game.js
- **Файли**: `game.js:7930-7946`
- **Символи**: `function toggleGMPanel()`
- **Очікувана зміна**: Прибирається мертвий код + 7 непотрібних invoke
- **Вузька перевірка**: `toggleGMPanel()` викликається → v2 версія працює
- **Ризики**: Низький — v2 override вже активний
- **Approval required**: Ні

### Крок 3: Видалити legacy `switchGMTab` та `renderGMTabsVisibility` з game.js
- **Файли**: `game.js:8214-8230`
- **Символи**: `function switchGMTab()`, `function renderGMTabsVisibility()`
- **Очікувана зміна**: Прибирається конфлікт між legacy та v2 tab IDs
- **Вузька перевірка**: Вкладки перемикаються, активна вкладка зберігається
- **Ризики**: Низький — v2 override вже активний
- **Approval required**: Ні

### Крок 4: Видалити дублювання `renderGMPanelState` → `gmGameStateSummary` з game.js
- **Файли**: `game.js:8256-8262`
- **Символи**: блок `if (stateSummary)` в `renderGMPanelState()`
- **Очікувана зміна**: Прибирається race condition з v2 `renderOverview()`
- **Вузька перевірка**: Summary cards оновлюються з v2 state
- **Ризики**: Низький
- **Approval required**: Ні

### Крок 5: Додати `data-gm-advanced` до `#gmOmniscientMode`
- **Файли**: `_GmPanel.cshtml:632`
- **Символи**: `<details id="gmOmniscientMode">`
- **Очікувана зміна**: Omniscient bootstrap прихований для ordinary host у simple mode
- **Вузька перевірка**: Simple mode → omniscient entry не видно; Advanced → видно
- **Ризики**: Низький
- **Approval required**: Ні

### Крок 6: Перенести `renderGMThreatControl` до v2
- **Файли**: `game.js:8273-8310` → `gm-panel-v2.js`
- **Символи**: `renderGMThreatControl()` → нова функція `renderThreats()` в v2
- **Очікувана зміна**: Threat controls оновлюються через v2 state, а не legacy
- **Вузька перевірка**: Відкрити tab Загрози → бачити поточну загрозу та controls
- **Ризики**: Середній — потрібно переконатися, що `gmThreatControlData` доступний v2
- **Approval required**: Ні

---

## 7. Approval gates

| Дія | Потрібен approval? | Обґрунтування |
|---|---|---|
| Додати `#gmPlayerCardsV2` контейнер | ❌ Ні | Не змінює behavior, просто додає порожній контейнер |
| Видалити legacy `toggleGMPanel` | ❌ Ні | V2 override вже перезаписує; це мертвий код |
| Видалити legacy `switchGMTab` | ❌ Ні | V2 override вже перезаписує |
| Видалити дублювання renderGMPanelState | ❌ Ні | Змінює тільки внутрішню реалізацію |
| Додати `data-gm-advanced` | ❌ Ні | CSS-only зміна |
| Перенести renderGMThreatControl | ❌ Ні | Рефакторинг всередині JS, без зміни behavior |
| Зміна SignalR contracts | ❌ Ні | Не передбачається |
| Зміна ролей/authorization | ❌ Ні | Не передбачається |
| Зміна фундаментальних моделей | ❌ Ні | GmPanelStateDto залишається |
| Переміщення/перейменування файлів | ❌ Ні | Всі зміни в існуючих файлах |
| Broad refactor | ❌ Ні | Зміни локальні та незалежні |

---

## 8. Рекомендований перший implementation slice

### Крок 1: Додати контейнер `#gmPlayerCardsV2` до `_GmPanel.cshtml`

**Критерії готовності для наступної сесії:**

1. У `_GmPanel.cshtml` перед секцією `#gmPlayerSelectSection` (рядок ~248) додано:
   ```html
   <div id="gmPlayerCardsV2" class="gm-player-cards-v2"></div>
   ```

2. CSS клас `.gm-player-cards-v2` додано до `game.css` з базовим grid/flex layout.

3. Після відкриття GM Panel вкладка «Гравці» показує список гравців у вигляді кнопок-cards (ім'я + статус).

4. Клік по card → вибір гравця → відображення його характеристик.

5. `git diff` показує зміни тільки в `_GmPanel.cshtml` та `game.css`.

6. Ніяких змін у behavior для existing legacy dropdown.

---

## Висновок

**Можна переходити до реалізації без approval-required змін.** Всі запропоновані кроки (1-6) є локальними змінами в існуючих файлах, не змінюють SignalR contracts, ролі, моделі, та не потребують переміщення файлів.

Основний technical debt — це паралельне існування legacy (`game.js`) та v2 (`gm-panel-v2.js`) систем з глибокою залежністю v2 від legacy state. Найбільший immediate win — видалення мертвого legacy коду (`toggleGMPanel`, `switchGMTab`, `renderGMTabsVisibility`), що зменшує confusion та прибирає potential race conditions.

Критичний баг — відсутність `#gmPlayerCardsV2` контейнера — робить v2 player cards повністю нефункціональними. Це перший пріоритет для виправлення.
