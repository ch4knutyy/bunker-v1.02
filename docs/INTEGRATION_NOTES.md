# Інтеграція SignalR 02E

## Що зроблено

- Усі 110 `connection.off/on` пар перенесено з `wwwroot/js/bunker/core/signalr-events.js` у 15 доменних файлів.
- `core/signalr-events.js` залишено центральним оркестратором із початковим порядком реєстрації.
- `Views/Bunker/Index.cshtml` підключає всі доменні файли перед `core/signalr-events.js`, а core — перед `game.js`.
- Не додано `import`, `export`, ES modules або динамічний loader.
- Імена подій, callback-и, payload-обробка та `off/on` пари не переписувалися.
- `showSpecialCardImpactToast`, reset pending-флагів перед `RejoinSuccess` і приватний helper `mergeThreatPlayerSnapshots` збережено у відповідних доменах.

## Структура

- `apocalypse`: 5 подій
- `bunker`: 11
- `characters`: 10
- `diagnostics`: 7
- `events`: 7
- `gm`: 10
- `inventory`: 1
- `lobby`: 17
- `postgame`: 2
- `rounds`: 5
- `special-cards`: 5
- `threats`: 17
- `timer`: 2
- `ui`: 1
- `voting`: 10

Lobby-файл залишається найбільшим через великі початкові callback-и `RoomCreated`, `RoomJoined`, `GameStarted` і `RejoinSuccess`. Вони навмисно не переписувалися.

## Виконані перевірки

У підготовленому пакеті пройшли:

1. `node --check` для всіх 16 SignalR JavaScript-файлів.
2. Один цільовий Node test із 6 assertions.
3. Runtime smoke: оркестратор зареєстрував рівно 110 handlers у початковому порядку.
4. Детерміноване порівняння: усі 110 перенесених `off/on` блоків збігаються з вихідними після видалення лише додаткового відступу wrapper-методу.

`dotnet build` не запускався, бо у завантаженому ZIP немає solution/project-файлів і серверної частини.

## Як застосувати

ZIP містить лише змінені та нові файли з правильними шляхами. Розпакуй його в корінь:

`C:\Users\lapte\Desktop\Bunker\bunker-git`

Після розпакування запусти:

```powershell
node --test .\Tests\JavaScript.Contracts\signalr-events-domain-decomposition.test.js

Get-ChildItem .\wwwroot\js\bunker -Recurse -Filter signalr-events.js |
    ForEach-Object { node --check $_.FullName }

dotnet build --no-restore
git diff --check
git status --short
```

Не запускай старі або повні test suites на цьому етапі.

Файли `.gitkeep` у заповнених доменних каталогах можна залишити — вони не впливають на роботу.
