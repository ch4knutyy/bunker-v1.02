# Bunker Repository Instructions

This file defines the operating rules for AI agents working in the **Bunker** repository.

The repository contains active partial systems, ongoing refactors, and uncommitted user changes. Extend the current architecture safely. Do not replace, duplicate, broadly rewrite, or roll back working functionality unless the user explicitly requests it.

---

## 1. Project overview

**Core architecture**

- ASP.NET Core
- SignalR
- Razor
- JavaScript
- JSON-based declarative content
- xUnit
- Playwright
- SQLite

**Primary development goal**

Preserve current runtime behavior while incrementally improving structure, maintainability, diagnostics, and test coverage.

---

## 2. Non-negotiable preservation rules

- Preserve all uncommitted user changes.
- Do not perform broad rollback.
- Do not replace working systems with parallel implementations.
- Do not duplicate existing services, models, handlers, registries, or state containers.
- Reuse the current architecture before introducing new abstractions.
- Make the smallest safe change that completes the requested task.
- Do not modify unrelated files.
- Do not rewrite large working blocks only for style.
- Do not silently change public behavior, payloads, event names, or localization keys.
- When a requested change is genuinely unsafe or contradicted by the code, preserve the current implementation and report the contradiction clearly.

---

## 3. Agent execution rules

- Work directly in the active **Build** agent.
- Do not delegate repository analysis or editing to Explore, `task`, or other subagents.
- Do not use the `task` tool.
- Do not stop after the first grep, read, or tool call.
- Continue autonomously through:
  1. inspection;
  2. implementation;
  3. focused verification;
  4. final reporting.
- Do not ask for confirmation when the requested operation is already clear.
- Use only tools that are actually available in the current OpenCode session.
- Do not invent unavailable tools or tool names.
- Prefer targeted `grep`, `read`, `edit`, `write`, and `bash` operations.
- Avoid dumping entire large files when bounded reads are sufficient.
- Inspect every relevant section before editing.
- Do not claim runtime verification that was not actually performed.

---

## 4. Critical commands and workflows

Use the repository's existing commands and formats.

### Build and run

- `dotnet build Bunker.slnx`
- `dotnet build --no-restore`
- `dotnet run`

### Focused tests

- `dotnet test --filter "TestName"`
- specific Playwright test file or project only
- specific JavaScript structural or contract test only

### Repository checks

- `git diff --check`
- `git status --short`
- `git diff --stat`

### Important notes

- `.slnx` is the repository's preferred solution format.
- Playwright E2E tests require the server to be running.
- Restarting the server breaks active Playwright sessions.
- JavaScript tests use the existing cached `node_modules`; do not reinstall dependencies unless explicitly required.
- xUnit test execution may require:
  `[assembly: CollectionBehavior(MaxParallelThreads = 1)]`

---

## 5. Testing policy

For refactoring tasks, use focused verification only.

- Do not run existing full test suites unless the user explicitly requests them.
- Do not run all xUnit, Playwright, npm, or static tests.
- Do not investigate or repair unrelated existing failing tests.
- Do not change production code merely to satisfy a stale relocation-sensitive test.
- Create only one new focused test for the current task.
- Keep the new test short, normally no more than **5–8 assertions**.
- Run only the newly created test file or exact focused test.
- Prefer structural tests for pure file relocations.
- Prefer behavioral tests only when the task changes runtime behavior.
- Do not claim success based only on static text matching when runtime behavior was changed.
- Allowed routine verification:
  - `dotnet build --no-restore`
  - `git diff --check`
  - `git status --short`
  - `git diff --stat`

When verification cannot be completed, report exactly what was and was not run.

---

## 6. Core architectural boundaries

### Server authority

- Perform server-side state mutations before broadcasting derived UI updates.
- JSON is declarative configuration and content, not technical game logic.
- Technical rules, schedulers, validation, state transitions, scaling, and authority checks belong in C#.
- Do not move authoritative game logic into client-side JavaScript or content JSON.

### SignalR

- Verify both client and server counterparts when editing SignalR methods or events.
- Preserve PascalCase/camelCase tolerance across serialization boundaries.
- Check reconnect and full-state payload compatibility when editing state properties.
- Preserve event names, payload shapes, and invocation semantics unless explicitly requested.
- Avoid creating duplicate registrations or duplicate broadcasts.

### Room initialization order

Preserve the existing initialization sequence:

1. Game settings
2. Player generation
3. Threat selection
4. Derived UI synchronization

### Persistence

- `bunker.db` is the primary SQLite persistence.
- Existing backups and snapshots must not be invalidated casually.
- Do not alter persistence format without an explicit migration plan.

---

## 7. SignalR refactoring rules

These rules apply when decomposing `wwwroot/js/bunker/core/signalr-events.js` or similar SignalR registration files.

### Discovery

- Inspect the entire relevant file before editing.
- Enumerate every literal:
  - `connection.off(...)`
  - `connection.on(...)`
- Build an exact ordered event manifest before moving code.
- Read the file in bounded chunks until EOF.
- Do not infer unseen sections.
- Record exact event names and original registration order.

### Extraction

- Move only complete `off/on` event pairs.
- Preserve exactly:
  - event names;
  - callback bodies;
  - payload handling;
  - helper calls;
  - side effects;
  - error handling;
  - global registration order.
