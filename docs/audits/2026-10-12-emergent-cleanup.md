# Emergent legacy cleanup — 2026-10-12

This is a limited, evidence-backed cleanup, not a claim that all agent-derived code has been removed. Active, mixed-authorship implementations remain deliberately intact. Removing them wholesale would violate the preservation requirement.

## Scope and evidence

- Repository: `ch4knutyy/bunker-v1.02`; branch: `cleanup/remove-emergent`.
- Baseline HEAD: `d5c753e0ad44f3f6fd4a0ce92837fa221db69121`; working tree was initially clean.
- All ten supplied commits resolve locally and identify `emergent-agent-e1 <github@emergent.sh>` as author. This establishes Git attribution, not independent verification of the GitHub profile's identity.
- Inspected commit metadata, changed paths and patches using `git show`; compared current implementations, symbol references, `git log --follow`, move-aware blame and exact blob identity. The accompanying [patch inventory](2026-10-12-emergent-patch-inventory.md) records every changed path, addition/deletion counts, complete-patch fingerprints and exact current-tree blob matches. Scaffold component patches were additionally scanned programmatically for imports/declarations; absence of a path or identical blob alone is not proof that no derivative code exists.
- No commits, pushes, branch switches, author changes or history rewriting were performed. Main was untouched. The user-reported backup bundle was not located or verified; no assumption was made about its availability elsewhere.
- Content arrays, database contents, uploads and snapshots were not changed.

## Status of all ten commits

| Commit | Original change | Current mapping and disposition |
| --- | --- | --- |
| `8ed15548` | Personality GM row; casing-safe characteristic formatting, reset and editing | Mixed and retained in `Views/Shared/Bunker/_GmPanel.cshtml` and `wwwroot/js/bunker/gm/runtime.js`. Personality/Body formatters and `getCharValue` still serve later Inventory, Property, Fact and localization work. The write-only reveal-map reset inherited by this patch was removed; actual hidden/revealed DOM state remains. |
| `0fb33649` | Body GM row; local peek/hide behavior; ten-character name sanitization; table overflow | Partial cleanup: removed the unused `gmRevealedChars` declaration, write and resets from the three current JS files listed below. Retained active peek behavior, name rules in `Hubs/BunkerHubGame/GameHub.Helpers.cs` / `GameHub.Rooms.cs`, characteristic controls and styling. Changing truncation versus rejection is a separate behavior decision. |
| `916afe00` | Random supply addition/removal and explicit voting-button visibility | Original random direct-mutation implementation already superseded by `GameHub.GameMaster.cs` → `MutateBunkerResource`, with validated amounts, food/water separation, authority, idempotency and snapshots. Public method/event names remain active in `wwwroot/js/bunker/bunker/runtime.js` and `signalr-events.js`. Voting visibility now uses current round/voting helpers. Retained these later implementations and contracts. |
| `c59ee69d` | Scenario image service/controller, model ImageUrl/prompts, DI, UI/modal and events | Substantial original implementation remains mixed with later work. Current service is `Services/Bunker/Content/ScenarioImageService.cs`; controller remains `Controllers/ScenarioImageController.cs`; models moved to `Models/Game/Scenarios/ApocalypseAndBunker.cs`. Current Developer authority, threat images, hidden lobby previews and image rendering depend on it. Retained pending an explicit replacement/removal decision. The originally removed duplicate `UseStaticFiles` call must not be reintroduced by revert. |
| `06f45eb0` | Eliminated-player display and active-player capacity count | Original table/lobby markup has been superseded in part by current public-overview and lobby views; active-player counting and elimination UI remain in `wwwroot/js/bunker/public-overview/runtime.js`, UI code and `wwwroot/css/game.css`. Retained current elimination behavior and styling; no blanket CSS deletion. |
| `bc6b2a78` | Host controls, GM section visibility, scenario heading and two-player test threshold | Mixed: `wwwroot/js/bunker/ui/runtime.js` retains visibility behavior and a hardcoded two-player fallback. `updateGMSections` now delegates to round status and the current GM panel. Server start rules use canonical game settings. Heading/theme changes have later UI dependencies. Retained; restoring four players would change behavior. |
| `21f74e9b` | StartGame Lobby-state fix; casing normalization, UI updates and debug logs | Correct Lobby check remains in `Services/Bunker/Rooms/RoomService.cs` with later locking, settings validation and seat assignment. Original hub start flow is superseded by `GameHub.Lobby.cs::StartGameFromLobby`; the old `StartGame` endpoint rejects with `lobby_preview_required`. Current `GameStarted` handler keeps complete canonical snapshots rather than the old hand-built partial objects. Debug-heavy original handler is substantially superseded. Retained the necessary Lobby check and current lifecycle. |
| `710bc285` | normalizePlayer; RoomCreated/RoomJoined/RejoinSuccess normalization; voting variable fix | Mixed and retained: `wwwroot/js/bunker/characters/runtime.js::normalizePlayer`, `wwwroot/js/bunker/lobby/signalr-events.js`, and `wwwroot/js/bunker/ui/runtime.js`. Later stable IDs, roles, hidden state, localization, health and property fields depend on these paths. Undoing normalization or restoring the use-before-declaration bug is unsafe. |
| `897e867d` | 77-path Python/React scaffold, Emergent hooks/branding, gitlink and agent documents | Most already absent. Deleted the surviving unchanged `test_result.md` template now at `docs/archive/test_result.md`. Current README and gitignore are later project-specific versions and remain. Nested gitlink contents cannot be attributed from this checkout; see limitations below. |
| `a353025a` | Initial commit | Empty root tree and empty patch: no code to remove. It remains in history, as required for this non-rewriting task. |

