# SQLite content migration — Phase 1 validation

Validation date: 2026-10-13  
Branch: `codex/content-sqlite-phase1`

## Scope and safety result

The validation database is `App_Data/content.db`. It was created with the standalone ContentMigration CLI and is separate from the application's configured `bunker.db`. `ContentDbContext` remains unregistered in `Program.cs`; `GameDataService`, `ScenarioContentRegistry`, and the editor still use JSON.

An attempted non-dry import using `--database bunker.db` was rejected before a DbContext was opened, with exit code 2. No production database, JSON source, game session, SignalR contract, or editor write path was changed.

## Record-count reconciliation

The earlier 3,340 figure is the 16 live game/editor categories:

| Category | Records |
| --- | ---: |
| professions | 204 |
| hobbies | 200 |
| mental conditions | 300 |
| physical conditions | 304 |
| items | 500 |
| character traits | 210 |
| phobias | 150 |
| facts | 300 |
| apocalypses | 220 |
| bunkers | 205 |
| threats | 100 |
| special cards | 58 |
| properties | 500 |
| scenario events | 30 |
| event special cards | 29 |
| spy locations | 30 |
| **Live-category total** | **3,340** |

The database total is 3,795 because Phase 1 additionally preserves 455 queryable metadata/classification records needed for a later safe reader:

| Additional category | Records |
| --- | ---: |
| apocalypse categories | 10 |
| apocalypse category index | 10 |
| apocalypse visual themes | 10 |
| apocalypse visual classification | 220 |
| bunker visual classification | 205 |
| **Additional total** | **455** |
| **Database item total** | **3,795** |

## Import and source comparison

The importer strictly parsed all 25 JSON documents and imported 3,795 stable-ID records, 9,780 localization projections, and 5,953 searchable tags. Source documents are retained byte-for-byte as `ContentDocuments.RawJson`, while each queryable entry retains its original raw JSON as `ContentItems.PayloadJson`; this preserves numeric values and nested structures such as `effects`, `eligibility`, `gameplay`, and `threatUsage` without normalization loss.

The schema requires `(SourcePath, StableId)` as the item primary key and `(CategoryKey, StableId)` as a unique index. The importer rejects missing/duplicate IDs before any replacement work, validates every known relationship target, and the focused test verifies an apocalypse numeric value/localization/payload, a scenario nested effect, stable re-import count, and relationship existence.

## Relationship-count reconciliation

The previously reported 2,368 relationships were the four direct/reference collection kinds:

| Relationship kind | Records |
| --- | ---: |
| category | 230 |
| visual theme | 230 |
| related apocalypse | 658 |
| related bunker | 1,250 |
| **Earlier total** | **2,368** |

The final importer recursively inspects active nested gameplay objects. It correctly retains 24 `grant_event_card` and 4 `requires_missing_event_card` relationships from scenario event data, producing the validated final total of **2,396**.

## Translation fallback

All 300 mental-condition records have Ukrainian and Russian source entries but no English source entries. They remain warnings, not generated translations. `ContentLocalizationFallback.ResolvePayload` defines the future database reader policy: requested language, then Ukrainian, then deterministic first available language. The focused test verifies an English request for an imported mental condition returns its Ukrainian localization payload.

## Failure-safety checks

- Re-importing the same source is idempotent for content records.
- A malformed `items.json` produces `ContentImportValidationException` and leaves the existing imported row count unchanged.
- A deliberate SQLite insert-abort trigger causes the transactional replacement to fail; disposal rolls the transaction back and the previously imported row count remains unchanged.
- A dry run uses an in-memory SQLite database and rolls back explicitly.

## Test status

- Focused Phase 1 importer test: passed (1/1).
- Full unit suite: 378 passed, 14 failed. Failures are unrelated in scope to this change: content-editor atomic-write expectations, a property catalog count expectation (300 vs current 500), and related global-content/stable-ID tests. They do not exercise `ContentDbContext` or the importer. A pre-change baseline was not run in this validation task.
- Full JavaScript contract suite: failed broadly outside the Phase 1 code path. The output includes a missing root `GAME_JS_FUNCTION_MANIFEST.json` and many UI/static-contract expectation failures. No Phase 1 JavaScript files exist or are loaded by the application; a pre-change baseline was not run in this validation task.

The .NET CLI emitted `NU1900` only because the environment could not reach NuGet vulnerability metadata; restore was not performed and the migration import itself completed.
