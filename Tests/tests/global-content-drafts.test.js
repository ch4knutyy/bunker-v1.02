const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const service = fs.readFileSync('Services/GlobalContentDraftService.cs', 'utf8');
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GlobalContentCatalog.cs', 'utf8');
const view = fs.readFileSync('Views/Home/Game.cshtml', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');

test('draft lifecycle is in-memory and exposes no commit or filesystem writer', () => {
  for (const method of ['GetGlobalContentDrafts','GetGlobalContentDraft','CreateGlobalContentDraft','ApplyGlobalContentDraftCommand','ValidateGlobalContentDraft','PreviewGlobalContentDraftDiff','DiscardGlobalContentDraft']) assert.match(hub, new RegExp(method));
  assert.doesNotMatch(service + hub, /File\.(Write|Move|Copy|Delete)|CommitGlobal|Backup|RollbackGlobal/);
  assert.match(service, /DraftTtl = TimeSpan\.FromHours\(2\)/);
  assert.match(service, /MaximumActiveDrafts = 10/);
  assert.match(service, /MaximumActorDrafts = 3/);
});

test('typed commands use allowlisted fields, immutable IDs and safe validation', () => {
  assert.match(service, /GlobalContentDraftCommandType\.CreateEntry/);
  assert.match(service, /unknown_field/);
  assert.match(service, /immutable_id/);
  assert.match(service, /duplicate_plan_id/);
  assert.match(service, /mental_phobia_forbidden/);
  assert.doesNotMatch(service, /Reflection|SetValue\(/);
});

test('draft UI has guarded actions and no commit controls', () => {
  const section = view.match(/<section id="globalCatalogDrafts"[\s\S]*?<\/section>/)?.[0] || '';
  for (const action of ['globalDraftCreate','globalDraftApply','globalDraftValidate','globalDraftPreview','globalDraftDiscard']) assert.match(section, new RegExp(action));
  assert.doesNotMatch(section, /Commit|Backup|Rollback|Save to file/i);
  assert.match(client, /if \(globalDraftPending\) return/);
  assert.match(client, /confirm\('Delete entry from draft\?'\)/);
  assert.match(client, /confirm\('Discard draft\?'\)/);
});
