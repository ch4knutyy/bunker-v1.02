const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

async function generateRareThreat(page, wantedId) {
  await page.evaluate(() => { window.confirm = () => true; });
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const before = await page.evaluate(() => gmThreatControlData.auditLog?.length || 0);
    await page.evaluate(() => gmGenerateRareThreat());
    await expect.poll(() => page.evaluate(() => gmThreatCommandPending)).toBe(false);
    await expect.poll(() => page.evaluate(() => gmThreatControlData.auditLog?.length || 0)).toBeGreaterThan(before);
    const id = await page.evaluate(() => gmThreatControlData.currentThreat?.id || gmThreatControlData.currentThreat?.Id || '');
    if (id === wantedId) return;
  }
  throw new Error(`Could not generate ${wantedId}`);
}

async function startRoomGame(room) {
  await expect(room.host.locator('#lobbyReadyButton')).toBeEnabled({ timeout: 15000 });
  await room.host.locator('#lobbyReadyButton').click();
  await room.guest.locator('#lobbyReadyButton').click();
  await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
  await room.host.locator('#lobbyStartPreviewButton').click();
  await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i, { timeout: 15000 });
  await expect(room.host.locator('#startGameBtn')).toBeEnabled({ timeout: 15000 });
  await room.host.locator('#startGameBtn').click();
  await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
}

test('ordinary threat moves from private sealed shell to one live persistent incident card', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Threat UI ${Date.now()}`);
  try {
    await startRoomGame(room);
    const sealed = room.host.locator('#threatPanel .threat-scenario-shell.is-sealed');
    await expect(sealed).toBeVisible();
    await expect(sealed).toContainText(/Невідомо|Unknown|Неизвестно/);
    await expect(room.host.locator('#threatPanel [class*="variant-"]')).toHaveCount(0);
    await expect(room.host.locator('#threatPanel img')).toHaveCount(0);

    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="threat"]').click();
    await room.host.evaluate(() => gmGenerateTextThreat());
    await expect.poll(() => room.host.evaluate(() => gmThreatCommandPending)).toBe(false);
    await expect(room.host.locator('#threatPanel .threat-scenario-shell:not(.is-sealed)')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#threatPanel .threat-title')).not.toHaveText(/Невідомо|Unknown|Неизвестно/);
    await expect(room.host.locator('#threatPanel .threat-interactive-zone')).toHaveCount(0);
    await expect(room.host.locator('#threatPanel .threat-scenario-shell')).toHaveCount(1);

    await room.host.reload();
    await expect(room.host.locator('#threatPanel .threat-scenario-shell:not(.is-sealed)')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#threatPanel .threat-scenario-shell')).toHaveCount(1);
  } finally {
    await room.close();
  }
});

test('radiation and air-filter render inside the shared interactive zone with existing controls', async ({ browser }) => {
  test.setTimeout(90000);
  const room = await createTwoPlayerRoom(browser, `Threat Interactive UI ${Date.now()}`);
  try {
    await startRoomGame(room);
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="threat"]').click();

    await generateRareThreat(room.host, 'radiation_leak');
    await expect(room.host.locator('#threatPanel .variant-radiation .threat-interactive-zone')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#threatPanel button[onclick="openThreatOperationModal()"]')).toBeVisible();
    await expect(room.guest.locator('#threatPanel .variant-radiation')).toBeVisible({ timeout: 15000 });

    await generateRareThreat(room.host, 'air_filter_failure');
    await expect(room.host.locator('#threatPanel .variant-air .threat-interactive-zone')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#threatPanel .plan-choice-panel')).toBeVisible();
    await expect(room.host.locator('#threatPanel .plan-choice-card')).toHaveCount(3);
    await expect(room.host.locator('#threatPanel .threat-scenario-shell')).toHaveCount(1);
  } finally {
    await room.close();
  }
});

test('mobile threat card has no horizontal overflow and keeps controls touch-sized', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Threat Mobile ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 390, height: 844 });
    await room.guest.setViewportSize({ width: 390, height: 844 });
    await startRoomGame(room);
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="threat"]').click();
    await room.host.evaluate(() => gmGenerateTextThreat());
    await expect(room.host.locator('#threatPanel .threat-scenario-shell:not(.is-sealed)')).toBeVisible({ timeout: 15000 });
    await room.host.evaluate(() => { document.getElementById('gmPanel').style.display = 'none'; });
    expect(await room.host.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const controls = room.host.locator('#threatPanel button:visible');
    for (let index = 0; index < await controls.count(); index += 1) {
      expect((await controls.nth(index).boundingBox())?.height || 0).toBeGreaterThanOrEqual(44);
    }
  } finally {
    await room.close();
  }
});
