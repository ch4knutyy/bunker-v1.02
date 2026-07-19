const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const gameActions = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameActions.cs', 'utf8');
const gameMaster = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');
const specialCards = fs.readFileSync('Hubs/BunkerHubGame/GameHub.SpecialCards.cs', 'utf8');
const threats = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Threats.cs', 'utf8');
const gmPanel = fs.readFileSync('Views/Shared/Bunker/_GmPanel.cshtml', 'utf8');
const specialCardData = JSON.parse(fs.readFileSync('wwwroot/data/special_cards.json', 'utf8'));

test('property is an initially hidden canonical card rendered after inventory without technical metadata', () => {
  assert.match(game, /property:\s*!!\(src\.property \?\? src\.Property\)/);
  assert.match(
    game,
    /type:'Inventory'[\s\S]*type:'Property'[\s\S]*type:'Fact'/);
  assert.match(game, /type:'Property'[\s\S]*value:getPropertyDisplay\(property\)/);
  const renderer = game.slice(
    game.indexOf('function renderMyPlayerCards'),
    game.indexOf('function renderEliminatedRevealAllPanel'));
  const propertyCard = renderer.slice(
    renderer.indexOf("{ type:'Property'"),
    renderer.indexOf("{ type:'Fact'"));
  assert.doesNotMatch(propertyCard, /DefinitionId|GeneratedValues|ResourceTags|ProtectionTags/);
});

test('property reveal, hide, regeneration and omniscient controls use the existing characteristic pipeline', () => {
  assert.match(gameActions, /"Property"\s*=>\s*player\.Revealed\.Property/);
  assert.match(gameActions, /case "Property": player\.Revealed\.Property = true/);
  assert.match(gameActions, /player\.Revealed\.Property && player\.Property != null/);
  assert.match(gameMaster, /"Property"\s*=>\s*player\.Revealed\.Property/);
  assert.match(gameMaster, /case "Property":[\s\S]*target\.Property = source\.Property/);
  assert.match(gmPanel, /id="gmProperty"/);
  assert.match(gmPanel, /peekCharacteristic\('Property'\)/);
  assert.match(gmPanel, /regenerateCharacteristic\('Property'\)/);
  assert.match(gmPanel, /forceReveal\('Property'\)/);
  assert.match(gmPanel, /<option value="Property">Майно<\/option>/);
});

test('three property special cards are registered with target validation, idempotency and audit', () => {
  const cards = specialCardData.special_cards.filter(card =>
    ['property_swap', 'property_reroll', 'property_reveal'].includes(card.id));
  assert.equal(cards.length, 3);
  assert.equal(cards.find(card => card.id === 'property_swap').requiresTarget, true);
  assert.equal(cards.find(card => card.id === 'property_reroll').requiresTarget, false);
  assert.equal(cards.find(card => card.id === 'property_reveal').requiresTarget, true);
  for (const card of cards) {
    assert.equal(card.effectType, card.id);
    assert.deepEqual(Object.keys(card._i18n.name).sort(), ['en', 'ru', 'uk']);
    assert.deepEqual(Object.keys(card._i18n.description).sort(), ['en', 'ru', 'uk']);
  }

  assert.match(specialCards, /case "property_swap":[\s\S]*SwapProperties/);
  assert.match(specialCards, /case "property_reroll":[\s\S]*RerollProperty/);
  assert.match(specialCards, /case "property_reveal":[\s\S]*property_target_not_available/);
  assert.match(specialCards, /GetSwappableCharacteristicKeys\(\)[\s\S]*"Property"/);
  assert.match(specialCards, /ProcessedSpecialCardCommandIds/);
  assert.match(specialCards, /special_card_\{card\.EffectType\}/);
  assert.match(game, /const commandId = globalThis\.crypto\?\.randomUUID[\s\S]*UseSpecialCardById"[\s\S]*commandId\)/);
});

test('threat contribution resolves property by server definition id, captures tags and never consumes property', () => {
  assert.match(threats, /itemSource == "property"/);
  assert.match(threats, /string\.Equals\(property\.DefinitionId, itemToken/);
  assert.match(threats, /property\.ResourceTags[\s\S]*Concat\(property\.ProtectionTags\)/);
  assert.match(threats, /SourceType = "property"/);
  assert.match(threats, /SetCharacteristicRevealed\(player, "Property"\)/);
  assert.match(threats, /c\.SourceType == "personal_inventory"[\s\S]*UsefulContributionIds/);
  assert.doesNotMatch(
    threats.slice(threats.indexOf('private bool ConsumeAcceptedThreatItems'), threats.indexOf('private bool GrantThreatVoteImmunityIfNeeded')),
    /SourceType == "property"/);
});

test('old payloads without property normalize to an unavailable non-revealable value', () => {
  assert.match(game, /property:\s*normalizePropertyData\(player\.property \|\| player\.Property\)/);
  assert.match(game, /function normalizePropertyData\(source\)\s*\{\s*const src = source \|\| \{\}/);
  assert.match(game, /canReveal:!!property\.definitionId/);
  assert.match(game, /propertyUnavailable/);
});
