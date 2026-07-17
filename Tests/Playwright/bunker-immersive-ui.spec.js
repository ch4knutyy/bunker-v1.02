const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom, createRoom, joinRoom } = require('./game-test-helpers');

async function startRoom(room) {
  await room.host.locator('#lobbyReadyButton').click();
  await room.guest.locator('#lobbyReadyButton').click();
  await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
  await room.host.locator('#lobbyStartPreviewButton').click();
  await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
  await room.host.locator('#startGameBtn').click();
  await expect(room.host.locator('#bunkerContent .bunker-facility-shell')).toHaveCount(1, { timeout: 15000 });
}

function fixture(name = 'Військовий командний комплекс') {
  return {
    id: 'frontend-only-bunker-fixture',
    name,
    shortDescription: 'Засекречене автономне укриття з посиленим захисним контуром.',
    description: 'Повний технічний опис укриття.',
    capacity: 4,
    condition: 'fair',
    suppliesMonths: 18,
    location: 'Гірський масив, підземний рівень із дуже довгим описом координат та шляхів евакуації',
    facilities: ['Командний центр', 'Герметичний шлюз', 'Довга назва технічного приміщення, що повинна переноситися без переповнення'],
    resources: ['Резервний генератор', 'Запас питної води'],
    problems: ['Пошкоджена зовнішня антена', 'Обмежений доступ до вентиляційного вузла'],
    bunkerTags: ['military', 'mountain_location', 'security_system'],
    imageUrl: '/uploads/bunkers/harbor_fortress_bunker.png'
  };
}

test('desktop facility renders, capacity updates live and current snapshot rerenders without duplication', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Bunker facility ${Date.now()}`);
  try {
    await startRoom(room);
    const shell = room.host.locator('#bunkerContent .bunker-facility-shell');
    await expect(shell.locator('.bunker-title')).not.toBeEmpty();
    await expect(shell.locator('.bunker-subtitle')).not.toBeEmpty();
    await expect(shell.locator('.bunker-metric')).toHaveCount(4);
    await expect(shell.locator('.content-rooms')).toBeVisible();
    await expect(shell.locator('.content-resources')).toBeVisible();
    await expect(shell.locator('.content-problems')).toBeVisible();
    await expect(shell).toHaveClass(/variant-(military|industrial|underground|scientific|medical|civilian|luxury|emergency|natural|remote|damaged|critical|generic)/);

    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="content"]').click();
    const input = room.host.locator('#gmBunkerCapacity');
    await input.fill('4');
    await input.press('Enter');
    await expect(input).toHaveValue('4');
    await expect(room.guest.locator('.bunker-metric.metric-capacity strong')).toHaveText('4', { timeout: 15000 });

    const serverTitle = await shell.locator('.bunker-title').textContent();
    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#bunkerContent .bunker-facility-shell')).toHaveCount(1, { timeout: 15000 });
    await expect(room.host.locator('.bunker-title')).toHaveText(serverTitle);
    await expect(room.host.locator('.bunker-metric.metric-capacity strong')).toHaveText('4');

    await room.host.evaluate(nextBunker => { currentBunker = nextBunker; renderBunker(currentBunker); }, fixture());
    await expect(room.host.locator('#bunkerContent .bunker-facility-shell')).toHaveCount(1);
    await expect(room.host.locator('.bunker-facility-shell')).toHaveClass(/variant-military/);
    await expect(room.host.locator('.bunker-facility-shell')).toHaveClass(/condition-warning-soft/);
    await expect(room.host.locator('.bunker-metric')).toHaveCount(4);
    await expect(room.host.locator('.bunker-content-card')).toHaveCount(3);
    const image = room.host.locator('.bunker-hero-image');
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    const medallion = room.host.locator('.bunker-status-medallion');
    await expect(medallion).toBeVisible();
    await expect(medallion).toHaveAttribute('aria-hidden', 'true');
    await expect(medallion).toHaveText('');
    expect(await room.host.locator('.bunker-hero-pattern').evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThanOrEqual(.04);
    expect(await room.host.locator('.bunker-hero').evaluate(hero => {
      const title = hero.querySelector('.bunker-title').getBoundingClientRect();
      const mark = hero.querySelector('.bunker-status-medallion').getBoundingClientRect();
      return title.right <= mark.left || title.left >= mark.right || title.bottom <= mark.top || title.top >= mark.bottom;
    })).toBe(true);

    await room.host.evaluate(() => renderCurrentGameUI());
    await expect(room.host.locator('#bunkerContent .bunker-facility-shell')).toHaveCount(1);
    await expect(room.host.locator('.bunker-hero-image')).toBeVisible();
    await room.host.evaluate(() => {
      currentBunker = { ...currentBunker, imageUrl:'/uploads/bunkers/sewage_treatment_plant.png', capacity:9 };
      renderBunker(currentBunker);
    });
    await expect(room.host.locator('.bunker-hero-image')).toHaveAttribute('src', '/uploads/bunkers/sewage_treatment_plant.png');
    await expect.poll(() => room.host.locator('.bunker-hero-image').evaluate(element => element.naturalWidth > 0)).toBe(true);
    await expect(room.host.locator('.bunker-metric.metric-capacity strong')).toHaveText('9');

    await room.host.evaluate(() => { setCurrentLanguage('en'); renderCurrentGameUI(); });
    await expect(room.host.locator('.bunker-badge')).toHaveText('Bunker');
    await expect(room.host.locator('.bunker-metric-label').first()).toHaveText('Capacity');
    await expect(room.host.locator('.content-rooms .bunker-content-title')).toContainText('Rooms');
    await room.host.evaluate(() => { setCurrentLanguage('uk'); renderCurrentGameUI(); });
  } finally {
    await room.close();
  }
});

test('desktop no-image and broken-image states retain a restrained fallback pattern', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Bunker fallback ${Date.now()}`);
  try {
    await startRoom(room);
    await room.host.evaluate(nextBunker => { currentBunker = nextBunker; renderBunker(currentBunker); }, { ...fixture(), imageUrl:'' });
    const hero = room.host.locator('.bunker-hero');
    await expect(hero).toHaveClass(/no-image/);
    await expect(hero.locator('.bunker-hero-media')).toHaveCount(0);
    const fallbackOpacity = await hero.locator('.bunker-hero-pattern').evaluate(element => Number(getComputedStyle(element).opacity));
    expect(fallbackOpacity).toBeGreaterThanOrEqual(.1);
    expect(fallbackOpacity).toBeLessThanOrEqual(.18);
    await expect(hero.locator('.bunker-status-medallion')).toBeVisible();

    await room.host.evaluate(nextBunker => { currentBunker = nextBunker; renderBunker(currentBunker); }, { ...fixture(), imageUrl:'/uploads/bunkers/definitely-missing-image.png' });
    await expect(hero).toHaveClass(/no-image/);
    await expect(hero.locator('.bunker-hero-media')).toHaveCount(0);
    expect(await hero.locator('.bunker-hero-pattern').evaluate(element => Number(getComputedStyle(element).opacity))).toBe(.14);
  } finally {
    await room.close();
  }
});

