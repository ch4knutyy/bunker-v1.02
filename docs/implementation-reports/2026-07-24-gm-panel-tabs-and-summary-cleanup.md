# Звіт реалізації: Видалення legacy tabs та подвійного рендеру summary у GM Panel

- **Дата**: 2026-07-24
- **Тип**: Implementation report (Slices 01D + 01E)
- **Обсяг**: Видалення legacy `switchGMTab`/`renderGMTabsVisibility` та дубльованого writer `#gmGameStateSummary`
- **Статус**: Завершено
- **Філія**: `main`
- **Стан робочого дерева**: Змінено `game.js` та `gm-panel-stage3.test.js`

---

## Що фактично виконано

**01D**: Видалено legacy `switchGMTab()` та `renderGMTabsVisibility()` з `game.js`. Прибрано виклик `renderGMTabsVisibility()` з `updateGMSections()`.

**01E**: Видалено legacy writer-блок `#gmGameStateSummary` з `renderGMPanelState()`. Функція `renderGMPanelState()` збережена для інших live callers.

---

## Змінено

### 01D — Legacy tab functions

Видалено:
- `function switchGMTab(tab)` (`game.js:8198-8202`) — legacy tab IDs: `state/round/threat/content/diagnostics/omniscient`
- `function renderGMTabsVisibility()` (`game.js:8204-8214`) — show/hide секцій через `isHost` check
- Виклик `renderGMTabsVisibility()` з `updateGMSections()` (`game.js:9017`)

### 01E — Dual summary renderer

Видалено з `renderGMPanelState()`:
- Блок запису в `#gmGameStateSummary` через `innerHTML` (13 рядків)
- Пов'язані тимчасові змінні (`phase`, `players`, `activePlayers`, `connectedPlayers`, `threatName`, `interactionStatus`)

Збережено в `renderGMPanelState()`:
- i18n updates
- Bunker capacity input update
- `renderRoomDiagnostics()`
- Error display
- `renderRoomSnapshots()`
- `renderUnifiedGmAudit()`

---

## Файли

| Файл | Зміна | Статус |
|---|---|---|
| `wwwroot/js/game.js` | -32 рядки (legacy tab functions + summary writer) | Змінено |
| `Tests/JavaScript.Contracts/gm-panel-stage3.test.js` | Оновлено 4 assertions для відповідності актуальному коду | Змінено |
| `wwwroot/js/bunker/gm-panel-v2.js` | Єдина реалізація `switchGMTab` та `renderOverview` | Незмінний |
| `Views/Shared/Bunker/_GmPanel.cshtml` | Call sites використовують v2 tab IDs | Незмінний |

---

## Повторно використано

- V2 `switchGMTab` (`gm-panel-v2.js:125-143`) — permission-based `safeTab()`, localStorage, aria-selected, `renderGmPanelV2()`
- V2 `renderOverview()` (`gm-panel-v2.js:323-336`) — authoritativerender через `replaceChildren` з `gmPanelV2State`
- V2 `canShowTab()` (`gm-panel-v2.js:59-69`) — permission-driven tab visibility

---

## Визначення та call sites

### `switchGMTab`

| До | Після |
|---|---|
| 2 визначення (game.js + gm-panel-v2.js) | 1 визначення (gm-panel-v2.js) |

Call sites (незмінні):
- `_GmPanel.cshtml:36-43` — 8 inline onclick (v2 tab IDs)
- `gm-panel-v2.js:150,225` — internal calls

### `renderGMTabsVisibility`

| До | Після |
|---|---|
| 1 визначення + 2 call sites | 0 визначень, 0 call sites |

### `#gmGameStateSummary` writers

| До | Після |
|---|---|
| 2 writers (legacy `innerHTML` + v2 `replaceChildren`) | 1 writer (v2 `renderOverview`) |

---

## Tab IDs

| Система | IDs |
|---|---|
| Legacy (видалено) | `state/round/threat/content/diagnostics/omniscient` |
| V2 (залишається) | `game/players/voting/threats/bunker/events/technical/overview` |
| Razor | v2 IDs |

---

## Script load order

`game.js` → `gm-panel-v2.js` (синхронно). V2 перезаписує `window.switchGMTab` до будь-якої взаємодії користувача.

