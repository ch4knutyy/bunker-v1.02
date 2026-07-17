const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { newContextWithNgrokBypass } = require('./ngrok-bypass');

test.use({
    ignoreHTTPSErrors: true,
});

test.describe.configure({ mode: 'serial' });

const BASE_URL = (process.env.BASE_URL || 'https://localhost:7283').replace(/\/$/, '');
const GAME_URL = process.env.GAME_URL || `${BASE_URL}/Bunker`;
const SAMPLE_COUNT = Number(process.env.SAMPLE_COUNT || 100);

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

function cleanValue(value) {
    return value
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
            const isButton = /Розкрити|Покинути|Приєднатися|Створити/.test(nextLine);
            const isHeading = CARD_HEADINGS.includes(nextLine);

            if (isNextField || isButton || isHeading) {
                break;
            }

            valueParts.push(nextLine);
        }

        return cleanValue(valueParts.join(' '));
    }

    return null;
}

function addCount(counter, value) {
    const key = value || '__MISSING__';

    counter[key] = (counter[key] || 0) + 1;
}

function top(counter, limit = 30) {
    return Object.entries(counter)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([value, count]) => ({
            value,
            count,
            percent: Number(((count / SAMPLE_COUNT) * 100).toFixed(2)),
        }));
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
        age: getValueAfterLabel(personality, 'Вік:'),
        sex: getValueAfterLabel(personality, 'Стать:'),
        orientation: getValueAfterLabel(personality, 'Орієнтація:'),

        height: getValueAfterLabel(body, 'Зріст:'),
        weight: getValueAfterLabel(body, 'Вага:'),
        bodyType: getValueAfterLabel(body, 'Тип тіла:'),

        profession: getValueAfterLabel(profession, 'Назва:'),
        professionExperience: getValueAfterLabel(profession, 'Досвід:'),

        physicalHealth: getValueAfterLabel(physicalHealth, 'Стан:'),
        mentalHealth: getValueAfterLabel(mentalHealth, 'Стан:'),

        hobby: getValueAfterLabel(hobby, 'Заняття:'),
        characterTrait: getValueAfterLabel(characterTrait, 'Риса:'),
        phobia: getValueAfterLabel(phobia, 'Страх:'),
        inventory: getValueAfterLabel(inventory, 'Предмети:'),
        fact: getValueAfterLabel(fact, 'Факт:'),
    };
}

function createMarkdownReport(report) {
    const sections = [
        ['Професії', report.top.profession],
        ['Фізичне здоровʼя', report.top.physicalHealth],
        ['Психічне здоровʼя', report.top.mentalHealth],
        ['Хобі', report.top.hobby],
        ['Риси характеру', report.top.characterTrait],
        ['Фобії', report.top.phobia],
        ['Інвентар', report.top.inventory],
        ['Факти', report.top.fact],
        ['Стать', report.top.sex],
        ['Орієнтація', report.top.orientation],
        ['Тип тіла', report.top.bodyType],
    ];

    let markdown = `# Character Statistics Report\n\n`;
    markdown += `Samples: ${report.sampleCount}\n\n`;
    markdown += `Created at: ${report.createdAt}\n\n`;

    for (const [title, rows] of sections) {
        markdown += `## ${title}\n\n`;
        markdown += `| Значення | Кількість | % |\n`;
        markdown += `|---|---:|---:|\n`;

        for (const row of rows) {
            markdown += `| ${row.value} | ${row.count} | ${row.percent}% |\n`;
        }

        markdown += `\n`;
    }

    if (report.errors.length > 0) {
        markdown += `## Errors\n\n`;

        for (const error of report.errors) {
            markdown += `- Iteration ${error.iteration}: ${error.message}\n`;
        }
    }

    return markdown;
}

async function createRoom(page, playerName, roomName) {
    await page.goto(GAME_URL);

    await page.getByTestId('player-name-input').fill(playerName);
    await page.getByTestId('room-name-input').fill(roomName);

    await page.getByTestId('create-room-btn').click();

    await expect(page.locator('#roomPlayersList')).toContainText(/Статистика|StatsTester|Хост|Ви/, {
        timeout: 10000,
    });

    await expect(page.locator('body')).not.toContainText('Немає даних гравця', {
        timeout: 10000,
    });
}

