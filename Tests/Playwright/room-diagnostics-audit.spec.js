const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('host diagnostics and audit update live without reload', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Diagnostics ${Date.now()}`);
  try {
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="diagnostics"]').click();
    await expect(room.host.locator('#gmDiagnosticsSummary .gm-status-card')).toHaveCount(5, { timeout: 15000 });

    const check = room.host.locator('#gmRunDiagnostics');
    await check.dblclick();
    await expect(check).toBeEnabled({ timeout: 15000 });
    await expect(room.host.locator('#gmDiagnosticsIssues')).not.toBeEmpty({ timeout: 15000 });
    await expect(room.host.locator('#gmDiagnosticsIssues')).not.toContainText(/Inventory|SpecialCard|ConnectionId|Password/i);

    await room.host.locator('#gmPreviewAutoFix').click();
    await expect(room.host.locator('#gmDiagnosticsFeedback')).toContainText(/Безпечних виправлень|No safe fixes|Безопасных исправлений/, { timeout: 15000 });
    await expect(room.host.locator('#gmApplyAutoFix')).toBeDisabled();

    await room.host.locator('[data-gm-i18n="gmRefreshAudit"]').click();
    await expect(room.host.locator('#gmThreatAuditList')).toBeVisible();
    await expect(room.guest.locator('#gmPanel')).toBeHidden();
  } finally {
    await room.close();
  }
});
