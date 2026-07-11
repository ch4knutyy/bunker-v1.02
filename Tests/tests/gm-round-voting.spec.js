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
