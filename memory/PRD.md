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
- **TASK 4**: Special Cards system ✅ COMPLETED
- **TASK 5**: Apocalypse and Bunker systems ✅ COMPLETED

---

## BUG FIX — Room Password Bug (2026-02-XX) ✅

**Проблема:** При створенні кімнати з паролем, хост не міг приєднатися до власної кімнати через те, що `JoinRoom` викликався без передачі пароля. На фронті модалка join закривалась до відповіді сервера.

**Фікс (GameHub.cs):**
- Передаємо `password` параметр у `_roomService.JoinRoom()` при створенні кімнати хостом

**Фікс (Index.cshtml):**
- `submitJoinRoom()` більше не закриває модалку одразу
- Модалка закривається тільки в `RoomJoined` SignalR handler після успішного приєднання
- При помилці (невірний пароль) модалка залишається відкритою, гравець бачить alert

---

## CRITICAL BUG FIX — Create Room Page Reload (2026-02-XX) ✅

**Проблема:** Кнопка "Створити кімнату" перезавантажувала сторінку замість виклику JS.
- `<form onsubmit="createRoom(); return false;">` + `<button type="submit">` — якщо `createRoom()` кидав виключення (SignalR ще не підключений), `return false` не виконувався
- Те саме для всіх модальних вікон (Join, Edit Characteristic, Use Card)

**Фікс (Index.cshtml):**
- Замінено всі `<form onsubmit>` на `<div>` + `<button type="button" onclick="...">`
- Видалено всі `type="submit"` кнопки та `required` атрибути (валідація тепер в JS)
- `createRoom()` тепер перевіряє `connection.state === signalR.HubConnectionState.Connected`
- Обгорнуто `connection.invoke()` у `try/catch` + `.catch()` з `alert()` для помилок
- Аналогічно виправлено: Join Modal, Edit Characteristic Modal, Use Card Modal

---

## BUG FIX — Mobile Tooltips (2026-02-XX) ✅

**Проблема:** Тултіпи характеристик працювали тільки через CSS `:hover`, що не підтримується на touch-пристроях.

**Фікс (Index.cshtml):**
- Додано JS click-listener на `document` для toggle класу `.active` на `.tooltip-trigger`
- Клік на тултіп-тригер відкриває/закриває тултіп; клік поза ним — закриває всі
- Додано CSS селектори: `.tooltip-trigger.active + .tooltip-content` та `.characteristic-with-tooltip .tooltip-trigger.active ~ .tooltip-content`

---

## Upcoming Tasks (Prioritized):
- **P2**: Per-Player Characteristic Generation History
- **P2**: Profile Filters (dark, meme, etc.)

---

## RANDOMIZE SEAT NUMBERS (2026-02-XX) ✅

### Backend:
- `Player.SeatNumber` — нове поле (int, default 0)
- `StartGame()` — Fisher-Yates shuffle для рандомізації місць 1..N серед усіх гравців
- `GameStarted` SignalR event тепер включає `seatNumber` для кожного гравця

### Frontend:
- `GameStarted` handler зберігає `seatNumber` в `roomPlayers`
- `updatePlayersTable()` сортує гравців за `seatNumber` та показує `#N` замість порядку вступу
- `renderRoomPlayers()` також сортує за `seatNumber` (якщо призначено)

---

## DYNAMIC BUNKER SLOTS + REGENERATION (2026-02-XX) ✅

### Backend (GameHub.cs):
- `UpdateBunkerCapacity(newCapacity)` — хост змінює кількість слотів (Clamp 1..PlayerCount)
- `RegenerateBunker()` — хост генерує новий бункер з JSON
- `RegenerateApocalypse()` — хост генерує новий апокаліпсис з JSON
- SignalR events: `BunkerCapacityUpdated`, `BunkerChanged`, `ApocalypseChanged`

### Frontend (Index.cshtml):
- GM Panel секція "Сценарій гри" з кнопками +/- для слотів та "Новий бункер"/"Новий апокаліпсис"
- Секція показується тільки при `isHost && gameStarted`

---

## HOST EVENTS SYSTEM (2026-02-XX) ✅

### Backend (GameHub.cs):
- `SendGameEvent(text, type)` — хост відправляє подію з типом (info/warning/danger/success/catastrophe)
- SignalR event: `GameEvent` з timestamp

### Frontend (Index.cshtml):
- GM Panel секція "Ігрові події" з textarea + select типу + кнопка "Відправити"
- Швидкі кнопки подій: Землетрус, Запаси, Зараження, Виживальці, Генератор
- Кольорові CSS стилі для кожного типу події в логу

