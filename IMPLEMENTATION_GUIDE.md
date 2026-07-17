# Керівництво з імплементації генерації характеристик

**Проєкт:** Bunker / Vault Judgment  
**Версія документа:** актуалізована v2  
**Стан:** відповідає поточній архітектурі після Character Cards, Player Comparison, Lobby-3 та reconnect/snapshot робіт

---

## 1. Загальна архітектура

Генерація характеристик у проєкті складається з чотирьох рівнів:

1. **Контентні JSON-файли**  
   Зберігають професії, хобі, фізичні та психічні стани, риси, факти, фобії, предмети та інший контент.

2. **Моделі даних і завантаження контенту**  
   C#-моделі десеріалізують JSON, а сервіс даних завантажує та кешує контент.

3. **CharacterGeneratorService**  
   Створює canonical персонажа на сервері, використовуючи room settings та генераційні правила.

4. **Safe DTO + frontend rendering**  
   Server передає лише дозволені дані, а універсальний JavaScript-renderer показує приховані та розкриті характеристики.

Критично:

- server є єдиним джерелом істини;
- приховані характеристики не повинні потрапляти в DOM;
- reconnect не повинен перегенеровувати персонажа;
- snapshot restore не повинен reroll-ити характеристики;
- SeatNumber і порядок UI не впливають на значення персонажа.

---

# 2. Контентні моделі

Контентні моделі розташовуються в `Models/GameData/` або іншій чинній папці контентної архітектури.

## Основні типи

| Тип | Призначення |
|---|---|
| `HobbyData` | Хобі, бонус, предмет, опис |
| `ProfessionData` | Професія, навички, capability tags, предмети |
| `MentalConditionData` | Психічний стан і severity-specific дані |
| `PhysicalConditionData` | Фізичний стан, severity, лікування, обмеження |
| `TraitData` | Риса характеру, тип, категорія, ефект |
| `FactData` | Факт про персонажа |
| `PhobiaData` | Фобія як окрема категорія |
| `ItemData` | Малий інвентар |
| `SpecialCardData` | Спеціальна карта |
| `SecretGoalData` | Таємна ціль |

Фобії не повинні змішуватися з `mental_conditions`. Вони мають окремий контентний файл і окрему характеристику персонажа.

---

# 3. Stable ID

Кожен контентний запис повинен мати стабільний ID.

Приклад:

```json
{
  "id": "physical_152",
  "name": "Променева хвороба",
  "category": "radiation",
  "allowsSeverity": true
}
```

Stable ID використовується для:

- snapshot;
- reconnect;
- effects;
- profession abilities;
- special cards;
- threat consequences;
- localization;
- content editor;
- image binding;
- audit.

Не використовувати:

- позицію в JSON-масиві;
- локалізовану назву;
- runtime index.

---

# 4. Локалізація контенту

Основні мови:

- UA;
- RU;
- EN.

Рекомендований формат:

```json
{
  "id": "hobby_tailoring",
  "name": "Шиття",
  "description": "Вміє ремонтувати та виготовляти одяг.",
  "_i18n": {
    "ru": {
      "name": "Шитьё",
      "description": "Умеет ремонтировать и изготавливать одежду."
    },
    "en": {
      "name": "Sewing",
      "description": "Can repair and produce clothing."
    }
  }
}
```

Назви JSON-полів мають бути однаковими для всіх мов.

Не створювати окрему runtime-логіку для кожної мови.

---

# 5. Canonical модель персонажа

Персонаж може містити:

- `PersonalInfo`;
- `Personality`;
- `Body`;
- `Profession`;
- `PhysicalHealth`;
- `AdditionalPhysicalConditions`;
- `MentalHealth`;
- `Hobby`;
- `CharacterTrait`;
- `Phobia`;
- `Inventory`;
- `Facts`;
- `SpecialCards`;
- `SecretGoal`.

## Важливі правила

- усі значення генеруються на сервері;
- генерація відбувається після validated start;
- spectator не отримує персонажа;
- reconnect використовує існуючого персонажа;
- repeated start не запускає генерацію повторно;
- snapshot restore не змінює характеристики.

---

# 6. Severity system

Проєкт використовує шкалу:

- none / без стану;
- stable;
- light;
- medium;
- hard;
- very hard;
- critical.

Назви enum та serialized values повинні відповідати чинній реалізації.

## Severity потрібна не для всіх станів

Не показувати ступінь для станів, де градація не має сенсу:

- ампутація;
- повна сліпота;
- повна глухота;
- відсутність органа;
- постійні анатомічні особливості;
- інші binary/permanent conditions.

## Рекомендована модель

```csharp
public sealed class PhysicalConditionData
{
    public string Id { get; set; } = "";
    public bool AllowsSeverity { get; set; }
    public IReadOnlyDictionary<string, LocalizedSeverityData>? Severities { get; set; }
}
```

Краще задавати `AllowsSeverity` та доступні рівні безпосередньо в JSON.

Не рекомендується визначати це через:

- пошук слів у назві;
- `Contains("ампутація")`;
- жорстко прописані локалізовані категорії;
- числовий поріг старого поля `Severity`.

---

# 7. Severity-specific descriptions

Один стан повинен мати різні описи залежно від ступеня.

Приклад:

```json
{
  "id": "physical_asthma",
  "name": "Астма",
  "allowsSeverity": true,
  "severityDescriptions": {
    "light": {
      "description": "Рідкі напади після сильного навантаження.",
      "effect": "Невелике обмеження витривалості."
    },
    "medium": {
      "description": "Регулярні напади при фізичній роботі.",
      "effect": "Потребує інгалятора та обмежує важку працю."
    },
    "hard": {
      "description": "Часті важкі напади.",
      "effect": "Високий ризик під час фізичних завдань."
    }
  }
}
```

Tooltip і card subtitle повинні використовувати description саме поточного рівня.

---

# 8. Physical Health

Рекомендовані runtime-поля:

```csharp
public sealed class PhysicalHealth
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string BaseName { get; set; } = "";
    public string? SeverityLevel { get; set; }
    public bool AllowsSeverity { get; set; }
    public string? Description { get; set; }
    public string? GameEffect { get; set; }
    public string? Tooltip { get; set; }
}
```

## AdditionalPhysicalConditions

Додаткові фізичні стани:

- зберігаються окремим списком;
- включаються в snapshot;
- передаються після reveal;
- показуються в tooltip основного Physical Health;
- не повинні зникати після refresh;
- не повинні дублюватися після threat effect.

Threat effect, наприклад `physical_152`, застосовується один раз через canonical EffectsApplied flow.

---

# 9. Mental Health

Mental Health використовує ту саму severity architecture:

```csharp
public sealed class MentalHealth
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string BaseName { get; set; } = "";
    public string? SeverityLevel { get; set; }
    public string? Description { get; set; }
    public string? GameEffect { get; set; }
    public string? Tooltip { get; set; }
}
```

Фобії не додаються до цієї моделі.

Для future profession ability `Психолог` стан повинен мати:

- підтримку зменшення severity;
- мінімальну межу;
- ознаку, чи стан взагалі піддається лікуванню;
- snapshot-safe mutation.

---

# 10. Profession

Професія може містити:

```csharp
public sealed class Profession
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public IReadOnlyList<string> Skills { get; set; } = [];
    public IReadOnlyList<string> CapabilityTags { get; set; } = [];
    public IReadOnlyList<string> AllItems { get; set; } = [];
    public string? SelectedItem { get; set; }
    public string? Bonus { get; set; }
    public string? Description { get; set; }
    public string? Tooltip { get; set; }
}
```

## CapabilityTags

Використовуються для:

- професійної іконки;
- майбутніх profession abilities;
- сумісності із загрозами;
- бонусів;
- фільтрації.

Приклади:

```text
medical
psychology
engineering
security
food
science
leadership
```

Не визначати тип професії через локалізовану назву.

## Profession item mapping

Професійний предмет повинен вибиратися з canonical profession mapping.

Звичайний інвентар береться з `items.json`.

Не змішувати:

- profession item;
- starting inventory;
- large item;
- special card.

---

# 11. Hobby

Поточні підтримувані поля:

```csharp
public sealed class Hobby
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Item { get; set; }
    public string? Bonus { get; set; }
    public string? Description { get; set; }
    public string? Tooltip { get; set; }
}
```

Frontend підтримує aliases для старих полів, але canonical поле для предмета — `Item`.

Experience не потрібно показувати, якщо такого поля немає в поточному JSON і generator.

---

# 12. Character Trait

```csharp
public sealed class CharacterTrait
{
    public string Id { get; set; } = "";
    public string Name { get; set; } = "";
    public string? Type { get; set; }
    public string? Category { get; set; }
    public string? Effect { get; set; }
    public string? Description { get; set; }
    public string? Tooltip { get; set; }
}
```

Tooltip не повинен формуватися лише як:

```text
Тип: strong
```

