const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({
	ignoreHTTPSErrors: true,
});

test('host panel opens after game start and keeps normal GM controls', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Host Panel ${Date.now()}`);

	try {
		await room.host.locator('#lobbyReadyButton').click();
		await room.guest.locator('#lobbyReadyButton').click();
		await room.host.locator('#lobbyStartPreviewButton').click();
		await expect(room.host.locator('#lobbyStartPreview')).toContainText(
			/готова до старту|ready to start|готова к старту/i,
			{ timeout: 15000 }
		);
		await expect(room.host.locator('#startGameBtn')).toBeEnabled();
		const guestWarning = room.host.locator('#guestAccountWarningModal');
		if (await guestWarning.isVisible())
			await room.host.locator('#guestWarningContinueButton').click();
		await room.host.locator('#startGameBtn').click();
		await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });

		const gmButton = room.host.locator('#gmPanelBtn');
		await expect(gmButton).toBeVisible({ timeout: 15000 });
		await gmButton.click();

		await expect(room.host.locator('#gmPanel')).toBeVisible({ timeout: 15000 });
		await room.host.locator('[data-gm-tab-button="players"]').click();
		await expect(room.host.locator('#gmPlayerSelect')).toBeVisible();
		await expect(room.host.locator('#gmScenarioSection')).toBeHidden();
		await room.host.locator('[data-gm-tab-button="events"]').click();
		await expect(room.host.locator('#gmScenarioSection')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('#gmEventsSection')).toBeVisible({ timeout: 15000 });

		const panel = room.host.locator('#gmPanel');
		const content = room.host.locator('#gmPanel .gm-panel-v2-content');
		const header = room.host.locator('#gmPanel .gm-panel-v2-header');
		const eventButton = room.host.locator('#gmEventsSection .btn-send-event');

		const panelBox = await panel.boundingBox();
		const headerBox = await header.boundingBox();
		expect(panelBox).not.toBeNull();
		expect(headerBox).not.toBeNull();
		const viewportHeight = await room.host.evaluate(() => window.innerHeight);
		expect(panelBox.height).toBeLessThanOrEqual(viewportHeight);
		expect(panelBox.height).toBeGreaterThanOrEqual(viewportHeight - 2);

		const scrollState = await content.evaluate(element => ({
			clientHeight: element.clientHeight,
			scrollHeight: element.scrollHeight,
			overflowY: getComputedStyle(element).overflowY,
		}));
		expect(scrollState.overflowY).toBe('auto');
		expect(scrollState.scrollHeight).toBeGreaterThanOrEqual(scrollState.clientHeight);

		await eventButton.scrollIntoViewIfNeeded();
		await expect(eventButton).toBeVisible();
		await expect(eventButton).toBeEnabled();
		await eventButton.click();
		await room.host.locator('[data-gm-tab-button="threats"]').click();
		await expect(room.host.locator('#gmSpecificThreatControls')).toBeHidden();
	} finally {
		await room.close();
	}
});
