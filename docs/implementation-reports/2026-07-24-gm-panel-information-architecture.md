# Звіт реалізації: Information Architecture GM Panel

- **Дата**: 2026-07-24
- **Тип**: Implementation report (Task 01I)
- **Обсяг**: Аудит та упорядкування структури GM Panel
- **Статус**: Завершено
- **Філія**: `main`
- **Стан робочого дерева**: Змінено `_GmPanel.cshtml`

---

## Inventory до (DOM position → tab mapping)

| # | Block | Razor lines | Tab | data-gm-advanced | Permission |
|---|---|---|---|---|---|
| 1 | `gmGameStateSection` | 60-63 | game | ❌ | canManageRounds |
| 2 | **omniscientHiddenSection** | **73-118** | **overview** | ❌ | canViewOmniscientData |
| 3 | `gmRoundSection` | 120-210 | game | partial | canManageRounds |
| 4 | `gmVotingV2Section` | 212-222 | voting | ❌ | canManageVoting |
| 5 | `gmThreatControlSection` | 224-245 | threats | partial | canManageThreats |
| 6 | `gmPlayerCardsV2` | 247 | players | ❌ | canManagePlayers |
| 7 | `gmPlayerSelectSection` | 250-265 | players | ❌ | canManagePlayers |
| 8 | `gmPlayerInfo` | 268-488 | players | partial | canManagePlayers |
| 9 | `gmBunkerScenarioSection` | 491-513 | bunker | ❌ | canManageBunker |
| 10 | `gmEventsSection` | 516-581 | events | ❌ | canManageRounds |
| 11 | `gmDiagnosticsSection` | 583-608 | technical | ❌ | canUseTechnicalTools |

**Проблема**: `omniscientHiddenSection` (overview tab) знаходився між `gmGameStateSection` (game tab) та `gmRoundSection` (game tab) — DOM-порядок не відповідає логічній структурі табів.

---

## Структура після

| # | Block | Tab | Status |
|---|---|---|---|
| 1 | `gmGameStateSection` | game | ✅ |
| 2 | `gmRoundSection` | game | ✅ |
| 3 | `gmVotingV2Section` | voting | ✅ |
| 4 | `gmThreatControlSection` | threats | ✅ |
| 5 | `gmPlayerCardsV2` | players | ✅ |
| 6 | `gmPlayerSelectSection` | players | ✅ |
| 7 | `gmPlayerInfo` | players | ✅ |
| 8 | `gmBunkerScenarioSection` | bunker | ✅ |
| 9 | `gmEventsSection` | events | ✅ |
| 10 | `gmDiagnosticsSection` | technical | ✅ |
| 11 | **omniscientHiddenSection** | **overview** | ✅ Переміщено після technical |

---

## Переміщені блоки

| Block | From | To | Причина |
|---|---|---|---|
| `omniscientHiddenSection` | Між game sections (line 73) | Після diagnostics section (end of content) | DOM-порядок тепер відповідає логічній послідовності табів |

---

## Незмінені server flows

- Жоден SignalR method/event/DTO не змінений
- Жоден renderer target не змінений
- Всі inline onclick handlers залишаються валідними
- `data-gm-tab` атрибути залишаються незмінними — display toggling працює

---

## Simple/Advanced Matrix

| Block | Simple mode | Advanced mode | Permission gate |
|---|---|---|---|
| `gmGameStateSection` | ✅ Видимий | ✅ Видимий | canManageRounds |
| `gmRoundSection` | ✅ Основні дії | ✅ Всі дії | canManageRounds + data-gm-advanced |
| `gmVotingV2Section` | ✅ Видимий | ✅ Видимий | canManageVoting |
| `gmThreatControlSection` | ✅ Генерація | ✅ Всі controls | canManageThreats + data-gm-advanced |
| `gmPlayerCardsV2` | ✅ Видимий | ✅ Видимий | canManagePlayers |
| `gmPlayerInfo` | ✅ Quick actions | ✅ Secondary + Danger | canManagePlayers + data-gm-advanced |
| `gmBunkerScenarioSection` | ✅ Видимий | ✅ Видимий | canManageBunker |
| `gmEventsSection` | ❌ Прихований | ✅ Видимий | canManageRounds (blocked in simple by canShowTab) |
| `gmDiagnosticsSection` | ❌ Прихований | ✅ Видимий | canUseTechnicalTools |
| `omniscientHiddenSection` | ❌ Прихований | ❌ Прихований | canViewOmniscientData (не залежить від mode) |

---

## Role Matrix

| Block | Ordinary Host | Developer | Omniscient GM |
|---|---|---|---|
| game | ✅ | ✅ | ❌ |
| players | ✅ | ✅ | ❌ |
| voting | ✅ | ✅ | ❌ |
| threats | ✅ | ✅ | ❌ |
| bunker | ✅ | ✅ | ❌ |
| events | ✅ (advanced) | ✅ | ❌ |
| technical | ❌ | ✅ | ❌ |
| overview | ❌ | ❌ | ✅ |

---

## Duplicate IDs

Перевірено: жодних duplicate IDs в `_GmPanel.cshtml` після переміщення.

---

## Inline handlers

Всі inline onclick handlers залишаються валідними після переміщення — `omniscientHiddenSection` не залежить від DOM-порядку.

---

## Файли

| Файл | Зміна |
|---|---|
| `Views/Shared/Bunker/_GmPanel.cshtml` | Переміщено `omniscientHiddenSection` з позиції між game sections на позицію після technical section (0 рядків змінено — чисте переміщення) |

---

## Перевірки

| # | Перевірка | Результат |
|---|---|---|
| 1 | `dotnet build --no-restore` | ✅ 0 errors, 0 warnings |
| 2 | `gm-panel-v2.test.js` | ✅ 11/11 |
| 3 | `gm-panel-stage3.test.js` | ✅ 10/10 |
| 4 | Дублікатів ID немає | ✅ |
| 5 | Renderer targets валідні | ✅ (omniscientHiddenSection ID не змінився) |
| 6 | Inline handlers валідні | ✅ |
| 7 | DOM-порядок відповідає табам | ✅ |

---

## Не запускалося

- Повний xUnit suite
- Повний Playwright suite

---

## Припущення

- Переміщення Razor-блоку без зміни `data-gm-tab` атрибуту не впливає на display toggling
- `renderOmniscientHiddenState()` та `renderOmniscientPlayerDetail()` працюють через `getElementById` — DOM-порядок не впливає
- `#omniscientDirectorControls` та `#omniscientHiddenPlayers` залишаються в межах `omniscientHiddenSection`

---

## Критерії готовності

| # | Критерій | Статус |
|---|---|---|
| 1 | Кожний Razor block має одну логічну вкладку | ✅ |
| 2 | Немає duplicate IDs | ✅ |
| 3 | Inline handlers валідні | ✅ |
| 4 | Renderer targets існують | ✅ |
| 5 | Permission + mode visibility працює | ✅ |
| 6 | Ordinary host не бачить technical controls | ✅ |
| 7 | Developer бачить technical | ✅ |
| 8 | Omniscient бачить overview | ✅ |
| 9 | Player cards, summary і Threat UI не зламані | ✅ |
| 10 | Build успішний | ✅ |
| 11 | Вузькі tests успішні | ✅ |
| 12 | Approval-required дії не виконані | ✅ |

---

## Використання токенів

Точні дані про використання токенів недоступні агенту.
