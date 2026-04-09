# Bunker Online - PRD

## Issues Fixed

### 1. SPECIAL CARDS NOT VISIBLE
- Added debug logging to CardService.LoadCardTemplates()
- Added debug logging to GenerateCardsForPlayer()  
- Added console.log for cards in RoomCreated/RoomJoined handlers
- renderMyCards() already supports both camelCase and PascalCase

### 2. RECONNECT BROKEN (CRITICAL)
**Changes:**
- OnDisconnectedAsync: timeout 5s → 60s
- Stores stablePlayerId before disconnect
- Checks reconnect by stablePlayerId (not connectionId)
- Sends PlayerDisconnecting event with timeout info
- PlayerLeftRoom includes reason='timeout' and playerName
- Frontend shows "втратив з'єднання (очікування 60с)..."

### 3. JoinRoom Auto-Reconnect
- If player with same stablePlayerId exists → calls RejoinRoom
- Does NOT regenerate cards/character on reconnect
- Fixed variable shadowing (room → joinedRoom)

## Files Changed
- `/Service/CardService.cs` - debug logging
- `/GameHub.cs` - 60s timeout, stablePlayerId check, auto-reconnect
- `/Views/Home/Index.cshtml` - PlayerDisconnecting handler, debug logs

## Testing
1. Create room → check console for cards count
2. Refresh page (F5) → should reconnect within 60s
3. Close tab, reopen → should reconnect with same player
