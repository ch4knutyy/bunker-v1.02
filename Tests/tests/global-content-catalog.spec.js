const { test, expect } = require('@playwright/test');
const { createTwoPlayerRoom } = require('./game-test-helpers');

test.use({ ignoreHTTPSErrors: true });

test('PlayerHost never sees the Development-only global catalog', async ({ browser }) => {
  const room = await createTwoPlayerRoom(browser, `Catalog Privacy ${Date.now()}`);
  try {
    await expect(room.host.locator('#globalContentCatalog')).toBeHidden();
    await expect(room.host.locator('#globalCatalogDrafts')).toBeHidden();
    await expect(room.guest.locator('#globalContentCatalog')).toBeHidden();
    await room.host.reload();
    await expect(room.host.locator('#globalContentCatalog')).toBeHidden();
    await expect(room.host.locator('#globalCatalogDrafts')).toBeHidden();
  } finally {
    await room.close();
  }
});
