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
  await expect(room.host.locator('#roundStatusPanel')).toBeVisible({ timeout: 15000 });
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.site-game-shell');
    const command = document.querySelector('.site-command-bar');
    const hud = document.querySelector('.site-round-hud');
    const cards = document.querySelector('.player-cards-grid');
    const shellBox = shell.getBoundingClientRect();
    return {
      bodyBackground: getComputedStyle(document.body).backgroundImage,
      shellWidth: shellBox.width,
      shellBorder: getComputedStyle(shell).borderTopWidth,
      shellShadow: getComputedStyle(shell).boxShadow,
      commandDisplay: getComputedStyle(command).display,
      hudColumns: getComputedStyle(hud).gridTemplateColumns.split(' ').filter(Boolean).length,
      cardColumns: getComputedStyle(cards).gridTemplateColumns.split(' ').filter(Boolean).length,
      navPosition: getComputedStyle(document.querySelector('.main-header')).position,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  });
}

test('desktop-wide shell preserves running game, GM, tooltip portal and immersive layers', async ({ browser }) => {
  test.setTimeout(75000);
  const room = await createTwoPlayerRoom(browser, `Site shell wide ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 1600, height: 1000 });
    await startRoomGame(room);
    await expect(room.host.locator('.main-header')).toBeVisible();
    await expect(room.host.locator('.nav-link.active')).toContainText(/Грати|Play|Играть/);
    await expect(room.host.locator('#currentRoomState')).toHaveClass(/state-playing/);
    await expect(room.host.locator('#gmPanelBtn')).toBeVisible();
    await expect(room.host.locator('.site-section-heading:visible').first()).toBeVisible();

    const metrics = await pageMetrics(room.host);
    expect(metrics.bodyBackground).toContain('radial-gradient');
    expect(metrics.bodyBackground).toContain('repeating-linear-gradient');
    expect(metrics.shellWidth).toBeGreaterThan(1400);
    expect(metrics.shellWidth).toBeLessThan(1600);
    expect(metrics.shellBorder).toBe('1px');
    expect(metrics.shellShadow).toContain('inset');
    expect(metrics.hudColumns).toBe(3);
    expect(metrics.cardColumns).toBe(3);
    expect(metrics.overflow).toBe(false);

    const trigger = room.host.locator('.vault-card-tooltip .tooltip-trigger').first();
    await trigger.hover();
    const portal = room.host.locator('#characteristicTooltipPortal');
    await expect(portal).toBeVisible();
    expect(await portal.evaluate(element => Number(getComputedStyle(element).zIndex))).toBeGreaterThan(9999);

    for (const selector of ['.apocalypse-scenario-shell', '.bunker-facility-shell', '.threat-scenario-shell']) await expect(room.host.locator(selector)).toHaveCount(1);
    expect(await room.host.evaluate(() => ['.site-game-shell', '.main-content'].every(selector => {
      const element = document.querySelector(selector);
      return getComputedStyle(element, '::before').backgroundImage === 'none' && getComputedStyle(element, '::after').backgroundImage === 'none';
    }))).toBe(true);

    await room.host.reload();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('#roundStatusPanel')).toBeVisible();
    await expect(room.host.locator('.player-cards-grid')).toBeVisible();
  } finally {
    await room.close();
  }
});

test('1366 laptop keeps three columns and uses available width without overflow', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Site shell laptop ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 1366, height: 768 });
    await startRoomGame(room);
    const metrics = await pageMetrics(room.host);
    expect(metrics.shellWidth).toBeGreaterThan(1260);
    expect(metrics.shellWidth).toBeLessThan(1366);
    expect(metrics.hudColumns).toBe(3);
    expect(metrics.cardColumns).toBe(3);
    expect(metrics.overflow).toBe(false);
    await expect(room.host.locator('.site-command-identity')).toBeVisible();
    await expect(room.host.locator('.site-command-actions')).toBeVisible();
    const widths = await room.host.evaluate(() => ['apocalypsePanel', 'bunkerPanel', 'threatPanel'].map(id => document.getElementById(id).getBoundingClientRect().width));
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1.5);
  } finally {
    await room.close();
  }
});

test('390 mobile stacks command HUD and cards while navbar remains keyboard-sized', async ({ browser }) => {
  test.setTimeout(60000);
  const room = await createTwoPlayerRoom(browser, `Site shell mobile ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 390, height: 844 });
    await room.guest.setViewportSize({ width: 390, height: 844 });
    await startRoomGame(room);
    const metrics = await pageMetrics(room.host);
    expect(metrics.hudColumns).toBe(1);
    expect(metrics.cardColumns).toBe(1);
    expect(metrics.navPosition).toBe('static');
    expect(metrics.overflow).toBe(false);
    const actionColumns = await room.host.locator('.site-command-actions').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean).length);
    expect(actionColumns).toBe(1);
    const navLinks = room.host.locator('.main-nav .nav-link');
    for (let index = 0; index < await navLinks.count(); index += 1) expect((await navLinks.nth(index).boundingBox()).height).toBeGreaterThanOrEqual(44);
    await expect(room.host.locator('.site-section-heading:visible').first()).toBeVisible();
    for (const selector of ['.vault-characteristic-card', '.apocalypse-scenario-shell', '.bunker-facility-shell', '.threat-scenario-shell']) {
      const box = await room.host.locator(selector).first().boundingBox();
      expect(box.width).toBeLessThanOrEqual(390);
    }
  } finally {
    await room.close();
  }
});
