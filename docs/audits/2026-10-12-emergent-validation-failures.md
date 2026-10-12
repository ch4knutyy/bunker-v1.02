# Emergent cleanup validation failure inventory

Saved baseline/final logs from the interrupted session were compared by exact test name (timings removed). No pre-cleanup suite was rerun or history rewritten. These are existing failures, not passing checks. Unchanged results establish baseline parity, not correctness of every failing feature.

| Suite | Baseline | Final | Failure-name comparison |
| --- | --- | --- | --- |
| .NET | 459 total; 453 passed; 6 failed; 0 skipped | 459 total; 453 passed; 6 failed; 0 skipped | All 6 identical |
| JavaScript | 420 total; 208 passed; 212 failed; 0 skipped | 421 total; 209 passed; 212 failed; 0 skipped | All 212 identical |

The added GM dispatch test explains the one-test increase. Evidence is retained locally under `.tmp/emergent-validation`: `javascript-baseline.log`, `javascript-final.log`, `dotnet-baseline/emergent-baseline.trx`, and `dotnet-final/emergent-final.trx`. Ignored temporary evidence is not included in Git.

## .NET: exact six failure names

- `Bunker.UnitTests.Services.CharacterGeneration.PropertyGenerationTests.PropertyCatalogLoadsAllDefinitionsAndGenerationRespectsBoundsAndRoomUniqueness`
- `Bunker.UnitTests.Services.CharacterGeneration.PropertyGenerationTests.PropertyThreatContributionUsesServerCapturedTagsAndIsNeverMarkedForConsumption`
- `Bunker.UnitTests.Services.CharacterGeneration.PropertySpecialCardEffectsTests.PropertyEditorRejectsNonHostOmniscientUnknownAndInvalidValues`
- `Bunker.UnitTests.Services.CharacterGeneration.PropertySpecialCardEffectsTests.PropertyRerollAvoidsCurrentAndOtherActiveDefinitionsAndPreservesRevealState`
- `Bunker.UnitTests.Services.CharacterGeneration.PropertySpecialCardEffectsTests.PropertyRevealValidatesMissingTargetDataAndDoesNotUseNormalRoundRevealCounter`
- `Bunker.UnitTests.Services.CharacterGeneration.PropertySpecialCardEffectsTests.PropertySwapMovesWholeRuntimeValueButKeepsRevealFlagsOnPlayerSlots`

The property tests report an expected exception not thrown, three TargetParameterCountExceptions, an expected catalog count of 300 versus 500, and a null threat contribution. These pre-existing failures were not repaired as part of provenance cleanup.

## JavaScript: exact 212 failure names

