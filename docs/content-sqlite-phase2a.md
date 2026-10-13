# SQLite content migration — Phase 2A reader

## Scope

Phase 2A adds `SqliteContentReader`, a read-only projection over the Phase 1 content database. It is not registered in `Program.cs`; production continues to construct `GameDataService` and `ScenarioContentRegistry` from JSON, and the content editor continues to write JSON only.

The reader uses `AsNoTracking()` queries and exposes no mutation operation. The development comparison command opens SQLite with `Mode=ReadOnly`, so it cannot modify the content database.

## Reconstructed content

`SqliteContentSnapshot` recreates the existing C# models for all 16 live categories:

- Game data: hobbies, professions, mental and physical conditions, items, character traits, phobias, facts, apocalypses, bunkers, threats, special cards, and properties.
- Scenario data: scenario events, event special cards, and their existing validated `JsonElement.Source` payloads.

It also reconstructs the execution metadata that is not an ordinary item collection:

- apocalypse categories, visual themes, and interactive-effect schema;
- property condition profiles;
- scenario schema/version validation and card-reference validation through the existing `ScenarioContentRegistry` parser.

The reader deserializes the Phase 1 `PayloadJson` fields into the current model types. It reads root-level metadata from the preserved `ContentDocuments.RawJson`, maintaining complex structures such as apocalypse effects, threat mechanics, scenario eligibility/effects, property random fields, and item threat metadata.

## Localization

Condition catalogs are stored as separate language source documents. The reader rehydrates them into the current `Dictionary<string, ConditionLocalization>` shape. `SqliteContentSnapshot.ResolveLocalizationPayload(category, stableId, language)` uses the Phase 1 policy: requested language, Ukrainian, then deterministic first available language. It does not add translations to models or the database.

## Development comparison

After importing a development content database, run:

```powershell
dotnet run --project tools/ContentMigration -- --content-root .\wwwroot\data --database .\App_Data\content.db --compare
```

The command opens the database read-only and compares JSON-loaded `GameDataService`/`ScenarioContentRegistry` data with `SqliteContentReader`. It reports per-category count or semantic payload differences and returns a non-zero code on a difference. A successful run reports:

```text
Semantic comparison passed: JSON and SQLite content are equivalent.
```

## Validation

`SqliteContentReaderTests` imports the current source into in-memory SQLite and compares every reconstructed pool with JSON data. It covers stable IDs/counts through full semantic collection comparison, character-generation pools, bunker/property data, apocalypse definitions and interactive schema, threat mechanics, scenario eligibility/effects, localized values, special-card/item metadata, Ukrainian fallback for missing mental-condition English entries, and EF no-tracking reads.

## Safe future cutover

Phase 2B should add an explicit, disabled-by-default source-selection feature flag and dual-read comparison telemetry. It should use the reader only after the development comparison has passed against the intended imported database. A later rollout must retain JSON as a fallback, preserve current `GameDataService`/`IScenarioContentRegistry` public contracts, and keep editor writes JSON-backed until a separate transactional editor migration has been designed and validated.
