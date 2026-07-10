const { test, expect } = require('@playwright/test');
const { setupNgrokBypass, newContextWithNgrokBypass } = require('./ngrok-bypass');

test.use({
	ignoreHTTPSErrors: true,
	viewport: { width: 1920, height: 1080 },
	deviceScaleFactor: 1,
});

// Важливо для твоєї гри: тести з кімнатами краще не ганяти паралельно
test.describe.configure({ mode: 'serial' });

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const GAME_URL = process.env.GAME_URL || `${BASE_URL}/game`;
const HOME_URL = `${BASE_URL}/`;

test.beforeEach(async ({ page }) => {
	await setupNgrokBypass(page);
});

async function disableAnimations(page) {
	await page.addStyleTag({
		content: `
      *, *::before, *::after {
        animation-duration: 0s !important;
        animation-delay: 0s !important;
        transition-duration: 0s !important;
        transition-delay: 0s !important;
        caret-color: transparent !important;
      }

      html {
        overflow-y: scroll !important;
        scrollbar-gutter: stable !important;
      }

      body {
        min-width: 1920px !important;
      }
    `,
	});

	await page.evaluate(() => document.fonts.ready);
	await page.waitForTimeout(300);
}

async function hideDynamicElements(page) {
	await page.addStyleTag({
		content: `
            /* Динамічні списки кімнат */
            #roomsList,
            #roomList,
            .rooms-list,
            .room-list,
            .room-card,
            [data-testid="rooms-list"],
            [data-testid="room-list"],
            [data-testid="room-card"],

            /* Динамічні списки гравців */
            #roomPlayersList,
            .players-list,
            .player-list,
            .player-card,
            [data-testid="room-players-list"],
            [data-testid="players-list"],
            [data-testid="player-card"],

            /* Випадково згенеровані характеристики */
            .characteristics,
            .characteristic-card,
            .character-card,
            .player-characteristics,
            .profession-card,
            .health-card,
            .mental-health-card,
            .physical-health-card,
            .inventory-card,
            .trait-card,
            .fact-card,
            .secret-card,
            [data-testid="player-characteristics"],
            [data-testid="characteristics"],
            [data-testid="characteristic-card"],
            [data-testid="profession"],
            [data-testid="physical-health"],
            [data-testid="mental-health"],
            [data-testid="inventory"],
            [data-testid="trait"],
            [data-testid="secret"],
            [data-testid="fact"],

            /* Tooltip / toast / повідомлення */
            .tooltip,
            .toast,
            .notification,
            .alert,
            [role="tooltip"] {
                visibility: hidden !important;
                opacity: 0 !important;
            }

            /* Masked room lists must not change screenshot layout when test rooms appear/disappear. */
            #roomsList,
            #roomList,
            .rooms-list,
            .room-list,
            [data-testid="rooms-list"],
            [data-testid="room-list"] {
                height: 139px !important;
                min-height: 139px !important;
                max-height: 139px !important;
                overflow: hidden !important;
            }

            #roomsList .room-card,
            #roomList .room-card,
            .rooms-list .room-card,
            .room-list .room-card,
            [data-testid="rooms-list"] [data-testid="room-card"],
            [data-testid="room-list"] [data-testid="room-card"] {
                display: none !important;
            }
        `,
	});

	await page.evaluate(() => {
		const dynamicAttributeKeywords = [
			'rooms-list',
			'room-list',
			'room-card',
			'players-list',
			'player-list',
			'player-card',
			'roomplayerslist',
			'characteristics',
			'characteristic',
			'player-characteristics',
			'profession',
			'physical-health',
			'mental-health',
			'inventory',
			'trait',
			'secret',
			'fact',
			'tooltip',
			'toast',
			'notification',
		];

		const elements = Array.from(document.body.querySelectorAll('*'));

		for (const element of elements) {
			const attrs = [
				element.id,
				element.className,
				element.getAttribute('data-testid'),
				element.getAttribute('data-test'),
				element.getAttribute('aria-label'),
			]
				.filter(Boolean)
				.join(' ')
				.toString()
				.toLowerCase();

			if (dynamicAttributeKeywords.some(keyword => attrs.includes(keyword))) {
				element.style.visibility = 'hidden';
				element.style.opacity = '0';
			}
		}
	});
}

