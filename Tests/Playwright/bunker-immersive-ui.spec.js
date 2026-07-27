const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom, createRoom, joinRoom } = require('./game-test-helpers');

async function startRoom(room) {
  await room.host.locator('#lobbyReadyButton').click();
  await room.guest.locator('#lobbyReadyButton').click();
  await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
  await room.host.locator('#lobbyStartPreviewButton').click();
  await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
  const guestWarning = room.host.locator('#guestAccountWarningModal');
  if (await guestWarning.isVisible()) await room.host.locator('#guestWarningContinueButton').click();
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

function apocalypseFixture(id) {
  return {
    id,
    name: id,
    severity: 'critical',
    survivalChance: 12,
    duration: 'Невідомо',
    threats: ['Зовнішня загроза'],
    requirements: ['Герметизація'],
    tags: []
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

test('bunker composition is deterministic, survives refresh and keeps controls functional', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Bunker theme ${Date.now()}`);
  const errors = [];
  room.host.on('pageerror', error => errors.push(error.message));
  try {
    await startRoom(room);
    await room.host.waitForFunction(() =>
      visualThemeRegistryState.loaded &&
      visualThemeRegistryState.bunkerById.size === 205 &&
      visualThemeRegistryState.apocalypseById.size === 220);
    const initial = await room.host.evaluate(() => ({
      bunkerId: currentBunker?.id || currentBunker?.Id,
      archetype: document.body.dataset.bunkerArchetype,
      signature: [
        document.body.dataset.bunkerArchetype,
        document.body.dataset.bunkerCondition,
        document.body.dataset.bunkerMaterial,
        document.body.dataset.bunkerCleanliness,
        document.body.dataset.bunkerTechnology,
        document.body.dataset.bunkerAtmosphere,
        document.body.dataset.bunkerVariation
      ].join('|')
    }));
    expect(initial.bunkerId).toBeTruthy();
    expect(initial.archetype).toMatch(/^(medical|military|industrial|dirty|scientific|nuclear|government|luxury|civilian|improvised|underground-city|mine|submarine|prison|religious|agricultural|cryogenic|abandoned)$/);

    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect.poll(() => room.host.evaluate(() => [
      document.body.dataset.bunkerArchetype,
      document.body.dataset.bunkerCondition,
      document.body.dataset.bunkerMaterial,
      document.body.dataset.bunkerCleanliness,
      document.body.dataset.bunkerTechnology,
      document.body.dataset.bunkerAtmosphere,
      document.body.dataset.bunkerVariation
    ].join('|'))).toBe(initial.signature);

    const medical = { ...fixture('Медичний карантинний комплекс'), id:'hospital_bunker' };
    await room.host.evaluate(({ bunker, apocalypse }) => {
      currentBunker = bunker;
      currentApocalypse = apocalypse;
      renderBunker(currentBunker);
      renderApocalypse(currentApocalypse);
    }, { bunker:medical, apocalypse:apocalypseFixture('pandemic_super_virus') });
    await expect(room.host.locator('body')).toHaveAttribute('data-bunker-archetype', 'medical');
    await expect(room.host.locator('body')).toHaveAttribute('data-bunker-family', 'clinical_technical');
    await expect(room.host.locator('body')).toHaveAttribute('data-apocalypse-archetype', 'infection_quarantine');
    await expect(room.host.locator('body')).toHaveAttribute('data-apocalypse-family', 'biological');
    const medicalMaterial = await room.host.evaluate(() => {
      const style = element => getComputedStyle(document.querySelector(element));
      return {
        button: style('[data-player-view="single"]').backgroundImage,
        card: style('.vault-characteristic-card').backgroundImage,
        table: style('.special-cards-table').backgroundColor,
        overviewChannels: style('.player-overview-shell').backgroundColor.match(/\d+/g).slice(0, 3).map(Number)
      };
    });
    expect(Math.max(...medicalMaterial.overviewChannels)).toBeLessThan(120);

    const underground = { ...fixture('Підземне місто'), id:'underground_city' };
    await room.host.evaluate(({ bunker, apocalypse }) => {
      currentBunker = bunker;
      currentApocalypse = apocalypse;
      renderBunker(currentBunker);
      renderApocalypse(currentApocalypse);
    }, { bunker:underground, apocalypse:apocalypseFixture('anti_matter_leak') });
    await expect(room.host.locator('body')).toHaveAttribute('data-bunker-archetype', 'underground-city');
    await expect(room.host.locator('body')).toHaveAttribute('data-apocalypse-archetype', 'celestial_anomaly');
    const undergroundMaterial = await room.host.evaluate(() => {
      const style = element => getComputedStyle(document.querySelector(element));
      return {
        button: style('[data-player-view="single"]').backgroundImage,
        card: style('.vault-characteristic-card').backgroundImage,
        table: style('.special-cards-table').backgroundColor
      };
    });
    expect(undergroundMaterial.button).not.toBe(medicalMaterial.button);
    expect(undergroundMaterial.card).not.toBe(medicalMaterial.card);
    expect(undergroundMaterial.table).not.toBe('');

    await room.host.locator('[data-player-view="single"]').click();
    await expect(room.host.locator('#singlePlayerOverview')).toBeVisible();
    const profession = room.host.locator('[data-characteristic-type="Profession"]');
    await profession.locator('.vault-card-reveal').click();
    await expect(profession.locator('.status-revealed')).toBeVisible({ timeout: 15000 });
    expect(errors).toEqual([]);
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
