const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const story = fs.readFileSync('wwwroot/js/bunker/post-game-story-director.js', 'utf8');
const view = fs.readFileSync('Views/Shared/Bunker/_PostGameStoryDirector.cshtml', 'utf8');
const hub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.PostGameStory.cs', 'utf8');
const roomHub = fs.readFileSync('Hubs/BunkerHubGame/GameHub.Rooms.cs', 'utf8');

test('one story root and one set of published handlers own the story UI', () => {
  assert.equal((view.match(/id="postGameStoryRoot"/g) || []).length, 1);
  assert.equal((story.match(/hub\.on\('PostGameStoryPublished'/g) || []).length, 1);
  assert.match(story, /if \(bound \|\| !hub\) return/);
  assert.doesNotMatch(story, /\.innerHTML\s*=/);
  assert.match(story, /node\.textContent = text \|\| ''/);
});

test('developer controls and public waiting state are separate', () => {
  assert.match(view, /id="postGameStoryWaiting"/);
  assert.match(view, /data-story-mode="continuation"/);
  assert.match(story, /const isCurrentDeveloper/);
  assert.match(story, /if \(!isCurrentDeveloper\(\) && drafting\)/);
  assert.match(story, /phase === 'FinalDiscussion' \|\| phase === 'HostDecision'[\s\S]*hideUi\(\)/);
  assert.match(hub, /RequireStoryDeveloper/);
  assert.match(roomHub, /isDeveloper[\s\S]*ToHostDto[\s\S]*ToPublicDto/);
});

test('typing is skippable, reduced-motion aware, visibility safe, and sound stays local', () => {
  assert.match(story, /postGameStoryShowAll[\s\S]*showAll/);
  assert.match(story, /prefers-reduced-motion: reduce/);
  assert.match(story, /document\.hidden/);
  assert.match(story, /visibilitychange/);
  assert.match(story, /localStorage\.getItem\(soundKey\)/);
  assert.match(story, /AudioContext/);
  assert.doesNotMatch(story, /connection\.invoke\([^\n]*sound/i);
});

test('reconnect restores without replay and new game clears UI', () => {
  assert.match(story, /options\?\.reconnect[\s\S]*showAll\(\)/);
  assert.match(story, /function clear\(\)/);
  assert.match(story, /postGameStoryRoot'\)\) \$\('postGameStoryRoot'\)\.hidden = true/);
  assert.match(story, /data-story-mode/);
  assert.doesNotMatch(view, /<script[^>]+src=/i);
  assert.doesNotMatch(story, /canvas/i);
});

test('public server events never broadcast prompt, raw result, or preview', () => {
  const publicBroadcasts = hub.match(/Clients\.(?:OthersInGroup|Group)[\s\S]*?ToPublicDto\(room\.PostGameStory\)/g) || [];
  assert.ok(publicBroadcasts.length >= 3);
  assert.doesNotMatch(publicBroadcasts.join('\n'), /GeneratedPrompt|RawResult|PreviewFingerprint/);
  assert.match(hub, /Clients\.Caller\.SendAsync\("PostGameStoryDeveloperStateChanged"/);
});
