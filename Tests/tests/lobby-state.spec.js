const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom, joinRoom } = require('./game-test-helpers');
test.use({ ignoreHTTPSErrors: true });

test('lobby roles readiness start and spectator reconnect stay canonical', async ({ browser }) => {
  const roomName = `Lobby canonical ${Date.now()}`; const room = await createTwoPlayerRoom(browser, roomName);
  const spectatorContext = await browser.newContext({ ignoreHTTPSErrors: true }); const spectator = await spectatorContext.newPage();
  try {
    await joinRoom(spectator, 'P3', roomName);
    const p3 = room.host.locator('#lobbyMembers .lobby-member-card').filter({ hasText: 'P3' });
    await expect(p3).toBeVisible({ timeout: 15000 }); await p3.getByRole('button', { name: /Спостерігач|Spectator|Наблюдатель/ }).click();
    await expect(p3.locator('.lobby-role-badge')).toHaveText(/Спостерігач|Spectator|Наблюдатель/, { timeout: 15000 });

    await expect(room.host.locator('#lobbyReadyButton')).toBeEnabled({ timeout: 15000 });
    await room.host.locator('#lobbyReadyButton').click(); await expect(room.host.locator('#lobbyReadyButton')).toContainText(/Скасувати|Cancel|Отменить/);
    await room.guest.locator('#lobbyReadyButton').click(); await expect(room.guest.locator('#lobbyReadyButton')).toContainText(/Скасувати|Cancel|Отменить/);
    await expect(spectator.locator('#lobbyReadyButton')).toHaveCount(0);
    await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
    await room.host.locator('#lobbyStartPreviewButton').click(); await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
    await expect(room.host.locator('#startGameBtn')).toBeEnabled(); await room.host.locator('#startGameBtn').click();

    await expect(room.host.locator('#roomLobby')).toBeHidden({ timeout: 15000 }); await expect(room.host.locator('#gameSection')).toBeVisible();
    await expect(spectator.locator('#roomLobby')).toBeHidden({ timeout: 15000 }); await expect(spectator.locator('#gameSection')).toBeVisible();
    await expect(spectator.locator('#myPlayerSection')).toBeHidden();
    await spectator.reload(); await expect(spectator.locator('#gameSection')).toBeVisible({ timeout: 15000 }); await expect(spectator.locator('#myPlayerSection')).toBeHidden();
  } finally { await spectatorContext.close().catch(() => {}); await room.close(); }
});
