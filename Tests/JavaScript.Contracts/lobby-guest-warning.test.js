const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const client = fs.readFileSync('wwwroot/js/game.js', 'utf8');
const lobbyView = fs.readFileSync('Views/Shared/Bunker/_RoomLobby.cshtml', 'utf8');
const guestFunctions = client.slice(
  client.indexOf('function isGuestGameplayLobbyMember'),
  client.indexOf('function renderLobbyState')
);

function createContext(member, revision = 1) {
  const stored = new Map();
  const opened = [];
  const modal = { hidden: true, querySelectorAll: () => [] };
  const context = {
    lobbyState: { members: [member] },
    currentRoom: { id: 'ROOM42' },
    pendingGuestWarningStorageKey: '',
    lobbyGet: (object, camel, pascal) => object?.[camel] ?? object?.[pascal],
    getMyStablePlayerId: () => 'player-1',
    localStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value)
    },
    document: {
      activeElement: null,
      getElementById: id => id === 'guestAccountWarningModal'
        ? modal
        : id === 'guestWarningContinueButton'
          ? { focus() {} }
          : null
    },
    window: { open: (...args) => opened.push(args) },
    Number,
  };
  vm.createContext(context);
  vm.runInContext(guestFunctions, context);
  return { context, stored, opened, modal, revision };
}

const guestGameplayMember = {
  playerId: 'player-1',
  isGameplayParticipant: true,
  isAccountBound: false,
  isSpectator: false,
  isTechnicalGm: false,
  isOmniscientGm: false
};

test('guest gameplay user receives the warning', () => {
  const { context, modal } = createContext(guestGameplayMember);
  assert.equal(context.showGuestWarningIfEligible(1), true);
  assert.equal(modal.hidden, false);
});

test('account-bound gameplay user does not receive the warning', () => {
  const { context } = createContext({ ...guestGameplayMember, isAccountBound: true });
  assert.equal(context.showGuestWarningIfEligible(1), false);
});

test('spectator and GM roles do not receive the warning', () => {
  for (const role of [
    { isGameplayParticipant: false, isSpectator: true },
    { isGameplayParticipant: false, isTechnicalGm: true },
    { isGameplayParticipant: false, isOmniscientGm: true }
  ]) {
    const { context } = createContext({ ...guestGameplayMember, ...role });
    assert.equal(context.showGuestWarningIfEligible(1), false);
  }
});

test('acknowledgement deduplicates within one game revision', () => {
  const { context, modal } = createContext(guestGameplayMember);
  assert.equal(context.showGuestWarningIfEligible(4), true);
  context.continueAsGuest();
  assert.equal(modal.hidden, true);
  assert.equal(context.showGuestWarningIfEligible(4), false);
});

test('a new game revision allows the warning again', () => {
  const { context } = createContext(guestGameplayMember);
  assert.equal(context.showGuestWarningIfEligible(4), true);
  context.continueAsGuest();
  assert.equal(context.showGuestWarningIfEligible(5), true);
});

test('registration opens a clean account URL in a new tab', () => {
  const { context, opened } = createContext(guestGameplayMember);
  context.showGuestWarningIfEligible(1);
  context.registerFromGuestWarning();
  assert.deepEqual(opened, [['/account/register', '_blank', 'noopener']]);
  assert.doesNotMatch(opened[0][0], /room|token|password|command/i);
  assert.match(lobbyView, /guestWarningCurrentPlayerRemainsGuest/);
});
