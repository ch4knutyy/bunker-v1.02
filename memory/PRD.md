# Bunker Online - Product Requirements Document

## Original Problem Statement
Гравець повідомив про проблеми:
1. Кнопка "Створити кімнату" перезавантажує сторінку
2. Tooltip не працює на мобільних телефонах
3. Розкриті характеристики показують "Розкрито" замість реальних значень
4. Спеціальні карти не показуються

## Architecture
- **Backend**: ASP.NET Core with SignalR
- **Frontend**: Razor Views with vanilla JavaScript
- **Real-time**: SignalR Hub (`/gameHub`)
- **Data**: JSON files in `/wwwroot/data/`

## What's Been Implemented

### Session 1: Bug Fixes & Features

#### 1. Fixed Room Creation Button
- Event listener via `DOMContentLoaded`
- Connection status UI
- Better error handling

#### 2. Fixed Mobile Tooltip (Complete Rewrite)
- Mobile overlay system (`showMobileTooltipOverlay()`)
- Touch event handling
- Modal-like display with backdrop
- "Закрити" button

#### 3. Fixed Special Cards Display
- Added `renderMyCards()` calls to handlers
- Support for both PascalCase/camelCase
- Added full CSS for cards

#### 4. Added Activated Special Cards Table
- New HTML section with table
- JavaScript functions: `updateActivatedCardsTable()`, `addActivatedCard()`
- SignalR integration via `CardActivated` handler
- Updated GameHub to send `connectionId` and `cardRarity`

#### 5. Enhanced Events System
- New current event panel with effect preview
- Host controls: "Застосувати ефект" / "Закрити подію"
- Events history with timestamps
- New SignalR handlers: `NewGameEvent`, `EventEffectApplied`
- New GameHub methods: `ApplyEventEffect()`, `TriggerNewEvent()`

#### 6. Added Voting CSS
- Full voting section styles
- Candidate cards
- Results visualization

## Files Changed
- `/Views/Home/Index.cshtml` - HTML + JavaScript
- `/wwwroot/css/site.css` - CSS for cards, events, voting
- `/wwwroot/css/tooltip.css` - Mobile tooltip overlay
- `/GameHub.cs` - New methods for events

## Remaining Tasks

### P1 (High)
- [ ] GM role restrictions (can't see hidden characteristics)
- [ ] Test all features

### P2 (Medium)
- [ ] Better error messages
- [ ] Loading states

### P3 (Low)
- [ ] UI polish
- [ ] Animation improvements
