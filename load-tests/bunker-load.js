import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const recordSeparator = String.fromCharCode(0x1e);
const targetUrl = (__ENV.TARGET_URL || 'https://localhost:5001').replace(/\/$/, '');
const testMode = (__ENV.TEST_MODE || 'http').toLowerCase();
const hubPath = __ENV.HUB_PATH || '/gameHub';
const maxVus = positiveInt(__ENV.MAX_VUS, 1099);
const rampUp = __ENV.RAMP_UP || '5m';
const hold = __ENV.HOLD || '10m';
const rampDown = __ENV.RAMP_DOWN || '2m';
const thinkTime = positiveNumber(__ENV.THINK_TIME_SECONDS, 1);
const httpTimeout = __ENV.HTTP_TIMEOUT || '30s';
const summaryJson = __ENV.SUMMARY_JSON || 'load-tests/results/summary.json';
const summaryText = __ENV.SUMMARY_TEXT || 'load-tests/results/summary.txt';
const thresholds = {
  http_req_failed: ['rate<0.02'],
  http_req_duration: ['p(95)<1500'],
};

if (!['http', 'signalr-ws'].includes(testMode)) {
  throw new Error('TEST_MODE must be either "http" or "signalr-ws".');
}

if (testMode === 'signalr-ws') {
  thresholds.signalr_handshake_success = ['rate>0.98'];
}

const wsConnections = new Counter('signalr_websocket_connections');
const wsFailures = new Counter('signalr_websocket_failures');
const wsHandshakeSuccess = new Rate('signalr_handshake_success');
const wsSessionDuration = new Trend('signalr_session_duration', true);

export const options = {
  insecureSkipTLSVerify: (__ENV.INSECURE_SKIP_TLS_VERIFY || '').toLowerCase() === 'true',
  scenarios: {
    bunker_load: {
      executor: 'ramping-vus',
      exec: testMode === 'http' ? 'httpBrowseScenario' : 'signalrWebSocketScenario',
      startVUs: 0,
      stages: [
        { duration: rampUp, target: maxVus },
        { duration: hold, target: maxVus },
        { duration: rampDown, target: 0 },
      ],
      gracefulRampDown: __ENV.GRACEFUL_RAMP_DOWN || '30s',
    },
  },
  thresholds,
};

export function httpBrowseScenario() {
  const pages = ['/', '/rules', '/Bunker'];
  for (const path of pages) {
    const response = http.get(`${targetUrl}${path}`, {
      timeout: httpTimeout,
      tags: { workload: 'http', page: path },
    });
    check(response, { [`GET ${path} returns success`]: (res) => res.status >= 200 && res.status < 400 });
  }
  sleep(thinkTime);
}

export function signalrWebSocketScenario() {
  const negotiate = http.post(`${targetUrl}${hubPath}/negotiate?negotiateVersion=1`, null, {
    timeout: httpTimeout,
    headers: { 'X-Requested-With': 'XMLHttpRequest' },
    tags: { workload: 'signalr-negotiate' },
  });

  const negotiated = check(negotiate, {
    'SignalR negotiate succeeds': (res) => res.status === 200,
  });
  if (!negotiated) {
    wsFailures.add(1);
    return;
  }

  const connectionToken = negotiate.json('connectionToken');
  if (!connectionToken) {
    wsFailures.add(1);
    return;
  }

  const webSocketUrl = toWebSocketUrl(`${targetUrl}${hubPath}?id=${encodeURIComponent(connectionToken)}`);
  const startedAt = Date.now();
  const response = ws.connect(webSocketUrl, { tags: { workload: 'signalr-websocket' } }, (socket) => {
    socket.on('open', () => {
      wsConnections.add(1);
      socket.send(`{"protocol":"json","version":1}${recordSeparator}`);
    });

    socket.on('message', (message) => {
      // SignalR acknowledges the JSON handshake with "{}" plus the record separator.
      if (message === `{}${recordSeparator}` || message === recordSeparator || message === '') {
        wsHandshakeSuccess.add(1);
        if ((__ENV.SIGNALR_ACTION || 'get-rooms').toLowerCase() === 'get-rooms') {
          socket.send(`${JSON.stringify({ type: 1, invocationId: `vu-${__VU}-${__ITER}`, target: 'GetRooms', arguments: [] })}${recordSeparator}`);
        }
      }
    });

    socket.on('error', () => {
      wsFailures.add(1);
      wsHandshakeSuccess.add(0);
    });

    socket.setTimeout(() => socket.close(), positiveNumber(__ENV.WS_SESSION_SECONDS, 15) * 1000);
  });

  check(response, { 'SignalR WebSocket upgrades': (res) => res && res.status === 101 });
  wsSessionDuration.add(Date.now() - startedAt);
  sleep(thinkTime);
}

export function handleSummary(data) {
  return {
    [summaryJson]: JSON.stringify(data, null, 2),
    [summaryText]: textSummary(data),
  };
}

function textSummary(data) {
  const metrics = data.metrics;
  return [
    `Bunker k6 load test: ${testMode}`,
    `Target: ${targetUrl}`,
    `Max VUs: ${maxVus}`,
    `HTTP failures: ${metrics.http_req_failed?.values?.rate ?? 'n/a'}`,
    `HTTP p95: ${metrics.http_req_duration?.values?.['p(95)'] ?? 'n/a'} ms`,
    `SignalR connections: ${metrics.signalr_websocket_connections?.values?.count ?? 0}`,
    `SignalR handshake success: ${metrics.signalr_handshake_success?.values?.rate ?? 'n/a'}`,
    '',
  ].join('\n');
}

function toWebSocketUrl(url) {
  return url.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