## What was already absent or replaced

- `backend/` FastAPI/MongoDB example and requirements, `frontend/` React/CRACO/shadcn code, visual-edit plugin configuration, Emergent badge/script and PostHog snippet are absent at their original tracked paths. `6a99ba2` records removal of backend/frontend files and `memory/PRD.md`.
- `.emergent/emergent.yml` was removed in `487df68`; the Python test placeholder was removed in `c16c940`. The original `bunker-project` gitlink was replaced in `c980028`; its original object cannot be inspected locally.
- No Emergent/PostHog/webpack-health/React-backend integration markers were found in current Hubs, Controllers, Services, Models, Views, `wwwroot/js`, Program, project or package manifests. This is a scoped reference check, not a provenance certificate.
- The original `Views/Home/Index.cshtml` game page is now a separate landing page. Gameplay resides in `Views/Bunker/Index.cshtml`, Razor partials and domain scripts. Original root `GameHub.cs`, `Service/RoomService.cs` and `Service/ScenarioImageService.cs` paths are no longer the current implementation locations.
- Original random bunker-supply mutation, fixed partial scenario snapshots and much of the verbose start/rejoin logging were replaced by later code. Their replacement does not make the remaining public feature safe to delete.

## Changes made and preserved behavior

| File | Change and reason |
| --- | --- |
| `wwwroot/js/game.js` | Removed the unused `gmRevealedChars` global and its comment. |
| `wwwroot/js/bunker/gm/runtime.js` | Removed the write in `revealCharInGMPanel` and two resets in `loadPlayerDataForGM`. Kept value formatting, hidden/revealed CSS toggles, player switching and the server peek call. |
| `wwwroot/js/bunker/core/runtime.js` | Removed only the obsolete map reset from room reset; all other state clearing stays intact. |
| `docs/archive/test_result.md` | Deleted the 103-line agent coordination template. `git diff 897e867d:test_result.md HEAD:docs/archive/test_result.md` was empty before deletion; its only later history entry was the archive relocation `87851bd`. It held no test results, and repository references before deletion were self-references only. |
| `Tests/JavaScript.Contracts/legacy-gm-reveal-cleanup.test.js` | Added one focused executable regression test with seven assertions for hide, peek, PascalCase Body formatting, server invocation and switching players without the map. |
| `docs/audits/2026-10-12-emergent-patch-inventory.md` | Added the complete original-path inventory and reproducible patch fingerprints. |
| `docs/audits/2026-10-12-emergent-cleanup.md` | This decision and validation report. |

