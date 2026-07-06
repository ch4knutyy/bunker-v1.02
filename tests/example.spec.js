const { test, expect } = require('@playwright/test');
const { setupNgrokBypass } = require('./ngrok-bypass');

test.use({
  ignoreHTTPSErrors: true,
});

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const GAME_URL = process.env.GAME_URL || `${BASE_URL}/game`;

test.beforeEach(async ({ page }) => {
  await setupNgrokBypass(page);
});

test('після оновлення сторінки сайт не падає', async ({ page }) => {
  await page.goto(`${BASE_URL}/`);

  await page.reload();

  expect(new URL(page.url()).origin).toBe(new URL(BASE_URL).origin);
});
