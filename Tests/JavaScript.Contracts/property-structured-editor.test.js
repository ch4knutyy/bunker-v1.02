const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const gmClient = fs.readFileSync('wwwroot/js/bunker/gm-panel-v2.js', 'utf8');
const gmView = fs.readFileSync('Views/Shared/Bunker/_GmPanel.cshtml', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');

test('Property title and structured details are separate presentation values', () => {
  assert.match(game, /localizedPresentation:\s*src\.localizedPresentation \?\? src\.LocalizedPresentation/);
  assert.match(game, /function getPropertyPresentation\(source\)/);
  assert.match(
    game,
    /type:'Property'[\s\S]*value:propertyPresentation\.title[\s\S]*details:propertyPresentation\.details/);
  assert.doesNotMatch(
    game.slice(
      game.indexOf("type:'Property'"),
      game.indexOf("type:'Fact'", game.indexOf("type:'Property'"))),
    /generatedValues/);
});

test('Property details use escaped label value rows and long values wrap safely', () => {
  assert.match(
    game,
    /details\.map\(detail => `<div class="char-row vault-card-detail">[\s\S]*escapeHtml\(detail\.label\)[\s\S]*escapeHtml\(detail\.value\)/);
  assert.match(
    css,
    /\.vault-characteristic-card\[data-characteristic-type="Property"\][\s\S]*overflow-wrap: anywhere/);
  assert.match(css, /\.vault-card-detail \.char-value[\s\S]*text-align: right/);
  assert.match(game, /function renderPublicPropertyDetails\(player\)/);
  assert.match(game, /public-property-detail[\s\S]*escapeHtml\(detail\.label\)[\s\S]*escapeHtml\(detail\.value\)/);
});

test('GM Property edit button is permission controlled and omniscient remains read only', () => {
  assert.match(gmView, /id="gmEditPropertyButton"[\s\S]*hidden/);
  assert.match(gmClient, /propertyEditButton\.hidden = !Boolean/);
  assert.match(gmClient, /"canManagePlayers"[\s\S]*"CanManagePlayers"/);
  assert.match(gmClient, /if \(tab === "overview"\).*canViewOmniscientData/);
  assert.match(gmClient, /if \(tab === "players"\).*canManagePlayers/);
});

test('Property modal rebuilds canonical fields after definition change', () => {
  assert.match(gmView, /id="gmPropertyDefinitionSelect"[\s\S]*onchange="regenerateGmPropertyPreview\(\)"/);
  assert.match(gmClient, /function renderPropertyEditorFields\(generatedValues\)/);
  assert.match(gmClient, /connection\.invoke\(\s*"PreviewPlayerProperty"/);
  assert.match(gmClient, /input\.dataset\.propertyKey = key/);
  assert.match(gmClient, /input\.type = "number"/);
  assert.match(gmClient, /input = document\.createElement\("select"\)/);
  assert.doesNotMatch(gmClient, /Math\.random/);
});

test('Property save sends only definition values and command id', () => {
  const save = gmClient.slice(
    gmClient.indexOf('window.saveGmPropertyEdit'),
    gmClient.indexOf('window.gmPanelV2OnStateChanged'));
  assert.match(save, /collectPropertyEditorValues\(\)/);
  assert.match(save, /"UpdatePlayerProperty"/);
  assert.match(save, /selectedStablePlayerId/);
  assert.match(save, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(save, /resourceTags|protectionTags|localizedPresentation|title|details/);
});

test('Old Property payload without structured details falls back safely', () => {
  const presentation = game.slice(
    game.indexOf('function getPropertyPresentation'),
    game.indexOf('function getPropertyDisplay'));
  assert.match(presentation, /if \(!presentation\)/);
  assert.match(presentation, /title: getPropertyDisplay\(property\), details: \[\]/);
  assert.match(gmClient, /title\.textContent/);
  assert.match(gmClient, /content\.textContent/);
  assert.doesNotMatch(gmView, /textarea[^>]+gmProperty/i);
});
