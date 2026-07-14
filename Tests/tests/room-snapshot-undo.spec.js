const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('snapshots persist in room and undo updates live without hidden UI data', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Snapshots ${Date.now()}`);
  try {
    await room.host.locator('#lobbyReadyButton').click();
    await room.guest.locator('#lobbyReadyButton').click();
    await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
    await room.host.locator('#lobbyStartPreviewButton').click();
    await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i, { timeout: 15000 });
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="round"]').click();

    await room.host.locator('.gm-round-command[data-gm-i18n="gmPause"]').click();
    await expect(room.host.locator('#gmPauseBadge')).toContainText(/призупинено|paused|приостановлена/i, { timeout: 15000 });

    await room.host.locator('[data-gm-tab-button="diagnostics"]').click();
    await room.host.locator('#gmSnapshotsSection summary').click();
    await expect(room.host.locator('#gmSnapshotsList')).toContainText(/Before pause state change/, { timeout: 15000 });

    await room.host.locator('#gmUndoLastAction').click();
    await expect(room.host.locator('#gmPauseBadge')).toContainText(/триває|running|продолжается/i, { timeout: 15000 });

    await room.host.locator('#gmSnapshotReason').fill('UI checkpoint');
    await room.host.locator('#gmCreateSnapshot').dblclick();
    await expect(room.host.locator('#gmSnapshotsList')).toContainText('UI checkpoint', { timeout: 15000 });

    const checkpoint = room.host.locator('.gm-snapshot-entry').filter({ hasText: 'UI checkpoint' });
    await checkpoint.locator('button').first().click();
    await expect(room.host.locator('#gmSnapshotPreview')).toContainText(/Змінені категорії|Changed categories|Изменённые категории/, { timeout: 15000 });
    await expect(checkpoint.locator('button').nth(1)).toBeEnabled();

    await room.host.reload({ waitUntil: 'domcontentloaded' });
    await expect(room.host.locator('#gmPanelBtn')).toBeVisible({ timeout: 15000 });
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="diagnostics"]').click();
    await room.host.locator('#gmSnapshotsSection summary').click();
    await expect(room.host.locator('#gmSnapshotsList')).toContainText('UI checkpoint', { timeout: 15000 });
    await expect(room.host.locator('#gmSnapshotsList')).not.toContainText(/Inventory|SpecialCard|ConnectionId|Password/i);
    await expect(room.guest.locator('#gmPanel')).toBeHidden();
  } finally {
    await room.close();
  }
});
