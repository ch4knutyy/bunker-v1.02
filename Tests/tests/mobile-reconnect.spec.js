const { test, expect, devices } = require('@playwright/test');
const {
    BASE_URL,
    setupNgrokBypass,
    newContextWithNgrokBypass,
} = require('./ngrok-bypass');

test.use({
    ...devices['iPhone 13'],
    ignoreHTTPSErrors: true,
});

test.describe.configure({ mode: 'serial' });

const GAME_URL = process.env.GAME_URL || `${BASE_URL}/game`;
const LOBBY_MEMBERS = '#lobbyMembers';

test.beforeEach(async ({ page }) => {
    await setupNgrokBypass(page);
});

async function createRoom(page, playerName, roomName) {
    await page.goto(GAME_URL);

    await page.getByTestId('player-name-input').fill(playerName);
    await page.getByTestId('room-name-input').fill(roomName);

    await page.getByTestId('create-room-btn').click();

    await expect(page.locator(LOBBY_MEMBERS)).toContainText(playerName, {
        timeout: 10000,
    });
}

test('MOBILE: гравець створює кімнату з телефона', async ({ page }) => {
    const playerName = 'Діма';
    const roomName = `Mobile Room ${Date.now()}`;

    await createRoom(page, playerName, roomName);

    await expect(page.locator(LOBBY_MEMBERS)).toContainText(playerName);
    await expect(page.locator('#roomLobby')).toBeVisible();
});

test('MOBILE: після F5 гравець залишається в кімнаті', async ({ page }) => {
    const playerName = 'Діма';
    const roomName = `Mobile F5 ${Date.now()}`;

    await createRoom(page, playerName, roomName);

    await page.reload();

    await expect(page.locator(LOBBY_MEMBERS)).toContainText(playerName, {
        timeout: 10000,
    });

    await expect(page.locator(LOBBY_MEMBERS)).toContainText(/Хост|Host/);

    const playersText = await page.locator(LOBBY_MEMBERS).innerText();
    const playerCount = (playersText.match(new RegExp(playerName, 'g')) || []).length;

    expect(playerCount).toBe(1);
});

test('MOBILE: закрив сайт і повернувся — гравець відновив кімнату', async ({ browser }) => {
    const context = await newContextWithNgrokBypass(browser, {
        ...devices['iPhone 13'],
        ignoreHTTPSErrors: true,
    });

    const playerName = 'Діма';
    const roomName = `Mobile Return ${Date.now()}`;

    const page = await context.newPage();

    await createRoom(page, playerName, roomName);

    await page.close();

    const returnedPage = await context.newPage();
    await returnedPage.goto(GAME_URL);

    await expect(returnedPage.locator(LOBBY_MEMBERS)).toContainText(playerName, {
        timeout: 10000,
    });

    await expect(returnedPage.locator(LOBBY_MEMBERS)).toContainText(/Хост|Host/);

    const playersText = await returnedPage.locator(LOBBY_MEMBERS).innerText();
    const playerCount = (playersText.match(new RegExp(playerName, 'g')) || []).length;

    expect(playerCount).toBe(1);

    await context.close();
});

test('MOBILE: після втрати інтернету і повернення гравець лишається в кімнаті', async ({ browser }) => {
    const context = await newContextWithNgrokBypass(browser, {
        ...devices['iPhone 13'],
        ignoreHTTPSErrors: true,
    });

    const page = await context.newPage();

    const playerName = 'Діма';
    const roomName = `Mobile Offline ${Date.now()}`;

    await createRoom(page, playerName, roomName);

    await context.setOffline(true);
    await page.waitForTimeout(3000);

    await context.setOffline(false);
    await page.waitForTimeout(5000);

    await page.reload();

    await expect(page.locator(LOBBY_MEMBERS)).toContainText(playerName, {
        timeout: 10000,
    });

    const playersText = await page.locator(LOBBY_MEMBERS).innerText();
    const playerCount = (playersText.match(new RegExp(playerName, 'g')) || []).length;

    expect(playerCount).toBe(1);

    await context.close();
});

test('MOBILE: поворот телефона не ламає кімнату', async ({ page }) => {
    const playerName = 'Діма';
    const roomName = `Mobile Rotate ${Date.now()}`;

    await createRoom(page, playerName, roomName);

    await page.setViewportSize({
        width: 844,
        height: 390,
    });

    await expect(page.locator(LOBBY_MEMBERS)).toContainText(playerName, {
        timeout: 10000,
    });

    await expect(page.locator('#roomLobby')).toBeVisible();
});

test('MOBILE: другий гравець закрив сайт і повернувся в кімнату', async ({ browser }) => {
    const hostContext = await newContextWithNgrokBypass(browser, {
        ...devices['iPhone 13'],
        ignoreHTTPSErrors: true,
    });

    const guestContext = await newContextWithNgrokBypass(browser, {
        ...devices['iPhone 13'],
        ignoreHTTPSErrors: true,
    });

    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();

    const hostName = 'Діма';
    const guestName = 'Олег';
    const roomName = `Mobile Guest Return ${Date.now()}`;

    await createRoom(host, hostName, roomName);

    await guest.goto(GAME_URL);
    await guest.getByTestId('player-name-input').fill(guestName);

    const roomTitle = guest.getByText(roomName).first();

    await expect(roomTitle).toBeVisible({
        timeout: 10000,
    });

    const roomCard = roomTitle.locator(
        'xpath=ancestor::*[.//button[contains(., "Приєднатися") or contains(., "Join") or contains(., "Присоединиться")]][1]'
    );

    await roomCard.getByRole('button', { name: /Приєднатися|Join|Присоединиться/ }).click();

    await expect(guest.locator(LOBBY_MEMBERS)).toContainText(hostName, {
        timeout: 10000,
    });

    await expect(guest.locator(LOBBY_MEMBERS)).toContainText(guestName, {
        timeout: 10000,
    });

    await guest.close();

    const returnedGuest = await guestContext.newPage();
    await returnedGuest.goto(GAME_URL);

    await expect(returnedGuest.locator(LOBBY_MEMBERS)).toContainText(hostName, {
        timeout: 10000,
    });

    await expect(returnedGuest.locator(LOBBY_MEMBERS)).toContainText(guestName, {
        timeout: 10000,
    });

    await expect(host.locator(LOBBY_MEMBERS)).toContainText(guestName, {
        timeout: 10000,
    });

    await hostContext.close();
    await guestContext.close();
});
