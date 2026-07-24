# Звіт реалізації: Визначення єдиного власника Threat UI у GM Panel

- **Дата**: 2026-07-24
- **Тип**: Implementation report (Task 01G)
- **Обсяг**: Видалення дубльованої кнопки resync, визначення єдиного owner threat renderer
- **Статус**: Завершено
- **Філія**: `main`
- **Стан робочого дерева**: Змінено `_GmPanel.cshtml`, `gm-panel-stage3.test.js`

---

## Що фактично виконано

### Видалення duplicate resync button

**Проблема**: `_GmPanel.cshtml` містив дві кнопки `gmResyncThreatRoom()`:
1. Line 235: `<button class="btn-gm-action" data-gm-advanced onclick="gmResyncThreatRoom()">` — в actions row, data-gm-advanced, без ID
2. Line 239: `<button id="gmThreatResync" class="btn-gm-action" onclick="gmResyncThreatRoom()">` — в emergency block, з ID, з data-gm-i18n

Обидві викликали ту саму функцію `gmResyncThreatRoom()` та ту саму SignalR `GMResyncThreatRoom`.

**Рішення**: Видалено duplicate button (line 235). `#gmThreatResync` (line 239) залишається єдиним control.

---

## Threat UI containers — до/після

### GM Threat Tab (`data-gm-tab="threats"`)

| Container | Writers до | Writers після |
|---|---|---|
| `#gmThreatControlSection` (224) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| `#gmThreatCurrent` (226) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| `#gmSpecificThreatControls` (227) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| `#gmThreatSelect` (229) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| Line 235 resync button | inline onclick | **ВИДАЛЕНО** |
| `#gmThreatEmergencyBlock` (237) | `renderTabs()` (v2) hides if !technical | — |
| `#gmThreatResync` (239) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| `#gmThreatReset` (240) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| `#gmThreatAbort` (241) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| `#gmThreatForceSuccess` (242) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| `#gmThreatForceFailure` (243) | `renderGMThreatControl()` | `renderGMThreatControl()` |
| `#gmThreatCommandResult` (245) | `renderGMThreatControl()` + error handlers | — |

### Force Confirm Modal (`Index.cshtml`)

| Container | Writer |
|---|---|
| `#gmThreatForceModal` (408) | `renderGMThreatForcePreview()` |

---

## Authoritative owner

**`renderGMThreatControl()`** в `game.js:8227` — єдиний авторитетний renderer для GM Panel threat controls.

V2 `gm-panel-v2.js` НЕ має власного threat renderer. Він лише:
- показує summary card "Загроза" в `renderOverview()` (line 334)
- ховає `#gmThreatEmergencyBlock` в `renderTabs()` (line 286) якщо !technical

---

## Legacy functions — що залишено, що видалено

### Залишені (authoritative for GM Panel)

| Функція | Файл:Рядок | Призначення |
|---|---|---|
| `renderGMThreatControl()` | game.js:8227 | Єдиний writer threat controls |
| `renderGMThreatForcePreview()` | game.js:8486 | Writer force confirm modal |
| `renderUnifiedGmAudit()` | game.js:8346 | Writer audit log (threat + general) |
| `invokeGMThreatCommand()` | game.js:8419 | Helper для GM threat commands |
| `invokeGMThreatEmergency()` | game.js:8531 | Helper для emergency commands |
| `gmResyncThreatRoom()` | game.js:8452 | Resync handler |
| `gmRestartThreat()` | game.js:8449 | Restart handler |
| `gmCancelThreat()` | game.js:8446 | Cancel handler |
| `requestGMThreatForcePreview()` | game.js:8467 | Force preview handler |
| `confirmGMThreatForce()` | game.js:8511 | Force confirm handler |
| `filterGMThreatOptions()` | game.js:8403 | Client-side search filter |
| `gmSelectSpecificThreat()` | game.js:8442 | Select specific threat |
| `gmGenerateRareThreat()` | game.js:8436 | Generate rare threat |
| `gmGenerateTextThreat()` | game.js:8439 | Generate text threat |

### Залишені (main player UI, не чіпати)

| Функція | Файл:Рядок | Призначення |
|---|---|---|
| `renderThreatPanel()` | game.js:1783 | Main player threat display |
| `renderThreatScenario()` | game.js:1760 | Scenario content |
| `renderThreatOperationModal()` | game.js:1952 | Radiation operation modal |
| `renderThreatInteractionPanel()` | game.js:1809 | Interaction panel |

### Видалено

| Елемент | Файл:Рядок | Причина |
|---|---|---|
| Duplicate resync button (line 235) | _GmPanel.cshtml | Дублікат `#gmThreatResync` (239) |

---

## SignalR handlers — залишені

| Event | game.js:Рядок | Оновлює | Викликає |
|---|---|---|---|
| `GMThreatControlData` | 5150 | `gmThreatControlData` | `renderGMThreatControl()` + `markGMServerUpdate()` |
| `ThreatStateUpdated` | 5052 | `currentThreatState` | `renderThreatOperationModal()` + `markGMServerUpdate()` |
| `GMThreatForcePreview` | 5166 | `gmThreatForcePreview` | `renderGMThreatForcePreview()` |
| `GMThreatForceRejected` | 5176 | `gmThreatForcePreview = null` | Direct DOM updates |
| `GmAuditLogUpdated` | 5146 | `gmAuditData` | `renderUnifiedGmAudit()` |
| `ThreatRevealed` | 4204 | `currentThreat` | `renderThreatPanel()` (player UI) |
| `ThreatMiniGameStarted` | 5282 | `currentThreatState.miniGame` | `renderThreatPanel()` + modal |
| `ThreatMiniGameUpdated` | 5295 | `currentThreatState.miniGame` | `renderThreatPanel()` + modal |