- `110 connection.off calls in signalr-events.js (defensive pattern)`
- `110 connection.on registrations in signalr-events.js`
- `Bunker handlers present in signalr-events.js`
- `Bunker rules use one localized source for the full rules page`
- `Bunker uses one generic material shell without changing the existing resolver contract`
- `Characteristic/Player handlers present in signalr-events.js`
- `GM UI requests preview first, renders safe modal and guards double confirm`
- `GM bunker tab exposes food and water actions through canonical hub methods`
- `GM command pending flags reset in RejoinSuccess (cross-system)`
- `GM diagnostics UI renders safe issues and unified audit without reload`
- `GM emergency UI confirms mutations and guards double submit`
- `GM history UI localizes, escapes, limits and renders server timestamps`
- `GM panel exposes the current role-safe tabs and diagnostics`
- `GM/omniscient handlers present in signalr-events.js`
- `Hobby details conditionally render experience and canonical item without empty rows`
- `Lobby/Room handlers present in signalr-events.js`
- `Old Property payload without structured details falls back safely`
- `Postgame handlers present in signalr-events.js`
- `Property details use escaped label value rows and long values wrap safely`
- `Property title and structured details are separate presentation values`
- `RejoinSuccess handler present in signalr-events.js`
- `RejoinSuccess resets pending GM command flags before rejoining`
- `Round/Timer handlers present in signalr-events.js`
- `Special cards handlers present in signalr-events.js`
- `Tests\JavaScript.Contracts\game-js-domain-modularization.test.js`
- `Tests\JavaScript.Contracts\signalr-events-domain-decomposition.test.js`
- `Tests\JavaScript.Contracts\threat-contribution-independence.test.js`
- `Threat handlers present in signalr-events.js`
- `UA RU and EN overview and comparison labels are registered in the current localization system`
- `UA, RU and EN use the matching localization`
- `UI has double confirmation and public spectator marker only`
- `Voting handlers present in signalr-events.js`
- `a new game revision allows the warning again`
- `account-bound gameplay user does not receive the warning`
- `acknowledgement deduplicates within one game revision`
- `activation uses one section and the existing delegated apply flow`
- `additional condition tooltip has its own localized name, severity and description`
- `advanced editor UI is closed by default live localized and guarded`
- `all activation labels are localized and warnings are mapped`
- `all eleven card types keep one shell and expose distinct CSS-only identities`
- `all runtime messages are localized in three languages`
- `apocalypse bunker and room count regression remain independent`
- `apocalypse image state restrains pattern and keeps a circular decorative medallion`
- `apocalypse renderer and room count privacy guard remain independent`
- `apply is allowlisted, replaces old state, is idempotent and null clears it`
- `apply stays on existing revision command flow and theme manager is not duplicated`
- `automatic special card neighbors are presentation-only canonical seat labels`
- `available pending used and unavailable states reuse the existing endpoint safely`
- `banner uses safe DOM construction and reduced motion`
- `blocker codes are mapped and never inserted as visible text`
- `bunker card renders localized food and water as independent metrics`
- `bunker renderer and the guarded room player count remain independent`
- `canonical apocalypse reveal wave is duplicate-safe and reconnect does not replay it`
- `canonical events use generic reactions without duplicate handlers`
- `canonical metadata resolver covers every requested visual identity`
- `canonical metadata resolver supports every requested variant and generic fallback`
- `canonical picker owns grouped batching, counts and stable selection`
- `canonical resolver supports facility variants and condition overrides`
- `card, table and live-rendered rows use the same delegated tooltip component`
- `category effects use the single canonical controller and timer owners`
- `category presentation uses allowlisted icons and catalog-localized names`
- `circular decorative medallion replaces the duplicated condition block`
- `classification resolves bounded material and apocalypse layers with safe fallbacks`
- `client has number input and no active plus-minus flow`
- `client lobby is live and hides gameplay until running`
- `client prevents double submit and handles live snapshots`
- `client rejects stale versions and clears hidden DOM without storage`
- `client renders guide and requirements without score or capability tags`
- `client running renderer is order-independent and preserves personal state`
- `comparison is the default mode and renders every gameplay player as a compact dossier`
- `comparison sealed rows never read hidden values while revealed rows use only public helpers`
- `complete public model retains metadata while raw ids and tags never enter DOM`
- `condition resolver normalizes UA RU EN equivalents into presentation semantics`
- `default and custom conditional controls are contract driven`
- `developer badge and observer mode use only server projections`
- `diagnostics and audit are host-authorized and use canonical live events`
- `director UI requires preview confirmation and blocks duplicate submit`
- `disabled systems are omitted cleanly instead of rendering empty cards`
- `display sorting uses a copied model list and never mutates canonical seat order`
- `double click cannot duplicate a GM command`
- `draft normalization and import export preserve only v4 apocalypse settings`
- `effects disable preserves nested draft values and remains separate from theme`
- `empty details are omitted and long content has responsive wrapping`
- `environmental scheduler is rare, theme-allowlisted and lifecycle-safe`
- `exactly one executable registerSignalREvents() call in game.js`
- `existing image state and broken-image fallback handlers stay canonical`
- `fallback patterns remain atmospheric and the sealed threat remains neutral`
- `final UI uses one server status and a nonzero server progress`
- `final payload carries status, outcome, score, and refreshed players`
- `five canonical metrics render and empty content sections are omitted`
- `frontend maps actual Item plus compatible aliases and keeps renderer replacement idempotent`
- `game completion enters final discussion without opening a blank story surface`
- `game events reuse renderApocalypse without duplicating theme logic`
- `game page starts with the apocalypse story and uses floating room controls`
- `guest gameplay user receives the warning`
- `health presentation separates a safe severity suffix and semantic variants normalize the full scale`
- `hidden delivery uses one private event and no room broadcast`
- `hobby mirrors profession optional details and does not derive tooltip from rows`
- `host cancellation preserves the private developer draft and recovery remains explicit`
- `hub exposes one canonical snapshot event and safe resync`
- `icons are local inline SVG with fallback and no emoji final icon`
- `image is reveal-only decorative media with safe broken-image fallback and stacking`
- `image states tune only the confirmed bunker pattern layer`
- `immersive internals and scenario image layers are not overridden by the site pass`
- `intentionally retained functions remain in game.js`
- `legacy bunker payload falls back to food only when water is absent`
- `live UX keeps credits compact and visuals non-blocking`
- `live and reconnect completion use the same renderer and canonical room state`
- `live capacity image reconnect and localization paths reuse the current renderer`
- `live food and water events update canonical fields without refresh`
- `live merge replaces private player state and refreshes public snapshots`
- `live reconnect localization and capability paths stay canonical`
- `live rerenders use one overview source and preserve existing immersive renderers`
- `live revision or host transfer discards stale drafts and non-host remains read-only`
- `live runtime registers exactly one public and one personal handler`
- `live snapshot, privacy boundary, localization and room count guard remain intact`
- `live, reconnect and language paths rerender the same current scenario`
- `lobby start uses one ordered canonical running handoff`
- `lobby uses one member surface and lifecycle visibility`
- `local hero media has safe fallback and correct non-negative stacking order`
- `local image is decorative and unsafe or remote sources fall back to CSS`
- `local presets and JSON interchange are versioned and whitelist only normalized settings`
- `localized Item is preferred and item or experience alone do not create a tooltip`
- `main command shell is wider and has both outer and inner border treatment`
- `media overlay pattern and content retain the non-negative 0-1-2-3 stack`
- `migration UI is restricted to blocked categories and double confirmed`
- `missing localized description does not borrow another illness or language description`
- `mode-specific editors are canonical and incremental`
- `model preserves canonical fields while renderer exposes no ids or tags`
- `modifier slots are deterministic, independent and suppress contradictions`
- `no top-level executable calls in signalr-events.js`
- `null render and theme switches clear ambient reaction state`
- `numeric experience pluralizes in UA RU EN and localized strings are not duplicated`
- `old payloads without property normalize to an unavailable non-revealable value`
- `omniscient hidden state update refreshes GM panel button`
- `one delegated interaction boundary handles selector and previous next controls`
- `one delegated setup handler prevents duplicate bindings and keeps draft local until Apply`
- `one late safe rule fully disables every revealed hero pattern with an image`
- `one reusable renderer supports all canonical characteristic cards`
- `one universal bunker renderer owns the complete technical facility shell`
- `one universal renderer owns hidden revealed text and interactive layouts`
- `one universal renderer owns the full immersive scenario structure`
- `one universal special-card renderer owns the complete accessible shell`
- `opening threat section and server payload update status without reload`
- `other .gitkeep files are preserved`
- `overview uses canonical seats and retains or safely repairs selection`
- `page background is lightweight layered CSS rather than a plain color`
- `personal snapshots use verified current connections and public payload does not generate characters`
- `physical, mental and additional conditions reuse one shared health tooltip renderer`
- `post-game actions are host-safe and summary exposes names instead of ids`
- `prepared scenario is private, stable and reused by the final lobby start`
- `preview is host-authorized, fingerprinted and does not mutate or broadcast room state`
- `preview is separate from confirmed idempotent apply`
- `privacy and live rerender boundaries remain explicit`
- `private card and public overview render every condition while overview respects reveal state`
- `profession details and deterministic tag icon priority use safe fallback`
- `property is an initially hidden canonical card rendered after inventory without technical metadata`
- `property reveal, hide, regeneration and omniscient controls use the existing characteristic pipeline`
- `radiation and air filter reuse existing interaction renderers and handlers`
- `read-only GM roles cannot see bunker controls`
- `registerSignalREvents exists exactly once in game.js`
- `registration opens a clean account URL in a new tab`
- `registry consumers in game.js are not renamed`
- `registry is deeply frozen and helper arrays are defensive copies`
- `reload and reveal paths normalize the same condition collection`
- `reload obtains the same canonical server threat state`
- `renderApocalypse is the single canonical synchronization point`
- `rendered overview exposes only public seat references and no internal player ids`
- `resetClientGameStateForNewRoom clears all GM transient state`
- `responsive shell and reduced motion contracts are present`
- `restaurant tags use local food-service icons and reveal lock is inline svg`
- `return event clears post-game state and restores the canonical lobby renderer`
- `reveal keeps the existing endpoint and blocks duplicate pending commands`
- `revealed model uses public fields but ids and tags never enter scenario DOM`
- `room exit and reset paths clear through renderApocalypse null`
- `round HUD preserves values and applies explicit running paused expired state classes`
- `round blocks have labels, spacing, wrapping and responsive layout`
- `safe DTO has no hidden fields and client clock is render-only`
- `scenario images and prompts require server-authenticated developer authority`
- `sealed cards never read or serialize hidden public values`
- `sealed state is neutral and cannot serialize future metadata`
- `sealed threat privacy and scenario interactions remain unchanged`
- `semantic resolver maps canonical metadata and falls back to neutral`
- `settings use one versioned canonical model, atomic apply, revision and freeze`
- `severity and terminal states normalize without exposing raw codes`
- `shared CSS variables drive variants, condition states and responsive geometry`
- `shared CSS variables provide rare variants and responsive geometry`
- `shared delegated portal tooltip provides hover focus tap escape and outside close once`
- `shared portal is fixed, viewport-corrected and does not clip long descriptions`
- `shared shell uses variables, fixed geometry, inner border and footer anchoring`
- `shared variables variants circular medallion and responsive rules are present`
- `snapshot UI is live, localized, confirmed, and prevents double submit`
- `snapshot service uses explicit state and excludes runtime room fields`
- `spectator and GM roles do not receive the warning`
- `stone material, category accent line and layered bevel use one local asset`
- `successful activation synchronizes player and authority state before the public event`
- `successful edit is linked to snapshot audit integrity and existing live events`
- `target selection is conditional, stable across rerender and exposes no connection ids`
- `theme manager never reads gameplay effects or hidden identifiers`
- `there is exactly one apocalypse settings tab and one delegated handler set`
- `threat image loses the pattern while fallback keeps a subtle texture`
- `threat tab has single resync control and single authoritative renderer`
- `three property special cards are registered with target validation, idempotency and audit`
- `three public scenarios share one full-width section, panel and shell contract`
- `timer client prevents double submit`
- `timer derives warning and critical visuals from canonical remaining time`
- `tooltip is conditional and reuses the single delegated portal`
- `tooltips are conditional and generic privacy or duplicate content is rejected`
- `two conditions retain two independent descriptions`
- `v4 import export contains settings but excludes runtime policy and effects`
- `visible phase and interaction state use localized labels`
- `visual impact variants drive the full shell and keep the tooltip out of flow`

