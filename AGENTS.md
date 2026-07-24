# Bunker Repository Instructions

This file defines operating rules for AI agents working in the Bunker repo.

**Core architecture**: Multiplayer ASP.NET Core with SignalR, Razor, xUnit, and Playwright.

The repo has active partial systems and existing user changes. Extend current architecture safely. Do not replace, duplicate, broadly rewrite, or roll back working functionality unless explicitly requested.

---

## Essential guidance agents frequently miss

**Critical commands and workflows**:
- `dotnet build Bunker.slnx` (preferred solution format)
- `dotnet run` (starts server with console URL)
- `dotnet test --filter "TestName"` (focused unit tests)
- `npm test` (Playwright E2E tests against running server)
- `npm run test:static` (JavaScript contract tests)

**Key architectural boundaries** (agents often overlook these):
- all server-side state mutations before broadcasting derived UI updates (JSON is declarative config only)
- SignalR method matches require client-side event verification
- preserve PascalCase/camelCase tolerance in all serialization interfaces
- room initialization: GameSettings → Player generation → Threat selection

**Repository-specific conventions**:
- `.slnx` is Xamarin/Mono alternative solution format (not standard .sln)
- wwwroot JSON files are read-only declarative config, not game logic
- `appsettings.Development.json` is tracked in Git (real secrets in .NET User Secrets)
- `bunker.db` is the primary SQLite persistence (also has backups)

**Testing system quirks** (agents commonly stumble on these):
- xUnit needs `[assembly: CollectionBehavior(MaxParallelThreads = 1)]` for consistency
- Playwright tests require server already running (E2E vs unit test distinction)
- JavaScript tests use cached node_modules (no re-install after initial setup)

**Dev workflow priorities**:
- always preserve uncommitted user changes during edits
- server restart breaks Playwright test sessions
- localization is critical: new UI text needs UA/RU/EN translations via `t()` function

**Critical verification steps** (often missed):
- after editing SignalR methods/events, verify both client and server callers
- check reconnect/full-state payload compatibility when editing state properties
- run focused verification with `--filter` for .NET tests or specific Playwright projects