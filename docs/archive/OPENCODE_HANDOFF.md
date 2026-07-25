# OpenCode handoff

Read `AGENTS.md` first. Treat the current modularization as the intended architecture; do not merge the runtime files back into `game.js`.

Tasks:

1. Run only:
   - `git diff --check`
   - `node --test Tests/JavaScript.Contracts/game-js-domain-modularization.test.js`
   - `dotnet build Bunker.slnx --no-restore`
   - one focused Playwright test for join/reconnect/basic render
2. Fix only concrete integration errors produced by those commands.
3. For stale source-string tests, update only assertions that still search a moved symbol inside `wwwroot/js/game.js`; resolve its owner through `GAME_JS_FUNCTION_MANIFEST.json`.
4. Do not introduce imports, exports, ES modules, bundlers, dynamic loaders, duplicate state, renamed SignalR events, or broad formatting.
5. Do not commit. Report exact files changed and exact command output.
