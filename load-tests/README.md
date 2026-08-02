# Bunker k6 load tests

This module tests an already-running Bunker instance. It is deliberately separate from the ASP.NET Core project, so it does not add runtime dependencies to the application and does not run automatically.

## Safety

Run high-load tests only against a disposable local or staging instance. The `signalr-ws` scenario does **not** create rooms, join rooms, or invoke game-changing commands: it negotiates `/gameHub`, establishes a SignalR WebSocket connection, and invokes the read-only `GetRooms` method after the handshake.

At 1099 VUs, run k6 from a machine and network sized for that load. A laptop may become the bottleneck before Bunker does.

## Prerequisite

Install [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) on the load-generator machine. Copy `load-tests/.env.example` to a local environment file or set the listed environment variables in PowerShell. Do not commit credentials or target URLs for private environments.

## Run commands

The following are examples only; this repository does not run them automatically.

HTTP ramp to 1099 virtual users:

```powershell
$env:TARGET_URL = 'https://bunker-staging.example'
$env:TEST_MODE = 'http'
$env:MAX_VUS = '1099'
k6 run load-tests/bunker-load.js
```

SignalR WebSocket ramp to 1099 simultaneous connections:

```powershell
$env:TARGET_URL = 'https://bunker-staging.example'
$env:TEST_MODE = 'signalr-ws'
$env:MAX_VUS = '1099'
k6 run load-tests/bunker-load.js
```

The default ramp is 5 minutes up, 10 minutes at peak, then 2 minutes down. Override `RAMP_UP`, `HOLD`, and `RAMP_DOWN` for another progression. Start with a substantially smaller `MAX_VUS` on a newly provisioned environment.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `TARGET_URL` | `https://localhost:5001` | Base URL of Bunker; no trailing slash. |
| `TEST_MODE` | `http` | `http` for ordinary page requests, or `signalr-ws` for `/gameHub`. |
| `MAX_VUS` | `1099` | Peak simultaneous virtual users/connections. |
| `RAMP_UP`, `HOLD`, `RAMP_DOWN` | `5m`, `10m`, `2m` | Load profile durations. |
| `HUB_PATH` | `/gameHub` | SignalR hub endpoint. |
| `WS_SESSION_SECONDS` | `15` | How long each WebSocket stays connected. |
| `SIGNALR_ACTION` | `get-rooms` | Read-only post-handshake action. Set another value to use connection-only mode. |
| `SUMMARY_JSON`, `SUMMARY_TEXT` | `load-tests/results/...` | Local summary output paths. |
| `TWITCH_STREAM_URL` | empty | Optional reference metadata only; it is not requested by k6. |

## Results

After a run, k6 writes a JSON summary and a compact text summary to `load-tests/results/` by default. To preserve every individual sample as well, add k6's built-in output option:

```powershell
k6 run --out json=load-tests/results/samples.json load-tests/bunker-load.js
```

Generated result files are ignored by Git.

## Twitch stream clarification

`TWITCH_STREAM_URL` may store a link alongside your test configuration, but k6 is a protocol-level load generator, not a browser or media player. It cannot honestly create or count 1,000 Twitch video viewers, and this module intentionally does not send load to Twitch. A 1099-VU Bunker test measures Bunker HTTP requests or SignalR connections; real simultaneous Twitch viewers must come from real viewers on Twitch and are outside Bunker's server-load test.
