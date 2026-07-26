const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({
	ignoreHTTPSErrors: true,
});

test('host panel opens after game start and keeps normal GM controls', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Host Panel ${Date.now()}`);
	const consoleErrors = [];
	room.host.on('console', message => {
		if (message.type() === 'error') consoleErrors.push(message.text());
	});

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
		await room.host.evaluate(() => changeLanguage('uk'));
		await gmButton.click();

		await expect(room.host.locator('#gmPanel')).toBeVisible({ timeout: 15000 });
		await expect(room.host.locator('[data-gm-tab-button="game"]')).toBeVisible();
		await expect(room.host.locator('[data-gm-tab-button="events"]')).toBeVisible();
		await expect(room.host.locator('[data-gm-tab-button="history"]')).toBeVisible();
		await expect(room.host.locator('#gmGameStateSummary .gm-status-card')).toHaveCount(8);
		await expect(room.host.locator('#gmPrimaryActionButton')).toHaveCount(1);
		const operationalText = await room.host.locator('#gmPanel').innerText();
		expect(operationalText).not.toMatch(/\b(?:Playing|RoundReveal|Inactive|Hidden|Stopped)\b/);
		await expect(room.host.locator('#gmGameStateSummary')).toContainText(
			/Гра триває|Розкриття характеристик|Зупинено|Неактивне|Прихована/
		);
		expect(await room.host.locator('#gmPanel .gm-action-primary:visible').count()).toBeLessThanOrEqual(1);

		const roundAccordion = room.host.locator('#gmRoundOperationsToggle');
		await expect(roundAccordion).toHaveAttribute('aria-expanded', 'false');
		await roundAccordion.click();
		await expect(roundAccordion).toHaveAttribute('aria-expanded', 'true');
		await expect(room.host.locator('#gmRoundOperationsPanel')).toBeVisible();
		await roundAccordion.click();
		await expect(roundAccordion).toHaveAttribute('aria-expanded', 'false');
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
		await room.host.locator('[data-gm-event-template="earthquake"]').click();
		await expect(room.host.locator('#gmEventText')).toHaveValue(
			/Землетрус! Частина бункера пошкоджена\./
		);
		await expect(room.host.locator('#gmEventType')).toHaveValue('catastrophe');
		await eventButton.click();
		await room.host.locator('[data-gm-tab-button="events"]').click();
		await expect(room.host.locator('#gmSpecificThreatControls')).toBeHidden();
		const diagnosticsTab = room.host.locator('[data-gm-tab-button="diagnostics"]');
		const toolsTab = room.host.locator('[data-gm-tab-button="tools"]');
		const recoveryTab = room.host.locator('[data-gm-tab-button="recovery"]');
		if (await diagnosticsTab.isVisible()) {
			await diagnosticsTab.click();
			await expect(room.host.locator('#gmDiagnosticsSection')).toBeVisible();
			await expect(room.host.locator('#gmDiagnosticsSection')).toHaveAttribute(
				'data-gm-requires-capability',
				'CanUseTechnicalTools'
			);
		} else {
			await expect(room.host.locator('#gmDiagnosticsSection')).toHaveCount(0);
		}
		if (await toolsTab.isVisible()) {
			await toolsTab.click();
			await expect(room.host.locator('#gmDiagnosticsToolsSection')).toBeVisible();
		} else await expect(room.host.locator('#gmDiagnosticsToolsSection')).toHaveCount(0);
		if (await recoveryTab.isVisible()) await recoveryTab.click();
		else await expect(room.host.locator('#gmRecoverySection')).toHaveCount(0);

		await room.host.setViewportSize({ width: 390, height: 844 });
		const horizontalOverflow = await room.host.locator('#gmPanel').evaluate(element =>
			element.scrollWidth > element.clientWidth
		);
		expect(horizontalOverflow).toBe(false);

		await room.host.reload({ waitUntil: 'domcontentloaded' });
		await expect(room.host.locator('#gmPanelBtn')).toBeVisible({ timeout: 15000 });
		if (!(await room.host.locator('#gmPanel').getAttribute('class')).includes('is-open'))
			await room.host.locator('#gmPanelBtn').click();
		await expect(room.host.locator('#gmPanelSimpleMode')).toHaveCount(0);
		await expect(room.host.locator('#gmPanelAdvancedMode')).toHaveCount(0);
		expect(consoleErrors).toEqual([]);
	} finally {
		await room.close();
	}
});
