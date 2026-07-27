# Аудит бібліотеки apocalypse effects

## Фактичний склад архіву

- PNG-файлів у джерелі: **79**.
- Унікальних номерів: **78**.
- Прийнято й покращено для runtime: **75**.
- Відхилено: **3**.
- Відсутні номери: **26, 57**.
- Дубль: **75**.

## Зафіксована структура

```text
wwwroot/assets/ui/apocalypse-effects/
├── universal/
├── local/
├── edge/
├── ui/
├── apocalypse-effects-manifest.json
└── apocalypse-effects.css
```

Ця структура є стандартною для наступних apocalypse-effect пакетів.

## Що покращено

- Прибрано суфікси `(1)` і нормалізовано назви.
- Видалено точний дубль №75.
- Прозорість нормалізовано за типом використання.
- Надто яскраві кольори приглушено.
- У `universal`, `local` та `ui` краї плавно зведено до нульової прозорості.
- Повністю прозорі RGB-пікселі очищено, щоб не виникали білі ореоли.
- У маніфесті всім ефектам задано `repeatable: false`, тому квадратні межі не повинні повторюватися.

## Відхилені

- `53` — Надто слабкий і візуально не відповідає dead-screen haze.
- `55` — Файл фактично порожній: корисний ефект відсутній.
- `58` — Надто слабкий і містить випадкові овальні контури замість system overload.

## Відсутні

- `26-frost-edge-mask-overlay.png`
- `57-diagnostic-noise-overlay.png`

## Основне правило використання

Не повторювати PNG як tile. Застосовувати `background-repeat: no-repeat` і `background-size: cover`.
Для одного апокаліпсису використовувати максимум три шари:

1. один `universal` або `local`;
2. за потреби один `edge`;
3. за потреби один `ui`.

## Preview

- `docs/audits/previews/apocalypse-effects-dark-preview.jpg`
- `docs/audits/previews/apocalypse-effects-light-preview.jpg`

## Patch v2

Додано 5 відсутніх/перегенерованих ефектів у runtime-структуру:

- `26-frost-edge-mask` → `edge/`
- `53-dead-screen-haze` → `ui/`
- `55-emergency-power-flicker` → `ui/`
- `57-diagnostic-noise` → `ui/`
- `58-system-overload` → `ui/`

Після патчу повна бібліотека містить **80 ефектів**.
