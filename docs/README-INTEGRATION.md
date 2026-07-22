# Apocalypse Category System — integration map

## Generated files

- `apocalypses-category-visual-ready.json` — full 220-record apocalypse file with explicit `visualModifierIds` (maximum 3 per record).
- `apocalypse-category-index.json` — 10 localized category groups with counts and apocalypse IDs for lobby grouping.
- `apocalypse-category-visual-registry.json` — category packages, modifier catalog, event pools and safe per-apocalypse metadata.
- `apocalypse-category-visual-registry.js` — browser-safe read-only registry and helpers. It never inspects names, descriptions, raw tags or gameplay effects.
- `apocalypse-category-audit.json/.md` — validation and grouped catalog report.

## Minimal project integration

1. Use `apocalypses-category-visual-ready.json` as the new apocalypse content file, preserving the existing loader contract.
2. Extend the C# apocalypse definition/client projection with optional `VisualModifierIds`.
3. Expose `categoryId`, `visualThemeId` and `visualModifierIds` only after the apocalypse is revealed to ordinary players.
4. Use `apocalypse-category-index.json` or the existing category catalog to group `Specific` and `CustomPool` lobby items.
5. Extend the existing V1-F2 scheduler; do not add a second scheduler.
6. Resolve visuals from `categoryId + visualModifierIds`; never infer from name, description or `Gameplay.Effects`.
7. Apply at most three allowlisted modifier classes and clear them on reset/theme switch.

## Important examples

- `water_depletion` → `ecological` + `drought`, `toxic`, `vegetation-collapse`.
- `fungal_apocalypse` → `biological` + `spores`, `vegetation-collapse`.
- `electronic_silence` → `technology` + `darkness`, `emp`, `communication-failure`.
- `reverse_aging` → `anomaly` + `mutation`, `identity-shift`.

## Safety

- No CSS selectors by apocalypse ID.
- No raw tags in public DOM datasets.
- No effect profile or gameplay effect type in visual metadata.
- Category metadata remains hidden until reveal.
- `off/subtle/atmospheric` and reduced-motion behavior remain client-local.