test('mobile facility keeps image, long content, metrics and footer inside viewport', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true, ignoreHTTPSErrors:true });
  const guestContext = await browser.newContext({ viewport:{ width:390, height:844 }, hasTouch:true, isMobile:true, ignoreHTTPSErrors:true });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  try {
    const roomName = `Bunker mobile ${Date.now()}`;
    await createRoom(host, 'P1', roomName, { maxPlayers:6 });
    await joinRoom(guest, 'P2', roomName);
    await startRoom({ host, guest });
    await host.evaluate(nextBunker => { currentBunker = nextBunker; renderBunker(currentBunker); }, fixture('Надзвичайно довга назва автономного підземного військового укриття'));

    const shell = host.locator('#bunkerContent .bunker-facility-shell');
    await expect(shell.locator('.bunker-title')).toBeVisible();
    await expect(shell.locator('.bunker-hero-image')).toBeVisible();
    await expect.poll(() => shell.locator('.bunker-hero-image').evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    expect(await shell.locator('.bunker-hero-pattern').evaluate(element => Number(getComputedStyle(element).opacity))).toBeLessThanOrEqual(.04);
    const medallionBox = await shell.locator('.bunker-status-medallion').boundingBox();
    expect(medallionBox.width).toBeGreaterThanOrEqual(56);
    expect(medallionBox.width).toBeLessThanOrEqual(72);
    await expect(shell.locator('.bunker-metric')).toHaveCount(4);
    await expect(shell.locator('.bunker-content-card')).toHaveCount(3);
    await expect(shell.locator('.bunker-footer')).toBeVisible();
    const columns = await shell.locator('.bunker-content-grid').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
    expect(columns).toBe(1);
    const shellBox = await shell.boundingBox();
    const contentBox = await host.locator('#bunkerContent').boundingBox();
    expect(shellBox.width).toBeLessThanOrEqual(contentBox.width + 1);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await shell.locator('.bunker-title').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
  } finally {
    await guestContext.close();
    await hostContext.close();
  }
});
