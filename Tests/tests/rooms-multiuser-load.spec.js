const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { newContextWithNgrokBypass } = require('./ngrok-bypass');

test.use({
	ignoreHTTPSErrors: true,
});

test.describe.configure({ mode: 'serial' });

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const GAME_URL = process.env.GAME_URL || `${BASE_URL}/game`;

const ROOM_COUNT = positiveInt(process.env.ROOM_COUNT, 100);
const MIN_PLAYERS_PER_ROOM = positiveInt(process.env.MIN_PLAYERS_PER_ROOM, 5);
const MAX_PLAYERS_PER_ROOM = positiveInt(process.env.MAX_PLAYERS_PER_ROOM, 10);

function positiveInt(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function randomInt(min, max) {
	return Math.floor(Math.random() * (max - min + 1)) + min;
}

function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countNameInText(text, name) {
	const pattern = new RegExp(`(^|[^A-Za-z0-9_])${escapeRegExp(name)}(?=$|[^A-Za-z0-9_])`, 'g');
	return (text.match(pattern) || []).length;
}

async function collectConsoleErrors(page, label, consoleErrors, pageErrors) {
	page.on('console', message => {
		if (message.type() === 'error') {
			consoleErrors.push({
				label,
				text: message.text(),
			});
		}
	});

	page.on('pageerror', error => {
		pageErrors.push({
			label,
			message: error.message,
		});
	});
}

async function fillPlayerName(page, playerName) {
	await page.getByTestId('player-name-input').fill(playerName);
}

async function createRoom(page, playerName, roomName) {
	await page.goto(GAME_URL);

	await fillPlayerName(page, playerName);
	await page.getByTestId('room-name-input').fill(roomName);

	const startedAt = Date.now();

	await page.getByTestId('create-room-btn').click();

	const playersList = page.locator('#roomPlayersList');
	await expect(playersList).toContainText(playerName, { timeout: 15000 });
	await expect(playersList).toContainText(/Хост|Host|Ведущий/, { timeout: 15000 });

	return Date.now() - startedAt;
}

async function joinRoom(page, playerName, roomName) {
	await page.goto(GAME_URL);

	await fillPlayerName(page, playerName);

	const roomTitle = page.getByText(roomName).first();
	await expect(roomTitle).toBeVisible({ timeout: 15000 });

	const roomCard = roomTitle.locator(
		'xpath=ancestor::*[.//button[contains(., "Приєднатися") or contains(., "Присоединиться") or contains(., "Join")]][1]'
	);
	await expect(roomCard).toBeVisible({ timeout: 15000 });

	const startedAt = Date.now();

	await roomCard.getByRole('button', {
		name: /Приєднатися|Присоединиться|Join/i,
	}).click();

	await expect(page.getByRole('button', {
		name: /Покинути кімнату|Покинуть комнату|Leave/i,
	})).toBeVisible({ timeout: 15000 });

	await expect(page.locator('#roomPlayersList')).toContainText(playerName, { timeout: 15000 });

	return Date.now() - startedAt;
}

async function verifyRoom(page, roomName, expectedPlayers) {
	await expect(page.locator('#currentRoomName')).toContainText(roomName, { timeout: 15000 });

	const playersList = page.locator('#roomPlayersList');
	await expect(playersList).toContainText(/Хост|Host|Ведущий/, { timeout: 15000 });

	const playersText = await playersList.innerText();

	for (const playerName of expectedPlayers) {
		const count = countNameInText(playersText, playerName);
		expect(count, `${roomName}: ${playerName} має бути рівно один раз`).toBe(1);
	}
}

function average(values) {
	if (!values.length) return 0;
	return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function writeReport(report) {
	const outputDir = path.join(process.cwd(), 'test-results');
	fs.mkdirSync(outputDir, { recursive: true });

	const reportPath = path.join(outputDir, `rooms-multiuser-load-${ROOM_COUNT}.json`);
	fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');

	return reportPath;
}

test(`LOAD: ${ROOM_COUNT} активних кімнат з ${MIN_PLAYERS_PER_ROOM}-${MAX_PLAYERS_PER_ROOM} гравцями`, async ({ browser }) => {
	test.setTimeout(1000 * 60 * 180);

	const contexts = [];
	const roomResults = [];
	const roomCreateTimes = [];
	const joinTimes = [];
	const errors = [];
	const consoleErrors = [];
	const pageErrors = [];

	let totalPlayers = 0;
	let createdRooms = 0;
	let failedRooms = 0;

	for (let roomIndex = 1; roomIndex <= ROOM_COUNT; roomIndex++) {
		const roomName = `Load Room ${roomIndex}`;
		const playersCount = randomInt(MIN_PLAYERS_PER_ROOM, MAX_PLAYERS_PER_ROOM);
		const expectedPlayers = Array.from({ length: playersCount }, (_, index) => `P${index + 1}`);
		const roomPages = [];

		totalPlayers += playersCount;

		try {
			const hostContext = await newContextWithNgrokBypass(browser, {
				ignoreHTTPSErrors: true,
			});
			contexts.push(hostContext);

			const hostPage = await hostContext.newPage();
			roomPages.push(hostPage);
			await collectConsoleErrors(hostPage, `${roomName}:P1`, consoleErrors, pageErrors);

			const createTime = await createRoom(hostPage, 'P1', roomName);
			roomCreateTimes.push(createTime);

			for (let playerIndex = 2; playerIndex <= playersCount; playerIndex++) {
				const playerName = `P${playerIndex}`;
				const context = await newContextWithNgrokBypass(browser, {
					ignoreHTTPSErrors: true,
				});
				contexts.push(context);

				const page = await context.newPage();
				roomPages.push(page);
				await collectConsoleErrors(page, `${roomName}:${playerName}`, consoleErrors, pageErrors);

				const joinTime = await joinRoom(page, playerName, roomName);
				joinTimes.push(joinTime);
			}

			await verifyRoom(hostPage, roomName, expectedPlayers);

			createdRooms += 1;
			roomResults.push({
				roomIndex,
				roomName,
				playersCount,
				host: 'P1',
				players: expectedPlayers,
				createTimeMs: createTime,
				status: 'created',
				hostPage,
			});
		} catch (error) {
			failedRooms += 1;
			errors.push({
				roomIndex,
				roomName,
				message: error.message,
			});

			roomResults.push({
				roomIndex,
				roomName,
				playersCount,
				host: 'P1',
				players: expectedPlayers,
				status: 'failed',
				message: error.message,
				hostPage: roomPages[0] || null,
			});
		}
	}

	for (const room of roomResults.filter(result => result.status === 'created')) {
		try {
			await verifyRoom(room.hostPage, room.roomName, room.players);
		} catch (error) {
			errors.push({
				roomIndex: room.roomIndex,
				roomName: room.roomName,
				message: `final verification failed: ${error.message}`,
			});
		}
	}

	const healthContext = await newContextWithNgrokBypass(browser, {
		ignoreHTTPSErrors: true,
	});
	const healthPage = await healthContext.newPage();
	await collectConsoleErrors(healthPage, 'health-check', consoleErrors, pageErrors);

	try {
		await healthPage.goto(GAME_URL);
		await expect(healthPage.locator('#lobbySection')).toBeVisible({ timeout: 15000 });
	} catch (error) {
		errors.push({
			roomIndex: null,
			roomName: 'health-check',
			message: `site health check failed: ${error.message}`,
		});
	} finally {
		await healthContext.close();
	}

	const report = {
		createdAt: new Date().toISOString(),
		baseUrl: BASE_URL,
		totalRooms: ROOM_COUNT,
		totalPlayers,
		createdRooms,
		failedRooms,
		averageRoomCreateTimeMs: average(roomCreateTimes),
		averageJoinTimeMs: average(joinTimes),
		errors,
		consoleErrors,
		pageErrors,
		rooms: roomResults.map(({ hostPage, ...room }) => room),
	};

	const reportPath = writeReport(report);
	console.log(`JSON report: ${reportPath}`);

	for (const context of contexts.reverse()) {
		await context.close().catch(() => {});
	}

	expect(failedRooms).toBe(0);
	expect(errors).toEqual([]);
	expect(consoleErrors).toEqual([]);
	expect(pageErrors).toEqual([]);
});
