# Технічний аудит Bunker

Дата статичного аудиту: 2026-09-02
Обсяг: поточний робочий стан репозиторію, без зміни production-коду, конфігурації, тестів або контенту.

## Короткий висновок

Bunker — це монолітний ASP.NET Core застосунок на .NET 10 із Razor-представленнями, SignalR, SQLite/EF Core та двома незалежними realtime-іграми:

- основна гра Bunker на маршруті SignalR **/gameHub**;
- компактна гра Spy на маршруті SignalR **/spyHub**.

Основна гра має виразну серверну авторитетність: клієнтські JavaScript-файли в основному викликають методи хаба та відмальовують уже обчислений сервером стан. Стан активної Bunker-кімнати живе в пам’яті, але має recovery-знімки в SQLite; історія сесій та акаунти також зберігаються у SQLite. Spy живе лише в пам’яті процесу та має лише локальні, неперсистентні snapshots.

Під час аудиту знайдено два суттєві ризики доступу/цілісності:

1. Зміна або вимкнення пароля Bunker lobby не синхронізує recovery-хеш. Це робить старий пароль чинним у recovery-сценаріях і може не дозволити реально вимкнути пароль.
2. Spy повторно прив’язує гравця лише за client-side playerId, який повертається всім учасникам у стані кімнати. Учасник, що знає ID іншого гравця, може перебрати його сесію.

Також підтверджено розсинхронізований JavaScript contract-тест: він очікує стару структуру SignalR-обробників у core-файлі, хоча поточний код коректно розніс 110 пар on/off у доменні файли.

### Межі та методика

Аудит базується на читанні вихідного коду, конфігурацій, тестів, DI-реєстрацій, Razor load order і вибірковій перевірці одного релевантного JavaScript contract-тесту. Це не penetration test і не повний E2E-прогін.

Непроінспектованим змістовно та не зміненим залишено два вже наявні untracked бінарні файли користувача:

- wwwroot/uploads/apocalypses/mirror_world.png;
- wwwroot/uploads/bunkers/university_lab.png.

## 1. Структура проєкту й фактична архітектура

### Карта рішення

Рішення описане в **Bunker.slnx** і містить головний web-проєкт **Bunker.csproj** та xUnit-проєкт **Tests/Bunker.UnitTests/Bunker.UnitTests.csproj**. Головний проєкт націлений на net10.0; ключові залежності — ASP.NET Core/Identity, EF Core 10, SQLite, SignalR та Playwright.

~~~text
Bunker/
├── Program.cs                         запуск, DI, middleware, маршрути
├── Controllers/                       MVC та HTTP API
├── Hubs/
│   ├── BunkerHubGame/GameHub.*.cs     partial SignalR-хаб основної гри
│   └── SpyHubGame/SpyHub.cs            окремий SignalR-хаб Spy
├── Services/
│   ├── Bunker/                         правила, room state, recovery, GM, сценарії
│   ├── Spy/                            in-memory Spy rooms і таймер
│   ├── OwnerContent/                   захищений редактор JSON-контенту
│   └── Profile/                        історія профілю
├── Models/
│   ├── Game/                           Room, voting, threats, snapshots, DTO
│   ├── Player/                         Player, event cards, private state
│   ├── Characteristics/                професія, здоров’я, інвентар тощо
│   ├── Spy/                            SpyRoom, SpyPlayer, snapshots
│   └── GameData/                       типізовані моделі JSON-каталогів
├── Data/Persistence/                  BunkerDbContext, EF entities, migrations
├── Views/                              Razor UI
├── wwwroot/
│   ├── data/                           декларативний контент гри JSON
│   ├── js/bunker/                      plain-script клієнт основної гри
│   └── js/spy.js                       клієнт Spy
└── Tests/
    ├── Bunker.UnitTests/               xUnit
    ├── JavaScript.Contracts/           node:test статичні контракти
    └── Playwright/                     браузерні E2E/visual сценарії
~~~

### Фактична схема взаємодії

~~~mermaid
flowchart LR
    Browser["Razor + plain JavaScript"]
    Razor["Controllers + Views"]
    GameHub["GameHub /gameHub"]
    SpyHub["SpyHub /spyHub"]
    Core["Bunker services"]
    Spy["SpyRoomService"]
    Memory["RoomService: active rooms in memory"]
    SQLite["SQLite bunker.db"]
    Json["wwwroot/data JSON"]

    Browser --> Razor
    Browser <--> GameHub
    Browser <--> SpyHub
    Razor --> Core
    GameHub --> Core
    GameHub --> Memory
    SpyHub --> Spy
    Core --> Json
    Core --> SQLite
    Memory --> Core
    Spy --> Json
~~~

Ключове архітектурне розділення:

- **Controllers** обслуговують сторінки, Identity, profile, owner-content та HTTP-операції із зображеннями.
- **GameHub** є командним API основної гри; він розбитий на partial-файли, але компілюється в один клас.
- **RoomService** є in-memory реєстром основних кімнат і прив’язок connectionId → roomId.
- **Сервіси Bunker** містять правила, генерацію, recovery, обмеження ролей, snapshots, сценарії та persistence orchestration.
- **wwwroot/data** містить контент, а не основні технічні правила: C# інтерпретує й валідовує його.
- **SpyRoomService** — окремий in-memory домен, не підключений до Bunker RoomService чи SQLite recovery.

## 2. Startup і Program.cs

### Порядок запуску

У **Program.cs** застосунок:

1. створює WebApplicationBuilder і налаштовує Console/Debug logging;
2. додає MVC, SignalR, Options, authorization policy OwnerOnly, Identity та EF Core SQLite;
3. реєструє custom singleton/scoped/hosted services;
4. після Build примусово резолвить IScenarioContentRegistry, тому невалідний сценарний JSON зупиняє старт;
5. у startup scope виконує Database.MigrateAsync() і позначає старі незавершені GameSessions як abandoned з причиною startup_recovery;
6. складає middleware pipeline;
7. мапить MVC route, /gameHub і /spyHub.

### HTTP pipeline

Поточний порядок у **Program.cs**:

~~~text
ForwardedHeaders
→ Production exception handler + HSTS лише у Production
→ HTTPS redirection
→ Static files
→ Routing
→ Authentication
→ Authorization
→ MapControllerRoute
→ MapHub<GameHub>("/gameHub")
→ MapHub<SpyHub>("/spyHub")
~~~

### Конфігурація, що має значення

З **appsettings.json**:

- DefaultConnection: SQLite-файл bunker.db;
- RoomRecovery увімкнений, інтервал 5 секунд, retention 24 години;
- Identity вимагає пароль не коротше 8 символів, цифру, lower/upper case; lockout після 5 невдалих спроб на 15 хвилин;
- Identity cookie: HttpOnly, SecurePolicy.Always, SameSite.Lax, 14-денне sliding expiration;
- antiforgery cookie: HttpOnly, SecurePolicy.Always, SameSite.Strict;
- ContentEditor у базовому конфігу вимкнений, у appsettings.Development.json увімкнений;
- OwnerAccess.UserId у перевіреному конфігу порожній. Отже owner/developer-влада не стає доступною лише тому, що відповідні feature flags увімкнені: потрібен конкретний owner Guid.

### HTTP-контролери

