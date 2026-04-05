# Bunker Game - PRD (Product Requirements Document)

## Problem Statement
Додати нову фінальну характеристику "Таємна ціль" (SecretGoal) у існуючий multiplayer-проєкт Bunker.

## Tech Stack
- ASP.NET Core
- SignalR
- Razor Views
- C#
- JSON data files

## Implementation Summary

### Date: 2026-01-05

### TASK 1 - SecretGoal Fix (Completed):

**Проблема:** SecretGoal не відображалась в UI

**Виправлення в Index.cshtml:**
1. Додано колонку "Таємна ціль" в заголовок таблиці гравців
2. Оновлено colspan з 12 до 14 для порожньої таблиці
3. Додано рендер SecretGoal в `updatePlayersTable()` 
4. Додано картку "Таємна ціль" в `renderMyPlayerCards()`
5. Додано функцію `getSecretGoalTypeLabel()` для відображення типу цілі
6. Додано CSS стилі для `.tooltip-trigger.secret-goal`

### Files Changed (Task 1):
- `/app/bunker-project/bunker-project/Views/Home/Index.cshtml` - UI виправлення

### Previously Implemented (SecretGoal Feature):
1. **SecretGoal Model** (`/Models/Characteristics/SecretGoal.cs`)
2. **SecretGoalData Model** (`/Models/GameData/SecretGoalData.cs`)
3. **JSON Data File** (`/wwwroot/data/secret_goals.json`) - 200 цілей
4. **Player Model** - додано SecretGoal property
5. **RevealedCharacteristics** - додано SecretGoal boolean
6. **GameDataService** - завантаження secret_goals.json
7. **CharacterGeneratorService** - генерація SecretGoal
8. **GameHub SignalR** - reveal SecretGoal
9. **_PlayerCard.cshtml** - Razor partial view
10. **tooltip.css** - стилі для secret-goal

## Backlog / Future Tasks:
- **TASK 2**: Rooms system using SignalR Groups
- **TASK 3**: Game Master Panel
- **TASK 4**: Special Cards system
- **TASK 5**: Apocalypse and Bunker systems
