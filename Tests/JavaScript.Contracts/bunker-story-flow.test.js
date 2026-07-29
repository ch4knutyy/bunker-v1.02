const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('wwwroot/js/bunker/core/story-flow.js', 'utf8');

test('game flow preserves one canonical vertical sequence without an intro controller', () => {
	assert.match(source, /move\('apocalypsePanel', apocalypse\)[\s\S]*move\('bunkerPanel', bunker\)[\s\S]*move\('myPlayerSection', characteristics\)[\s\S]*move\('publicPlayerOverview', characteristics\)[\s\S]*move\('votingPanel', voting\)[\s\S]*move\('specialCardsSection', special/);
	assert.match(source, /move\('startVotingBtn', voting\)/);
	assert.doesNotMatch(source, /sessionStorage|localStorage|setTimeout|requestAnimationFrame|scrollIntoView/);
	assert.doesNotMatch(source, /skipBunkerStoryReveal|continueBunkerStoryReveal|startBunkerStoryReveal/);
	assert.doesNotMatch(source, /storyApocalypseTitle|storyBunkerTitle/);
});
