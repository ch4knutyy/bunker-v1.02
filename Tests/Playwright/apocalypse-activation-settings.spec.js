const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

async function openSettings(page) {
  const details = page.locator('details#lobbySettingsHostEditor, details:has(#lobbySettingsHostEditor)').first();
  await expect(details).toBeVisible({ timeout: 15000 });
  if (!(await details.evaluate(element => element.open))) await details.locator('summary').click();
}

test('custom activation is canonical, public-safe and stable across rejoin', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Activation setup ${Date.now()}`);
  try {
    await openSettings(room.host);
    await room.host.locator('[data-settings-tab="apocalypse"]').click();
    await room.host.locator('#lobbyApocalypseSelectionMode').selectOption('Specific');
    await expect(room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-option').first()).toBeVisible({ timeout: 15000 });

    await room.host.locator('#lobbyApocalypseInteractiveFilter').selectOption('false');
    await room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-option').first().click();
    await expect(room.host.locator('#lobbyActivationEffectsEnabled')).toBeDisabled();
    await expect(room.host.locator('#lobbyActivationUnavailable')).toContainText(/не має|no interactive|не имеет/i);

    await room.host.locator('#lobbyApocalypseInteractiveFilter').selectOption('true');
    const interactiveOption = room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-option').first();
    await interactiveOption.click();
    await expect(room.host.locator('#lobbyActivationEffectsEnabled')).toBeEnabled();
    await room.host.locator('#lobbyActivationPolicyMode').selectOption('Custom');
    await room.host.locator('#lobbyActivationScheduleMode').selectOption('Recurring');
    await room.host.locator('#lobbyActivationTrigger').selectOption('AfterVoting');
    await room.host.locator('#lobbyActivationFirstRound').selectOption('3');
    await room.host.locator('#lobbyActivationIntervalRounds').selectOption('3');
    await room.host.locator('#lobbyActivationMaxActivations').selectOption('');
    await room.host.locator('#lobbyActivationEffectsEnabled').uncheck();
    await expect(room.host.locator('#lobbyActivationSummary')).toContainText(/без зміни|without changing|без изменения/i);

    const revision = await room.host.evaluate(() => Number(lobbyState?.settingsRevision ?? lobbyState?.SettingsRevision ?? 0));
    await room.host.locator('#lobbySettingsHostEditor > summary').click();
    await room.host.locator('#lobbyReadyButton').click(); await room.guest.locator('#lobbyReadyButton').click();
    await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
    await openSettings(room.host);
    await room.host.locator('#lobbySettingsApply').click();
    await expect.poll(() => room.host.evaluate(() => Number(lobbyState?.settingsRevision ?? lobbyState?.SettingsRevision ?? 0))).toBeGreaterThan(revision);
    await expect(room.host.locator('#lobbySummary')).toContainText(/0 (із|of|из) 2/, { timeout: 15000 });
    await expect(room.guest.locator('#lobbySettingsReadOnly')).toContainText(/Custom.*Recurring.*AfterVoting/i);
    await expect(room.guest.locator('#lobbySettingsReadOnly')).not.toContainText(/EffectProfileId|GameplaySchemaVersion|effects\s*:/i);
    await room.host.locator('#lobbySettingsHostEditor > summary').click();

    await room.host.locator('#lobbyReadyButton').click(); await room.guest.locator('#lobbyReadyButton').click();
    await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
    await room.host.locator('#lobbyStartPreviewButton').click();
    await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
    const warning = room.host.locator('#guestAccountWarningModal');
    if (await warning.isVisible()) await room.host.locator('#guestWarningContinueButton').click();
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    const beforeReload = await room.host.locator('#myPlayerCards').innerText();
    const policy = await room.host.evaluate(() => currentPublicGameSettings.apocalypseActivation);
    expect(policy).toEqual({ effectsEnabled: false, scheduleMode: 'recurring', trigger: 'after_voting', firstRound: 3, intervalRounds: 3, maxActivations: null });

    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    expect(await room.host.evaluate(() => currentPublicGameSettings.apocalypseActivation)).toEqual(policy);
    expect(await room.host.locator('#myPlayerCards').innerText()).toBe(beforeReload);
  } finally {
    await room.close();
  }
});
