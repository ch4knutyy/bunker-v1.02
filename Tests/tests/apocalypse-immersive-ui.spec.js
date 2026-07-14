const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom, createRoom, joinRoom } = require('./game-test-helpers');

async function startRoom(room) {
  await room.host.locator('#lobbyReadyButton').click();
  await room.guest.locator('#lobbyReadyButton').click();
  await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
  await room.host.locator('#lobbyStartPreviewButton').click();
  await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
  await room.host.locator('#startGameBtn').click();
  await expect(room.host.locator('#apocalypseContent .apocalypse-scenario-shell')).toHaveCount(1, { timeout: 15000 });
}

function fixture(name = 'Контрольований атмосферний сценарій') {
  return {
    id: 'frontend-only-apocalypse-fixture',
    name,
    shortDescription: 'Небо затягнуте попелом, а вцілілі повинні діяти без зволікань.',
    description: 'Повний опис сценарію для перевірки футера.',
    severity: 'extreme',
    survivalChance: 17,
    duration: '30 років',
    threats: ['Радіаційне зараження', 'Довгий текст загрози, який має переноситися без горизонтального переповнення навіть на вузькому екрані.'],
    requirements: ['Герметичне укриття', 'Запас чистої води'],
    consequences: ['Зруйнована інфраструктура', 'Тривала ядерна зима'],
    tags: ['radiation', 'structural_damage'],
    imageUrl: '/uploads/apocalypses/alien_terraforming.png'
  };
}

test('desktop renders immediately, survives reconnect and live event replaces rather than duplicates', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Apocalypse desktop ${Date.now()}`);
  try {
    await startRoom(room);
    const shell = room.host.locator('#apocalypseContent .apocalypse-scenario-shell');
    await expect(shell.locator('.apocalypse-hero')).toBeVisible();
    await expect(shell.locator('.apocalypse-title')).not.toBeEmpty();
    await expect(shell.locator('.apocalypse-subtitle')).not.toBeEmpty();
    await expect(shell.locator('.apocalypse-metric')).toHaveCount(3);
    await expect(shell.locator('.content-threats')).toBeVisible();
    await expect(shell.locator('.content-requirements')).toBeVisible();
    await expect(shell).toHaveClass(/variant-(nuclear|biological|climate|cosmic|ai|alien|fungal|zombie|mystical|anomaly|collapse|generic)/);
    const originalTitle = await shell.locator('.apocalypse-title').textContent();

    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#apocalypseContent .apocalypse-scenario-shell')).toHaveCount(1, { timeout: 15000 });
    await expect(room.host.locator('.apocalypse-title')).toHaveText(originalTitle);

    await room.host.evaluate(nextScenario => {
      // Apply the same current-snapshot + renderer pair used by ApocalypseChanged.
      currentApocalypse = nextScenario;
      renderApocalypse(currentApocalypse);
    }, fixture());
    await expect(room.host.locator('#apocalypseContent .apocalypse-scenario-shell')).toHaveCount(1);
    await expect(room.host.locator('.apocalypse-title')).toHaveText('Контрольований атмосферний сценарій');
    await expect(room.host.locator('.apocalypse-metric')).toHaveCount(3);
    await expect(room.host.locator('.content-threats')).toBeVisible();
    await expect(room.host.locator('.content-requirements')).toBeVisible();
    await expect(room.host.locator('.content-consequences')).toBeVisible();
    await expect(room.host.locator('.apocalypse-scenario-shell')).toHaveClass(/variant-nuclear/);
    const heroImage = room.host.locator('.apocalypse-hero-media .apocalypse-hero-image');
    await expect(heroImage).toBeVisible();
    await expect.poll(() => heroImage.evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await room.host.locator('.apocalypse-hero-pattern').evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThanOrEqual(.04);
    const medallion = room.host.locator('.apocalypse-theme-mark');
    await expect(medallion).toBeVisible();
    await expect(medallion).toHaveAttribute('aria-hidden', 'true');
    expect(await room.host.locator('.apocalypse-hero').evaluate(hero => {
      const title = hero.querySelector('.apocalypse-title').getBoundingClientRect();
      const mark = hero.querySelector('.apocalypse-theme-mark').getBoundingClientRect();
      return title.right <= mark.left || title.left >= mark.right || title.bottom <= mark.top || title.top >= mark.bottom;
    })).toBe(true);
    expect(await room.host.locator('.apocalypse-hero').evaluate(hero => {
      const media = hero.querySelector('.apocalypse-hero-media');
      const overlay = hero.querySelector('.apocalypse-hero-overlay');
      const pattern = hero.querySelector('.apocalypse-hero-pattern');
      const content = hero.querySelector('.apocalypse-hero-content');
      return Number(getComputedStyle(media).zIndex) < Number(getComputedStyle(overlay).zIndex)
        && Number(getComputedStyle(overlay).zIndex) < Number(getComputedStyle(pattern).zIndex)
        && Number(getComputedStyle(pattern).zIndex) < Number(getComputedStyle(content).zIndex);
    })).toBe(true);

    await room.host.evaluate(() => renderCurrentGameUI());
    await expect(room.host.locator('.apocalypse-hero-image')).toBeVisible();
    await expect.poll(() => room.host.locator('.apocalypse-hero-image').evaluate(image => image.naturalWidth > 0)).toBe(true);
    await room.host.evaluate(() => {
      currentApocalypse = { ...currentApocalypse, imageUrl: '/uploads/apocalypses/bioterrorism_plague.png' };
      renderApocalypse(currentApocalypse);
    });
    await expect(room.host.locator('.apocalypse-hero-image')).toHaveAttribute('src', '/uploads/apocalypses/bioterrorism_plague.png');
    await expect.poll(() => room.host.locator('.apocalypse-hero-image').evaluate(image => image.naturalWidth > 0)).toBe(true);

    await room.host.evaluate(() => { setCurrentLanguage('en'); renderCurrentGameUI(); });
    await expect(room.host.locator('.apocalypse-badge')).toHaveText('Apocalypse');
    await expect(room.host.locator('.apocalypse-metric-label').first()).toHaveText('Danger');
    await expect(room.host.locator('.content-threats .apocalypse-content-title')).toContainText('Main threats');
    await room.host.evaluate(() => { setCurrentLanguage('uk'); renderCurrentGameUI(); });
  } finally {
    await room.close();
  }
});

test('desktop no-image and broken-image apocalypse retain the restrained atmospheric fallback', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Apocalypse fallback ${Date.now()}`);
  try {
    await startRoom(room);
    await room.host.evaluate(nextScenario => { currentApocalypse = nextScenario; renderApocalypse(currentApocalypse); }, { ...fixture(), imageUrl:'' });
    const hero = room.host.locator('.apocalypse-hero');
    await expect(hero).toHaveClass(/no-image/);
    await expect(hero.locator('.apocalypse-hero-media')).toHaveCount(0);
    expect(await hero.locator('.apocalypse-hero-pattern').evaluate(element => Number(getComputedStyle(element).opacity))).toBe(.14);
    await expect(hero.locator('.apocalypse-theme-mark')).toBeVisible();

    await room.host.evaluate(nextScenario => { currentApocalypse = nextScenario; renderApocalypse(currentApocalypse); }, { ...fixture(), imageUrl:'/uploads/apocalypses/definitely-missing-image.png' });
    await expect(hero).toHaveClass(/no-image/);
    await expect(hero.locator('.apocalypse-hero-media')).toHaveCount(0);
    expect(await hero.locator('.apocalypse-hero-pattern').evaluate(element => Number(getComputedStyle(element).opacity))).toBe(.14);
  } finally {
    await room.close();
  }
});

