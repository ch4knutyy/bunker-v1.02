# ROADMAP: Bunker / Vault Judgment

**Період:** липень 2026 — червень 2027  
**Версія:** актуалізована v2  
**Стан:** робочий план після завершення Lobby-3 Functionality  
**Формат дедлайнів:** орієнтовний, із пріоритетом на стабільність і реальні playtests

---

## 1. Головна мета на рік

Довести Bunker / Vault Judgment до стану, де:

- повна партія стабільно проходить від Lobby до завершення;
- refresh/reconnect не руйнує кімнату, раунд, голосування, загрози або характеристики;
- host, player, spectator і Technical GM мають чітко розділені можливості;
- інтерфейс працює на desktop, laptop і mobile;
- підтримуються UA / RU / EN;
- є достатній контентний банк;
- гра має власні механіки:
  - інтерактивні загрози;
  - гнучкі налаштування кімнати;
  - здібності професій;
  - псевдорандом персонажів;
  - спеціальні карти;
  - room-local сценарії та події;
- можна провести закриту beta-гру без ручного втручання в код.

---

## 2. Поточний стан проєкту

### Уже завершено або стабільно працює

#### Ядро гри

- ASP.NET Core + SignalR.
- Lobby / Running / Finished lifecycle.
- Gameplay players і spectators.
- Readiness.
- Validated StartGameFromLobby.
- Reconnect і refresh recovery.
- Host transfer.
- Randomized canonical SeatNumber.
- Character generation після успішного старту.
- Reveal характеристик.
- Voting.
- Server timer.
- Snapshots і undo.
- Privacy boundary для host, spectator і OM.

#### Загрози

- Ordinary text threats.
- Interactive threats:
  - `radiation_leak`;
  - `air_filter_failure`.
- Canonical threat lifecycle.
- Finalization success/failure/timeout.
- Persisted CurrentThreat.
- EffectsApplied/idempotency.
- Threat scheduler.
- Налаштування:
  - On/Off;
  - first round;
  - frequency;
  - max count;
  - repeat prevention;
  - interactive probability.

#### Lobby-3 functionality

- Canonical `RoomGameSettings`.
- Version = 1.
- SettingsRevision.
- Revision conflict handling.
- Atomic Apply.
- Host-only / Lobby-only editing.
- Freeze settings after start.
- Snapshot coverage.
- Safe public DTO.
- Presets:
  - Classic;
  - Calm;
  - Dangerous;
  - Hardcore;
  - Quick;
  - Long;
  - Custom.
- Max gameplay players.
- Min gameplay players.
- Bunker capacity:
  - Automatic;
  - Manual;
  - Random Range.
- Timer presets.
- Voting settings.
- Special cards count.
- Starting inventory.
- Bonus inventory.
- Spectators.
- Room join lock.
- Password update.
- Kick / role change / ready reset / host transfer.
- Local presets.
- Import/export JSON.
- Host editor.
- Non-host read-only summary.
- UA / RU / EN.

#### UI

- Character Cards.
- Special Cards.
- Apocalypse.
- Bunker.
- Threat.
- Player Overview.
- All Players Comparison.
- Global site shell.
- Lobby v1 readability.
- Responsive layouts.
- Tooltips.
- Scenario images.
- Category visual identities.

#### Tests

- xUnit.
- JS static/logical tests.
- Playwright Chromium.
- Privacy tests.
- Lobby tests.
- Reconnect tests.
- Snapshot tests.
- Voting tests.
- Threat lifecycle tests.
- Seat assignment tests.
- Player Comparison tests.
- Mobile tests.
- RoomGameSettings tests.

---

## 3. Актуальні пріоритети

### P0 — критично

1. Lobby-3 Visual Polish.
2. Scenario Image Persistence Audit.
3. UI Bugfix Pass.
4. GM Panel Simplification.
5. Full Regression.
6. Ngrok multiplayer playtest.
7. Playtest bugfixes.

### P1 — дуже важливо

1. Profession Abilities v1.
2. Pseudorandom Character Generation.
3. Physical/Mental Health Content System.
4. Large Items.
5. Special Card cleanup.
6. Localization cleanup.
7. Footer/legal pages.

### P2 — після стабільного ядра

1. Велике масове наповнення контенту.
2. Advanced profession abilities.
3. New game modes.
4. Presidents Mode.
5. Monetization.
6. Steam wrapper.
7. DLC.

---

# 4. Етапи

## Етап 1 — Липень 2026
### Ціль: завершити Lobby-3 і підготувати проєкт до реального playtest

### 1.1 Lobby-3 Visual Polish

Зробити:

- compact room top bar;
- participant roster рядками;
- preset selector;
- summary chips;
- вкладки:
  - Основне;
  - Загрози;
  - Раунди;
  - Доступ;
- compact settings rows;
- sticky Apply bar;
- одна Ready/Start action bar;
- read-only summary для non-host;
- collapsed local presets/import/export;
- collapsed lobby audit;
- desktop/laptop/mobile UI.

Не змінювати mechanics.

### 1.2 Scenario Image Persistence Audit

Перевірити:

- Apocalypse images;
- Bunker images;
- Threat images;
- stable scenario ID;
- persistence after server restart;
- reuse in new rooms;
- replace;
- delete;
- metadata;
- orphan files;
- fallback;
- temporary URLs;
- image access permissions.

### 1.3 UI Bugfix Pass

Пройти:

- Character Cards;
- Special Cards;
- Player Comparison;
- Lobby;
- Apocalypse;
- Bunker;
- Threat;
- navbar;
- HUD;
- GM panels.

Шукати:

- grid/pattern поверх images;
- z-index;
- overflow;
- long text;
- duplicate controls;
- stale state;
- wrong localization;
- broken fallback;
- mobile overlap;
- invisible states.

### 1.4 Footer pages

Додати або завершити:

- Конфіденційність;
- Умови використання;
- Контакти.

UA / RU / EN.

---

## Етап 2 — Серпень 2026
### Ціль: завершити керування грою та провести перший повний regression

### 2.1 GM Panel Simplification

Розділити панель на три рівні.

#### Звичайний host

- round;
- timer;
- voting;
- threat;
- players;
- bunker capacity/supplies;
- room events.

#### Advanced

- snapshots;
- undo;
- diagnostics;
- audit;
- room-local editor.

#### Technical GM / OM

- global editor;
- director controls;
- hidden state;
- recovery;
- debug tools.

### 2.2 Full Regression

Прогнати:

- всі unit tests;
- всі JS tests;
- повний Playwright;
- desktop;
- 1366×768;
- mobile;
- 2/6/12 players;
- reconnect;
- host transfer;
- snapshot;
- undo;
- voting;
- threats;
- lobby settings;
- disabled systems;
- privacy;
- randomized seats.

### 2.3 Ngrok Playtest

Провести гру з 4–8 друзями.

Перевірити:

- різні пристрої;
- телефони;
- різні мови;
- lobby settings;
- reconnect;
- host transfer;
- reveal;
- voting;
- special cards;
- ordinary threat;
- interactive threat;
- snapshot/undo;
- довгу сесію.

### 2.4 Playtest Bugfix Pass

Фіксувати:

- незрозумілі кнопки;
- неправильні status labels;
- зависання;
- проблеми з мобільним UI;
- баги після refresh;
- неправильне відновлення стану;
- механіки, які гравці трактують неправильно;
- зайві дії host;
- проблеми балансу.

---

## Етап 3 — Вересень–Жовтень 2026
### Ціль: додати власну механіку здібностей професій

### 3.1 Profession Ability Foundation

Створити canonical систему:

- stable ability ID;
- profession mapping;
- target type;
- usage count;
- cooldown/round restriction;
- server validation;
- idempotency;
- public/private result;
- audit;
- snapshot;
- reconnect;
- localization;
- UI state.

### 3.2 Лікар

- зменшує Physical Health severity на 1 ступінь;
- 1 раз за гру;
- не працює для станів без градації;
- не лікує нижче Stable/None;
- server-side validation;
- public event.

### 3.3 Психолог

- зменшує Mental Health severity на 1 ступінь;
- 1 раз за гру;
- не працює нижче Stable/None;
- не працює для несумісних станів;
- snapshot/reconnect safe.

### 3.4 Шахрай

Потрібно розділити:

- real inventory;
- public displayed inventory;
- temporary forged inventory;
- expiry round;
- reveal behavior;
- reconnect;
- snapshot;
- audit.

v1:

- підміна на 1 раунд;
- 1 раз за гру;
- повернення real inventory після expiry;
- no permanent mutation.

### 3.5 Profession Ability UI

- кнопка здібності;
- target selector;
- remaining uses;
- confirmation;
- result message;
- disabled reason;
- public/private effect display.

### 3.6 Tests

- permission;
- usage limit;
- invalid target;
- duplicate command;
- reconnect;
- snapshot;
- expiry;
- severity boundaries;
- privacy.

---

## Етап 4 — Листопад–Грудень 2026
### Ціль: псевдорандом і health/content architecture

### 4.1 Pseudorandom Character Generation

Створити систему оцінки:

