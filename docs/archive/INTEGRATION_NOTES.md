# Bunker game.js + SignalR modularization

## Що зроблено

Архів є самодостатнім об’єднаним пакетом: він містить попередню доменну декомпозицію SignalR handlers і нову декомпозицію решти `wwwroot/js/game.js`.

- `game.js` скорочено з 7598 до 1292 рядків.
- 482 top-level declarations перенесено без перейменування до 19 доменних `runtime.js` файлів.
- Mutable client state, створення SignalR connection, startup/bootstrap і top-level event wiring залишено в `game.js`.
- Дев’ять статичних `Object.assign(uiTranslations.*)` перенесено до `wwwroot/js/bunker/i18n/game-translations.js`.
- Збережена classic-script архітектура: немає `import`, `export`, ES modules або dynamic loader.
- `Views/Bunker/Index.cshtml` підключає runtime-файли перед SignalR registrations і перед `game.js`.
- `GAME_JS_FUNCTION_MANIFEST.json` містить домен, початковий рядок і SHA-256 кожної перенесеної декларації.

## Доменні runtime-файли

- apocalypse
- bunker
- characters
- core
- diagnostics
- events
- global-content
- gm
- i18n
- inventory
- lobby
- postgame
- public-overview
- rounds
- special-cards
- threats
- timer
- ui
- voting

## Перевірено

- `node --check` для `game.js`, усіх 19 runtime-файлів і `game-translations.js`.
- Один цільовий Node test: `game-js-domain-modularization.test.js` — 1/1 pass, 8 assertions.
- Усі 55 script paths з `Index.cshtml` існують у змодельованому повному дереві.
- Дублів top-level declarations між завантаженими scripts не знайдено.
- VM smoke load виконав 55 scripts у фактичному порядку без top-level exception; SignalR callback bodies при цьому не запускалися.
- 482 declarations мають одного власника у manifest і відсутні в новому `game.js`.

## Що не перевірено

`dotnet build`, сервер і Playwright не запускалися, тому що завантажений `Views.zip` не містить `.csproj`, `.slnx`, C# серверної частини та повного набору тестів.

Старі JavaScript contract tests, які читають `game.js` як текст і очікують конкретну функцію саме в цьому файлі, можуть потребувати relocation-aware оновлення. Не виправляй їх масово: змінюй лише релевантні assertions після фактичного запуску.

## Застосування

Розпакувати архів у корінь `bunker-git` із заміною файлів. Архів уже містить правильні repo-relative paths `wwwroot/...`, `Views/...`, `Tests/...`.

Після розпакування:

```powershell
git --no-pager diff --check
git --no-pager diff --stat
git --no-pager status --short
node --test Tests/JavaScript.Contracts/game-js-domain-modularization.test.js
dotnet build Bunker.slnx --no-restore
```

Потім запустити один вузький Playwright сценарій, який перевіряє вхід у кімнату, reconnect і базовий render.
