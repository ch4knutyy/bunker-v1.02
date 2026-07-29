const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = path => fs.readFileSync(path, 'utf8');
const page = read('Views/Bunker/Index.cshtml');
const board = read('Views/Shared/Bunker/_GameBoard.cshtml');
const story = read('wwwroot/js/bunker/core/story-flow.js');
const timer = read('wwwroot/js/bunker/timer/runtime.js');
const ui = read('wwwroot/js/bunker/ui/runtime.js');
const gmView = read('Views/Shared/Bunker/_GmPanel.cshtml');
const gmClient = read('wwwroot/js/bunker/gm-panel-v2.js');
const diagnostics = read('wwwroot/js/bunker/diagnostics/runtime.js');
const css = read('wwwroot/css/game.css');
const translations = read('wwwroot/js/bunker/i18n/translations.js');

test('game page starts with the apocalypse story and uses floating room controls', () => {
  assert.doesNotMatch(page, /site-titlebar|compactRoomHud|roomPlayersList|copyInviteLinkBtn[\s\S]*site-command|gameRulesModal|gameRulesBtn/);
  assert.match(page, /id="roomFloatingControls"[\s\S]*id="gmPanelBtn"[\s\S]*>GM<[\s\S]*id="developerToolsButton"[\s\S]*>DEV<[\s\S]*id="roomActionsMenu"/);
  assert.match(page, /id="leaveRoomButton"[\s\S]*onclick="leaveRoom\(\)"/);
  assert.match(ui, /copyInviteLinkButton\.hidden = !isHost/);
  assert.match(page, /id="roundStatusPanel" class="round-status-inline"/);
  assert.match(page, /id="publicGameTimer" class="public-game-timer" hidden/);
  assert.match(timer, /publicTimer\.hidden = !\['running', 'paused'\]\.includes\(timerState\)/);
  assert.match(css, /\.room-floating-controls \{[\s\S]*position: fixed/);
  assert.match(css, /\.public-game-timer \{[\s\S]*position: fixed/);
  assert.match(diagnostics, /button\.hidden = !\(isDeveloper && toolsEnabled && currentRoom\)/);
  assert.match(translations, /roomActions: "Дії кімнати"[\s\S]*developerTools: "Інструменти Developer"/);
  assert.match(translations, /roomActions: "Room actions"[\s\S]*developerTools: "Developer tools"/);
  assert.match(translations, /roomActions: "Действия комнаты"[\s\S]*developerTools: "Инструменты Developer"/);
  assert.match(gmView, /role="complementary"/);
  assert.doesNotMatch(`${gmView}\n${gmClient}\n${css}`, /gmPanelBackdrop|gm-panel-v2-open\s*\{\s*overflow: hidden/);

  const apocalypse = story.indexOf("move('apocalypsePanel', apocalypse)");
  const bunker = story.indexOf("move('bunkerPanel', bunker)");
  const threat = story.indexOf("move('threatPanel', threat)");
  const characteristics = story.indexOf("move('myPlayerSection', characteristics)");
  const players = story.indexOf("move('publicPlayerOverview', characteristics)");
  assert.ok(apocalypse < bunker && bunker < threat && threat < characteristics && characteristics < players);
  assert.match(board, /id="apocalypsePanel"[\s\S]*id="bunkerPanel"[\s\S]*id="threatPanel"/);
});
