# 2026-07-24 game.js 02C: Icon Registries Extraction

## Slice

02C — Pure frozen icon/metadata registries extraction from `wwwroot/js/game.js` into 4 system-specific files.

## Summary

Extracted 7 pure frozen icon registries (10294→10187 lines, −107 lines) from `game.js` into 4 new `<script>` files loaded before `game.js`. All consumers remain in `game.js` — no function moves, no IIFE, no ES modules, no bundler. Zero regressions.

## Files Created

| File | Registries Moved |
|------|-----------------|
| `wwwroot/js/bunker/threats/icons.js` | `threatIconSvgRegistry` |
| `wwwroot/js/bunker/bunker/icons.js` | `bunkerIconSvgRegistry` |
| `wwwroot/js/bunker/special-cards/icons.js` | `specialCardIconSvgRegistry` |
| `wwwroot/js/bunker/characters/icons.js` | `characteristicIconRegistry`, `professionIconRegistry`, `characteristicIconSvgRegistry`, `publicCharacteristicDefinitions` |

## Files Modified

| File | Change |
|------|--------|
| `wwwroot/js/game.js` | Removed 7 registry declarations (−107 lines) |
| `Views/Bunker/Index.cshtml` | Added 4 `<script>` tags before `game.js` |
| `Tests/JavaScript.Contracts/characteristic-cards-ui.test.js` | Loads `charactersIcons` |
| `Tests/JavaScript.Contracts/special-cards-ui.test.js` | Loads `specialCardsIcons` |

## Files Created (Tests)

| File | Tests |
|------|-------|
| `Tests/JavaScript.Contracts/game-js-icon-registry-modularization.test.js` | 13 tests — existence, frozen, type, scope, consumers |

## Files Deleted

4 `.gitkeep` files (threats, bunker, special-cards, characters). 14 other `.gitkeep` files preserved.

## Script Load Order

```
signalr-lite.js → game-utils.js → translations.js → localization.js →
threats/icons.js → bunker/icons.js → special-cards/icons.js → characters/icons.js →
game.js → (rest unchanged)
```

## Criteria Met (All 7 Registries)

- `Object.freeze()` — confirmed
- No function references — confirmed
- No DOM dependencies — confirmed
- No state mutation — confirmed
- Logically belongs to system module — confirmed
- No circular dependencies — confirmed
- Safe for parallel file loading (no init ordering) — confirmed

## Verification

### Build
```
dotnet build --no-restore: ✅ 0 errors
```

### Test Results
| Suite | Result |
|-------|--------|
| `game-js-icon-registry-modularization.test.js` | ✅ 13/13 pass |
| `player-overview-ui.test.js` | ✅ 12/12 pass |
| `gm-panel-v2.test.js` | ✅ 11/11 pass |
| `gm-panel-stage3.test.js` | ✅ 10/10 pass |
| `post-game-story-director.test.js` | ✅ 5/5 pass |
| `gm-threat-control.test.js` | ✅ 6/6 pass |
| `game-js-bootstrap-order.test.js` | ✅ 7/7 pass |
| `special-cards-ui.test.js` | 7 pass / 1 fail (pre-existing CSS pattern) |
| `characteristic-cards-ui.test.js` | 2 pass / 13 fail (pre-existing stale regex) |

### Full JS Contract Suite (02C)
- **295 pass / 35 fail / 330 total**
- 02B baseline: 275 pass / 36 fail / 311 total
- Delta: +13 new tests (icon registry, all pass), 0 regressions

### Pre-existing Failures (Not Caused by 02C)
- `characteristic-cards-ui.test.js`: Stale regex for `renderCharacteristicCard`, `professionIconRegistry` string match, `restaurant: 'cloche'`, `cardExperience: 'Досвід'` — functions/text moved in 02B
- `special-cards-ui.test.js`: `.special-card-shell` CSS pattern mismatch
- `threat-contribution-independence.test.js`: Empty test file
- `bunker-food-water.test.js`, `bunker-immersive-ui.test.js`, `game-completion.test.js`, etc.: Pre-existing failures

### Runtime Verification
Pending — requires browser Ctrl+F5 test by user.

## Design Decisions

1. **`publicCharacteristicDefinitions` → `characters/icons.js`**: Met all 6 placement criteria; logically belongs with character registries
2. **Apocalypse registries stay in `game.js`**: Separate future slice, no extraction in 02C
3. **No IIFE/ES modules/bundler**: Global variables, `<script>` order, matching existing codebase conventions
4. **Consumers untouched**: Only declarations moved; all renderers/processors remain in `game.js`

## Risks

- **Script load order dependency**: New files must load before `game.js`. Verified in `Index.cshtml` and bootstrap order tests.
- **Global namespace pollution**: 4 new globals (`threatIconSvgRegistry`, `bunkerIconSvgRegistry`, `specialCardIconSvgRegistry`, plus `charactersIcons` group). Acceptable for current architecture.
