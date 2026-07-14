const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

async function startRoomGame(room) {
  await room.host.locator('#lobbyReadyButton').click();
  await room.guest.locator('#lobbyReadyButton').click();
  await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
  await room.host.locator('#lobbyStartPreviewButton').click();
  await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i, { timeout: 15000 });
  await room.host.locator('#startGameBtn').click();
  await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
}

async function renderFixtures(page, imageUrl) {
  await page.evaluate(url => {
    const threat = {
      name: 'Контрольована загроза', shortDescription: 'Текст поверх чистого зображення.',
      description: 'Опис інциденту.', severity: 'high', status: 'active', isRevealed: true,
      isInteractive: false, imageUrl: url, visualVariant: 'structural', consequences: [], recommendations: []
    };
    const apocalypse = {
      id: 'image-grid-apocalypse', name: 'Контрольований апокаліпсис', shortDescription: 'Читабельний текст поверх чистого зображення.',
      description: 'Опис сценарію.', severity: 'extreme', survivalChance: 17, duration: '30 років',
      threats: ['Загроза'], requirements: ['Укриття'], consequences: ['Наслідок'], tags: ['radiation'], imageUrl: url
    };
    const bunker = {
      id: 'image-grid-bunker', name: 'Контрольований бункер', shortDescription: 'Технічний опис поверх чистого зображення.',
      description: 'Опис укриття.', capacity: 4, condition: 'fair', suppliesMonths: 18, location: 'Гірський масив',
      facilities: ['Командний центр'], resources: ['Генератор'], problems: ['Антена'], bunkerTags: ['military'], imageUrl: url
    };
    document.getElementById('threatContent').innerHTML = renderThreatScenario(threat);
    currentApocalypse = apocalypse;
    currentBunker = bunker;
    renderApocalypse(currentApocalypse);
    renderBunker(currentBunker);
  }, imageUrl);
}

const scenarios = [
  { panel: '#threatPanel', hero: '.threat-hero', image: '.threat-hero-image', media: '.threat-hero-media', overlay: '.threat-hero-overlay', pattern: '.threat-hero-pattern', content: '.threat-hero-content' },
  { panel: '#apocalypsePanel', hero: '.apocalypse-hero', image: '.apocalypse-hero-image', media: '.apocalypse-hero-media', overlay: '.apocalypse-hero-overlay', pattern: '.apocalypse-hero-pattern', content: '.apocalypse-hero-content' },
  { panel: '#bunkerPanel', hero: '.bunker-hero', image: '.bunker-hero-image', media: '.bunker-hero-media', overlay: '.bunker-hero-overlay', pattern: '.bunker-hero-pattern', content: '.bunker-hero-content' }
];

async function expectCleanImages(page, checkRatio) {
  for (const scenario of scenarios) {
    const panel = page.locator(scenario.panel);
    const hero = panel.locator(scenario.hero);
    const image = panel.locator(scenario.image);
    await expect(hero).toHaveClass(/has-image/);
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate(element => element.complete && element.naturalWidth > 0)).toBe(true);
    const state = await hero.evaluate((element, selectors) => {
      const media = element.querySelector(selectors.media);
      const overlay = element.querySelector(selectors.overlay);
      const pattern = element.querySelector(selectors.pattern);
      const content = element.querySelector(selectors.content);
      const shell = element.closest('.scenario-immersive-shell');
      const box = element.getBoundingClientRect();
      return {
        patternDisplay: getComputedStyle(pattern).display,
        patternOpacity: Number(getComputedStyle(pattern).opacity),
        patternBackground: getComputedStyle(pattern).backgroundImage,
        overlayDisplay: getComputedStyle(overlay).display,
        overlayBackground: getComputedStyle(overlay).backgroundImage,
        mediaZ: Number(getComputedStyle(media).zIndex),
        overlayZ: Number(getComputedStyle(overlay).zIndex),
        patternZ: Number(getComputedStyle(pattern).zIndex),
        contentZ: Number(getComputedStyle(content).zIndex),
        shellBeforeBackground: getComputedStyle(shell, '::before').backgroundImage,
        shellAfterBackground: getComputedStyle(shell, '::after').backgroundImage,
        ratio: box.width / box.height
      };
    }, scenario);
    expect(state.patternDisplay).toBe('none');
    expect(state.patternOpacity).toBe(0);
    expect(state.patternBackground).toBe('none');
    expect(state.overlayDisplay).not.toBe('none');
    expect(state.overlayBackground).not.toBe('none');
    expect([state.mediaZ, state.overlayZ, state.patternZ, state.contentZ]).toEqual([0, 1, 2, 3]);
    expect(state.shellBeforeBackground).toBe('none');
    expect(state.shellAfterBackground).toBe('none');
    if (checkRatio) {
      expect(state.ratio).toBeGreaterThanOrEqual(2.4);
      expect(state.ratio).toBeLessThanOrEqual(3.01);
    }
    await expect(panel.locator(scenario.content)).toBeVisible();
  }
}