- Do not merge non-contiguous event blocks if that changes registration order.
- Use separate registration functions in the same domain file when necessary.
- Leave genuinely cross-domain lifecycle, reconnect, and full-state synchronization events in core.
- When classification is uncertain, keep the event in core and report it.

### JavaScript architecture

- Preserve the current plain-script global architecture.
- Do not introduce:
  - ES modules;
  - `import`;
  - `export`;
  - bundlers;
  - dynamic loaders;
  - ScriptLoader utilities;
  - CDN-based loading;
  - a new file system abstraction.
- Do not rename existing global functions unless explicitly requested.
- Do not create hidden dependencies through load order without documenting and verifying them.

### Script loading

- Find the existing Razor or HTML script list.
- Load extracted domain event scripts before `core/signalr-events.js`.
- Follow the existing script-tag style.
- Do not duplicate script tags.
- Preserve dependency order.
- Verify every new registration function is defined before it is called.

### Final structural verification

Before finishing, verify:

- every original literal event still exists exactly once;
- every `off/on` pair remains together;
- no callback was truncated;
- no payload handling changed;
- no imports, exports, dynamic loaders, or bundlers were introduced;
- registration order is preserved;
- remaining core events have a documented cross-domain reason.

---

## 8. JavaScript and client-side rules

- Preserve existing global state conventions unless the task explicitly changes them.
- Do not introduce a parallel state store.
- Reuse existing normalization helpers.
- Preserve reconnect behavior and refresh persistence.
- Keep DOM updates compatible with existing Razor markup.
- Preserve camelCase/PascalCase payload fallbacks.
- New visible UI text must use localization through `t()`.
- Avoid inline handlers when the task is specifically migrating them, but do not rewrite unrelated inline handlers.
- Do not rename CSS classes, IDs, or data attributes without checking all references.

---

## 9. C# and server-side rules

- Reuse existing services and state models.
- Preserve host, GM, player, spectator, and omniscient authority boundaries.
- Keep technical validation and game rules in C#.
- Use existing error-code conventions.
- Preserve reconnect-safe state.
- Preserve snapshot and undo safety rules.
- Do not restore connection mappings or current host from snapshots unless the existing system explicitly supports it.
- Avoid broad controller or hub rewrites.
- Use existing logging patterns.
- Add targeted tests only for changed behavior.

---

## 10. JSON and content rules

- Files under `wwwroot/data` and other large content JSON locations are declarative content.
- Do not inspect or analyze large JSON arrays during structural audits unless the user explicitly requests content work.
- It is acceptable to verify:
  - file paths;
  - loading;
  - schema integration;
  - references;
  - localization availability.
- Do not move technical rules into JSON.
- Preserve existing IDs and references.
- Do not regenerate or reformat large content files unnecessarily.
- Avoid changing generated image metadata unless the task explicitly concerns it.

---

## 11. Localization rules

Localization is mandatory for user-facing content.

- New UI text must support:
  - Ukrainian;
  - Russian;
  - English.
- Use the existing `t()` function and localization structure.
- Preserve existing keys when possible.
- Do not hardcode one-language replacements into shared UI.
- Verify fallback behavior.
- Preserve severity names and localized descriptions.
- Maintain PascalCase/camelCase tolerance for localized payloads when already supported.

---

## 12. Domain boundaries

Prefer existing domain folders and services before creating new ones.

Typical client domains include:

- apocalypse
- bunker
- characters
- core
- diagnostics
- events
- global-content
- gm
- i18n
- inventory
- lobby
- postgame
- public-overview
- rounds
- special-cards
- threats
- timer
- ui
- voting

New files should belong to the narrowest existing domain that owns the behavior.

Do not create a new domain folder when an appropriate one already exists.

---

## 13. Change discipline

Before editing:

- inspect the relevant files;
- identify existing helpers;
- identify runtime dependencies;
- identify script/load order;
- identify current tests related to the behavior.

During editing:

- keep diffs small;
- preserve formatting style;
- avoid unrelated cleanup;
- avoid mass renames;
- avoid formatting entire files;
- do not delete legacy behavior without proof that it is unused.

After editing:

- inspect the diff;
- run the one focused test;
- run allowed build and Git checks;
- report unresolved uncertainty explicitly.

---

## 14. Final report requirements

Every completed task report must include:

1. What changed.
2. Why the change was needed.
3. Exact files created or modified.
4. Important preserved behavior.
5. Focused test executed and its result.
6. Build result.
7. `git diff --check` result.
8. `git status --short` summary.
9. `git diff --stat`.
10. Any remaining uncertainty or unverified runtime behavior.

Do not hide failures. Do not describe a check as passing when it was not run.

---

## 15. Token usage report

At the end of every task, report:

- Tokens at task start: only when shown by OpenCode.
- Tokens at task end: only when shown by OpenCode.
- Tokens used by the task: only when calculable from real displayed values.
- Context usage at task end: only when shown by OpenCode.

Never estimate, infer, or invent token values.

When a value is unavailable, write:

`unavailable`

Recommended format:

```text
Token usage
- Tokens at task start: unavailable
- Tokens at task end: unavailable
- Tokens used by the task: unavailable
- Context usage at task end: unavailable
```

---

## 16. Safety rule for incomplete evidence

When historical behavior, current runtime behavior, or test expectations disagree:

- inspect the relevant current implementation;
- inspect historical code only when needed;
- distinguish stale tests from production regressions;
- do not add new behavior solely to satisfy an unsupported assumption;
- document the evidence used for the decision.

Preserve behavior when evidence is incomplete.
