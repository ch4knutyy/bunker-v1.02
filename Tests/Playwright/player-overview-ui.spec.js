const { test, expect } = require('@playwright/test');
const { createRoom, joinRoom, createTwoPlayerRoom } = require('./game-test-helpers');
const { newContextWithNgrokBypass } = require('./ngrok-bypass');

test.use({ ignoreHTTPSErrors: true });

async function startTwoPlayerGame(room) {
  await room.host.locator('#lobbyReadyButton').click();
  await room.guest.locator('#lobbyReadyButton').click();
  await expect(room.host.locator('#lobbySummary')).toContainText(/2 (із|of|из) 2/, { timeout: 15000 });
  await room.host.locator('#lobbyStartPreviewButton').click();
  await expect(room.host.locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i, { timeout: 15000 });
  await room.host.locator('#startGameBtn').click();
  await expect(room.host.locator('#publicPlayerOverview')).toBeVisible({ timeout: 15000 });
  await expect(room.guest.locator('#publicPlayerOverview')).toBeVisible({ timeout: 15000 });
  await expect(room.host.locator('#playerDossierGrid .player-dossier-card')).toHaveCount(2, { timeout: 15000 });
}

async function createFourPlayerRoom(browser, roomName) {
  const contexts = [];
  const pages = [];
  for (let index = 0; index < 4; index += 1) {
    const context = await newContextWithNgrokBypass(browser, { ignoreHTTPSErrors: true });
    contexts.push(context);
    pages.push(await context.newPage());
  }
  await createRoom(pages[0], 'P1', roomName, { maxPlayers: 6 });
  for (let index = 1; index < pages.length; index += 1) await joinRoom(pages[index], `P${index + 1}`, roomName);
  await expect(pages[0].locator('#lobbyMembers .lobby-member-card')).toHaveCount(4, { timeout: 15000 });
  return { pages, close: async () => Promise.all(contexts.reverse().map(context => context.close().catch(() => {}))) };
}

async function startFourPlayerGame(room) {
  for (const page of room.pages) await page.locator('#lobbyReadyButton').click();
  await expect(room.pages[0].locator('#lobbySummary')).toContainText(/4 (із|of|из) 4/, { timeout: 15000 });
  await room.pages[0].locator('#lobbyStartPreviewButton').click();
  await expect(room.pages[0].locator('#lobbyStartPreview')).toContainText(/готова до старту|ready to start|готова к старту/i, { timeout: 15000 });
  await room.pages[0].locator('#startGameBtn').click();
  await expect(room.pages[0].locator('#playerDossierGrid .player-dossier-card')).toHaveCount(4, { timeout: 15000 });
}

