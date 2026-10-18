# Bunker / Vault Judgment

**A real-time multiplayer social survival game built with ASP.NET Core, SignalR, and Razor.**

Bunker / Vault Judgment is a browser-based social deduction and survival game inspired by the tabletop game *Bunker*.

Players receive randomly generated characters with unique backgrounds, professions, health conditions, personality traits, and hidden information. As the apocalypse unfolds, they reveal their characteristics, debate their value to the group, face unexpected threats, and vote to decide who deserves a place in the bunker.

The game combines strategic decision-making, social interaction, procedural character generation, and real-time multiplayer mechanics.

---

## Key Features

### Real-Time Multiplayer

- Create and join private game rooms.
- Play as a host, player, or spectator.
- Real-time synchronization using SignalR.
- Automatic reconnection after refreshes or temporary disconnections.
- Host transfer and player management.
- Ready-state system and synchronized game start.
- Password-protected rooms and configurable joining restrictions.
- Randomized player seat assignments.

### Customizable Game Sessions

Configure the game before starting with a flexible lobby settings system.

**Available game presets:**
- Classic
- Calm
- Dangerous
- Hardcore
- Quick
- Long
- Custom

**Configuration options include:**
- Minimum and maximum player count.
- Automatic, manual, or randomized bunker capacity.
- Round timers and voting rules.
- Special cards and starting inventory.
- Interactive threat frequency and difficulty.
- Apocalypse and bunker scenario settings.
- Spectator permissions and room access restrictions.
- Local presets and JSON import/export.

Settings are validated and synchronized across participants. Once a session begins, its configuration is locked to maintain a consistent game state.

### Procedural Character Generation

Every player receives a character assembled from multiple attributes:

- Age, gender, and physical characteristics.
- Profession and professional background.
- Physical and mental health.
- Hobbies and personality traits.
- Phobias and personal facts.
- Inventory and special cards.
- Secret objectives.
- Additional physical conditions.

These attributes influence discussions, strategies, and survival decisions.

### Gameplay and Voting

- Round-based gameplay.
- Progressive character attribute reveals.
- Public and private player information.
- Server-controlled timers.
- Voting and elimination mechanics.
- Bunker capacity management.
- Special cards and bonus inventory.
- Game-state snapshots and undo functionality.
- Session-specific history and audit records.
- Advanced host and game-master controls.

### Dynamic Threat System

During a session, players may encounter events that affect their chances of survival.

The system supports both narrative and interactive threats.

**Implemented interactive scenarios:**
- `radiation_leak` — radiation leak.
- `air_filter_failure` — air filtration system failure.

The threat engine includes configurable scheduling, repeated-event prevention, persistent state, success/failure/timeout handling, and protection against duplicate effects.

Threat progress is preserved during reconnects and snapshot recovery.

### Apocalypse and Bunker Scenarios

Game sessions incorporate multiple types of scenario content:

- Apocalypse descriptions.
- Bunker characteristics.
- Environmental threats.
- Localized text.
- Scenario images with fallback support.

Scenario data uses stable identifiers to ensure consistent references throughout the application.

### Localization

The interface and game content support three languages:

- Ukrainian (UA)
- Russian (RU)
- English (EN)

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Backend | C#, .NET, ASP.NET Core |
| Real-time communication | SignalR |
| Frontend | Razor Views, JavaScript, CSS |
| Game content | JSON |
| Unit testing | xUnit |
| Browser and E2E testing | Playwright |

### Architecture Highlights

The application uses a server-controlled multiplayer model to maintain consistent game state across connected clients.

Key technical features include:

- Room-level game-state management.
- Server-authoritative gameplay operations.
- Reconnection and state synchronization.
- Versioned lobby settings with revision conflict protection.
- Atomic settings updates.
- Persistent state within active game sessions.
- Snapshot-based recovery and undo.
- Idempotent threat resolution to prevent duplicate effects.
- Privacy boundaries between revealed and unrevealed character information.
- Automated validation of gameplay mechanics.

---

## Getting Started

### Prerequisites

Install the following tools:

- .NET SDK compatible with the project.
- Node.js.
- npm.

### 1. Clone the Repository

```bash
git clone https://github.com/ch4knutyy/bunker-v1.02.git
cd bunker-v1.02
```

### 2. Restore Dependencies

```bash
dotnet restore
```

### 3. Build the Application

```bash
dotnet build
```

Alternatively, build the solution directly:

```bash
dotnet build Bunker.slnx
```

### 4. Run the Application

```bash
dotnet run
```

Open the local address displayed in the ASP.NET Core console.

---

## Testing

The project includes automated tests covering game logic, multiplayer interactions, and browser workflows.

### Unit Tests — xUnit

Run the .NET test suite:

```bash
dotnet test
```

Test coverage includes:

- Lobby configuration and validation.
- Game initialization.
- Voting and elimination.
- Bunker capacity calculations.
- Randomized seating.
- Snapshot creation and restoration.
- Threat selection and lifecycle.
- Reconnection-related services.
- Privacy and information visibility.

### End-to-End Tests — Playwright

Install frontend dependencies:

```bash
npm install
```

Install Playwright browsers:

```bash
npx playwright install
```

Run the test suite:

```bash
npm test
```

Additional test commands, when available in `package.json`:

```bash
npm run test:ui
npm run test:headed
npm run test:report
```

Browser tests cover room creation, joining, lobby interactions, host transfer, reconnection, character reveals, voting, interactive threats, and responsive layouts.

Tests also verify that hidden character information is not exposed through the DOM before being revealed.

---

## Development Status

**Status: Active Development**

The core multiplayer gameplay systems are implemented, including:

- Multiplayer room management.
- Session configuration.
- Character generation and reveals.
- Voting and elimination.
- Server-side timers.
- Interactive threats.
- Reconnection support.
- Snapshots and recovery.
- Responsive interface.
- Multilingual support.
- Targeted automated tests.

The project is currently focused on UI improvements, gameplay expansion, and regression testing.

### Upcoming Improvements

| Priority | Feature |
|---|---|
| 1 | Lobby visual improvements |
| 2 | Scenario image persistence audit |
| 3 | UI bug fixes |
| 4 | Footer and legal pages |
| 5 | Game-master panel simplification |
| 6 | Full regression testing |
| 7 | Multiplayer testing through ngrok |
| 8 | Profession-specific abilities |
| 9 | Improved pseudorandom character generation |
| 10 | Expanded physical and mental health systems |

---

## Project Roadmap

For detailed development plans and technical tasks, see:

- [Development Roadmap](ROADMAP.md)
- [Development Backlog](docs/backlog.csv)

---

## Author

**Dima — [ch4knutyy](https://github.com/ch4knutyy)**

Developed using C#, ASP.NET Core, SignalR, and modern web technologies.

[View Repository](https://github.com/ch4knutyy/bunker-v1.02)
