const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('explicit omniscient transition becomes a persistent public spectator marker', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Omniscient boundary ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await expect(room.host.locator('#gmPanel')).toBeVisible();
    await room.host.locator('[data-gm-tab-button="diagnostics"]').click();
    await room.host.locator('#gmOmniscientMode summary').click();

    await room.host.locator('#omniscientBootstrapKey').fill('omniscient-test-key-123');
    await room.host.locator('#omniscientPreviewButton').click();
    await expect(room.host.locator('#omniscientEnterButton')).toBeEnabled();
    await room.host.locator('#omniscientEnterButton').click();

    await expect(room.host.locator('#omniscientGmBanner')).toBeVisible({ timeout: 15000 });
    await expect(room.guest.locator('#omniscientGmBanner')).toBeVisible({ timeout: 15000 });
    await expect(room.guest.locator('#omniscientGmBanner')).toContainText('P1');

    await room.host.reload();
    await room.host.waitForFunction(() => Object.keys(roomPlayers).length === 2);
    await expect(room.host.locator('#omniscientGmBanner')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#omniscientGmBanner')).toContainText('P1');
  } finally {
    await room.close();
  }
});
