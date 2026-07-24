const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const client = fs.readFileSync('wwwroot/js/bunker/gm-panel-v2.js', 'utf8');
const legacy = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = fs.readFileSync('Views/Shared/Bunker/_GmPanel.cshtml', 'utf8');
const bunkerView = fs.readFileSync('Views/Bunker/Index.cshtml', 'utf8');
const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');

test('server permissions determine role-safe visible tabs and owner link', () => {
  assert.match(client, /canUseTechnicalTools/);
  assert.match(client, /tab === "technical"/);
  assert.match(client, /canViewOmniscientData/);
  assert.match(client, /tab === "overview"/);
  assert.match(client, /canManagePlayers/);
  assert.match(client, /canOpenContentEditor/);
  assert.match(client, /ownerLink\.hidden = !Boolean/);
  assert.match(view, /gmOwnerContentEditorLink[^>]+hidden/);
});

test('normal host panel defaults to local simple mode without changing server permissions', () => {
  assert.match(client, /let panelMode = "simple"/);
  assert.match(client, /window\.setGmPanelMode/);
  assert.match(client, /preferenceKey\("mode"\)/);
  assert.match(client, /panel\.dataset\.gmMode = panelMode/);
  assert.match(view, /id="gmPanelSimpleMode"[^>]+aria-pressed="true"/);
  assert.match(view, /id="gmPanelAdvancedMode"/);
  assert.match(view, /Наступна рекомендована дія/);
  assert.match(css, /data-gm-mode="simple"[^\n]+data-gm-advanced/);
  assert.match(view, /id="gmOmniscientMode"[^>]+data-gm-advanced/);
});

test('omniscient overview does not inherit normal mutation tabs', () => {
  assert.match(client, /if \(tab === "players"\).*canManagePlayers/);
  assert.match(client, /if \(tab === "voting"\).*canManageVoting/);
  assert.match(client, /if \(tab === "bunker"\).*canManageBunker/);
  assert.match(client, /if \(canShowTab\("overview"\)\) return "overview"/);
});

test('selected player renders immediately and canonical live updates rerender', () => {
  assert.match(client, /selectPlayerImmediately\(playerId\)/);
  assert.match(client, /loadPlayerDataForGM\(\)/);
  assert.match(client, /renderPlayerCards\(\)/);
  assert.match(client, /liveEvents\.forEach\(eventName => connection\.on/);
  assert.match(client, /applyGmPanelV2State\(state\)/);
  assert.match(client, /renderGmPanelV2\(\)/);
});

test('reconnect restores only safe UI preferences and resyncs canonical state', () => {
  assert.match(client, /connection\.onreconnected\?\.\(\(\) => refreshGmPanelV2State\(\)\)/);
  assert.match(client, /"RoomJoined"/);
  assert.match(client, /"RejoinSuccess"/);
  assert.match(client, /gm-panel-v2:\$\{roomCode\(\)\}:\$\{role\(\)\}:\$\{suffix\}/);
  assert.match(client, /preferenceKey\("active-tab"\)/);
  assert.match(client, /localStorage\.setItem\(preferenceKey\("open"\)/);
  assert.match(client, /localStorage\.getItem\(preferenceKey\("open"\)\) === "1"/);
  assert.match(client, /sessionStorage\.getItem\(preferenceKey\("selected-player"\)\)/);
  assert.match(client, /players\.some\(player =>/);
  assert.doesNotMatch(client, /localStorage\.(setItem|getItem)\([^)]*(token|secret|hidden|omniscientHiddenState)/i);
});

test('dangerous commands retain confirmations and V2 command helper blocks double click', () => {
  const restore = legacy.slice(
    legacy.indexOf('function restoreRoomSnapshot'),
    legacy.indexOf('function undoLastGmAction'));
  assert.match(restore, /confirm\(t\('gmSnapshotConfirm'\)\)/);
  assert.match(restore, /confirm\(t\('gmSnapshotActiveConfirm'\)\)/);
  assert.match(client, /if \(commandPending\) return/);
  assert.match(client, /button\.disabled = true/);
  assert.match(client, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(client, /\balert\s*\(/);
});

test('drawer supports mobile layout keyboard tabs and Escape close', () => {
  assert.match(css, /@media \(max-width: 768px\)/);
  assert.match(css, /width: 100vw/);
  assert.match(css, /height: 100dvh/);
  assert.match(client, /event\.key === "Escape"/);
  assert.match(client, /event\.key === "ArrowRight"/);
  assert.match(view, /aria-selected="true"/);
});

test('drawer and backdrop use one canonical open state without legacy panel geometry', () => {
  assert.equal((view.match(/id="gmPanel"/g) || []).length, 1);
  assert.equal((view.match(/id="gmPanelBackdrop"/g) || []).length, 1);
  assert.match(view, /class="gm-panel-v2-backdrop"/);
  assert.match(view, /class="gm-panel-v2-drawer"/);
  assert.doesNotMatch(view, /class="gm-panel gm-panel-v2"/);
  assert.match(client, /panel\.classList\.toggle\("is-open", opening\)/);
  assert.match(client, /backdrop\.classList\.toggle\("is-open", opening\)/);
  assert.match(client, /panel\.style\.removeProperty\("display"\)/);
  assert.match(client, /document\.body\.classList\.toggle\("gm-panel-v2-open", opening\)/);
  assert.match(css, /\.gm-panel-v2-drawer\.is-open\s*\{[^}]*transform: translateX\(0\)/s);
  assert.match(css, /\.gm-panel-v2-backdrop\.is-open\s*\{/);
});

test('drawer is top-level and shows loading, retry, and explicit error states', () => {
  assert.match(
    bunkerView,
    /<\/div>\s*<\/div>\s*@\* Панель керування грою[\s\S]*?<partial name="~\/Views\/Shared\/Bunker\/_GmPanel\.cshtml"/);
  assert.match(view, /id="gmPanelV2LoadMessage"[^>]*>Завантаження панелі ведучого…/);
  assert.match(view, /id="gmPanelV2Retry"[\s\S]*?onclick="retryGmPanelV2\(\)"/);
  assert.match(client, /Не вдалося завантажити стан GM-панелі\./);
  assert.match(client, /setPanelLoadState\("loading"\)/);
  assert.match(client, /setPanelLoadState\("ready"\)/);
  assert.match(client, /setPanelLoadState\("error",/);
});

test('backdrop is independent and drawer owns full viewport geometry', () => {
  const backdropCss = css.slice(
    css.indexOf('.gm-panel-v2-backdrop {'),
    css.indexOf('.gm-panel-v2-backdrop.is-open'));
  assert.match(backdropCss, /background: rgba\(0, 0, 0, 0\.58\)/);
  assert.doesNotMatch(backdropCss, /\bopacity\s*:/);
  assert.match(css, /\.gm-panel-v2-drawer\s*\{[\s\S]*?top: 0;[\s\S]*?right: 0;[\s\S]*?bottom: 0;/);
  assert.match(css, /min-height: 100vh/);
  assert.match(css, /\.gm-panel-v2-content\s*\{[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto/);
  assert.doesNotMatch(css, /body\.gm-panel-v2-open::before/);
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
