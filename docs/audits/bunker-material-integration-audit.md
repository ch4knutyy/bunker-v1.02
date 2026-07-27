# Bunker material runtime integration audit

## Scope

This integration adds physical bunker materials to the existing compositional visual-theme system. It does not change `bunkers.json`, game rules, SignalR contracts, room state, persistence, snapshots, or server-side bunker generation.

## Existing runtime architecture

- Canonical bunker content: `wwwroot/data/bunkers.json`, loaded by `Services/Bunker/Content/GameDataService.cs`.
- Canonical browser renderer: `renderBunker()` → `buildBunkerFacilityModel()` → `renderBunkerFacility()` in `wwwroot/js/bunker/bunker/runtime.js`.
- Canonical target: `#bunkerContent` in `Views/Shared/Bunker/_GameBoard.cshtml`.
- Visual classification loader: `wwwroot/js/bunker/core/visual-theme-registries.js`.
- Bunker classification resolver: `wwwroot/js/bunker/bunker/theme-resolver.js`.
- Body theme/data-attribute manager: `wwwroot/js/bunker/bunker/theme-manager.js`.
- Apocalypse card effect registry and preset resolver: `wwwroot/js/bunker/apocalypse/effect-assets.js`.

There is no separate production bunker-selection card, expanded bunker view, or bunker-details modal renderer. Lobby bunker configuration is textual. The compact material policy is demonstrated by the shared Development preview and is ready for a future canonical compact renderer.

## Assets

Root: `wwwroot/assets/ui/materials/`

- Manifest: `material-assets-manifest.json`
- Base materials: **44**
- Condition overlays: **27**
  - universal: 6
  - local: 17
  - edge: 4

All 71 manifest paths were checked against files under `wwwroot`.

## Runtime levels

1. `material-assets.js`
   - loads the manifest once with one cached Promise;
   - indexes base materials and overlays separately;
   - supports lookup by material ID, overlay ID, and overlay usage;
   - validates IDs, paths, usages, and duplicates;
   - returns `rough-concrete` as the safe physical fallback.

2. `material-profiles.js`
   - defines semantic roles for the 26 stable classification profile IDs;
   - keeps base, secondary, accent, glass, and condition overlays separate;
   - does not duplicate the manifest as an asset source of truth.

3. `material-resolver.js`
   - resolves exact profile → category profile → `neutral-industrial`;
   - resolves physical asset paths and bounded condition overlays;
   - exposes diagnostics without throwing in Production;
   - applies local CSS variables and decorative layers to `.bunker-visual-root`.

## Material profiles

- `anodized-metal-dark-glass`
- `armored-steel`
- `ceramic-composite-steel`
- `concrete-enamel-steel`
- `concrete-painted-steel`
- `concrete-steel-bars`
- `damaged-mixed-materials`
- `dark-glass-composite`
- `dark-wood-climate-metal`
- `dark-wood-leather-brass`
- `heavy-painted-steel`
- `insulated-steel-concrete`
- `insulated-steel-frosted-glass`
- `marine-steel`
- `mixed-salvaged-materials`
- `painted-concrete-plastic`
- `painted-metal-wood-plastic`
- `painted-steel-concrete`
- `reinforced-concrete-industrial-metal`
- `reinforced-steel-concrete`
- `rock-earth-natural`
- `rock-steel-timber`
- `sealed-steel-composite`
- `stone-brick-aged-metal`
- `stone-wood-aged-brass`
- `wet-painted-metal-concrete`

## Classification mapping

The existing classification is the lookup:

`bunker id → materialProfileId → Bunker material profile → manifest assets`

Coverage:

- content bunker IDs: 205
- classification records: 205
- duplicate content IDs: 0
- duplicate classification IDs: 0
- bunkers without classification: 0
- orphan classification records: 0
- unknown classification profiles: 0

Category fallback uses the existing 26 `visualCategoryId` values and their existing default profile relationship. No bunker content entry was edited.

## Material roles

- Base: large neutral structural surface.
- Secondary: restrained header/upper-panel inset.
- Accent: available as a CSS variable for borders and technical details; never used as a full text background.
- Glass: available as a CSS variable for future viewport/modal insets.
- Condition overlay: wear only; never replaces the base material.

Brass, copper, wood, leather, and strong corrosion remain secondary/accent/local treatments.

## Condition overlays

Canonical classification conditions are `excellent`, `good`, `fair`, and `poor`.

- `excellent`: no condition PNG.
- `good`: one weak universal scratches layer.
- `fair`: one profile/modifier-specific local or edge layer.
- `poor`: at most one universal plus one local/edge layer.
- unknown condition: no exception and no overlay.

Modifier-specific choices include damp, corrosion, cold, contamination, chemical/radiological hazard, dust, heat, and degradation. Overlay usages are deduplicated and the result is always limited to two.

## Layer order and limits

Canonical large bunker panel:

1. structural CSS background;
2. base material;
3. optional secondary material;
4. zero to two condition overlays;
5. zero to three reused apocalypse-effect layers;
6. readability veil;
7. content and interactive controls.

The compact preview suppresses secondary and apocalypse layers and displays at most one condition overlay. Tables and lists use translucent CSS surfaces rather than a texture per row.

## Apocalypse integration

The bunker renderer reuses `resolveApocalypseVisualPreset()`, `buildApocalypseEffectLayers()`, and `applyApocalypsePresetToRoot()`. It does not introduce another apocalypse manifest fetch or another preset registry.

Apocalypse PNGs occupy their own stack above bunker material and below the readability veil. Clearing or disabling the apocalypse clears this local stack without removing bunker material. The existing apocalypse card and full-screen ambient manager remain independent.

## Fallback chain

1. exact classification `materialProfileId`;
2. existing category profile;
3. `neutral-industrial`;
4. hard asset fallback: `rough-concrete`, optional `painted-metal`, and no invalid overlay.

A missing manifest or unknown decorative asset does not block Production rendering. Development emits warnings and exposes the fallback level in preview diagnostics.

## Development preview

Route: `/Bunker`, only when `IWebHostEnvironment.IsDevelopment()` is true.

The existing apocalypse preview was expanded into one shared **Visual Theme Preview**. It provides:

- material profile selector;
- actual condition selector;
- apocalypse preset selector;
- condition/apocalypse toggles;
- main panel and compact card;
- button, table/list, and modal-like section;
- resolved asset IDs, opacity, blend mode, and fallback diagnostics.

Labels and explanatory copy follow the current Ukrainian/English/Russian client language.

## Validation and focused verification

Development validation covers:

- duplicate/missing/invalid material and overlay IDs/paths/usages;
- duplicate/missing classification IDs and missing profile IDs;
- unknown profile material/overlay references;
- resolver fallback and layer limits.

The focused Node contract additionally verifies that every manifest path exists and that all 205 classification records refer to one of the 26 profiles.

## Known limitations

- The manifest does not declare repeatability per base texture. Base assets use the repository’s documented seam-cleaned material pack with a restrained 420–760 px scale.
- Physical file existence is a repository/build-time contract check; the browser runtime validates paths and falls back after fetch failures.
- No production compact bunker card or bunker modal currently exists, so no parallel renderer was introduced.
- Exact visual appearance still requires manual review on representative desktop, narrow desktop, and mobile viewports.
