const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { createRoom } = require('./game-test-helpers');

test.use({
	ignoreHTTPSErrors: true,
});

const HEALTH_FILES = [
	{
		file: path.join(process.cwd(), 'wwwroot', 'data', 'physical_conditions.json'),
		key: 'physical_conditions',
	},
	{
		file: path.join(process.cwd(), 'wwwroot', 'data', 'mental_conditions.json'),
		key: 'mental_conditions',
	},
];

const SEVERITY_CODES = ['light', 'medium', 'hard', 'veryHard', 'critical'];
const LANGUAGES = ['uk', 'ru', 'en'];

test('health JSON uses the new localized severity format', async () => {
	for (const { file, key } of HEALTH_FILES) {
		const root = JSON.parse(fs.readFileSync(file, 'utf8'));
		const records = root[key];

		expect(Array.isArray(records), `${key} should be an array`).toBe(true);
		expect(records.length, `${key} should not be empty`).toBeGreaterThan(0);

		for (const record of records) {
			expect(record.id, `${key} record id`).toBeTruthy();
			expect(record.category, `${record.id} category`).toBeTruthy();
			expect(typeof record.hasSeverity, `${record.id} hasSeverity`).toBe('boolean');
			expect(record.localization, `${record.id} localization`).toBeTruthy();

			for (const lang of LANGUAGES) {
				const localized = record.localization[lang];
				expect(localized, `${record.id} ${lang} localization`).toBeTruthy();
				expect(localized.name, `${record.id} ${lang} name`).toBeTruthy();

				if (record.hasSeverity) {
					for (const code of SEVERITY_CODES) {
						expect(localized.descriptions?.[code], `${record.id} ${lang} ${code}`).toBeTruthy();
					}
				} else {
					expect(localized.description, `${record.id} ${lang} description`).toBeTruthy();
				}
			}
		}
	}
});

test('generated player shows physical and mental health without raw JSON keys', async ({ page }) => {
	await createRoom(page, 'P1', `Health Smoke ${Date.now()}`);

	const myPlayerSection = page.locator('#myPlayerSection');
	await expect(myPlayerSection).toContainText(/Фізичне здоров|Physical health|Физическое здоровье/i);
	await expect(myPlayerSection).toContainText(/Психічне здоров|Mental health|Психическое здоровье/i);
	await expect(myPlayerSection).toContainText(/Стан:|State:/i);
	await expect(myPlayerSection).not.toContainText(/hasSeverity|descriptions|veryHard|critical/i);

	const healthText = await myPlayerSection.innerText();
	const stateValues = [...healthText.matchAll(/(?:Стан:|State:)\s*([^\n]+)/g)]
		.map(match => match[1].trim())
		.filter(Boolean);

	expect(stateValues.length).toBeGreaterThanOrEqual(2);
	for (const value of stateValues.slice(0, 2)) {
		expect(value).not.toBe('');
	}
});
