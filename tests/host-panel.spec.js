const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({
	ignoreHTTPSErrors: true,
});

test('host panel opens after game start and keeps normal GM controls', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Host Panel ${Date.now()}`);

	try {
		await room.host.locator('#startGameBtn').click();
		await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });

		const gmButton = room.host.locator('#gmPanelBtn');
		await expect(gmButton).toBeVisible({ timeout: 15000 });
		await gmButton.click();

		await expect(room.host.locator('#gmPanel')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#gmPlayerSelect')).toBeVisible();
		await expect(room.host.locator('#gmScenarioSection')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#gmEventsSection')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#gmPanel')).not.toContainText(/спеціальні карти|special cards/i);
	} finally {
		await room.close();
	}
});
