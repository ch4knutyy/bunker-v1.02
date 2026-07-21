const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('GM round controls stay readable and overflow-free on mobile width', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Round Readability ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 390, height: 844 });
    await room.host.locator('#lobbyReadyButton').click();
    await room.guest.locator('#lobbyReadyButton').click();
    await room.host.locator('#lobbyStartPreviewButton').click();
    await expect(room.host.locator('#startGameBtn')).toBeEnabled({ timeout: 15000 });
    const guestWarning = room.host.locator('#guestAccountWarningModal');
    if (await guestWarning.isVisible())
      await room.host.locator('#guestWarningContinueButton').click();
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="game"]').click();
    for (const id of ['#gmRoundStateHeading', '#gmRoundMainHeading', '#gmManualRoundHeading', '#gmReadinessHeading', '#gmTimerHeading']) {
      await expect(room.host.locator(id)).toBeVisible();
    }
    await expect(room.guest.locator('#gmRoundSection')).toBeHidden();

    for (const language of ['uk', 'ru', 'en']) {
      await room.host.evaluate(lang => { setCurrentLanguage(lang); renderGMPanelState(); }, language);
      const overflow = await room.host.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        section: document.getElementById('gmRoundSection').scrollWidth - document.getElementById('gmRoundSection').clientWidth
      }));
      expect(overflow.page).toBeLessThanOrEqual(1);
      expect(overflow.section).toBeLessThanOrEqual(1);
    }

    await room.host.evaluate(() => setGmRoundCommandPending(true));
    await expect(room.host.locator('.gm-round-command').first()).toBeDisabled();
    await expect(room.host.locator('.gm-round-command').first()).toBeVisible();
    await room.host.evaluate(() => setGmRoundCommandPending(false));
  } finally {
    await room.close();
  }
});
