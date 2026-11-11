import http from 'node:http';
import { WebSocket } from 'ws';
import { server, wss } from './backend/local/server';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function request(path: string, method = 'GET', data?: any): Promise<{ status: number; body: any }> {
  return new Promise((resolve, reject) => {
    const payload = data ? JSON.stringify(data) : undefined;
    const req = http.request(
      {
        hostname: 'localhost',
        port: 3001,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 500, body: JSON.parse(raw) });
          } catch {
            resolve({ status: res.statusCode || 500, body: raw });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runTests() {
  console.log('--- STARTING LOCAL INSTRUMENTED BACKEND TESTS ---\n');

  // Test 1: Health check
  const health = await request('/health');
  assert(health.status === 200, 'GET /health returns 200 OK');
  assert(health.body.status === 'healthy', 'Server status is healthy');

  // Test 2: Connect WebSocket client
  const wsMessages: any[] = [];
  const ws = new WebSocket('ws://localhost:3001');

  await new Promise<void>((resolve) => {
    ws.on('open', () => resolve());
    ws.on('message', (data) => {
      wsMessages.push(JSON.parse(data.toString()));
    });
  });

  assert(ws.readyState === WebSocket.OPEN, 'WebSocket connected successfully to ws://localhost:3001');

  // Wait for initial message
  await new Promise((r) => setTimeout(r, 100));
  assert(wsMessages.length > 0 && wsMessages[0].type === 'INIT_STATE', 'Received INIT_STATE via WebSocket push');
  assert(wsMessages[0].value === false, 'Initial flag value is false');

  // Test 3: Toggle flag via REST API
  const toggleRes1 = await request('/api/flags/new_checkout/toggle', 'POST', { desiredValue: true });
  assert(toggleRes1.status === 200, 'POST /api/flags/new_checkout/toggle returns 200 OK');
  assert(toggleRes1.body.flagState.value === true, 'Flag value persisted as true in local store');

  // Wait for WebSocket push notification
  await new Promise((r) => setTimeout(r, 150));
  const pushMsg = wsMessages.find((m) => m.type === 'FLAG_DELTA_PUSH');
  assert(Boolean(pushMsg), 'Client received real-time FLAG_DELTA_PUSH over WebSocket');
  assert(pushMsg.value === true, 'Pushed flag value matches toggled value (true)');

  // Test 4: Fault injection (Simulate Cloud Storage down)
  await request('/api/control/fault', 'POST', { componentId: 'cloud_storage', isFailed: true });
  const failedToggle = await request('/api/flags/new_checkout/toggle', 'POST', { desiredValue: false });
  assert(failedToggle.status === 500, 'Storage fault causes HTTP 500 failure on flag mutation');

  // Recover Cloud Storage
  await request('/api/control/fault', 'POST', { componentId: 'cloud_storage', isFailed: false });
  const recoveredToggle = await request('/api/flags/new_checkout/toggle', 'POST', { desiredValue: false });
  assert(recoveredToggle.status === 200, 'Flag mutation succeeds after storage recovery');

  // Cleanup
  ws.close();
  server.close();
  wss.close();

  console.log('\n🎉 ALL LOCAL INSTRUMENTED BACKEND TESTS PASSED! 🎉\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
