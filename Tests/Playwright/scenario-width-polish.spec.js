const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

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

async function revealTextThreat(page) {
  await page.evaluate(() => { window.confirm = () => true; });
  await page.locator('#gmPanelBtn').click();
  await page.locator('[data-gm-tab-button="threat"]').click();
  await page.evaluate(() => gmGenerateTextThreat());
  await expect.poll(() => page.evaluate(() => gmThreatCommandPending)).toBe(false);
  await expect(page.locator('#threatPanel .threat-scenario-shell:not(.is-sealed)')).toBeVisible({ timeout: 15000 });
  await page.evaluate(() => { document.getElementById('gmPanel').style.display = 'none'; });
}

async function readLayout(page) {
  return page.evaluate(() => {
    const ids = ['apocalypsePanel', 'bunkerPanel', 'threatPanel'];
    const panels = ids.map(id => {
      const panel = document.getElementById(id);
      const shell = panel.querySelector('.scenario-immersive-shell');
      const hero = shell.querySelector('.scenario-immersive-hero');
      const panelBox = panel.getBoundingClientRect();
      const shellBox = shell.getBoundingClientRect();
      const heroBox = hero.getBoundingClientRect();
      return {
        left: panelBox.left,
        right: panelBox.right,
        width: panelBox.width,
        shellWidth: shellBox.width,
        ratio: heroBox.width / heroBox.height
      };
    });
    return {
      panels,
      columns: getComputedStyle(document.querySelector('.scenario-immersive-grid')).gridTemplateColumns,
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    };
  });
}

function expectAligned(layout, { cinematic }) {
  const [first, ...others] = layout.panels;
  for (const panel of layout.panels) {
    expect(Math.abs(panel.width - panel.shellWidth)).toBeLessThanOrEqual(1.5);
    if (cinematic) {
      expect(panel.ratio).toBeGreaterThanOrEqual(2.4);
      expect(panel.ratio).toBeLessThanOrEqual(3.01);
    }
  }
  for (const panel of others) {
    expect(Math.abs(first.left - panel.left)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(first.right - panel.right)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(first.width - panel.width)).toBeLessThanOrEqual(1.5);
  }
  expect(layout.overflow).toBe(false);
}

test('apocalypse bunker and threat stay equally wide at desktop tablet and mobile viewports', async ({ browser }) => {
  test.setTimeout(90000);
  const room = await createTwoPlayerRoom(browser, `Scenario width ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 1600, height: 1000 });
    await startRoomGame(room);
    await revealTextThreat(room.host);

    expectAligned(await readLayout(room.host), { cinematic: true });

    await room.host.setViewportSize({ width: 1366, height: 768 });
    expectAligned(await readLayout(room.host), { cinematic: true });

    await room.host.setViewportSize({ width: 390, height: 844 });
    const mobile = await readLayout(room.host);
    expectAligned(mobile, { cinematic: false });
    expect(mobile.panels.every(panel => panel.width > 320)).toBe(true);
  } finally {
    await room.close();
  }
});
