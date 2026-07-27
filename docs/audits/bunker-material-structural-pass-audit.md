# Bunker material structural pass audit

Дата перевірки: 2026-07-27

## Мета

Другий production-quality прохід перебудовує реальний `renderBunkerFacility()` навколо фізичних material roles. Чинні registry, classification resolver, condition overlays і apocalypse integration повторно використано без створення паралельних систем.

## Baseline

До production-змін збережено сім знімків у `previews/bunker-material-structural-pass/baseline/`:

- `hospital-desktop.png`
- `shipyard-desktop.png`
- `underground-city-desktop.png`
- `luxury-desktop.png`
- `improvised-damaged-desktop.png`
- `shipyard-narrow.png`
- `shipyard-mobile.png`

Baseline показав однакову конструкцію для всіх профілів: великий hero, п’ять плоских metrics, три майже непрозорі темні cards і плоский footer. Профілі відрізнялися переважно tint/accent-кольором; secondary, accent і glass material roles не формували окремих фізичних областей.

## Cascade audit

У `bunker-theme.css` широкі `:is(...)` selectors повторно фарбували `.bunker-facility-shell` і `.bunker-content-card`: задавали власні background, border, radius та shadow поверх спеціалізованої material системи. Ці два production-компоненти вилучено з generic surface selectors. Спеціалізований `bunker-materials.css`, що підключений після `bunker-theme.css`, тепер є єдиним фінальним paint layer для bunker facility.

## Production structure

У наявний renderer додано лише стабільні structural regions:

- `bunker-chassis-frame`
- `bunker-visual-content`
- `bunker-instrument-deck`
- `bunker-console-deck`
- `bunker-control-deck`

Існуючі дані, порядок metrics, IDs, handlers, localization, image controls та SignalR lifecycle не змінено.

## Structure families

Усі 26 material profiles відображено на вісім сімейств:

- `armored`
- `clinical`
- `industrial`
- `concrete`
- `maritime`
- `luxury`
- `improvised`
- `advanced`

Resolver додає `bunker-structure-*` class та material IDs у root datasets. Сімейства змінюють товщину і форму frame, радіуси, rail/seam treatment, geometry metrics та mounted panels.

## Material roles

- Base: великий chassis, зовнішні поверхні та console deck; opacity залежить від сімейства і лежить у діапазоні приблизно `.56–.72`.
- Secondary: inset hero plate, instrument deck, metric modules, content insets і footer/control deck.
- Accent: outer/inner rails, section separators, card header strips, metric edges, medallion rim і bunker-local buttons.
- Glass: status medallion та condition instrument module з темним readable inset, reflection і edge highlight.

Readability захищена локально в hero, metrics, cards і footer. Загальний veil зменшено до `.30–.42` залежно від structure family.

## Condition та apocalypse layering

Існуючі condition і apocalypse resolvers не переписувалися. Порядок шарів збережено як material/chassis → condition/apocalypse → local readability veil → content. Decorative layers мають нижчий `z-index`, ніж production content. Local і edge overlays залишаються `no-repeat`, відповідно `cover` і `100% 100%`.

## Загальний game UI

Material identity стримано поширено на command bar, round HUD, основні panel/modal frames, table headers, primary controls, selected states та outer rails player cards. Табличні `td` і внутрішні characteristic surfaces залишаються neutral/readable; texture не дублюється в кожній cell.

## Development preview

Чинну Visual Theme Preview розширено без створення нової сторінки. Вона показує profile, base/secondary/accent/glass IDs, structure family, condition/apocalypse layers і fallback status; додано grayscale toggle та production-like facility sample.

## After screenshots

У `previews/bunker-material-structural-pass/after/` збережено:

- п’ять desktop screenshots для clinical, maritime, concrete, luxury та improvised profiles;
- п’ять відповідних grayscale screenshots;
- `shipyard-narrow.png` при ширині 900 px;
- `shipyard-mobile.png` при ширині 390 px.

Перегляд знімків підтвердив:

- clinical: чиста світла modular frame, точні стики та squared instruments;
- maritime: rounded pressure frame, double seal і rounded modules;
- concrete: масивна slab geometry, прямі recesses і важкі rails;
- luxury: dark wood/leather panels із тонкими brass separators;
- improvised: mixed salvaged surface, асиметричні краї й контрольовані repair regions.

У grayscale ці профілі залишаються різними через geometry, frame mass, radius, seams і panel construction. На переглянутих desktop screenshots не знайдено квадратних texture seams або checker-like repetition. Текст лишається читабельним.

На 900 px metrics і cards переходять у дві колонки. На 390 px компоненти складаються в одну колонку без видимого горизонтального переповнення. Mobile locator screenshot містить чорні області поза довгим captured element; це особливість element capture, а не розрив ширини production layout.

## Focused verification

- Focused Node contract: перевіряє 26 profiles, рівно 8 structure families, material layers і layer order.
- Focused Chromium Playwright: запускає реальну двокористувацьку гру, викликає production `renderBunker`, перевіряє structure class, чотири material IDs, computed material backgrounds для base/metric/card/button, порядок `z-index` і відсутність page errors.
- Pixel-perfect snapshots не використовуються.

## Обмеження

- Перевірено вибіркові representative profiles, а не всі 26 комбінацій.
- Playwright перевіряє production renderer у Chromium; інші browser engines не запускалися.
- Активні користувацькі зміни в робочому дереві збережено й не включено до scope цього аудиту.
