const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const client = fs.readFileSync('wwwroot/js/owner-content-editor.js', 'utf8');
const controller = fs.readFileSync('Controllers/OwnerContentController.cs', 'utf8');
const view = fs.readFileSync('Views/OwnerContent/Index.cshtml', 'utf8');

test('raw content is posted in JSON bodies and never placed in request URLs', () => {
  assert.match(client, /body:\s*JSON\.stringify\(body\)/);
  assert.match(client, /proposedContent:\s*elements\.editor\.value/);
  assert.doesNotMatch(client, /encodeURIComponent\(elements\.editor\.value\)/);
  assert.doesNotMatch(client, /[?&](content|proposedContent)=/);
  assert.match(controller, /\[FromBody\]\s*ContentSaveRequest/);
});

test('save requires current preview confirmation expected hash and preserves edits on conflict', () => {
  const saveFunction = client.slice(
    client.indexOf('async function saveDocument'),
    client.indexOf('async function loadBackups'));
  const conflictBranch = saveFunction.slice(saveFunction.indexOf('catch (error)'));
  assert.match(client, /state\.previewedContent !== elements\.editor\.value/);
  assert.match(client, /window\.confirm\("Зберегти підтверджені зміни/);
  assert.match(client, /expectedHash:\s*state\.currentHash/);
  assert.match(client, /confirmation:\s*true/);
  assert.match(conflictBranch, /Локальні зміни збережені в редакторі/);
  assert.doesNotMatch(conflictBranch, /state\.originalContent\s*=/);
  assert.doesNotMatch(conflictBranch, /elements\.editor\.value\s*=/);
});

test('dirty navigation Ctrl+S and restore are guarded without autosave', () => {
  assert.match(client, /beforeunload/);
  assert.match(client, /if \(!state\.dirty\) return/);
  assert.match(client, /event\.key\.toLowerCase\(\) === "s"/);
  assert.match(client, /event\.preventDefault\(\);\s*previewChanges\(\)/);
  assert.match(client, /window\.confirm\(`Відновити backup/);
  assert.doesNotMatch(client, /setInterval|autosave|autoSave/);
});

test('successful save updates hash and dirty state while UI exposes no absolute path field', () => {
  assert.match(client, /state\.currentHash = result\.currentHash/);
  assert.match(client, /setDirty\(false\)/);
  assert.match(view, /ownerContentRelativePath/);
  assert.doesNotMatch(view, /absolutePath|canonicalPath|serverPath/i);
  assert.doesNotMatch(client, /absolutePath|canonicalPath|serverPath/i);
});

test('Razor endpoints match owner content attribute routes and JavaScript appends only file keys', () => {
  assert.match(controller, /\[Route\("owner\/content"\)\]/);
  assert.match(controller, /\[HttpGet\("document\/\{fileKey\}"\)\]/);
  assert.match(controller, /\[HttpGet\("backups\/\{fileKey\}"\)\]/);
  assert.match(view, /data-files-url="@Url\.Content\("~\/owner\/content\/files"\)"/);
  assert.match(view, /data-document-url="@Url\.Content\("~\/owner\/content\/document"\)"/);
  assert.match(view, /data-validate-url="@Url\.Content\("~\/owner\/content\/validate"\)"/);
  assert.match(view, /data-preview-url="@Url\.Content\("~\/owner\/content\/preview"\)"/);
  assert.match(view, /data-save-url="@Url\.Content\("~\/owner\/content\/save"\)"/);
  assert.match(view, /data-backups-url="@Url\.Content\("~\/owner\/content\/backups"\)"/);
  assert.match(view, /data-restore-url="@Url\.Content\("~\/owner\/content\/restore"\)"/);
  assert.doesNotMatch(view, /OwnerContent\/(Files|Document|Validate|Preview|Save|Backups|Restore)/);
  assert.match(client, /\$\{endpoint\("documentUrl"\)\}\/\$\{encodeURIComponent\(file\.key\)\}/);
  assert.match(client, /\$\{endpoint\("backupsUrl"\)\}\/\$\{encodeURIComponent\(state\.selected\.key\)\}/);
  assert.doesNotMatch(client, /["'`]\/owner\/content\//);
});

test('non-JSON HTTP failures expose status codes without parsing HTML', () => {
  const requestFunction = client.slice(
    client.indexOf('async function request'),
    client.indexOf('function post'));
  assert.match(requestFunction, /response\.headers\.get\("content-type"\)/);
  assert.match(requestFunction, /contentType\.includes\("application\/json"\)/);
  assert.match(requestFunction, /\{ code: `http_\$\{response\.status\}` \}/);
  assert.match(requestFunction, /error\.status = response\.status/);
  assert.doesNotMatch(requestFunction, /invalid_response/);
});
