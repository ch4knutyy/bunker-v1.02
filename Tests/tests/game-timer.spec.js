const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('server timer starts, pauses, resumes and updates every client', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Timer ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="round"]').click();

    await room.host.locator('#gmTimerMinutes').fill('0');
    await room.host.locator('#gmTimerSeconds').fill('20');
    const start = room.host.locator('#gmTimerStart');
    await start.dblclick();
    await expect(room.host.locator('#publicGameTimerValue')).toHaveText(/00:(1\d|20)/, { timeout: 15000 });
    await expect(room.guest.locator('#publicGameTimerValue')).toHaveText(/00:(1\d|20)/, { timeout: 15000 });
    await expect(room.guest.locator('#publicGameTimer')).toBeVisible();
    await expect(start).toBeEnabled();

    await room.host.locator('#gmTimerPause').click();
    await expect(room.host.locator('#publicGameTimerStatus')).toContainText(/Пауза|Pause/);
    const pausedValue = await room.host.locator('#publicGameTimerValue').textContent();
    await room.host.waitForTimeout(1100);
    await expect(room.host.locator('#publicGameTimerValue')).toHaveText(pausedValue);

    await room.host.locator('#gmTimerResume').click();
    await expect(room.host.locator('#gmTimerPause')).toBeEnabled();
    await expect(room.host.locator('#publicGameTimerValue')).not.toHaveText('-');
  } finally {
    await room.close();
  }
});