test('desktop overview reveals public data, preserves selection and never serializes hidden values', async ({ browser }) => {
  test.setTimeout(75000);
  const room = await createTwoPlayerRoom(browser, `Player overview ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 1600, height: 1000 });
    await startTwoPlayerGame(room);
    await expect(room.host.locator('#playersTable, #playersTableBody')).toHaveCount(0);
    await expect(room.host.locator('[data-player-view="all"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(room.host.locator('#allPlayersComparison')).toBeVisible();
    await expect(room.host.locator('#playerDossierGrid .player-dossier-card')).toHaveCount(2);
    await expect(room.host.locator('#playerDossierGrid .comparison-characteristic')).toHaveCount(20);
    await room.host.locator('[data-player-view="single"]').click();
    await expect(room.host.locator('#singlePlayerOverview')).toBeVisible();
    await expect(room.host.locator('#publicPlayerSelector .player-selector-item')).toHaveCount(2);
    await expect(room.host.locator('#publicPlayerSelector .player-selector-item').nth(0)).toContainText('#1');
    await expect(room.host.locator('#publicPlayerSelector [aria-selected="true"]')).toContainText('P1');
    await expect(room.host.locator('#selectedPlayerPanel')).toContainText('P1');
    await expect(room.host.locator('#selectedPlayerPanel .badge-host')).toBeVisible();
    await expect(room.host.locator('#selectedPlayerPanel .badge-you')).toBeVisible();
    await expect(room.host.locator('.public-characteristic-card.is-sealed')).toHaveCount(10);

    const profession = room.host.locator('[data-characteristic-type="Profession"]');
    const professionValue = (await profession.locator('.vault-card-value').innerText()).trim();
    await profession.locator('.vault-card-reveal').click();
    const publicProfession = room.host.locator('#selectedPlayerPanel [data-characteristic="profession"]');
    await expect(publicProfession).toHaveAttribute('data-revealed', 'true', { timeout: 15000 });
    await expect(publicProfession).toContainText(professionValue);
    const hostDossierProfession = room.host.locator('.player-dossier-card').filter({ hasText: 'P1' }).locator('[data-characteristic="profession"]');
    await expect(hostDossierProfession).toHaveAttribute('data-revealed', 'true');
    await expect(hostDossierProfession).toContainText(professionValue);
    await room.host.locator('[data-player-view="all"]').click();
    await expect(hostDossierProfession).toBeVisible();
    await room.host.locator('[data-player-view="single"]').click();

    await room.host.locator('#publicPlayerSelector .player-selector-item').filter({ hasText: 'P2' }).click();
    await expect(room.host.locator('#selectedPlayerPanel')).toContainText('P2');
    await room.host.evaluate(() => renderPublicPlayerOverview());
    await expect(room.host.locator('#publicPlayerSelector .player-selector-item').filter({ hasText: 'P2' })).toHaveAttribute('aria-selected', 'true');

    await room.host.evaluate(() => {
      const model = getCanonicalPublicPlayerModels().find(item => (item.player.name || item.player.Name) === 'P2');
      model.player.revealed = { ...model.player.revealed, profession: false };
      model.player.revealedData = { ...model.player.revealedData, profession: 'PRIVATE_HIDDEN_PROFESSION' };
      renderPublicPlayerOverview();
    });
    const hiddenProfession = room.host.locator('#selectedPlayerPanel [data-characteristic="profession"]');
    await expect(hiddenProfession).toContainText(/Не розкрито|Not revealed|Не раскрыто/);
    expect(await room.host.locator('#publicPlayerOverview').evaluate(element => element.outerHTML.includes('PRIVATE_HIDDEN_PROFESSION'))).toBe(false);

    await room.host.locator('.language-btn[data-lang="en"]').click();
    await expect(hiddenProfession).toContainText('Not revealed');
    await expect(room.host.locator('#publicPlayerSelector .player-selector-item').filter({ hasText: 'P2' })).toHaveAttribute('aria-selected', 'true');

    await room.host.reload();
    await expect(room.host.locator('#publicPlayerOverview')).toBeVisible({ timeout: 15000 });
    await expect(room.host.locator('[data-player-view="all"]')).toHaveAttribute('aria-pressed', 'true');
    await room.host.locator('[data-player-view="single"]').click();
    await expect(room.host.locator('#publicPlayerSelector [aria-selected="true"]')).toContainText('P1');
    await expect(room.host.locator('#playersTable, #playersTableBody')).toHaveCount(0);
  } finally {
    await room.close();
  }
});

test('four-player previous next and automatic special-card labels follow canonical seat order with wrap-around', async ({ browser }) => {
  test.setTimeout(90000);
  const room = await createFourPlayerRoom(browser, `Player order ${Date.now()}`);
  try {
    await startFourPlayerGame(room);
    const host = room.pages[0];
    const originalDossiers = await host.locator('.player-dossier-card').evaluateAll(cards => cards.map(card => ({ seat: card.dataset.canonicalSeat, name: card.querySelector('h3').textContent.trim() })));
    await host.locator('#playerComparisonSort').selectOption('name');
    const nameSortedDossiers = await host.locator('.player-dossier-card').evaluateAll(cards => cards.map(card => ({ seat: card.dataset.canonicalSeat, name: card.querySelector('h3').textContent.trim() })));
    expect(nameSortedDossiers.map(item => item.name)).toEqual([...nameSortedDossiers.map(item => item.name)].sort((a, b) => a.localeCompare(b)));
    expect(new Map(nameSortedDossiers.map(item => [item.name, item.seat]))).toEqual(new Map(originalDossiers.map(item => [item.name, item.seat])));
    await host.locator('[data-player-view="single"]').click();
    expect(await host.locator('#publicPlayerSelector .player-selector-seat').allTextContents()).toEqual(['#1', '#2', '#3', '#4']);
    const canonicalOrder = await host.locator('#publicPlayerSelector .player-selector-item').evaluateAll(items => items.map(item => ({ seat: Number(item.dataset.playerSeat), name: item.querySelector('.player-selector-name').textContent.trim() })));
    const ownerIndex = canonicalOrder.findIndex(item => item.name === 'P1');
    const next = canonicalOrder[(ownerIndex + 1) % canonicalOrder.length];
    const previous = canonicalOrder[(ownerIndex - 1 + canonicalOrder.length) % canonicalOrder.length];
    await expect(host.locator('#publicPlayerSelector [aria-selected="true"]')).toContainText('P1');
    await host.locator('[data-overview-nav="next"]').click();
    await expect(host.locator('#publicPlayerSelector [aria-selected="true"]')).toContainText(next.name);
    await host.locator('[data-overview-nav="previous"]').click();
    await expect(host.locator('#publicPlayerSelector [aria-selected="true"]')).toContainText('P1');
    await host.locator('[data-overview-nav="previous"]').click();
    await expect(host.locator('#publicPlayerSelector [aria-selected="true"]')).toContainText(previous.name);

    await host.evaluate(() => {
      const fixture = { id: 'seat-order-fixture', name: 'Seat order fixture', description: 'Canonical neighbor', isSecret: false, isOneTimeUse: true, phase: 'discussion', effectType: 'forceLowerPlayerRevealRandomCharacteristic', requiresTarget: false };
      myPlayerData.specialCards = [fixture]; myPlayerData.specialCard = fixture;
      currentRoom.state = 'Playing'; currentRoundState = { ...currentRoundState, phase: 'RoundReveal' };
      renderMySpecialCards(myPlayerData);
    });
    await expect(host.locator('#mySpecialCardsList .special-card-meta-row').filter({ hasText: `#${next.seat} ${next.name}` })).toBeVisible();
    await host.evaluate(() => {
      myPlayerData.specialCards[0].effectType = 'forceUpperPlayerRevealRandomCharacteristic';
      myPlayerData.specialCard = myPlayerData.specialCards[0]; renderMySpecialCards(myPlayerData);
    });
    await expect(host.locator('#mySpecialCardsList .special-card-meta-row').filter({ hasText: `#${previous.seat} ${previous.name}` })).toBeVisible();

    await host.reload();
    await expect(host.locator('.player-dossier-card')).toHaveCount(4, { timeout: 15000 });
    const seatsAfterReconnect = await host.locator('.player-dossier-card').evaluateAll(cards => cards.map(card => ({ seat: card.dataset.canonicalSeat, name: card.querySelector('h3').textContent.trim() })));
    expect(new Map(seatsAfterReconnect.map(item => [item.name, item.seat]))).toEqual(new Map(originalDossiers.map(item => [item.name, item.seat])));
  } finally {
    await room.close();
  }
});

