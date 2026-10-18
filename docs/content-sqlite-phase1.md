# SQLite content migration — Phase 1

## Scope and safety

Phase 1 adds an isolated `ContentDbContext`. It is not registered in `Program.cs`, and `GameDataService`, `ScenarioContentRegistry`, the content editor, and all live game services continue to read their existing JSON files. The migration tool rejects `bunker.db`; use a separate content database such as `App_Data/content-phase1.db`.

No JSON file is modified or deleted by this phase.

## Schema

| Table | Purpose |
| --- | --- |
| `ContentDocuments` | Exact UTF-8 JSON source for every document under `wwwroot/data`, with SHA-256 fingerprint. |
| `ContentCategories` | Active runtime collection keys. |
| `ContentItems` | Stable-ID entries from active arrays, indexed by category and display name. `PayloadJson` preserves category-specific fields and nested gameplay data. |
| `ContentLocalizations` | Per-item `uk`, `en`, and `ru` localization projections. Missing languages are warnings, never generated text. |
| `ContentTags` | Searchable tags, resource tags, protection tags, capability tags, and bunker/apocalypse tags. |
| `ContentRelationships` | Validated stable-ID links, including apocalypse categories/themes, related apocalypse/bunker references, and scenario event-card references. |
| `ContentImportRuns` | Non-dry-run import summary. |

The initial migration is `20261013170000_InitialContentSchema`. Foreign keys tie item child data to its exact source document and stable item identifier; relationship targets are also foreign keys.

## JSON mapping

The importer indexes the active `GameDataService` collections (professions, hobbies, conditions, items, character traits, phobias, facts, apocalypses, bunker data, threats, special cards, and properties), `ScenarioContentRegistry` events/cards, Spy locations, apocalypse category/theme metadata, and visual classification entries. Every other JSON document remains preserved in `ContentDocuments` even when it is not yet a queryable item collection.

Fields such as `effects`, `eligibility`, `gameplay`, `threatUsage`, condition profiles, assets, selection priorities, and nested localized arrays remain losslessly stored in `PayloadJson`/`RawJson`; Phase 1 deliberately does not normalize or execute those structures.

## Commands

Run a full validation without touching a database:

```powershell
dotnet run --project tools/ContentMigration -- --content-root .\wwwroot\data --database .\App_Data\content-phase1.db --dry-run
```

Create or update the separate development content database:

```powershell
dotnet run --project tools/ContentMigration -- --content-root .\wwwroot\data --database .\App_Data\content-phase1.db
```

The importer validates strict JSON syntax, required/duplicate stable IDs for every indexed collection, tag shapes, and known cross-content ID relationships. It runs all replacement work in one transaction. A dry run uses an in-memory SQLite database and always rolls its transaction back. A regular run is idempotent: it replaces only the content database’s imported dataset in a transaction, so a failed import leaves the previous content import intact.

## Backup and rollback

Before a non-dry-run import, copy the separate content database while the application/tool is stopped:

```powershell
Copy-Item .\App_Data\content-phase1.db .\App_Data\content-phase1.backup.db
```

To roll back, stop any tool using the file and replace `content-phase1.db` with that backup. The live `bunker.db` is intentionally neither read nor written by the importer.

## Validation and next phase

`ContentJsonImporterTests` imports the current repository content into in-memory SQLite twice, compares stable IDs, raw nested JSON, localized content, numeric values, scenario effects, and cross-category references, and verifies idempotence. Missing translations are returned as warnings for review.

Phase 2 may introduce a read-only database-backed adapter behind an explicit feature flag, compare it with `GameDataService` in a staging environment, and only then consider a controlled switch. It must not bypass the existing JSON content editor until editor writes, reload behavior, and rollback paths are separately designed.
