const { test, expect } = require('@playwright/test'); const { createTwoPlayerRoom, createRoom } = require('./game-test-helpers');
test.use({ ignoreHTTPSErrors: true });
test('UA lobby is localized, deduplicated and readable', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Lobby UI ${Date.now()}`);
  try {
    await expect(room.host.locator('#roomLobby')).toContainText('Лобі кімнати');
    await expect(room.host.locator('#lobbySummary')).toContainText('Активні гравці'); await expect(room.host.locator('#lobbySummary')).toContainText('Спостерігачі');
    await expect(room.host.locator('#lobbyBlockers')).toContainText('Не всі підключені учасники підтвердили готовність.');
    await expect(room.host.locator('#lobbyBlockers')).not.toContainText('connected_members_not_ready');
    await expect(room.host.locator('#roomPlayersList')).toBeHidden();
    await expect(room.guest.locator('#lobbyMembers .lobby-host-controls')).toHaveCount(0);
    await room.guest.locator('#lobbyReadyButton').click(); await expect(room.guest.locator('#lobbyReadyButton')).toContainText('Скасувати готовність');
    await room.host.evaluate(() => { setCurrentLanguage('en'); renderLobbyState(); }); await expect(room.host.locator('#lobbySummary')).toContainText('Active players');
    await room.host.evaluate(() => { setCurrentLanguage('ru'); renderLobbyState(); }); await expect(room.host.locator('#lobbySummary')).toContainText('Активные игроки');
  } finally { await room.close(); }
});
test('mobile lobby has no horizontal overflow and keeps touch targets', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ignoreHTTPSErrors: true }); const page = await context.newPage();
  try {
    await createRoom(page, 'Mobile', `Mobile Lobby ${Date.now()}`, { maxPlayers: 6 });
    await expect(page.locator('#canonicalLobbyPanel')).toBeVisible();
    for (const width of [360, 390, 768]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const columns = await page.locator('#lobbySummary').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length); expect(columns).toBe(2);
    }
    const box = await page.locator('#lobbyReadyButton').boundingBox(); expect(box.height).toBeGreaterThanOrEqual(44);
  } finally { await context.close(); }
});
