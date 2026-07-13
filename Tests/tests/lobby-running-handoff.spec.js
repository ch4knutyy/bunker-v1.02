const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('two gameplay players receive the complete running state immediately and after reload', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Lobby handoff ${Date.now()}`);
  try {
    await room.host.locator('#lobbyReadyButton').click();
    await room.guest.locator('#lobbyReadyButton').click();
    await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
    await room.host.locator('#lobbyStartPreviewButton').click();
    await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
    await room.host.locator('#startGameBtn').click();

    for (const page of [room.host, room.guest]) {
      await expect(page.locator('#roomLobby')).toBeHidden({ timeout: 15000 });
      await expect(page.locator('#gameSection')).toBeVisible();
      await expect(page.locator('#myPlayerSection')).toBeVisible();
      await expect(page.locator('#myPlayerCards .player-card').first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#mySpecialCardsList .my-special-card').first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#apocalypseContent')).not.toContainText(/Завантаження|Loading|Загрузка/);
      await expect(page.locator('#bunkerContent')).not.toContainText(/Завантаження|Loading|Загрузка/);
    }
    await expect(room.host.locator('#gmPanelBtn')).toBeVisible();
    await expect(room.guest.locator('#gmPanelBtn')).toBeHidden();

    for (const page of [room.host, room.guest]) {
      await page.reload();
      await expect(page.locator('#gameSection')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#myPlayerCards .player-card').first()).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#mySpecialCardsList .my-special-card').first()).toBeVisible({ timeout: 15000 });
    }
    await expect(room.host.locator('#gmPanelBtn')).toBeVisible();
    await expect(room.guest.locator('#gmPanelBtn')).toBeHidden();
  } finally {
    await room.close();
  }
});