The map was introduced by `0fb33649`; later files carried it through refactors. Reference inspection found only its declaration, writes and resets, never a consumer. The real UI state is maintained by DOM values/classes. The current regression test executes the actual GM runtime in a VM with DOM and connection stubs; it is not merely a source-text assertion.

No intended user-facing behavior changes. No new API, event, payload, localization key, dependency, loader or state store was introduced. SignalR registrations, script order, reconnect/full-state handling, lobby/game settings, voting and authoritative C# mutations remain unchanged. Historical audit documents mentioning the old global were preserved as historical records.

## Independently developed and mixed systems preserved

- Game session persistence: `Services/Bunker/GameSessions/GameSessionHistoryService.cs` originates with Dima's `6e86560`, followed by participant history in `7861fdb` and later changes. Reviewed the current session service, lifecycle transitions and hub integration. SQLite session/player persistence and migrations were untouched.
- Start/session handling: `GameHub.Lobby.cs` freezes settings, invokes the room transition, prepares gameplay characters, completes the start and persists participant snapshots. `GameHub.GameSessionLifecycle.cs` delegates departures to `GameSessionLifecycleTransitions`. These are not candidates for removal based on the ten supplied patches.
- Multiplayer: inspected current hub room/name handling, room state transition/recovery, lobby start/rejoin event handling, and voting start authority, snapshots and eligible-voter setup. Current `RoomService` uses locks and canonical settings. None was rolled back.
- GM controls: later `e39af08` and `0bafc65` changes extend the current panel and client runtime. Existing characteristic formatting, hidden-state controls, Inventory/Property/Fact support and authority boundaries remain.
- Scenario images: the controller now authorizes through `DeveloperAuthorityService` rather than accepting the old client-supplied connection ID; it checks the current target and suppresses lobby broadcasts. The service also stores threat images. Preserving these later changes rules out deleting the original image feature as a unit.
- Blame often attributes moved/imported lines to later Dima commits (`9cad09f`, `f37b949`, etc.). That is not sufficient evidence of independent authorship: original patches and current behavior were compared as well.

## Validation

| Check | Result |
| --- | --- |
| `dotnet restore Bunker.slnx --verbosity minimal` | Passed; all projects up to date. Initial sandbox attempts exited 1 without restore diagnostics; `dotnet --info` showed access denied to Windows Service Control Manager. The retry outside the sandbox succeeded. |
| `dotnet build Bunker.slnx --no-restore --verbosity minimal` | Passed, 0 warnings, 0 errors; app and unit-test project built. |
| `node --test Tests/JavaScript.Contracts/legacy-gm-reveal-cleanup.test.js` | Passed: 1 test, 0 failures. |
| Focused xUnit command below | Passed: 3 tests, 0 failed, 0 skipped. |
| JS syntax and Razor script references | All 3 changed JS files parsed using `vm.Script`; all 66 literal local script references in `Views/Bunker/Index.cshtml` exist. |
| Removed-symbol/reference search | No `gmRevealedChars` references remain in runtime JS. Old audit mentions remain intentionally; the new test checks absence. No runtime dependency on the deleted protocol was found. |
| `git diff --check` | Passed. Git initially reported LF-to-CRLF normalization notices; these were not whitespace errors. |
| Diff review | Only the obsolete map/reset lines and unchanged archive template removed; one focused test and two audit documents added. |

Exact C# test command:

```powershell
dotnet test Tests/Bunker.UnitTests/Bunker.UnitTests.csproj --no-build --no-restore --filter "FullyQualifiedName=Bunker.UnitTests.GameSessionRoomLifecycleTests.OnePlayerLeave_MarksLeftEarlyWithoutAbandoningRoomSession|FullyQualifiedName=Bunker.UnitTests.GameSessionRoomLifecycleTests.LastPlayerLeave_MarksLeftEarlyAndAbandonsRoomSession|FullyQualifiedName~CanonicalResourceServiceKeepsFoodAndWaterIndependentAndClamped" --verbosity minimal
```

