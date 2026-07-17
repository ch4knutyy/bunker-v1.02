# Bunker / Vault Judgment

Онлайн-соціальна гра за мотивами настільного «Бункера», у якій гравці отримують випадково згенерованих персонажів, поступово розкривають характеристики, обговорюють загрози та голосують, хто отримає місце в бункері.

Проєкт побудований на ASP.NET Core, SignalR і Razor. Гра підтримує багатокористувацькі кімнати, reconnect, гнучкі налаштування сесії, інтерактивні загрози, snapshots та локалізацію UA / RU / EN.

---

## Основні можливості

### Кімнати та lobby

- створення та приєднання до онлайн-кімнат;
- ролі host, gameplay player і spectator;
- ready state;
- host transfer;
- reconnect після refresh або короткого відключення;
- randomized canonical SeatNumber після старту;
- пароль і блокування приєднання;
- керування учасниками;
- read-only summary налаштувань для non-host.

### Налаштування гри

Lobby використовує canonical `RoomGameSettings` із versioning, revision conflict protection та atomic Apply.

Підтримуються:

- presets:
  - Classic;
  - Calm;
  - Dangerous;
  - Hardcore;
  - Quick;
  - Long;
  - Custom;
- мінімальна та максимальна кількість гравців;
- місткість бункера:
  - Automatic;
  - Manual;
  - Random Range;
- увімкнення/вимкнення загроз;
- частота інтерактивних загроз;
- раунд початку та частота загроз;
- максимальна кількість загроз;
- timer presets;
- voting rules;
- кількість special cards;
- starting inventory;
- bonus inventory;
- Apocalypse/Bunker toggles;
- spectators;
- room join lock;
- local presets;
- import/export JSON.

Після старту налаштування заморожуються та використовуються як canonical source of truth для поточної гри.

### Генерація персонажів

Персонажі можуть містити:

- особисті дані;
- вік і стать;
- статуру;
- професію;
- фізичне здоров’я;
- психічне здоров’я;
- хобі;
- риси характеру;
- фобії;
- факти;
- інвентар;
- special cards;
- secret goal;
- додаткові фізичні стани.

### Ігровий процес

- покрокове розкриття характеристик;
- public/private state;
- round lifecycle;
- server timer;
- голосування та виключення;
- місткість бункера;
- special cards;
- bonus inventory;
- snapshots та undo;
- room-local audit/history;
- host і advanced GM controls.

### Загрози

Гра підтримує:

- ordinary text threats;
- інтерактивні загрози:
  - `radiation_leak`;
  - `air_filter_failure`;
- persisted `CurrentThreat`;
- success/failure/timeout finalization;
- idempotent effects;
- threat scheduler;
- repeat prevention;
- reconnect і snapshot recovery;
- privacy-safe unrevealed state.

### Сценарії

- Apocalypse;
- Bunker;
- Threat;
- стабільні ID;
- локалізований контент;
- зображення та fallback;
- room-local state.

### Локалізація

Підтримувані мови:

- українська;
- російська;
- англійська.

---

## Технології

- .NET / ASP.NET Core
- SignalR
- Razor Views
- C#
- JavaScript
- CSS
- JSON content files
- xUnit
- Playwright

---

## Структура тестів

### Unit tests

xUnit-тести перевіряють:

- lobby settings;
- start validation;
- snapshots;
- voting;
- threat selection;
- threat lifecycle;
- bunker capacity;
- randomized seats;
- reconnect-related services;
- privacy boundaries.

### Frontend та E2E

Playwright і JS-тести перевіряють:

- створення та приєднання до кімнати;
- lobby;
- ready/start flow;
- host transfer;
- reconnect;
- reveal;
- voting;
- threat scenarios;
- desktop/mobile layouts;
- lobby → running handoff;
- відсутність прихованих даних у DOM.

---

## Як запустити локально

### 1. Вимоги

Встановити:

- .NET SDK відповідної версії;
- Node.js;
- npm.

### 2. Відновити .NET-залежності

```bash
dotnet restore
```

### 3. Зібрати проєкт

```bash
dotnet build
```

Для solution-файлу:

```bash
dotnet build Bunker.slnx
```

### 4. Запустити застосунок

```bash
dotnet run
```

Відкрити адресу, яку ASP.NET Core покаже в консолі.

---

## Як запустити тести

### .NET tests

```bash
dotnet test
```

### Playwright

Встановити frontend-залежності:

```bash
npm install
```

Встановити браузери:

```bash
npx playwright install
```

Запустити тести:

```bash
npm test
```

Додаткові команди, якщо вони визначені в `package.json`:

```bash
npm run test:ui
npm run test:headed
npm run test:report
```

---

## Поточний статус

Основне ядро гри вже працює:

- multiplayer rooms;
- reconnect;
- lobby settings;
- voting;
- timer;
- threats;
- snapshots;
- responsive UI;
- localization;
- targeted automated tests.

Найближчі етапи:

1. Lobby-3 Visual Polish.
2. Scenario Image Persistence Audit.
3. UI Bugfix Pass.
4. Footer/legal pages.
5. GM Panel Simplification.
6. Full Regression.
7. Ngrok multiplayer playtest.
8. Profession Abilities v1.
9. Pseudorandom Character Generation.
10. Physical/Mental Health v2.

---

## Roadmap

- [ROADMAP.md](ROADMAP.md)
- [docs/backlog.csv](docs/backlog.csv)

---

## Автор

Dima — [ch4knutyy](https://github.com/ch4knutyy)