async function normalizeVisualText(page) {
	await page.evaluate(() => {
		const replacements = [
			[/Visual Room Stable \d+/g, 'Visual Room Stable 0000000000000'],
			[/Visual Room \d+/g, 'Visual Room 0000000000000'],
			[/Mass Room \d+ Players \d+/g, 'Mass Room 00 Players 0000000000000'],
			[/Тестова кімната \d+/g, 'Тестова кімната 0000000000000'],
			[/Тест F5 \d+/g, 'Тест F5 0000000000000'],
			[/Тест характеристики \d+/g, 'Тест характеристики 0000000000000'],
			[/Тест генерації \d+/g, 'Тест генерації 0000000000000'],
			[/Тест 2 гравці \d+/g, 'Тест 2 гравці 0000000000000'],
			[/Console Test \d+/g, 'Console Test 0000000000000'],
			[/RU Test Room \d+/g, 'RU Test Room 0000000000000'],
			[/EN Test Room \d+/g, 'EN Test Room 0000000000000'],
			[/ID:\s*[0-9A-Fa-f]{8}/g, 'ID: 00000000'],
			[/\b\d{10,}\b/g, '0000000000000'],
		];

		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

		while (walker.nextNode()) {
			let value = walker.currentNode.nodeValue;

			for (const [pattern, replacement] of replacements) {
				value = value.replace(pattern, replacement);
			}

			walker.currentNode.nodeValue = value;
		}
	});
}

async function stabilizeVisualPage(page) {
	await disableAnimations(page);
	await hideDynamicElements(page);
	await normalizeVisualText(page);
	await page.evaluate(() => window.scrollTo(0, 0));
	await page.waitForTimeout(300);
}

function getDynamicMasks(page) {
	return [
		page.locator('#roomsList'),
		page.locator('#roomList'),
		page.locator('.rooms-list'),
		page.locator('.room-list'),
		page.locator('.room-card'),
		page.locator('#roomPlayersList'),
		page.locator('.players-list'),
		page.locator('.player-list'),
		page.locator('.player-card'),
		page.locator('.characteristics'),
		page.locator('.characteristic-card'),
		page.locator('.character-card'),
		page.locator('.player-characteristics'),
		page.locator('.profession-card'),
		page.locator('.health-card'),
		page.locator('.mental-health-card'),
		page.locator('.physical-health-card'),
		page.locator('.inventory-card'),
		page.locator('.trait-card'),
		page.locator('.fact-card'),
		page.locator('.secret-card'),
		page.locator('.tooltip'),
		page.locator('.toast'),
		page.locator('.notification'),
		page.locator('.alert'),
	];
}

async function expectStaticScreenshot(page, snapshotName) {
	await stabilizeVisualPage(page);

	await expect(page).toHaveScreenshot(snapshotName, {
		fullPage: false,
		maxDiffPixels: 0,
		animations: 'disabled',
		caret: 'hide',
		mask: getDynamicMasks(page),
	});
}

async function collectConsoleErrors(page) {
	const errors = [];

	page.on('console', message => {
		if (message.type() === 'error') {
			errors.push(message.text());
		}
	});

	page.on('pageerror', error => {
		errors.push(error.message);
	});

	return errors;
}
async function fillPlayerName(page, name) {
	await page.getByTestId('player-name-input').fill(name);
}

async function fillRoomName(page, roomName) {
	await page.getByTestId('room-name-input').fill(roomName);
}

async function clickCreateRoom(page) {
	await page.getByTestId('create-room-btn').click();
}

async function clickLanguage(page, lang) {
	await page.getByRole('button', { name: lang }).click();
}

