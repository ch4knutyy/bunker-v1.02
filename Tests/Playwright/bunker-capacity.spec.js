const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('host sets absolute bunker capacity and all clients update live', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Capacity ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="content"]').click();

    const input = room.host.locator('#gmBunkerCapacity');
    await expect(input).toHaveAttribute('type', 'number');
    await input.fill('4');
    await input.press('Enter');
    await expect(input).toHaveValue('4');
    await expect(room.host.locator('#gmBunkerCapacityFeedback')).toContainText(/збережено|saved|сохранена/i);
    await expect(room.guest.locator('#bunkerContent')).toContainText('4', { timeout: 15000 });

    await input.fill('4');
    await room.host.locator('#gmBunkerCapacitySubmit').dblclick();
    await expect(input).toHaveValue('4');
  } finally {
    await room.close();
  }
});
