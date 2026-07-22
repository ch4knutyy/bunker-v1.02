const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('game-start effect is live, personal state is updated, and reload does not replay the banner', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Effect runtime ${Date.now()}`);
  try {
    const details = room.host.locator('details#lobbySettingsHostEditor, details:has(#lobbySettingsHostEditor)').first();
    if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
    await room.host.locator('[data-settings-tab="apocalypse"]').click();
    await room.host.locator('#lobbyApocalypseSelectionMode').selectOption('Specific');
    await room.host.locator('#lobbyApocalypseInteractiveFilter').selectOption('true');
    await room.host.locator('#lobbyApocalypseSearch').fill('reverse_aging');
    await room.host.locator('.lobby-apocalypse-option[data-id="reverse_aging"]').click();
    await room.host.locator('#lobbyActivationPolicyMode').selectOption('Custom');
    await room.host.locator('#lobbyActivationTrigger').selectOption('GameStart');
    await room.host.locator('#lobbySettingsApply').click();
    await expect(room.host.locator('#lobbySettingsFeedback')).toContainText(/застосовано|saved|applied|сохран|примен/i, { timeout: 15000 });
    if (await details.evaluate(element => element.open)) await details.locator('summary').click();

    await room.host.locator('#lobbyReadyButton').click();
    await room.guest.locator('#lobbyReadyButton').click();
    await room.host.locator('#lobbyStartPreviewButton').click();
    await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
    const warning = room.host.locator('#guestAccountWarningModal');
    if (await warning.isVisible()) await room.host.locator('#guestWarningContinueButton').click();
    await room.host.locator('#startGameBtn').click();

    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#apocalypseEffectBanner')).toBeVisible();
    await expect(room.guest.locator('#apocalypseEffectBanner')).toBeVisible();
    await expect(room.host.locator('#myPlayerCards')).toContainText(/8\s*(років|years|лет)/i);

    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#myPlayerCards')).toContainText(/8\s*(років|years|лет)/i);
    await expect(room.host.locator('#apocalypseEffectBanner')).toBeHidden();
  } finally {
    await room.close();
  }
});
