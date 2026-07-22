const { test, expect } = require('@playwright/test');

test.use({ ignoreHTTPSErrors: true });

const fixture = theme => ({
  id: `visual-${theme}`,
  name: `Visual ${theme}`,
  description: 'Atmospheric visual verification fixture.',
  visualThemeId: theme,
  categoryId: 'ecological',
  threats: ['Reduced visibility'],
  survivalRequirements: ['Shelter'],
  longTermConsequences: ['Environmental stress']
});

test('ambient root, theme switch, reaction dedupe and reset are idempotent', async ({ page }) => {
  await page.goto('/Bunker');
  const revealReactionStarted = await page.evaluate(apocalypse => {
    currentPublicGameSettings.apocalypseThemeEnabled = true;
    currentApocalypse = apocalypse;
    renderApocalypse(currentApocalypse);
    triggerApocalypseVisualReaction('apocalypse-reveal', { duration: 1400 });
    return document.body.classList.contains('apocalypse-reaction-apocalypse-reveal');
  }, fixture('wasteland-olive'));

  expect(revealReactionStarted).toBe(true);
  await expect(page.locator('body')).toHaveAttribute('data-apocalypse-theme', 'wasteland-olive');
  await expect(page.locator('#apocalypseAmbientRoot')).toBeVisible();
  await expect(page.locator('#apocalypseAmbientRoot')).toHaveCount(1);

  await page.evaluate(apocalypse => { currentApocalypse = apocalypse; renderApocalypse(currentApocalypse); }, fixture('machine-cyan'));
  await expect(page.locator('body')).toHaveAttribute('data-apocalypse-theme', 'machine-cyan');
  await expect(page.locator('#apocalypseAmbientRoot')).toHaveCount(1);
  await expect(page.locator('body')).not.toHaveClass(/apocalypse-reaction-apocalypse-reveal/);

  await page.evaluate(() => { currentApocalypse = null; renderApocalypse(null); });
  await expect(page.locator('body')).not.toHaveAttribute('data-apocalypse-theme', /.+/);
  await expect(page.locator('#apocalypseAmbientRoot')).toBeHidden();
  await expect(page.locator('#apocalypseAmbientRoot')).toHaveCount(1);
});

test('local effects preference preserves colors and controls motion across reload', async ({ page, context }) => {
  await page.goto('/Bunker');
  await page.evaluate(apocalypse => { currentApocalypse = apocalypse; renderApocalypse(apocalypse); setApocalypseEffectsLevel('off'); }, fixture('biohazard-green'));
  await expect(page.locator('body')).toHaveAttribute('data-apocalypse-theme', 'biohazard-green');
  await expect(page.locator('body')).toHaveAttribute('data-apocalypse-effects-level', 'off');
  await page.reload();
  await expect(page.locator('body')).toHaveAttribute('data-apocalypse-effects-level', 'off');

  const isolated = await context.browser().newContext({ ignoreHTTPSErrors: true });
  const isolatedPage = await isolated.newPage();
  await isolatedPage.goto(page.url());
  await expect(isolatedPage.locator('body')).toHaveAttribute('data-apocalypse-effects-level', 'atmospheric');
  await isolated.close();
});

test('effect activation is generic, duplicate-safe, and timer states are canonical', async ({ page }) => {
  await page.goto('/Bunker');
  await page.evaluate(apocalypse => { currentApocalypse = apocalypse; renderApocalypse(apocalypse); }, fixture('machine-cyan'));
  const publicEvent = { activationId: 'visual-activation-1', result: 'success', summaryCode: 'apocalypse_effect_conditions' };
  const effectReactionStarted = await page.evaluate(data => {
    document.getElementById('gameSection').style.display = 'block';
    if (showApocalypseEffectBanner(data)) triggerApocalypseVisualReaction('apocalypse-effect');
    if (showApocalypseEffectBanner(data)) triggerApocalypseVisualReaction('apocalypse-effect');
    return document.body.classList.contains('apocalypse-reaction-apocalypse-effect');
  }, publicEvent);
  expect(effectReactionStarted).toBe(true);
  await expect(page.locator('#apocalypseEffectBanner')).not.toHaveAttribute('hidden', '');
  await expect(page.locator('body')).not.toHaveAttribute('data-effect-type');
  await expect(page.locator('body')).not.toContainText('EffectProfileId');

  await page.evaluate(() => {
    currentGameTimer = { status: 'Running', purpose: 'Round', label: '', durationSeconds: 300, remainingSeconds: 12, deadlineUtc: null, serverTimestampUtc: new Date().toISOString() };
    gameTimerClockAnchor = null;
    renderGameTimer();
  });
  await expect(page.locator('#publicGameTimer')).toHaveClass(/timer-critical/);
  await page.evaluate(() => { currentGameTimer.status = 'Paused'; renderGameTimer(); });
  await expect(page.locator('#publicGameTimer')).toHaveClass(/timer-paused/);
});

