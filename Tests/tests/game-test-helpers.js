const { expect } = require('@playwright/test');
const { BASE_URL, setupNgrokBypass, newContextWithNgrokBypass } = require('./ngrok-bypass');

const GAME_URL = process.env.GAME_URL || `${BASE_URL}/game`;

async function preparePage(page) {
	await setupNgrokBypass(page);
	page.on('dialog', dialog => dialog.accept());
}

async function createRoom(page, playerName, roomName, options = {}) {
	await preparePage(page);
	await page.goto(GAME_URL);

	await page.getByTestId('player-name-input').fill(playerName);
	await page.getByTestId('room-name-input').fill(roomName);

	if (options.maxPlayers) {
		await page.getByTestId('room-max-players-input').fill(String(options.maxPlayers));
	}

	if (options.password) {
		await page.getByTestId('room-password-input').fill(options.password);
	}

	await page.getByTestId('create-room-btn').click();

	const playersList = page.locator('#lobbyMembers');
	await expect(playersList).toContainText(playerName, { timeout: 15000 });
	await expect(page.locator('#roomLobby')).toBeVisible({ timeout: 15000 });
	await expect(page.locator('#myPlayerSection')).toBeHidden();

	return playersList;
}

async function joinRoom(page, playerName, roomName) {
	await preparePage(page);
	await page.goto(GAME_URL);

	await page.getByTestId('player-name-input').fill(playerName);

	const roomTitle = page.getByText(roomName).first();
	await expect(roomTitle).toBeVisible({ timeout: 15000 });

	const roomCard = roomTitle.locator(
		'xpath=ancestor::*[.//button[contains(., "Приєднатися") or contains(., "Присоединиться") or contains(., "Join")]][1]'
	);
	await expect(roomCard).toBeVisible({ timeout: 15000 });

	await roomCard.getByRole('button', {
		name: /Приєднатися|Присоединиться|Join/i,
	}).click();

	await expect(page.locator('#lobbyMembers')).toContainText(playerName, { timeout: 15000 });
	await expect(page.locator('#roomLobby')).toBeVisible({ timeout: 15000 });
	await expect(page.locator('#myPlayerSection')).toBeHidden();
}

async function createTwoPlayerRoom(browser, roomName) {
	const hostContext = await newContextWithNgrokBypass(browser, {
		ignoreHTTPSErrors: true,
	});
	const guestContext = await newContextWithNgrokBypass(browser, {
		ignoreHTTPSErrors: true,
	});

	const host = await hostContext.newPage();
	const guest = await guestContext.newPage();

	await createRoom(host, 'P1', roomName, { maxPlayers: 6 });
	await joinRoom(guest, 'P2', roomName);

	await expect(host.locator('#lobbyMembers')).toContainText('P2', { timeout: 15000 });
	await expect(guest.locator('#lobbyMembers')).toContainText('P1', { timeout: 15000 });

	return {
		host,
		guest,
		hostContext,
		guestContext,
		close: async () => {
			await guestContext.close().catch(() => {});
			await hostContext.close().catch(() => {});
		},
	};
}

module.exports = {
	BASE_URL,
	GAME_URL,
	preparePage,
	createRoom,
	joinRoom,
	createTwoPlayerRoom,
};
