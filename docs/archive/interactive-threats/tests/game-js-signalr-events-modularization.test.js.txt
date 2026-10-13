const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const game = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'game.js'), 'utf8');
const signalrEvents = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'core', 'signalr-events.js'), 'utf8');
const view = fs.readFileSync(path.join(root, 'Views', 'Bunker', 'Index.cshtml'), 'utf8');

test('signalr-events.js exists and is non-empty', () => {
  assert.ok(signalrEvents.length > 1000, 'signalr-events.js must contain the extracted registerSignalREvents function');
});

test('registerSignalREvents declaration moved to signalr-events.js', () => {
  assert.match(signalrEvents, /^function registerSignalREvents\(\) \{/m, 'registerSignalREvents must be declared in signalr-events.js');
  const gameMatches = game.match(/function registerSignalREvents\s*\(/g);
  assert.ok(!gameMatches || gameMatches.length === 0, 'registerSignalREvents must NOT be declared in game.js');
});

test('registerSignalREvents exists exactly once in signalr-events.js', () => {
  const matches = signalrEvents.match(/function registerSignalREvents\s*\(/g);
  assert.ok(matches && matches.length === 1, 'registerSignalREvents must be declared exactly once in signalr-events.js');
});

test('bootstrap call in game.js calls registerSignalREvents before connection.start', () => {
  const callIdx = game.indexOf('if (typeof registerSignalREvents === \'function\') registerSignalREvents()');
  assert.notEqual(callIdx, -1, 'registerSignalREvents() call must exist in game.js');
  const startIdx = game.indexOf('connection.start()');
  assert.ok(callIdx < startIdx, 'registerSignalREvents() call must be before connection.start()');
});

test('exactly one executable registerSignalREvents() call in game.js', () => {
  const lines = game.split('\n');
  const calls = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('//') || line.startsWith('/*')) continue;
    if (line.includes('registerSignalREvents()') && !line.includes('typeof')) {
      calls.push({ line: i + 1, content: line });
    }
  }
  assert.equal(calls.length, 1, `Expected exactly 1 executable registerSignalREvents() call, found ${calls.length}: ${JSON.stringify(calls)}`);
});

test('exactly one executable connection.start() call in game.js', () => {
  const lines = game.split('\n');
  const calls = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('//') || line.startsWith('/*')) continue;
    if (line === 'connection.start()' || line.startsWith('connection.start()')) {
      calls.push({ line: i + 1, content: line });
    }
  }
  assert.equal(calls.length, 1, `Expected exactly 1 executable connection.start() call, found ${calls.length}: ${JSON.stringify(calls)}`);
});

