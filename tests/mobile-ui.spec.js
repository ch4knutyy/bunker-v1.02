const { test, expect } = require('@playwright/test');
const { GAME_URL, preparePage } = require('./game-test-helpers');

test.use({
	ignoreHTTPSErrors: true,
	viewport: { width: 390, height: 844 },
	isMobile: true,
	hasTouch: true,
});

test('mobile game page keeps lobby controls usable', async ({ page }) => {
	await preparePage(page);
	await page.goto(GAME_URL);

	await expect(page.locator('#lobbySection')).toBeVisible({ timeout: 15000 });
	await expect(page.getByTestId('player-name-input')).toBeVisible();
	await expect(page.getByTestId('room-name-input')).toBeVisible();
	await expect(page.getByTestId('room-max-players-input')).toBeVisible();
	await expect(page.getByTestId('room-password-input')).toBeVisible();
	await expect(page.getByTestId('create-room-btn')).toBeVisible();

	await page.getByTestId('player-name-input').fill('Mob');
	await page.getByTestId('room-name-input').fill(`Mobile UI ${Date.now()}`);
	await page.getByTestId('create-room-btn').click();

	await expect(page.locator('#roomPlayersList')).toContainText('Mob', { timeout: 15000 });
	await expect(page.locator('#myPlayerSection')).toBeVisible({ timeout: 15000 });

	const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
	expect(overflow).toBeLessThanOrEqual(2);
});
