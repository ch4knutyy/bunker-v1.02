const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..', '..');
const manifest = JSON.parse(
	fs.readFileSync(path.join(repoRoot, 'SIGNALR_EVENT_MANIFEST.json'), 'utf8'));

const expectedEvents = manifest.events.map(entry => entry.event);
const expectedSet = new Set(expectedEvents);
const domainFiles = [...new Set(Object.values(manifest.domainFiles))]
	.map(relativePath => path.join(repoRoot, relativePath));

function countMatches(files, pattern) {
	const counts = new Map();
	for (const file of files) {
		const source = fs.readFileSync(file, 'utf8');
		for (const match of source.matchAll(pattern)) {
			const eventName = match[1];
			counts.set(eventName, (counts.get(eventName) || 0) + 1);
		}
	}
	return counts;
}

test('SignalR domain decomposition preserves the contract', () => {
	assert.equal(domainFiles.every(fs.existsSync), true);

	const offCounts = countMatches(
		domainFiles,
		/connection\.off\((?:'|")([^'"]+)(?:'|")\);/g);
	const onCounts = countMatches(
		domainFiles,
		/connection\.on\((?:'|")([^'"]+)(?:'|"),/g);

	assert.deepEqual(
		[...offCounts.entries()].filter(([name]) => expectedSet.has(name)).sort(),
		expectedEvents.map(name => [name, 1]).sort());
	assert.deepEqual(
		[...onCounts.entries()].filter(([name]) => expectedSet.has(name)).sort(),
		expectedEvents.map(name => [name, 1]).sort());

	const corePath = path.join(repoRoot, 'wwwroot/js/bunker/core/signalr-events.js');
	const coreSource = fs.readFileSync(corePath, 'utf8');
	const callOrder = [...coreSource.matchAll(/events\.[A-Za-z][A-Za-z0-9]*\.([A-Za-z][A-Za-z0-9]*)\(\);/g)]
		.map(match => match[1])
		.filter(name => expectedSet.has(name));

	assert.deepEqual(callOrder, expectedEvents);
	assert.equal(/connection\.(?:off|on)\(/.test(coreSource), false);

	const indexSource = fs.readFileSync(
		path.join(repoRoot, 'Views/Bunker/Index.cshtml'), 'utf8');
	const firstDomainScript = indexSource.indexOf('/apocalypse/signalr-events.js');
	const coreScript = indexSource.indexOf('/core/signalr-events.js');
	const gameScript = indexSource.indexOf('~/js/game.js');
	assert.equal(firstDomainScript >= 0 && firstDomainScript < coreScript && coreScript < gameScript, true);
});
