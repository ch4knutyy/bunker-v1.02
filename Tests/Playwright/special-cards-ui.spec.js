const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom, createRoom, joinRoom } = require('./game-test-helpers');

async function startRoom(room) {
  await room.host.locator('#lobbyReadyButton').click();
  await room.guest.locator('#lobbyReadyButton').click();
  await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
  await room.host.locator('#lobbyStartPreviewButton').click();
  await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i);
  await room.host.locator('#startGameBtn').click();
  await expect(room.host.locator('#mySpecialCardsList .special-card-shell')).toHaveCount(1, { timeout: 15000 });
}

test('desktop special card keeps target, blocks double use and restores used snapshot', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Special deck ${Date.now()}`);
  try {
    await startRoom(room);
    await room.host.evaluate(() => {
      const fixture = {
        id: 'frontend-special-fixture', name: 'Професійний допит', description: 'Вибраний гравець повинен розкрити свою професію.',
        isSecret: false, isOneTimeUse: true, phase: 'discussion', effectType: 'forceRevealProfession', requiresTarget: true,
        isUsed: false, isActive: false, status: 'hidden'
      };
      myPlayerData.specialCards = [fixture]; myPlayerData.specialCard = fixture;
      currentRoom = { ...currentRoom, state: 'Playing' };
      currentRoundState = { ...currentRoundState, phase: 'RoundReveal' };
      window.__specialOriginalInvoke = connection.invoke.bind(connection);
      window.__specialUseCalls = 0;
      connection.invoke = (method, ...args) => {
        if (method !== 'UseSpecialCardById') return window.__specialOriginalInvoke(method, ...args);
        window.__specialUseCalls += 1;
        window.__specialUseArgs = args;
        return new Promise(resolve => {
          window.__resolveSpecialUse = () => {
            myPlayerData.specialCards[0] = { ...myPlayerData.specialCards[0], isUsed: true, status: 'used', usedAtRound: 1 };
            myPlayerData.specialCard = myPlayerData.specialCards[0];
            renderMySpecialCards(myPlayerData);
            resolve();
          };
        });
      };
      renderMySpecialCards(myPlayerData);
    });

    const card = room.host.locator('#mySpecialCardsList .special-card-shell');
    await expect(card.locator('.special-card-icon-zone svg')).toBeVisible();
    await expect(card.locator('.special-card-category')).toContainText(/Розкриття|Reveal|Раскрытие/);
    await expect(card.locator('.special-card-title')).toHaveText('Професійний допит');
    await expect(card.locator('.special-card-effect')).toContainText('розкрити свою професію');
    await expect(card.locator('.special-card-status')).toContainText(/Доступна зараз|Available now|Доступна сейчас/);
    await expect(card.locator('.special-card-target-select')).toHaveCount(1);
    expect(await card.locator('.special-card-target-select option').evaluateAll(options => options.map(option => option.value))).toEqual(['', '0']);
    await card.locator('.special-card-target-select').selectOption('0');
    await expect(card.locator('.special-card-target-select')).toHaveValue('0');
    await room.host.evaluate(() => renderMySpecialCards(myPlayerData));
    await expect(card.locator('.special-card-target-select')).toHaveValue('0');
    await expect(card.locator('[data-testid="special-card-use"]')).toBeEnabled();
    await room.host.evaluate(() => {
      const button = document.querySelector('[data-testid="special-card-use"]');
      button.click(); button.click();
    });
    await expect(card).toHaveClass(/state-pending/);
    await expect(card.locator('.special-card-use-btn')).toBeDisabled();
    expect(await room.host.evaluate(() => window.__specialUseCalls)).toBe(1);
    expect((await room.host.evaluate(() => window.__specialUseArgs))[1]).not.toBe('');
    await room.host.evaluate(() => window.__resolveSpecialUse());
    await expect(card).toHaveClass(/state-used/);
    await expect(card).toContainText(/Карту використано|Card used|Карта использована/);
    await room.host.evaluate(() => {
      const personalSnapshot = structuredClone(myPlayerData);
      myPlayerData = normalizePlayer(personalSnapshot);
      renderMySpecialCards(myPlayerData);
    });
    await expect(room.host.locator('#mySpecialCardsList .special-card-shell')).toHaveCount(1);
    await expect(card).toHaveClass(/state-used/);
    await expect(room.guest.locator('#specialCardsSection')).not.toContainText('Професійний допит');
  } finally {
    await room.host.evaluate(() => { if (window.__specialOriginalInvoke) connection.invoke = window.__specialOriginalInvoke; }).catch(() => {});
    await room.close();
  }
});

test('mobile special card is single-column, full-width and tooltip remains tap-safe', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true });
  const host = await hostContext.newPage(); const guest = await guestContext.newPage();
  try {
    const name = `Special mobile ${Date.now()}`;
    await createRoom(host, 'P1', name, { maxPlayers: 6 });
    await joinRoom(guest, 'P2', name);
    await startRoom({ host, guest });
    await host.evaluate(() => {
      const fixture = {
        id: 'frontend-special-mobile', name: 'Довга особлива карта',
        description: 'Дуже довгий ефект спеціальної карти, який повинен коректно переноситися на кілька рядків і не створювати горизонтального переповнення на мобільному екрані.',
        privateResult: 'Додаткове приватне пояснення результату.', isSecret: true, phase: 'discussion', effectType: 'swapBodyWithTarget', requiresTarget: true
      };
      myPlayerData.specialCards = [fixture]; myPlayerData.specialCard = fixture;
      currentRoom = { ...currentRoom, state: 'Playing' }; currentRoundState = { ...currentRoundState, phase: 'RoundReveal' };
      renderMySpecialCards(myPlayerData);
    });
    const card = host.locator('#mySpecialCardsList .special-card-shell');
    const cardBox = await card.boundingBox();
    const listBox = await host.locator('#mySpecialCardsList').boundingBox();
    expect(cardBox.width).toBeLessThanOrEqual(listBox.width + 1);
    const selectBox = await card.locator('.special-card-target-select').boundingBox();
    const buttonBox = await card.locator('.special-card-use-btn').first().boundingBox();
    expect(selectBox.width).toBeGreaterThan(cardBox.width * .8);
    expect(buttonBox.width).toBeGreaterThan(cardBox.width * .8);
    expect(await host.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const trigger = card.locator('.special-card-tooltip .tooltip-trigger');
    await trigger.tap();
    await expect(host.locator('.tooltip-portal')).toBeVisible();
    await host.keyboard.press('Escape');
    await expect(host.locator('.tooltip-portal')).toBeHidden();
  } finally { await guestContext.close(); await hostContext.close(); }
});

