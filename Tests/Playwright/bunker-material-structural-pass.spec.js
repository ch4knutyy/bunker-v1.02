const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { createTwoPlayerRoom } = require('./game-test-helpers');

const previewRoot = path.join(process.cwd(), 'docs', 'audits', 'previews', 'bunker-material-structural-pass');

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

const fixtures = [
  ['hospital', 'hospital_bunker', 'excellent', '/uploads/bunkers/blood_bank_bunker.png'],
  ['shipyard', 'shipyard_bunker', 'fair', '/uploads/bunkers/shipyard_bunker.png'],
  ['underground-city', 'underground_city', 'fair', '/uploads/bunkers/underground_city.png'],
  ['luxury', 'luxury_bunker', 'excellent', '/uploads/bunkers/casino_bunker.png'],
  ['improvised-damaged', 'flooded_bunker', 'poor', '/uploads/bunkers/ghost_town_bunker.png']
];

function bunkerFixture(id, condition, imageUrl) {
  return {
    id,
    name: id.replaceAll('_', ' '),
    description: 'Production renderer material structure verification.',
    capacity: 6,
    condition,
    suppliesMonths: 18,
    waterMonths: 14,
    location: 'Underground protected sector',
    facilities: ['Command module', 'Air filtration', 'Protected storage'],
    resources: ['Power reserve', 'Water supply'],
    problems: ['External seal requires service'],
    bunkerTags: [],
    imageUrl
  };
}

test('production bunker renderer exposes material-driven structure across representative profiles', async ({ browser }) => {
  test.setTimeout(120000);
  const room = await createTwoPlayerRoom(browser, `Bunker material pass ${Date.now()}`);
  const errors = [];
  room.host.on('pageerror', error => errors.push(error.message));
  try {
    await startRoom(room);
    await room.host.waitForFunction(() =>
      visualThemeRegistryState.loaded && bunkerMaterialAssetState.loaded &&
      visualThemeRegistryState.bunkerById.size === 205 && bunkerMaterialAssetState.materialsById.size === 44);
    const phase = process.env.BUNKER_VISUAL_PHASE || '';
    if (phase) fs.mkdirSync(path.join(previewRoot, phase), { recursive: true });

    for (const [name, id, condition, imageUrl] of fixtures) {
      await room.host.setViewportSize({ width: 1440, height: 1000 });
      await room.host.evaluate(({ bunker, forcedCondition }) => {
        currentBunker = bunker;
        renderBunker(currentBunker);
        const root = document.querySelector('#bunkerContent .bunker-visual-root');
        const theme = { ...resolveBunkerVisualTheme(currentBunker), condition: forcedCondition };
        applyBunkerMaterialPresentation(theme, root);
      }, { bunker: bunkerFixture(id, condition, imageUrl), forcedCondition: condition });
      const shell = room.host.locator('#bunkerContent .bunker-facility-shell');
      await expect(shell).toBeVisible();
      if (phase) {
        await shell.screenshot({ path: path.join(previewRoot, phase, `${name}-desktop.png`) });
        if (phase === 'after') {
          await shell.evaluate(root => { root.style.filter = 'grayscale(1)'; });
          await shell.screenshot({ path: path.join(previewRoot, phase, `${name}-grayscale.png`) });
          await shell.evaluate(root => { root.style.removeProperty('filter'); });
        }
      }
    }

    for (const [suffix, width] of [['narrow', 900], ['mobile', 390]]) {
      await room.host.setViewportSize({ width, height: 1000 });
      await room.host.evaluate(bunker => {
        currentBunker = bunker;
        renderBunker(currentBunker);
      }, bunkerFixture('shipyard_bunker', 'fair', '/uploads/bunkers/shipyard_bunker.png'));
      const shell = room.host.locator('#bunkerContent .bunker-facility-shell');
      if (phase) await shell.screenshot({ path: path.join(previewRoot, phase, `shipyard-${suffix}.png`) });
    }

    if (phase !== 'baseline') {
      const shell = room.host.locator('#bunkerContent .bunker-facility-shell');
      await expect(shell).toHaveClass(/bunker-structure-/);
      const resolved = await shell.evaluate(root => ({
        base: root.dataset.bunkerBaseMaterial,
        secondary: root.dataset.bunkerSecondaryMaterial,
        accent: root.dataset.bunkerAccentMaterial,
        glass: root.dataset.bunkerGlassMaterial,
        baseImage: getComputedStyle(root.querySelector('.bunker-material-layer--base')).backgroundImage,
        metricImage: getComputedStyle(root.querySelector('.bunker-metric')).backgroundImage,
        cardImage: getComputedStyle(root.querySelector('.bunker-content-card')).backgroundImage,
        buttonImage: getComputedStyle(root.querySelector('.bunker-open-image')).backgroundImage,
        veilZ: Number(getComputedStyle(root.querySelector('.bunker-readability-veil')).zIndex),
        contentZ: Number(getComputedStyle(root.querySelector('.bunker-visual-content')).zIndex)
      }));
      expect([resolved.base, resolved.secondary, resolved.accent, resolved.glass].every(Boolean)).toBe(true);
      expect(
        [resolved.baseImage, resolved.metricImage, resolved.cardImage, resolved.buttonImage].every(value => value.includes('/assets/ui/materials/')),
        JSON.stringify(resolved)
      ).toBe(true);
      expect(resolved.contentZ).toBeGreaterThan(resolved.veilZ);
      expect(errors).toEqual([]);
    }
  } finally {
    await room.close();
  }
});
