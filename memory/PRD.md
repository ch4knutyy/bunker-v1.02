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

### Completed Tasks:
1. **SecretGoal Model** (`/Models/Characteristics/SecretGoal.cs`)
   - Id, Type, Goal, Description, BunkerEffect, IsRevealed
   - Auto-generated Tooltip property
   - HasTooltip computed property

2. **SecretGoalData Model** (`/Models/GameData/SecretGoalData.cs`)
   - Data model for JSON deserialization
   - SecretGoalsRoot wrapper class

3. **JSON Data File** (`/wwwroot/data/secret_goals.json`)
   - 200 unique secret goals in Ukrainian
   - Distribution: 25% dark, 20% meme, 15% normal, 15% adult, 25% mixed

4. **Player Model Update** (`/Models/Player.cs`)
   - Added `SecretGoal SecretGoal { get; set; } = new();`

5. **RevealedCharacteristics Update** (`/Models/RevealedCharacteristics.cs`)
   - Added `bool SecretGoal { get; set; } = false;`

6. **GameDataService Update** (`/Service/GameDataService.cs`)
   - Added loading of secret_goals.json
   - Added `SecretGoals` property

7. **CharacterGeneratorService Update** (`/Service/CharacterGeneratorService.cs`)
   - Added `GenerateSecretGoal()` method
   - Random selection from loaded goals

8. **GameHub SignalR Update** (`/GameHub.cs`)
   - Added SecretGoal to reveal logic
   - Added SecretGoal to GetRevealedData method

9. **UI Update** (`/Views/Shared/_PlayerCard.cshtml`)
   - Added SecretGoal display at the bottom of player card
   - Tooltip with same styling as other characteristics

10. **CSS Update** (`/wwwroot/css/tooltip.css`)
    - Added `.tooltip-trigger.secret-goal` styling (pink gradient)
    - Added `.tooltip-trigger.phobia` styling

11. **TooltipHelper Update** (`/Helpers/TooltipHelper.cs`)
    - Added `FromSecretGoal()` method

## Files Changed:
- `/app/bunker-project/bunker-project/Models/Characteristics/SecretGoal.cs` (NEW)
- `/app/bunker-project/bunker-project/Models/GameData/SecretGoalData.cs` (NEW)
- `/app/bunker-project/bunker-project/wwwroot/data/secret_goals.json` (NEW)
- `/app/bunker-project/bunker-project/Models/Player.cs` (MODIFIED)
- `/app/bunker-project/bunker-project/Models/RevealedCharacteristics.cs` (MODIFIED)
- `/app/bunker-project/bunker-project/Service/GameDataService.cs` (MODIFIED)
- `/app/bunker-project/bunker-project/Service/CharacterGeneratorService.cs` (MODIFIED)
- `/app/bunker-project/bunker-project/GameHub.cs` (MODIFIED)
- `/app/bunker-project/bunker-project/Views/Shared/_PlayerCard.cshtml` (MODIFIED)
- `/app/bunker-project/bunker-project/wwwroot/css/tooltip.css` (MODIFIED)
- `/app/bunker-project/bunker-project/Helpers/TooltipHelper.cs` (MODIFIED)

## Backlog / Future Features:
- P0: None
- P1: Add reveal animation for SecretGoal
- P2: Add filtering by goal type (dark/meme/normal/adult/mixed)
- P2: Add statistics for most common goals
