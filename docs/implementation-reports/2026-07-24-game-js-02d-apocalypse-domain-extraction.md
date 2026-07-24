# 02D-L: Apocalypse Domain Extraction from game.js

**Date:** 2026-07-24
**Status:** Complete

## Summary

Extracted all apocalypse-related pure functions, render functions, effect functions, state bindings, and config constants from `game.js` into 6 dedicated module files under `wwwroot/js/bunker/apocalypse/`.

## Metrics

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| game.js lines | 9221 | 8579 | -642 (7%) |
| game.js bytes | 553278 | 527217 | -26061 |
| Contract tests pass | 303/349 | 304/349 | +1 (regression fix) |

## Files Created/Modified

### New files (under `wwwroot/js/bunker/apocalypse/`)

| File | Lines | Bytes | Contents |
|------|-------|-------|----------|
| `icons.js` | 19 | 3873 | `apocalypseIconSvgRegistry`, `apocalypseCategoryIconRegistry` (02C) |
| `visual-config.js` | 46 | 3297 | 9 visual theme config constants (02C) |
| `state.js` | 12 | 516 | 11 mutable state bindings (`apocalypseReactionTimers`, etc.) |
| `helpers.js` | 124 | 6701 | 12 pure helper functions |
| `render.js` | 130 | 8291 | 10 render functions |
| `effects.js` | 266 | 13537 | 23 effect runtime functions |

### Modified files

- `wwwroot/js/game.js` — removed moved declarations, replaced with comment stubs
- `Views/Bunker/Index.cshtml` — added 4 new script tags (state, helpers, render, effects) before game.js
- `Tests/JavaScript.Contracts/game-js-apocalypse-domain-modularization.test.js` — NEW, 18 tests
- `Tests/JavaScript.Contracts/game-js-icon-registry-modularization.test.js` — updated for moved registries
- `Tests/JavaScript.Contracts/apocalypse-theme.test.js` — reads from helpers/render/visualConfig
- `Tests/JavaScript.Contracts/apocalypse-category-effects.test.js` — reads from effects/helpers/state
- `Tests/JavaScript.Contracts/apocalypse-effect-runtime.test.js` — updated banner test
- `Tests/JavaScript.Contracts/apocalypse-immersive-ui.test.js` — reads from helpers/render
- `Tests/JavaScript.Contracts/apocalypse-visual-polish.test.js` — reads from effects/render/helpers/visualConfig/state
- `Tests/JavaScript.Contracts/threat-immersive-ui.test.js` — updated `renderApocalypseScenario` source

## Script Load Order (Index.cshtml)

1. `bunker/i18n/translations.js`
2. `bunker/i18n/localization.js`
3. `bunker/apocalypse/icons.js`
4. `bunker/apocalypse/visual-config.js`
5. `bunker/apocalypse/state.js`
6. `bunker/apocalypse/helpers.js`
7. `bunker/apocalypse/render.js`
8. `bunker/apocalypse/effects.js`
9. `js/game.js` (last)

## Functions Remaining in game.js (intentionally)

- `renderApocalypse` (orchestrator)
- `registerSignalREvents` (SignalR binding)
- `syncPublicGameSettings` (settings sync)
- `syncApocalypseSettings` (lobby settings)
- Lobby/apocalypse UI event handlers
- `Object.assign(uiTranslations...)` blocks
- Bootstrap block (`registerSignalREvents()` call, `connection.start()`)

## Extraction Categories

### State (`state.js`) — 11 mutable bindings
`apocalypseReactionTimers`, `apocalypseEffectBannerTimer`, `apocalypseAmbientSchedulerTimer`, `apocalypseCategoryVisualState`, `apocalypseCardRevealWaveTimer`, `apocalypseParallaxFrame`, `apocalypseParallaxQueue`, `apocalypseParallaxTicking`, `apocalypseCurrentAmbientEvent`, `apocalypseDocumentVisibilityHandler`, `apocalypseReducedMotionSynced`

### Helpers (`helpers.js`) — 12 pure functions
`normalizeApocalypseMetadataValue`, `normalizeApocalypseVisualThemeId`, `resolveApocalypseVisualTheme`, `resolveApocalypseVisualVariant`, `normalizeApocalypseCategoryToken`, `getApocalypseDangerKey`, `getApocalypseDangerLabel`, `apocalypseEffectSummaryKey`, `prefersReducedApocalypseMotion`, `resolveApocalypseCategoryIconKey`, `normalizeLocalScenarioImageUrl`, `buildApocalypseScenarioModel`

### Render (`render.js`) — 10 render functions
`createApocalypseCategoryIcon`, `clearApocalypseVisualTheme`, `applyApocalypseVisualTheme`, `syncApocalypseVisualTheme`, `renderApocalypseIcon`, `renderApocalypseContentSection`, `renderApocalypseScenario`, `renderApocalypseCategoryBadge`, `handleApocalypseHeroImageError`, `openCurrentApocalypseImage`

### Effects (`effects.js`) — 23 effect functions
`ensureApocalypseAmbientRoot`, `getApocalypseEffectsLevel`, `setApocalypseEffectsLevel`, `syncApocalypseEffectsPreference`, `clearApocalypseVisualReactions`, `triggerApocalypseVisualReaction`, `canRunApocalypseEnvironmentalEffects`, `getApocalypseCategoryRegistry`, `resolveApocalypseCategoryProfile`, `getApocalypseCategoryEventPools`, `clearApocalypseCategoryVisualState`, `syncApocalypseCategoryVisualState`, `clearApocalypseAmbientEvent`, `triggerApocalypseAmbientEvent`, `startApocalypseAmbientScheduler`, `stopApocalypseAmbientScheduler`, `resetApocalypseParallax`, `flushApocalypseParallax`, `queueApocalypseParallaxUpdate`, `initApocalypseParallaxManager`, `clearApocalypseCardRevealWave`, `triggerApocalypseCardRevealWave`, `syncDocumentVisibilityEffects`

## Verification

- `dotnet build --no-restore`: 0 errors, 0 warnings
- `npm run test:static`: 304 pass / 45 fail (45 pre-existing failures, 0 new regressions)
- Bootstrap order tests: 7/7 pass
- Icon registry tests: 13/13 pass
- Apocalypse domain modularization tests: 18/18 pass
- Apocalypse theme tests: 9/9 pass
- Apocalypse category effects tests: 3/3 pass
- Apocalypse effect runtime tests: 6/6 pass
- Apocalypse immersive UI tests: 10/10 pass
- Apocalypse visual polish tests: 13/13 pass
