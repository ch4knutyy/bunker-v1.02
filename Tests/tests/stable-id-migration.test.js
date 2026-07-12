const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const migration = fs.readFileSync('Services/StableIdMigrationService.cs', 'utf8');
const commit = fs.readFileSync('Services/GlobalContentCommitService.cs', 'utf8');
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GlobalContentCatalog.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const models = fs.readFileSync('Models/GameData/HobbyData.cs', 'utf8') + fs.readFileSync('Models/GameData/CharacterTraitData.cs', 'utf8');

test('migration is deterministic server-side and changes only id', () => {
  assert.match(migration, /AlgorithmVersion = "sha256-name-v1"/);
  assert.match(migration, /SHA256\.HashData/);
  assert.match(migration, /NormalizationForm\.FormKC/);
  assert.match(migration, /SemanticallyEqualExceptId/);
  assert.doesNotMatch(hub, /mapping|proposedId|filesystemPath/i);
  assert.equal((models.match(/JsonPropertyName\("id"\)/g) || []).length, 2);
});

test('migration reuses canonical commit backup and rollback pipeline', () => {
  assert.match(migration, /CommitStableIdMigration/);
  assert.match(commit, /CreateBackup/);
  assert.match(commit, /AtomicReplace/);
  assert.match(commit, /RestoreBackupAtomic/);
  assert.match(migration, /\.manifest\.json/);
  assert.doesNotMatch(migration + commit, /GameDataService|RoomSnapshot|CurrentRound|CurrentThreat/);
});

test('migration UI is restricted to blocked categories and double confirmed', () => {
  assert.match(client, /\['hobbies','character_traits'\]\.includes\(category\)/);
  assert.match(client, /PreviewStableIdMigration/);
  assert.match(client, /ApplyStableIdMigration/);
  assert.match(client, /Only missing id fields will be added/);
  assert.match(client, /globalDraftPending/);
});
