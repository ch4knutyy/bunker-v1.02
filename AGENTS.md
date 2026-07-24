# Bunker Repository Instructions

## 1. Purpose and scope

This file defines the default operating rules for AI coding agents working in the Bunker repository.

Bunker is a multiplayer ASP.NET Core application built with:

- C#
- ASP.NET Core
- SignalR
- Razor
- JavaScript
- JSON content files
- xUnit
- Playwright

The repository contains a large, interconnected implementation with active partial systems and existing user changes. Extend the current architecture safely. Do not replace, duplicate, broadly rewrite, or roll back working functionality unless the user explicitly requests and approves that exact action.

These instructions apply to implementation, debugging, refactoring, testing, review, and repository analysis tasks.

---

## 2. Instruction priority

When instructions conflict, follow this order:

1. The user's explicit instruction in the current task.
2. Approval gates and safety rules in this file.
3. Repository-specific rules in this file.
4. Existing project conventions and nearby code patterns.
5. General engineering best practices.

A destructive or breaking action is considered approved only when the user clearly names or accepts that specific action. A broad request such as “fix it” is not approval for deletion, schema changes, migrations, contract breaks, or architectural rewrites.

If a task conflicts with an approval-required rule, stop before editing and request approval.

---

## 3. Default operating mode

The default mode is **inspect, plan briefly, implement, verify, report**.

After inspecting the relevant implementation, proceed directly with the requested change. Do not wait for confirmation unless:

- the user requested analysis only;
- the task is materially ambiguous and no safe interpretation exists;
- an approval-required action is necessary;
- the requested behavior conflicts with existing architecture in a way that could break state, permissions, persistence, reconnect, or compatibility.

Do not stop after producing only a plan when the user requested implementation.

For small tasks, keep the pre-edit plan brief. For complex cross-layer tasks, describe the execution flow, affected files, risks, and verification plan before editing.

---

## 4. Mandatory discovery before editing

Before changing code:

1. Identify the relevant entry points.
2. Search for existing implementations, partial implementations, helpers, services, models, DTOs, events, tests, and state objects.
3. Use LSP operations when available:
   - go to definition;
   - find references;
   - symbol lookup;
   - hover/type information;
   - call hierarchy.
4. Use Grep, Glob, or text search as a supplement, not the only source of truth.
5. Read the relevant sections of each file before editing.
6. Inspect nearby naming, validation, localization, logging, and error-handling conventions.
7. Inspect `git status` and relevant `git diff` output before editing.
8. Preserve unrelated uncommitted user changes.

If LSP is unavailable, continue with careful text search and code inspection, then explicitly report that LSP verification was unavailable.

Before creating any new class, service, DTO, state object, SignalR method, event, helper, JavaScript module, or test utility:

1. Search for an existing equivalent.
2. Inspect all relevant references.
3. Confirm that the behavior cannot be added cleanly to an existing component.
4. Prefer extending the current implementation.
5. Create a new component only when it has a clear, non-duplicated responsibility.

Never create a parallel replacement for functionality that already exists partially or fully.

---

## 5. Cross-layer tracing

For multiplayer or stateful features, trace the complete execution chain where applicable:

```text
client action
→ JavaScript validation/UI state
→ SignalR hub method
→ server-side permission and state validation
→ domain/service logic
→ canonical Room/Player/game state mutation
→ server event or synchronization payload
→ client event handler
→ rendered UI
→ reconnect/refresh restoration
```

Do not verify only one side of a client-server feature.

When changing a SignalR method, event, payload, DTO, or state property, inspect:

- every server caller;
- every client caller;
- every server event sender;
- every client event handler;
- reconnect/full-state synchronization;
- camelCase/PascalCase compatibility where already supported;
- tests;
- serialization and mapping code;
- error codes and localized messages.

---

## 6. Core engineering rules