test('desktop revealed scenario images have no grid while overlays and content remain', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Image grid desktop ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 1440, height: 900 });
    await startRoomGame(room);
    await renderFixtures(room.host, '/uploads/apocalypses/alien_terraforming.png');
    await expectCleanImages(room.host, true);
  } finally {
    await room.close();
  }
});

test('missing and broken images restore only the atmospheric fallback patterns', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Image grid fallback ${Date.now()}`);
  try {
    await startRoomGame(room);
    await renderFixtures(room.host, '');
    for (const scenario of scenarios) {
      const hero = room.host.locator(`${scenario.panel} ${scenario.hero}`);
      await expect(hero).toHaveClass(/no-image/);
      await expect(hero.locator(scenario.media)).toHaveCount(0);
      const state = await hero.locator(scenario.pattern).evaluate(element => ({
        display: getComputedStyle(element).display,
        opacity: Number(getComputedStyle(element).opacity)
      }));
      expect(state.display).not.toBe('none');
      expect(state.opacity).toBeGreaterThanOrEqual(.1);
      expect(state.opacity).toBeLessThanOrEqual(.16);
      await expect(hero.locator(scenario.overlay)).toBeVisible();
    }

    await renderFixtures(room.host, '/uploads/apocalypses/definitely-missing-grid-test.png');
    for (const scenario of scenarios) {
      const hero = room.host.locator(`${scenario.panel} ${scenario.hero}`);
      await expect(hero).toHaveClass(/no-image/);
      await expect(hero.locator(scenario.media)).toHaveCount(0);
      expect(await hero.locator(scenario.pattern).evaluate(element => Number(getComputedStyle(element).opacity))).toBeGreaterThanOrEqual(.1);
    }

    await room.host.evaluate(() => { document.getElementById('threatContent').innerHTML = renderHiddenThreatScenario(); });
    const sealed = room.host.locator('#threatPanel .threat-scenario-shell.is-sealed');
    await expect(sealed).toBeVisible();
    await expect(sealed.locator('.threat-sealed-pattern')).toBeVisible();
    await expect(sealed.locator('[class*="variant-"]')).toHaveCount(0);
    await expect(sealed.locator('img')).toHaveCount(0);
  } finally {
    await room.close();
  }
});

test('mobile images remain clean visible aligned and free of overflow', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Image grid mobile ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 390, height: 844 });
    await room.guest.setViewportSize({ width: 390, height: 844 });
    await startRoomGame(room);
    await renderFixtures(room.host, '/uploads/bunkers/harbor_fortress_bunker.png');
    await expectCleanImages(room.host, false);
    expect(await room.host.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    const widths = await room.host.evaluate(() => ['apocalypsePanel', 'bunkerPanel', 'threatPanel'].map(id => document.getElementById(id).getBoundingClientRect().width));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1.5);
  } finally {
    await room.close();
  }
});
