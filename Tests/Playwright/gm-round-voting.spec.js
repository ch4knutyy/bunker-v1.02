const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('GM pause and forward round correction update live without duplicate commands', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Round Voting ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="round"]').click();

    await room.host.locator('#gmPauseReason').fill('Technical break');
    const pause = room.host.locator('[data-gm-i18n="gmPause"]');
    await pause.dblclick();
    await expect(room.host.locator('#gmPauseBadge')).toContainText(/Пауза|Pause|Пауза/, { timeout: 15000 });
    await expect(pause).toBeEnabled();

    await room.host.locator('[data-gm-i18n="gmResume"]').click();
    await expect(room.host.locator('#gmPauseBadge')).toContainText(/Продовжити|Resume|Продолжить/, { timeout: 15000 });

    await room.host.locator('#gmManualRound').fill('2');
    await room.host.locator('[data-gm-i18n="gmSetRound"]').click();
    await expect(room.host.locator('#gmCurrentRound')).toContainText('2', { timeout: 15000 });

    await expect(room.host.locator('[data-gm-i18n="gmStageUnavailable"]')).toBeDisabled();
    await expect(room.host.locator('[data-gm-i18n="gmTimerUnavailable"]')).toBeDisabled();
  } finally {
    await room.close();
  }
});

test('round 1 early voting survives refresh and the next round does not auto-start voting', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Early Voting ${Date.now()}`);
  const hostErrors = [];
  const hostRoomRenders = [];
  room.host.on('pageerror', error => hostErrors.push(error.message));
  room.host.on('console', message => {
    if (message.text().includes('[updateRoomUI]')) hostRoomRenders.push(message.text());
  });
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.evaluate(() => { window.BUNKER_DEBUG = true; });

    for (const page of [room.host, room.guest]) {
      const renderCountBeforeReveal = hostRoomRenders.length;
      await page.locator('#myPlayerCards .char-btn.locked:not(:disabled)').first().click();
      if (page === room.host) {
        await expect.poll(() => hostRoomRenders.length - renderCountBeforeReveal).toBe(0);
      }
    }

    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="round"]').click();
    const startVoting = room.host.locator('#gmStartVotingBtn');
    await expect(startVoting).toBeEnabled({ timeout: 15000 });
    await expect(startVoting).toContainText(/дострок|early|досроч/i);
    await room.guest.evaluate(() =>
      connection.invoke('StartVoting', crypto.randomUUID()));
    await expect(room.guest.locator('#votingPanel')).toBeHidden();
    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="round"]').click();
    await expect(room.host.locator('#gmStartVotingBtn')).toBeEnabled({ timeout: 15000 });
    room.host.once('dialog', dialog => dialog.accept());
    await room.host.locator('#gmStartVotingBtn').click();
    await expect(room.host.locator('#votingPanel')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmVotingCancelButton').click();
    await expect(room.host.locator('#votingPanel')).toBeHidden({ timeout: 15000 });
    await expect(room.host.locator('#endRoundBtn')).toBeEnabled({ timeout: 15000 });
    await room.host.locator('#endRoundBtn').click();
    await expect(room.host.locator('#gmCurrentRound')).toContainText('2', { timeout: 15000 });
    await expect(room.host.locator('#votingPanel')).toBeHidden();
    expect(hostErrors.filter(message => /Voting|ReferenceError/.test(message))).toEqual([]);
    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#votingPanel')).toBeHidden();
  } finally {
    await room.close();
  }
});
