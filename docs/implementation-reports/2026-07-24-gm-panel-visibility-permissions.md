# Звіт реалізації: Узгодження visibility GM Panel і технічних контролів із серверними permissions

- **Дата**: 2026-07-24
- **Тип**: Implementation report (Task 01F)
- **Обсяг**: Виправлення неузгодженостей видимості GM Panel, omniscient bootstrap entry та dead code
- **Статус**: Завершено
- **Філія**: `main`
- **Стан робочого дерева**: Змінено `game.js`, `_GmPanel.cshtml`, `gm-panel-v2.test.js`, `gm-panel-stage3.test.js`

---

## Що фактично виконано

### Fix 1: Omniscient GM button visibility timing

**Проблема**: `OmniscientHiddenStateUpdated` handler (`game.js:3848`) оновлював `omniscientHiddenState` та викликав `renderOmniscientHiddenState()`, але НЕ викликав `renderCurrentGameUI()`. Кнопка GM Panel залежить від `omniscientHiddenState` (`game.js:8943`), тому omniscient GM міг тимчасово не бачити кнопку після входу/reconnect до приходу наступного event.

**Рішення**: Додано `renderCurrentGameUI()` після `renderOmniscientHiddenState()` в handler `OmniscientHiddenStateUpdated`.

### Fix 2: Dead legacy code в `updateGMSections()`

**Проблема**: `updateGMSections()` (`game.js:8985`) містив reference на `[data-gm-tab-button="round"]` — legacy tab ID, який не існує у v2 (`game` замість `round`). Це dead code: `querySelector` завжди повертав `null`, `isGameActive` не використовувався більше ніде в функції, + debug `console.log`.

**Рішення**: Видалено `isGameActive`, `roundTab` reference та `console.log`. Функція тепер містить лише `updateRoundStatusUI()` та `renderGMPanelState()`.

### Fix 3: Omniscient bootstrap entry — додатковий захист

**Проблема**: `#gmOmniscientMode` (`_GmPanel.cshtml:634`) не мав `data-gm-advanced`. Хоча елемент знаходиться в табі "technical" (прихованому для ordinary host через `canUseTechnicalTools`), відсутність `data-gm-advanced` означала, що при гіпотетичному доступі до табу елемент був би видимий у simple mode.

**Рішення**: Додано `data-gm-advanced` до `#gmOmniscientMode` — CSS правило `game.css:9051` ховає його в simple mode.

---

## Змінено

| Файл | Зміна | Рядок |
|---|---|---|
| `wwwroot/js/game.js` | `+renderCurrentGameUI()` в `OmniscientHiddenStateUpdated` handler | 3855 |
| `wwwroot/js/game.js` | Видалено dead `roundTab` reference та `console.log` з `updateGMSections()` | 8985-8991 → 8985-8987 |
| `Views/Shared/Bunker/_GmPanel.cshtml` | `data-gm-advanced` до `#gmOmniscientMode` | 634 |
| `Tests/JavaScript.Contracts/gm-panel-stage3.test.js` | +2 тести: omniscient button refresh, dead code removal | +12 рядків |
| `Tests/JavaScript.Contracts/gm-panel-v2.test.js` | +1 assertion: `#gmOmniscientMode` has `data-gm-advanced` | +1 рядок |

---

## Фактична матриця ролей/permissions

### Серверне джерело правди: `GmPanelStateBuilder.cs:23-47`

| Роль | canManageGame | CanViewOmniscientData | CanUseTechnicalTools | GM Panel Button (клієнт) |
|---|---|---|---|---|
| **Host** (не omniscient) | ✅ true | ❌ false | ❌ false | ✅ `isHost` |
| **Developer** (active, canMutate) | ✅ true | ✅ true | ✅ true | ✅ `isDeveloper` |
| **Developer** (read-only) | ❌ false | ✅ true | ❌ false | ✅ `isDeveloper` |
| **OmniscientGm** spectator | ❌ false | ✅ true | ❌ false | ✅ `omniscientHiddenState` (оновлено одразу) |
| **Active player** | ❌ | ❌ | ❌ | ❌ |
| **Spectator** (без GM) | ❌ | ❌ | ❌ | ❌ |

### Клієнтська матриця visibility