---

## ADVANCED VOTING (2026-02-XX) ✅

### Backend Changes:
- `Player.IsProtectedFromVote` — поле для захисту від голосування
- `Player.ExtraVotes` — додаткові голоси від спеціальних карт
- `ExecuteCard` оновлено: ProtectFromVote/ExtraVote реально встановлюють поля
- `Vote()` перевіряє захист кандидата перед голосуванням
- `EndVotingInternal()` додає фантомні голоси від ExtraVotes
- `ResolveVoting()` скидає одноразові ефекти (Protection, ExtraVotes) після голосування
- `VotingStarted` передає isProtected/extraVotes для кожного кандидата

### Frontend Changes:
- Захищені кандидати показуються з 🛡️ бейджем та кнопка "Захищений" замість "Голосувати"
- ExtraVotes показуються з +N🗳️ бейджем
- CSS для .protected-candidate, .badge-protected, .badge-extra-votes

---

## SESSION RESTORE — Passwordless Profile + Reconnect (2026-02-XX) ✅

### Backend Changes:

**RoomService.cs** — новий метод `RejoinRoom`:
- Шукає гравця за ім'ям у кімнаті
- Переносить Player з oldConnectionId на newConnectionId
- Оновлює host якщо потрібно
- Повертає повний стан гравця та кімнати

**GameHub.cs** — новий метод `RejoinRoom(roomId, playerName)`:
- Викликає `_roomService.RejoinRoom()`
- Додає до SignalR Group
- Надсилає `RejoinSuccess` з повним станом гри (room, player, apocalypse, bunker, players)
- Надсилає `PlayerReconnected` іншим гравцям
- При помилці — `RejoinFailed`

**GameHub.cs** — оновлено `OnDisconnectedAsync`:
- 5-секундна затримка перед видаленням гравця (grace period)
- Дозволяє page refresh без втрати сесії

### Frontend Changes (Index.cshtml):

1. **localStorage** — збереження `bunker_lastPlayerName` для автозаповнення
2. **sessionStorage** — збереження `bunker_roomId` + `bunker_playerName` для reconnect
3. **saveSession/clearSession/loadSession** — утиліти для роботи з сесією
4. **tryRejoin()** — при підключенні до SignalR спроба перепідключитися
5. **prefillPlayerName()** — автозаповнення імені з localStorage
6. **RejoinSuccess handler** — повне відновлення стану UI включно з ігровою секцією
7. **RejoinFailed handler** — тиха очистка сесії, показ лобі
8. **PlayerReconnected handler** — оновлення connectionId гравця в roomPlayers

---

## EYE ICON — Peek Characteristic for Host (2026-02-XX) ✅

### Backend Changes (GameHub.cs):
- Новий метод `PeekCharacteristic(targetConnectionId, characteristicName)`
- Надсилає дані ТІЛЬКИ хосту через `Clients.Caller`
- НЕ змінює `Revealed` стан характеристики
- Серверна валідація `IsCallerHost()`

### Frontend Changes (Index.cshtml):
1. **GM Panel** — додано кнопку &#128065; (Підглянути) до кожної характеристики
   - Замінено старе 👁️ (Розкрити) на 📢 (Розкрити для всіх) для кращого розрізнення
2. **peekCharacteristic(charName)** — виклик Hub методу
3. **CharacteristicPeeked handler** — відкриває модалку з даними
4. **Peek Modal** — показує значення, тултіп, статус (прихована/розкрита)
5. **CSS** — стилі для .btn-peek, .modal-peek, .peek-info, .peek-status

---

## TASK 5 - Apocalypse and Bunker Systems (Completed)

### New Files Created:
1. `/Models/ApocalypseAndBunker.cs`:
   - `Apocalypse` model (name, description, severity, survivalChance, duration, threats, requirements)
   - `BunkerInfo` model (name, description, capacity, location, suppliesMonths, facilities, resources, problems, condition)
   - Root classes for JSON deserialization

2. `/wwwroot/data/apocalypses.json`:
   - 12 unique apocalypse scenarios
   - Various severity levels (low/medium/high/extreme)
   - Including: nuclear war, zombie outbreak, asteroid, pandemic, AI uprising, climate collapse, alien invasion, supervolcano, economic collapse, solar flare, biological weapon, magnetic reversal

3. `/wwwroot/data/bunkers.json`:
   - 10 unique bunker types
   - Various conditions (poor/fair/good/excellent)
   - Including: military bunker, luxury bunker, metro station, farm shelter, hospital, school shelter, research complex, church catacombs, submarine base, mining shaft