Many failures involve relocated symbols or manifests, including missing root GAME_JS_FUNCTION_MANIFEST.json and SIGNALR_EVENT_MANIFEST.json. This does not establish that every failure is stale; only the exact unchanged baseline is established.

## Unmodified HTTPS browser selection

Chromium: **20 tests; 8 passed; 12 failed; 0 skipped**. Eleven failures stop at the missing `#startGameBtn`; one stops at missing `#profileName`. The pre-cleanup Razor already used `#lobbyStartPrimaryButton`; no test selectors or current Razor were changed by cleanup. This was not a complete cross-browser suite.

### Failed

- `GM pause and forward round correction update live without duplicate commands` — missing #startGameBtn
- `round 1 early voting survives refresh and the next round does not auto-start voting` — missing #startGameBtn
- `host panel opens after game start and keeps normal GM controls` — missing #startGameBtn
- `lobby roles readiness start and spectator reconnect stay canonical` — missing #startGameBtn
- `поле імені профілю можна очистити без повернення старого значення` — missing #profileName
- `desktop overview reveals public data, preserves selection and never serializes hidden values` — missing #startGameBtn
- `four-player previous next and automatic special-card labels follow canonical seat order with wrap-around` — missing #startGameBtn
- `edge fixtures support zero one and twelve players without hidden data or duplicate cards` — missing #startGameBtn
- `390 mobile uses horizontal touch selector and one-column public cards without page overflow` — missing #startGameBtn
- `desktop revealed scenario images have no grid while overlays and content remain` — missing #startGameBtn
- `missing and broken images restore only the atmospheric fallback patterns` — missing #startGameBtn
- `mobile images remain clean visible aligned and free of overflow` — missing #startGameBtn

