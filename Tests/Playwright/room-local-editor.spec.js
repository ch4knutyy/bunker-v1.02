const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');
test.use({ ignoreHTTPSErrors: true });

test('room-local bunker edit updates live and survives host reload only in this room', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Editor ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="diagnostics"]').click();
    await room.host.locator('#gmRoomLocalEditor summary').click();
    await room.host.locator('#gmEditorCategory').selectOption('bunker');
    await room.host.locator('#gmEditorField').selectOption('bunker_name');
    await room.host.locator('#gmEditorValue').fill('Room-local bunker');
    await room.host.locator('#gmEditorPreviewButton').click();
    await expect(room.host.locator('#gmEditorApplyButton')).toBeEnabled({ timeout: 15000 });
    await room.host.locator('#gmEditorApplyButton').click();
    await expect(room.host.locator('#bunkerContent')).toContainText('Room-local bunker', { timeout: 15000 });
    await expect(room.guest.locator('#bunkerContent')).toContainText('Room-local bunker', { timeout: 15000 });
    await room.host.reload({ waitUntil: 'domcontentloaded' });
    await expect(room.host.locator('#bunkerContent')).toContainText('Room-local bunker', { timeout: 15000 });
    await expect(room.guest.locator('#gmPanel')).toBeHidden();
  } finally { await room.close(); }
});