| Контролер | Реальні маршрути та відповідальність |
|---|---|
| AccountController | /account/register, /account/login, /account/logout, /account/access-denied; використовує UserManager і SignInManager; POST мають ValidateAntiForgeryToken. |
| ProfileController | Авторизований /profile, /profile/history, /profile/edit; викликає IProfileGameHistoryService. |
| OwnerContentController | Авторизований policy OwnerOnly, /owner/content; JSON list/load/validate/preview/save/backup/restore; мапить ContentEditorException у контрольований HTTP status/code. |
| ScenarioImageController | /api/ScenarioImage; upload/remove/prompt для apocalypse, bunker, threat; доступ перевіряється через DeveloperAuthorityService. |
| BunkerController | Рендерить Bunker Index, включно з invite route /room/{roomId}. |
| SpyController | Рендерить Spy Index і invite route /spy/{roomCode}. |
| HomeController, GamesController | Навігаційні й статичні сторінки. |

## 3. Карта основних класів

### Центральні класи основної гри

| Шар | Класи | Реальна роль |
|---|---|---|
| Hub edge | GameHub, його partial-файли GameHub.Rooms, .Lobby, .Voting, .Threats, .Scenarios, .GameMaster, .Diagnostics тощо | Приймає SignalR-команди, робить авторизаційні й фазові перевірки, викликає сервіси, надсилає DTO/event payload. |
| Стан кімнати | Room, Player, RoomGameSettings, VotingSession, ThreatInteractionState, GameTimerState | Мутований runtime-стан однієї Bunker-кімнати. |
| Реєстр | RoomService | ConcurrentDictionary кімнат і прив’язок підключень; створення, join, leave, rejoin, canonical seat assignment. |
| Lobby/rounds | LobbyStartService, RoomGameSettingsService, RoundVotingAdminService, GameResetService | Валідація lobby, preview-token старту, freeze settings, readiness, переходи раундів. |
| Gameplay | CharacterGeneratorService, ThreatScalingService, ThreatPoolSelector, RadiationLeakMiniGameService, ApocalypseEffectEngine, ScenarioSchedulerService, ScenarioRunnerService, EventSpecialCardService | Серверні правила генерації, загроз, апокаліпсису, сценаріїв і карт. |
| GM/diagnostics | DeveloperAuthorityService, GmPanelStateBuilder, GmAuditService, RoomIntegrityService, RoomSnapshotService, RoomLocalEditorService | Авторитет ролей, audit, preview/restore, локальне редагування та технічна діагностика. |
| Persistence | BunkerDbContext, GameSessionHistoryService, RoomRecoveryCoordinator, RoomRecoverySnapshotStore | Identity, історія сесій і персистентні recovery-знімки. |

### Відношення моделей

~~~mermaid
classDiagram
    Room "1" *-- "*" Player
    Room "1" *-- "1" RoomGameSettings
    Room "0..1" --> "1" VotingSession
    Room "0..1" --> "1" ThreatInteractionState
    Room "0..1" --> "1" Apocalypse
    Room "0..1" --> "1" BunkerInfo
    Room "1" *-- "1" GameTimerState
    Room "1" *-- "*" RoomSnapshot
    Player "1" *-- "*" SpecialCard
    Player "1" *-- "*" EventSpecialCard
    VotingSession --> Player : stable player keys
    RoomSnapshot --> RoomSnapshotState
    RoomSnapshotState --> Player : PlayersByStableId
    GameSessionEntity "1" *-- "*" GameSessionPlayerEntity
    ApplicationUser "0..1" --> GameSessionPlayerEntity
~~~

### Окремий Spy-домен

| Клас | Роль |
|---|---|
| SpyHub | SignalR edge для /spyHub. |
| SpyRoomService | Створює/шукає кімнати, перевіряє host-only команди, виконує раунд, голосування, snapshots. |
| SpyRoom | In-memory room: Players, host, location, spy, round, journal, snapshots, idempotency keys. |
| SpyPlayer | PlayerId, connection, name, language, ready, vote target, score. |
| SpyTimerExpiryService | BackgroundService з PeriodicTimer на 1 секунду. |

## 4. Основні gameplay/backend системи та реальні потоки

### 4.1. Створення, lobby і старт Bunker

Фактичний шлях:

~~~mermaid
sequenceDiagram
    participant C as Client
    participant H as GameHub
    participant R as RoomService
    participant L as LobbyStartService
    participant S as Settings/Gameplay services
    participant D as SQLite history

    C->>H: CreateRoom / JoinRoom
    H->>R: create or join + generated Player
    H-->>C: RoomCreated / RoomJoined, caller-only reconnect token
    C->>H: GetLobbyStartPreview
    H->>L: Preview(room, host)
    L-->>C: 30-second one-use token, version, fingerprint
    C->>H: StartGameFromLobby(token, commandId)
    H->>L: TryConsume verifies token/version/fingerprint
    H->>S: freeze settings, StartGame, seat assignment, generation
    H-->>C: personal states + group GameStarted/RoundStateUpdated
    H->>D: CreateStartedSessionAsync, non-blocking for UI success
~~~

Деталі, підтверджені **GameHub.Lobby.cs**, **LobbyStartService.cs**, **RoomGameSettingsService.cs**:

- Preview token створюється із 24 random bytes, прив’язаний до room ID, host stable player ID, state version і fingerprint та живе 30 секунд.
- StartGameFromLobby повторно перевіряє token, room, host, readiness, active voting/threat та поточний fingerprint.
- RoomGameSettingsService freeze-ить canonical settings у FrozenGameSettings; разом із ним фіксується resolved bunker capacity.
- RoomService.StartGame виконує server-side seat assignment і встановлює RoomState.Playing / GamePhase.RoundReveal.
- CompleteLobbyStart вибирає apocalypse/bunker, ініціалізує scenarios/intel/timer, надсилає персональний PlayerStateResynced лише актуальним підключенням, а групі — публічний стан.
- GameSessionHistoryService створюється після успішного realtime handoff. Збій історії логують, але не відкочують уже запущену UI-гру.

### 4.2. Гравець, reconnect і відкладене disconnect cleanup

Основна Bunker-гра:

- Player має StablePlayerId, AccountUserId і RecoveryReconnectTokenHash.
- GameHub.RejoinRoom та шлях JoinRoom зі stable ID передають account ID з SignalR principal і/або reconnect token до RoomService.RejoinRoom.
- Після disconnect GameHub.Connection.OnDisconnectedAsync позначає гравця disconnected, за налаштуванням ставить таймер на паузу при disconnect host, ставить recovery у чергу і планує cleanup.
- PlayerDisconnectCleanupCoordinator дає 5 хвилин grace period. Rejoin скасовує запланований cleanup; у разі завершення grace period гравець видаляється, а GameSessionHistoryService фіксує ранній вихід або abandoned room.

### 4.3. Раунд, розкриття характеристик і завершення

GameHub.GameActions та GameHub.GameMaster керують reveal/GM actions. Server-side Room.CurrentPhase обмежує дозволені операції. GameHub.GameCompletion.TryMarkGameFinishedAfterElimination під lock GameSettingsSyncRoot завершить гру лише тоді, коли кількість неелімінованих gameplay players не перевищує зафіксовану bunker capacity. Після цього:

- RoomState → Finished;
- GamePhase → Finished;
- GameTimer зупиняється;
- групі відправляється GameFinished;
- спроба completion GameSession у SQLite відбувається після realtime повідомлення.

### 4.4. Голосування

**GameHub.Voting.cs** створює VotingSession, генерує множники/блокування від special cards, надсилає candidates і прогрес без розкриття персональних голосів до потрібної фази.

**VotingSession**:

- зберігає Votes як stable voter key → stable target key;
- обчислює VoteCounts через GroupBy і VoteMultipliers;
- відокремлює extra votes від реальних виборців;
- приховує voters, якщо ToClientInfo отримує showVotes=false;
- визначає tie, top vote, non-voters.

Розв’язання голосування доступне host/дозволеному оператору, перевіряє tie/стан, виконує elimination або pending elimination, оновлює completion і, за потреби, запускає apocalypse after_voting.

