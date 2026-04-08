# Приклад фінального результату генерації гравця

## Згенеровані характеристики гравця "Іван"

### Базові характеристики (без tooltip)
- **Вік:** 34 роки
- **Стать:** Чоловіча
- **Орієнтація:** Гетеро
- **Статура:** 175 см, 78 кг (Нормальний)

### Характеристики з tooltip

---

#### 1. Професія
**Назва:** Інструктор з виживання (+Ніж)

**Знак оклику:** ⓘ (при наведенні показується tooltip)

**Tooltip:**
> "Вміє навчати виживанню та має при собі ніж."

---

#### 2. Хобі
**Назва:** В'язання

**Знак оклику:** ⓘ (при наведенні показується tooltip)

**Tooltip:**
> "Може виготовляти теплий одяг та отримує бонусом: спиці та нитки."

---

#### 3. Фізичне здоров'я
**Назва:** Астма (середня форма)

**Знак оклику:** ⓘ (при наведенні показується tooltip)

**Tooltip:**
> "Середня форма астми. Напади задухи при фізичному навантаженні. Ефект у грі: обмежена фізична активність."

---

#### 4. Ментальний стан
**Назва:** Піроманія (важка форма)

**Знак оклику:** ⓘ (при наведенні показується tooltip)

**Tooltip:**
> "Важка форма піроманії. Патологічний потяг до підпалів. Ефект у грі: може спалити бункер."

---

#### 5. Особливість (Trait)
**Назва:** Вміє переконувати людей

**Знак оклику:** ⓘ (при наведенні показується tooltip)

**Tooltip:**
> "Тип: сильна. Легше схиляє на свій бік."

---

## HTML приклад відображення

```html
<!-- Професія -->
<div class="player-characteristic">
    <span class="characteristic-label">Професія:</span>
    <span class="characteristic-value">
        <div class="characteristic-with-tooltip">
            <span class="characteristic-name">Інструктор з виживання (+Ніж)</span>
            <span class="tooltip-trigger profession">!</span>
            <div class="tooltip-content">
                Вміє навчати виживанню та має при собі ніж.
            </div>
        </div>
    </span>
</div>

<!-- Хобі -->
<div class="player-characteristic">
    <span class="characteristic-label">Хобі:</span>
    <span class="characteristic-value">
        <div class="characteristic-with-tooltip">
            <span class="characteristic-name">В'язання</span>
            <span class="tooltip-trigger hobby">!</span>
            <div class="tooltip-content">
                Може виготовляти теплий одяг та отримує бонусом: спиці та нитки.
            </div>
        </div>
    </span>
</div>

<!-- Фізичне здоров'я -->
<div class="player-characteristic">
    <span class="characteristic-label">Фіз. здоров'я:</span>
    <span class="characteristic-value">
        <div class="characteristic-with-tooltip">
            <span class="characteristic-name">Астма (середня форма)</span>
            <span class="tooltip-trigger physical">!</span>
            <div class="tooltip-content">
                Середня форма астми. Напади задухи при фізичному навантаженні. 
                Ефект у грі: обмежена фізична активність.
            </div>
        </div>
    </span>
</div>

<!-- Ментальний стан -->
<div class="player-characteristic">
    <span class="characteristic-label">Псих. стан:</span>
    <span class="characteristic-value">
        <div class="characteristic-with-tooltip">
            <span class="characteristic-name">Піроманія (важка форма)</span>
            <span class="tooltip-trigger mental">!</span>
            <div class="tooltip-content">
                Важка форма піроманії. Патологічний потяг до підпалів. 
                Ефект у грі: може спалити бункер.
            </div>
        </div>
    </span>
</div>

<!-- Особливість -->
<div class="player-characteristic">
    <span class="characteristic-label">Особливість:</span>
    <span class="characteristic-value">
        <div class="characteristic-with-tooltip">
            <span class="characteristic-name">Вміє переконувати людей</span>
            <span class="tooltip-trigger trait">!</span>
            <div class="tooltip-content">
                Тип: сильна. Легше схиляє на свій бік.
            </div>
        </div>
    </span>
</div>
```

## Weighted Random результати

### Ментальний стан - ймовірності:
| Ступінь | Ймовірність | Приклад результату |
|---------|-------------|-------------------|
| Немає | 50% | "Стабільний" (без tooltip) |
| Легка | 20% | "Депресія (легка форма)" |
| Середня | 15% | "Панічний розлад (середня форма)" |
| Важка | 8% | "Піроманія (важка форма)" |
| Дуже важка | 5% | "Шизофренія (дуже важка форма)" |
| Критична | 2% | "Дисоціативний розлад (критична форма)" |

### Фізичний стан - логіка визначення ступеня:
| Стан | Потрібна ступінь? | Приклад |
|------|-------------------|---------|
| Астма | ✅ Так | "Астма (легка форма)" |
| Діабет | ✅ Так | "Діабет 1 типу (середня форма)" |
| Ампутована рука | ❌ Ні | "Ампутована рука" |
| Сліпота | ❌ Ні | "Сліпота" |
| Артрит | ✅ Так | "Артрит (важка форма)" |