test('mobile scenario stays one-column, readable and free of horizontal overflow', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    const roomName = `Apocalypse mobile ${Date.now()}`;
    await createRoom(host, 'P1', roomName, { maxPlayers: 6 });
    await joinRoom(guest, 'P2', roomName);
    await startRoom({ host, guest });
    await host.evaluate(nextScenario => { currentApocalypse = nextScenario; renderApocalypse(currentApocalypse); }, fixture('Надзвичайно довга назва апокаліптичного сценарію, що переноситься на кілька рядків'));

    const shell = host.locator('#apocalypseContent .apocalypse-scenario-shell');
    await expect(shell).toBeVisible();
    await expect(shell.locator('.apocalypse-title')).toBeVisible();
    await expect(shell.locator('.apocalypse-hero-image')).toBeVisible();
    await expect.poll(() => shell.locator('.apocalypse-hero-image').evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
    expect(await shell.locator('.apocalypse-hero-pattern').evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThanOrEqual(.04);
    const medallionBox = await shell.locator('.apocalypse-theme-mark').boundingBox();
    expect(medallionBox.width).toBeGreaterThanOrEqual(56);
    expect(medallionBox.width).toBeLessThanOrEqual(72);
    await expect(shell.locator('.apocalypse-metric')).toHaveCount(3);
    await expect(shell.locator('.apocalypse-content-card')).toHaveCount(3);
    const columns = await shell.locator('.apocalypse-content-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(1);
    const shellBox = await shell.boundingBox();
    const contentBox = await host.locator('#apocalypseContent').boundingBox();
    expect(shellBox.width).toBeLessThanOrEqual(contentBox.width + 1);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await shell.locator('.apocalypse-title').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
