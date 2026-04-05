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
- **TASK 2**: Rooms system using SignalR Groups ✅ COMPLETED
- **TASK 3**: Game Master Panel ✅ COMPLETED
- **TASK 4**: Special Cards system
- **TASK 5**: Apocalypse and Bunker systems

---

## TASK 3 - Game Master Panel (Completed)

### Backend Changes (GameHub.cs):
Added new methods for Game Master with host validation:
- `GetAllPlayersData()` - отримати повні дані всіх гравців
- `EditPlayerCharacteristic()` - редагувати характеристику гравця
- `ClearPlayerCharacteristic()` - очистити характеристику
- `RegeneratePlayerCharacteristic()` - регенерувати характеристику
- `ForceRevealCharacteristic()` - примусово розкрити характеристику
- `EliminatePlayer()` - елімінувати гравця
- `RestorePlayer()` - повернути гравця в гру
- Helper methods: `IsCallerHost()`, `IsCharacteristicRevealed()`, `ApplyCharacteristicChange()`, `ClearCharacteristic()`, `CopyCharacteristic()`

### Frontend Changes (Index.cshtml):
1. **GM Panel UI** - плаваюча панель справа з:
   - Випадаючий список вибору гравця
   - Швидкі дії: Елімінувати / Повернути
   - Список всіх характеристик з кнопками:
     - ✏️ Редагувати
     - 🔄 Регенерувати
     - 👁️ Примусово розкрити

2. **Edit Characteristic Modal** - модальне вікно для редагування з:
   - Інформація про гравця та характеристику
   - Поле для нового значення
   - Кнопки: Скасувати, Очистити, Зберегти

3. **SignalR Handlers**:
   - `CharacteristicUpdated` - оновлення характеристики в таблиці
   - `CharacteristicEdited/Cleared/Regenerated` - оновлення для власника
   - `PlayerEliminated/Restored` - оновлення стану гравця
   - `AllPlayersData` - повні дані для GM
   - `GMActionSuccess` - підтвердження дії

4. **JS Functions** для GM:
   - `toggleGMPanel()`, `updateGMPlayerSelect()`, `loadPlayerDataForGM()`
   - `editCharacteristic()`, `submitEditCharacteristic()`, `clearCharacteristic()`
   - `regenerateCharacteristic()`, `forceReveal()`
   - `eliminateSelectedPlayer()`, `restoreSelectedPlayer()`

5. **CSS Styles** - повний набір стилів для GM панелі з фіолетовою темою

### Security:
- Всі GM методи перевіряють `IsCallerHost()` перед виконанням
- Тільки хост бачить кнопку "GM Panel"

---

## TASK 2 - Rooms System (Completed)

### New Files Created:
1. `/Models/Room.cs` - Room model with:
   - Id, Name, Password, MaxPlayers, HostConnectionId
   - RoomState enum (Lobby, Playing, Voting, Finished)
   - Players dictionary
   - CanJoin, CanStart, IsHost methods
   - ToPublicInfo() for safe serialization

2. `/Service/RoomService.cs` - Room management service:
   - CreateRoom, JoinRoom, LeaveRoom
   - StartGame, GetRoom, GetAllRooms
   - Player-to-room mapping
   - Auto host transfer on leave
   - Thread-safe ConcurrentDictionary

### Modified Files:
1. `/Program.cs` - Added RoomService registration
2. `/GameHub.cs` - Complete rewrite with:
   - Room management methods (CreateRoom, JoinRoom, LeaveRoom, StartGame, GetRooms)
   - SignalR Groups for room isolation
   - Game actions in room context
   - Disconnect handling with room cleanup

3. `/Views/Home/Index.cshtml` - New UI:
   - Lobby section with room creation form
   - Room list with join functionality  
   - Room section with player list
   - Game section for active play
   - Join modal for password-protected rooms
   - All SignalR handlers for room events

### Features:
- Create room with name, max players, optional password
- Join room (with password check)
- Leave room (auto host transfer)
- Start game (host only, min 4 players)
- Real-time room list updates
- SignalR Groups for isolated communication
