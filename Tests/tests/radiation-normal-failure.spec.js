const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('normal radiation failure updates health card, revealed table and tooltip without reload', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Radiation Normal ${Date.now()}`);
  try {
    await room.host.locator('#startGameBtn').click();
    await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
    await room.host.evaluate(() => connection.invoke('RevealCharacteristic', 'PhysicalHealth'));
    await room.host.locator('#gmPanelBtn').click();
    await room.host.locator('[data-gm-tab-button="threat"]').click();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const auditCount = await room.host.evaluate(() => gmThreatControlData.auditLog?.length || 0);
      await room.host.locator('button[onclick="gmGenerateRareThreat()"]') .click();
      await expect.poll(() => room.host.evaluate(() => gmThreatCommandPending)).toBe(false);
      await expect.poll(() => room.host.evaluate(() => gmThreatControlData.auditLog?.length || 0)).toBeGreaterThan(auditCount);
      const id = await room.host.evaluate(() => gmThreatControlData.currentThreat?.id || gmThreatControlData.currentThreat?.Id || '');
      if (id === 'radiation_leak') break;
    }
    await expect.poll(() => room.host.evaluate(() => gmThreatControlData.currentThreat?.id || gmThreatControlData.currentThreat?.Id || '')).toBe('radiation_leak');
    await expect.poll(() => room.host.evaluate(() => currentThreatState?.currentThreatId || '')).toBe('radiation_leak');

    await room.host.evaluate(() => connection.invoke('SubmitThreatVolunteer'));
    await expect.poll(() => room.host.evaluate(() => currentThreatState?.volunteerSelection?.selectedPlayerId || '')).not.toBe('');
    await room.host.evaluate(() => { globalThis.__radiationTestErrors = []; connection.on('ReceiveError', message => globalThis.__radiationTestErrors.push(message)); });
    await room.host.evaluate(() => connection.invoke('StartThreatMiniGame', getCurrentLanguage()));
    await room.host.waitForTimeout(300);
    const startErrors = await room.host.evaluate(() => globalThis.__radiationTestErrors);
    expect(startErrors).toEqual([]);
    await expect.poll(() => room.host.evaluate(() => currentThreatState?.miniGame?.status || '')).toMatch(/active|completed|failed/);

    for (let answer = 0; answer < 8; answer += 1) {
      const state = await room.host.evaluate(() => ({
        status: currentThreatState?.miniGame?.status || '',
        questionId: currentThreatState?.miniGame?.currentQuestion?.questionId || ''
      }));
      if (['failed', 'resolved_safely', 'resolved_with_casualty'].includes(state.status)) break;
      if (!state.questionId) {
        await room.host.waitForTimeout(150);
        continue;
      }
      await room.host.evaluate(({ questionId }) => connection.invoke('SubmitThreatMiniGameAnswer', questionId, 'definitely_wrong', getCurrentLanguage()), state);
      await room.host.waitForTimeout(150);
    }

    await expect.poll(() => room.host.evaluate(() => currentThreatState?.threatStatus || '')).toBe('failed');
    await expect.poll(() => room.host.evaluate(() => (myPlayerData?.additionalPhysicalConditions || myPlayerData?.additionalConditionEffects || []).filter(item => (item.conditionId || item.ConditionId) === 'physical_152').length)).toBe(1);
    await expect(room.host.locator('#myPlayerCards')).toContainText(/Променева хвороба|Radiation sickness|Лучевая болезнь/i);
    await expect(room.host.locator('.player-dossier-card')).toContainText(/Променева хвороба|Radiation sickness|Лучевая болезнь/i);

    const radiationRow = room.host.locator('#myPlayerCards .additional-condition-item').filter({ hasText: /Променева хвороба|Radiation sickness|Лучевая болезнь/i }).first();
    await radiationRow.locator('.tooltip-trigger').hover();
    await expect(room.host.locator('.tooltip-portal')).toContainText(/Променева хвороба|Radiation sickness|Лучевая болезнь/i);

    await room.host.reload();
    await expect(room.host.locator('#myPlayerCards')).toContainText(/Променева хвороба|Radiation sickness|Лучевая болезнь/i, { timeout: 15000 });
    await expect.poll(() => room.host.evaluate(() => (myPlayerData?.additionalPhysicalConditions || myPlayerData?.additionalConditionEffects || []).filter(item => (item.conditionId || item.ConditionId) === 'physical_152').length)).toBe(1);
  } finally {
    await room.close();
  }
});
