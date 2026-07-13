const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');
test.use({ ignoreHTTPSErrors: true });

test('director preview applies canonical reveal and live-resyncs public and private state', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `OM3A director ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click(); await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click(); await room.host.locator('[data-gm-tab-button="diagnostics"]').click();
    await room.host.locator('#gmOmniscientMode summary').click(); await room.host.locator('#omniscientBootstrapKey').fill('omniscient-test-key-123');
    await room.host.locator('#omniscientPreviewButton').click(); await expect(room.host.locator('#omniscientEnterButton')).toBeEnabled(); await room.host.locator('#omniscientEnterButton').click();
    await expect(room.host.locator('#omniscientHiddenTab')).toBeVisible({ timeout: 15000 }); await room.host.locator('#omniscientHiddenTab').click();
    await room.host.locator('#omniscientDirectorControls summary').click();
    await room.host.locator('#directorAction').selectOption('reveal'); await room.host.locator('#directorCategory').selectOption('Profession');
    await room.host.locator('#directorPreviewButton').click(); await expect(room.host.locator('#directorApplyButton')).toBeEnabled();
    await expect(room.host.locator('#directorPreviewResult')).not.toContainText('Hidden profession');
    await room.host.locator('#directorApplyButton').click();
    await expect(room.host.locator('#directorPreviewResult')).toContainText('Applied', { timeout: 15000 });
    await expect(room.guest.locator('#playersTableBody')).toContainText('P2', { timeout: 15000 });
    const p2 = room.host.locator('#omniscientHiddenPlayers details.gm-threat-audit').filter({ hasText: 'P2' });
    await p2.locator(':scope > summary').click();
    await expect(p2.locator('li').filter({ hasText: /profession|профес/i }).first()).toContainText(/Відкрито|Revealed|Открыто/i, { timeout: 15000 });
  } finally { await room.close(); }
});
