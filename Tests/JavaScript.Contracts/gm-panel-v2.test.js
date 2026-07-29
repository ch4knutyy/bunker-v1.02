const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const client = fs.readFileSync('wwwroot/js/bunker/gm-panel-v2.js', 'utf8');
const legacy = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const gmRuntime = fs.readFileSync('wwwroot/js/bunker/gm/runtime.js', 'utf8');
const view = fs.readFileSync('Views/Shared/Bunker/_GmPanel.cshtml', 'utf8');
const bunkerView = fs.readFileSync('Views/Bunker/Index.cshtml', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const translations = fs.readFileSync('wwwroot/js/bunker/i18n/translations.js', 'utf8');
const catalogPicker = fs.readFileSync('wwwroot/js/bunker/gm/catalog-item-picker.js', 'utf8');
const catalogService = fs.readFileSync('Services/Bunker/Gm/CatalogItemService.cs', 'utf8');
const votingRuntime = fs.readFileSync('wwwroot/js/bunker/voting/runtime.js', 'utf8');
const roundsRuntime = fs.readFileSync('wwwroot/js/bunker/rounds/runtime.js', 'utf8');
const gmRuntimeTools = fs.readFileSync('wwwroot/js/bunker/gm/runtime.js', 'utf8');
const operationalHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');

test('server permissions determine role-safe visible tabs and owner link', () => {
  assert.match(client, /canUseTechnicalTools/);
  assert.match(client, /tab === "diagnostics"/);
  assert.match(client, /tab === "recovery"/);
  assert.match(client, /canViewOmniscientData/);
  assert.match(client, /tab === "overview"/);
  assert.match(client, /canManagePlayers/);
  assert.match(client, /canOpenContentEditor/);
  assert.match(client, /ownerLink\.hidden = !Boolean/);
  assert.match(view, /gmOwnerContentEditorLink[^>]+hidden/);
});

test('unified GM panel is capability-driven and event templates never send implicitly', () => {
  assert.doesNotMatch(`${client}\n${view}\n${css}`, /panelMode|gmPanelSimpleMode|gmPanelAdvancedMode|data-gm-(?:mode|advanced)|preferenceKey\("mode"\)/);
  assert.match(client, /allowedTabs = \["game", "players", "events", "history", "tools", "diagnostics", "recovery", "overview"\]/);
  assert.match(view, /gmToolsCapabilityTemplate[\s\S]*data-gm-capability-content="tools"[\s\S]*gmDiagnosticsCapabilityTemplate|gmDiagnosticsCapabilityTemplate[\s\S]*gmToolsCapabilityTemplate/);
  assert.match(view, /data-gm-event-template="earthquake"[\s\S]*data-gm-event-type="catastrophe"/);
  assert.match(client, /gmEventTemplateEarthquakeText[\s\S]*eventText\.value = text\(translationKey, ""\)/);
  assert.match(view, /id="gmThreatEmergencyToggle"[\s\S]*aria-expanded="false"[\s\S]*aria-controls="gmThreatEmergencyPanel"/);
  assert.doesNotMatch(view, /data-gm-event-template=[^>]+data-gm-click=/);
  assert.ok(["gmTabTools", "gmQuickEvent", "gmThreatNone", "gmBunkerConditions"]
    .every(key => (translations.match(new RegExp(`${key}:`, "g")) || []).length === 3));
});

test('omniscient overview does not inherit normal mutation tabs', () => {
  assert.match(client, /if \(tab === "players"\).*canManagePlayers/);
  assert.match(client, /if \(tab === "events"\)/);
  assert.match(client, /if \(tab === "history"\)/);
  assert.match(client, /if \(canShowTab\("overview"\)\) return "overview"/);
});

test('selected player renders immediately and canonical live updates rerender', () => {
  assert.match(client, /selectPlayerImmediately\(playerId\)/);
  assert.match(client, /loadPlayerDataForGM\(\)/);
  assert.match(client, /renderPlayerCards\(\)/);
  assert.match(client, /window\.gmPanelV2OnStateChanged = scheduleGmPanelV2Refresh/);
  assert.match(client, /applyGmPanelV2State\(state\)/);
  assert.match(client, /renderGmPanelV2\(\)/);
});

test('reconnect restores only safe UI preferences and resyncs canonical state', () => {
  assert.match(legacy, /connection\.onreconnected\(connectionId =>/);
  assert.match(client, /window\.refreshGmPanelV2State = refreshGmPanelV2State/);
  assert.match(client, /gm-panel-v2:\$\{roomCode\(\)\}:\$\{role\(\)\}:\$\{suffix\}/);
  assert.match(client, /preferenceKey\("active-tab"\)/);
  assert.match(client, /writeStorage\("localStorage", preferenceKey\("open"\)/);
  assert.match(client, /readStorage\("localStorage", preferenceKey\("open"\)\) === "1"/);
  assert.match(client, /readStorage\("sessionStorage", preferenceKey\("selected-player"\)\)/);
  assert.match(client, /players\.some\(player =>/);
  assert.doesNotMatch(client, /localStorage\.(setItem|getItem)\([^)]*(token|secret|hidden|omniscientHiddenState)/i);
});

test('dangerous commands retain confirmations and V2 command helper blocks double click', () => {
  const restore = gmRuntime.slice(
    gmRuntime.indexOf('function restoreRoomSnapshot'),
    gmRuntime.indexOf('function undoLastGmAction'));
  assert.match(restore, /confirm\(t\('gmSnapshotConfirm'\)\)/);
  assert.match(restore, /confirm\(t\('gmSnapshotActiveConfirm'\)\)/);
  assert.match(client, /if \(commandPending\) return/);
  assert.match(client, /button\.disabled = true/);
  assert.match(client, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(client, /\balert\s*\(/);
});

test('drawer supports mobile layout keyboard tabs and Escape close', () => {
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /max-width: calc\(100vw - 1rem\)/);
  assert.match(css, /height: calc\(100dvh - 5rem\)/);
  assert.match(client, /event\.key === "Escape"/);
  assert.match(client, /event\.key === "ArrowRight"/);
  assert.match(view, /aria-selected="true"/);
});

test('drawer uses one canonical non-modal open state without legacy panel geometry', () => {
  assert.equal((view.match(/id="gmPanel"/g) || []).length, 1);
  assert.equal((view.match(/id="gmPanelBackdrop"/g) || []).length, 0);
  assert.match(view, /class="gm-panel-v2-drawer"/);
  assert.match(view, /role="complementary"/);
  assert.doesNotMatch(view, /class="gm-panel gm-panel-v2"/);
  assert.match(client, /panel\.classList\.toggle\("is-open", opening\)/);
  assert.match(client, /panel\.style\.removeProperty\("display"\)/);
  assert.doesNotMatch(client, /gmPanelBackdrop|gm-panel-v2-open/);
  assert.match(css, /\.gm-panel-v2-drawer\.is-open\s*\{[^}]*transform: translateX\(0\)/s);
});

test('drawer is top-level and shows loading, retry, and explicit error states', () => {
  assert.match(
    bunkerView,
    /<\/div>\s*<\/div>\s*@\* Панель керування грою[\s\S]*?<partial name="~\/Views\/Shared\/Bunker\/_GmPanel\.cshtml"/);
  assert.match(view, /id="gmPanelV2LoadMessage"[^>]*>Завантаження панелі ведучого…/);
  assert.match(view, /id="gmPanelV2Retry"[\s\S]*?data-gm-panel-action="retry"/);
  assert.match(client, /text\("gmPanelLoadFailed"\)/);
  assert.match(client, /setPanelLoadState\("loading"\)/);
  assert.match(client, /setPanelLoadState\("ready"\)/);
  assert.match(client, /setPanelLoadState\("error",/);
});

test('drawer preserves page scrolling and owns its own vertical scroll', () => {
  assert.doesNotMatch(css, /body\.gm-panel-v2-open\s*\{\s*overflow: hidden/);
  assert.match(css, /\.gm-panel-v2-drawer\s*\{[\s\S]*?top: 5rem;[\s\S]*?right: 0;[\s\S]*?bottom: 0;/);
  assert.match(css, /\.gm-panel-v2-content\s*\{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto/);
  assert.doesNotMatch(css, /gm-panel-v2-backdrop/);
});

test('returned DTO contract waits for room readiness and retry clears failures', () => {
  const refresh = client.slice(
    client.indexOf('async function refreshGmPanelV2State'),
    client.indexOf('window.retryGmPanelV2'));
  assert.match(refresh, /connection\.state !== signalR\.HubConnectionState\.Connected/);
  assert.match(refresh, /if \(!hasJoinedRoom\(\)\)/);
  assert.ok(
    refresh.indexOf('if (!hasJoinedRoom())') <
    refresh.indexOf('connection.invoke("GetGmPanelState")'));
  assert.match(refresh, /const state = await connection\.invoke\("GetGmPanelState"\)/);
  assert.match(refresh, /applyGmPanelV2State\(state\)/);
  assert.match(refresh, /setPanelLoadState\("ready"\)/);
  assert.doesNotMatch(client, /connection\.on\("GmPanelState"/);
  assert.match(client, /window\.retryGmPanelV2[\s\S]*?refreshGmPanelV2State\(\)/);
  assert.match(client, /room_not_found/);
  assert.match(client, /gm_panel_access_denied/);
  assert.match(client, /gm_panel_state_failed/);
  assert.match(client, /String\(content \?\? "—"\)/);
});

test('operational GM tabs and primary action follow the server projection', () => {
  assert.match(client, /allowedTabs = \["game", "players", "events", "history", "tools", "diagnostics", "recovery", "overview"\]/);
  assert.equal((view.match(/data-gm-tab-button="(?:game|players|events|history|tools|diagnostics|recovery)"/g) || []).length, 7);
  assert.equal((client.match(/document\.addEventListener\("click"/g) || []).length, 1);
  assert.match(view, /id="gmVotingV2Section" data-gm-tab="game"/);
  assert.match(view, /id="gmThreatControlSection" data-gm-tab="events"/);
  assert.match(view, /id="gmRecoverySection" data-gm-tab="recovery"/);
  assert.doesNotMatch(view, /\sonclick=/);
  assert.match(client, /primaryAction[\s\S]*button\.dataset\.gmPrimaryAction = action/);
});

test('localized accordion toolbox keeps technical values out of operational UI', () => {
  assert.match(client, /function localizedGmValue[\s\S]*summaryCard\(text\("gmSummaryStateFull"\), localizedGmValue/);
  assert.doesNotMatch(view, />(?:Playing|RoundReveal|Inactive|Hidden|Stopped)</);
  assert.ok(['gmValuePlaying', 'gmValueRoundReveal', 'gmValueInactive', 'gmValueThreatHidden', 'gmValueStopped']
    .every(key => (translations.match(new RegExp(`${key}:`, 'g')) || []).length === 3));
  assert.equal((view.match(/class="gm-accordion-toggle"/g) || []).length, (view.match(/aria-expanded="false"/g) || []).length);
  assert.match(view, /data-gm-requires-capability="CanUseTechnicalTools"/);
  assert.doesNotMatch(client, /connection\.invoke\(\s*(?:selectedAction|action|methodName)/);
  assert.doesNotMatch(client, /\beval\s*\(|new\s+Function\b/);
  assert.doesNotMatch(client, /connection\.(?:on|off)\s*\(/);
});

test('catalog picker uses explicit stable-id contracts without arbitrary setters or subscriptions', () => {
  assert.doesNotMatch(bunkerView, /id="editChar(?:Modal|Value|Name)"/);
  assert.doesNotMatch(catalogPicker, /filePath|propertyPath|ReplaceAnything|\beval\s*\(|new\s+Function\b/);
  assert.doesNotMatch(catalogPicker, /connection\.invoke\(\s*(?:action|operation|methodName)/);
  assert.doesNotMatch(catalogPicker, /connection\.(?:on|off)\s*\(/);
  assert.doesNotMatch(catalogPicker, /\.innerHTML\s*=/);
  assert.match(catalogPicker, /recordId: state\.selected \? get\(state\.selected, "recordId", "RecordId"\)/);
  assert.match(catalogPicker, /commandId: crypto\.randomUUID\(\)/);
  assert.match(catalogPicker, /document\.getElementById\("catalogPickerList"\)\?\.replaceChildren\(\)/);
});

test('catalog operations remain whitelisted, localized and accessible', () => {
  assert.match(view, /id="catalogItemPicker"[\s\S]*aria-labelledby="catalogItemPickerTitle"/);
  assert.match(view, /id="catalogPickerList"[^>]*role="listbox"[^>]*aria-live="polite"/);
  assert.doesNotMatch(
    view.slice(view.indexOf('id="catalogItemPicker"'), view.indexOf('</dialog>', view.indexOf('id="catalogItemPicker"'))),
    /\sonclick=/);
  assert.match(catalogPicker, /basicActions = new Set\(\["replace", "add", "remove", "issue", "markUsed", "restoreUsed"\]\)/);
  assert.doesNotMatch(catalogPicker, /execute|UseSpecialCard/);
  assert.match(catalogService, /source\.Personality\.Sex = OppositeSex\(source\.Personality\.Sex\)!/);
  assert.doesNotMatch(catalogService, /Personality\.(?:Gender|SexOrientation)\s*=/);
  assert.ok([
    'catalogPickerTitle',
    'catalogPickerSearch',
    'catalogOperationExchange',
    'catalogOperationOppositeSex'
  ].every(key => (translations.match(new RegExp(`${key}:`, 'g')) || []).length === 3));
});

test('operational dice remains server generated, idempotent and localized', () => {
  const diceHandler = votingRuntime.slice(
    votingRuntime.indexOf('function rollRoundDice'),
    votingRuntime.indexOf('function markAllPlayersReady'));
  assert.match(diceHandler, /crypto\?\.randomUUID\?\.\(\)/);
  assert.match(diceHandler, /connection\.invoke\("RollRoundDice", commandId\)/);
  assert.doesNotMatch(diceHandler, /Math\.random\(\)\s*\*\s*6|desiredResult|forcedResult/);
  assert.match(operationalHub, /Value = _random\.Next\(1, 7\)/);
  assert.match(operationalHub, /ProcessedGmPlayerCommandIds\.Contains\(commandId\)/);
  assert.match(operationalHub, /"round_dice_roll"/);
  assert.match(roundsRuntime, /t\('gmDiceResult'\)\.replace\('\{value\}', diceRoll\.value\)/);
  assert.ok(['gmDiceResult', 'gmDiceAlreadyRolled', 'gmDiceFeedResult']
    .every(key => (translations.match(new RegExp(`${key}:`, 'g')) || []).length === 3));
});

test('host transfer uses server preview, eligible projection and explicit apply contract', () => {
  const transfer = gmRuntimeTools.slice(
    gmRuntimeTools.indexOf('async function transferHostToSelectedPlayer'),
    gmRuntimeTools.indexOf('function kickSelectedPlayer'));
  assert.match(transfer, /player\?\.canReceiveHost \?\? player\?\.CanReceiveHost/);
  assert.match(transfer, /connection\.invoke\('PreviewHostTransfer', selectedPlayerForGM\)/);
  assert.match(transfer, /connection\.invoke\('TransferHost', selectedPlayerForGM, gmPlayerCommandId\(\), fingerprint\)/);
  assert.match(transfer, /gmHostTransferRestoreWarning/);
  assert.doesNotMatch(transfer, /connection\.invoke\(\s*(?:method|action)/);
  assert.match(view, /id="gmTransferHostButton"[^>]*data-gm-click="transferHostToSelectedPlayer\(\)"/s);
  assert.ok(['gmTransferHost', 'gmHostTransferConfirm', 'gmHostTransferIneligible', 'gmHostTransferRestoreWarning']
    .every(key => (translations.match(new RegExp(`${key}:`, 'g')) || []).length === 3));
});

test('bunker and apocalypse regeneration use explicit command ids and canonical server mutation', () => {
  assert.match(gmRuntimeTools, /connection\.invoke\("RegenerateBunker", gmPlayerCommandId\(\)\)/);
  assert.match(gmRuntimeTools, /connection\.invoke\("RegenerateApocalypse", gmPlayerCommandId\(\)\)/);
  assert.match(operationalHub, /Task RegenerateBunker\(string commandId\)/);
  assert.match(operationalHub, /Task RegenerateApocalypse\(string commandId\)/);
  assert.match(operationalHub, /CloneBunkerInfo\(_gameData\.Bunkers\[_random\.Next/);
  assert.match(operationalHub, /CloneApocalypse\(_gameData\.Apocalypses\[_random\.Next/);
  assert.ok(['gmRegenerateBunkerConfirm', 'gmRegenerateApocalypseConfirm']
    .every(key => (translations.match(new RegExp(`${key}:`, 'g')) || []).length === 3));
});
