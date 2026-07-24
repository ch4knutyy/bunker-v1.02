# 02B — Вилучення i18n з game.js

## Метадані

- **Дата**: 2026-07-24
- **Тип**: Впровадження
- **Скоуп**: Модульна міграція i18n-допоміжних функцій та перекладів з моноліту game.js
- **Статус**: Виконано
- **Гілка**: main
- **Стан робочого дерева**: зміни в 17 файлах

---

## Змінено

Вилучено з `wwwroot/js/game.js` та переміщено до нових файлів:

1. **`uiTranslations`** — об'єкт з перекладами для uk/en/ru (базові + розширені через `Object.assign` для кожної мови).
2. **19 чистих i18n-функцій** — функції, які не залежать від DOM, SignalR, таймерів або мутабельного стану.

Скрипти `translations.js` та `localization.js` додано до `Index.cshtml` перед `game.js`.

Тестові файли оновлено: переклад-ключові твердження тепер перевіряють `translations.js`, а не `game.js`.

---

## Файли

### Створено

| Файл | Роль | Рядків |
|------|------|--------|
| `wwwroot/js/bunker/i18n/translations.js` | `uiTranslations` const + 6 `Object.assign` блоків (uk/en/ru) | 568 |
| `wwwroot/js/bunker/i18n/localization.js` | 19 чистих i18n-функцій | 194 |

### Змінено

