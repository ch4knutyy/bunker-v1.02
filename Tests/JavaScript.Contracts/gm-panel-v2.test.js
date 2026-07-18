const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const client = fs.readFileSync('wwwroot/js/bunker/gm-panel-v2.js', 'utf8');
const legacy = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = fs.readFileSync('Views/Shared/Bunker/_GmPanel.cshtml', 'utf8');
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
  assert.match(client, /connection\.onreconnected\?\.\(refreshGmPanelV2State\)/);
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