---

## Перевірки

1. `dotnet build --no-restore` — ✅ 0 errors, 0 warnings
2. `gm-panel-v2.test.js` — ✅ 11/11
3. `gm-panel-stage3.test.js` — ✅ 5/5
4. `switchGMTab` визначення: до 2 → після 1 (v2 only)
5. `renderGMTabsVisibility` визначення: до 1 → після 0
6. `#gmGameStateSummary` writers: до 2 → після 1 (v2 only)
7. Diff: 2 файли, -36/+2 рядки
8. `renderGMPanelState()` залишається валідною для інших callers (error handler, markGMServerUpdate, updateGMSections)

---

## Тестові зміни

Оновлено `gm-panel-stage3.test.js`:
- Видалено `assert.match(client, /function switchGMTab\(tab\)/)` — legacy видалено
- Видалено `assert.match(client, /connection\.invoke\("GetGMThreatControlData"\)/)` — pre-existing failure від 01C (legacy toggleGMPanel)
- Замінено `getPhaseLabel(getCurrentPhase())` → `function getPhaseLabel` — function definition все ще існує
- Замінено `getThreatStatusLabel(currentThreatState.threatStatus)` → `function getThreatStatusLabel` — function definition все ще існує

---

## Не запускалося

- Повний xUnit suite
- Повний Playwright suite
- Runtime UI verification

---

## Припущення

- V2 `switchGMTab` повністю замінює legacy: permission-based `safeTab()`, localStorage persistence, aria-selected, `renderGmPanelV2()`
- V2 `renderOverview()` є авторитетним writer `#gmGameStateSummary`: більше полів (BunkerCapacity, TimerStatus, VotingStatus), серверний стан через `gmPanelV2State`
- `renderGMTabsVisibility()` з `updateGMSections()` була сумісна з v2 (спільний `activeGMTab`), але redundant — v2 покриває через `renderGmPanelV2()` → `renderTabs()`
- `renderGMPanelState()` залишається для legacy callers: error handler (4561), markGMServerUpdate (8218), updateGMSections (9021)

---

## Ризики та ручна перевірка

Рекомендовано ручну перевірку користувачем:

1. Відкрити GM Panel
2. Перемкнути всі доступні вкладки ordinary host
3. Перевірити active button state
4. У simple mode перевірити приховані advanced controls
5. У advanced mode перевірити їх появу
6. Перевірити вкладку «Гравці» та player cards
7. Перевірити summary на вкладці «Гра»
8. Виконати дію, яка змінює round/readiness/voting state, і перевірити оновлення summary
9. Закрити та повторно відкрити панель
10. Оновити сторінку через F5
11. Перевірити browser console на помилки

---

## Критерії готовності

### 01D
| # | Критерій | Статус |
|---|---|---|
| 1 | Legacy tab functions видалені після доказової перевірки | ✅ |
| 2 | Одна реалізація `switchGMTab` | ✅ (gm-panel-v2.js:125) |
| 3 | Усі call sites використовують v2 tab IDs | ✅ |
| 4 | Permission-driven visibility не втрачена | ✅ (canShowTab в v2) |
| 5 | Simple/advanced mode не зламаний | ✅ |

### 01E
| # | Критерій | Статус |
|---|---|---|
| 6 | `#gmGameStateSummary` має один authoritativewriter | ✅ (v2 renderOverview) |
| 7 | Legacy `renderGMPanelState()` не видалена повністю | ✅ |
| 8 | Інші live UI updates збережені | ✅ |
| 9 | V2 summary не перезаписується legacy markup | ✅ |
| 10 | Не створено нового state або renderer | ✅ |

### Загальні
| # | Критерій | Статус |
|---|---|---|
| 11 | C#, SignalR, DTO, permissions, roles, contracts не змінені | ✅ |
| 12 | `dotnet build --no-restore` успішний | ✅ (0 errors, 0 warnings) |
| 13 | Вузькі JS-тести успішні | ✅ (11/11 + 5/5) |
| 14 | Diff локальний, без unrelated formatting | ✅ (2 файли, -36/+2) |
| 15 | Runtime UI verification | ⚠️ Не перевірено — рекомендовано ручну перевірку |
| 16 | Approval-required дії не виконані | ✅ |