test('edge fixtures support zero one and twelve players without hidden data or duplicate cards', async ({ browser }) => {
  test.setTimeout(65000);
  const room = await createTwoPlayerRoom(browser, `Player edges ${Date.now()}`);
  try {
    await startTwoPlayerGame(room);
    await room.host.evaluate(() => { roomPlayers = {}; selectedPublicPlayerSeat = null; renderPublicPlayerOverview(); });
    await expect(room.host.locator('#playerDossierGrid .player-overview-empty')).toContainText(/Немає доступних|No available|Нет доступных/);
    await expect(room.host.locator('.player-selector-item')).toHaveCount(0);

    await room.host.evaluate(() => {
      roomPlayers = { only: { name: 'Only player', connectionId: myConnectionId, stablePlayerId: getMyStablePlayerId(), seatNumber: 1, isHost: true, revealed: {} } };
      renderPublicPlayerOverview();
    });
    await expect(room.host.locator('.player-selector-item')).toHaveCount(1);
    await expect(room.host.locator('[data-overview-nav="previous"]')).toBeDisabled();
    await expect(room.host.locator('.public-characteristic-card')).toHaveCount(10);

    await room.host.evaluate(() => {
      roomPlayers = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [`six-${index}`, {
        name: `Six player ${index + 1}`, connectionId: `six-${index}`, stablePlayerId: `six-stable-${index}`,
        seatNumber: index + 1, revealed: {}
      }]));
      renderPublicPlayerOverview();
    });
    await expect(room.host.locator('.player-dossier-card')).toHaveCount(6);

    await room.host.evaluate(() => {
      roomPlayers = Object.fromEntries(Array.from({ length: 12 }, (_, index) => [`fixture-${index}`, {
        name: index === 10 ? 'A very long public player name that must wrap safely inside the dossier rail' : `Player ${index + 1}`,
        connectionId: `fixture-${index}`, stablePlayerId: `stable-${index}`, seatNumber: 12 - index, isHost: index === 0,
        isEliminated: index === 1, isConnected: index !== 2, revealed: {}, revealedData: { profession: 'NEVER_RENDER_THIS' }
      }]));
      selectedPublicPlayerSeat = null; renderPublicPlayerOverview();
    });
    expect(await room.host.locator('.player-selector-seat').allTextContents()).toEqual(Array.from({ length: 12 }, (_, index) => `#${index + 1}`));
    await expect(room.host.locator('.player-selector-item')).toHaveCount(12);
    await expect(room.host.locator('.player-dossier-card')).toHaveCount(12);
    expect(await room.host.locator('#publicPlayerOverview').evaluate(element => element.outerHTML.includes('NEVER_RENDER_THIS'))).toBe(false);
  } finally {
    await room.close();
  }
});

