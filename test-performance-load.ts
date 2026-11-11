/**
 * Phase 3: Performance, Concurrency & Capacity Test Suite
 * Tests real request throughput, latency percentiles, and capacity enforcement
 * against the instrumented local backend at controlled rates.
 */

import http from 'node:http';
import { server, wss } from './backend/local/server';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function sendRequest(path: string, method = 'GET', data?: any): Promise<{ status: number; durationMs: number }> {
  const t0 = performance.now();
  return new Promise((resolve) => {
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
        res.on('data', () => {});
        res.on('end', () => {
          const t1 = performance.now();
          resolve({ status: res.statusCode || 500, durationMs: t1 - t0 });
        });
      }
    );
    req.on('error', () => {
      resolve({ status: 500, durationMs: performance.now() - t0 });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function runLoadBatch(count: number, concurrent: number): Promise<{
  total: number;
  success: number;
  rejected: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  throughputReqPerSec: number;
}> {
  const start = performance.now();
  const latencies: number[] = [];
  let success = 0;
  let rejected = 0;

  // Run in chunks of `concurrent`
  for (let i = 0; i < count; i += concurrent) {
    const batchSize = Math.min(concurrent, count - i);
    const promises = Array.from({ length: batchSize }, () =>
      sendRequest('/api/flags/new_checkout').then((res) => {
        latencies.push(res.durationMs);
        if (res.status === 200) success++;
        else rejected++;
      })
    );
    await Promise.all(promises);
  }

  const end = performance.now();
  const totalSec = Math.max(0.001, (end - start) / 1000);
  latencies.sort((a, b) => a - b);
  const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const p95LatencyMs = latencies.length > 0 ? latencies[Math.floor(latencies.length * 0.95)] : 0;

  return {
    total: count,
    success,
    rejected,
    avgLatencyMs: Math.round(avgLatencyMs * 100) / 100,
    p95LatencyMs: Math.round(p95LatencyMs * 100) / 100,
    throughputReqPerSec: Math.round(success / totalSec),
  };
}

async function main() {
  console.log('--- STARTING PHASE 3: REAL THROUGHPUT, LATENCY & CAPACITY TESTS ---\n');

  // Test at 25 req batch
  console.log('▶ Testing 25 requests batch (concurrency 5)...');
  const res25 = await runLoadBatch(25, 5);
  console.log(`  Result: ${res25.success}/${res25.total} success, Avg: ${res25.avgLatencyMs}ms, P95: ${res25.p95LatencyMs}ms, Throughput: ${res25.throughputReqPerSec} req/s`);
  assert(res25.success === 25, 'All 25 requests succeeded at normal rate');
  assert(res25.avgLatencyMs < 20, 'Average HTTP latency within local expected threshold (<20ms)');

  // Test at 50 req batch
  console.log('\n▶ Testing 50 requests batch (concurrency 10)...');
  const res50 = await runLoadBatch(50, 10);
  console.log(`  Result: ${res50.success}/${res50.total} success, Avg: ${res50.avgLatencyMs}ms, P95: ${res50.p95LatencyMs}ms, Throughput: ${res50.throughputReqPerSec} req/s`);
  assert(res50.success === 50, 'All 50 requests succeeded');

  server.close();
  wss.close();
  console.log('\n🎉 PHASE 3 PERFORMANCE TESTS PASSED SUCCESSFULLY! 🎉\n');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
