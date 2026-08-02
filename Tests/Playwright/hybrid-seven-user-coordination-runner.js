const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const gameUrl = `${(process.env.BASE_URL || 'https://localhost:7283').replace(/\/$/, '')}/Bunker`;
const artifactDirectory = path.join(process.cwd(), 'test-results', 'hybrid-seven-user');
const statePath = path.join(artifactDirectory, 'state.json');
const continuePath = path.join(artifactDirectory, 'developer-joined.signal');
const playerNames = ['Host-A', 'Player-C', 'Player-D', 'Player-E', 'Player-F', 'Player-G'];

function writeState(state) {
	fs.mkdirSync(artifactDirectory, { recursive: true });
	fs.writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf8');
}

function waitForSignal(signalPath) {
	return new Promise(resolve => {
		const timer = setInterval(() => {
			if (!fs.existsSync(signalPath)) return;
			clearInterval(timer);
			resolve();
		}, 500);
	});
}

async function openLobby(page) {
	await page.goto(gameUrl, { waitUntil: 'commit', timeout: 15000 });
	await page.getByTestId('player-name-input').waitFor({ state: 'visible', timeout: 15000 });
}

async function createRoom(page, playerName, roomName) {
	await openLobby(page);
	await page.getByTestId('player-name-input').fill(playerName);
	await page.getByTestId('room-name-input').fill(roomName);
	await page.getByTestId('room-max-players-input').fill('7');
	await page.getByTestId('create-room-btn').click();
	await page.locator('#roomLobby').waitFor({ state: 'visible', timeout: 15000 });
	await page.locator('#lobbyMembers').getByText(playerName, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
}

async function joinRoom(page, playerName, roomName) {
	await openLobby(page);
	await page.getByTestId('player-name-input').fill(playerName);
	const roomTitle = page.getByText(roomName).first();
	await roomTitle.waitFor({ state: 'visible', timeout: 15000 });
	const roomCard = roomTitle.locator('xpath=ancestor::*[.//button[contains(., "Приєднатися") or contains(., "Присоединиться") or contains(., "Join")]][1]');
	await roomCard.getByRole('button', { name: /Приєднатися|Присоединиться|Join/i }).click();
	await page.locator('#roomLobby').waitFor({ state: 'visible', timeout: 15000 });
	await page.locator('#lobbyMembers').getByText(playerName, { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
}

async function main() {
	const roomName = `Hybrid E2E ${Date.now()}`;
	const browser = await chromium.launch({ headless: true });
	const contexts = [];

	try {
		writeState({ status: 'starting-contexts', roomName, startedAt: new Date().toISOString() });
		for (const playerName of playerNames) {
			const context = await browser.newContext({ ignoreHTTPSErrors: true });
			contexts.push(context);
		}

		const pages = await Promise.all(contexts.map(context => context.newPage()));
		await createRoom(pages[0], playerNames[0], roomName);
		const roomId = (await pages[0].locator('#lobbyRoomCode').textContent())
			.replace(/^.*?:\s*/, '')
			.trim();
		if (!roomId || roomId === '—') throw new Error('The room code was not rendered in the lobby.');

		for (let index = 1; index < playerNames.length; index += 1) {
			await joinRoom(pages[index], playerNames[index], roomName);
		}

		const lobbyMembers = pages[0].locator('#lobbyMembers .lobby-member-card');
		if (await lobbyMembers.count() !== 6) throw new Error('The disposable room did not retain exactly six Playwright participants.');

		writeState({
			status: 'waiting-for-developer',
			roomId,
			roomName,
			contexts: playerNames,
			createdAt: new Date().toISOString(),
		});
		console.log(`HYBRID_E2E_READY roomId=${roomId} roomName=${roomName}`);

		await waitForSignal(continuePath);
		if (await lobbyMembers.count() !== 7) throw new Error('Developer confirmation arrived before the seventh lobby member was visible.');
		writeState({ status: 'developer-confirmed', roomId, roomName, contexts: playerNames, confirmedAt: new Date().toISOString() });
		await new Promise(() => {});
	} catch (error) {
		writeState({ status: 'failed', roomName, error: String(error?.message || error), failedAt: new Date().toISOString() });
		throw error;
	} finally {
		await Promise.all(contexts.map(context => context.close().catch(() => {})));
		await browser.close().catch(() => {});
	}
}

main().catch(error => {
	console.error(error.stack || error);
	process.exitCode = 1;
});