test('environmental effects are theme-aware, duplicate-safe and preference-controlled', async ({ page }) => {
  await page.goto('/Bunker');
  const apocalypse = fixture('wasteland-olive');
  await page.evaluate(value => {
    currentApocalypse = value;
    renderApocalypse(value);
    setApocalypseEffectsLevel('atmospheric');
  }, apocalypse);

  await expect(page.locator('#apocalypseAmbientRoot .apocalypse-ambient-layer')).toHaveCount(5);
  await expect(page.locator('.apocalypse-ambient-layer-edge-front')).toHaveCSS('pointer-events', 'none');
  expect(await page.evaluate(() => triggerApocalypseAmbientEvent('dust-burst'))).toBe(true);
  await expect(page.locator('#apocalypseAmbientRoot')).toHaveClass(/apoc-event-dust-burst/);

  expect(await page.evaluate(value => triggerApocalypseCardRevealWave(value), apocalypse)).toBe(true);
  await expect(page.locator('.apocalypse-scenario-shell')).toHaveClass(/apoc-card-reveal-wave/);
  expect(await page.evaluate(value => triggerApocalypseCardRevealWave(value), apocalypse)).toBe(false);

  await page.mouse.move(380, 180);
  await expect.poll(() => page.locator('#apocalypseAmbientRoot').evaluate(root => root.style.getPropertyValue('--apoc-parallax-x'))).not.toBe('');

  await page.evaluate(() => setApocalypseEffectsLevel('off'));
  await expect(page.locator('#apocalypseAmbientRoot')).not.toHaveClass(/apoc-event-/);
  await expect(page.locator('.apocalypse-ambient-layer-edge-front')).toHaveCSS('display', 'none');
  await expect(page.locator('.apocalypse-card-border-light')).toHaveCSS('display', 'none');
  expect(await page.evaluate(() => triggerApocalypseAmbientEvent('dust-burst'))).toBe(false);

  await page.evaluate(() => { currentApocalypse = null; renderApocalypse(null); });
  await expect(page.locator('#apocalypseAmbientRoot')).toBeHidden();
});

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  test('keeps atmosphere inert and controls clickable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/Bunker');
    await page.evaluate(apocalypse => { currentApocalypse = apocalypse; renderApocalypse(apocalypse); }, fixture('wasteland-olive'));
    await expect(page.locator('#apocalypseAmbientRoot')).toHaveCSS('pointer-events', 'none');
    await expect(page.locator('.apocalypse-ambient-layer-primary')).toHaveCSS('animation-name', 'none');
    await expect(page.locator('.apocalypse-card-border-light')).toHaveCSS('animation-name', 'none');
    expect(await page.evaluate(() => triggerApocalypseAmbientEvent())).toBe(false);
    await expect(page.locator('#createRoomBtn')).toBeVisible();
  });
});

test('ambient stays non-interactive without adding horizontal overflow on mobile and ultrawide', async ({ page }) => {
  await page.goto('/Bunker');

  for (const viewport of [{ width: 390, height: 844 }, { width: 2560, height: 1080 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => { currentApocalypse = null; renderApocalypse(null); });
    const baselineScrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    await page.evaluate(apocalypse => { currentApocalypse = apocalypse; renderApocalypse(apocalypse); }, fixture('machine-cyan'));
    await expect(page.locator('#apocalypseAmbientRoot')).toHaveCSS('pointer-events', 'none');
    await expect.poll(() => page.evaluate(baseline => document.documentElement.scrollWidth <= baseline, baselineScrollWidth)).toBe(true);
    const targetIsCreateControl = await page.locator('#createRoomBtn').evaluate(button => {
      const rect = button.getBoundingClientRect();
      const target = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return target === button || button.contains(target);
    });
    expect(targetIsCreateControl).toBe(true);
  }
});

test('visual acceptance fixtures for three representative themes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/Bunker');
  const themes = new Map([
    ['wasteland-olive', 'dust-burst'],
    ['biohazard-green', 'spore-wave'],
    ['machine-cyan', 'scanline-pulse']
  ]);
  for (const [theme, eventType] of themes) {
    await page.evaluate(({ apocalypse, eventType }) => {
      document.getElementById('lobbySection').style.display = 'none';
      document.getElementById('roomSection').style.display = 'block';
      document.getElementById('roomLobby').style.display = 'none';
      document.getElementById('gameSection').style.display = 'block';
      document.getElementById('myPlayerSection').style.display = 'none';
      currentApocalypse = apocalypse;
      renderApocalypse(apocalypse);
      setApocalypseEffectsLevel('atmospheric');
      triggerApocalypseCardRevealWave(apocalypse);
      triggerApocalypseAmbientEvent(eventType);
    }, { apocalypse: fixture(theme), eventType });
    await page.waitForTimeout(260);
    await page.screenshot({ path: testInfo.outputPath(`${theme}.png`), fullPage: true });
  }
});
