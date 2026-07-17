const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({
	ignoreHTTPSErrors: true,
});

async function getInventoryItems(page) {
	const value = await page.locator('#myPlayerCards').evaluate(container => {
		const clean = text => String(text || '').replace(/\s+/g, ' ').trim();
		const inventoryCard = container.querySelector('[data-characteristic-type="Inventory"]');
		return clean(inventoryCard?.querySelector('.vault-card-value')?.innerText || '');
	});

	return value.split(/\s*,\s*/).map(item => item.trim()).filter(Boolean);
}

async function readyAndStartGame(room) {
	await expect(room.host.locator('#lobbyReadyButton')).toBeVisible({ timeout: 15000 });
	await room.host.locator('#lobbyReadyButton').click();
	await expect(room.host.locator('#lobbyReadyButton')).toContainText(/Скасувати готовність|Cancel readiness|Отменить готовность/i, { timeout: 15000 });

	await expect(room.guest.locator('#lobbyReadyButton')).toBeVisible({ timeout: 15000 });
	await room.guest.locator('#lobbyReadyButton').click();
	await expect(room.guest.locator('#lobbyReadyButton')).toContainText(/Скасувати готовність|Cancel readiness|Отменить готовность/i, { timeout: 15000 });
	await expect(room.host.locator('#lobbyReadyProgress')).toContainText(/2\s+(?:із|of|из)\s+2/i, { timeout: 15000 });

	await room.host.locator('#lobbyStartPreviewButton').click();
	await expect(room.host.locator('#lobbyStartPrimaryButton')).toBeEnabled({ timeout: 15000 });
	await room.host.locator('#lobbyStartPrimaryButton').click();
	await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
	await expect(room.guest.locator('#gameSection')).toBeVisible({ timeout: 15000 });
}

async function openGmPanel(page) {
	const panel = page.locator('#gmPanel');
	if (!(await panel.isVisible().catch(() => false))) {
		await page.locator('#gmPanelBtn').click();
	}
	await expect(panel).toBeVisible({ timeout: 15000 });
	await page.locator('[data-gm-tab-button="round"]').click();
	await expect(page.locator('#gmRoundSection')).toBeVisible({ timeout: 15000 });
}

async function revealAllPlayersForRound(room) {
	await room.host.locator('#myPlayerCards .char-btn.locked:not(:disabled)').first().click();
	await room.guest.locator('#myPlayerCards .char-btn.locked:not(:disabled)').first().click();

	await openGmPanel(room.host);
	await expect(room.host.locator('#endRoundBtn')).toBeEnabled({ timeout: 15000 });
}

async function endCurrentRound(room) {
	await openGmPanel(room.host);
	await expect(room.host.locator('#endRoundBtn')).toBeEnabled({ timeout: 15000 });
	await room.host.locator('#endRoundBtn').click();
	if (await room.host.locator('#gmPanel').isVisible().catch(() => false)) {
		await room.host.locator('#gmPanel .btn-close').click();
	}
}

async function directStartVoting(page) {
	await page.evaluate(() => connection.invoke('StartVoting'));
}

async function revealAndEndRound(room) {
	await revealAllPlayersForRound(room);
	await endCurrentRound(room);
}