У UI необхідно локалізувати:

- type;
- category;
- effect.

Технічні enum/raw values не повинні показуватися користувачу.

---

# 13. CharacterGeneratorService

`CharacterGeneratorService` відповідає за:

- вибір profession;
- hobby;
- physical health;
- mental health;
- phobia;
- trait;
- facts;
- inventory;
- special cards;
- secret goal;
- body/personality;
- localization;
- room settings.

## RoomGameSettings integration

Генератор уже повинен враховувати:

- `StartingInventoryCount`;
- кількість special cards;
- special cards enabled/disabled;
- Apocalypse/Bunker settings через start flow;
- frozen settings після старту.

Balanced/Chaos generation та category toggles поки не повинні симулюватися фальшивими controls, доки generator не буде розділений на незалежні canonical pipelines.

---

# 14. Weighted random

Weighted random треба реалізовувати як конфігуровану таблицю, а не як розкидані `if`.

Приклад:

```csharp
private static readonly IReadOnlyList<(SeverityLevel Level, int Weight)> MentalWeights =
[
    (SeverityLevel.None, 50),
    (SeverityLevel.Light, 20),
    (SeverityLevel.Medium, 15),
    (SeverityLevel.Hard, 8),
    (SeverityLevel.VeryHard, 5),
    (SeverityLevel.Critical, 2)
];
```

Алгоритм:

1. порахувати суму weights;
2. отримати random roll;
3. пройти cumulative weights;
4. повернути відповідний рівень.

Вимоги:

- injected/random abstraction для тестів;
- без static shared `Random` у конкурентних room operations;
- deterministic test cases;
- graceful fallback;
- no impossible severity for condition.

---

# 15. Майбутній псевдорандом

Поточний Classic generator залишається canonical.

Наступний етап повинен додати:

- Classic;
- Balanced;
- Chaos.

## Balanced

Правила:

- не генерувати ідеального персонажа;
- хоча б одна meaningful weakness;
- сильна profession компенсується негативом;
- хороше Physical Health не гарантує хороший Mental Health;
- уникати однакових archetypes;
- не робити всіх персонажів однаково слабкими.

Для цього потрібен scoring layer:

```text
profession utility
physical severity
mental severity
inventory utility
hobby usefulness
trait impact
fact impact
special-card value
```

Не реалізовувати це набором випадкових `if` без тестованої моделі оцінки.

---

# 16. Tooltip architecture

Старі окремі:

- `_CharacteristicTooltip.cshtml`;
- `tooltip.css`;
- `tooltip.js`;
- inline `!` triggers;

не є основною поточною архітектурою.

Поточний UI використовує:

- універсальний `renderCharacteristicCard(model)`;
- card-specific data model;
- tooltip portal;
- hover;
- focus;
- tap;
- Escape;
- outside click;
- conditional tooltip;
- shared health tooltip;
- AdditionalPhysicalConditions;
- no duplicate listeners.

## Tooltip показується лише коли є корисні дані

Показувати tooltip, якщо є:

- description;
- effect;
- bonus;
- item details;
- additional conditions;
- gameplay explanation.

Не показувати порожню tooltip-іконку.

---

# 17. Universal Character Card Renderer

Frontend використовує один renderer:

```javascript
renderCharacteristicCard(model)
```

Підтримувані типи:

- Personality;
- Body;
- Profession;
- PhysicalHealth;
- MentalHealth;
- Hobby;
- CharacterTrait;
- Phobia;
- Inventory;
- Fact.

Card renderer відповідає за:

- hidden/revealed state;
- category identity;
- icon;
- title;
- value;
- meta;
- tooltip;
- severity variant;
- accessibility;
- responsive layout.

Не створювати окрему Razor Partial View для кожної характеристики.

---

# 18. Hidden data і privacy

Порядок renderer критичний:

1. визначити, чи характеристика розкрита;
2. якщо прихована — відрендерити safe hidden card;
3. не читати hidden value;
4. не записувати hidden value в:
   - HTML;
   - aria-label;
   - `data-*`;
   - tooltip;
   - debug output.

Host без OM не повинен бачити приховані характеристики інших гравців.

Spectator отримує лише public state.

---

# 19. Reveal flow

Canonical reveal flow:

1. player надсилає reveal command;
2. server перевіряє:
   - membership;
   - ownership;
   - lifecycle;
   - round;
   - already revealed;
   - pending/idempotency;
3. server змінює canonical state;
4. broadcast public safe DTO;
5. frontend rerender;
6. reconnect отримує той самий revealed state.

