# Звіт реалізації: Видалення legacy `toggleGMPanel` з game.js

- **Дата**: 2026-07-24
- **Тип**: Implementation report (Slice 01C)
- **Обсяг**: Видалення мертвого legacy `toggleGMPanel()` з `game.js`
- **Статус**: Завершено
- **Філія**: `main`
- **Стан робочого дерева**: Змінено `game.js`

---

## Контекст

Аудит GM Panel (2026-07-24) підтвердив, що `toggleGMPanel()` у `game.js:7930` є мертвим кодом: v2 IIFE у `gm-panel-v2.js:153` перезаписує `window.toggleGMPanel` синхронно перед будь-якою взаємодією користувача. Повторна перевірка підтвердила висновок аудиту.

---

## Змінено

Видалено legacy `function toggleGMPanel()` з `game.js` (рядки 7930-7946). Функція використовувала `panel.style.display` для open/close та 7 окремих `connection.invoke()` для оновлення стану — все це повністю замінено v2 реалізацією.

---

## Файли

| Файл | Роль | Статус |
|---|---|---|
| `wwwroot/js/game.js` | Видалено legacy `toggleGMPanel()` (-17 рядків) | Змінено |
| `wwwroot/js/bunker/gm-panel-v2.js` | Єдина реалізація `window.toggleGMPanel` | Незмінний |
| `Views/Bunker/Index.cshtml` | Call site `onclick="toggleGMPanel()"` — резолвиться до v2 | Незмінний |
| `Views/Shared/Bunker/_GmPanel.cshtml` | Call sites (backdrop, close button) — резолвляться до v2 | Незмінний |

---

## Повторно використано

- V2 `toggleGMPanel` (`gm-panel-v2.js:153-163`) — CSS class-based open/close, `setPanelOpen()`, `refreshGmPanelV2State()`
- V2 `refreshGmPanelV2State()` (`gm-panel-v2.js:165-191`) — консолідований `GetGmPanelState` invoke
- V2 live events (`gm-panel-v2.js:3-27`) — 26 подій для безперервного оновлення стану

---

## Перевірки

1. **Визначення до**: 2 (`game.js:7930` + `gm-panel-v2.js:153`)
2. **Визначення після**: 1 (`gm-panel-v2.js:153`)
3. **Call sites**: 5 (3 Razor inline onclick, 1 Escape handler, 1 test) — всі резолвляться до v2
4. **Script load order**: незмінний; v2 завантажується після game.js (рядки 525-528 Index.cshtml)
5. **`dotnet build --no-restore`**: ✅ 0 errors, 0 warnings
6. **`node --test Tests/JavaScript.Contracts/gm-panel-v2.test.js`**: ✅ 11/11
7. **Diff**: 1 файл, -17 рядків, без unrelated formatting

---

## Legacy invoke actions — покриття v2

| Legacy invoke | V2 покриття |
|---|---|
| `GetAllPlayersData` | `GetGmPanelState` (Players) + live event `AllPlayersData` |
| `GetGMThreatControlData` | `GetGmPanelState` (ThreatStatus) + `GMThreatControlData` event |
| `ResyncVotingState` | `GetGmPanelState` (VotingStatus) + voting live events |
| `RunRoomIntegrityCheck` | Explicit click у Technical tab (навмисно не автозапуск) |
| `GetGmAuditLog` | Explicit click у Technical tab |
| `GetRoomSnapshots` | Explicit click у Technical tab |
| `GetRoomLocalEditorData` | Explicit click у Technical tab |

Останні 4 інвоки — діагностичні. V2 навмисно не завантажує їх при кожному відкритті панелі (покращення: менше мережевих запитів).

---

## Не запускалося

- Повний xUnit suite
- Повний Playwright suite
- ~~Runtime UI verification~~ — **перевірено вручну користувачем** (Playwright тест GM Panel відсутній у репозиторії)

---

## Припущення

- Видалення legacy `toggleGMPanel` безпечне, оскільки v2 IIFE синхронно перезаписує `window.toggleGMPanel` до будь-якої взаємодії користувача
- Якщо `gm-panel-v2.js` не завантажиться (мережева помилка), вся GM Panel v2 система не працюватиме (немає рендерингу, табів, стану) — legacy toggle alone не допоможе
- `renderGMPanelState()` залишається в `game.js` і викликається іншими legacy code paths (switchGMTab, markGMServerUpdate, updateGMSections, error handler) — не пов'язано з toggleGMPanel

---

## Ризики та ручна перевірка

### Результати ручної перевірки (користувач, 2026-07-24)

Перевірено в браузері з активною кімнатою GM:

1. ✅ GM Panel відкривається основною кнопкою `#gmPanelBtn`
2. ✅ Закривається кнопкою `×`
3. ✅ Закривається натисканням на backdrop
4. ✅ Повторно відкривається без помилок
5. ✅ Вкладки перемикаються коректно
6. ✅ V2 player cards відображаються і працюють
7. ✅ Після F5 панель знову відкривається
8. ✅ У консолі браузера немає помилок, пов'язаних із `toggleGMPanel`, `refreshGmPanelV2State` або null DOM elements

> Зауваження: це ручна перевірка користувачем, а не автоматизований Playwright-тест.

---

## Критерії готовності

| # | Критерій | Статус |
|---|---|---|
| 1 | Legacy `toggleGMPanel()` видалено після доказової перевірки | ✅ |
| 2 | У коді залишилася одна реалізація | ✅ (`gm-panel-v2.js:153`) |
| 3 | Усі call sites залишилися валідними | ✅ (5 call sites → v2) |
| 4 | Жодна потрібна дія відкриття панелі не втрачена | ✅ (GetGmPanelState + live events) |
| 5 | Не змінені інші GM Panel flows | ✅ |
| 6 | C#, SignalR, DTO, permissions, roles, contracts не змінені | ✅ |
| 7 | `dotnet build --no-restore` успішний | ✅ (0 errors, 0 warnings) |
| 8 | Вузькі JS-тести успішні | ✅ (11/11) |
| 9 | Diff локальний, без unrelated formatting | ✅ (1 файл, -17 рядків) |
| 10 | Runtime UI verification | ✅ Ручна перевірка користувачем — усі сценарії пройдено |