No full test suite, browser/Playwright session, live multiplayer game, upload/delete round trip or production database check was run. Passing these focused tests does not verify live reconnect, voting or image behavior end to end. No server was started, stopped or restarted.

## Remaining ambiguity and decisions

1. `897e867d` points to `bunker-project` commit `769434fccb6769b7b4a5564a7cf8277b60915aa9`. `git cat-file -t` reports that object unavailable. Its contents and the PRD's claims about SecretGoal cannot be verified from that gitlink; the PRD is not proof of authorship. Obtain the original nested repository/bundle if deeper attribution is required. Do not delete current characteristics on this basis.
2. Decide whether active functionality with mixed ancestry should remain, be removed, or receive a separately scoped independent replacement. The image system, character normalization, GM formatting and name rules require explicit contracts and broader behavioral coverage before such work. No replacement was improvised here.
3. Keep the Lobby start predicate: reverting it to `Waiting` would contradict current room creation and start flow. Similarly, removing supply endpoints or case-tolerant normalization would break current clients and later features.
4. The ten-character sanitizer truncates before the subsequent length check; changing it to rejection would be observable. The two-player client fallback also needs comparison against current lobby settings before any behavior change. Both were retained.
5. Local reference searches cannot rule out external consumers of classic-script globals. Within this repository the removed map had no reader. Live browser validation is still advisable.
6. This audit covers the specified Git commits and identifiable descendants; it cannot prove human versus AI authorship in later user-authored commits. No claim of complete agent-code removal is made.

## Future history plan — recommendation only

Keep this cleanup as an ordinary reviewed commit first. Code cleanup and contributor-history removal are different operations: deleting code does not remove its commits from ancestry.

For a separately authorized history project, first verify the local bundle and restore it into a disposable offline clone, including any nested repository objects; retain the original repository as an archive. Inventory all branches/tags and downstream consumers. Build an explicit old-to-new commit map and replay user-authored changes into a candidate history, reviewing each dependency on an omitted agent patch. Preserve genuine author metadata; never relabel agent work as user work. Resolve missing required behavior through reviewed replacements with their own truthful authorship.

It is impossible to remove ancestor commits while keeping all descendant commit IDs unchanged: parent IDs are part of the commit hash. Preserve user-authored content, messages and metadata where feasible, with the mapping and archive for traceability. Compare final trees, run broader multiplayer/reconnect/voting/GM/image and persistence validation, and obtain approval for any semantic differences. Publish a candidate under a new branch or repository for review rather than overwriting existing refs. Any eventual protected-branch migration or destructive operation requires a new explicit authorization. Nothing in this plan was executed.

## Working-tree summary

Three runtime JS files modified; one obsolete document deleted; one test and two audit documents added. All changes remain uncommitted on `cleanup/remove-emergent`. `git diff --stat` reports tracked changes only; the three newly added, untracked files must be included when reviewing/staging the change.

`git status --short`:

```text
 D docs/archive/test_result.md
 M wwwroot/js/bunker/core/runtime.js
 M wwwroot/js/bunker/gm/runtime.js
 M wwwroot/js/game.js
?? Tests/JavaScript.Contracts/legacy-gm-reveal-cleanup.test.js
?? docs/audits/2026-10-12-emergent-cleanup.md
?? docs/audits/2026-10-12-emergent-patch-inventory.md
```

`git diff --stat` (tracked files):

```text
 docs/archive/test_result.md       | 103 --------------------------------------
 wwwroot/js/bunker/core/runtime.js |   1 -
 wwwroot/js/bunker/gm/runtime.js   |   8 ---
 wwwroot/js/game.js                |   3 --
 4 files changed, 115 deletions(-)
```

Token usage
- Tokens at task start: unavailable
- Tokens at task end: unavailable
- Tokens used by the task: unavailable
- Context usage at task end: unavailable