### 4.5. Загрози

Основні вузли:

- GameHub.Threats.cs: contribution workflow, volunteer selection/vote, support dice, inventory/property/profession/hobby bonus, minigame, resolution.
- ThreatScalingService: розраховує учасників, час, tasks, hints, required success.
- ThreatPoolSelector: вибирає текстову або explicit special threat.
- ThreatMiniGameRegistry: dictionary реалізацій IThreatMiniGameService; у DI зареєстрований RadiationLeakMiniGameService.
- ThreatAuditService: веде обмежений audit trail під ThreatSyncRoot.
- GMThreatStateMutator і GameHub.GMThreats.cs: preview/confirmation/force/restart/cancel/resync.

ThreatInteractionState є деталізованим state aggregate: статус, participants, contributions, secret support, volunteer vote, scaling, bonus, minigame, plan choice, resolution.

### 4.6. Апокаліпсис

Потік:

1. ApocalypseSelectionService вибирає кандидат за замороженими settings.
2. ApocalypseActivationPolicyResolver перетворює lobby policy в ResolvedApocalypseActivationPolicy.
3. ApocalypseActivationScheduler дедуплікує occurrence й вирішує schedule/trigger.
4. ApocalypseEffectEngine валідує handler registry, робить PlayerMutationSnapshot для цільових гравців, застосовує handlers.
5. За exception engine відновлює snapshots усіх зачеплених players та повертає failure result.
6. GameHub.ApocalypseEffects надсилає персональні зміни конкретним гравцям, а публічний ApocalypseEffectActivated — групі.

Таким чином технічна ефект-логіка не зберігається у JSON як executable logic: JSON описує definitions, а C# registry/handlers виконують правила.

### 4.7. Сценарії, event cards і bunker intel

**ScenarioContentRegistry** завантажує scenario_events.json та event_special_cards.json, перевіряє schema/ID/localization/посилання й падає на startup за невалідного контенту.

**ScenarioSchedulerService** обирає eligible event/threat/secret-event після раунду. **ScenarioRunnerService** керує private choice та викликає **EventSpecialCardService**. Останній серверно:

- видає, передає і застосовує runtime event card;
- обробляє JSON effects;
- мутує bunker food/water через BunkerResourceService;
- відкриває public/private intel через BunkerIntelService;
- створює інвентар/property/profession effects;
- підтримує pending choice та expiry на межі раунду.

GameHub.Scenarios.cs створює RoomSnapshot перед ризиковою мутацією; у failure-path застосовує RoomSnapshotService.ApplyState та повертає контрольований ReceiveError.

### 4.8. GM, developer і postgame

GameHub.GameMaster.cs реалізує host/GM commands: edit/regenerate/reveal характеристик, таймер, bunker resource, pause, host transfer, kick, property editor, round controls.

DeveloperAuthorityService розділяє:

- Developer — authenticated Identity user, чий Guid збігається з OwnerAccess.UserId;
- host — canonical room host;
- technical/omniscient GM — окремі GmMode/capability boundaries;
- active developer operator — lease, connection ID, reconnect window і audit.

Diagnostics і developer tools включають RoomIntegrityService, RoomSnapshotService, audit, auto-fix preview, room-local editor, global content drafts/commit/rollback і postgame story director. Це функціонально багатий, але привілейований шар.

### 4.9. Spy

SpyRoomService тримає всі кімнати в ConcurrentDictionary, але кожну мутацію room виконує під lock(room):

- StartRound перевіряє host, minimum players, ready state, вибирає location і spy.
- Vote завершує раунд після strict majority.
- GuessLocation доступна лише обраному spy.
- snapshots включають fingerprint, host topology та player topology; restore створює safety snapshot і вимагає confirmation.
- SpyTimerExpiryService щосекунди завершує прострочені раунди.

Після рестарту процесу Spy rooms, journal та snapshots втрачаються: вони не мають recovery store чи DbContext entity.

## 5. SignalR: hubs, методи, групи, події та клієнтські обробники

### Endpoints і групи

| Hub | Маршрут | Група | Connection lifecycle |
|---|---|---|---|
| GameHub | /gameHub | room.Id | Create/Join/Rejoin додають ConnectionId до групи; Leave/Kick видаляють. Disconnect позначає player offline, ставить recovery у чергу та запускає grace cleanup. |
| SpyHub | /spyHub | SpyRoom.RoomCode | Create/Join додають у групу; Leave/Kick видаляють. Disconnect лише позначає player offline. Стан надсилається по одному підключенню, бо payload залежить від того, хто spy. |

### Публічні API GameHub за доменами

Таблиця групує методи для читабельності, але всі назви нижче — фактичні public Hub methods у partial-класі GameHub.

| Домен команд | Hub methods | Основний сервіс/стан | Типові server events |
|---|---|---|---|
| Кімнати | CreateRoom, JoinRoom, LeaveRoom, GetRooms, RejoinRoom | RoomService, Player, Room | RoomCreated, RoomJoined, RejoinSuccess, PlayerJoinedRoom, PlayerLeftRoom, RoomsListUpdated |
| Lobby | GetLobbyState, GetLobbyPreset, GetLobbyCatalog, ApplyLobbySettings, SetLobbyPassword, ResetLobbyMemberReady, KickLobbyMember, Preview/SetLobbyParticipation, SetLobbyReady, GetLobbyStartPreview, StartGameFromLobby, ReturnFinishedGameToLobby | LobbyStartService, RoomGameSettingsService, GameResetService | LobbyStateUpdated, GameStarted, GameReturnedToLobby, LobbyKicked |
| Player/round | RevealCharacteristic, HideOwnRevealedCharacteristic, SubmitVotingReadyStatus, RevealAllEliminatedPlayerCharacteristics, EndRound, RollRoundDice, Start/CancelVotingReadyCheck | Player.Revealed, Room phase, timers | CharacteristicRevealed, RoundStateUpdated, RoundEnded, RoundAdvanced, VotingReadyCheckStarted |
| Voting | StartVoting, Vote, EndVoting, ResolveVoting, Clear/RemoveVoting..., CancelVoting | VotingSession, RoundVotingAdminService | VotingStarted, VoteCast, VotingProgress, VotingEnded, VotingResolved, VotingCancelled |
| Threats | RollThreatSupportDice, add/withdraw contribution, volunteer commands, resolve plan, radiation minigame commands | ThreatInteractionState, ThreatScalingService, ThreatMiniGameRegistry | ThreatRevealed, ThreatStateUpdated, ThreatMiniGameUpdated, ThreatResolved |
| Scenarios/cards | ResolveScenarioChoice, SkipPendingScenario, Use/TransferEventSpecialCard, finalise pending elimination, bunker intel commands | ScenarioRunnerService, EventSpecialCardService, BunkerIntelService | ScenarioStarted, ScenarioPrivateOpened, ScenarioResolved, EventSpecialCardsUpdated |
| Special cards | UseSpecialCard, UseSpecialCardById | Player.SpecialCards, GameHub.SpecialCards helpers | SpecialCardStateUpdated, SpecialCardActivated, SpecialCardPrivateResult |
| GM game controls | GetAllPlayersData, Edit/Clear/Regenerate/ForceReveal characteristic, timer and bunker mutations, eliminate/restore/kick/transfer host | DeveloperAuthorityService, GmAuditService, GameTimerService, RoomService | AllPlayersData, GMActionSuccess, GameTimerUpdated, HostChanged |
| Diagnostics | RunRoomIntegrityCheck, Preview/ApplyRoomAutoFix, GetGmAuditLog, snapshots, restore, undo | RoomIntegrityService, RoomSnapshotService | RoomDiagnosticsUpdated, RoomSnapshotsUpdated, RoomSnapshotRestorePreviewed |
| GM/content/omniscient | Gm panel/property editor, catalog picker, global content draft/commit/rollback, Preview/Enter/Get/Resync Omniscient, director actions | GmPanelStateBuilder, CatalogItemService, GlobalContent*, Omniscient* | OmniscientHiddenStateUpdated, GmAuditLogUpdated, CatalogItemApplied |
| Postgame | Prepare/Resume/Submit/Save/Publish/Cancel/Finish postgame story, TakeOverDeveloperOperator | PostGameStoryService, DeveloperAuthorityService | PostGameStoryStateChanged, PostGameStoryPublished, PostGameTransitionChanged |
| GM threats/local edit | GMPreviewForceThreat, GMConfirmForceThreat, GMGenerate/Select/Cancel/Restart/ResyncThreat; room local editor methods | GMThreatStateMutator, RoomLocalEditorService | GMThreatForcePreview, GMThreatControlData, RoomLocalEditorUpdated |

