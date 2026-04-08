# Bunker Online - Product Requirements Document

## Original Problem Statement
Основні баги:
1. Після F5 гравець отримує новий connectionId, втрачає місце
2. Розкриті характеристики показують "Розкрито" замість реальних значень
3. Спеціальні карти не відображаються

## What's Been Implemented

### Session 2: Reconnect & Revealed Data Fixes

#### 1. Stable Player ID (Client)
- Added `getOrCreatePlayerId()` - generates UUID stored in localStorage
- `stablePlayerId` passed to CreateRoom, JoinRoom, RejoinRoom
- Survives browser refresh

#### 2. Player Model Update (Server)
- Added `StablePlayerId` property to Player.cs
- RoomService.RejoinRoom searches by StablePlayerId first, then by name
- SeatNumber explicitly preserved during reconnect

#### 3. RevealedCharacteristics Model Update
- Added `RevealedValues` dictionary to store actual values
- Added `RevealedData` class with Value, Tooltip, HasTooltip, Label
- SetCharacteristicRevealed() now saves values to dictionary

#### 4. GameHub Updates
- CreateRoom, JoinRoom accept stablePlayerId parameter
- JoinRoom checks for existing player with same stablePlayerId (auto-reconnect)
- RejoinRoom accepts stablePlayerId
- RejoinSuccess sends revealedValues with actual data

#### 5. Client RejoinSuccess Handler
- Processes revealedValues from server
- Converts to revealedData/revealedTooltips for renderTableCell
- Maintains seatNumber after reconnect

## Files Changed
- `/Models/Player.cs` - Added StablePlayerId
- `/Models/RevealedCharacteristics.cs` - Added RevealedValues dictionary
- `/Service/RoomService.cs` - Updated RejoinRoom for stablePlayerId
- `/GameHub.cs` - Updated CreateRoom, JoinRoom, RejoinRoom, SetCharacteristicRevealed
- `/Views/Home/Index.cshtml` - getOrCreatePlayerId, RejoinSuccess handler

## Testing Instructions
1. Create room, note your seat number
2. Start game, reveal some characteristics
3. Press F5 (refresh page)
4. Should:
   - Keep same seat number
   - Show actual revealed values (not "Розкрито")
   - Show special cards

## Remaining Tasks
- Test all reconnect scenarios
- Test special cards activation flow
