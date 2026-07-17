const { test, expect } = require('@playwright/test');
const { setupNgrokBypass } = require('./ngrok-bypass');

test.use({
  ignoreHTTPSErrors: true,
});

const BASE_URL = (process.env.BASE_URL || 'https://localhost:7283').replace(/\/$/, '');
const GAME_URL = process.env.GAME_URL || `${BASE_URL}/Bunker`;
const HOME_URL = `${BASE_URL}/`;

test.beforeEach(async ({ page }) => {
  await setupNgrokBypass(page);
});

test('поле імені гравця в грі можна повністю очистити', async ({ page }) => {
  await page.goto(GAME_URL);

  const nameInput = page.getByTestId('player-name-input');

  await nameInput.fill('12341');
  await expect(nameInput).toHaveValue('12341');

  await nameInput.press('Control+A');
  await nameInput.press('Backspace');
  await expect(nameInput).toHaveValue('');

  await nameInput.fill('Діма');
  await expect(nameInput).toHaveValue('Діма');

  await nameInput.press('Control+A');
  await nameInput.press('Delete');
  await expect(nameInput).toHaveValue('');
});

test('поле імені профілю можна очистити без повернення старого значення', async ({ page }) => {
  await page.goto(HOME_URL);

  const profileName = page.locator('#profileName');

  await profileName.fill('12341');
  await expect(profileName).toHaveValue('12341');

  await profileName.press('Control+A');
  await profileName.press('Backspace');
  await expect(profileName).toHaveValue('');

  await profileName.fill('Діма');
  await expect(profileName).toHaveValue('Діма');

  await profileName.press('Control+A');
  await profileName.press('Delete');
  await expect(profileName).toHaveValue('');

  await page.locator('.avatar-option').first().click();
  await expect(profileName).toHaveValue('');
});

test('порожнє ім’я не створює кімнату і показує помилку', async ({ page }) => {
  await page.goto(GAME_URL);

  await page.getByTestId('player-name-input').fill('');
  await page.getByTestId('room-name-input').fill(`Empty Name ${Date.now()}`);

  let dialogMessage = '';
  page.once('dialog', async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });

  await page.getByTestId('create-room-btn').click();

  expect(dialogMessage).toBe('Введіть ім’я гравця');

  await expect(page.locator('#roomSection')).toBeHidden();
  await expect(page.locator('#lobbySection')).toBeVisible();
});
