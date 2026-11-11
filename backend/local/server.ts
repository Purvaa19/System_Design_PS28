import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.PORT || 3001);

interface FlagRecord {
  flagId: string;
  name: string;
  description: string;
  value: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string;
}

// In-Memory Durable Store for Local Backend
let flagState: FlagRecord = {
  flagId: 'new_checkout',
  name: 'new_checkout',
  description: 'Switches mobile checkout between standard form and 1-Click Express Checkout.',
  value: false,
  version: 1,
  updatedAt: new Date().toISOString(),
  updatedBy: 'admin@systemdesign.lab',
};

// Control plane fault simulation state
let isConfigServiceFailed = false;
let isStorageFailed = false;
let isPubSubFailed = false;
let isSseFailed = false;

// Rate limiting & capacity enforcement
let serverCapacityPerSec = 500;
let requestCountWindow = 0;
let windowStartTime = Date.now();

// Telemetry & metrics tracking
const latencyHistory: number[] = [];
let totalRequests = 0;
let successfulRequests = 0;
let rejectedRequests = 0;

const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;
  totalRequests++;

  // Enforce sliding window capacity / rate limit
  const now = Date.now();
  if (now - windowStartTime >= 1000) {
    requestCountWindow = 0;
    windowStartTime = now;
  }
  requestCountWindow++;

  if (requestCountWindow > serverCapacityPerSec) {
    rejectedRequests++;
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: 'Too Many Requests',
      message: `Local server capacity exceeded (${serverCapacityPerSec} req/s). Request throttled.`,
      capacity: serverCapacityPerSec,
      currentLoad: requestCountWindow,
    }));
    return;
  }

  // 1. Health check
  if (pathname === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'healthy',
      uptimeSec: process.uptime(),
      connectedClients: wss.clients.size,
      flagVersion: flagState.version,
      serverTime: new Date().toISOString(),
      mode: 'local_instrumented_backend',
    }));
    return;
  }

  // 2. Metrics endpoint
  if (pathname === '/api/metrics' && req.method === 'GET') {
    const latenciesSorted = [...latencyHistory].sort((a, b) => a - b);
    const avgLatency = latenciesSorted.length > 0
      ? Math.round((latenciesSorted.reduce((a, b) => a + b, 0) / latenciesSorted.length) * 10) / 10
      : 0;
    const p95Latency = latenciesSorted.length > 0
      ? Math.round(latenciesSorted[Math.floor(latenciesSorted.length * 0.95)] * 10) / 10
      : 0;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      totalRequests,
      successfulRequests,
      rejectedRequests,
      activeWebSocketConnections: wss.clients.size,
      avgLatencyMs: avgLatency,
      p95LatencyMs: p95Latency,
      capacityPerSec: serverCapacityPerSec,
      faults: {
        configService: isConfigServiceFailed,
        storage: isStorageFailed,
        pubsub: isPubSubFailed,
        sse: isSseFailed,
      },
    }));
    return;
  }

  // 3. Get Flag state
  if (pathname === '/api/flags/new_checkout' && req.method === 'GET') {
    if (isConfigServiceFailed) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Configuration Service Unavailable (Fault Injected)' }));
      return;
    }
    successfulRequests++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(flagState));
    return;
  }

  // 4. Toggle / Mutate Feature Flag
  if (pathname === '/api/flags/new_checkout/toggle' && req.method === 'POST') {
    const t0 = performance.now();

    // Check fault injection
    if (isConfigServiceFailed) {
      rejectedRequests++;
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Configuration Service Failure',
        step: 'config_service',
        message: 'HTTP 503: Config Service failed. Flag update rejected.',
      }));
      return;
    }

    if (isStorageFailed) {
      rejectedRequests++;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'Cloud Storage Write Failure',
        step: 'cloud_storage',
        message: 'Database connection offline. Mutation aborted.',
      }));
      return;
    }

    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });

    req.on('end', () => {
      try {
        let requestedValue: boolean | undefined;
        if (body.trim().length > 0) {
          const parsed = JSON.parse(body);
          if (typeof parsed.desiredValue === 'boolean') {
            requestedValue = parsed.desiredValue;
          }
        }

        const newValue = requestedValue !== undefined ? requestedValue : !flagState.value;
        const newVersion = flagState.version + 1;
        const updatedAt = new Date().toISOString();

        // Persist to local durable store
        flagState = {
          ...flagState,
          value: newValue,
          version: newVersion,
          updatedAt,
        };

        // Pub/Sub check
        if (isPubSubFailed) {
          rejectedRequests++;
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: true,
            warning: 'Pub/Sub Broker down! Event persisted in storage but could not broadcast.',
            flagState,
            propagationStatus: 'blocked_pubsub',
          }));
          return;
        }

        // Broadcast to all active WebSocket clients (SSE/WS push simulation)
        let broadcastCount = 0;
        if (!isSseFailed) {
          const payload = JSON.stringify({
            type: 'FLAG_DELTA_PUSH',
            flagId: flagState.flagId,
            value: newValue,
            version: newVersion,
            updatedAt,
            source: 'LOCAL_BACKEND_BROADCAST',
            serverTimestamp: Date.now(),
          });

          wss.clients.forEach((client) => {
            if (client.readyState === WebSocket.OPEN) {
              client.send(payload);
              broadcastCount++;
            }
          });
        }

        const t1 = performance.now();
        const durationMs = Math.round((t1 - t0) * 10) / 10;
        latencyHistory.push(durationMs);
        if (latencyHistory.length > 50) latencyHistory.shift();

        successfulRequests++;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          flagState,
          broadcastCount,
          processingDurationMs: durationMs,
          propagationStatus: isSseFailed ? 'blocked_sse' : 'synchronized',
        }));
      } catch (err: any) {
        rejectedRequests++;
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload', details: err?.message }));
      }
    });
    return;
  }

  // 5. Fault Injection Control
  if (pathname === '/api/control/fault' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        const { componentId, isFailed } = JSON.parse(body);
        if (componentId === 'config_service') isConfigServiceFailed = Boolean(isFailed);
        if (componentId === 'cloud_storage') isStorageFailed = Boolean(isFailed);
        if (componentId === 'pubsub_broker') isPubSubFailed = Boolean(isFailed);
        if (componentId === 'sse_server') isSseFailed = Boolean(isFailed);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          componentId,
          isFailed,
          activeFaults: {
            configService: isConfigServiceFailed,
            storage: isStorageFailed,
            pubsub: isPubSubFailed,
            sse: isSseFailed,
          },
        }));
      } catch (e: any) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e?.message }));
      }
    });
    return;
  }

  // 404 Not Found
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint not found' }));
});

// Setup WebSocket Server on top of HTTP server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log(`[WS] New client connected. Total active clients: ${wss.clients.size}`);

  // Send initial synchronized flag state to connecting client
  ws.send(JSON.stringify({
    type: 'INIT_STATE',
    flagId: flagState.flagId,
    value: flagState.value,
    version: flagState.version,
    updatedAt: flagState.updatedAt,
    serverTimestamp: Date.now(),
  }));

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'PING') {
        ws.send(JSON.stringify({ type: 'PONG', serverTime: Date.now() }));
      }
    } catch {
      // ignore malformed ws messages
    }
  });

  ws.on('close', () => {
    console.log(`[WS] Client disconnected. Total active clients: ${wss.clients.size}`);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Distributed Feature Flag Local Backend Server running!`);
  console.log(`   HTTP REST API: http://localhost:${PORT}`);
  console.log(`   WebSocket Push: ws://localhost:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /health`);
  console.log(`     GET  /api/metrics`);
  console.log(`     GET  /api/flags/new_checkout`);
  console.log(`     POST /api/flags/new_checkout/toggle`);
  console.log(`     POST /api/control/fault`);
  console.log(`====================================================`);
});

export { server, wss };