Не покладатися на client-only reveal flags.

---

# 20. Player Overview і Comparison

Характеристики використовуються у двох режимах:

## Один гравець

- selected player;
- previous/next navigation;
- canonical seat order;
- 10 compact characteristic cards.

## Усі гравці

- comparison mode;
- усі dossiers;
- sorting by UI copy;
- canonical SeatNumber не змінюється;
- special-card neighbor semantics не залежать від сортування.

Генераційні моделі повинні бути сумісні з обома режимами.

---

# 21. Reconnect і snapshot

Після refresh:

- персонаж не генерується повторно;
- reveal state не губиться;
- AdditionalPhysicalConditions не зникають;
- severity не перетворюється на `Unknown`;
- tooltip використовує current localized data;
- inventory не дублюється;
- special cards не дублюються.

Snapshot повинен зберігати:

- canonical character;
- revealed characteristics;
- used special cards;
- additional physical conditions;
- temporary effects;
- profession ability state у майбутньому.

---

# 22. Рекомендоване формування tooltip

Tooltip краще збирати зі структурованих полів у renderer, а не зберігати один довгий готовий текст у JSON.

## Profession

```text
Навички: ...
Предмет професії: ...
Бонус: ...
```

## Hobby

```text
Опис: ...
Може: ...
Предмет: ...
```

## Physical/Mental Health

```text
Стан: ...
Ступінь: ...
Опис: ...
Ефект у грі: ...
Додаткові стани: ...
```

## Trait

```text
Тип: ...
Категорія: ...
Ефект: ...
```

Це спрощує:

- локалізацію;
- стилізацію;
- severity changes;
- profession abilities;
- mobile layout.

---

# 23. Tests

## Unit tests

Перевірити:

- JSON deserialization;
- stable IDs;
- localization fallback;
- weighted random;
- unsupported severity;
- no-severity condition;
- profession item mapping;
- hobby item;
- starting inventory count;
- special cards count;
- disabled special cards;
- reconnect-safe generation;
- snapshot round-trip;
- AdditionalPhysicalConditions;
- threat-applied physical condition.

## Frontend tests

Перевірити:

- hidden data absent from DOM;
- revealed value visible;
- tooltip conditional;
- health tooltip;
- additional conditions;
- Escape/outside click;
- no duplicate listeners;
- profession icon by capability tag;
- hobby item rendering;
- severity variant;
- desktop 3 columns;
- tablet 2;
- mobile 1;
- Player Overview;
- Player Comparison;
- long localized text.

## Regression

- refresh after reveal;
- refresh after threat effect;
- snapshot restore;
- host/non-host/spectator;
- language switch;
- special cards disabled;
- starting inventory 0/1/2.

---

# 24. Що в старій документації більше неактуально

Не слід вважати current architecture:

- окремий `_PlayerCard.cshtml` як головний renderer;
- окремий `_CharacteristicTooltip.cshtml` для кожної характеристики;
- обов’язковий `tooltip.css`/`tooltip.js`;
- `!` як єдиний tooltip trigger;
- визначення severity через локалізовані назви;
- `GetRevealedData` як єдине джерело UI;
- client-side збереження розкритих значень;
- статичний tooltip string як основне представлення;
- hardcoded profession/hobby colors без category identity.

Поточне джерело UI:

- canonical server state;
- safe DTO;
- `game.js`;
- `game.css`;
- universal Character Card renderer.

---

# 25. Наступні етапи системи характеристик

1. Pseudorandom Character Generation.
2. Physical Health v2.
3. Mental Health v2.
4. Profession Abilities v1.
5. Character Generation Modes.
6. Large Items.
7. Content expansion:
   - Physical Health до 500;
   - Mental Conditions до 200;
   - Hobbies до 500;
   - Traits до 200;
   - Facts 300+.
8. Повна UA / RU / EN перевірка.
9. Balance tests на великих генераційних вибірках.

---

# 26. Резюме

Поточна система характеристик більше не є набором Razor Partial Views із локальними tooltip. Вона складається з:

```text
JSON content
→ GameDataService
→ CharacterGeneratorService
→ canonical Player state
→ safe reveal DTO
→ universal Character Card renderer
→ Player Overview / Comparison
```

Основні принципи:

- stable IDs;
- server source of truth;
- explicit severity metadata;
- phobias separate from mental conditions;
- reconnect/snapshot safety;
- hidden data absent from DOM;
- один renderer;
- структуровані tooltip;
- localization-ready content;
- генераційні правила, які можна тестувати.