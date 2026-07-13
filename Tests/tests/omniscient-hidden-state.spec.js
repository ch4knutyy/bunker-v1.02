const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('hidden panel is private, live, versioned and restored after authorization on reconnect', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `OM2 hidden ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="diagnostics"]').click();
    await room.host.locator('#gmOmniscientMode summary').click();
    await room.host.locator('#omniscientBootstrapKey').fill('omniscient-test-key-123');
    await room.host.locator('#omniscientPreviewButton').click();
    await expect(room.host.locator('#omniscientEnterButton')).toBeEnabled();
    await room.host.locator('#omniscientEnterButton').click();

    await expect(room.host.locator('#omniscientHiddenTab')).toBeVisible({ timeout: 15000 });
    await expect(room.guest.locator('#omniscientHiddenTab')).toBeHidden();
    await expect(room.guest.locator('#omniscientHiddenPlayers')).toBeEmpty();
    await room.host.locator('#omniscientHiddenTab').click();
    await expect(room.host.locator('#omniscientHiddenSection')).toBeVisible();
    await expect(room.host.locator('#omniscientHiddenPlayers')).toContainText('P2');

    const p2 = room.host.locator('#omniscientHiddenPlayers details.gm-threat-audit').filter({ hasText: 'P2' });
    await p2.locator(':scope > summary').click();
    const profession = p2.locator('li').filter({ hasText: 'profession' }).first();
    await expect(profession).toContainText('hidden');
    await room.guest.evaluate(() => connection.invoke('RevealCharacteristic', 'Profession'));
    await expect(profession).toContainText('revealed', { timeout: 15000 });

    await room.host.reload();
    await expect(room.host.locator('#gmPanelBtn')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await expect(room.host.locator('#omniscientHiddenTab')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#omniscientHiddenTab').click();
    await expect(room.host.locator('#omniscientHiddenPlayers')).toContainText('P2');
  } finally {
    await room.close();
  }
});
