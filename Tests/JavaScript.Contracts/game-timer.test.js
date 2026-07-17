const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.GameMaster.cs', 'utf8');
const expiry = fs.readFileSync('Services/Bunker/GameFlow/GameTimerExpiryService.cs', 'utf8');
const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const model = fs.readFileSync('Models/Game/Timers/GameTimerState.cs', 'utf8');

test('timer commands are authorized, idempotent, and never accept timestamps', () => {
  for (const method of ['StartGameTimer', 'PauseGameTimer', 'ResumeGameTimer', 'RestartGameTimer', 'SetGameTimer', 'AdjustGameTimer', 'StopGameTimer'])
    assert.match(hub, new RegExp(`Task ${method}\\(`));
  assert.match(hub, /GmCapability\.ManagePublicGameState/);
  assert.match(hub, /RememberPlayerCommand/);
  assert.doesNotMatch(hub, /StartGameTimer\([^)]*(Deadline|StartedAt|UpdatedAt)/);
});

test('one hosted periodic service performs expiry without game side effects', () => {
  assert.match(expiry, /BackgroundService/);
  assert.match(expiry, /PeriodicTimer\(TimeSpan\.FromSeconds\(1\)\)/);
  assert.match(expiry, /TryExpire/);
  assert.match(expiry, /GameTimerUpdated/);
  assert.doesNotMatch(expiry, /CurrentRound|CurrentVoting|ThreatState|EffectsApplied/);
});

test('safe DTO has no hidden fields and client clock is render-only', () => {
  const dto = model.match(/record GameTimerDto[\s\S]*?\);/)?.[0] || '';
  assert.doesNotMatch(dto, /Player|Vote|Characteristic|Inventory|Effect/);
  assert.match(client, /performance\.now\(\)/);
  assert.match(client, /Math\.max\(0/);
  assert.doesNotMatch(client, /connection\.invoke\([^)]*(DeadlineUtc|serverTimestampUtc)/i);
});

test('timer client prevents double submit', () => {
  assert.match(client, /if \(gameTimerCommandPending\) return/);
  assert.match(client, /connection\.on\("GameTimerUpdated"/);
});