- profession utility;
- physical health severity;
- mental health severity;
- inventory utility;
- hobby usefulness;
- trait impact;
- fact impact;
- special card value.

Правила:

- не створювати ідеального персонажа;
- кожен має хоча б одну значну слабкість;
- сильна професія підвищує шанс сильного мінуса;
- хороше фізичне здоров’я не гарантує хороший mental state;
- уникати однакових шаблонів;
- зберігати хаос;
- не робити всіх однаково поганими.

### 4.2 Character Generation Modes

- Classic;
- Balanced;
- Chaos.

### 4.3 Physical Health v2

- stable ID;
- severity levels;
- severity-specific descriptions;
- treatment compatibility;
- no severity for:
  - amputation;
  - blindness;
  - deafness;
  - permanent anatomical states;
- UA / RU / EN;
- tooltip normalization.

### 4.4 Mental Health v2

- stable ID;
- severity;
- severity-specific descriptions;
- treatment compatibility;
- UA / RU / EN;
- no phobias in mental conditions.

### 4.5 First content wave

Targets:

- Physical Health: 250+;
- Mental Conditions: 100+;
- Hobbies: 250+;
- Traits: 100+;
- Facts: 150+;
- Threats: review existing;
- Apocalypses: quality pass;
- Bunkers: quality pass.

---

## Етап 5 — Січень–Лютий 2027
### Ціль: content expansion, large items і серйозні навантажувальні тести

### 5.1 Large Items System

Окремий content file:

- vehicles;
- generators;
- industrial equipment;
- military equipment;
- heavy tools;
- large food/water reserves;
- machinery;
- fuel systems.

Canonical fields:

- stable ID;
- name;
- description;
- category;
- size;
- usefulness;
- condition;
- requirements;
- localization;
- compatibility tags.

### 5.2 Serious Theft

Після Large Items:

- виправити `Серйозну крадіжку`;
- target validation;
- temporary/permanent behavior;
- public/private result;
- snapshot/reconnect;
- audit.

### 5.3 Content expansion

Targets:

- Physical Health: 500;
- Mental Conditions: 200;
- Hobbies: 500;
- Traits: 200;
- Facts: 300+;
- Special Cards: quality pass;
- Professions: ability-ready metadata;
- Apocalypses: large curated set;
- Bunkers: expanded set;
- Threats: expanded ordinary pool.

### 5.4 Load Testing

Розділити тести:

#### Basic

- 20 simultaneous rooms.

#### Stress

- 50 rooms;
- 100 rooms;
- simultaneous room creation;
- simultaneous joins;
- simultaneous reveal;
- simultaneous voting;
- multiple reconnects;
- long sessions;
- snapshot accumulation.

Використати не лише Playwright.

Розглянути:

- k6;
- NBomber;
- custom SignalR clients.

### 5.5 Logging/Admin Diagnostics

- structured logs;
- room ID;
- command ID;
- settings revision;
- player role;
- lifecycle;
- threat ID;
- snapshot ID;
- error code;
- privacy-safe diagnostics.

---

## Етап 6 — Березень–Квітень 2027
### Ціль: beta-ready version

### 6.1 Localization Cleanup

Повна перевірка:

- UA;
- RU;
- EN;
- lobby settings;
- profession abilities;
- threats;
- health;
- footer pages;
- errors;
- tooltips;
- audit events.

### 6.2 Accessibility

- keyboard navigation;
- focus-visible;
- aria labels;
- touch targets;
- contrast;
- modal focus;
- screen-reader hidden values;
- reduced-motion.

### 6.3 Closed Beta

Група:

- друзі;
- знайомі;
- невелика кількість зовнішніх тестерів.

Зібрати:

- bug reports;
- session duration;
- unclear mechanics;
- balance complaints;
- mobile problems;
- abandoned rooms;
- most used presets;
- threat frequency feedback;
- profession ability feedback.

### 6.4 Beta Bugfix Pass

Пріоритет:

1. crashes;
2. state corruption;
3. privacy leak;
4. reconnect;
5. voting;
6. threat finalization;
7. mobile blocking bugs;
8. balance;
9. cosmetic issues.

---

## Етап 7 — Травень–Червень 2027
### Ціль: release candidate і стратегія монетизації

### 7.1 Release Candidate

Criteria:

- full regression green;
- no known P0 bugs;
- reconnect stable;
- 4–8 player session stable;
- mobile usable;
- UA / RU / EN acceptable;
- legal/footer pages complete;
- logs sufficient;
- backup/recovery plan;
- deployment instructions;
- ngrok replaced by stable hosting for beta/release.

### 7.2 Hosting

Підготувати:

