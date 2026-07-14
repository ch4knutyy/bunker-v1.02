const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');

const css = fs.readFileSync('wwwroot/css/game.css', 'utf8');
const tooltipCss = fs.readFileSync('wwwroot/css/tooltip.css', 'utf8');
const game = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const view = fs.readFileSync('Views/Home/Game.cshtml', 'utf8');
const layout = fs.readFileSync('Views/Shared/_Layout.cshtml', 'utf8');
const sitePass = css.slice(css.indexOf('/* ==================== GLOBAL GAME SITE VISUAL PASS'));

test('page background is lightweight layered CSS rather than a plain color', () => {
  assert.match(sitePass, /body\s*\{[^}]*background-color:\s*#050607[^}]*radial-gradient[^}]*repeating-linear-gradient[^}]*background-attachment:\s*fixed/s);
  assert.doesNotMatch(sitePass, /url\(|canvas|video/);
  assert.match(sitePass, /@media \(max-width:\s*760px\)[\s\S]*body\s*\{[^}]*background-attachment:\s*scroll/);
});

test('main command shell is wider and has both outer and inner border treatment', () => {
  assert.match(sitePass, /\.main-content\s*\{[^}]*max-width:\s*1580px/);
  assert.match(sitePass, /\.site-game-shell\s*\{[^}]*border:\s*1px solid var\(--site-border\)[^}]*border-radius:\s*var\(--site-radius\)[^}]*box-shadow:[^}]*inset/s);
  assert.match(view, /class="game-container site-game-shell"/);
  assert.doesNotMatch(sitePass, /\.site-game-shell::(?:before|after)|\.main-content::(?:before|after)|body::(?:before|after)/);
});

test('navbar keeps its routes and gains a scoped active premium treatment', () => {
  for (const route of ['asp-action="Index"', 'href="/play"', 'href="/rules"', 'href="/#author"', 'github.com/ch4knutyy/bunker-v1.02']) assert.match(layout, new RegExp(route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(sitePass, /\.main-header\s*\{[^}]*border-bottom:[^}]*box-shadow/);
  assert.match(sitePass, /\.nav-link\.active\s*\{[^}]*border-color:[^}]*background:/);
  assert.match(sitePass, /\.language-btn\.active,[\s\S]*?background:\s*var\(--site-accent\)/);
  assert.match(sitePass, /\.profile-btn\s*\{[^}]*width:\s*42px[^}]*height:\s*42px/);
});

test('room command bar preserves every public action id and handler', () => {
  for (const [id, handler] of [
    ['currentRoomName', null], ['currentRoomId', null], ['currentRoomState', null],
    ['copyInviteLinkBtn', 'copyInviteLink()'], ['gmPanelBtn', 'toggleGMPanel()'],
    ['startVotingBtn', 'startVoting()'], ['startGameBtn', 'startGame()']
  ]) {
    assert.match(view, new RegExp(`id="${id}"`));
    if (handler) assert.match(view, new RegExp(`onclick="${handler.replace(/[()]/g, '\\$&')}"`));
  }
  assert.match(view, /class="room-header site-command-bar"/);
  assert.match(game, /roomPlayerCountElement[\s\S]*if \(roomPlayerCountElement\)/);
});

test('round HUD preserves values and applies explicit running paused expired state classes', () => {
  for (const id of ['roundStatusPanel', 'roundStatusNumber', 'roundStatusPhase', 'roundStatusProgress', 'publicGameTimer', 'publicGameTimerValue', 'publicGameTimerStatus']) assert.match(view, new RegExp(`id="${id}"`));
  assert.match(view, /site-round-hud/);
  assert.equal((view.match(/site-hud-module/g) || []).length, 3);
  assert.match(game, /panel\.style\.display = shouldShow \? 'grid' : 'none'/);
  assert.match(game, /panel\.classList\.toggle\('is-paused'/);
  assert.match(game, /timer-running', 'timer-paused', 'timer-expired', 'timer-stopped'/);
  assert.match(sitePass, /\.site-round-hud\s*\{[^}]*grid-template-columns:[^}]*minmax\(150px/);
  assert.match(sitePass, /\.module-timer\.timer-expired strong\s*\{[^}]*color:/);
});

test('major headings panels and global buttons share one restrained system', () => {
  assert.ok((view.match(/site-section-heading/g) || []).length >= 7);
  for (const variable of ['--site-surface', '--site-surface-strong', '--site-border', '--site-inner-border', '--site-glow', '--site-accent', '--site-muted', '--site-danger', '--site-success']) assert.match(sitePass, new RegExp(variable));
  assert.match(sitePass, /\.site-panel\s*\{[^}]*border:[^}]*background:[^}]*box-shadow:/s);
  assert.match(sitePass, /\.site-section-heading\.section-title::before/);
  assert.match(sitePass, /\.site-section-heading\.section-title::after/);
  assert.match(sitePass, /\.game-container :where\(\.btn-primary,[^}]*min-height:\s*44px/s);
  assert.match(sitePass, /:focus-visible[^{]*\{[^}]*outline:\s*2px solid var\(--site-accent-strong\)/s);
  assert.match(sitePass, /button:disabled,[\s\S]*?opacity:\s*\.48/);
});

test('immersive internals and scenario image layers are not overridden by the site pass', () => {
  for (const internal of ['.vault-characteristic-card', '.special-card-shell', '.scenario-immersive-shell', '.threat-hero', '.apocalypse-hero', '.bunker-hero']) assert.doesNotMatch(sitePass, new RegExp(internal.replace('.', '\\.')));
  assert.match(css, /\.player-cards-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3,/);
  assert.match(css, /\.threat-hero\.has-image \.threat-hero-pattern,[\s\S]*?display:\s*none;[\s\S]*?opacity:\s*0/);
  assert.match(css, /\.scenario-immersive-hero\s*\{[^}]*aspect-ratio:\s*2\.75\s*\/\s*1/);
});

test('responsive shell and reduced motion contracts are present', () => {
  assert.match(sitePass, /@media \(max-width:\s*760px\)[\s\S]*?\.site-command-actions\s*\{[^}]*grid-template-columns:\s*repeat\(2/);
  assert.match(sitePass, /@media \(max-width:\s*430px\)[\s\S]*?\.site-round-hud\s*\{[^}]*grid-template-columns:\s*1fr/);
  assert.match(sitePass, /@media \(prefers-reduced-motion:\s*reduce\)[\s\S]*?animation-duration:\s*\.01ms/);
  assert.match(tooltipCss, /\.tooltip-portal\s*\{[^}]*position:\s*fixed[^}]*z-index:\s*100000/s);
  assert.equal((game.match(/function tryRenderRunningGameState\(/g) || []).length, 1);
});