### Passed

- `MOBILE: гравець створює кімнату з телефона`
- `MOBILE: після F5 гравець залишається в кімнаті`
- `MOBILE: закрив сайт і повернувся — гравець відновив кімнату`
- `MOBILE: після втрати інтернету і повернення гравець лишається в кімнаті`
- `MOBILE: поворот телефона не ламає кімнату`
- `MOBILE: другий гравець закрив сайт і повернувся в кімнату`
- `поле імені гравця в грі можна повністю очистити`
- `порожнє ім’я не створює кімнату і показує помилку`

## Selector correction only: 0 passed, 11 failed

Ten tests were blocked by the existing guest-account warning modal; the host-panel test reached its old full-viewport height expectation (640 actual versus >=718 expected). No production regression is established by these failures. Evidence: `.tmp/emergent-validation/supplemental-results.json`. Temporary harness only; these do not turn the unmodified suite green.

- FAIL: `GM pause and forward round correction update live without duplicate commands`
- FAIL: `round 1 early voting survives refresh and the next round does not auto-start voting`
- FAIL: `host panel opens after game start and keeps normal GM controls`
- FAIL: `lobby roles readiness start and spectator reconnect stay canonical`
- FAIL: `desktop overview reveals public data, preserves selection and never serializes hidden values`
- FAIL: `four-player previous next and automatic special-card labels follow canonical seat order with wrap-around`
- FAIL: `edge fixtures support zero one and twelve players without hidden data or duplicate cards`
- FAIL: `390 mobile uses horizontal touch selector and one-column public cards without page overflow`
- FAIL: `desktop revealed scenario images have no grid while overlays and content remain`
- FAIL: `missing and broken images restore only the atmospheric fallback patterns`
- FAIL: `mobile images remain clean visible aligned and free of overflow`