### Backend Changes:
- `GameDataService.cs` - added loading of apocalypses.json and bunkers.json
- `Room.cs` - added Apocalypse and BunkerInfo properties
- `GameHub.cs` - added random apocalypse/bunker selection on StartGame

### Frontend Changes (Index.cshtml):
1. **Game Info Panels** - two-column layout for apocalypse and bunker
2. **Apocalypse Panel**:
   - Name, description
   - Stats: severity, survival chance, duration
   - Lists: threats, requirements
   - Color-coded severity
3. **Bunker Panel**:
   - Name, description
   - Stats: capacity, condition, supplies, location
   - Lists: facilities, resources, problems
   - Color-coded condition
4. **CSS Styles** - full styling with gradients and responsive design

### All Tasks Completed:
1. SecretGoal fix ✅
2. Rooms system ✅
3. Game Master Panel ✅
4. Special Cards ✅
5. Apocalypse & Bunker ✅
6. Voting System ✅

---

## TASK 6 - Voting System (Completed)

### New Files Created:
1. `/Models/VotingSession.cs`:
   - `VotingState` enum (Active, Completed, Resolved)
   - `VotingSession` model with votes tracking
   - Methods: AddVote, HasVoted, VoteCounts, TopVotedPlayerId, IsTie

### Backend Changes (GameHub.cs):
- `StartVoting()` - хост починає голосування
- `Vote(targetConnectionId)` - гравець голосує
- `EndVoting()` - хост завершує достроково
- `ResolveVoting(eliminateConnectionId)` - хост приймає рішення (елімінувати чи ні)
- `CancelVoting()` - хост скасовує голосування

### Frontend Changes (Index.cshtml):
1. **Voting Panel**:
   - Список кандидатів з кнопками голосування
   - Прогрес голосування (X/Y проголосували)
   - Статус "Ви проголосували за..."
   - Кнопки хоста: завершити/скасувати

2. **Voting Results Panel** (для хоста):
   - Результати з кількістю голосів
   - Деталі хто за кого голосував
   - Попередження про нічию
   - Кнопки: "Елімінувати лідера" / "Нікого не елімінувати"

3. **SignalR Handlers**:
   - VotingStarted, VoteCast, VotingProgress
   - VotingEnded, VotingResolved, VotingCancelled

4. **CSS Styles** - повне оформлення з синьою/оранжевою темою

### Key Feature:
- Автоматичної елімінації немає
- Хост бачить результати і сам вирішує кого елімінувати (або нікого)

---

## TASK 4 - Special Cards System (Completed)

### New Files Created:
1. `/Models/SpecialCard.cs`:
   - `CardState` enum (Available, Pending, Approved, Used, Rejected)
   - `CardEffectType` enum (RevealOther, HideOwn, SwapCharacteristic, etc.)
   - `SpecialCard` model with all properties
   - `CardTemplate` model for JSON templates
   - `CardsRoot` for deserialization

2. `/Service/CardService.cs`:
   - Load card templates from JSON
   - `GenerateCardsForPlayer()` - weighted random selection by rarity
   - `CreateCardFromTemplateId()` for GM
   - `GetAllTemplates()` for GM panel

3. `/wwwroot/data/special_cards.json`:
   - 20 unique special cards
   - Rarities: common, rare, epic, legendary
   - Various effect types

### Backend Changes (GameHub.cs):
- Added `CardService` dependency
- Cards generated when player joins/creates room
- New methods:
  - `UseCard()` - request card usage
  - `ApproveCard()` - host approves
  - `RejectCard()` - host rejects
  - `GiveCard()` - host gives card to player
  - `GetCardTemplates()` - get all templates
  - `ExecuteCard()` - execute card effects

### Frontend Changes (Index.cshtml):
1. **Cards Section** - "🃏 Мої спеціальні карти" under characteristics
2. **Use Card Modal** - select target player/characteristic
3. **Card Approval Modal** - for host to approve/reject
4. **SignalR Handlers**:
   - CardPending, CardApprovalRequest
   - CardUsed, CardRejected, CardReceived
   - CardActivated, SecretViewed, CharacteristicSwapped
5. **CSS Styles** - full card styling with rarity colors

### Card Features:
- Rarity system (common/rare/epic/legendary) with weighted selection
- Approval system for powerful cards
- Various effects: reveal, swap, regenerate, protect, etc.
- Visual feedback for card states

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