- production environment;
- HTTPS;
- environment variables;
- secrets;
- logs;
- restart strategy;
- file/image storage;
- backups;
- rate limiting;
- health checks;
- basic abuse protection.

### 7.3 Monetization Decision

Розглянути:

- free web version;
- premium host tools;
- cosmetic/content packs;
- Steam desktop wrapper;
- one-time Steam purchase;
- DLC content packs.

Не блокувати core game за надмірною paywall.

### 7.4 Presidents Mode — Prototype

Лише після stable core.

Підготувати:

- короткий design document;
- відмінності від normal Bunker;
- role model;
- negotiation system;
- win conditions;
- minimal prototype;
- no full production scope.

---

# 5. Обов’язковий список тестів

## Functional

- create room;
- join;
- protected room;
- lobby settings;
- revision conflict;
- ready;
- start;
- randomized seats;
- reveal;
- voting;
- timer;
- threats;
- special cards;
- bonus inventory;
- profession abilities;
- round progression;
- reconnect;
- host transfer;
- snapshot;
- undo;
- language switch;
- tooltip;
- finish game.

## Privacy

- host cannot see hidden characteristics;
- spectator public-only;
- OM separate;
- password never returned;
- future scenario not leaked;
- future threat not leaked;
- hidden values absent from DOM;
- secret voting private.

## Profession abilities

- usage limit;
- invalid target;
- duplicate command;
- severity boundary;
- temporary effects expire;
- reconnect;
- snapshot;
- localization.

## UI

- 1920×1080;
- 1440×900;
- 1366×768;
- tablet;
- 390×844;
- landscape mobile;
- long text;
- 2/6/12 players;
- host/non-host/spectator;
- keyboard;
- reduced-motion.

## Load

- 20 rooms;
- 50 rooms;
- 100 rooms;
- simultaneous create;
- simultaneous start;
- simultaneous reveal;
- simultaneous voting;
- reconnect storm;
- long session.

---

# 6. Поточний backlog

## Найближчий

- Lobby-3 Visual Polish.
- Scenario Image Persistence Audit.
- UI Bugfix Pass.
- Footer pages.
- GM Panel Simplification.
- Full Regression.
- Ngrok Playtest.

## Після playtest

- Profession Abilities v1.
- Pseudorandom Generator.
- Physical/Mental Health v2.
- Large Items.
- Serious Theft.
- Localization cleanup.
- Content expansion.

## Deferred

- Majority readiness.
- Late gameplay join.
- Scenario voting/previews.
- Multiple eliminations.
- Alternative tie policies.
- Delayed Special Cards.
- Configurable reconnect grace.
- Automatic role conversion after disconnect.
- Reserve slots.
- Invite regeneration.
- Max rounds.
- Alternative reveal policies.
- Presidents Mode.
- Steam.
- DLC.

---

# 7. Що не потрібно роздувати раніше часу

До стабільного playtest не витрачати багато часу на:

- Steam wrapper;
- Presidents Mode;
- DLC;
- складну монетизацію;
- account system;
- matchmaking;
- public profiles;
- achievements;
- cosmetics;
- складний late join;
- нові великі режими;
- масовий контент без готової architecture.

---

# 8. Найкращий фокус на найближчі 4–6 тижнів

```text
Lobby-3 Visual Polish
→ Scenario Image Persistence Audit
→ UI Bugfix Pass
→ Footer Pages
→ GM Panel Simplification
→ Full Regression
→ Ngrok Multiplayer Playtest
→ Playtest Bugfix Pass
```

Після цього:

```text
Profession Abilities v1
→ Pseudorandom Character Generation
→ Health v2
→ Large Items
→ Content Expansion
```

---

# 9. Definition of Done для beta

Beta-ready означає:

- room створюється та запускається без ручного втручання;
- full game session завершується;
- reconnect не губить canonical state;
- host transfer працює;
- voting private;
- threats finalize exactly once;
- snapshots restore without reroll;
- Lobby settings frozen after start;
- desktop/mobile usable;
- no P0 privacy issues;
- full regression green;
- 4–8 player playtest пройдено;
- footer/legal pages готові;
- UA / RU / EN достатні для beta.

---

# 10. Резюме

Проєкт уже вийшов за межі простого “рандомного бункера”. Стабільне ядро, Lobby-3, інтерактивні загрози, snapshots, OM, Player Comparison і гнучкі room settings уже формують окрему гру.

Правильний порядок далі:

1. завершити UI й persistence;
2. провести full regression;
3. зіграти реальну multiplayer-сесію;
4. виправити playtest bugs;
5. додати Profession Abilities;
6. впровадити псевдорандом;
7. переробити health/content systems;
8. перейти до beta та release candidate.