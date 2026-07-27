# Консолідований аудит UI-матеріалів

## Підсумок

- Базових матеріалів у фінальній бібліотеці: **44**.
- Накладок у фінальній бібліотеці: **27**.
- Усього прийнятих assets: **71**.
- Поточна партія: перевірено 50 нових файлів.
- Із поточної партії прийнято: **31**.
- Із поточної партії відхилено: **19**.

## Прийняті нові базові матеріали

- `lead-shielding-metal`
- `titanium-alloy`
- `powder-coated-steel`
- `phenolic-laminate`
- `glazed-clinical-ceramic`
- `acoustic-felt`
- `fireproof-mineral-board`
- `refractory-fireclay`
- `compact-clinical-laminate`
- `sanitation-hdpe`
- `aged-utility-pvc`
- `chemical-fluoropolymer`
- `smoked-polycarbonate`
- `cryogenic-insulated-composite`

## Прийняті нові накладки

- `grime-dust`
- `oil-smear`
- `condensation-moisture`
- `light-dust-speckles`
- `fingerprints-handling`
- `dried-water-stains`
- `paint-fading-bleaching`
- `small-paint-chips`
- `metal-micro-pitting`
- `chemical-etching`
- `mold-mildew`
- `sand-grit`
- `fine-ash-fall`
- `waterline-stains`
- `electric-arc-scorch`
- `impact-abrasion`
- `peeling-paint-fragments`

## Перегенерувати — базові матеріали

- `34-epoxy-coated-concrete` — виглядає як регулярна ребриста або тканинна поверхня, а не епоксидний бетон.
- `37-dark-marble` — хвилястий візерунок не читається як природний мармур.
- `39-recycled-plastic-composite` — майже немає характерних дрібних перероблених включень.
- `41-aged-bronze` — помітна смуга та нестабільний тон при повторенні.
- `42-cast-iron` — сильні квадратні стики й блокова повторюваність.
- `43-blackened-steel` — сильна блокова повторюваність.
- `44-weathering-steel` — сильна блокова повторюваність.
- `45-nickel-plated-steel` — сильні світлі квадратні стики.
- `46-zinc-primer-steel` — сильна блокова повторюваність.
- `48-dark-basalt` — помітні квадратні стики при тайлінгу.
- `49-aged-slate` — помітні квадратні стики та нерівномірне освітлення.
- `50-institutional-terrazzo` — не читаються мінеральні включення, є блокові стики.
- `57-compressed-cork-composite` — не читається гранульована структура корка.
- `58-tar-treated-timber` — неприродні регулярні хвилясті смуги замість деревини.
- `59-woven-aramid-composite` — майже відсутня тканинна структура араміду.
- `60-mica-electrical-laminate` — виглядає як звичайний коричневий ламінат із регулярним бандінгом.

## Перегенерувати — накладки

- `06-disinfectant-cleaning-streaks` — виглядає як подряпини, а не напівпрозорі сліди протирання.
- `19-adhesive-tape-residue` — надто слабка й майже не дає корисного видимого шару.
- `20-mineral-salt-bloom` — не читається як кристалічний сольовий наліт.

## Правила використання

- Файли з `overlays/universal/` можна повторювати або розподіляти по великих поверхнях лише з низькою opacity.
- Файли з `overlays/local/` не повторювати сіткою по всій панелі; використовувати як один локальний декоративний шар.
- Файли з `overlays/edge/` застосовувати лише по краях або через CSS mask.
- Латунь, мідь та інші виразні метали краще використовувати на рамках, кнопках і акцентних деталях, а не на великих текстових площинах.
- Відчуття скла підсилювати CSS-фаскою та локальним відблиском, а не кольоровим glow.
- Текстури не повинні напряму визначати колір апокаліпсису.