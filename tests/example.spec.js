const { test, expect } = require('@playwright/test');

test.use({
  ignoreHTTPSErrors: true,
});

test('після оновлення сторінки сайт не падає', async ({ page }) => {
  await page.goto('https://localhost:7283/');

  await page.reload();

  await expect(page).toHaveURL(/localhost/);
});