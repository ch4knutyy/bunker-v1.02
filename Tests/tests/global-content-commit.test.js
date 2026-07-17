const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const writer = fs.readFileSync('Services/GlobalContentCommitService.cs', 'utf8');
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GlobalContentCatalog.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const { readBunkerView } = require('./bunker-view-test-helpers');
const view = readBunkerView();

test('one canonical writer owns backup temp replace and rollback', () => {
  assert.match(writer, /CategoryLocks/);
  assert.match(writer, /File\.Replace\(temp, canonical/);
  assert.match(writer, /Flush\(flushToDisk: true\)/);
  assert.match(writer, /ValidateCanonicalBytes\(category, File\.ReadAllBytes\(temp\)\)/);
  assert.match(writer, /RestoreBackupAtomic/);
  assert.doesNotMatch(hub, /File\.|Path\./);
});

test('commit and rollback are capability guarded and reuse mutation limit', () => {
  for (const method of ['CommitGlobalContentDraft','GetGlobalContentBackups','PreviewGlobalContentRollback','RollbackGlobalContent']) assert.match(hub, new RegExp(method));
  assert.match(hub, /DemandGlobalContentAccess/);
  assert.match(hub, /ConsumeGlobalContentMutation/);
  assert.doesNotMatch(writer, /GameDataService|RoomSnapshot|CurrentThreat|CurrentRound/);
});

test('UI exposes confirmed commit and double-confirm rollback without hot reload', () => {
  const section = view.match(/<section id="globalCatalogDrafts"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(section, /globalDraftCommit/);
  assert.match(section, /globalBackupSelect/);
  assert.match(section, /globalRollbackExecute/);
  assert.match(client, /PreviewGlobalContentDraftDiff/);
  assert.match(client, /CommitGlobalContentDraft/);
  assert.equal((client.match(/confirm\(/g) || []).length >= 4, true);
  assert.doesNotMatch(client + writer, /HotReload|ReloadGameData|GameDataService/);
});
