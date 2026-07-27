# Apocalypse effects runtime integration audit

Дата: 2026-07-27

## Assets

Runtime library:

```text
wwwroot/assets/ui/apocalypse-effects/
├── universal/
├── local/
├── edge/
├── ui/
├── apocalypse-effects-manifest.json
└── apocalypse-effects.css
```

Manifest містить 80 записів:

- `universal`: 16
- `local`: 41
- `edge`: 9
- `ui`: 14

Дублікатів ID, відсутніх PNG, невідомих usage або `repeatable: true` не знайдено.

## Runtime registry

`wwwroot/js/bunker/apocalypse/effect-assets.js` завантажує manifest один раз і кешує:

- `Map` за effect ID;
- списки за `usage`;
- списки за `family`.

Normalized asset contract містить `id`, `number`, `path`, `usage`, `family`,
`backgroundSize`, `blendMode`, `defaultOpacity` і `maxOpacity`.

Небезпечні path, usage і blend mode відкидаються або замінюються стриманим fallback.
Opacity обмежується manifest `maxOpacity`. Tiling завжди вимкнений.

## Presets і mapping

Preset описує:

- один primary `universal` або `local` effect;
- optional `edge`;
- optional `ui`;
- tone token;
- intensity multiplier.

`resolveApocalypseVisualPreset()` використовує наявний результат
`resolveApocalypseVisualTheme()`:

1. exact realistic archetype;
2. realistic visual family;
3. fallback `neutral-industrial`.

Mapping не залежить від локалізованої назви і не додає поля до 220 content records.

Основні presets:

- `nuclear-fallout`
- `fungal-biohazard`
- `toxic-chemical`
- `corrosive-decay`
- `firestorm`
- `cryogenic-winter`
- `flood-humidity`
- `drought-dust`
- `industrial-collapse`
- `emp-system-failure`
- `spatial-anomaly`
- `quarantine-medical`
- `volcanic-ash`
- `war-destruction`
- `marine-corrosion`
- `storm-damage`
- `neutral-industrial`

## UI integration

Канонічна `.apocalypse-scenario-shell` отримує один
`.apocalypse-effect-stack`. `applyApocalypseVisualState()` замінює його children
під час наявного `renderApocalypse()` lifecycle.

Гарантії:

- максимум три `.apocalypse-effect-layer`;
- primary, edge та UI usage не дублюються;
- `pointer-events: none`;
- `background-repeat: no-repeat`;
- primary/UI використовують `cover`;
- edge використовує `100% 100%`;
- shell має `isolation: isolate` і `overflow: hidden`;
- content має вищий z-index;
- effects-level `off` приховує локальні PNG layers разом з ambient effects.

Існуючий full-page ambient root, scheduler, reactions і SignalR lifecycle не змінені.

## Development preview

У `Development` environment на сторінці `/Bunker` з’являється секція
`Apocalypse effects development preview`.

Вона дозволяє:

- перемикати всі preset IDs;
- переглядати normal і compact cards;
- бачити effect ID, usage, opacity і blend mode;
- перевіряти клікабельність control поверх overlays.

У non-Development environment Razor взагалі не створює preview DOM.

## Розширення

Щоб додати effect:

1. додати оптимізований PNG у відповідну usage-папку;
2. додати один manifest record;
3. за потреби використати effect ID у preset.

Щоб додати preset:

1. створити `createApocalypseVisualPreset(...)`;
2. прив’язати realistic archetype або family;
3. перевірити normal/compact cards у Development preview;
4. не перевищувати один primary, один edge та один UI layer.

## Focused verification

- `node --test Tests/JavaScript.Contracts/apocalypse-effect-assets.test.js`
  — pass, 1 test.
- Playwright, build і Git checks — див. фінальний звіт.