### Публічні API SpyHub

| Методи | Серверний сервіс | Події |
|---|---|---|
| CreateSpyRoom, JoinSpyRoom | SpyRoomService.CreateRoom/JoinRoom | SpyStateUpdated |
| SetSpyReady, UpdateSpySettings | SpyRoomService readiness/settings | SpyActionSuccess, SpyStateUpdated |
| StartSpyRound, EndSpyRound, NewSpyRound, RevealSpyRoles, VoteSpyPlayer, GuessSpyLocation, ReturnSpyToLobby | Round/vote/guess rules у SpyRoomService | SpyActionSuccess, SpyStateUpdated |
| KickSpyPlayer, LeaveSpyRoom | SpyRoomService removal | SpyPlayerKicked, SpyRoomLeft, SpyStateUpdated |
| GetSpySnapshots, PreviewSpySnapshotRestore, RestoreSpySnapshot | in-memory Spy snapshots | SpySnapshotRestorePreviewed, SpyActionSuccess |

### Напрямок даних: приклад командного циклу

~~~text
browser connection.invoke("Vote", ...)
→ GameHub.Vote
→ знайти Room і Player через RoomService
→ перевірити membership/phase/pause/eligible target
→ мутувати VotingSession
→ за потреби завершити voting
→ Clients.Caller/Group SendAsync із проєкціями
→ QueueRoomRecovery(room, reason)
~~~

### Клієнтські обробники Bunker

**Views/Bunker/Index.cshtml** спочатку завантажує globals і domain runtime files, потім 16 domain SignalR files, після них **wwwroot/js/bunker/core/signalr-events.js**, а далі **wwwroot/js/game.js**. Це plain-script global architecture без import/export/module loader.

Поточний статичний підрахунок:

- 110 connection.on і 110 відповідних connection.off у доменних signalr-events.js;
- core/signalr-events.js сам не містить on/off: він викликає зареєстровані domain functions у фіксованому порядку;
- Spy має 5 on/off пар у wwwroot/js/spy.js.

| Клієнтський домен | Файл | Приклади подій, які він обробляє |
|---|---|---|
| apocalypse | wwwroot/js/bunker/apocalypse/signalr-events.js | ApocalypseChanged, ApocalypseEffectActivated, image events |
| bunker | wwwroot/js/bunker/bunker/signalr-events.js | BunkerChanged, BunkerUpdated, capacity/resource events |
| characters | wwwroot/js/bunker/characters/signalr-events.js | Characteristic*, PlayerStateResynced, PlayerEliminated/Restored |
| diagnostics | wwwroot/js/bunker/diagnostics/signalr-events.js | RoomDiagnosticsUpdated, RoomSnapshotsUpdated, DeveloperAuthorityChanged |
| events | wwwroot/js/bunker/events/signalr-events.js | GameEvent, ScenarioStarted, ScenarioPrivateOpened, ScenarioResolved |
| gm | wwwroot/js/bunker/gm/signalr-events.js | AllPlayersData, GMActionSuccess, GMThreat* |
| inventory | wwwroot/js/bunker/inventory/signalr-events.js | AdditionalInventoryGranted |
| lobby | wwwroot/js/bunker/lobby/signalr-events.js | RoomCreated, RoomJoined, RejoinSuccess, LobbyStateUpdated, HostChanged |
| postgame | wwwroot/js/bunker/postgame/signalr-events.js | GameFinished, PostGameTransitionChanged |
| rounds/timer/voting | відповідні domain files | Round*, GameTimerUpdated, Voting* |
| threats | wwwroot/js/bunker/threats/signalr-events.js | ThreatRevealed, ThreatStateUpdated, support/volunteer/minigame events |
| special-cards/ui | відповідні domain files | SpecialCard*, ReceiveError |

### Приватність payload

Основна гра переважно використовує явні projections:

- RoomCreated/RoomJoined/RejoinSuccess повертають room.ToPublicInfo(), а не raw Room;
- HostToken і reconnectToken надсилаються лише caller-у;
- SendPersonalPlayerSnapshot надсилає PlayerStateResynced конкретному connection;
- VotingSession.ToClientInfo приховує voters до дозволеної фази;
- BunkerIntelService.Project враховує current player/GM role;
- omniscient hidden state відправляється тільки авторизованим спектаторам.

## 6. Ігровий стан: пам’ять, диск, JSON, БД і рестарт

