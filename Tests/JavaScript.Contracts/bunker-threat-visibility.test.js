const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const view = fs.readFileSync(path.join(root, 'Views', 'Shared', 'Bunker', '_GameBoard.cshtml'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'threats', 'runtime.js'), 'utf8');
const story = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'core', 'story-flow.js'), 'utf8');
const events = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'bunker', 'threats', 'signalr-events.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'wwwroot', 'css', 'game.css'), 'utf8');

test('unrevealed threats leave no public panel content or layout gap', () => {
  assert.match(view, /id="threatPanel"[^>]*hidden[^>]*style="display: none;"/);
  assert.doesNotMatch(view, /threatContent|Невідомо|Загроза ще не розкрита/);
  assert.match(runtime, /const isPublicThreat = enabled && isRevealed/);
  assert.match(runtime, /if \(!isPublicThreat\)[\s\S]*panel\.replaceChildren\(\)[\s\S]*storySection\.hidden = true/);
  assert.match(css, /\.game-story-section\[hidden\]\s*\{\s*display:\s*none;/);
});

test('a revealed threat uses the existing panel after Bunker and live updates stay targeted', () => {
  assert.ok(story.indexOf("const threat = ensureBunkerStorySection(game, 'threatGameSection')") < story.indexOf("const characteristics = ensureBunkerStorySection"));
  assert.match(story, /move\('bunkerPanel', bunker\);[\s\S]*move\('threatPanel', threat\);[\s\S]*move\('myPlayerSection', characteristics\);/);
  assert.match(runtime, /content\.innerHTML = renderThreatScenario\(buildThreatScenarioModel\(threat, isRevealed\)\)/);
  assert.match(events, /ThreatRevealed[\s\S]*renderThreatPanel\(currentThreat\)[\s\S]*addEventMessage/);
  assert.match(events, /ThreatStateUpdated[\s\S]*renderThreatPanel\(currentThreat\)[\s\S]*syncBunkerVotingStoryState\(\)/);
  assert.doesNotMatch(events.slice(events.indexOf('ThreatStateUpdated'), events.indexOf('ThreatSupportDiceRolled')), /renderCurrentGameUI\(\)/);
});
