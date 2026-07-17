const { test, expect } = require('@playwright/test');
const { createRoom, createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('host applies canonical setup, guest updates live, refresh persists and start uses it', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Lobby settings ${Date.now()}`);
  try {
    await expect(room.host.locator('#lobbySettingsHostEditor')).toBeVisible({ timeout: 15000 });
    await expect(room.guest.locator('#lobbySettingsHostEditor')).toBeHidden();
    await expect(room.guest.locator('#lobbySettingsReadOnly')).toBeVisible();

    await room.host.locator('#lobbyMaxPlayers').fill('7');
    await room.host.locator('[data-setting="specialCardsPerPlayer"]').selectOption('2');
    await room.host.locator('[data-setting="startingInventoryCount"]').selectOption('2');
    await room.host.locator('[data-settings-tab="threats"]').click();
    await room.host.locator('[data-setting="interactiveThreatRate"]').selectOption('Standard');
    await room.host.locator('[data-setting="firstThreatRound"]').selectOption('2');
    await room.host.locator('[data-settings-tab="rounds"]').click();
    await room.host.locator('[data-setting="roundTimerEnabled"]').check();
    await room.host.locator('[data-setting="roundTimerDurationSeconds"]').selectOption('180');
    await room.host.locator('[data-setting="votingStartRound"]').selectOption('2');

    await expect(room.host.locator('#lobbySettingsApply')).toBeEnabled();
    await room.host.locator('#lobbySettingsApply').click();
    await expect(room.host.locator('#lobbySettingsFeedback')).toContainText(/застосовано|applied|применены/i, { timeout: 15000 });
    await expect(room.guest.locator('#lobbySettingsChips')).toContainText(/2–7/, { timeout: 15000 });
    await expect(room.guest.locator('#lobbySettingsReadOnly')).toContainText(/180|3 min/i);

    await room.host.reload();
    await room.guest.reload();
    await expect(room.host.locator('#lobbyMaxPlayers')).toHaveValue('7', { timeout: 15000 });
    await expect(room.host.locator('[data-setting="interactiveThreatRate"]')).toHaveValue('Standard');
    await expect(room.guest.locator('#lobbySettingsChips')).toContainText(/2–7/);

    await room.host.locator('#lobbyReadyButton').click();
    await room.guest.locator('#lobbyReadyButton').click();
    await room.host.locator('#lobbyStartPreviewButton').click();
    await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i, { timeout: 15000 });
    await room.host.locator('#lobbyStartPrimaryButton').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#mySpecialCardsList .my-special-card')).toHaveCount(2, { timeout: 15000 });
    await expect(room.guest.locator('#mySpecialCardsList .my-special-card')).toHaveCount(2, { timeout: 15000 });
  } finally {
    await room.close();
  }
});

test('mobile setup has no horizontal overflow and local presets restore a draft', async ({ browser }) => {
  const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  try {
    await createRoom(page, 'MobileHost', `Mobile lobby ${Date.now()}`, { maxPlayers: 6 });
    await expect(page.locator('#lobbySettingsHostEditor')).toBeVisible({ timeout: 15000 });
    await page.locator('#lobbyLocalPresetName').fill('mobile-safe');
    await page.locator('#lobbyPresetSave').click();
    await expect(page.locator('#lobbySettingsFeedback')).toContainText(/збережено|saved|сохранён/i);
    await page.locator('#lobbyMaxPlayers').fill('8');
    await page.locator('#lobbyPresetLoad').click();
    await expect(page.locator('#lobbyMaxPlayers')).toHaveValue('6');
    await expect(page.locator('#lobbySettingsDirty')).not.toBeEmpty();

    await page.locator('[data-settings-tab="access"]').click();
    await expect(page.locator('#lobbySettingsAccess')).toBeVisible();
    const metrics = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth + 1);
    const applyHeight = await page.locator('#lobbySettingsApply').evaluate(element => element.getBoundingClientRect().height);
    expect(applyHeight).toBeGreaterThanOrEqual(44);
  } finally {
    await context.close();
  }
});

test('host transfer discards the old draft and gives the new host canonical editing', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Lobby transfer ${Date.now()}`);
  try {
    await room.host.locator('#lobbyMaxPlayers').fill('8');
    await expect(room.host.locator('#lobbySettingsDirty')).not.toBeEmpty();
    const guestCard = room.host.locator('#lobbyMembers .lobby-member-card').filter({ hasText: 'P2' });
    await guestCard.locator('.lobby-transfer-host').click();

    await expect(room.host.locator('#lobbySettingsHostEditor')).toBeHidden({ timeout: 15000 });
    await expect(room.host.locator('#lobbySettingsDirty')).toBeEmpty();
    await expect(room.guest.locator('#lobbySettingsHostEditor')).toBeVisible({ timeout: 15000 });
    await expect(room.guest.locator('#lobbyMaxPlayers')).toHaveValue('6');

    await room.guest.locator('#lobbyMaxPlayers').fill('7');
    await room.guest.locator('#lobbySettingsApply').click();
    await expect(room.guest.locator('#lobbySettingsFeedback')).toContainText(/застосовано|applied|применены/i, { timeout: 15000 });
    await expect(room.host.locator('#lobbySettingsChips')).toContainText(/2–7/, { timeout: 15000 });
  } finally {
    await room.close();
  }
});

test('disabled scenarios, threats and special cards start without empty surfaces or null errors', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Lobby disabled ${Date.now()}`);
  const pageErrors = [];
  room.host.on('pageerror', error => pageErrors.push(error.message));
  room.guest.on('pageerror', error => pageErrors.push(error.message));
  try {
    await room.host.locator('[data-setting="specialCardsPerPlayer"]').selectOption('0');
    await room.host.locator('[data-setting="apocalypseEnabled"]').uncheck();
    await room.host.locator('[data-setting="bunkerScenarioEnabled"]').uncheck();
    await room.host.locator('[data-settings-tab="threats"]').click();
    await room.host.locator('[data-setting="threatsEnabled"]').uncheck();
    await room.host.locator('#lobbySettingsApply').click();
    await expect(room.host.locator('#lobbySettingsFeedback')).toContainText(/застосовано|applied|применены/i, { timeout: 15000 });

    await room.host.locator('#lobbyReadyButton').click();
    await room.guest.locator('#lobbyReadyButton').click();
    await room.host.locator('#lobbyStartPreviewButton').click();
    await room.host.locator('#lobbyStartPrimaryButton').click();

    for (const page of [room.host, room.guest]) {
      await expect(page.locator('#gameSection')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('#apocalypsePanel')).toBeHidden();
      await expect(page.locator('#bunkerPanel')).toBeHidden();
      await expect(page.locator('#threatPanel')).toBeHidden();
      await expect(page.locator('#mySpecialCardsSection')).toBeHidden();
      await expect(page.locator('#mySpecialCardsList .my-special-card')).toHaveCount(0);
    }
    expect(pageErrors).toEqual([]);
  } finally {
    await room.close();
  }
});
