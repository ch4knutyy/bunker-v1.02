const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { GAME_URL, preparePage } = require('./game-test-helpers');

test.use({
	ignoreHTTPSErrors: true,
});

const REMOVED_SELECTORS = [
	'#myCardsSection',
	'#specialCardsTableSection',
	'#specialCardsTableBody',
	'#useCardModal',
	'#cardApprovalModal',
	'.special-card',
	'.special-cards-table',
	'.activated-card-badge',
	'.global-card-tooltip',
];

const REMOVED_GLOBALS = [
	'openUseCardModal',
	'closeUseCardModal',
	'submitUseCard',
	'showCardApprovalModal',
	'approveCardApproval',
	'rejectCardApproval',
	'updateActivatedCardsTable',
	'addActivatedCard',
];

const PRODUCTION_FILES_TO_SCAN = [
	'Program.cs',
	'Hubs/GameHub/GameHub.cs',
	'Hubs/GameHub/GameHub.Rooms.cs',
	'Models/Player/Player.cs',
	'Models/Game/Room.cs',
	'Services/RoomService.cs',
	'Views/Home/Game.cshtml',
	'wwwroot/js/game.js',
	'wwwroot/js/site.js',
	'wwwroot/js/tooltip.js',
	'wwwroot/css/site.css',
	'wwwroot/css/game.css',
	'wwwroot/css/tooltip.css',
];

const REMOVED_CODE_PATTERNS = [
	/SpecialCard/,
	/CardService/,
	/ActivatedCard/,
	/special_cards/,
	/specialCards/,
	/special-card/,
	/special-cards-table/,
	/activated-card-badge/,
	/CardPending/,
	/CardApproval/,
	/CardActivated/,
	/UseCard/,
	/ApproveCard/,
	/RejectCard/,
];

test('special cards UI and client handlers are not rendered', async ({ page }) => {
	await preparePage(page);
	await page.goto(GAME_URL);

	await expect(page.locator('body')).not.toContainText(/Мої спеціальні карти|Спеціальні карти|Special cards/i);

	for (const selector of REMOVED_SELECTORS) {
		await expect(page.locator(selector), selector).toHaveCount(0);
	}

	const globals = await page.evaluate(names => Object.fromEntries(
		names.map(name => [name, typeof window[name]])
	), REMOVED_GLOBALS);

	for (const [name, type] of Object.entries(globals)) {
		expect(type, `${name} should not be exposed`).toBe('undefined');
	}
});

test('special cards production code is removed', async () => {
	for (const relativePath of PRODUCTION_FILES_TO_SCAN) {
		const absolutePath = path.join(process.cwd(), relativePath);
		const content = fs.existsSync(absolutePath)
			? fs.readFileSync(absolutePath, 'utf8')
			: '';

		for (const pattern of REMOVED_CODE_PATTERNS) {
			expect(content, `${relativePath} should not contain ${pattern}`).not.toMatch(pattern);
		}
	}

	expect(fs.existsSync(path.join(process.cwd(), 'Services', 'CardService.cs'))).toBe(false);
	expect(fs.existsSync(path.join(process.cwd(), 'Hubs', 'GameHub', 'GameHub.SpecialCards.cs'))).toBe(false);
	expect(fs.existsSync(path.join(process.cwd(), 'wwwroot', 'data', 'special_cards.json'))).toBe(false);
});