| Файл | Зміна |
|------|-------|
| `wwwroot/js/game.js` | Видалено `uiTranslations` (рядки 138–703) та 19 функцій (11 036 → 10 294 рядків, −742 рядки) |
| `Views/Bunker/Index.cshtml` | Додано 2 теги `<script>` перед game.js: `translations.js` та `localization.js` |
| `Tests/JavaScript.Contracts/apocalypse-immersive-ui.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/bunker-immersive-ui.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/bunker-food-water.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/global-content-catalog.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/gm-panel-stage3.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/gm-round-voting.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/lobby-game-settings.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/lobby-readability.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/player-overview-ui.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/radiation-operation-completion.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/room-diagnostics-audit.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/room-local-editor.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/room-snapshot-undo.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/threat-audit.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |
| `Tests/JavaScript.Contracts/threat-force-outcome.test.js` | Додано завантаження `translations.js`, твердження перенаправлено |

### Видалено

| Файл | Причина |
|------|---------|
| `wwwroot/js/bunker/i18n/.gitkeep` | Директорія тепер містить реальні файли |

---

## Повторно використано

- Скриптова завантажувальна послідовність `Index.cshtml` (силовий порядок синхронних скриптів)
- `Object.assign` паттерн для розширення `uiTranslations` (збережено з оригіналу)
- Тестовий паттерн `fs.readFileSync` + regex-твердження (збережено, адаптовано до нового файлу)

---

## Перевірки

| Перевірка | Результат |
|-----------|-----------|
| `dotnet build --no-restore` | ✅ 0 errors |
| JS contract tests (full suite, 311) | ✅ 275 pass / 36 fail — ідентично базовому стану |
| `git diff --stat HEAD` | 17 файлів, 40+/766− |
| game.js лінійки | 10 294 (було 11 036) |
| translations.js лінійки | 568 |
| localization.js лінійки | 194 |
| Збереження порядку завантаження скриптів | ✅ signalr-lite → game-utils → translations → localization → game.js → ... |
| Відсутність паралельної заміни | ✅ жодних дублікатів |
| Збереження DOM-залежних функцій у game.js | ✅ `changeLanguage`, `setText`, `setPlaceholder`, `applyStaticTranslations` залишилися |

---

## Не запускалося

- Повний запуск сервера / Playwright — не вимагалося для цієї задачі
- `dotnet test` (xUnit) — не вимагалося, оскільки зміни торкаються лише JS-шару

---

## Припущення

1. Порядок завантаження синхронних скриптів у `Index.cshtml` гарантує, що `uiTranslations` та i18n-функції доступні до моменту виконання `game.js`.
2. Усі 19 вилучених функцій є чистими (без DOM, SignalR, таймерів, мутабельного стану) — підтверджено аудитом.
3. Глобальний доступ через `window` не потрібен, оскільки всі функції є script-scoped (не модулі).
4. 36 попередніх помилок тестів є стабільними попередніми помилками (stale regex failures).

---

## Ризики та ручна перевірка

1. **Ручне завантаження сторінки** — переконатися, що `uiTranslations` доступний до моменту першого виклику `t()`.
2. **Перемикання мови** — перевірити, що `changeLanguage` → `applyStaticTranslations` працює коректно.
3. **Спадкові виклики `t()`** — усі виклики `t()` в game.js тепер звертаються до глобальної функції з `localization.js`, яка звертається до глобального `uiTranslations` з `translations.js`.

---

## Використання токенів

Точні дані про використання токенів недоступні агенту.

---

## Hotfix 02B-HF1 — Bootstrap TDZ and post-game registration

### Root cause

1. **TDZ (Temporal Dead Zone)**: `registerSignalREvents()` was called at line 6 of `game.js`, before all top-level `let`/`const` declarations (lines 37–128). Inside `registerSignalREvents()` at line 4000, `gmThreatCommandPending = false;` was executed synchronously during registration (not in a callback), hitting the TDZ for the `let` variable declared at line 52. This produced `ReferenceError: Cannot access 'gmThreatCommandPending' before initialization` and aborted script execution.

2. **Undefined function call**: Uncommitted diff in `post-game-story-director.js` added `registerSignalREventsForPostGame()` call — a function that does not exist anywhere in the codebase.

### Diff of previous bad change

The previous agent run made two staged changes:
- `game.js`: wrapped call in `typeof` guard (does not fix TDZ — the function IS defined via hoisting)
- `post-game-story-director.js`: added `registerSignalREventsForPostGame()` call and whitespace changes

### Fix

**`wwwroot/js/game.js`**: Moved the bootstrap block (`registerSignalREvents()` call + `connection.start()` + lifecycle handlers) from lines 5–34 (after `const connection`) to after all top-level `let`/`const` declarations (after line 128). This ensures all state variables are initialized before `registerSignalREvents()` executes and accesses them.

**`wwwroot/js/bunker/post-game-story-director.js`**: Removed `registerSignalREventsForPostGame()` call and restored original indentation in the forEach callback block.

### Tests

Created `Tests/JavaScript.Contracts/game-js-bootstrap-order.test.js` with 7 checks:
- `gmThreatCommandPending` declared before `registerSignalREvents()` call
- `currentGameCompletion` declared before bootstrap
- Exactly one executable `registerSignalREvents()` call
- Registration before `connection.start()`
- Exactly one executable `connection.start()`
- No `setTimeout`/`var` workarounds in synchronous bootstrap block
- `post-game-story-director.js` does not reference `registerSignalREventsForPostGame`

Results: **7/7 pass**

### Verification

| Check | Result |
|-------|--------|
| `dotnet build --no-restore` | ✅ 0 errors |
| `game-js-bootstrap-order.test.js` | ✅ 7/7 pass |
| `gm-panel-v2.test.js` | ✅ 11/11 pass |
| `gm-panel-stage3.test.js` | ✅ 10/10 pass |
| `post-game-story-director.test.js` | ✅ 5/5 pass |
| `gm-threat-control.test.js` | ✅ 6/6 pass |
| `game-js-i18n-modularization.test.js` | ⚠️ file does not exist |

### Manual verification (user, Ctrl+F5)

| Пункт | Результат |
|-------|-----------|
| Сторінка завантажується після Ctrl+F5 | ✅ |
| TDZ `gmThreatCommandPending` відсутня | ✅ |
| `registerSignalREventsForPostGame is not defined` відсутня | ✅ |
| `currentGameCompletion is not defined` відсутня | ✅ |
| SignalR connection стартує | ✅ |
| Lobby відображається | ✅ |
| GM Panel відкривається | ✅ |
| Threats tab відкривається | ✅ |
| Перемикання uk/en/ru працює | ✅ |
| F5/rejoin працює | ✅ |
| Console: немає пов'язаних ReferenceError або SyntaxError | ✅ |

Перевірку виконано вручну користувачем у браузері після запуску сервера.

### Changed files

| File | Change |
|------|--------|
| `wwwroot/js/game.js` | Moved bootstrap block after all top-level declarations (−30 lines at top, +30 lines at line ~99) |
| `wwwroot/js/bunker/post-game-story-director.js` | Removed `registerSignalREventsForPostGame()` call, restored tab indentation |
| `Tests/JavaScript.Contracts/game-js-bootstrap-order.test.js` | Rewritten with 7 TDZ/bootstrap contract checks |
| `docs/implementation-reports/2026-07-24-game-js-02b-i18n-extraction.md` | This hotfix section appended |

### Runtime status

✅ **Runtime verification PASSED** — підтверджено користувачем.

### Known limitations

- `game-js-i18n-modularization.test.js` не існує в репозиторії (згадано в попередньому плані, файл не було створено).
- Playwright E2E тести не запускалися.

### 02C unlock criterion

Ручна перевірка виконана, TDZ-регресії та `registerSignalREventsForPostGame` виправлені.
**02C розблоковано.**

### Token usage

Approximate: ~25k tokens (analysis + edits + test iteration).