test('390 mobile uses horizontal touch selector and one-column public cards without page overflow', async ({ browser }) => {
  test.setTimeout(70000);
  const room = await createTwoPlayerRoom(browser, `Player mobile ${Date.now()}`);
  try {
    await room.host.setViewportSize({ width: 390, height: 844 });
    await room.guest.setViewportSize({ width: 390, height: 844 });
    await startTwoPlayerGame(room);
    const metrics = await room.host.evaluate(() => {
      const dossierGrid = document.querySelector('.player-dossier-grid');
      return {
        dossierColumns: getComputedStyle(dossierGrid).gridTemplateColumns.split(' ').filter(Boolean).length,
        overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
      };
    });
    expect(metrics.dossierColumns).toBe(1);
    expect(metrics.overflow).toBe(false);
    const toggleBox = await room.host.locator('[data-player-view="single"]').boundingBox();
    expect(toggleBox.height).toBeGreaterThanOrEqual(44);
    await room.host.locator('#playerComparisonSort').selectOption('name');
    await room.host.locator('[data-player-view="single"]').click();
    const secondName = (await room.host.locator('#publicPlayerSelector [data-player-seat="2"] .player-selector-name').innerText()).trim();
    await room.host.locator('#publicPlayerSelector [data-player-seat="2"]').click();
    await expect(room.host.locator('#selectedPlayerPanel')).toContainText(secondName);
  } finally {
    await room.close();
  }
});