V2 liveEvents: `ThreatStateUpdated`, `GMThreatControlData` → `scheduleGmPanelV2Refresh()` → оновлює summary/recommended action.

---

## Critical actions — coverage

| Action | Button | Handler | SignalR | Duplicate? |
|---|---|---|---|---|
| Select specific threat | Line 230 | `gmSelectSpecificThreat()` | `GMSelectThreat` | ❌ |
| Generate rare | Line 233 | `gmGenerateRareThreat()` | `GMGenerateRandomRareThreat` | ❌ |
| Generate text | Line 234 | `gmGenerateTextThreat()` | `GMGenerateTextThreat` | ❌ |
| Resync | `#gmThreatResync` (239) | `gmResyncThreatRoom()` | `GMResyncThreatRoom` | ❌ (видалено) |
| Restart | `#gmThreatReset` (240) | `gmRestartThreat()` | `GMRestartCurrentThreat` | ❌ |
| Cancel | `#gmThreatAbort` (241) | `gmCancelThreat()` | `GMCancelCurrentThreat` | ❌ |
| Force success | `#gmThreatForceSuccess` (242) | `requestGMThreatForcePreview('success')` | `GMPreviewForceThreat` → modal → `GMConfirmForceThreat` | ❌ |
| Force failure | `#gmThreatForceFailure` (243) | `requestGMThreatForcePreview('failure')` | Same chain | ❌ |

---

## Перевірки

| # | Перевірка | Результат |
|---|---|---|
| 1 | `dotnet build --no-restore` | ✅ 0 errors, 0 warnings |
| 2 | `gm-panel-v2.test.js` | ✅ 11/11 |
| 3 | `gm-panel-stage3.test.js` | ✅ 8/8 |
| 4 | Один resync onclick в threats tab | ✅ підтверджено тестом |
| 5 | `renderGMThreatControl()` існує | ✅ підтверджено тестом |
| 6 | Main player UI не змінений | ✅ (renderThreatPanel та ін.) |
| 7 | Diff: 2 файли, +11/-1 | ✅ |

---

## Не запускалося

- Повний xUnit suite
- Повний Playwright suite

---

## Припущення

- `renderGMThreatControl()` є єдиним writer для GM Threat controls — v2 не має власного threat renderer
- Director controls (overview tab) є окремим interface для omniscient GM, не дублікатом
- Main player UI (`renderThreatPanel` та ін.) не повинен змінюватися в цій задачі
- `#gmThreatResync` в emergency block залишається єдиним resync control

---

## Ризики та ручна перевірка

Рекомендовано ручну перевірку користувачем:

1. Відкрити GM Panel → вкладка Threats
2. Перевірити, що emergency resync кнопка працює
3. Перевірити, що generate buttons працюють
4. Перевірити, що force preview/confirm працює
5. Перевірити console на відсутність null DOM errors

---

## Критерії готовності

| # | Критерій | Статус |
|---|---|---|
| 1 | Один owner GM Threat container | ✅ (`renderGMThreatControl`) |
| 2 | Кожна critical action має один control | ✅ |
| 3 | Preview/confirm/fingerprint збережена | ✅ |
| 4 | Main game Threat UI не зламаний | ✅ (не змінювався) |
| 5 | Live events оновлюють authoritativerenderer | ✅ |
| 6 | Reconnect/refresh restoration збережені | ✅ |
| 7 | Permissions не змінені | ✅ |
| 8 | SignalR methods/events/DTO не змінені | ✅ |
| 9 | Не створено нового parallel state | ✅ |
| 10 | Вузькі tests не послаблені | ✅ (додано 1 новий) |
| 11 | `dotnet build --no-restore` успішний | ✅ |
| 12 | JS tests успішні | ✅ (11/11 + 8/8) |
| 13 | Diff локальний | ✅ (2 файли, +11/-1) |
| 14 | Runtime UI verification | ⚠️ Не виконано |
| 15 | Approval-required дії не виконані | ✅ |

---

## Файли, навмисно залишені незмінними

- `wwwroot/js/game.js` — `renderGMThreatControl()` та всі threat handlers залишаються
- `wwwroot/js/bunker/gm-panel-v2.js` — v2 panel без власного threat renderer (коректно)
- `Views/Bunker/Index.cshtml` — force confirm modal залишається
- `Services/Bunker/Gm/GmPanelStateBuilder.cs` — permissions не змінюються

---

## Обмеження

1. **Runtime UI verification**: не виконано. Потребує ручної перевірки.
2. **V2 threat renderer**: v2 не має власного threat renderer — делегує game.js. Це коректна архітектура, але означає, що v2 threats tab повністю залежить від `renderGMThreatControl()`.

---

## Використання токенів

Точні дані про використання токенів недоступні агенту.