1. Preserve existing working behavior.
2. Reuse existing services, models, DTOs, helpers, SignalR flows, events, and game-state objects.
3. Complete or adapt partial implementations instead of replacing them.
4. Make the smallest coherent change that fully solves the task.
5. Keep diffs focused.
6. Do not refactor unrelated code.
7. Do not perform broad rewrites.
8. Do not roll back unrelated or partially integrated work.
9. Preserve backward compatibility unless the user explicitly approves a breaking change.
10. Preserve existing naming, structure, formatting, encoding, and line endings.
11. Avoid speculative abstractions.
12. Avoid placeholder implementations.
13. Avoid new dependencies when the existing stack can solve the task reasonably.
14. Do not silently remove validation, behavior, logging, compatibility code, or error handling.
15. Do not leave temporary logging, commented-out replacements, dead code, or unfinished TODO placeholders.
16. Do not mass-format files for a localized change.
17. Do not perform broad search-and-replace without reviewing every affected match.
18. Do not hide exceptions or suppress failures without a documented reason.
19. Treat warnings and test failures honestly.
20. Do not claim success without evidence.

---

## 7. Partial implementation policy

Assume unfinished-looking code may belong to an active partial implementation.

Before adding or replacing anything, check whether the behavior already exists in or is referenced by:

- `Room`;
- `RoomGameSettings`;
- `Player`;
- room services;
- SignalR hubs;
- game-state models;
- client-side state;
- reconnect/resynchronization code;
- snapshots, audit, undo, or recovery;
- existing tests.

When a partial implementation exists:

1. Determine its intended ownership and current usage.
2. Preserve already integrated behavior.
3. Complete or adapt it with the smallest safe change.
4. Do not create a second implementation.
5. Do not perform a general rollback.
6. Report any inconsistency found and how it was resolved.

---

## 8. Architecture boundaries

### 8.1 Server authority

Technical game rules, permissions, validation, state transitions, and multiplayer authority belong on the server in C#.

Client-side checks are for user experience only. They are not security or authority boundaries.

Every server command that mutates state should validate, where relevant:

- caller identity and permissions;
- room existence;
- room membership;
- current room/game phase;
- host, developer, premium, spectator, or omniscient-GM role;
- frozen settings;
- player eligibility;
- numeric ranges;
- nullability;
- command applicability;
- duplicate or repeated execution;
- command IDs when the existing architecture uses them.

Update canonical server state before broadcasting derived UI updates.

### 8.2 JSON responsibilities

JSON files should primarily contain:

- content;
- localization;
- declarative configuration;
- identifiers;
- content relationships;
- non-executable balancing values.

Technical rules, state transitions, permissions, and executable game logic should remain in C# unless the user explicitly approves a different design.

### 8.3 Existing systems to reuse

Reuse existing implementations where applicable, including:

- round completion;
- voting and elimination;
- ready checks;
- room and player state;
- reconnect and live resynchronization;
- threat selection, scaling, radiation, and effects;
- bunker resources;
- character generation;
- profession and inventory integration;
- severity handling;
- timers;
- snapshots;
- audit history;
- undo and recovery;
- role and permission checks.

---

## 9. SignalR and multiplayer safety

For state-changing SignalR commands:

1. Validate permissions on the server.
2. Validate current room and game state.
3. Protect against duplicate requests when relevant.
4. Consider repeated clicks and concurrent calls.
5. Mutate canonical state first.
6. Broadcast a consistent resulting state.
7. Preserve reconnect and refresh behavior.
8. Preserve existing event and payload compatibility.
9. Verify both the command path and response/event path.
10. Do not rely only on hiding or disabling a client button.

When editing payloads:

- preserve existing properties unless a breaking change is approved;
- inspect all JavaScript handlers;
- inspect reconnect/full-state payloads;
- preserve existing camelCase/PascalCase tolerance where present;
- inspect DTO mappings and tests;
- add compatibility fields only when necessary and document why.

Do not expose secrets, bootstrap keys, internal tokens, private configuration, sensitive diagnostics, or connection IDs unnecessarily.

Do not weaken existing host, developer, premium, spectator, or omniscient-GM checks.

---

## 10. Approval-required changes

Stop and request explicit approval before performing any of the following:

- deleting files;
- moving or renaming application files;
- renaming SignalR hub methods;
- renaming SignalR client events;
- changing established SignalR payload contracts;
- changing JSON schemas;
- performing mass edits to content JSON files;
- changing the fundamental structure of `Room`;
- changing the fundamental structure of `Player`;
- changing the fundamental structure of `RoomGameSettings`;
- creating database migrations;
- changing database schemas;
- changing authentication;
- changing authorization;
- changing user, lobby, host, premium, spectator, or omniscient-GM roles;
- changing snapshot architecture;
- changing undo or recovery architecture;
- removing backward compatibility;
- splitting large existing files into modules;
- broad architectural refactoring;
- mass formatting;
- upgrading major package versions;
- changing deployment, secrets, certificates, hosting, or production configuration;
- destructive or write-capable Git operations;
- any destructive, irreversible, or broadly breaking action.

Before requesting approval:

1. Explain why the change appears necessary.
2. Identify affected files and systems.
3. Describe compatibility, migration, or data risks.
4. Present the safest alternative.
5. Do not make partial destructive changes in advance.

---

## 11. Handling uncertainty

### 11.1 Local uncertainty

When ambiguity is limited and a safe interpretation exists:

1. Choose the safest assumption.
2. Keep the implementation easy to revise.
3. Avoid expanding the scope.
4. State the assumption in the final report.

### 11.2 Systemic uncertainty

When ambiguity may affect architecture, permissions, multiplayer state, persistence, snapshots, recovery, data integrity, or compatibility:

1. Perform a broader read-only audit.
2. Do not edit the uncertain system.
3. Report conflicting implementations or missing information.
4. Ask for clarification.

Never guess when a wrong assumption could cause data loss, permission bypass, broken game state, or incompatible client/server behavior.

---

## 12. Client-side code policy

Do not broadly refactor `game.js` or other large JavaScript files unless explicitly approved.

Allowed without extra approval:

- localized changes inside the relevant function;
- updating an existing handler;
- adding a narrowly scoped helper when reuse is clear;
- adding localization keys;
- fixing a directly related bug;
- preserving current style and flow.

Not allowed without approval:

- splitting `game.js` into modules;
- moving large groups of functions;
- renaming public client functions;
- replacing state management;
- replacing the SignalR integration;
- unrelated cleanup.

A larger refactor may be proposed in the final report, but must not be performed automatically.

---

## 13. JSON and content-file policy

Do not inspect or analyze entire large JSON arrays in `wwwroot/data` or other content collections unless the user explicitly requests content work.

Allowed without explicit permission:

- checking paths and file existence;
- checking loading and integration;
- inspecting a small representative object;
- checking object shape or schema;
- checking localization structure;
- checking specific IDs and references;
- checking serialization/deserialization;
- checking whether required properties are consumed.

Do not:

- summarize entire large collections;
- rewrite unrelated entries;
- normalize or reorder large arrays;
- change IDs unnecessarily;
- replace localized content during an unrelated code task.

Preserve Ukrainian, Russian, and English localization structures.

---

## 14. Language, naming, and localization

### 14.1 Agent communication

Write plans, warnings, assumptions, implementation summaries, and final reports in Ukrainian.
Natural-language reports must be written entirely in Ukrainian.

English is allowed only for:

- code identifiers;
- file and directory names;
- command names;
- library, framework, protocol, and API names;
- localization keys;
- exact error messages and quoted source-code fragments.

Do not mix English words into Ukrainian prose when a clear Ukrainian equivalent exists.
Do not introduce text in unrelated languages.

### 14.2 Code identifiers

Use English for:

- namespaces;
- class and interface names;
- method and property names;
- variables and parameters;
- enum values;
- DTOs and state objects;
- SignalR methods and events;
- localization keys;
- test names.

Follow existing project conventions.

### 14.3 Code comments

Write new explanatory comments in Ukrainian.

Do not add comments that merely restate obvious code.

Use comments only for non-obvious rules, compatibility behavior, concurrency protection, reconnect logic, unusual workarounds, or reasons for preserving legacy behavior.

Do not rewrite existing English comments only to translate them.

### 14.4 User-facing UI text

Do not hardcode new user-facing strings when the localization system is available.

Use the existing localization mechanism, such as localization keys or `t()`.

By default, for small and medium tasks, add all three translations:

- Ukrainian;
- Russian;
- English.

Localization keys must be in English.

For a large task where complete translation would materially expand the scope:

