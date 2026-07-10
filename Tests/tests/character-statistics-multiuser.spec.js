const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const {
	newContextWithNgrokBypass,
	isGoogleFontsConsoleError,
} = require('./ngrok-bypass');

test.use({
	ignoreHTTPSErrors: true,
});

test.describe.configure({ mode: 'serial' });

const BASE_URL = (process.env.BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const GAME_URL = process.env.GAME_URL || `${BASE_URL}/game`;

const SAMPLE_ROOM_COUNT = positiveInt(process.env.SAMPLE_ROOM_COUNT, 1000);
const PLAYERS_PER_ROOM = positiveInt(process.env.PLAYERS_PER_ROOM, 6);
const PLAYER_SLOTS = Array.from({ length: PLAYERS_PER_ROOM }, (_, index) => `P${index + 1}`);

const CARD_HEADINGS = [
	'Особистість',
	'Статура',
	'Професія',
	"Фізичне здоров'я",
	"Психічне здоров'я",
	'Хобі',
	'Риса характеру',
	'Фобія',
	'Інвентар',
	'Факт',
];

const FIELD_LABELS = [
	'Вік:',
	'Стать:',
	'Орієнтація:',
	'Зріст:',
	'Вага:',
	'Тип тіла:',
	'Назва:',
	'Досвід:',
	'Стан:',
	'Заняття:',
	'Риса:',
	'Страх:',
	'Предмети:',
	'Факт:',
];

const CHARACTER_FIELDS = [
	'profession',
	'physicalHealth',
	'mentalHealth',
	'hobby',
	'characterTrait',
	'phobia',
	'inventory',
	'fact',
	'sex',
	'orientation',
	'bodyType',
	'age',
	'height',
	'weight',
];

const CRITICAL_FIELDS = [
	'profession',
	'physicalHealth',
	'mentalHealth',
	'hobby',
	'characterTrait',
	'inventory',
];

const OPTIONAL_FIELDS = [
	'fact',
	'phobia',
];

const REPEAT_FIELDS = [
	'profession',
	'physicalHealth',
	'mentalHealth',
	'hobby',
	'fact',
	'inventory',
];

const FIELD_TITLES = {
	profession: 'Професії',
	physicalHealth: 'Фізичне здоров’я',
	mentalHealth: 'Психічне здоров’я',
	hobby: 'Хобі',
	characterTrait: 'Риси характеру',
	phobia: 'Фобії',
	inventory: 'Інвентар',
	fact: 'Факти',
	sex: 'Стать',
	orientation: 'Орієнтація',
	bodyType: 'Тип тіла',
	age: 'Вік',
	height: 'Зріст',
	weight: 'Вага',
};

const NORMAL_HEALTH_LIMITS = [
	{
		field: 'physicalHealth',
		title: 'Здоровий фізичний стан',
		maxPerRoom: 2,
		pattern: /здоров|healthy/i,
	},
	{
		field: 'mentalHealth',
		title: 'Стабільний психічний стан',
		maxPerRoom: 2,
		pattern: /стабіль|стабил|stable/i,
	},
];

function positiveInt(value, fallback) {
	const parsed = Number.parseInt(value, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function cleanValue(value) {
	return String(value || '')
		.replace(/[🔒ℹⓘ❗!]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function getSection(bodyText, heading) {
	const start = bodyText.indexOf(heading);

	if (start === -1) {
		return '';
	}

	const afterHeading = bodyText.slice(start + heading.length);
	let end = afterHeading.length;

	for (const nextHeading of CARD_HEADINGS) {
		if (nextHeading === heading) continue;

		const index = afterHeading.indexOf(`\n${nextHeading}`);

		if (index !== -1 && index < end) {
			end = index;
		}
	}

	return afterHeading.slice(0, end);
}

function getValueAfterLabel(sectionText, label) {
	const lines = sectionText
		.split('\n')
		.map(line => line.trim())
		.filter(Boolean);

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		if (!line.startsWith(label)) {
			continue;
		}

		const valueParts = [];
		const sameLineValue = line.replace(label, '').trim();

		if (sameLineValue) {
			valueParts.push(sameLineValue);
		}

		for (let j = i + 1; j < lines.length; j++) {
			const nextLine = lines[j];
			const isNextField = FIELD_LABELS.some(fieldLabel => nextLine.startsWith(fieldLabel));
			const isButton = /Розкрити|Покинути|Приєднатися|Створити|Reveal|Leave|Join|Create/.test(nextLine);
			const isHeading = CARD_HEADINGS.includes(nextLine);

			if (isNextField || isButton || isHeading) {
				break;
			}

			valueParts.push(nextLine);
		}

		return cleanValue(valueParts.join(' ')) || null;
	}

	return null;
}

function extractCharacterDataFromText(bodyText) {
	const personality = getSection(bodyText, 'Особистість');
	const body = getSection(bodyText, 'Статура');
	const profession = getSection(bodyText, 'Професія');
	const physicalHealth = getSection(bodyText, "Фізичне здоров'я");
	const mentalHealth = getSection(bodyText, "Психічне здоров'я");
	const hobby = getSection(bodyText, 'Хобі');
	const characterTrait = getSection(bodyText, 'Риса характеру');
	const phobia = getSection(bodyText, 'Фобія');
	const inventory = getSection(bodyText, 'Інвентар');
	const fact = getSection(bodyText, 'Факт');

	return {
		profession: getValueAfterLabel(profession, 'Назва:'),
		physicalHealth: getValueAfterLabel(physicalHealth, 'Стан:'),
		mentalHealth: getValueAfterLabel(mentalHealth, 'Стан:'),
		hobby: getValueAfterLabel(hobby, 'Заняття:'),
		characterTrait: getValueAfterLabel(characterTrait, 'Риса:'),
		phobia: getValueAfterLabel(phobia, 'Страх:'),
		inventory: getValueAfterLabel(inventory, 'Предмети:'),
		fact: getValueAfterLabel(fact, 'Факт:'),
		sex: getValueAfterLabel(personality, 'Стать:'),
		orientation: getValueAfterLabel(personality, 'Орієнтація:'),
		bodyType: getValueAfterLabel(body, 'Тип тіла:'),
		age: getValueAfterLabel(personality, 'Вік:'),
		height: getValueAfterLabel(body, 'Зріст:'),
		weight: getValueAfterLabel(body, 'Вага:'),
	};
}

async function extractCharacterDataFromCards(page) {
	return await page.locator('#myPlayerCards').evaluate(container => {
		const clean = value => String(value || '')
			.replace(/[🔒ℹⓘ❗!]/g, '')
			.replace(/\s+/g, ' ')
			.trim();

		const cards = [...container.querySelectorAll('.char-card')];
		const findCard = patterns => cards.find(card => {
			const title = clean(card.querySelector('.char-card-title')?.innerText || '');
			return patterns.some(pattern => pattern.test(title));
		});
		const valueByLabel = (card, labels) => {
			if (!card) return null;
			const rows = [...card.querySelectorAll('.char-row')];

			for (const row of rows) {
				const label = clean(row.querySelector('.char-label')?.innerText || '').replace(/:$/, '');
				if (!labels.some(expected => expected.test(label))) continue;

				const value = clean(row.querySelector('.char-value')?.innerText || '');
				return value || null;
			}

			return null;
		};

		const personality = findCard([/Особистість/i, /Personality/i, /Личность/i]);
		const body = findCard([/Статура/i, /Body/i, /Телосложение/i]);
		const profession = findCard([/Професія/i, /Profession/i, /Профессия/i]);
		const physicalHealth = findCard([/Фізичне здоров/i, /Physical health/i, /Физическое здоровье/i]);
		const mentalHealth = findCard([/Психічне здоров/i, /Mental health/i, /Психическое здоровье/i]);
		const hobby = findCard([/Хобі/i, /Hobby/i, /Хобби/i]);
		const characterTrait = findCard([/Риса характеру/i, /Character trait/i, /Черта характера/i]);
		const phobia = findCard([/Фобія/i, /Phobia/i, /Фобия/i]);
		const inventory = findCard([/Інвентар/i, /Inventory/i, /Инвентарь/i]);
		const fact = findCard([/Факт/i, /Fact/i]);

		return {
			profession: valueByLabel(profession, [/Назва/i, /Name/i, /Название/i]),
			physicalHealth: valueByLabel(physicalHealth, [/Стан/i, /State/i, /Состояние/i]),
			mentalHealth: valueByLabel(mentalHealth, [/Стан/i, /State/i, /Состояние/i]),
			hobby: valueByLabel(hobby, [/Заняття/i, /Activity/i, /Занятие/i]),
			characterTrait: valueByLabel(characterTrait, [/Риса/i, /Trait/i, /Черта/i]),
			phobia: valueByLabel(phobia, [/Страх/i, /Fear/i]),
			inventory: valueByLabel(inventory, [/Предмети/i, /Items/i, /Предметы/i]),
			fact: valueByLabel(fact, [/Факт/i, /Fact/i]),
			sex: valueByLabel(personality, [/Стать/i, /Sex/i, /Пол/i]),
			orientation: valueByLabel(personality, [/Орієнтація/i, /Orientation/i, /Ориентация/i]),
			bodyType: valueByLabel(body, [/Тип тіла/i, /Body type/i, /Тип тела/i]),
			age: valueByLabel(personality, [/Вік/i, /Age/i, /Возраст/i]),
			height: valueByLabel(body, [/Зріст/i, /Height/i, /Рост/i]),
			weight: valueByLabel(body, [/Вага/i, /Weight/i, /Вес/i]),
		};
	});
}

async function extractCharacterData(page) {
	const myPlayerSection = page.locator('#myPlayerSection');

	await expect(myPlayerSection).toBeVisible({ timeout: 15000 });
	await expect(myPlayerSection).not.toContainText('Немає даних гравця', { timeout: 15000 });

	const domData = await extractCharacterDataFromCards(page);
	const bodyText = await myPlayerSection.innerText();
	const textData = extractCharacterDataFromText(bodyText);

	return Object.fromEntries(CHARACTER_FIELDS.map(field => [
		field,
		domData[field] || textData[field],
	]));
}

function createFieldCounters() {
	return Object.fromEntries(CHARACTER_FIELDS.map(field => [field, {}]));
}

function createSlotCounters() {
	return Object.fromEntries(PLAYER_SLOTS.map(slot => [slot, createFieldCounters()]));
}

function addCount(counter, value) {
	const key = value || '__MISSING__';
	counter[key] = (counter[key] || 0) + 1;
}

function createMissingValues() {
	return {
		total: 0,
		byField: Object.fromEntries(CHARACTER_FIELDS.map(field => [
			field,
			{
				total: 0,
				critical: CRITICAL_FIELDS.includes(field),
				optional: OPTIONAL_FIELDS.includes(field),
				examples: [],
			},
		])),
		bySlot: Object.fromEntries(PLAYER_SLOTS.map(slot => [
			slot,
			Object.fromEntries(CHARACTER_FIELDS.map(field => [field, 0])),
		])),
	};
}

function recordMissingValue(missingValues, field, slot, roomIndex, roomName) {
	missingValues.total += 1;
	missingValues.byField[field].total += 1;
	missingValues.bySlot[slot][field] += 1;

	if (missingValues.byField[field].examples.length < 20) {
		missingValues.byField[field].examples.push({
			roomIndex,
			roomName,
			slot,
		});
	}
}

function createRepeatSummary() {
	return Object.fromEntries(REPEAT_FIELDS.map(field => [
		field,
		{
			roomsWithRepeats: 0,
			repeatedValues: {},
			examples: [],
		},
	]));
}

function analyzeRoomRepeats(roomIndex, roomName, characters, repeatSummary) {
	const roomRepeats = {};

	for (const field of REPEAT_FIELDS) {
		const counts = {};

		for (const character of characters) {
			const value = character.data[field];
			if (!value) continue;
			addCount(counts, value);
		}

		const duplicates = Object.entries(counts)
			.filter(([, count]) => count > 1)
			.map(([value, count]) => ({ value, count }));

		if (!duplicates.length) continue;

		roomRepeats[field] = duplicates;
		repeatSummary[field].roomsWithRepeats += 1;

		for (const duplicate of duplicates) {
			repeatSummary[field].repeatedValues[duplicate.value] = (repeatSummary[field].repeatedValues[duplicate.value] || 0) + duplicate.count;
		}

		if (repeatSummary[field].examples.length < 20) {
			repeatSummary[field].examples.push({
				roomIndex,
				roomName,
				duplicates,
			});
		}
	}

	return roomRepeats;
}

function analyzeNormalHealthLimits(roomIndex, roomName, characters) {
	return NORMAL_HEALTH_LIMITS.map(rule => {
		const players = characters
			.filter(character => rule.pattern.test(character.data[rule.field] || ''))
			.map(character => character.playerName);

		return {
			roomIndex,
			roomName,
			field: rule.field,
			title: rule.title,
			count: players.length,
			maxPerRoom: rule.maxPerRoom,
			players,
			ok: players.length <= rule.maxPerRoom,
		};
	});
}

function percent(count, total) {
	if (!total) return 0;
	return Number(((count / total) * 100).toFixed(2));
}

function sortedRows(counter, total) {
	return Object.entries(counter)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'))
		.map(([value, count]) => ({
			value,
			count,
			percent: percent(count, total),
		}));
}

function escapeMarkdown(value) {
	return String(value ?? '')
		.replace(/\|/g, '\\|')
		.replace(/\n/g, ' ')
		.trim();
}

function markdownTable(counter, total) {
	const rows = sortedRows(counter, total);
	let markdown = `| Значення | Кількість | % |\n`;
	markdown += `|---|---:|---:|\n`;

	for (const row of rows) {
		markdown += `| ${escapeMarkdown(row.value)} | ${row.count} | ${row.percent}% |\n`;
	}

	return `${markdown}\n`;
}

function createMarkdownReport(report) {
	let markdown = `# Multiuser Character Statistics Report\n\n`;

	markdown += `## Summary\n`;
	markdown += `- rooms: ${report.rooms}\n`;
	markdown += `- playersPerRoom: ${report.playersPerRoom}\n`;
	markdown += `- totalCharacters: ${report.totalCharacters}\n`;
	markdown += `- errors: ${report.errors.length}\n`;
	markdown += `- consoleErrors: ${report.consoleErrors.length}\n`;
	markdown += `- pageErrors: ${report.pageErrors.length}\n`;
	markdown += `- missing values: ${report.missingValues.total}\n\n`;

	markdown += `## Health normal limits\n\n`;
	markdown += `| Стан | Порушень | Максимум у кімнаті |\n`;
	markdown += `|---|---:|---:|\n`;
	for (const rule of NORMAL_HEALTH_LIMITS) {
		const violations = report.normalHealthLimitViolations.filter(item => item.field === rule.field);
		const maxCount = report.normalHealthLimits
			.filter(item => item.field === rule.field)
			.reduce((max, item) => Math.max(max, item.count), 0);
		markdown += `| ${rule.title} | ${violations.length} | ${maxCount} |\n`;
	}
	markdown += `\n`;

	markdown += `## Загальна статистика професій\n`;
	markdown += markdownTable(report.counters.profession, report.totalCharacters);

	markdown += `## Професії по слотах\n\n`;
	for (const slot of PLAYER_SLOTS) {
		markdown += `### ${slot}\n`;
		markdown += markdownTable(report.slotCounters[slot].profession, report.rooms);
	}

	const sections = [
		'physicalHealth',
		'mentalHealth',
		'hobby',
		'characterTrait',
		'fact',
		'inventory',
	];

	for (const field of sections) {
		markdown += `## ${FIELD_TITLES[field]}\n`;
		markdown += markdownTable(report.counters[field], report.totalCharacters);
	}

	markdown += `## Повторення всередині кімнат\n\n`;
	markdown += `| Поле | Кімнат з повтореннями | Топ повторень |\n`;
	markdown += `|---|---:|---|\n`;

	for (const field of REPEAT_FIELDS) {
		const summary = report.repeatWithinRooms[field];
		const topRepeats = sortedRows(summary.repeatedValues, report.totalCharacters)
			.slice(0, 10)
			.map(row => `${escapeMarkdown(row.value)} (${row.count})`)
			.join(', ');

		markdown += `| ${FIELD_TITLES[field]} | ${summary.roomsWithRepeats} | ${topRepeats || '-'} |\n`;
	}

	markdown += `\n## Missing values\n\n`;
	markdown += `| Поле | Missing | Critical | Optional | Приклади |\n`;
	markdown += `|---|---:|---|---|---|\n`;

	for (const field of CHARACTER_FIELDS) {
		const item = report.missingValues.byField[field];
		const examples = item.examples
			.slice(0, 5)
			.map(example => `${example.roomName}:${example.slot}`)
			.join(', ');

		markdown += `| ${FIELD_TITLES[field]} | ${item.total} | ${item.critical ? 'yes' : 'no'} | ${item.optional ? 'yes' : 'no'} | ${escapeMarkdown(examples || '-')} |\n`;
	}

	return markdown;
}

async function collectConsoleErrors(page, label, consoleErrors, pageErrors) {
	page.on('console', message => {
		if (message.type() === 'error' && !isGoogleFontsConsoleError(message.text())) {
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

	await page.getByTestId('create-room-btn').click();

	const playersList = page.locator('#roomPlayersList');
	await expect(playersList).toContainText(playerName, { timeout: 15000 });
	await expect(playersList).toContainText(/Хост|Host|Ведущий/, { timeout: 15000 });
	await expect(page.locator('#myPlayerSection')).toBeVisible({ timeout: 15000 });
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

	await roomCard.getByRole('button', {
		name: /Приєднатися|Присоединиться|Join/i,
	}).click();

	await expect(page.getByRole('button', {
		name: /Покинути кімнату|Покинуть комнату|Leave/i,
	})).toBeVisible({ timeout: 15000 });
	await expect(page.locator('#myPlayerSection')).toBeVisible({ timeout: 15000 });
}

function writeReports(report) {
	const outputDir = path.join(process.cwd(), 'test-results');
	fs.mkdirSync(outputDir, { recursive: true });

	const jsonPath = path.join(outputDir, `character-statistics-multiuser-${SAMPLE_ROOM_COUNT}.json`);
	const markdownPath = path.join(outputDir, `character-statistics-multiuser-${SAMPLE_ROOM_COUNT}.md`);

	fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
	fs.writeFileSync(markdownPath, createMarkdownReport(report), 'utf-8');

	return { jsonPath, markdownPath };
}

test(`STATS MULTIUSER: ${SAMPLE_ROOM_COUNT} кімнат по ${PLAYERS_PER_ROOM} гравців`, async ({ browser }) => {
	test.setTimeout(1000 * 60 * 240);

	const counters = createFieldCounters();
	const slotCounters = createSlotCounters();
	const missingValues = createMissingValues();
	const repeatWithinRooms = createRepeatSummary();
	const normalHealthLimits = [];
	const normalHealthLimitViolations = [];
	const roomSummaries = [];
	const samples = [];
	const errors = [];
	const consoleErrors = [];
	const pageErrors = [];

	for (let roomIndex = 1; roomIndex <= SAMPLE_ROOM_COUNT; roomIndex++) {
		const roomName = `Stats Multiuser Room ${roomIndex}`;
		const contexts = [];
		const pages = [];
		const roomCharacters = [];

		try {
			const hostContext = await newContextWithNgrokBypass(browser, {
				ignoreHTTPSErrors: true,
			});
			contexts.push(hostContext);

			const hostPage = await hostContext.newPage();
			await collectConsoleErrors(hostPage, `${roomName}:P1`, consoleErrors, pageErrors);
			await createRoom(hostPage, 'P1', roomName);

			pages.push({
				slot: 'P1',
				playerName: 'P1',
				page: hostPage,
			});

			for (let playerIndex = 2; playerIndex <= PLAYERS_PER_ROOM; playerIndex++) {
				const playerName = `P${playerIndex}`;
				const context = await newContextWithNgrokBypass(browser, {
					ignoreHTTPSErrors: true,
				});
				contexts.push(context);

				const page = await context.newPage();
				await collectConsoleErrors(page, `${roomName}:${playerName}`, consoleErrors, pageErrors);
				await joinRoom(page, playerName, roomName);

				pages.push({
					slot: playerName,
					playerName,
					page,
				});
			}

			for (const player of pages) {
				const data = await extractCharacterData(player.page);

				for (const field of CHARACTER_FIELDS) {
					addCount(counters[field], data[field]);
					addCount(slotCounters[player.slot][field], data[field]);

					if (!data[field]) {
						recordMissingValue(missingValues, field, player.slot, roomIndex, roomName);
					}
				}

				const sample = {
					roomIndex,
					roomName,
					slot: player.slot,
					playerName: player.playerName,
					...data,
				};

				samples.push(sample);
				roomCharacters.push({
					slot: player.slot,
					playerName: player.playerName,
					data,
				});
			}

			const roomRepeats = analyzeRoomRepeats(roomIndex, roomName, roomCharacters, repeatWithinRooms);
			const roomHealthLimits = analyzeNormalHealthLimits(roomIndex, roomName, roomCharacters);
			normalHealthLimits.push(...roomHealthLimits);

			for (const item of roomHealthLimits) {
				if (!item.ok) {
					normalHealthLimitViolations.push(item);
					errors.push({
						roomIndex,
						roomName,
						message: `${item.title}: ${item.count}/${item.maxPerRoom} (${item.players.join(', ')})`,
					});
				}
			}

			roomSummaries.push({
				roomIndex,
				roomName,
				players: PLAYERS_PER_ROOM,
				repeats: roomRepeats,
				normalHealthLimits: roomHealthLimits,
			});

			console.log(`[${roomIndex}/${SAMPLE_ROOM_COUNT}] ${roomName}: ${roomCharacters.length} characters`);
		} catch (error) {
			errors.push({
				roomIndex,
				roomName,
				message: error.message,
			});

			console.log(`[${roomIndex}/${SAMPLE_ROOM_COUNT}] ERROR ${roomName}: ${error.message}`);
		} finally {
			for (const context of contexts.reverse()) {
				await context.close().catch(() => {});
			}
		}
	}

	const report = {
		createdAt: new Date().toISOString(),
		baseUrl: BASE_URL,
		rooms: SAMPLE_ROOM_COUNT,
		playersPerRoom: PLAYERS_PER_ROOM,
		totalCharacters: samples.length,
		counters,
		slotCounters,
		repeatWithinRooms,
		normalHealthLimits,
		normalHealthLimitViolations,
		missingValues,
		samples,
		roomSummaries,
		errors,
		consoleErrors,
		pageErrors,
	};

	const { jsonPath, markdownPath } = writeReports(report);
	console.log(`JSON report: ${jsonPath}`);
	console.log(`Markdown report: ${markdownPath}`);

	expect(errors).toEqual([]);
	expect(consoleErrors).toEqual([]);
	expect(pageErrors).toEqual([]);

	for (const field of CRITICAL_FIELDS) {
		expect(missingValues.byField[field].total, `${field} має пропущені значення`).toBe(0);
	}
});
