const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('host can reset, abort and resync one canonical threat attempt', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Threat Recovery ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="threat"]').click();

    await room.host.locator('button[onclick="gmGenerateRareThreat()"]') .click();
    await expect(room.host.locator('#gmThreatCurrent')).not.toContainText('відсутня', { timeout: 15000 });
    await expect(room.host.locator('#gmThreatReset')).toBeVisible();
    await expect(room.host.locator('#gmThreatAbort')).toBeVisible();
    await expect(room.guest.locator('#gmThreatEmergencyBlock')).toBeHidden();

    await room.host.locator('#gmThreatReset').dblclick();
    await expect(room.host.locator('#gmThreatCommandResult')).toContainText(/очищено|cleared|очищен/i, { timeout: 15000 });

    await room.host.locator('#gmThreatAbort').click();
    await expect(room.host.locator('#gmThreatCurrent')).toContainText(/скасовано|aborted|отменена/i, { timeout: 15000 });
    await expect(room.host.locator('#gmThreatReset')).toBeHidden();
    await expect(room.host.locator('#gmThreatAbort')).toBeHidden();
    await expect(room.host.locator('#gmThreatResync')).toBeVisible();

    await room.host.locator('#gmThreatResync').click();
    await expect(room.host.locator('#gmThreatCurrent')).toContainText(/скасовано|aborted|отменена/i);
  } finally {
    await room.close();
  }
});
