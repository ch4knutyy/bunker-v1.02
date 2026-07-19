const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

async function readyAndStartGame(room) {
	await room.host.locator('#lobbyReadyButton').click();
	await room.guest.locator('#lobbyReadyButton').click();
	await expect(room.host.locator('#lobbyReadyProgress')).toContainText(/2\s+(?:із|of|из)\s+2/i, {
		timeout: 15000,
	});
	await room.host.locator('#lobbyStartPreviewButton').click();
	await expect(room.host.locator('#lobbyStartPrimaryButton')).toBeEnabled({ timeout: 15000 });
	await room.host.locator('#lobbyStartPrimaryButton').click();
	await expect(room.host.locator('#gameSection')).toBeVisible({ timeout: 15000 });
	await expect(room.guest.locator('#gameSection')).toBeVisible({ timeout: 15000 });
}

async function closeScenarioModals(page) {
	await page.evaluate(() => {
		closeScenarioPublicModal();
		closeScenarioPrivateModal();
	});
}

test('private event card is delivered, resolved and framed live without refresh', async ({ browser }) => {
	const room = await createTwoPlayerRoom(browser, `Scenario Card Live ${Date.now()}`);
	try {
		await readyAndStartGame(room);
		await room.host.evaluate(() =>
			connection.invoke('ForceScenarioById', 'main_store_access_event', crypto.randomUUID()));

		const cardSelector = '[data-event-card-id="main_store_access"]';
		await expect.poll(async () =>
			(await room.host.locator(cardSelector).count()) + (await room.guest.locator(cardSelector).count()), {
			timeout: 15000,
		}).toBe(1);

		const hostOwnsCard = await room.host.locator(cardSelector).count() === 1;
		const owner = hostOwnsCard ? room.host : room.guest;
		const other = hostOwnsCard ? room.guest : room.host;
		await closeScenarioModals(room.host);
		await closeScenarioModals(room.guest);

		const ownerCard = owner.locator(cardSelector);
		await expect(ownerCard).toHaveAttribute('data-event-card-status', 'available');
		await ownerCard.getByRole('button', {
			name: /Вкрасти всі припаси|Steal all supplies|Украсть все припасы/i,
		}).click();
		await expect(ownerCard).toHaveAttribute('data-event-card-status', 'pending_choice', {
			timeout: 15000,
		});
		await expect(ownerCard.getByRole('button', {
			name: /Вкрасти всі припаси|Steal all supplies|Украсть все припасы/i,
		})).toHaveCount(0);

		const target = ownerCard.locator('select[id^="eventCardTarget-"]');
		await target.selectOption({ index: 1 });
		await ownerCard.getByRole('button', {
			name: /Підставити гравця|Frame a player|Подставить игрока/i,
		}).click();

		await expect(ownerCard).toHaveAttribute('data-event-card-status', 'resolved', {
			timeout: 15000,
		});
		await expect(ownerCard.locator('.event-card-action')).toHaveCount(0);
		const received = other.locator(cardSelector);
		await expect(received).toHaveAttribute('data-event-card-status', 'pending_choice', {
			timeout: 15000,
		});
		await expect(received.getByRole('button', {
			name: /Підставити гравця|Frame a player|Подставить игрока/i,
		})).toHaveCount(0);

		await owner.reload();
		await other.reload();
		await expect(owner.locator(cardSelector)).toHaveAttribute('data-event-card-status', 'resolved', {
			timeout: 15000,
		});
		await expect(other.locator(cardSelector)).toHaveAttribute('data-event-card-status', 'pending_choice', {
			timeout: 15000,
		});
	} finally {
		await room.close();
	}
});