## Guest-warning handler added: 3 passed, 6 failed

Lobby/spectator reconnect, four-player ordering and mobile overview passed. Two overview tests still expected ten characteristics instead of the current eleven (Property is included); three image fixtures assumed threatContent existed before a threat was revealed; the new flow test closed a persisted accordion after refresh. Evidence: `.tmp/emergent-validation/current-results.json`. Temporary harness only; these do not turn the unmodified suite green.

- FAIL: `current GM voting controls synchronize start, vote, refresh and cancel`
- PASS: `lobby roles readiness start and spectator reconnect stay canonical`
- FAIL: `desktop overview reveals public data, preserves selection and never serializes hidden values`
- PASS: `four-player previous next and automatic special-card labels follow canonical seat order with wrap-around`
- FAIL: `edge fixtures support zero one and twelve players without hidden data or duplicate cards`
- PASS: `390 mobile uses horizontal touch selector and one-column public cards without page overflow`
- FAIL: `desktop revealed scenario images have no grid while overlays and content remain`
- FAIL: `missing and broken images restore only the atmospheric fallback patterns`
- FAIL: `mobile images remain clean visible aligned and free of overflow`

## Current characteristic count and fixture handling: 4 passed, 1 failed

All four overview tests passed. The new flow test attempted to click the GM opener even though the panel had already been restored open after refresh. Evidence: `.tmp/emergent-validation/verified-results.json`. Temporary harness only; these do not turn the unmodified suite green.

- FAIL: `current GM voting controls synchronize start, vote, refresh and cancel`
- PASS: `desktop overview reveals public data, preserves selection and never serializes hidden values`
- PASS: `four-player previous next and automatic special-card labels follow canonical seat order with wrap-around`
- PASS: `edge fixtures support zero one and twelve players without hidden data or duplicate cards`
- PASS: `390 mobile uses horizontal touch selector and one-column public cards without page overflow`

## Focused flow before GM data synchronization: 0 passed, 1 failed

Voting start, guest vote, refresh and cancellation passed their assertions. The local GM dispatch check ran without synchronizing the server-delivered GM player data; its DOM assertion failed. Evidence: `.tmp/emergent-validation/before-data-wait-flow-results.json`. Temporary harness only; these do not turn the unmodified suite green.

- FAIL: `current GM voting controls synchronize start, vote, refresh and cancel`

## Final focused flow: 1 passed, 0 failed

The fixture explicitly requests/waits for current GM player data and checks immediate dispatch output, without requiring it to survive later server refresh resets. Voting start/vote/refresh/cancel, dispatch, and three image load/error fallback handlers passed. Evidence: `.tmp/emergent-validation/flow-results.json`. Temporary harness only; these do not turn the unmodified suite green.

- PASS: `current GM voting controls synchronize start, vote, refresh and cancel`