| Дані | Де живуть під час runtime | Де/як зберігаються | Після рестарту |
|---|---|---|---|
| Active Bunker rooms | RoomService._rooms у ConcurrentDictionary | RoomRecoverySnapshotEntity.StateJson у SQLite через RoomRecoveryCoordinator | Відновлюються, якщо schema/fingerprint валідні; усі connection IDs очищені, players offline. |
| Bunker player identity | Player у Room.Players | AccountUserId і RecoveryReconnectTokenHash у RoomRecoverySnapshotData | Account або correct reconnect token потрібні для повторного зв’язування. |
| Bunker history | room.GameSessionId посилається на session | GameSessions і GameSessionPlayers | Залишається для profile/history; startup abandon-ить старі Started sessions. |
| In-memory room snapshots | Room.SnapshotHistory | Не окремо в таблиці; потрапляє до recovery state як стан room | Залежить від recovery snapshot. |
| Identity | Identity EF aggregate | SQLite tables через migrations | Залишається. |
| Контент | GameDataService/ScenarioContentRegistry cache | wwwroot/data/*.json, Data/ThreatMiniGames/*.json | Повторно завантажується на старті. |
| Owner content backups | файлові backup метадані/JSON | App_Data/content-editor/backups | Залишається на файловій системі. |
| Spy rooms/snapshots/journal | SpyRoomService._rooms | Немає DB/recovery store | Втрачаються. |

### Recovery Bunker

~~~mermaid
flowchart TD
    M["RoomService active Room"]
    Q["QueueSnapshot / periodic 5 sec"]
    C["RoomRecoveryCaptureService.Capture"]
    F["SHA-256 fingerprint + revision"]
    S["RoomRecoverySnapshotStore async EF scope"]
    DB["RoomRecoverySnapshots in SQLite"]
    R["Startup RestoreRoomsAsync"]

    M --> Q --> C --> F --> S --> DB
    DB --> R
    R -->|"schema + fingerprint + JSON valid"| M
~~~

**RoomRecoveryCoordinator** має unbounded Channel із single reader, дедупліку queued room IDs і періодичне захоплення. **RoomRecoveryCaptureService**:

- не записує raw Password;
- записує PasswordVerificationHash;
- прибирає Player.ConnectionId із серіалізації;
- записує account/reconnect hash окремо;
- на restore очищає HostConnectionId, Player.ConnectionId, IsConnected і runtime host token.

**RoomSnapshotService** відрізняється від persistent recovery: це application-level safety snapshot із topology validation і rollback, призначений для GM/diagnostics.

## 7. Моделі й DTO: що з чим пов’язано

### Room як aggregate

Room у **Models/Game/Rooms/Room.cs** тримає:

- lifecycle: State, CurrentRound, CurrentPhase, CurrentTurnPlayerId;
- membership: Players, HostConnectionId, HostPlayerId, Name, MaxPlayers/MinPlayers;
- lobby/game rules: GameSettings, FrozenGameSettings, SettingsRevision, SettingsFrozen, ResolvedBunkerCapacity;
- gameplay: CurrentVoting, CurrentThreat, ThreatState, Apocalypse, Bunker, scenario/intel/pending elimination;
- operational state: GameTimer, pause state, audit logs, snapshots, processed command IDs;
- recovery/lock objects: RecoverySyncRoot, GameSettingsSyncRoot, ThreatSyncRoot, SnapshotSyncRoot, ApocalypseEffectSyncRoot та інші.

### Player

Player агрегує відкриті й приватні характеристики: Profession, Inventory, GeneratedProperty, PersonalInfo, CharacterTrait, Phobia, PhysicalHealth, MentalHealth, Hobby, Personality, Body, Fact, SpecialCards, EventSpecialCards, private inspected facts. RevealedCharacteristics є окремою мапою видимості. AccountUserId і RecoveryReconnectTokenHash мають JsonIgnore.

### DTO-підхід

Система не має одного універсального DTO шару; вона використовує суміш named records/classes та anonymous projections:

- named DTO: LobbyStateDto, LobbyGameSettingsDto, GameTimerDto, GmPanelStateDto, RoomSnapshotMetadataDto, OmniscientRoomStateDto, PostGameStoryPublicDto, ProfileGameHistoryItem;
- anonymous projection: GameHub.Rooms payload, BuildRoundState, VotingSession.ToClientInfo, SpyRoomService.BuildClientState;
- EF entities: GameSessionEntity, GameSessionPlayerEntity, RoomRecoverySnapshotEntity;
- declarative content models: Apocalypse, BunkerInfo, ThreatData, PropertyDefinition, ScenarioDefinition, EventSpecialCardDefinition.

Наслідок: privacy boundary фактично підтримується дисципліною projection methods, а не окремою компіляторно-примусовою DTO-моделлю.

## 8. Усі явні DI-реєстрації

Нижче перелічені custom registrations із **Program.cs**; framework services Identity/MVC/SignalR мають додаткові внутрішні dependencies, що реєструються самими extension methods.

| Lifetime/механізм | Реєстрації |
|---|---|
| Framework/options | AddControllersWithViews; AddSignalR; Configure OwnerAccessOptions, DeveloperAuthorityOptions, ContentEditorOptions, RoomRecoveryOptions, GlobalContentCatalogOptions, OmniscientGmOptions; AddAuthorization OwnerOnly; AddDbContext BunkerDbContext UseSqlite; AddDefaultIdentity ApplicationUser + IdentityRole<Guid>. |
| Singleton: owner content | IAuthorizationHandler → OwnerOnlyAuthorizationHandler; IContentDocumentRegistry → ContentDocumentRegistry; IContentDocumentValidator → ContentDocumentValidator; ContentFileLockManager; ContentEditorCommandRegistry; ContentDocumentServiceFaults; IContentReloadCoordinator → ContentReloadCoordinator; IContentDocumentService → ContentDocumentService. |
| Singleton: core room/game | GameDataService; ApocalypseSelectionService; ApocalypseActivationPolicyResolver; IApocalypseRandom → SystemApocalypseRandom; ApocalypseEffectHandlerRegistry; ApocalypseEffectEngine; ApocalypseActivationScheduler; CharacterGeneratorService; PlayerStorageService; RoomService; TimeProvider.System; GameTimerService; ScenarioImageService; ThreatScalingService; ThreatAuditService; GmAuditService; GmPanelStateBuilder; CatalogItemService; PlayerDisconnectCleanupCoordinator; RoomIntegrityService; RoomSnapshotService; DeveloperAuthorityService; PostGameStoryPromptBuilder; PostGameStoryResultParser; PostGameStoryService. |
| Singleton: recovery | RoomRecoveryCaptureService; IRoomRecoverySnapshotStore → RoomRecoverySnapshotStore; RoomRecoveryCoordinator; IRoomRecoveryCoordinator резолвить той самий RoomRecoveryCoordinator instance. |
| Singleton: scenarios/content | RoomLocalEditorService; BunkerResourceService; IScenarioContentRegistry → ScenarioContentRegistry; ScenarioSchedulerService; BunkerIntelService; EventSpecialCardService; ScenarioRunnerService; GlobalContentAccessPolicy; GlobalContentCatalogService; GlobalContentDraftService; GlobalContentCommitService; StableIdMigrationService. |
| Singleton: omniscient/lobby/threat | OmniscientGmAccessPolicy; OmniscientGmRoleService; OmniscientHiddenStateService; OmniscientRequestRateLimitService; DirectorControlService; LobbyStartService; RoomGameSettingsService; IThreatMiniGameService → RadiationLeakMiniGameService; ThreatMiniGameRegistry. |
| Singleton: Spy | SpyRoomService. |
| Hosted services | GameTimerExpiryService; SpyTimerExpiryService; RoomRecoveryCoordinator також додається як hosted service через фабрику вже зареєстрованого singleton. |
| Scoped | IGameSessionHistoryService → GameSessionHistoryService; IProfileGameHistoryService → ProfileGameHistoryService; BunkerDbContext за замовчуванням AddDbContext scoped. |

### DI-наслідки

- Більшість ігрового стану singleton, що логічно для кімнат одного server process, але вимагає уважної синхронізації.
- GameHub сам по собі створюється SignalR на виклик/connection scope, але має дуже великий constructor і optional fallback dependencies.
- Background singleton services правильно створюють async scope, коли потребують scoped DbContext: це видно в RoomRecoverySnapshotStore і PlayerDisconnectCleanupCoordinator.

## 9. Async/await: фактичні приклади

| Файл/метод | Патерн | Чому корисний для навчання |
|---|---|---|
| Services/Bunker/Recovery/RoomRecoverySnapshotStore.cs, LoadActiveAsync | await using CreateAsyncScope; EF AsNoTracking/ToListAsync із CancellationToken | Безпечне використання scoped DbContext із singleton сервісу. |
| Services/Bunker/Recovery/RoomRecoveryCoordinator.cs, ExecuteAsync | Channel.ReadAllAsync + паралельний PeriodicTimer task | Серіалізує persistence work через single reader. |
| Services/Bunker/Rooms/PlayerDisconnectCleanupCoordinator.cs, RunCleanupAsync | fire-and-forget _ = RunCleanupAsync; Task.Delay із linked cancellation token | Реалізує reconnect grace period та скасування за rejoin. |
| Hubs/BunkerHubGame/GameHub.Lobby.cs, StartGameFromLobby | state mutation, await CompleteLobbyStart, потім best-effort DB history | Показує чітке розділення критичного realtime flow і secondary persistence. |
| Services/OwnerContent/ContentDocumentService.cs, AtomicWriteAsync | async temp write, FlushAsync, перевірка, atomic File.Move | Приклад durable file update із валідацією перед replace. |
| Services/Spy/SpyTimerExpiryService.cs, ExecuteAsync | PeriodicTimer + cancellation-aware SendAsync | Малий читабельний background service. |
| Services/Profile/ProfileGameHistoryService.cs | async EF aggregate, pagination, projection | Query composition без передчасного materialization. |

## 10. Collections і LINQ: фактичні приклади

| Файл | Приклад | Значення |
|---|---|---|
| Models/Game/Voting/VotingSession.cs | Votes.GroupBy(v => v.Value).ToDictionary(...) | Підраховує голоси за candidate і застосовує multiplier. |
| Services/Profile/ProfileGameHistoryService.cs | Where → OrderByDescending → Select → Skip/Take → ToListAsync | Безпечна server-side pagination профільної історії. |
| Services/Bunker/ApocalypseEffects/ApocalypseEffectEngine.cs | GroupBy(RoomService.GetPlayerKey), ToDictionary, Distinct, snapshots | Нормалізує player set і готує rollback map. |
| Services/Bunker/Content/ScenarioImageService.cs | HashSet дозволених extensions та Dictionary cache | Простий cache, але без синхронізації — див. ризики. |
| Services/Bunker/Rooms/RoomRecoveryCaptureService.cs | TakeLast(MaxAuditEntries).Select(Clone).Where(...).ToList | Обмежує розмір persisted audit trail. |
| Services/Spy/SpyRoomService.cs | activePlayers → GroupBy VoteTarget → ToDictionary | Будує vote progress для клієнта. |
| Services/Bunker/Threats/ThreatPoolSelector.cs | Filter valid/special/text pools з Func predicates | Декларує policy selection без прив’язки до Random. |

## 11. Делегати, події й callbacks

| Механізм | Де | Фактична роль |
|---|---|---|
| C# event Action<string> RoomRemoved | RoomService.cs; RoomRecoveryCoordinator.cs | RoomService.RemoveRoom викликає RoomRemoved?.Invoke(roomId); recovery coordinator підписується QueueDelete і відписується у Dispose. |
| Func<ThreatData,bool>, Func<int,int,int> | ThreatPoolSelector.Select | Ін’єкція availability policy і random/index function у вибір загрози. |
| Func<int,int,int> | RoomGameSettingsService.FreezeForStart | Дозволяє caller-у передати random function для resolved random bunker capacity. |
| Action<RoomGameSettings> | RoomGameSettingsService.With | Використовується для конфігурації preset-ів. |
| SignalR client callbacks | domain signalr-events.js і spy.js | connection.on(event, handler), перед яким використовується connection.off(event) для запобігання повторній реєстрації. |
| IHubContext callbacks | GameTimerExpiryService, SpyTimerExpiryService, disconnect cleanup | Background services надсилають клієнтам стан поза Hub invocation. |

## 12. JSON serialization: повний практичний шлях

### Контент

~~~text
wwwroot/data/*.json
→ GameDataService / ScenarioContentRegistry
→ типізовані Models.GameData або ScenarioDefinition
→ CharacterGeneratorService / selection / scheduler / effect services
→ explicit client projections у GameHub
→ System.Text.Json SignalR payload до JavaScript
~~~

GameDataService використовує System.Text.Json із PropertyNameCaseInsensitive і вантажить каталоги професій, хобі, health conditions, items, traits, phobias, facts, apocalypse, bunker, threats, cards і properties. Для apocalypse він виконує строгі валідації version/count/category/theme/ID/localization.

ScenarioContentRegistry читає scenario JSON як JsonDocument/JsonElement, валідовує форму та посилання, зберігає content definitions для scheduler/runner.

### Recovery і snapshots

~~~text
mutable Room
→ RoomSnapshotService.CaptureState (copy state)
→ RoomRecoveryCaptureService формує RoomRecoverySnapshotData
→ JsonSerializer.Serialize
→ SHA-256 fingerprint
→ RoomRecoverySnapshotEntity.StateJson у SQLite
→ startup Deserialize + fingerprint/schema validation
→ RoomService.TryRegisterRecoveredRoom
~~~

RoomRecoveryCaptureService має власний JsonTypeInfoResolver modifier, який забороняє серіалізацію Player.ConnectionId. Raw password у recovery data не записується; зберігається hash.

### JSON контент-редактор

Owner content flow:

1. ContentDocumentRegistry будує whitelist JSON-файлів дозволених roots, перевіряє canonical path і reparse points.
2. ContentDocumentService читає strict UTF-8 і лімітує розмір.
3. Validator перевіряє proposed content.
4. Save порівнює expected SHA-256 hash, створює backup, записує temp file, повторно валідовує і atomic replace.
5. Reload coordinator повертає status; descriptor нині позначає restart_required.

## 13. Винятки, валідація й помилки

### Рівні валідації

| Рівень | Приклади |
|---|---|
| HTTP/model binding | Register/Edit profile перевіряють ModelState, display name 2–32, antiforgery; Identity повертає свої errors. |
| Hub membership/authority | Room/host/developer/GM capability checks у GameHub; HubException для protocol errors; Caller.ReceiveError для керованого UI feedback. |
| Lifecycle/phase | LobbyStartService, RoundVotingAdminService, VotingSession, threat/scenario methods перевіряють State, GamePhase, pause, readiness, idempotency command IDs. |
| Domain argument validation | BunkerResourceService кидає ArgumentOutOfRangeException; GameSessionHistoryService — ArgumentException; scenario registry/effect engine — InvalidDataException або InvalidOperationException на невалідний content/contract. |
| Persistence/recovery | fingerprint/schema перевірки; JSON/Format exceptions перетворюються на failed restore/skip із логом. |
| Owner content | ContentEditorException має code+HTTP status; OwnerContentController мапить його на контрольований response. |

### Помітні захисні механізми

- Idempotency: ProcessedLobbyCommandIds, ProcessedSpecialCardCommandIds, ProcessedGm*CommandIds, snapshot command cache, Spy ProcessedCommandIds.
- Preview-before-destructive-operation: lobby start, GM threat force, snapshots, global-content rollback/migration, postgame publish.
- Snapshot rollback: Scenario execution та apocalypse effect engine.
- Constant-time checks: RoomRecoverySecurity застосовує CryptographicOperations.FixedTimeEquals для reconnect hash, password hash і fingerprint.
- Ліміти: command ID, room/player name, document size, backup count, timer/resource values, pagination, draft fields.

## 14. Тести

### Наявні шари

Станом на аудит:

| Шар | Кількість файлів/тестів | Характер |
|---|---:|---|
| xUnit | 61 source files, 374 Fact/Theory attributes | Services, recovery, settings, threats, effects, GM/privacy, persistence, profile. |
| JavaScript contracts | 86 files, 418 node:test cases | Статичні структури JS/Razor, load order, DOM contracts, UI/text checks. |
| Playwright | 47 spec files, 113 test declarations | Browser workflow, multi-user, visual/snapshot, responsive flows. |

### Сильні покриті області

- recovery не зберігає raw room password/reconnect token/connection IDs: **Tests/Bunker.UnitTests/Services/RoomRecoveryTests.cs**;
- apocalypse effect rollback і activation policy;
- lobby start/guest warning/settings;
- snapshot/undo, diagnostics, GM permissions і privacy boundaries;
- threat scaling, radiation minigame, plan choice;
- owner content path safety і atomic write;
- profile game history та EF mappings;
- JavaScript load order / SignalR decomposition / UI contract tests.

### Підтверджена проблема contract-тесту

Запущено рівно один релевантний focused test:

~~~text
node --test Tests\JavaScript.Contracts\game-js-signalr-events-modularization.test.js
Результат: 11 passed, 15 failed, exit code 1
~~~

Причина не виглядає runtime-регресією SignalR:

- тест очікує 110 connection.on/off саме у **wwwroot/js/bunker/core/signalr-events.js**;
- у поточній архітектурі core — оркестратор, а 110 pair фактично знаходяться у domain signalr-events.js files;
- **Views/Bunker/Index.cshtml** завантажує ці domain files перед core;
- **game.js** містить очікуваний bootstrap рядок if (typeof registerSignalREvents === 'function') registerSignalREvents();, але наступна перевірка тесту сама ігнорує будь-який рядок із typeof і тому не бачить цей виклик;
- остання перевірка тесту також помилково класифікує declaration як top-level call.

Отже це підтверджений тестовий drift/суперечність. Потрібно оновлювати саме test contract під доменну структуру, а не переносити runtime handlers назад у core.

### Непокриті критичні сценарії

Не знайдено тесту, який перевіряє:

- replace/clear lobby password до і після RoomRecovery capture/restore;
- захоплення чужого Spy playerId або вимогу proof-of-possession під час Spy reconnect;
- конкурентні upload/remove одного scenario image;
- concurrency/lock-order stress для одночасних hub commands і background recovery/timer work.

## 15. 20 найкорисніших файлів для вивчення C#

| Рівень | Файл | Чого навчитися |
|---|---|---|
| Початковий | Program.cs | Composition root, middleware, Identity, EF, hosted services, hub mapping. |
| Початковий | Controllers/AccountController.cs | MVC POST, ModelState, Identity, local redirect safety. |
| Початковий | Data/Persistence/BunkerDbContext.cs | EF DbContext та конфігурації. |
| Початковий | Models/Game/Rooms/Room.cs | Aggregate state, enums, JsonIgnore, derived properties. |
| Початковий | Models/Game/Voting/VotingSession.cs | Станова модель, LINQ, DTO projection, voting privacy. |
| Початковий | Services/Bunker/Rules/BunkerResourceService.cs | Малий чистий domain service і guard clauses. |
| Початковий | Services/Bunker/Rules/BunkerCapacityPolicy.cs | Typed parsing і policy boundary. |
| Початковий | Services/Profile/ProfileGameHistoryService.cs | EF LINQ, pagination, immutable records. |
| Середній | Services/Bunker/GameSessions/GameSessionHistoryService.cs | EF mutation lifecycle, idempotency, ExecuteUpdateAsync. |
| Середній | Services/Bunker/Rooms/RoomService.cs | In-memory registry, join/rejoin, locks, state transitions. |
| Середній | Services/Bunker/GameFlow/LobbyStartService.cs | Preview token, fingerprint, validation, concurrent dictionaries. |
| Середній | Services/Bunker/Rooms/RoomGameSettingsService.cs | Settings migration, validation, clone/freeze, preset design. |
| Середній | Services/Bunker/GameFlow/GameTimerService.cs | TimeProvider, timer state, pause/resume/expiration. |
| Середній | Services/Bunker/Recovery/RoomRecoverySnapshotStore.cs | Async scope з singleton і EF persistence. |
| Середній | Services/Bunker/Recovery/RoomRecoveryCaptureService.cs | Safe JSON serialization, fingerprints, restore. |
| Середній | Services/OwnerContent/ContentDocumentService.cs | Atomic file update, backup, optimistic hash conflict. |
| Просунутий | Hubs/BunkerHubGame/GameHub.Rooms.cs | SignalR lifecycle, caller/group projections, reconnect. |
| Просунутий | Hubs/BunkerHubGame/GameHub.Voting.cs | Authoritative realtime state machine. |
| Просунутий | Services/Bunker/ApocalypseEffects/ApocalypseEffectEngine.cs | Handler registry, transaction-like snapshot rollback. |
| Просунутий | Services/Bunker/Scenarios/ScenarioContentRegistry.cs | Strict declarative JSON validation. |

## 16. Маршрут навчання на базі цього репозиторію

1. Прочитати Program.cs і Bunker.csproj: як web application збирається.
2. Пройти AccountController → ApplicationUser → BunkerDbContext → migrations, щоб зрозуміти Identity/EF.
3. Вивчити прості value/policy services: BunkerCapacityPolicy, BunkerResourceService, GameTimerState.
4. Вивчити Room, Player, VotingSession, а потім RoomService; виписати інваріанти кімнати.
5. Пройти lobby flow: LobbyStartService → RoomGameSettingsService → GameHub.Lobby → GameHub.Rooms.
6. Пройти SignalR flow у двох напрямах: game.js invoke → GameHub method → domain service → client event handler.
7. Вивчити persistence: GameSessionHistoryService, RoomRecoveryCaptureService, RoomRecoveryCoordinator, RoomRecoverySnapshotStore.
8. Вивчити rollback/stability patterns: RoomSnapshotService, ApocalypseEffectEngine, ContentDocumentService.
9. Потім переходити до великих bounded domains: threats, scenarios/event cards, GM/postgame.
10. Окремо порівняти SpyRoomService із RoomService: це добрий приклад того, як різні security/reconnect constraints змінюють дизайн.

## 17. Приклади питань для технічної співбесіди за кодом Bunker

| Питання | На що послатися у репозиторії | Сильна відповідь |
|---|---|---|
| Як singleton може безпечно використати scoped DbContext? | RoomRecoverySnapshotStore | Створити IServiceScopeFactory.CreateAsyncScope, отримати DbContext усередині scope, await using закриває його. |
| Як зробити reconnect не прив’язаним до SignalR connection ID? | RoomService.RejoinRoom, RoomRecoveryCaptureService | Використати stable ID плюс authenticated account або secret reconnect token; connection ID — тимчасовий transport identifier. |
| Як приховати голоси до завершення voting? | VotingSession.ToClientInfo | Модель зберігає повні дані серверно, а DTO projection приймає showVotes і не додає voters до публічного payload. |
| Як зробити небезпечну зміну відкотливою? | ApocalypseEffectEngine, RoomSnapshotService | Зняти copy/snapshot перед мутацією, валідувати результат, у catch/failure повернути попередній state. |
| Чому JSON не повинен виконувати технічну логіку? | ScenarioContentRegistry + EventSpecialCardService | JSON описує контент/parameters; C# whitelist handlers є authoritative execution boundary. |
| Як уникнути stale UI command? | LobbyStartService.Preview/TryConsume | Token короткого життя пов’язаний із room, host, state version і fingerprint. |
| Що таке optimistic concurrency для файлу? | ContentDocumentService.SaveAsync | Порівнювати expected SHA-256 з current hash під per-file lock, інакше повернути conflict. |
| Які ризики має mutable singleton game state? | Room, RoomService, timers/recovery/hubs | Потрібні узгоджені locks, визначений lock order і stress tests; ConcurrentDictionary не синхронізує поля Room. |
| Що не так із client-generated identity? | SpyRoomService.JoinRoom | Identity має доводитися server-side secret/account proof, а не тільки публічним ID. |
| Навіщо використовувати TimeProvider? | Timer/recovery/spy services | Детермінованіші тести й централізована робота з часом. |

## 18. Потенційні проблемні зони без пропозиції широкого рефакторингу

| ID | Рівень | Статус доказу | Фактичні докази | Вплив | Точний наступний крок |
|---|---|---|---|---|---|
| P1 | High | Підтверджено статично | RoomService.CreateRoom встановлює і Password, і PasswordVerificationHash; GameHub.Lobby.SetLobbyPassword змінює лише Password; Capture хешує password лише якщо hash порожній; restore зануляє Password і залишає hash. | Якщо початковий пароль A замінити на B, runtime використовує B, але recovery зберігає A; після рестарту A лишається прийнятним, B — ні. Якщо password очистити, старий hash лишається, HasPassword залишається true і старий пароль фактично не вимикається. | Зробити password+hash однією атомарною domain mutation, очистити hash при disable, додати один focused recovery test для create → change → clear → restore. |
| P2 | High | Підтверджено статично | SpyHub.JoinSpyRoom приймає playerId; SpyRoomService.JoinRoom при збігу ID перепризначає existing.ConnectionId і Name без account/token proof; BuildClientState віддає playerId усіх players; spy.js зберігає ID лише у localStorage. | Учасник із room code і побаченим playerId може захопити identity іншого, включно з host/spy роллю, vote та settings control. | Ввести server-issued reconnect secret або Identity binding для Spy; зберігати лише hash server-side; додати negative takeover test. |
| P3 | Medium | Перевірено виконанням | node --test Tests\JavaScript.Contracts\game-js-signalr-events-modularization.test.js: 15/26 failure. Test очікує handlers у core, але поточні 110 on/off — у domain files; також його typeof/top-level евристики внутрішньо суперечливі. | CI/static contract дає хибний червоний статус і перестає захищати справжній load order. | Переписати лише цей test під current architecture: aggregate domain files, orchestrator order і один actual bootstrap call. |
| P4 | Medium | Ризик, race не відтворено | RoomService — singleton registry, але Room містить звичайні Dictionary/List/HashSet і багато різних lock roots. Їх мутують hub invocations, timer expiry, recovery та delayed cleanup. | Можливі рідкісні state race/deadlock/partial projection за одночасних команд. | Документувати lock order і додати малий concurrency test для критичних room mutations; не робити широкий state-store rewrite без репродукції. |
| P5 | Medium | Підтверджено структурно | GameHub має дуже великий constructor і fallback new-залежності; GameHub.GameMaster.cs ≈2229 рядків, GameHub.Threats.cs ≈2219, GameHub.SpecialCards.cs ≈1485, CharacterGeneratorService.cs ≈1476, GameDataService.cs ≈1222, RoomService.cs ≈1012. | Висока cognitive load, складніші unit tests, підвищений ризик непомітного cross-domain side effect. | Для наступних feature-змін витягати тільки одну завершену command/use-case seam за раз, не створювати паралельний hub. |
| P6 | Low | Підтверджено структурно | Room.Password і Room.HostToken є public serializable properties без JsonIgnore; нинішні GameHub payloads застосовують ToPublicInfo/explicit projections, а recovery DTO їх не записує. | Сьогодні raw Room не знайдено у зовнішньому payload, але випадкова майбутня JsonSerializer.Serialize(room) або SendAsync(room) створить secret-leak footgun. | Додати JsonIgnore на secret runtime fields або окремий DTO boundary; перед цим перевірити всі internal serialization scenarios. |
| P7 | Low | Підтверджено структурно | ScenarioImageService — singleton з mutable Dictionary caches без lock; SaveImage видаляє старий файл, потім пише новий FileMode.Create; валідує extension/size, але не content signature. | Конкурентні upload/remove можуть дати inconsistent cache/file; невдалий write після delete втрачає старий image. | Додати per-image lock + temp/atomic replacement і, за security policy, magic-byte decode/validation. |
| P8 | Low | Спостереження | Random у GameHub, SpyRoomService та static Random у CharacterGeneratorService не всюди ін’єктований. | Менш детерміновані tests/складніше відтворити випадковий defect. | Для нових правил передавати random abstraction у точку policy, як це вже робить ThreatPoolSelector; не переписувати все одразу. |

### Важлива відмінність між P1/P2 і припущеннями

P1 випливає з повного deterministic flow конкретних методів і не потребує навантажувального тесту. P2 також є прямою властивістю протоколу: proof-of-possession не перевіряється. P4 є лише обґрунтованим concurrency ризиком, а не заявою про вже відтворений race.

## 19. Глосарій

| Термін | Значення в Bunker |
|---|---|
| Room | Aggregate основної гри Bunker: membership, rules, gameplay, audit, snapshots. |
| RoomService | Singleton реєстр active Bunker rooms і connection mapping. |
| StablePlayerId | Client-persisted стабільний ID Bunker player для reconnect continuity; додатково захищається account/reconnect token. |
| Reconnect token | Секрет, що видається caller-у і зберігається як hash для recovery/rejoin Bunker. |
| GameHub | Основний SignalR command/API boundary. |
| Projection | Навмисно сформований payload для конкретної аудиторії замість raw state object. |
| Lobby preview token | Одноразовий 30-секундний token, що захищає start від stale state. |
| FrozenGameSettings | Settings snapshot, зафіксований перед стартом гри. |
| Room snapshot | In-memory safety snapshot для GM restore/undo. |
| Recovery snapshot | SQLite JSON snapshot для restart recovery кімнати. |
| GmMode | PlayerHost, TechnicalGm або OmniscientGm. |
| Developer | Identity owner, визначений OwnerAccess.UserId; має окремі privileged capabilities. |
| ThreatInteractionState | Aggregate стану поточної threat operation. |
| Event special card | Runtime card, визначена сценарним JSON, виконувана C# EventSpecialCardService. |
| Bunker intel | Інформація про bunker із public/private projection rules. |
| GameSession | EF історичний запис запущеної/завершеної/abandoned гри. |
| Idempotency command ID | Ключ, який не дозволяє повторно застосувати мутацію при retry/reconnect. |
| SpyRoom | Незалежна, in-memory кімната режиму Spy. |
| Owner content editor | Захищений HTTP JSON editor із backup, optimistic hash conflict і atomic write. |

## 20. Підсумок рівня проєкту й перші 10 файлів

### Оцінка поточного технічного рівня

Проєкт показує **впевнений middle+/senior-oriented приклад складного ASP.NET Core realtime моноліту**:

- сильні сторони: серверна авторитетність основних правил, recovery design, Identity, explicit privacy projections, snapshot/rollback, багаторівнева тестова інфраструктура, валідація контенту;
- головні ризики: безпека/цілісність пароля lobby, слабка identity модель Spy, велика концентрація відповідальностей у GameHub, mutable singleton state і test drift.

Найкращий наступний пріоритет — не широкий рефакторинг, а закрити P1 і P2 окремими малими, протестованими змінами, після чого привести P3 contract test у відповідність до фактичного JS layout.

### Перші 10 файлів для читання

1. Program.cs
2. Bunker.csproj
3. Models/Game/Rooms/Room.cs
4. Models/Player/Player.cs
5. Services/Bunker/Rooms/RoomService.cs
6. Hubs/BunkerHubGame/GameHub.Rooms.cs
7. Hubs/BunkerHubGame/GameHub.Lobby.cs
8. Services/Bunker/GameFlow/LobbyStartService.cs
9. Services/Bunker/Recovery/RoomRecoveryCaptureService.cs
10. Services/Bunker/Recovery/RoomRecoveryCoordinator.cs

Після них логічно переходити до GameHub.Voting.cs, VotingSession.cs, GameHub.Threats.cs, ApocalypseEffectEngine.cs і ScenarioContentRegistry.cs.

## Перевірки, виконані під час аудиту

| Перевірка | Результат |
|---|---|
| Читання структури, startup, DI, моделей, services, hubs, Razor load order, JS handlers і тестів | Виконано у режимі лише читання. |
| Focused JavaScript contract test | Виконано; 11 pass / 15 fail. Причину розібрано в розділі 14. |
| Повний xUnit / Playwright / npm suite | Не запускався: не потрібен для документаційного аудиту та за політикою репозиторію не слід запускати повні suites без окремого запиту. |
| Runtime E2E перевірка P1/P2 | Не запускалася; висновки P1/P2 є статичними, з прямими шляхами коду, описаними в розділі 18. |
