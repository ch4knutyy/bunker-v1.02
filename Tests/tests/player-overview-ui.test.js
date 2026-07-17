const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const view = fs.readFileSync(path.join(root, 'Views', 'Shared', 'Bunker', '_GameBoard.cshtml'), 'utf8');
const game = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'wwwroot', 'css', 'game.css'), 'utf8');

function method(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}' && --depth === 0) return source.slice(start, index + 1);
  }
  throw new Error(`unclosed ${name}`);
}

test('old public table markup and renderer are removed without a hidden duplicate', () => {
  assert.doesNotMatch(view, /id="playersTable"|id="playersTableBody"|class="players-table"/);
  assert.doesNotMatch(game, /function updatePlayersTable|function renderTableCell|playersTableBody/);
  assert.match(view, /id="publicPlayerOverview"[\s\S]*id="allPlayersComparison"[\s\S]*id="playerDossierGrid"[\s\S]*id="publicPlayerSelector"[\s\S]*id="selectedPlayerPanel"/);
});

test('comparison is the default mode and renders every gameplay player as a compact dossier', () => {
  assert.match(game, /let publicPlayerViewMode = 'all'/);
  assert.match(method(game, 'renderAllPlayersComparison'), /sortPublicPlayerModels\(models\)[\s\S]*renderPlayerDossierCard/);
  assert.match(method(game, 'renderPlayerDossierCard'), /data-canonical-seat="\$\{seat\}"[\s\S]*publicCharacteristicDefinitions\.map/);
  assert.match(method(game, 'renderComparisonCharacteristic'), /comparison-characteristic/);
  assert.doesNotMatch(method(game, 'renderPlayerDossierCard'), /revealCharacteristic|vault-card-reveal|data-player-id|connectionId|stablePlayerId/);
});

test('display sorting uses a copied model list and never mutates canonical seat order', () => {
  const sorting = method(game, 'sortPublicPlayerModels');
  assert.match(sorting, /const sorted = \[\.\.\.models\]/);
  assert.match(sorting, /sortMode === 'name'/);
  assert.match(sorting, /sortMode === 'revealed-desc'/);
  assert.match(sorting, /sortMode === 'revealed-asc'/);
  assert.doesNotMatch(sorting, /roomPlayers|SeatNumber\s*=|seatNumber\s*=/);
  assert.doesNotMatch(method(game, 'renderAllPlayersComparison'), /connection\.invoke/);
});

test('comparison sealed rows never read hidden values while revealed rows use only public helpers', () => {
  const characteristic = method(game, 'renderComparisonCharacteristic');
  const hidden = characteristic.slice(characteristic.indexOf('if (!revealed)'), characteristic.indexOf('const value'));
  assert.match(hidden, /notRevealed/);
  assert.match(hidden, /renderCharacteristicIcon\('lock'\)/);
  assert.doesNotMatch(hidden, /getLocalizedRevealedValue|getLocalizedRevealedTooltip|revealedData|revealedSources|data-value|aria-label/);
  assert.match(characteristic, /getLocalizedRevealedValue\(player, key\)/);
  assert.match(characteristic, /renderAdditionalPhysicalConditionsForOverview\(player\)/);
});

test('overview uses canonical seats and retains or safely repairs selection', () => {
  const canonical = method(game, 'getCanonicalPublicPlayerModels');
  const resolver = method(game, 'resolveSelectedPublicPlayer');
  const navigation = method(game, 'navigatePublicPlayerOverview');
  assert.match(canonical, /sort[\s\S]*seatNumber/);
  assert.match(canonical, /isPublicGameplayPlayer/);
  assert.match(resolver, /selectedPublicPlayerSeat/);
  assert.match(resolver, /isMyPlayerRef/);
  assert.match(resolver, /getPublicActivePlayerSeat/);
  assert.match(resolver, /Math\.abs\(model\.seat - selectedPublicPlayerSeat\)/);
  assert.match(navigation, /% models\.length/);
  assert.doesNotMatch(navigation, /querySelectorAll|children|previousElementSibling|nextElementSibling/);
});

