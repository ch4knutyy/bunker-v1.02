const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

async function openSettings(page) {
  const details = page.locator('details#lobbySettingsHostEditor, details:has(#lobbySettingsHostEditor)').first();
  await expect(details).toBeVisible({ timeout: 15000 });
  if (!(await details.evaluate(element => element.open))) await details.locator(':scope > summary').click();
}

test('host selects a specific apocalypse and can disable its visual theme', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Apocalypse setup ${Date.now()}`);
  try {
    await openSettings(room.host);
    await room.host.locator('[data-settings-tab="apocalypse"]').click();
    const initialRevision = await room.host.evaluate(() => Number(lobbyState?.settingsRevision ?? lobbyState?.SettingsRevision ?? 0));

    await room.host.locator('#lobbyApocalypseSelectionMode').selectOption('RandomCategories');
    await expect(room.host.locator('#lobbyApocalypseCategoryChips .lobby-apocalypse-category-chip')).toHaveCount(10, { timeout: 15000 });
    await room.host.locator('#lobbyApocalypseCategoryChips .lobby-apocalypse-category-chip').first().click();
    await room.host.locator('#lobbyApocalypseSelectionMode').selectOption('CustomPool');
    await room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-option').first().click();
    await expect(room.host.locator('#lobbyApocalypseSelectedPool button')).toHaveCount(1);
    await room.host.locator('#lobbyApocalypseSelectionMode').selectOption('Specific');

    const expectedCategoryOrder = await room.host.evaluate(() =>
      (lobbyApocalypseCatalog?.categories || lobbyApocalypseCatalog?.Categories || []).map(category => category.id || category.Id));
    await expect(room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-category-group')).toHaveCount(10);
    const actualCategoryOrder = await room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-category-group').evaluateAll(groups => groups.map(group => group.dataset.categoryId));
    expect(actualCategoryOrder).toEqual(expectedCategoryOrder);
    const totalCount = await room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-category-group').evaluateAll(groups => groups.reduce((sum, group) => sum + Number(group.dataset.totalCount), 0));
    expect(totalCount).toBe(220);

    const options = room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-option');
    await expect(options.first()).toBeVisible({ timeout: 15000 });
    const selectedTitle = (await options.first().locator('strong').textContent()).trim();
    await room.host.locator('#lobbyApocalypseSearch').fill(selectedTitle.slice(0, 8));
    await expect(options.first().locator('strong')).toContainText(selectedTitle.slice(0, 8));
    await options.first().click();
    await expect(options.first()).toHaveClass(/selected/);
    const selectedId = await options.first().getAttribute('data-id');
    const selectedGroup = options.first().locator('xpath=ancestor::*[contains(@class,"lobby-apocalypse-category-group")]');
    await selectedGroup.locator('.lobby-apocalypse-category-header').click();
    await expect(selectedGroup.locator('.lobby-apocalypse-category-header')).toHaveAttribute('aria-expanded', 'false');
    expect(await room.host.evaluate(() => lobbySettingsDraft.selectedApocalypseId)).toBe(selectedId);
    await selectedGroup.locator('.lobby-apocalypse-category-header').click();
    await expect(room.host.locator(`.lobby-apocalypse-option[data-id="${selectedId}"]`)).toHaveClass(/selected/);
    await expect(room.host.locator('#lobbyInteractiveApocalypseChance')).toBeDisabled();
    await room.host.locator('#lobbyApocalypseThemeEnabled').uncheck();

    await room.host.locator('#lobbySettingsHostEditor > summary').click();
    await room.host.locator('#lobbyReadyButton').click();
    await room.guest.locator('#lobbyReadyButton').click();
    await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
    await openSettings(room.host);
    await room.host.locator('#lobbySettingsApply').click();
    await expect(room.host.locator('#lobbySettingsFeedback')).toContainText(/застосовано|applied|применены/i, { timeout: 15000 });
    await expect.poll(() => room.host.evaluate(() => Number(lobbyState?.settingsRevision ?? lobbyState?.SettingsRevision ?? 0))).toBeGreaterThan(initialRevision);
    await expect(room.host.locator('#lobbySummary')).toContainText(/0 (із|of|из) 2/, { timeout: 15000 });
    await expect(room.guest.locator('#lobbySettingsReadOnly')).not.toContainText(selectedTitle);
    await room.host.locator('#lobbySettingsHostEditor > summary').click();

    await room.host.locator('#lobbyReadyButton').click();
    await room.guest.locator('#lobbyReadyButton').click();
    await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
    await room.host.locator('#lobbyStartPreviewButton').click();
    await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
    const guestWarning = room.host.locator('#guestAccountWarningModal');
    if (await guestWarning.isVisible()) await room.host.locator('#guestWarningContinueButton').click();
    await room.host.locator('#startGameBtn').click();

    for (const page of [room.host, room.guest]) {
      await expect(page.locator('#gameSection')).toBeVisible({ timeout: 15000 });
      await expect(page.locator('.apocalypse-title')).toHaveText(selectedTitle);
      await expect(page.locator('body')).not.toHaveAttribute('data-apocalypse-theme', /.+/);
      await expect(page.locator('body')).not.toHaveAttribute('data-apocalypse-category', /.+/);
    }
    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('.apocalypse-title')).toHaveText(selectedTitle);
    await expect(room.host.locator('body')).not.toHaveAttribute('data-apocalypse-theme', /.+/);
  } finally {
    await room.close();
  }
});

test('custom pool keeps cross-category selections through search and collapse', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Grouped pool ${Date.now()}`);
  try {
    await openSettings(room.host);
    await room.host.locator('[data-settings-tab="apocalypse"]').click();
    await room.host.locator('#lobbyApocalypseSelectionMode').selectOption('CustomPool');
    const groups = room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-category-group:has(.lobby-apocalypse-option)');
    await expect(groups.first()).toBeVisible({ timeout: 15000 });
    const candidates = await groups.evaluateAll(nodes => nodes.slice(0, 2).map(node => ({ category: node.dataset.categoryId, id: node.querySelector('.lobby-apocalypse-option')?.dataset.id, title: node.querySelector('.lobby-apocalypse-option strong')?.textContent })));
    expect(candidates).toHaveLength(2);
    expect(candidates[0].category).not.toBe(candidates[1].category);
    for (const candidate of candidates) await room.host.locator(`.lobby-apocalypse-option[data-id="${candidate.id}"]`).click();
    await expect(room.host.locator('#lobbyApocalypseSelectedPool button')).toHaveCount(2);
    await room.host.locator('#lobbyApocalypseSearch').fill(candidates[0].title.slice(0, 8));
    await expect(room.host.locator('#lobbyApocalypseSelectedPool button')).toHaveCount(2);
    expect(await room.host.locator('#lobbyApocalypseResults .lobby-apocalypse-category-group').evaluateAll(nodes => nodes.reduce((sum, node) => sum + Number(node.dataset.selectedCount), 0))).toBe(2);
    const selectedGroup = room.host.locator(`.lobby-apocalypse-category-group[data-category-id="${candidates[1].category}"]`);
    await selectedGroup.locator('.lobby-apocalypse-category-header').click();
    expect(await room.host.evaluate(() => lobbySettingsDraft.apocalypseCustomPoolIds.length)).toBe(2);
  } finally {
    await room.close();
  }
});
