# Керівництво з імплементації генерації характеристик

## Створені файли

### 1. Моделі даних для JSON (Models/GameData/)
| Файл | Призначення |
|------|-------------|
| `HobbyData.cs` | Модель для десеріалізації hobbies.json |
| `ProfessionData.cs` | Модель для десеріалізації professions.json |
| `MentalConditionData.cs` | Модель для десеріалізації mental_conditions.json |
| `PhysicalConditionData.cs` | Модель для десеріалізації physical_conditions.json |
| `TraitData.cs` | Модель для десеріалізації traits.json |
| `SecretData.cs` | Модель для десеріалізації secrets.json |

### 2. Оновлені моделі характеристик (Models/Characteristics/)
| Файл | Додані поля |
|------|-------------|
| `Hobby.cs` | `Item`, `Bonus`, `Tooltip`, `HasTooltip` |
| `Profession.cs` | `Skills`, `AllItems`, `SelectedItem`, `Bonus`, `Tooltip`, `HasTooltip` |
| `MentalHealth.cs` | `BaseName`, `SeverityLevel`, `Tooltip`, `HasTooltip` |
| `PhysicalHealth.cs` | `BaseName`, `SeverityLevel`, `AllowsSeverity`, `Tooltip`, `HasTooltip` |
| `Traits.cs` | `Type`, `Category`, `Effect`, `Tooltip`, `HasTooltip` |
| `Secret.cs` | `Name`, `Type`, `Category` |

### 3. ViewModel та Helper
| Файл | Призначення |
|------|-------------|
| `Models/ViewModels/CharacteristicViewModel.cs` | Загальна модель для UI |
| `Models/ViewModels/CharacteristicTooltipModel.cs` | Модель для Partial View |
| `Models/SeverityLevel.cs` | Enum та Helper для ступенів тяжкості |
| `Helpers/TooltipHelper.cs` | Допоміжні методи для створення tooltip моделей |

### 4. Сервіси (Service/)
| Файл | Призначення |
|------|-------------|
| `GameDataService.cs` | Завантаження та кешування JSON даних |
| `CharacterGeneratorService.cs` | Оновлений генератор з tooltip та weighted random |

### 5. Views
| Файл | Призначення |
|------|-------------|
| `Views/Shared/_CharacteristicTooltip.cshtml` | Partial View для характеристики з tooltip |
| `Views/Shared/_PlayerCard.cshtml` | Повна картка гравця з усіма tooltip |

### 6. CSS/JS
| Файл | Призначення |
|------|-------------|
| `wwwroot/css/tooltip.css` | Стилі для знака оклику та tooltip |
| `wwwroot/js/tooltip.js` | JavaScript для інтерактивності tooltip |

## Змінені файли

### Program.cs
```csharp
// Додано реєстрацію GameDataService
builder.Services.AddSingleton<GameDataService>();
builder.Services.AddSingleton<CharacterGeneratorService>();
builder.Services.AddSingleton<PlayerStorageService>();
```

### Views/Shared/_Layout.cshtml
```html
<!-- Додано підключення CSS -->
<link rel="stylesheet" href="~/css/tooltip.css" asp-append-version="true" />

<!-- Додано підключення JS -->
<script src="~/js/tooltip.js" asp-append-version="true"></script>
```

### GameHub.cs
- Оновлено `RevealCharacteristic` для передачі tooltip даних
- Оновлено `GetRevealedData` для включення tooltip інформації

## Ключові алгоритми

### Weighted Random для ментальних станів
```csharp
public static SeverityLevel GetWeightedRandomSeverity()
{
    int roll = _random.Next(100);
    
    if (roll < 50) return SeverityLevel.None;       // 50%
    if (roll < 70) return SeverityLevel.Mild;       // 20%
    if (roll < 85) return SeverityLevel.Moderate;   // 15%
    if (roll < 93) return SeverityLevel.Severe;     // 8%
    if (roll < 98) return SeverityLevel.VerySevere; // 5%
    return SeverityLevel.Critical;                   // 2%
}
```

### Визначення чи потрібна ступінь для фізичного стану
```csharp
private static bool DetermineIfAllowsSeverity(PhysicalConditionData data)
{
    // НЕ потрібна для: інвалідність, травма, ампутація
    if (NoSeverityCategories.Contains(data.Category.ToLower()))
        return false;
    
    // НЕ потрібна для конкретних станів
    if (NoSeverityConditions.Any(c => data.Name.Contains(c)))
        return false;
    
    // Потрібна для хронічних та тривожних
    if (data.Category.ToLower() is "хронічний" or "тривожний")
        return true;
    
    // За замовчуванням - якщо тяжкість < 8
    return data.Severity < 8;
}
```

### Формування tooltip
```csharp
// Для професії
"Вміє {bonus} та має при собі {selectedItem}."
// Приклад: "Вміє навчати виживанню та має при собі ніж."

// Для хобі
"Може {bonus} та отримує бонусом: {item}."
// Приклад: "Може виготовляти теплий одяг та отримує бонусом: спиці та нитки."

// Для ментального стану
"{SeverityLevel} {name}. {Description}. Ефект у грі: {gameEffect}."
// Приклад: "Важка форма піроманії. Патологічний потяг до підпалів. Ефект у грі: може спалити бункер."

// Для фізичного стану
"{SeverityLevel} {name}. {Description}. Ефект у грі: {gameEffect}."
// Приклад: "Середня форма астми. Напади задухи при фізичному навантаженні. Ефект у грі: обмежена фізична активність."

// Для особливості
"Тип: {type}. {effect}."
// Приклад: "Тип: сильна. Легше схиляє на свій бік."
```

## Використання у Razor View

### Варіант 1: Inline HTML
```html
<div class="characteristic-with-tooltip">
    <span class="characteristic-name">@Model.Profession.Name</span>
    @if (Model.Profession.HasTooltip)
    {
        <span class="tooltip-trigger profession">!</span>
        <div class="tooltip-content">@Model.Profession.Tooltip</div>
    }
</div>
```

### Варіант 2: Partial View
```html
@await Html.PartialAsync("_CharacteristicTooltip", new CharacteristicTooltipModel {
    Name = Model.Profession.Name,
    Tooltip = Model.Profession.Tooltip,
    TypeClass = "profession"
})
```

## Кольори tooltip за типом

| Тип | CSS клас | Колір |
|-----|----------|-------|
| Професія | `.profession` | Синій (#4a90d9) |
| Хобі | `.hobby` | Зелений (#27ae60) |
| Ментальний стан | `.mental` | Фіолетовий (#9b59b6) |
| Фізичний стан | `.physical` | Червоний (#e74c3c) |
| Особливість | `.trait` | Оранжевий (#f39c12) |
