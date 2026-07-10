const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
	createRoom,
	joinRoom,
	newContextWithNgrokBypass,
} = (() => {
	const helpers = require('./game-test-helpers');
	const ngrok = require('./ngrok-bypass');
	return { ...helpers, newContextWithNgrokBypass: ngrok.newContextWithNgrokBypass };
})();

test.use({
	ignoreHTTPSErrors: true,
});

async function createThreePlayerRoom(browser, roomName) {
	const hostContext = await newContextWithNgrokBypass(browser, { ignoreHTTPSErrors: true });
	const guestContext = await newContextWithNgrokBypass(browser, { ignoreHTTPSErrors: true });
	const thirdContext = await newContextWithNgrokBypass(browser, { ignoreHTTPSErrors: true });

	const host = await hostContext.newPage();
	const guest = await guestContext.newPage();
	const third = await thirdContext.newPage();

	await createRoom(host, 'P1', roomName, { maxPlayers: 6 });
	await joinRoom(guest, 'P2', roomName);
	await joinRoom(third, 'P3', roomName);

	await expect(host.locator('#roomPlayersList')).toContainText('P3', { timeout: 15000 });
	await expect(guest.locator('#roomPlayersList')).toContainText('P3', { timeout: 15000 });
	await expect(third.locator('#roomPlayersList')).toContainText('P1', { timeout: 15000 });

	return {
		host,
		guest,
		third,
		close: async () => {
			await thirdContext.close().catch(() => {});
			await guestContext.close().catch(() => {});
			await hostContext.close().catch(() => {});
		},
	};
}

async function openGmPanel(page) {
	const panel = page.locator('#gmPanel');
	if (!(await panel.isVisible().catch(() => false))) {
		await page.locator('#gmPanelBtn').click();
	}
	await expect(panel).toBeVisible({ timeout: 15000 });
}

async function revealAllPlayersForRound(room) {
	for (const page of [room.host, room.guest, room.third]) {
		await page.locator('#myPlayerCards .char-btn.locked:not(:disabled)').first().click();
	}

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

async function reachReadyCheck(room) {
	await room.host.locator('#startGameBtn').click();
	await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
	await expect(room.guest.locator('#gameSection')).toBeVisible({ timeout: 15000 });
	await expect(room.third.locator('#gameSection')).toBeVisible({ timeout: 15000 });

	await revealAllPlayersForRound(room);
	await endCurrentRound(room);
	await revealAllPlayersForRound(room);
	await endCurrentRound(room);
	await revealAllPlayersForRound(room);
	await endCurrentRound(room);

	await expect(room.host.locator('#roundStatusPhase')).toHaveText('Додатковий інвентар', { timeout: 15000 });
	await openGmPanel(room.host);
	await expect(room.host.locator('#startReadyCheckBtn')).toBeEnabled({ timeout: 15000 });
	await room.host.locator('#startReadyCheckBtn').click();
	await expect(room.host.locator('#readyCheckPanel')).toBeVisible({ timeout: 15000 });
}

async function assignDoublePressureToHost(room) {
	const hostConnectionId = await room.host.evaluate(() => myConnectionId);
	await room.host.evaluate(async ({ hostConnectionId }) => {
		await connection.invoke(
			'EditPlayerCharacteristic',
			hostConnectionId,
			'SpecialCard',
			'double_votes_against_target',
		);
	}, { hostConnectionId });

	await expect(room.host.locator('[data-testid="my-special-card"]')).toContainText('Подвійний тиск', { timeout: 15000 });
}

test('special cards data and production files are present', async () => {
	const dataPath = path.join(process.cwd(), 'wwwroot', 'data', 'special_cards.json');
	const hubPath = path.join(process.cwd(), 'Hubs', 'GameHub', 'GameHub.SpecialCards.cs');

	expect(fs.existsSync(dataPath)).toBe(true);
	expect(fs.existsSync(hubPath)).toBe(true);

	const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
	expect(data.special_cards).toEqual(expect.any(Array));
	expect(data.special_cards.length).toBeGreaterThan(0);
	expect(data.special_cards[0]).toMatchObject({
		effectType: 'doubleVotesAgainstTargetAndBlockCasterVote',
		requiresTarget: true,
	});
});

test('special cards render as a private characteristic and public table', async ({ browser }) => {
	const room = await createThreePlayerRoom(browser, `Special Cards UI ${Date.now()}`);

	try {
		await room.host.locator('#startGameBtn').click();
		await expect(room.host.locator('[data-testid="my-special-card"]')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('[data-testid="my-special-card"]')).toContainText('Спеціальна карта');
		await expect(room.host.locator('#specialCardsSection')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('[data-testid="special-cards-table"] tbody tr')).toHaveCount(3);
		await expect(room.host.locator('[data-testid="special-cards-table"]')).toContainText('P1');

		await openGmPanel(room.host);
		await expect(room.host.locator('#gmSpecialCardsList')).toBeVisible({ timeout: 15000 });
		await room.host.locator('#gmPlayerSelect').selectOption({ index: 1 });
		await expect(room.host.locator('#gmPlayerInfo')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#gmSpecialCard')).toBeVisible({ timeout: 15000 });
	} finally {
		await room.close();
	}
});

test('activated special card blocks owner vote and doubles votes against target', async ({ browser }) => {
	const room = await createThreePlayerRoom(browser, `Special Card Effect ${Date.now()}`);

	try {
		await reachReadyCheck(room);
		await assignDoublePressureToHost(room);

		const p2ConnectionId = await room.host.evaluate(() => {
			const player = Object.values(roomPlayers).find(p => p.name === 'P2');
			return player?.connectionId || '';
		});

		await room.host.locator('#specialCardTargetSelect').selectOption(p2ConnectionId);
		await room.host.locator('[data-testid="special-card-use"]').click();
		await expect(room.host.locator('#specialCardsSection')).toContainText('Активна', { timeout: 15000 });
		await expect(room.guest.locator('#specialCardsSection')).toContainText('P2', { timeout: 15000 });

		await expect(room.host.locator('#gmStartVotingBtn')).toBeVisible({ timeout: 15000 });
		await room.host.locator('#gmStartVotingBtn').click();

		await expect(room.host.locator('#votingCandidates')).toContainText('Ваш голос заблоковано', { timeout: 15000 });
		await expect(room.host.locator('#votingCandidates .btn-vote-for')).toHaveCount(0);

		const p2Candidate = room.third.locator('.voting-candidate').filter({ hasText: 'P2' });
		await p2Candidate.getByRole('button', { name: 'Голосувати' }).click();
		await expect(room.third.locator('#myVoteTarget')).toHaveText('P2', { timeout: 15000 });

		await room.host.locator('#votingHostControls .btn-warning').click();
		await expect(room.host.locator('#votingResultsPanel')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#votingResultsContent')).toContainText('Ефекти спеціальних карт', { timeout: 15000 });
		await expect(room.host.locator('#votingResultsContent')).toContainText('P2');
		await expect(room.host.locator('#votingResultsContent')).toContainText(/2 голос/);
	} finally {
		await room.close();
	}
});