1. still use localization keys;
2. do not add temporary hardcoded UI strings;
3. add the translations that can be completed safely;
4. clearly report any missing locale;
5. do not claim localization is complete when it is not.

---

## 15. Testing and verification policy

The agent may run the following without additional approval when relevant:

- `dotnet build`;
- a narrow `dotnet test --filter ...`;
- one focused Playwright test;
- `git status`;
- `git diff`;
- `git diff --stat`;
- `git log`;
- read-only LSP operations;
- read-only code searches.

Do not run all tests by default.

Do not run without explicit request:

- the complete xUnit suite;
- the complete Playwright suite;
- broad integration tests unrelated to the change;
- repeated expensive checks without a reason;
- `dotnet clean`;
- server start/stop operations that interfere with the user's current session.

Choose the narrowest verification that covers the modified behavior.

If a check fails:

1. determine whether the current change caused the failure;
2. do not hide, suppress, or misrepresent it;
3. fix only failures caused by the task;
4. report unrelated pre-existing failures separately.

Do not interfere unnecessarily with an active `dotnet watch`, ngrok, OpenCode, browser, or manual test session.

After editing:

1. re-read changed regions;
2. inspect `git diff`;
3. check changed symbol references with LSP where relevant;
4. run narrow verification;
5. confirm no unrelated files changed.

---

## 16. Git policy

Git access is read-only unless the user grants explicit permission for a specific write action.

Allowed:

- `git status`;
- `git diff`;
- `git diff --stat`;
- `git log`;
- `git show`;
- inspecting branches and tracked files.

Not allowed without explicit permission:

- `git add`;
- `git commit`;
- `git push`;
- `git pull`;
- `git merge`;
- `git rebase`;
- `git reset`;
- `git restore`;
- `git checkout` when it changes files;
- `git clean`;
- branch or tag creation/deletion;
- remote modification;
- force operations.

Never discard user changes.

Never assume uncommitted changes were created by the agent.

---

## 17. Editing discipline

Before editing a file:

1. Read the relevant section.
2. Inspect definitions and references.
3. Check adjacent conventions.
4. Check whether the file already has uncommitted changes.
5. Identify the smallest safe insertion or modification point.

During editing:

- keep changes localized;
- preserve encoding and line endings;
- preserve unrelated formatting;
- avoid duplicate helpers and validation;
- avoid dead code and temporary logging;
- avoid commented-out replacements;
- review every match in any search-and-replace;
- do not weaken validation silently;
- do not hide exceptions without justification.

After editing:

1. re-read the changed region;
2. inspect the final diff;
3. verify modified references where relevant;
4. run the narrowest useful check;
5. confirm that no unrelated files changed.

---

## 18. Definition of done

A task is complete only when:

1. The requested behavior is implemented.
2. Relevant existing systems were reused.
3. No duplicate parallel implementation was introduced.
4. Server-side validation exists where required.
5. Client/server contracts remain compatible.
6. Localization was handled according to this file.
7. Reconnect and refresh implications were considered.
8. Relevant narrow checks were run.
9. The final diff was inspected.
10. Unverified behavior was clearly reported.
11. No unrelated files were modified.
12. No approval-required action was performed without approval.

Do not claim that something works unless supported by one or more of:

- code inspection;
- LSP;
- a successful build;
- a focused automated test;
- runtime verification;
- a clearly labeled inference.

---

## 19. Audit and analysis report persistence

For substantial read-only audits, architecture reviews, implementation plans, migration analyses, security reviews, or other reports that are too large for convenient chat transfer, save the final useful report as a Markdown document inside the repository.

This rule applies when:

- the user explicitly requests a saved report;
- the task prompt requires report persistence;
- the report is substantial enough that preserving it in project documentation is materially useful.

Do not create a repository report for trivial inspections, short answers, or routine implementation summaries unless the user requests one.

### 19.1 Relationship to read-only tasks

Creating the requested report document is allowed even when source-code modification is prohibited, provided that:

- the user did not explicitly prohibit creation of all files;
- only the report document is created or updated;
- no source code, configuration, content data, tests, project files, or runtime state are changed;
- the report is treated as an intended task output, not as an implementation change.