async function joinRoom(page, roomName) {
	const roomTitle = page.getByText(roomName).first();

	await expect(roomTitle).toBeVisible({ timeout: 10000 });

	const roomCard = roomTitle.locator(
		'xpath=ancestor::*[.//button[contains(., "Приєднатися") or contains(., "Присоединиться") or contains(., "Join")]][1]'
	);

	await expect(roomCard).toBeVisible({ timeout: 10000 });

	await roomCard.getByRole('button', {
		name: /Приєднатися|Присоединиться|Join/i,
	}).click();
}

async function expectPlayerListContains(playersList, playerNames) {
	for (const playerName of playerNames) {
		await expect(playersList).toContainText(playerName, {
			timeout: 10000,
		});
	}
}

function escapeRegExp(value) {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countNameInText(text, name) {
	return (text.match(new RegExp(escapeRegExp(name), 'g')) || []).length;
}
test('після оновлення сторінки гравець залишається в кімнаті і не дублюється', async ({ page }) => {
	await page.goto(GAME_URL);

	await page.getByTestId('player-name-input').fill('Діма');
	await page.getByTestId('room-name-input').fill(`Тестова кімната ${Date.now()}`);

	await page.getByTestId('create-room-btn').click();

	const playersList = page.locator('#roomPlayersList');

	await expect(playersList).toContainText('Діма');
	await expect(playersList).toContainText(/Хост|Host/);

	await page.reload();

	await expect(playersList).toContainText('Діма', { timeout: 10000 });
	await expect(playersList).toContainText(/Хост|Host/);

	const playersText = await playersList.innerText();
	const dimaCount = (playersText.match(/Діма/g) || []).length;

	expect(dimaCount).toBe(1);
});

test('після кількох оновлень гравець не дублюється', async ({ page }) => {
	await page.goto(GAME_URL);

	await page.getByTestId('player-name-input').fill('Діма');
	await page.getByTestId('room-name-input').fill(`Тест F5 ${Date.now()}`);

	await page.getByTestId('create-room-btn').click();

	const playersList = page.locator('#roomPlayersList');

	await expect(playersList).toContainText('Діма');

	await page.reload();
	await expect(playersList).toContainText('Діма', { timeout: 10000 });

	await page.reload();
	await expect(playersList).toContainText('Діма', { timeout: 10000 });

	await page.reload();
	await expect(playersList).toContainText('Діма', { timeout: 10000 });

	const playersText = await playersList.innerText();
	const dimaCount = (playersText.match(/Діма/g) || []).length;

	expect(dimaCount).toBe(1);
});

test('після оновлення сторінки характеристики гравця не зникають', async ({ page }) => {
	await page.goto(GAME_URL);

	await page.getByTestId('player-name-input').fill('Діма');
	await page.getByTestId('room-name-input').fill(`Тест характеристики ${Date.now()}`);

	await page.getByTestId('create-room-btn').click();

	await expect(page.locator('#roomPlayersList')).toContainText('Діма');

	const bodyBeforeReload = await page.locator('body').innerText();

	expect(bodyBeforeReload).toMatch(/Мої характеристики|характеристики/i);
	expect(bodyBeforeReload).not.toContain('Немає даних гравця');
	await expect(page.getByRole('button', { name: /Розкрити всім/ }).first()).toBeVisible({
		timeout: 10000,
	});

	await page.reload();

	await expect(page.locator('#roomPlayersList')).toContainText('Діма', { timeout: 10000 });

	const bodyAfterReload = await page.locator('body').innerText();

	expect(bodyAfterReload).toMatch(/Мої характеристики|характеристики/i);
	expect(bodyAfterReload).toContain('Діма');
	expect(bodyAfterReload).not.toContain('Немає даних гравця');
	await expect(page.getByRole('button', { name: /Розкрити всім/ }).first()).toBeVisible({
		timeout: 10000,
	});
});

test('BUG: після створення кімнати характеристики гравця повинні генеруватися', async ({ page }) => {
	await page.goto(GAME_URL);

	await page.getByTestId('player-name-input').fill('Діма');
	await page.getByTestId('room-name-input').fill(`Тест генерації ${Date.now()}`);

	await page.getByTestId('create-room-btn').click();

	await expect(page.locator('#roomPlayersList')).toContainText('Діма');

	await expect(page.locator('body')).toContainText(/Мої характеристики|характеристики/i);

	await expect(page.locator('body')).not.toContainText('Немає даних гравця');

	await expect(page.getByRole('button', { name: /Розкрити всім/ }).first()).toBeVisible({
		timeout: 10000,
	});
});

test('2 гравці: після F5 хост не дублюється і другий гравець залишається в кімнаті', async ({ browser }) => {
	const hostContext = await newContextWithNgrokBypass(browser, {
		ignoreHTTPSErrors: true,
	});

	const guestContext = await newContextWithNgrokBypass(browser, {
		ignoreHTTPSErrors: true,
	});

	const host = await hostContext.newPage();
	const guest = await guestContext.newPage();

	const hostName = 'Діма';
	const guestName = 'Олег';
	const roomName = `Тест 2 гравці ${Date.now()}`;

	await host.goto(GAME_URL);

	await host.getByTestId('player-name-input').fill(hostName);
	await host.getByTestId('room-name-input').fill(roomName);

	await host.getByTestId('create-room-btn').click();

	const hostPlayersList = host.locator('#roomPlayersList');

	await expect(hostPlayersList).toContainText(hostName);
	await expect(hostPlayersList).toContainText(/Хост|Host/);

	await guest.goto(GAME_URL);

	await guest.getByTestId('player-name-input').fill(guestName);

	const roomTitle = guest.getByText(roomName).first();

	await expect(roomTitle).toBeVisible({ timeout: 10000 });

	const roomCard = roomTitle.locator('xpath=ancestor::*[.//button[contains(., "Приєднатися") or contains(., "Присоединиться") or contains(., "Join")]][1]');

	await expect(roomCard).toBeVisible({ timeout: 10000 });

	await roomCard.getByRole('button', { name: /Приєднатися|Присоединиться|Join/i }).click();

	await expect(guest.getByRole('button', { name: /Покинути кімнату|Покинуть комнату|Leave/i })).toBeVisible({
		timeout: 10000,
	});

	const guestPlayersList = guest.locator('#roomPlayersList');

	await expect(guestPlayersList).toContainText(hostName, { timeout: 10000 });
	await expect(guestPlayersList).toContainText(guestName, { timeout: 10000 });

	await expect(hostPlayersList).toContainText(guestName, { timeout: 10000 });

	await host.reload();

	await expect(hostPlayersList).toContainText(hostName, { timeout: 10000 });
	await expect(hostPlayersList).toContainText(guestName, { timeout: 10000 });
	await expect(hostPlayersList).toContainText(/Хост|Host/);

	await expect(guestPlayersList).toContainText(hostName, { timeout: 10000 });
	await expect(guestPlayersList).toContainText(guestName, { timeout: 10000 });

	const hostPlayersText = await hostPlayersList.innerText();
	const guestPlayersText = await guestPlayersList.innerText();

	const hostNameCountOnHostPage = (hostPlayersText.match(new RegExp(hostName, 'g')) || []).length;
	const hostNameCountOnGuestPage = (guestPlayersText.match(new RegExp(hostName, 'g')) || []).length;

	expect(hostNameCountOnHostPage).toBe(1);
	expect(hostNameCountOnGuestPage).toBe(1);

	await hostContext.close();
	await guestContext.close();
});

test('invite link використовує поточний origin і дозволяє приєднати другого гравця', async ({ browser }) => {
	const hostContext = await newContextWithNgrokBypass(browser, {
		ignoreHTTPSErrors: true,
	});

	const guestContext = await newContextWithNgrokBypass(browser, {
		ignoreHTTPSErrors: true,
	});

	const host = await hostContext.newPage();
	const guest = await guestContext.newPage();

	const hostName = 'Діма';
	const guestName = 'Олег';
	const roomName = `Invite Room ${Date.now()}`;

	await host.goto(GAME_URL);

	await host.getByTestId('player-name-input').fill(hostName);
	await host.getByTestId('room-name-input').fill(roomName);
	await host.getByTestId('create-room-btn').click();

	const hostPlayersList = host.locator('#roomPlayersList');
	await expect(hostPlayersList).toContainText(hostName, { timeout: 10000 });

	const roomIdText = await host.locator('#currentRoomId').innerText();
	const roomId = roomIdText.replace(/^ID:\s*/i, '').trim();
	const expectedOrigin = new URL(host.url()).origin;

	await expect(host.getByTestId('copy-invite-link-btn')).toBeVisible();
	const inviteLink = await host.evaluate(() => window.copyInviteLink());

	expect(inviteLink).toBe(`${expectedOrigin}/room/${encodeURIComponent(roomId)}`);
	expect(new URL(inviteLink).origin).toBe(expectedOrigin);

	await guest.goto(inviteLink);
	await expect(guest.locator('#joinModal')).toBeVisible({ timeout: 10000 });

	await guest.locator('#playerNameJoin').fill(guestName);
	await guest.locator('#joinModal').getByRole('button', {
		name: /Приєднатися|Присоединиться|Join/i,
	}).click();

	const guestPlayersList = guest.locator('#roomPlayersList');
	await expect(guestPlayersList).toContainText(hostName, { timeout: 10000 });
	await expect(guestPlayersList).toContainText(guestName, { timeout: 10000 });
	await expect(hostPlayersList).toContainText(guestName, { timeout: 10000 });

	await guest.reload();
	await expect(guestPlayersList).toContainText(hostName, { timeout: 10000 });
	await expect(guestPlayersList).toContainText(guestName, { timeout: 10000 });

	await hostContext.close();
	await guestContext.close();
});

test('VISUAL: головна сторінка UA стабільна частина', async ({ page }) => {
	await page.goto(HOME_URL);
	await expectStaticScreenshot(page, 'home-ua-static.png');
});

test('VISUAL: головна сторінка RU стабільна частина', async ({ page }) => {
	await page.goto(HOME_URL);
	await disableAnimations(page);

	await page.getByRole('button', { name: 'RU' }).click();

	await expectStaticScreenshot(page, 'home-ru-static.png');
});

test('VISUAL: кімната після створення UA стабільна частина', async ({ page }) => {
	await page.goto(GAME_URL);
	await disableAnimations(page);

	await page.getByTestId('player-name-input').fill('Діма');
	await page.getByTestId('room-name-input').fill(`Visual Room Stable ${Date.now()}`);

	await page.getByTestId('create-room-btn').click();

	await expect(page.locator('#roomPlayersList')).toContainText('Діма', {
		timeout: 10000,
	});

	await expectStaticScreenshot(page, 'room-created-ua-static.png');
});

test('CONSOLE: немає JS-помилок після створення кімнати і F5', async ({ page }) => {
	const errors = await collectConsoleErrors(page);

	await page.goto(GAME_URL);

	await page.getByTestId('player-name-input').fill('Діма');
	await page.getByTestId('room-name-input').fill(`Console Test ${Date.now()}`);

	await page.getByTestId('create-room-btn').click();

	await expect(page.locator('#roomPlayersList')).toContainText('Діма', {
		timeout: 10000,
	});

	await page.reload();

	await expect(page.locator('#roomPlayersList')).toContainText('Діма', {
		timeout: 10000,
	});

	await page.waitForTimeout(2000);

	expect(errors).toEqual([]);
});
for (const playersCount of [5, 6, 7, 8, 9, 10]) {
	test(`MULTIPLAYER: кімната стабільно працює з ${playersCount} гравцями`, async ({ browser }) => {
		const contexts = [];

		try {
			const roomName = `Mass Room ${playersCount} Players ${Date.now()}`;
			const playerNames = [];

			for (let i = 1; i <= playersCount; i++) {
				playerNames.push(`Гравець_${String(i).padStart(2, '0')}`);
			}

			const hostContext = await newContextWithNgrokBypass(browser, {
				ignoreHTTPSErrors: true,
				viewport: { width: 1920, height: 1080 },
				deviceScaleFactor: 1,
			});

			contexts.push(hostContext);

			const host = await hostContext.newPage();

			await host.goto(GAME_URL);
			await fillPlayerName(host, playerNames[0]);
			await fillRoomName(host, roomName);
			await clickCreateRoom(host);

			const hostPlayersList = host.locator('#roomPlayersList');

			await expect(hostPlayersList).toContainText(playerNames[0], {
				timeout: 10000,
			});

			await expect(hostPlayersList).toContainText(/Хост|Host/i, {
				timeout: 10000,
			});

			for (let i = 1; i < playersCount; i++) {
				const guestContext = await newContextWithNgrokBypass(browser, {
					ignoreHTTPSErrors: true,
					viewport: { width: 1920, height: 1080 },
					deviceScaleFactor: 1,
				});

				contexts.push(guestContext);

				const guest = await guestContext.newPage();

				await guest.goto(GAME_URL);
				await fillPlayerName(guest, playerNames[i]);
				await joinRoom(guest, roomName);

				const guestPlayersList = guest.locator('#roomPlayersList');

				await expect(guestPlayersList).toContainText(playerNames[0], {
					timeout: 10000,
				});

				await expect(guestPlayersList).toContainText(playerNames[i], {
					timeout: 10000,
				});

				await expect(hostPlayersList).toContainText(playerNames[i], {
					timeout: 10000,
				});
			}

			await expectPlayerListContains(hostPlayersList, playerNames);

			await host.reload();

			await expectPlayerListContains(hostPlayersList, playerNames);

			const hostPlayersText = await hostPlayersList.innerText();

			for (const playerName of playerNames) {
				expect(countNameInText(hostPlayersText, playerName)).toBe(1);
			}
		} finally {
			for (const context of contexts.reverse()) {
				await context.close();
			}
		}
	});
}
test('RU: створення кімнати, F5 і характеристики працюють без технічного тексту', async ({ page }) => {
	const errors = await collectConsoleErrors(page);

	await page.goto(GAME_URL);

	await clickLanguage(page, 'RU');

	await fillPlayerName(page, 'Дима');
	await fillRoomName(page, `RU Test Room ${Date.now()}`);

	await clickCreateRoom(page);

	await expect(page.locator('#roomPlayersList')).toContainText('Дима', {
		timeout: 10000,
	});

	await expect(page.locator('body')).not.toContainText('Немає даних гравця');
	await expect(page.locator('body')).not.toContainText('Нет данных игрока');

	await page.reload();

	await expect(page.locator('#roomPlayersList')).toContainText('Дима', {
		timeout: 10000,
	});

	const bodyText = await page.locator('body').innerText();

	expect(bodyText).not.toMatch(/Связано с/i);
	expect(bodyText).not.toMatch(/Related to/i);
	expect(bodyText).not.toMatch(/Тяжесть/i);
	expect(bodyText).not.toMatch(/Severity/i);
	expect(bodyText).not.toMatch(/Bunker impact/i);
	expect(bodyText).not.toMatch(/Влияние в бункере/i);
	expect(bodyText).not.toMatch(/вада/i);

	await page.waitForTimeout(2000);

	expect(errors).toEqual([]);
});
test('EN: базова перевірка створення кімнати і F5', async ({ page }) => {
	const errors = await collectConsoleErrors(page);

	await page.goto(GAME_URL);

	await clickLanguage(page, 'EN');

	await fillPlayerName(page, 'Dima');
	await fillRoomName(page, `EN Test Room ${Date.now()}`);

	await clickCreateRoom(page);

	await expect(page.locator('#roomPlayersList')).toContainText('Dima', {
		timeout: 10000,
	});

	await page.reload();

	await expect(page.locator('#roomPlayersList')).toContainText('Dima', {
		timeout: 10000,
	});

	const bodyText = await page.locator('body').innerText();

	expect(bodyText).not.toMatch(/Немає даних гравця/i);
	expect(bodyText).not.toMatch(/Нет данных игрока/i);
	expect(bodyText).not.toMatch(/No player data/i);
	expect(bodyText).not.toMatch(/No character data/i);

	await page.waitForTimeout(2000);

	expect(errors).toEqual([]);
});
