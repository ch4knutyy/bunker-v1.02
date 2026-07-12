const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('host previews force failure and force success without reload', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Threat Force ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="threat"]').click();
    await room.host.locator('button[onclick="gmGenerateRareThreat()"]') .click();

    await expect(room.host.locator('#gmThreatForceSuccess')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#gmThreatForceFailure')).toBeVisible();
    await expect(room.guest.locator('#gmThreatForceSuccess')).toBeHidden();

    const before = await room.host.locator('#gmThreatCurrent').textContent();
    await room.host.locator('#gmThreatForceFailure').click();
    await expect(room.host.locator('#gmThreatForceModal')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#gmThreatForcePreviewContent')).toContainText(/провал|failure/i);
    await expect(room.host.locator('#gmThreatForcePreviewContent')).toContainText(/наслід|effect/i);
    await expect(room.host.locator('#gmThreatCurrent')).toHaveText(before || '');

    await room.host.evaluate(() => { confirmGMThreatForce(); confirmGMThreatForce(); });
    await expect(room.host.locator('#gmThreatCurrent')).toContainText(/провал|failed/i, { timeout: 15000 });
    await expect(room.host.locator('#gmThreatForceModal')).toBeHidden();
    await expect(room.host.locator('#gmThreatForceFailure')).toBeHidden();

    await room.host.locator('#gmThreatAudit summary').click();
    await expect(room.host.locator('#gmThreatAuditList')).toContainText(/примусово.*провал|forced failure/i);
    await expect(room.host.locator('#gmThreatAuditList .gm-threat-audit-entry')).toHaveCount(4);

    await room.host.locator('button[onclick="gmGenerateRareThreat()"]') .click();
    await expect(room.host.locator('#gmThreatForceSuccess')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmThreatForceSuccess').click();
    await expect(room.host.locator('#gmThreatForceModal')).toBeVisible();
    await expect(room.host.locator('#gmThreatForcePreviewContent')).toContainText(/успіх|success/i);
    await room.host.locator('#gmThreatForceConfirm').click();
    await expect(room.host.locator('#gmThreatCurrent')).toContainText(/усунено|успіх|resolved/i, { timeout: 15000 });
    await expect(room.host.locator('#gmThreatAuditList')).toContainText(/примусово.*успіх|forced success/i);
    await expect(room.host.locator('#gmThreatAuditList .gm-threat-audit-entry')).toHaveCount(7);
  } finally {
    await room.close();
  }
});