| Компонент | Ordinary host | Developer | Omniscient GM | Player/Spectator |
|---|---|---|---|---|
| GM Panel button | ✅ | ✅ | ✅ | ❌ |
| Tab game | ✅ | ✅ | ❌ | ❌ |
| Tab players | ✅ | ✅ | ❌ | ❌ |
| Tab voting | ✅ | ✅ | ❌ | ❌ |
| Tab threats | ✅ | ✅ | ❌ | ❌ |
| Tab bunker | ✅ | ✅ | ❌ | ❌ |
| Tab events | ✅ (advanced only) | ✅ | ❌ | ❌ |
| Tab technical | ❌ | ✅ | ❌ | ❌ |
| Tab overview | ❌ | ✅ | ✅ | ❌ |
| Threat emergency | ❌ | ✅ | ❌ | ❌ |
| Manual round | ❌ | ✅ | ❌ | ❌ |
| Danger zones | ❌ | ✅ | ❌ | ❌ |
| Omniscient bootstrap | ❌ | ✅ (advanced) | N/A (вже omniscient) | ❌ |

---

## Стара vs нова умова видимості

### GM Panel button

**Стара**:
```javascript
// OmniscientHiddenStateUpdated handler
omniscientHiddenState = state;
renderOmniscientHiddenState();
// renderCurrentGameUI() НЕ викликався — кнопка оновлювалася лише з наступним event
```

**Нова**:
```javascript
omniscientHiddenState = state;
renderOmniscientHiddenState();
renderCurrentGameUI();  // кнопка оновлюється одразу
```

### Omniscient bootstrap entry

**Стара**: `#gmOmniscientMode` без `data-gm-advanced` — видимий у advanced mode для будь-якого користувача в technical tab.

**Нова**: `#gmOmniscientMode` з `data-gm-advanced` — прихований у simple mode через CSS. Normal host не бачить technical tab.

### updateGMSections()

**Стара**: 6 рядків, включно з мертвим `roundTab` reference та debug `console.log`.

**Нова**: 3 рядки — лише `updateRoundStatusUI()` та `renderGMPanelState()`.

---

## Host transfer і reconnect

### Host transfer

| Подія | isHost оновлюється? | renderCurrentGameUI()? | Button оновлюється? |
|---|---|---|---|
| `HostChanged` event | ✅ (game.js:3922) | ✅ (game.js:3923) | ✅ |
| `PlayerLeftRoom` з `newHostConnectionId` | ✅ (game.js:3776) | ✅ (game.js:3783) | ✅ |
| Lobby `LobbyStateUpdated` | ✅ (game.js:9566) | ✅ (через renderLobbyState) | ✅ |

**Висновок**: Host transfer працює коректно. Старий host втрачає кнопку, новий — отримує.

### Reconnect

| Подія | Button оновлюється? | GM Panel state? |
|---|---|---|
| `RejoinSuccess` | ✅ (isHost + renderCurrentGameUI) | ✅ (v2 onreconnected → refreshGmPanelV2State) |
| `OmniscientHiddenStateUpdated` (після Fix 1) | ✅ (renderCurrentGameUI) | ✅ (через v2 liveEvents refresh) |
| SignalR `onreconnected` | ✅ (через v2 refreshGmPanelV2State → renderGmPanelV2) | ✅ |

**Висновок**: Reconnect працює коректно. Після Fix 1 omniscient GM не втрачає кнопку.

---

## Тестові зміни

### `gm-panel-stage3.test.js` (+2 тести)

1. **`omniscient hidden state update refreshes GM panel button`**: Перевіряє, що `OmniscientHiddenStateUpdated` handler містить виклик `renderCurrentGameUI()`.

2. **`updateGMSections no longer references legacy round tab button`**: Перевіряє, що `updateGMSections()` не містить `data-gm-tab-button="round"` та `console.log`.

### `gm-panel-v2.test.js` (+1 assertion)

1. **`#gmOmniscientMode` has `data-gm-advanced`**: Додано до існуючого тесту simple/advanced mode.

### Результати

| Тест | Результат |
|---|---|
| `gm-panel-v2.test.js` | ✅ 11/11 |
| `gm-panel-stage3.test.js` | ✅ 7/7 |

---

## Review `gm-panel-stage3.test.js`

Попередні assertions не послаблені без підстав:
- `GetGMThreatControlData` assertion був видалений в 01C (pre-existing failure від видалення legacy `toggleGMPanel`)
- `function switchGMTab(tab)` assertion був видалений в 01D (legacy видалено)
- `getPhaseLabel(getCurrentPhase())` та `getThreatStatusLabel(currentThreatState.threatStatus)` замінені на `function getPhaseLabel`/`function getThreatStatusLabel` в 01D (legacy summary writer видалено, але функції залишаються)
- Всі заміни обґрунтовані видаленням legacy коду, а не послабленням контрактів

---

## Перевірки