If the current task explicitly says **do not create files**, that instruction takes priority. Complete the audit in chat and ask whether the user wants the report saved afterward.

### 19.2 Documentation location

Before creating a report:

1. Inspect the existing documentation structure.
2. Reuse an appropriate existing directory when one clearly exists.
3. Prefer a repository-specific audit or architecture directory when available.
4. Otherwise use:

```text
docs/audits/
```

Do not reorganize existing documentation solely to store one report.

### 19.3 File naming

Use lowercase kebab-case names with an ISO date prefix:

```text
YYYY-MM-DD-topic-audit.md
YYYY-MM-DD-topic-review.md
YYYY-MM-DD-topic-plan.md
```

Examples:

```text
docs/audits/2026-07-24-gm-panel-audit.md
docs/audits/2026-07-24-voting-security-review.md
docs/audits/2026-07-24-scenario-system-plan.md
```

Do not overwrite an existing report unless the user explicitly requested an update to that exact document.

If the target filename already exists and the task is a separate report, use a meaningful suffix such as:

```text
-revised
-follow-up
-02
```

### 19.4 Required metadata

Begin every saved report with a compact metadata block containing, when available:

- title;
- date;
- report type;
- scope;
- status;
- repository branch;
- relevant working-tree state;
- tools or model used, when useful and available;
- checks performed;
- checks intentionally not performed;
- known limitations.

Do not include secrets, tokens, private configuration, bootstrap keys, connection IDs, or sensitive diagnostics.

### 19.5 Content requirements

The saved report must:

- be written in Ukrainian;
- use Markdown and UTF-8;
- be understandable without the original chat session;
- preserve the complete useful findings;
- preserve evidence, file paths, symbols, and approximate line references;
- distinguish verified facts from assumptions and inferences;
- preserve important tables;
- preserve risks and regression concerns;
- preserve approval gates;
- preserve the recommended implementation plan;
- preserve manual verification steps;
- state what was not inspected or verified.

Do not include:

- private chain-of-thought;
- hidden reasoning;
- internal deliberation;
- raw tool transcripts;
- repetitive progress messages;
- copied terminal noise;
- large source-code excerpts unless essential as evidence;
- unsupported claims.

Summarize tool activity as evidence instead of copying raw execution logs.

### 19.6 Repository safety

When saving an audit or analysis report:

1. The report must be the only repository modification unless the task explicitly authorizes other changes.
2. Do not modify source code merely to improve the report.
3. Do not run build, tests, Playwright, or the server solely for report persistence.
4. Do not run Git write operations.
5. Preserve unrelated uncommitted changes.
6. Do not update documentation indexes or navigation files unless explicitly requested.
7. Do not add generated binaries, screenshots, logs, or temporary files unless explicitly required.

### 19.7 Verification after writing

After creating or updating the report:

1. Verify that the file exists.
2. Verify that it is not empty.
3. Inspect the beginning and ending of the document.
4. Verify that headings and Markdown tables were preserved.
5. Check the file size and line count.
6. Run `git status --short` for visibility.
7. Inspect the report-specific diff when practical.
8. Confirm that no unrelated files changed.

The final chat response should contain only a concise summary plus:

- the exact report path;
- whether it was created or updated;
- file size;
- line count;
- verification result;
- any limitations.

Do not paste the full saved report into chat unless the user explicitly asks for it.

---

## 20. Final report format

At the end of every implementation task, provide a structured report in Ukrainian.

Use this format:

### Змінено

Briefly describe the implemented behavior.

### Файли

List every modified or created file and explain its role.

### Повторно використано

List existing services, methods, models, events, helpers, or flows that were reused.

### Перевірки

List exact commands, LSP operations, builds, tests, or manual inspections performed.

### Не запускалося

State which relevant checks were intentionally not run.

### Припущення

List any safe assumptions made. Omit this section when there were none.

### Ризики та ручна перевірка

List remaining risks, unverified runtime behavior, or manual scenarios to check.

For straightforward tasks, keep the report concise.

For architectural decisions, concurrency handling, compatibility work, failed checks, or non-obvious behavior, include a detailed technical explanation.

Never present an inference as verified fact.
