const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const BASE_ORIGIN = new URL(BASE_URL).origin;

async function setupNgrokBypass(target) {
	if (!BASE_ORIGIN.includes('ngrok-free')) {
		return;
	}

	await target.route('**/*', async route => {
		const request = route.request();
		const url = request.url();

		if (url.startsWith(BASE_ORIGIN)) {
			await route.continue({
				headers: {
					...request.headers(),
					'ngrok-skip-browser-warning': 'true',
				},
			});
			return;
		}

		await route.continue();
	});
}

async function newContextWithNgrokBypass(browser, options = {}) {
	const context = await browser.newContext(options);
	await setupNgrokBypass(context);
	return context;
}

function isGoogleFontsConsoleError(text) {
	return /fonts\.(gstatic|googleapis)\.com/i.test(String(text || ''));
}

module.exports = {
	BASE_URL,
	BASE_ORIGIN,
	setupNgrokBypass,
	newContextWithNgrokBypass,
	isGoogleFontsConsoleError,
};
