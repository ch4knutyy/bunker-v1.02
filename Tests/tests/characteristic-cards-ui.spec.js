const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

async function startRoom(room) {
  await room.host.locator('#lobbyReadyButton').click();
  await room.guest.locator('#lobbyReadyButton').click();
  await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
  await room.host.locator('#lobbyStartPreviewButton').click();
  await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
  await room.host.locator('#startGameBtn').click();
  await expect(room.host.locator('#myPlayerCards .vault-characteristic-card')).toHaveCount(10, { timeout: 15000 });
  await expect(room.guest.locator('#myPlayerCards .vault-characteristic-card')).toHaveCount(10, { timeout: 15000 });
}

test('desktop cards render, reveal live and survive reconnect', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Cards desktop ${Date.now()}`);
  try {
    await startRoom(room);
    const profession = room.host.locator('[data-characteristic-type="Profession"]');
    await expect(profession.locator('.vault-card-icon svg')).toBeVisible();
    await expect(profession.locator('.vault-card-category')).toContainText(/Професія|Profession|Профессия/);
    await expect(profession.locator('.vault-card-value')).not.toBeEmpty();
    await expect(profession.locator('.vault-card-details')).toBeVisible();
    await room.host.evaluate(() => {
      myPlayerData.profession = { ...myPlayerData.profession, capabilityTags: [], tags: [], severityCode: null, severityLevel: null };
      myPlayerData.physicalHealth = { ...myPlayerData.physicalHealth, name: 'Променева хвороба', baseName: 'Променева хвороба', severityCode: 'hard', allowsSeverity: true, description: 'Сильне ураження організму.', localization: null, _i18n: null };
      myPlayerData.mentalHealth = { ...myPlayerData.mentalHealth, name: 'Піроманія', baseName: 'Піроманія', severityCode: 'hard', allowsSeverity: true, description: 'Небезпечний розлад контролю імпульсів.', localization: null, _i18n: null };
      myPlayerData.characterTrait = { ...myPlayerData.characterTrait, name: 'Темна риса', tags: ['dark'], description: 'Схильність до небезпечних рішень.', localization: null, _i18n: null };
      myPlayerData.hobby = { ...myPlayerData.hobby, name: 'Гончарство', tags: ['critical'], experienceYears: 6, item: 'Гончарний круг', relatedItem: 'Гончарний круг', bonus: '', tooltip: '', description: '', localization: null, _i18n: null };
      renderMyPlayerCards(myPlayerData);
      renderMyPlayerCards(myPlayerData);
    });
    await expect(profession).toHaveClass(/variant-neutral/);
    await expect(room.host.locator('[data-characteristic-type="PhysicalHealth"]')).toHaveClass(/family-medical.*variant-severe|variant-severe.*family-medical/);
    await expect(room.host.locator('[data-characteristic-type="MentalHealth"]')).toHaveClass(/family-mental.*variant-severe|variant-severe.*family-mental/);
    await expect(room.host.locator('[data-characteristic-type="MentalHealth"] .vault-card-value')).toHaveText('Піроманія');
    await expect(room.host.locator('[data-characteristic-type="MentalHealth"] .vault-card-details')).toContainText(/важка|severe|тяжёлая/i);
    await expect(room.host.locator('[data-characteristic-type="CharacterTrait"]')).toHaveClass(/variant-dark/);
    await expect(room.host.locator('[data-characteristic-type="Hobby"]')).toHaveClass(/variant-critical/);
    await expect(room.host.locator('[data-characteristic-type="Hobby"] .vault-card-detail')).toHaveCount(2);
    await expect(room.host.locator('[data-characteristic-type="Hobby"] .vault-card-details')).toContainText('6 років');
    await expect(room.host.locator('[data-characteristic-type="Hobby"] .vault-card-details')).toContainText('Гончарний круг');
    await expect(room.host.locator('[data-characteristic-type="Hobby"] .tooltip-trigger')).toHaveCount(0);
    await expect(room.guest.locator('#playersTableBody')).not.toContainText('Гончарний круг');
    await expect(room.host.locator('[data-characteristic-type="Personality"] .tooltip-trigger')).toHaveCount(0);
    const identityPatterns = await room.host.locator('#myPlayerCards .vault-characteristic-card').evaluateAll(cards => cards.map(card => ({
      type: card.dataset.characteristicType,
      pattern: getComputedStyle(card).getPropertyValue('--card-pattern').trim()
    })));
    expect(identityPatterns).toHaveLength(10);
    expect(new Set(identityPatterns.map(item => item.type)).size).toBe(10);
    expect(new Set(identityPatterns.map(item => item.pattern)).size).toBe(10);
    const palette = await room.host.evaluate(() => Object.fromEntries(['Profession','PhysicalHealth','MentalHealth','CharacterTrait','Hobby'].map(type => {
      const card = document.querySelector(`[data-characteristic-type="${type}"]`);
      const style = getComputedStyle(card);
      return [type, ['--card-surface','--card-border','--card-inner-border','--card-divider','--card-button-border','--card-medallion-border'].map(name => style.getPropertyValue(name).trim())];
    })));
    for (const values of Object.values(palette)) expect(values.every(Boolean)).toBe(true);
    expect(palette.PhysicalHealth).not.toEqual(palette.Profession);
    expect(palette.MentalHealth).not.toEqual(palette.PhysicalHealth);
    expect(palette.CharacterTrait).not.toEqual(palette.Profession);
    expect(palette.Hobby).not.toEqual(palette.CharacterTrait);
    const physicalCardBox = await room.host.locator('[data-characteristic-type="PhysicalHealth"]').boundingBox();
    const physicalTriggerBox = await room.host.locator('[data-characteristic-type="PhysicalHealth"] .tooltip-trigger').boundingBox();
    expect(Math.abs(physicalTriggerBox.y - physicalCardBox.y - 18)).toBeLessThanOrEqual(2);
    expect(Math.abs(physicalCardBox.x + physicalCardBox.width - physicalTriggerBox.x - physicalTriggerBox.width - 18)).toBeLessThanOrEqual(2);
    const firstRowHeights = await room.host.locator('#myPlayerCards .vault-characteristic-card').evaluateAll(cards => cards.slice(0, 3).map(card => card.getBoundingClientRect().height));
    expect(Math.max(...firstRowHeights) - Math.min(...firstRowHeights)).toBeLessThanOrEqual(1);
    await profession.locator('.vault-card-reveal').click();
    await expect(profession.locator('.status-revealed')).toContainText(/Розкрито|Revealed|Открыто/, { timeout: 15000 });
    const value = (await profession.locator('.vault-card-value').innerText()).trim();
    await expect(room.guest.locator('#playersTableBody')).toContainText(value, { timeout: 15000 });
    await room.host.reload();
    await expect(room.host.locator('[data-characteristic-type="Profession"] .status-revealed')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('[data-characteristic-type="Hobby"] .vault-card-detail')).toHaveCount(1);
    await expect(room.host.locator('[data-characteristic-type="Hobby"] .vault-card-details')).toContainText(/Додатково має|Also has|Дополнительно имеет/);
    await expect(room.host.locator('#gmPanelBtn')).toBeVisible();
    await expect(room.guest.locator('#gmPanelBtn')).toBeHidden();
  } finally { await room.close(); }
});

test('mobile cards are single-column, overflow-safe and tooltip toggles by tap', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  const helpers = require('./game-test-helpers');
  try {
    const roomName = `Cards mobile ${Date.now()}`;
    await helpers.createRoom(host, 'P1', roomName, { maxPlayers: 6 });
    await helpers.joinRoom(guest, 'P2', roomName);
    const room = { host, guest };
    await startRoom(room);
    await host.evaluate(() => {
      myPlayerData.hobby = { ...myPlayerData.hobby, experienceYears: 6, item: 'Дуже довга назва спеціального набору інструментів для гончарства', relatedItem: 'Дуже довга назва спеціального набору інструментів для гончарства', bonus: '', tooltip: '', description: '', localization: null, _i18n: null };
      renderMyPlayerCards(myPlayerData);
    });
    await expect(host.locator('[data-characteristic-type="Hobby"] .vault-card-detail')).toHaveCount(2);
    const first = host.locator('.vault-characteristic-card').first();
    const firstBox = await first.boundingBox();
    const secondBox = await host.locator('.vault-characteristic-card').nth(1).boundingBox();
    expect(secondBox.y).toBeGreaterThan(firstBox.y + firstBox.height - 2);
    const tooltipTrigger = host.locator('.vault-card-tooltip .tooltip-trigger').first();
    await tooltipTrigger.tap();
    await expect(host.locator('.tooltip-portal')).toBeVisible();
    await tooltipTrigger.tap();
    await expect(host.locator('.tooltip-portal')).toBeHidden();
    await tooltipTrigger.tap();
    await expect(host.locator('.tooltip-portal')).toBeVisible();
    await host.keyboard.press('Escape');
    await expect(host.locator('.tooltip-portal')).toBeHidden();
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const buttonBox = await first.locator('.vault-card-reveal').boundingBox();
    expect(buttonBox.width).toBeGreaterThan(firstBox.width * 0.8);
  } finally { await guestContext.close(); await hostContext.close(); }
});
