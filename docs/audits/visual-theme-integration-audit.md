# Visual theme integration audit

Дата: 2026-07-27

## Джерела

- Основний реєстр бункерів: `wwwroot/data/bunkers.json`
- Основний реєстр апокаліпсисів: `wwwroot/data/Apocalypses/apocalypses.json`
- Category index: `wwwroot/data/Apocalypses/apocalypse-category-index.json`
- Legacy visual registry: `wwwroot/data/Apocalypses/apocalypse-category-visual-registry.json`
- Класифікація бункерів: `wwwroot/data/visual-themes/bunker-visual-classification.json`
- Реалістична класифікація апокаліпсисів: `wwwroot/data/visual-themes/apocalypse-realistic-visual-classification.json`

Основні content JSON не змінювалися. `categoryId` і legacy `visualThemeId` збережені для фільтрації, badge/effects і fallback.

## Перевірка цілісності

| Перевірка | Бункери | Апокаліпсиси |
|---|---:|---:|
| Основних записів | 205 | 220 |
| Classification records | 205 | 220 |
| Записів без `id` | 0 | 0 |
| Дублікатів `id` | 0 | 0 |
| Missing classification | 0 | 0 |
| Orphan classification | 0 | 0 |
| Порожніх family/archetype | 0 | 0 |
| Невідомих category/archetype IDs | 0 | 0 |
| Невідомих family IDs | 0 | 0 |
| Некоректних `stableVariation` (очікується 0–3) | 0 | 0 |
| Невідомих source modifier IDs відносно legacy modifier catalog | n/a | 0 |

У bunker registry немає окремого modifier catalog. Перевірений фактичний vocabulary із 17 значень:
`biological-hazard`, `chemical-hazard`, `claustrophobic`, `cold`, `contaminated`,
`corroded`, `damp`, `degraded`, `dusty`, `hot`, `isolated`, `labyrinthine`,
`monumental`, `radiological`, `refined`, `ritual`, `sterile`.
Порожніх або нестрокових modifier IDs не знайдено.

## Реалізована архітектура

`wwwroot/js/bunker/core/visual-theme-registries.js`:

- запускає один shared load для обох JSON;
- кешує Promise і дві `Map` за exact `id`;
- використовує `Promise.allSettled`, тому відмова одного registry не блокує гру або інший registry;
- не повторює fetch під час SignalR events або render;
- після завершення load один раз синхронізує поточні `currentBunker` і `currentApocalypse`;
- у development localhost показує не більше одного warning для кожного відсутнього `kind:id`.

Lookup:

- `getBunkerVisualClassification(bunkerId)`
- `getApocalypseVisualClassification(apocalypseId)`

Resolver-и не змінюють content records. Classification має пріоритет. Наявний мовонезалежний inference збережений тільки як fallback для відсутнього запису або недоступного registry.

### Bunker layer

`resolveBunkerVisualTheme` повертає `id`, `family`, `category`, сумісний material archetype,
точний `materialProfile`, `condition`, `cleanliness`, `technology`, `atmosphere`,
`modifiers` і registry `stableVariation`.

На root застосовуються:

- `data-bunker-family`
- `data-bunker-category`
- `data-bunker-archetype`
- `data-bunker-material`
- `data-bunker-material-profile`
- `data-bunker-condition`
- `data-bunker-cleanliness`
- `data-bunker-technology`
- `data-bunker-atmosphere`
- `data-bunker-modifiers`
- `data-bunker-variation`

### Apocalypse layer

`resolveApocalypseVisualTheme` повертає точні registry `category`, `family`, `archetype`,
`modifiers`, `effects`, `stableVariation` і стриманий physical profile. Legacy theme ID
залишається в результаті для сумісності, але не володіє матеріалами компонентів.

На root застосовуються:

- `data-apocalypse-category`
- `data-apocalypse-family`
- `data-apocalypse-archetype`
- `data-apocalypse-lighting`
- `data-apocalypse-air`
- `data-apocalypse-contamination`
- `data-apocalypse-damage`
- `data-apocalypse-modifiers`
- `data-apocalypse-effects`
- `data-apocalypse-variation`

Обидва manager-и видаляють попередні attributes, мають signature guard і не створюють
нових style/DOM nodes під час повторного застосування.

## CSS composition

`visual-foundation.css` визначає нейтральні semantic tokens для surfaces, borders, text,
interactive/selected/disabled states, radius і shadows.

`bunker-theme.css` володіє матеріалом панелей, таблиць, characteristic cards, reveal/voting/
inventory controls, special cards, bunker/apocalypse/threat/history panels, modal, tabs,
tooltips, empty/disabled/selected states. Category colors залишаються локальними accent lines.

`apocalypse-physical-theme.css` володіє світлом, пилом, димом, попелом, туманом, інеєм,
конденсатом, корозійним впливом та локальними optical/electrical artifacts. Він не замінює
bunker button/panel material. Повнокольорові green/violet/cyan overlays і глобальні hazard
stripes не додавалися; наявні надмірні cyan glow послаблено.

Декоративні ambient layers вже мають `pointer-events: none`. Reduced-motion вимикає
анімації theme layers.

## Regression combinations

- `shipyard_bunker` + `iron_plague`: `maritime` / `marine-steel` + `contamination` /
  `corrosive_decay`; effects `corrosion`, `pitting`, `material-decay`.
- `underground_city` + `anti_matter_leak`: `infrastructure` /
  `reinforced-concrete-industrial-metal` + `cosmic` / `celestial_anomaly`;
  effect `optical-distortion` лишається локальним.
- `hospital_bunker` + `pandemic_super_virus`: `clinical_technical` /
  `ceramic-composite-steel` + `biological` / `infection_quarantine`.
- `luxury_bunker` + `endless_darkness`: `luxury` / `dark-wood-leather-brass` +
  `atmospheric` / `darkness_light_loss`.
- `military_bunker` + `nuclear_war`: `reinforced` / `armored-steel` +
  `contamination` / `fallout_radiation`.
- `research_bunker` + `consciousness_epidemic`: `clinical_technical` /
  `dark-glass-composite` + `technological` / `machine_uprising`.
- Unknown IDs: neutral deterministic bunker `civilian` / `painted-metal` і apocalypse
  `generic-collapse`; variation береться зі stable hash, `Math.random()` не використовується.

## Перевірки

- Focused Node contract:
  `node --test Tests/JavaScript.Contracts/compositional-theme.test.js`
  — pass, 1 test.
- Playwright: див. фінальний звіт після запуску.
- Build і Git checks: див. фінальний звіт після запуску.

## Відомі обмеження

- 36 realistic apocalypse archetypes композиційно згруповані у physical families; окреме
  полірування унікальних effects можливе без зміни loader/resolver contract.
- Bunker registry не містить окремого формального modifier catalog; для schema-level
  enforcement його треба додавати лише окремим погодженим content-schema завданням.
- Lobby preview не розкриває і не застосовує приховану тему до старту гри; після вибору
  тема застосовується через наявний authoritative game snapshot.
