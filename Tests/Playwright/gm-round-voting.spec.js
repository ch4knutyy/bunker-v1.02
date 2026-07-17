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

test('normal rounds 1 to 3 enable voting live and start an active session', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Round 3 Voting ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });

    for (let round = 1; round <= 3; round++) {
      for (const page of [room.host, room.guest]) {
        await page.locator('#myPlayerCards .char-btn.locked:not(:disabled)').first().click();
      }
      await room.host.locator('#gmPanelBtn').click();
      await room.host.locator('[data-gm-tab-button="round"]').click();
      await expect(room.host.locator('#endRoundBtn')).toBeEnabled({ timeout: 15000 });
      await room.host.locator('#endRoundBtn').click();
      if (round < 3) await expect(room.host.locator('#gmCurrentRound')).toContainText(String(round + 1), { timeout: 15000 });
      await room.host.locator('#gmPanel .btn-close').click();
    }

    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="round"]').click();
    const startVoting = room.host.locator('#gmStartVotingBtn');
    await expect(startVoting).toBeEnabled({ timeout: 15000 });
    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="round"]').click();
    await expect(room.host.locator('#gmStartVotingBtn')).toBeEnabled({ timeout: 15000 });
    await room.host.locator('#gmStartVotingBtn').click();
    await expect(room.host.locator('#votingPanel')).toBeVisible({ timeout: 15000 });
  } finally {
    await room.close();
  }
});