async function leaveRoomIfPossible(page) {
    const leaveButton = page.getByRole('button', {
        name: /Покинути кімнату|Leave|Вийти/,
    });

    if (await leaveButton.count()) {
        await leaveButton.first().click().catch(() => { });
    }
}

test(`STATS: згенерувати ${SAMPLE_COUNT} персонажів і порахувати повторення характеристик`, async ({ browser }) => {
    test.setTimeout(1000 * 60 * 120);

    const counters = {
        age: {},
        sex: {},
        orientation: {},
        height: {},
        weight: {},
        bodyType: {},
        profession: {},
        professionExperience: {},
        physicalHealth: {},
        mentalHealth: {},
        hobby: {},
        characterTrait: {},
        phobia: {},
        inventory: {},
        fact: {},
    };

    const samples = [];
    const errors = [];

    for (let i = 1; i <= SAMPLE_COUNT; i++) {
        const context = await newContextWithNgrokBypass(browser, {
            ignoreHTTPSErrors: true,
        });

        const page = await context.newPage();

        const playerName = 'StatBot';
        const roomName = `Stats Room ${Date.now()} ${i}`;

        try {
            await createRoom(page, playerName, roomName);

            const bodyText = await page.locator('body').innerText();
            const data = extractCharacterDataFromText(bodyText);

            samples.push({
                iteration: i,
                roomName,
                ...data,
            });

            for (const [field, value] of Object.entries(data)) {
                addCount(counters[field], value);
            }

            await leaveRoomIfPossible(page);

            console.log(`[${i}/${SAMPLE_COUNT}]`, data.profession, '|', data.physicalHealth, '|', data.hobby);
        } catch (error) {
            errors.push({
                iteration: i,
                message: error.message,
            });

            console.log(`[${i}/${SAMPLE_COUNT}] ERROR`, error.message);
        } finally {
            await context.close();
        }
    }

    const report = {
        createdAt: new Date().toISOString(),
        sampleCount: SAMPLE_COUNT,
        counters,
        top: {
            age: top(counters.age),
            sex: top(counters.sex),
            orientation: top(counters.orientation),
            height: top(counters.height),
            weight: top(counters.weight),
            bodyType: top(counters.bodyType),
            profession: top(counters.profession),
            professionExperience: top(counters.professionExperience),
            physicalHealth: top(counters.physicalHealth),
            mentalHealth: top(counters.mentalHealth),
            hobby: top(counters.hobby),
            characterTrait: top(counters.characterTrait),
            phobia: top(counters.phobia),
            inventory: top(counters.inventory),
            fact: top(counters.fact),
        },
        samples,
        errors,
    };

    const outputDir = path.join(process.cwd(), 'test-results');

    fs.mkdirSync(outputDir, {
        recursive: true,
    });

    const jsonPath = path.join(outputDir, `character-statistics-${SAMPLE_COUNT}.json`);
    const markdownPath = path.join(outputDir, `character-statistics-${SAMPLE_COUNT}.md`);

    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
    fs.writeFileSync(markdownPath, createMarkdownReport(report), 'utf-8');

    console.log(`\nJSON report: ${jsonPath}`);
    console.log(`Markdown report: ${markdownPath}\n`);

    expect(errors).toEqual([]);

    // Для статистичного тесту не треба валити весь тест через 1 пропущене optional-поле.
    // Але критичні поля все одно перевіряємо.
    const requiredFields = [
        'age',
        'sex',
        'orientation',
        'height',
        'weight',
        'bodyType',
        'profession',
        'physicalHealth',
        'mentalHealth',
        'hobby',
        'characterTrait',
        'phobia',
        'inventory',
    ];

    for (const field of requiredFields) {
        const missingCount = counters[field].__MISSING__ || 0;
        expect(missingCount, `${field} має пропущені значення`).toBe(0);
    }

    // Факт може не зчитатися через формат UI або якщо поле іноді відсутнє.
    // Поки що не валимо тест, а залишаємо __MISSING__ у звіті.
    const factMissingCount = counters.fact.__MISSING__ || 0;

    if (factMissingCount > 0) {
        console.warn(`WARNING: fact має пропущені значення: ${factMissingCount}/${SAMPLE_COUNT}`);
    }
});
