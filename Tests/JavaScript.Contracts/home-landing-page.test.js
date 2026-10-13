const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const home = fs.readFileSync(path.join(root, 'Views', 'Home', 'Index.cshtml'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'Views', 'Shared', '_Layout.cshtml'), 'utf8');
const translations = fs.readFileSync(path.join(root, 'wwwroot', 'js', 'site.js'), 'utf8');
const landingKeys = [...home.matchAll(/data-i18n="(landing[^"]+)"/g)].map(match => match[1]);

test('landing page keeps player-first flow, translations, and guarded navigation', () => {
  assert.match(home, /landing-hero/);
  assert.match(home, /asp-controller="Games" asp-action="Index" data-i18n="landingStartPlaying"/);
  assert.equal((home.match(/class="step-card"/g) || []).length, 3);
  assert.equal((home.match(/class="feature-card"/g) || []).length, 6);
  assert.ok(!/SignalR|SQLite|ASP\.NET|Playwright|xUnit/.test(home));
  const missingTranslations = [];
  for (const language of ['uk', 'en', 'ru']) {
    const languageStart = translations.indexOf(`        ${language}: {`);
    const languageEnd = translations.indexOf('\n        },', languageStart);
    const block = translations.slice(languageStart, languageEnd);
    landingKeys.forEach(key => {
      if (!new RegExp(`${key}:`).test(block)) missingTranslations.push(`${language}:${key}`);
    });
  }
  assert.deepEqual(missingTranslations, []);
  assert.match(layout, /AuthorizeAsync\(User, "OwnerOnly"\)/);
  assert.match(layout, /<details class="profile-menu">/);
});