test('one delegated interaction boundary handles selector and previous next controls', () => {
  const events = method(game, 'ensurePublicPlayerOverviewEvents');
  assert.match(events, /overviewEventsBound/);
  assert.equal((events.match(/addEventListener\('click'/g) || []).length, 1);
  assert.match(events, /closest\('\[data-player-seat\]'/);
  assert.match(events, /closest\('\[data-overview-nav\]'/);
  assert.match(events, /ArrowLeft[\s\S]*ArrowRight/);
  assert.doesNotMatch(method(game, 'renderPublicPlayerSelectorItem'), /onclick=/);
});

test('sealed cards never read or serialize hidden public values', () => {
  const card = method(game, 'renderPublicCharacteristicCard');
  const hiddenBranch = card.slice(card.indexOf('if (!revealed)'), card.indexOf('const value'));
  assert.match(hiddenBranch, /notRevealed/);
  assert.match(hiddenBranch, /renderCharacteristicIcon\('lock'\)/);
  assert.doesNotMatch(hiddenBranch, /revealedData|revealedSources|getLocalizedRevealedValue|getLocalizedRevealedTooltip|data-value|aria-label/);
  assert.match(card, /getLocalizedRevealedValue\(player, key\)/);
  assert.match(card, /renderAdditionalPhysicalConditionsForOverview\(player\)/);
  assert.doesNotMatch(method(game, 'renderAdditionalPhysicalConditionsForOverview'), /myPlayerData/);
});

test('rendered overview exposes only public seat references and no internal player ids', () => {
  const selector = method(game, 'renderPublicPlayerSelectorItem');
  const panel = method(game, 'renderPublicPlayerOverview');
  const gameplayBoundary = method(game, 'isPublicGameplayPlayer');
  assert.match(selector, /data-player-seat="\$\{seat\}"/);
  assert.doesNotMatch(selector, /data-player-id|data-connection|stablePlayerId|connectionId/);
  assert.doesNotMatch(panel, /data-player-id|data-connection/);
  assert.doesNotMatch(panel, /gmPlayersData|omniscientHiddenState|myPlayerData/);
  assert.match(gameplayBoundary, /spectator[\s\S]*technicalgm[\s\S]*omniscientgm/);
  assert.match(panel, /innerHTML = models\.map/);
  assert.match(panel, /publicCharacteristicDefinitions\.map/);
});

test('automatic special card neighbors are presentation-only canonical seat labels', () => {
  const label = method(game, 'getAutomaticSpecialCardOrderLabel');
  const model = method(game, 'buildSpecialCardModel');
  assert.match(label, /getCanonicalPublicPlayerModels\(\{ activeOnly: true \}\)/);
  assert.match(label, /ownerIndex \+ direction \+ models\.length/);
  assert.match(label, /specialPreviousOrder/);
  assert.match(label, /specialNextOrder/);
  assert.doesNotMatch(label, /querySelector|children|player-selector/);
  assert.match(model, /automaticOrderLabel/);
  assert.match(model, /targetType: normalized\.requiresTarget \? 'player' : automaticOrderLabel \? 'seat-order'/);
  assert.doesNotMatch(method(game, 'useSpecialCardFromCard'), /automaticOrderLabel|getAutomaticSpecialCardOrderLabel/);
});

test('UA RU and EN overview and comparison labels are registered in the current localization system', () => {
  for (const key of ['playerOverviewTitle', 'playerLabel', 'notRevealed', 'revealedProgress', 'previousPlayer', 'nextPlayer', 'noAvailablePlayers', 'specialNextOrder', 'specialPreviousOrder', 'allPlayersView', 'singlePlayerView', 'comparisonSort', 'sortBySeat', 'sortByName', 'sortMostRevealed', 'sortLeastRevealed']) {
    assert.equal((game.match(new RegExp(`${key}:`, 'g')) || []).length, 3, `${key} must exist in three locales`);
  }
  assert.match(game, /t\('revealedProgress'\)\.replace\('\{shown\}'/);
});

test('desktop tablet and mobile layouts remain presentation cards without page overflow', () => {
  assert.match(css, /\.player-dossier-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 960px\)[\s\S]*\.player-dossier-grid\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.player-dossier-characteristics\s*\{\s*grid-template-columns:\s*1fr/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*\.comparison-tooltip \.tooltip-trigger\s*\{[^}]*width:\s*44px/);
  assert.match(css, /\.player-overview-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(230px, 270px\) minmax\(0, 1fr\)/);
  assert.match(css, /\.public-characteristics-grid\s*\{[\s\S]*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 1180px\)[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*grid-auto-flow:\s*column[\s\S]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 620px\)[\s\S]*grid-template-columns:\s*1fr/);
  assert.match(css, /\.player-selector-item\s*\{[\s\S]*min-height:\s*72px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('live rerenders use one overview source and preserve existing immersive renderers', () => {
  assert.match(method(game, 'renderCurrentGameUI'), /renderPublicPlayerOverview/);
  assert.match(game, /CharacteristicRevealed[\s\S]*renderPublicPlayerOverview\(\)/);
  assert.match(game, /CharacteristicHidden[\s\S]*renderCurrentGameUI\(\)/);
  assert.match(game, /RoomPlayersUpdated[\s\S]*renderCurrentGameUI\(\)/);
  assert.match(game, /PlayerReconnected[\s\S]*renderCurrentGameUI\(\)/);
  assert.match(game, /if \(roomPlayerCountElement\)/);
  assert.doesNotMatch(method(game, 'renderMyPlayerCards'), /player-overview|public-characteristic/);
  assert.doesNotMatch(method(game, 'renderSpecialCard'), /player-overview-shell|public-characteristics-grid/);
  assert.doesNotMatch(method(game, 'renderApocalypseScenario'), /player-overview/);
  assert.doesNotMatch(method(game, 'renderBunkerFacility'), /player-overview/);
  assert.doesNotMatch(method(game, 'renderThreatScenario'), /player-overview/);
});
