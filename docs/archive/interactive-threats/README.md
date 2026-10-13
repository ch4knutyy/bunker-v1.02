# Archived interactive threats

This folder preserves the removed operation-based threat system. It formerly supplied
the radiation-leak quiz, air-filter plan choice, volunteer and contribution flows,
operation timers, forced outcomes, scaling, and their SignalR handlers.

`server/` files retain their original repository paths in their file names and use
the `.cs.txt` extension so they cannot be included in the application build.
`client/` holds the formerly loaded classic scripts as text. `content/ThreatMiniGames/`
contains the radiation and air-filter configuration. `tests/` contains tests that
exercised only those retired interaction mechanics.

Active threats are narrative reveal events with title, image, localized description,
and the normal room schedule; they never create an operation or block voting.

- `client/gm-threat-runtime.js.txt`, `client/gm-threat-signalr-events.js.txt`, `views/gm-threat-controls.cshtml.txt`, and `client/gm-threat-interactions.css.txt` preserve the retired GM force-outcome and interactive-operation UI removed during the frontend cleanup.

- 	ests/game-js-signalr-events-modularization.test.js.txt, 	ests/gm-panel-stage3.test.js.txt, and 	ests/scenario-width-polish.spec.js.txt were archived because their assertions and setup require retired interactive threat controls.

- server/ThreatInteractionState.cs.txt, server/ThreatAuditEntry.cs.txt, server/GMThreatStateMutator.cs.txt, and server/ThreatAuditService.cs.txt preserve backend operation state and force-outcome audit code retired during the compatibility cleanup.