| # | Перевірка | Результат |
|---|---|---|
| 1 | `dotnet build --no-restore` | ✅ 0 errors, 0 warnings |
| 2 | `gm-panel-v2.test.js` | ✅ 11/11 |
| 3 | `gm-panel-stage3.test.js` | ✅ 7/7 |
| 4 | `OmniscientHiddenStateUpdated` → `renderCurrentGameUI()` | ✅ підтверджено тестом |
| 5 | `updateGMSections` без dead code | ✅ підтверджено тестом |
| 6 | `#gmOmniscientMode` має `data-gm-advanced` | ✅ підтверджено тестом |
| 7 | Diff: 4 файли, -5/+14 | ✅ локальний, без formatting changes |
| 8 | Role/permission matrix статично | ✅ узгоджена між сервером і клієнтом |

---

## Не запускалося

- Повний xUnit suite
- Повний Playwright suite

---

## Припущення

- V2 `canShowTab()` та `renderTabs()` коректно обробляють permissions для всіх tab
- `safeTab()` fallback працює: overview → перший дозволений tab → game
- CSS `data-gm-advanced` rule (`game.css:9051`) коректно ховає елементи в simple mode
- `HostChanged` event завжди приходить від сервера після `TransferHost`

---

## Ризики та ручна перевірка

Ручна перевірка користувачем — **успішна**:

1. ✅ Ordinary host бачить кнопку GM Panel
2. ✅ Ordinary host не бачить вкладку Technical
3. ✅ У Simple mode omniscient bootstrap прихований
4. ✅ Перемикання Simple/Advanced працює
5. ✅ Звичайний active player не бачить кнопку GM Panel
6. ✅ Після передачі host старий host втрачає кнопку, новий отримує її без F5
7. ✅ Omniscient GM бачить кнопку одразу після входу
8. ✅ Після F5/reconnect кнопка omniscient GM залишається доступною
9. ✅ Developer technical controls працюють
10. ✅ У browser console немає null errors, visibility exceptions або інших пов'язаних JavaScript-помилок

Перевірка — ручна (не Playwright).

---

## Критерії готовності

| # | Критерій | Статус |
|---|---|---|
| 1 | Visibility кнопки GM Panel узгоджена з актуальним server-derived state | ✅ |
| 2 | Ordinary player/spectator не бачить GM Panel | ✅ (не змінювалося, server-side gate) |
| 3 | Ordinary host не бачить technical/omniscient controls без permission | ✅ (`data-gm-advanced` + tab permission) |
| 4 | Omniscient GM не втрачає кнопку через затримку hidden-state event | ✅ (Fix 1) |
| 5 | Developer visibility не зламана | ✅ (не змінювалося) |
| 6 | Permission має пріоритет над simple/advanced mode | ✅ (renderTabs ховає за permission, CSS за mode) |
| 7 | `safeTab()` обробляє втрату permission | ✅ (fallback to overview → first allowed → game) |
| 8 | Host transfer/reconnect поведінка підтверджена | ✅ (static analysis + event chain) |
| 9 | Серверні roles/authorization/contracts не змінені | ✅ |
| 10 | Не створено нового паралельного permission state | ✅ |
| 11 | Вузькі тести не послаблені без підстав | ✅ (всі заміни обґрунтовані) |
| 12 | `dotnet build --no-restore` успішний | ✅ (0 errors, 0 warnings) |
| 13 | Релевантні JS tests успішні | ✅ (11/11 + 7/7) |
| 14 | Diff локальний, без unrelated formatting | ✅ (4 файли, -5/+14) |
| 15 | Runtime UI verification чітко позначено | ✅ Ручна перевірка — успішна |
| 16 | Approval-required дії не виконані | ✅ |

---

## Файли, навмисно залишені незмінними

- `wwwroot/js/bunker/gm-panel-v2.js` — v2 panel logic (permissions, tabs, render) коректний
- `Services/Bunker/Gm/GmPanelStateBuilder.cs` — серверна побудова permissions не змінювалася
- `Models/Game/Gm/GmPanelState.cs` — DTO контракт не змінювався
- `Hubs/BunkerHubGame/GameHub.GmPanel.cs` — hub methods не змінювалися
- `wwwroot/css/game.css` — CSS rules для `data-gm-advanced` вже коректні

---

## Обмеження, що залишилися

1. **Runtime UI verification**: виконано ручну перевірку — успішна.
2. **`canShowTab("events")` line 68**: unreachable в advanced mode (line 61 не блокує, але line 68 перевіряє `canManageRounds` — ті ж permissions, що й game tab). Це не баг, але може бути неочевидним.
3. **Omniscient bootstrap entry в technical tab**: навіть з `data-gm-advanced`, developer бачить його в advanced mode. Це коректно — developer може ввімкнути omniscient mode.
4. **`omniscientHiddenState` як delay-dependent flag**: кнопка тепер оновлюється одразу, але `omniscientHiddenState` як concept залишається залежним від event timing. Поточне рішення достатнє.

---

## Використання токенів

Точні дані про використання токенів недоступні агенту.