test('no connection.on registrations in game.js', () => {
  const matches = game.match(/connection\.on\(/g);
  assert.ok(!matches || matches.length === 0, 'game.js must not contain any connection.on registrations after extraction');
});

test('110 connection.on registrations in signalr-events.js', () => {
  const matches = signalrEvents.match(/connection\.on\(/g);
  assert.equal(matches ? matches.length : 0, 110, 'signalr-events.js must contain exactly 110 connection.on registrations');
});

test('110 connection.off calls in signalr-events.js (defensive pattern)', () => {
  const matches = signalrEvents.match(/connection\.off\(/g);
  assert.equal(matches ? matches.length : 0, 110, 'signalr-events.js must contain exactly 110 connection.off calls');
});

test('RejoinSuccess handler present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.off\("RejoinSuccess"\);[\s\S]*connection\.on\("RejoinSuccess"/, 'RejoinSuccess registration must be in signalr-events.js');
});

test('GM command pending flags reset in RejoinSuccess (cross-system)', () => {
  const rejoinSection = signalrEvents.slice(
    signalrEvents.indexOf('connection.off("RejoinSuccess")'),
    signalrEvents.indexOf('connection.on("RejoinFailed")')
  );
  assert.match(rejoinSection, /gmThreatCommandPending\s*=\s*false/);
  assert.match(rejoinSection, /gmThreatForcePending\s*=\s*false/);
  assert.match(rejoinSection, /gmPlayerCommandPending\s*=\s*false/);
  assert.match(rejoinSection, /gmRoundCommandPending\s*=\s*false/);
  assert.match(rejoinSection, /gmSnapshotCommandPending\s*=\s*false/);
  assert.match(rejoinSection, /gmRoomLocalEditorPending\s*=\s*false/);
  assert.match(rejoinSection, /gmDiagnosticsPending\s*=\s*false/);
  assert.match(rejoinSection, /bunkerCapacityPending\s*=\s*false/);
});

test('Threat handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("ThreatRevealed"/);
  assert.match(signalrEvents, /connection\.on\("ThreatStateUpdated"/);
  assert.match(signalrEvents, /connection\.on\("ThreatResolved"/);
  assert.match(signalrEvents, /connection\.on\("ThreatMiniGameStarted"/);
  assert.match(signalrEvents, /connection\.on\("ThreatSupportDiceRolled"/);
  assert.match(signalrEvents, /connection\.on\("ThreatVolunteerVoteStarted"/);
});

test('GM/omniscient handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("GMActionSuccess"/);
  assert.match(signalrEvents, /connection\.on\("OmniscientHiddenStateUpdated"/);
  assert.match(signalrEvents, /connection\.on\("GMThreatControlData"/);
  assert.match(signalrEvents, /connection\.on\("GMThreatForcePreview"/);
  assert.match(signalrEvents, /connection\.on\("GmAuditLogUpdated"/);
});

test('Postgame handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("PostGameTransitionChanged"/);
  assert.match(signalrEvents, /connection\.on\("GameFinished"/);
});

test('Voting handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("VotingStarted"/);
  assert.match(signalrEvents, /connection\.on\("VoteCast"/);
  assert.match(signalrEvents, /connection\.on\("VotingEnded"/);
  assert.match(signalrEvents, /connection\.on\("VotingResolved"/);
  assert.match(signalrEvents, /connection\.on\("VotingCancelled"/);
});

test('Bunker handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("BunkerChanged"/);
  assert.match(signalrEvents, /connection\.on\("BunkerUpdated"/);
  assert.match(signalrEvents, /connection\.on\("BunkerCapacityUpdated"/);
});

test('Round/Timer handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("RoundStateUpdated"/);
  assert.match(signalrEvents, /connection\.on\("GameTimerUpdated"/);
  assert.match(signalrEvents, /connection\.on\("GamePauseUpdated"/);
});

test('Lobby/Room handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("RoomCreated"/);
  assert.match(signalrEvents, /connection\.on\("RoomJoined"/);
  assert.match(signalrEvents, /connection\.on\("PlayerJoinedRoom"/);
  assert.match(signalrEvents, /connection\.on\("LobbyStateUpdated"/);
});

test('Special cards handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("SpecialCardStateUpdated"/);
  assert.match(signalrEvents, /connection\.on\("SpecialCardActivated"/);
  assert.match(signalrEvents, /connection\.on\("SpecialCardPrivateResult"/);
});

test('Characteristic/Player handlers present in signalr-events.js', () => {
  assert.match(signalrEvents, /connection\.on\("CharacteristicRevealed"/);
  assert.match(signalrEvents, /connection\.on\("PlayerEliminated"/);
  assert.match(signalrEvents, /connection\.on\("PlayerRestored"/);
  assert.match(signalrEvents, /connection\.on\("PlayerStateResynced"/);
});

test('Index.cshtml loads signalr-events.js before game.js', () => {
  const signalrIdx = view.indexOf('bunker/core/signalr-events.js');
  const gameIdx = view.indexOf('js/game.js');
  assert.ok(signalrIdx > 0 && gameIdx > 0, 'Both scripts must be present');
  assert.ok(signalrIdx < gameIdx, 'signalr-events.js must load before game.js');
});

test('signalr-events.js loads after apocalypse modules', () => {
  const apocIdx = view.indexOf('bunker/apocalypse/effects.js');
  const signalrIdx = view.indexOf('bunker/core/signalr-events.js');
  assert.ok(apocIdx > 0 && signalrIdx > 0);
  assert.ok(apocIdx < signalrIdx, 'apocalypse modules must load before signalr-events.js');
});

test('.gitkeep removed from core folder', () => {
  const coreGitkeep = path.join(root, 'wwwroot', 'js', 'bunker', 'core', '.gitkeep');
  assert.ok(!fs.existsSync(coreGitkeep), '.gitkeep must be removed from populated core folder');
});

test('no top-level executable calls in signalr-events.js', () => {
  const lines = signalrEvents.split('\n');
  const executableCalls = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('//') || line.startsWith('/*') || line === '') continue;
    if (line.includes('registerSignalREvents()') || line.includes('connection.start()')) {
      executableCalls.push({ line: i + 1, content: line });
    }
  }
  assert.equal(executableCalls.length, 0, 'signalr-events.js must not contain top-level executable registerSignalREvents() or connection.start() calls');
});

test('no imports/exports/IIFE in signalr-events.js', () => {
  assert.doesNotMatch(signalrEvents, /import\s|export\s|require\(|module\.exports|define\(|\(function\(\)|\(\(\)\s*=>/);
});

test('no type=module in Index.cshtml for signalr-events.js', () => {
  const tag = view.slice(view.indexOf('bunker/core/signalr-events.js'), view.indexOf('bunker/core/signalr-events.js') + 100);
  assert.doesNotMatch(tag, /type\s*=\s*["']module["']/);
});