test('profession bonus item is shown as one inventory item, not in profession name', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Profession Inventory ${Date.now()}`);

	try {
		await readyAndStartGame(room);
		await room.host.evaluate(() => {
			myPlayerData.profession.name = 'Оборотень (+Ланцюги)';
			myPlayerData.profession.tooltip = 'Вміє перетворюватися на вовка (міфологія).';
			myPlayerData.profession._i18n = {
				profession: {
					uk: 'Оборотень (+Ланцюги)',
					en: 'Werewolf (+Chains)',
					ru: 'Оборотень (+Цепи)',
				},
			};
			myPlayerData.inventory = { items: [{ name: 'Ланцюги' }] };
			renderCurrentGameUI();
		});

		const characterValues = await room.host.locator('#myPlayerCards').evaluate(container => {
			const clean = value => String(value || '').replace(/\s+/g, ' ').trim();
			const findCard = type => container.querySelector(`[data-characteristic-type="${type}"]`);
			const cardValue = card => clean(card?.querySelector('.vault-card-value')?.innerText || '');

			return {
				profession: cardValue(findCard('Profession')),
				professionTooltip: clean(findCard('Profession')?.querySelector('.tooltip-content')?.innerText || ''),
				inventory: cardValue(findCard('Inventory')),
			};
		});

		expect(characterValues.profession).toBeTruthy();
		expect(characterValues.profession).not.toMatch(/\(\+\s*[^)]+\)/);
		expect(characterValues.profession).toContain('Оборотень');
		expect(characterValues.professionTooltip).not.toMatch(/міфологія|adult content|combat|weird|feature/i);
		expect(characterValues.inventory).toBeTruthy();
		expect(characterValues.inventory).toContain('Ланцюги');
	} finally {
		await room.close();
	}
});

test('round three completion reveals threat, grants inventory, then unlocks voting after ready check', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Round Three Inventory ${Date.now()}`);

	try {
		await readyAndStartGame(room);
		const initialHostItems = await getInventoryItems(room.host);
		const initialGuestItems = await getInventoryItems(room.guest);

		await expect(room.host.locator('#roundStatusNumber')).toHaveText('Раунд 1', { timeout: 15000 });
		await openGmPanel(room.host);
		await expect(room.host.locator('#gmRoundSection')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#gmCurrentRound')).toHaveText('Раунд 1', { timeout: 15000 });
		await expect(room.host.locator('#startReadyCheckBtn')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#startReadyCheckBtn')).toBeDisabled();

		await directStartVoting(room.host);
		await expect(room.host.locator('#events')).toContainText('Голосування доступне тільки після завершення 3 раунду', {
			timeout: 15000,
		});

		await revealAndEndRound(room);
		await expect(room.host.locator('#roundStatusNumber')).toHaveText('Раунд 2', { timeout: 15000 });
		await expect(room.host.locator('#startVotingBtn')).toBeHidden();

		await directStartVoting(room.host);
		await expect(room.host.locator('#events')).toContainText('Голосування доступне тільки після завершення 3 раунду', {
			timeout: 15000,
		});

		await revealAndEndRound(room);
		await expect(room.host.locator('#roundStatusNumber')).toHaveText('Раунд 3', { timeout: 15000 });
		await expect(room.host.locator('#startVotingBtn')).toBeHidden();

		await revealAllPlayersForRound(room);
		await directStartVoting(room.host);
		await expect(room.host.locator('#events')).toContainText('Спершу завершіть 3 раунд', {
			timeout: 15000,
		});

		await endCurrentRound(room);

		await expect(room.host.locator('#events')).toContainText('додатковий інвентар', {
			timeout: 15000,
		});
		await expect(room.host.locator('#threatPanel')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#startVotingBtn')).toBeHidden();

		await expect.poll(() => getInventoryItems(room.host)).toHaveLength(initialHostItems.length + 1);
		await expect.poll(() => getInventoryItems(room.guest)).toHaveLength(initialGuestItems.length + 1);

		await directStartVoting(room.host);
		await expect(room.host.locator('#events')).toContainText('Спершу завершіть 3 раунд і запустіть готовність', {
			timeout: 15000,
		});

		await openGmPanel(room.host);
		await expect(room.host.locator('#startReadyCheckBtn')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#startReadyCheckBtn')).toBeEnabled({ timeout: 15000 });
		await room.host.locator('#startReadyCheckBtn').click();
		await expect(room.host.locator('#readyCheckPanel')).toBeVisible({ timeout: 15000 });
		await expect(room.guest.locator('#readyCheckPanel')).toBeVisible({ timeout: 15000 });
		await room.host.getByRole('button', { name: /^Готовий$/ }).click();
		await room.guest.getByRole('button', { name: /Хочу щось додати/i }).click();
		await expect(room.host.locator('#gmReadyStatusList')).toContainText('Готовий', { timeout: 15000 });
		await expect(room.host.locator('#gmReadyStatusList')).toContainText('Хоче щось додати', { timeout: 15000 });
		await expect(room.host.locator('#startVotingBtn')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#gmStartVotingBtn')).toBeVisible({ timeout: 15000 });

		await room.host.reload();
		await expect(room.host.locator('#readyCheckPanel')).toBeVisible({ timeout: 15000 });
		await openGmPanel(room.host);
		await expect(room.host.locator('#gmReadyStatusList')).toContainText('Готовий', { timeout: 15000 });
		await expect(room.host.locator('#gmReadyStatusList')).toContainText('Хоче щось додати', { timeout: 15000 });
		await expect(room.host.locator('#gmStartVotingBtn')).toBeVisible({ timeout: 15000 });

		await room.host.locator('#gmStartVotingBtn').click();
		await expect(room.host.locator('#votingPanel')).toBeVisible({ timeout: 15000 });
		await expect(room.guest.locator('#votingPanel')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#votingRound')).toHaveText('3', { timeout: 15000 });
	} finally {
		await room.close();
	}
});

test('reveal is blocked while players are still in the lobby', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Lobby Reveal Block ${Date.now()}`);

	try {
		const firstRevealButton = room.host.locator('#myPlayerCards .char-btn.locked').first();
		await expect(firstRevealButton).toBeVisible({ timeout: 15000 });
		await expect(firstRevealButton).toBeDisabled();

		await room.host.evaluate(() => window.reveal('Profession'));

		await expect(room.host.locator('#events')).toContainText('Гра ще не почалась', {
			timeout: 15000,
		});
		await expect(room.host.locator('#myPlayerCards .status-revealed')).toHaveCount(0);
	} finally {
		await room.close();
	}
});

test('current round and phase survive host refresh', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Round Phase Refresh ${Date.now()}`);

	try {
		await readyAndStartGame(room);

		await revealAndEndRound(room);
		await expect(room.host.locator('#roundStatusNumber')).toHaveText('Раунд 2', { timeout: 15000 });

		await room.host.reload();
		await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#roundStatusNumber')).toHaveText('Раунд 2', { timeout: 15000 });
		await expect(room.host.locator('#roundStatusPhase')).toHaveText('Розкриття характеристик', { timeout: 15000 });

		await revealAndEndRound(room);
		await revealAllPlayersForRound(room);
		await endCurrentRound(room);

		await expect(room.host.locator('#roundStatusNumber')).toHaveText('Раунд 3', { timeout: 15000 });
		await expect(room.host.locator('#roundStatusPhase')).toHaveText('Додатковий інвентар', { timeout: 15000 });
		await expect(room.host.locator('#threatPanel')).toBeVisible({ timeout: 15000 });

		await room.host.reload();
		await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#roundStatusNumber')).toHaveText('Раунд 3', { timeout: 15000 });
		await expect(room.host.locator('#roundStatusPhase')).toHaveText('Додатковий інвентар', { timeout: 15000 });
		await expect(room.host.locator('#threatPanel')).toBeVisible({ timeout: 15000 });
	} finally {
		await room.close();
	}
});

test('host can roll dice once after all players reveal in a round', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Round Dice ${Date.now()}`);

	try {
		await readyAndStartGame(room);

		await openGmPanel(room.host);
		await expect(room.host.locator('#rollDiceBtn')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#rollDiceBtn')).toBeDisabled();

		await room.host.evaluate(() => connection.invoke('RollRoundDice'));
		await expect(room.host.locator('#events')).toContainText('Кубик доступний після reveal усіх активних гравців', {
			timeout: 15000,
		});

		await revealAllPlayersForRound(room);
		await expect(room.host.locator('#rollDiceBtn')).toBeEnabled({ timeout: 15000 });
		await room.host.locator('#rollDiceBtn').click();

		await expect(room.host.locator('#roundDiceResult')).toContainText(/Кубик: [1-6]/, { timeout: 15000 });
		await expect(room.guest.locator('#roundDiceResult')).toContainText(/Кубик: [1-6]/, { timeout: 15000 });
		await expect(room.host.locator('#gmDiceResult')).toContainText(/Кубик: [1-6]/, { timeout: 15000 });
		await expect(room.host.locator('#rollDiceBtn')).toBeDisabled({ timeout: 15000 });

		const diceText = await room.host.locator('#roundDiceResult').innerText();
		await room.host.evaluate(() => connection.invoke('RollRoundDice'));
		await expect(room.host.locator('#events')).toContainText('Кубик у цьому раунді вже кинуто', {
			timeout: 15000,
		});

		await room.host.reload();
		await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#roundDiceResult')).toHaveText(diceText, { timeout: 15000 });
	} finally {
		await room.close();
	}
});

test('host can start the game and reveal a characteristic', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Start Reveal ${Date.now()}`);

	try {
		await readyAndStartGame(room);

		const firstRevealButton = room.host.locator('#myPlayerCards .char-btn.locked').first();
		await expect(firstRevealButton).toBeVisible({ timeout: 15000 });
		await firstRevealButton.click();

		await expect(room.host.locator('#myPlayerCards .status-revealed').first()).toBeVisible({
			timeout: 15000,
		});
		await room.guest.locator('[data-player-view="single"]').click();
		await room.guest.locator('#publicPlayerSelector .player-selector-item').filter({ hasText: 'P1' }).click();
		await expect(room.guest.locator('#selectedPlayerPanel')).toContainText('P1', {
			timeout: 15000,
		});
		await expect(room.guest.locator('#selectedPlayerPanel')).not.toContainText(/No character data/i);
	} finally {
		await room.close();
	}
});

test('a player can reveal only one characteristic in the current round', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `One Reveal ${Date.now()}`);

	try {
		await readyAndStartGame(room);

		const firstRevealButton = room.host.locator('#myPlayerCards .char-btn.locked:not(:disabled)').first();
		await expect(firstRevealButton).toBeVisible({ timeout: 15000 });
		await firstRevealButton.click();

		await expect(room.host.locator('#myPlayerCards .status-revealed')).toHaveCount(1, {
			timeout: 15000,
		});

		const nextRevealButton = room.host.locator('#myPlayerCards .char-btn.locked').first();
		await expect(nextRevealButton).toBeDisabled({ timeout: 15000 });

		await room.host.evaluate(() => window.reveal('Body'));
		await expect(room.host.locator('#events')).toContainText('У цьому раунді ви вже розкрили', {
			timeout: 15000,
		});
		await expect(room.host.locator('#myPlayerCards .status-revealed')).toHaveCount(1);
	} finally {
		await room.close();
	}
});
