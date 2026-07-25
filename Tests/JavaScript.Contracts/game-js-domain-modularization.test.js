const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const gamePath = path.join(root, 'wwwroot', 'js', 'game.js');
const indexPath = path.join(root, 'Views', 'Bunker', 'Index.cshtml');
const manifestPath = path.join(root, 'GAME_JS_FUNCTION_MANIFEST.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const gameSource = fs.readFileSync(gamePath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
const domains = [...new Set(manifest.map(item => item.domain))].sort();

function declarationPattern(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^(?:async\\s+)?function\\s+${escaped}\\s*\\(|^(?:const|let|var)\\s+${escaped}\\s*=`, 'gm');
}

test('game.js domain modularization preserves the classic-script contract', () => {
  assert.equal(manifest.length, 482);
  assert.equal((gameSource.match(/^(?:async\s+)?function\s+[A-Za-z_$][\w$]*\s*\(/gm) || []).length, 0);
  assert.equal(domains.length, 19);

  const ownershipErrors = [];
  for (const item of manifest) {
    const targetPath = path.join(root, 'wwwroot', 'js', 'bunker', item.domain);
    const targetSource = fs.readFileSync(targetPath, 'utf8');
    const targetCount = (targetSource.match(declarationPattern(item.name)) || []).length;
    const gameCount = (gameSource.match(declarationPattern(item.name)) || []).length;
    if (targetCount !== 1 || gameCount !== 0) ownershipErrors.push(`${item.name}:${targetCount}/${gameCount}`);
  }
  assert.deepEqual(ownershipErrors, []);

  const moduleSyntaxLeaks = domains.flatMap(domain => {
    const source = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', domain), 'utf8');
    return /^(?:\s*import\s|\s*export\s)/m.test(source) ? [domain] : [];
  });
  assert.deepEqual(moduleSyntaxLeaks, []);

  const runtimeTags = domains.map(domain => `<script src="~/js/bunker/${domain}" asp-append-version="true"></script>`);
  const coreSignalRIndex = indexSource.indexOf('<script src="~/js/bunker/core/signalr-events.js"');
  const gameIndex = indexSource.indexOf('<script src="~/js/game.js"');
  assert.equal(runtimeTags.every(tag => indexSource.indexOf(tag) >= 0 && indexSource.indexOf(tag) < coreSignalRIndex && coreSignalRIndex < gameIndex), true);

  const baseTranslationsIndex = indexSource.indexOf('<script src="~/js/bunker/i18n/translations.js"');
  const gameTranslationsIndex = indexSource.indexOf('<script src="~/js/bunker/i18n/game-translations.js"');
  assert.equal(baseTranslationsIndex >= 0 && baseTranslationsIndex < gameTranslationsIndex && gameTranslationsIndex < gameIndex, true);

  const syntaxFiles = [gamePath, path.join(root, 'wwwroot', 'js', 'bunker', 'i18n', 'game-translations.js'), ...domains.map(domain => path.join(root, 'wwwroot', 'js', 'bunker', domain))];
  const syntaxErrors = syntaxFiles.flatMap(file => {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    return result.status === 0 ? [] : [`${path.relative(root, file)}:${result.stderr}`];
  });
  assert.deepEqual(syntaxErrors, []);
});
