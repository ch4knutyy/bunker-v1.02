const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({
	ignoreHTTPSErrors: true,
});

test('host can start the game and reveal a characteristic', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Start Reveal ${Date.now()}`);

	try {
		await expect(room.host.locator('#startGameBtn')).toBeVisible({ timeout: 15000 });
		await room.host.locator('#startGameBtn').click();

		await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
		await expect(room.guest.locator('#gameSection')).toBeVisible({ timeout: 15000 });

		const firstRevealButton = room.host.locator('#myPlayerCards .char-btn.locked').first();
		await expect(firstRevealButton).toBeVisible({ timeout: 15000 });
		await firstRevealButton.click();

		await expect(room.host.locator('#myPlayerCards .status-revealed').first()).toBeVisible({
			timeout: 15000,
		});
		await expect(room.guest.locator('#playersTableBody')).toContainText('P1', {
			timeout: 15000,
		});
		await expect(room.guest.locator('#playersTableBody')).not.toContainText(/No character data/i);
	} finally {
		await room.close();
	}
});
