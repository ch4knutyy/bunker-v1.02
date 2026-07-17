const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('host player controls resync live and prevent unsafe self kick', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `GM Player Controls ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await expect(room.host.locator('#gmPanel')).toBeVisible();

    const select = room.host.locator('#gmPlayerSelect');
    await expect(select.locator('option')).toHaveCount(3);
    await select.selectOption({ index: 2 });
    await expect(room.host.locator('#gmPlayerInfo')).toBeVisible();
    await room.host.locator('.gm-player-secondary summary').click();

    const resync = room.host.locator('[data-gm-i18n="gmResyncPlayer"]');
    await resync.dblclick();
    await expect(room.host.locator('#gmPlayerCommandResult')).toContainText('resync', { timeout: 15000 });
    await expect(resync).toBeEnabled();

    await expect(room.host.locator('.gm-player-danger')).toBeVisible();
    await expect(room.host.locator('#gmAdditionalConditions')).toBeEmpty();
  } finally {
    await room.close();
  }
});
