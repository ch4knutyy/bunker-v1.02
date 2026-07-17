const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GlobalContentCatalog.cs', 'utf8');
const service = fs.readFileSync('Services/Bunker/Content/Global/GlobalContentCatalogService.cs', 'utf8');
const model = fs.readFileSync('Models/Game/Content/GlobalContentCatalog.cs', 'utf8');
const { readBunkerView } = require('./bunker-view-test-helpers');
const view = readBunkerView();
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');

test('catalog is read-only, allowlisted and capability guarded', () => {
  assert.match(hub, /GmCapability\.ManageGlobalContent/);
  assert.match(hub, /_globalContentAccess\.CanAccess/);
  assert.doesNotMatch(service, /File\.(Write|Move|Delete|Copy)/);
  assert.match(service, /ReadOnlyDictionary<GlobalContentCategory/);
  assert.doesNotMatch(hub, /filesystem|filePath|relativeFile/i);
});

test('safe metadata and bounded read API expose no filesystem path', () => {
  const dto = model.match(/record GlobalContentMetadataDto[\s\S]*?\);/)?.[0] || '';
  assert.doesNotMatch(dto, /Path|FileName|Exception|Stack/);
  assert.match(service, /MaximumSearchLength = 100/);
  assert.match(service, /MaximumPageSize = 100/);
  assert.match(service, /MaximumFileBytes/);
  assert.match(service, /TryConsumeRead/);
});

test('read-only UI stays hidden until server capability response', () => {
  const catalog = view.match(/<section id="globalContentCatalog"[\s\S]*?<\/section>/)?.[0] || '';
  assert.match(view, /id="globalContentCatalog"[^>]*display: none/);
  assert.match(client, /globalCatalogAllowed = access\?\.allowed === true/);
  assert.match(client, /panel\.style\.display = globalCatalogAllowed \? 'block' : 'none'/);
  assert.doesNotMatch(catalog, /Save to file|Hot reload/i);
  for (const key of ['globalCatalogTitle', 'globalCatalogReadOnly', 'globalCatalogCategory', 'globalCatalogSearch']) {
    assert.equal((client.match(new RegExp(`${key}:`, 'g')) || []).length, 3, `missing localization ${key}`);
  }
});
