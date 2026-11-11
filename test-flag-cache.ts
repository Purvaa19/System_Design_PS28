/**
 * Acceptance & Unit Test Suite for PS28 In-Memory Flag Cache Engine
 * Tests Map cache, TTL expiry, version conflict resolution, in-flight deduplication,
 * live peek inspection, and 10,000-iteration real local evaluation latency benchmarking.
 */

import {
  evaluateFlag,
  setCachedFlag,
  getFlag,
  invalidateFlag,
  clearCache,
  getCacheStats,
  handleWebSocketFlagUpdate,
  runSdkBenchmark,
  recordAwsGetRtt,
  peekCachedFlag,
  evaluateFlagSdk,
  subscribeCacheStats,
  subscribeCacheChange,
} from './src/services/flagCacheEngine';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exit(1);
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('--- STARTING IN-MEMORY FLAG CACHE ENGINE UNIT TESTS ---\n');

  // Test 1: Empty cache evaluates as MISS
  clearCache();
  const missResult = evaluateFlag('new_checkout');
  assert(!missResult.isHit, 'Empty cache returns isHit = false');
  assert(missResult.value === false, 'Cache miss returns safe fallback false');
  assert(getCacheStats().misses === 1, 'Cache stats records 1 miss');

  // Test 2: Handling boolean true
  setCachedFlag('new_checkout', true, 1);
  const hitTrue = evaluateFlag('new_checkout');
  assert(hitTrue.isHit, 'evaluateFlag hits populated cache');
  assert(hitTrue.value === true, 'evaluateFlag returns true for true flag');
  assert(hitTrue.version === 1, 'evaluateFlag preserves flag version 1');

  // Test 3: Handling boolean false (Must NOT be treated as falsy cache miss)
  setCachedFlag('new_checkout', false, 2);
  const hitFalse = evaluateFlag('new_checkout');
  assert(hitFalse.isHit, 'evaluateFlag hits cache for false flag');
  assert(hitFalse.value === false, 'evaluateFlag returns exact boolean false without miss');
  assert(hitFalse.version === 2, 'evaluateFlag preserves flag version 2');

  // Test 4: Cache hits avoid network requests (Zero AWS requests on hit)
  clearCache();
  setCachedFlag('new_checkout', true, 1);
  let networkCalls = 0;
  const mockFetcher = async () => {
    networkCalls++;
    return { value: true, version: 1 };
  };

  const get1 = await getFlag('new_checkout', mockFetcher);
  const get2 = await getFlag('new_checkout', mockFetcher);
  const get3 = await getFlag('new_checkout', mockFetcher);
  assert(get1.isHit && get2.isHit && get3.isHit, 'All 3 getFlag calls returned cache hits');
  assert(networkCalls === 0, 'Zero network calls made when flag is cached (100% AWS request offload)');

  // Test 5: In-flight request deduplication on cache miss
  clearCache();
  let concurrentCalls = 0;
  const slowFetcher = async () => {
    concurrentCalls++;
    await sleep(40);
    return { value: true, version: 5 };
  };

  // Launch 5 concurrent calls on cold cache
  const [res1, _res2, _res3, _res4, res5] = await Promise.all([
    getFlag('new_checkout', slowFetcher),
    getFlag('new_checkout', slowFetcher),
    getFlag('new_checkout', slowFetcher),
    getFlag('new_checkout', slowFetcher),
    getFlag('new_checkout', slowFetcher),
  ]);

  assert(concurrentCalls === 1, '5 simultaneous cold requests coalesced into exactly 1 network fetch');
  assert(res1.value === true && res5.value === true, 'All callers received the fetched value');
  assert(evaluateFlag('new_checkout').isHit, 'Flag is now cached after in-flight completion');

  // Test 6: TTL Expiration
  clearCache();
  setCachedFlag('ephemeral_flag', true, 1, 50); // 50ms TTL
  const immediate = evaluateFlag('ephemeral_flag');
  assert(immediate.isHit && !immediate.isExpired, 'Flag is valid immediately after insertion');

  await sleep(70); // Wait for TTL to expire
  const expired = evaluateFlag('ephemeral_flag');
  assert(!expired.isHit, 'Expired flag is not considered a cache hit');
  assert(expired.isExpired, 'Expired flag is flagged with isExpired = true');

  // Test 7: WebSocket Delta Push ignores older versions (Stale delta rejection)
  clearCache();
  setCachedFlag('new_checkout', true, 4);

  const stalePushHandled = handleWebSocketFlagUpdate({
    flagId: 'new_checkout',
    value: false,
    version: 3, // older than 4
  });
  assert(!stalePushHandled, 'Stale WebSocket push (v3 < v4) was rejected');
  assert(evaluateFlag('new_checkout').value === true, 'Cache value remained ON (v4)');

  // Test 8: WebSocket Delta Push accepts newer versions (OFF -> ON and ON -> OFF)
  const freshPushHandled = handleWebSocketFlagUpdate({
    flagId: 'new_checkout',
    value: false,
    version: 5, // newer than 4
  });
  assert(freshPushHandled, 'Newer WebSocket push (v5 > v4) was accepted');
  assert(evaluateFlag('new_checkout').value === false, 'Cache value was updated to OFF (v5)');

  // Test 8B: Reverse WebSocket push (OFF -> ON)
  const reversePushHandled = handleWebSocketFlagUpdate({
    flagId: 'new_checkout',
    value: true,
    version: 6,
  });
  assert(reversePushHandled, 'Reverse WebSocket push (OFF -> ON v6) was accepted');
  assert(evaluateFlag('new_checkout').value === true, 'Cache value was updated to ON (v6)');

  // Test 9: Concurrency Race Condition Protection (Stale GET does not overwrite newer WebSocket)
  clearCache();
  setCachedFlag('new_checkout', true, 10); // simulate WS pushed v10 while GET v8 was in flight
  invalidateFlag('new_checkout');
  const inflightGet = getFlag('new_checkout', async () => {
    await sleep(30);
    return { value: false, version: 8 };
  });
  // WS push arrives with v10 during GET
  handleWebSocketFlagUpdate({ flagId: 'new_checkout', value: true, version: 10 });
  await inflightGet;
  assert(
    evaluateFlag('new_checkout').version === 10 && evaluateFlag('new_checkout').value === true,
    'Stale in-flight GET (v8) did not overwrite newer WebSocket push (v10)'
  );

  // Test 10: 10,000-Iteration SDK Benchmark (Async)
  clearCache();
  setCachedFlag('new_checkout', true, 1);
  const bench = await runSdkBenchmark(10_000, 'new_checkout');
  assert(bench.evaluationCount === 10_000, 'Benchmark executed exactly 10,000 evaluations');
  assert(bench.trueCount === 10_000, 'All 10,000 evaluations consumed true flag value');
  assert(bench.falseCount === 0, 'Zero false counts recorded for true flag');
  assert(bench.avgLatencyUs > 0, `Measured average latency: ${bench.avgLatencyUs} µs`);
  assert(bench.throughputOpsPerSec > 100_000, `Throughput: ${bench.throughputOpsPerSec.toLocaleString()} ops/sec`);
  console.log(`\n  📊 Benchmark Result: ${bench.evaluationCount.toLocaleString()} evaluations in ${bench.totalDurationMs}ms`);
  console.log(`  ⏱️  Average Evaluation Latency: ${bench.avgLatencyUs} µs (${bench.avgLatencyMs.toFixed(6)} ms)`);
  console.log(`  🚀 Hot-path Throughput: ${bench.throughputOpsPerSec.toLocaleString()} evaluations/sec\n`);

  // Test 11: Recording AWS GET RTT
  recordAwsGetRtt(118.4);
  const stats = getCacheStats();
  assert(stats.lastAwsGetRttMs === 118.4, 'AWS GET RTT correctly recorded in cache stats');

  // Test 12: Clear Cache resets stats & empties Map
  clearCache();
  const resetStats = getCacheStats();
  assert(resetStats.cachedFlagsCount === 0, 'clearCache empties Map');
  assert(resetStats.hits === 0 && resetStats.misses === 0, 'clearCache resets hits and misses to 0');

  // Test 13: Read-Only peekCachedFlag (CHANGE 4)
  clearCache();
  const peekEmpty = peekCachedFlag('new_checkout');
  assert(peekEmpty.state === 'EMPTY', 'peekCachedFlag returns EMPTY on cleared cache');
  assert(getCacheStats().hits === 0 && getCacheStats().misses === 0, 'peekCachedFlag does NOT increment hits or misses');

  setCachedFlag('new_checkout', true, 1);
  const peekOn = peekCachedFlag('new_checkout');
  assert(peekOn.state === 'ON', 'peekCachedFlag returns ON for true flag');
  assert(getCacheStats().hits === 0 && getCacheStats().misses === 0, 'peekCachedFlag leaves counters untouched');

  setCachedFlag('new_checkout', false, 2);
  const peekOff = peekCachedFlag('new_checkout');
  assert(peekOff.state === 'OFF', 'peekCachedFlag returns OFF for false flag');

  setCachedFlag('new_checkout', true, 3, 20); // 20ms TTL
  await sleep(35);
  const peekExpired = peekCachedFlag('new_checkout');
  assert(peekExpired.state === 'EXPIRED', 'peekCachedFlag returns EXPIRED when TTL elapsed');

  // Test 14: Cache-First SDK Evaluation (CHANGE 1)
  clearCache();
  let sdkFetchCalls = 0;
  const mockSdkFetcher = async () => {
    sdkFetchCalls++;
    return { value: true, version: 10 };
  };
  // Cache MISS: fetches from backend and populates Map
  const sdkRes1 = await evaluateFlagSdk('new_checkout', mockSdkFetcher);
  assert(!sdkRes1.isHit, 'First evaluateFlagSdk on empty cache is a MISS');
  assert(sdkRes1.value === true, 'evaluateFlagSdk returns fetched value');
  assert(sdkFetchCalls === 1, 'evaluateFlagSdk made 1 network fetch on MISS');
  assert(peekCachedFlag('new_checkout').state === 'ON', 'Map is now populated with ON');

  // Cache HIT: returns from Map with ZERO network calls
  const sdkRes2 = await evaluateFlagSdk('new_checkout', mockSdkFetcher);
  assert(sdkRes2.isHit, 'Second evaluateFlagSdk is a cache HIT');
  assert(sdkRes2.value === true, 'evaluateFlagSdk returns cached true');
  assert(sdkFetchCalls === 1, 'Zero additional network calls on cache HIT');

  // Test 15: Clear Cache followed by Benchmark refill (CHANGE 2 & 3)
  clearCache();
  assert(peekCachedFlag('new_checkout').state === 'EMPTY', 'Cache is EMPTY after clear');
  let benchRefillCalls = 0;
  const benchFetcher = async () => {
    benchRefillCalls++;
    return { value: true, version: 15 };
  };
  const benchRefill = await runSdkBenchmark(10_000, 'new_checkout', benchFetcher);
  assert(benchRefillCalls === 1, 'runSdkBenchmark fetched from backend exactly once on empty cache');
  assert(benchRefill.evaluationCount === 10_000, 'runSdkBenchmark executed 10,000 local evaluations');
  assert(benchRefill.trueCount === 10_000, 'All 10,000 evaluations read refilled true value');
  assert(peekCachedFlag('new_checkout').state === 'ON', 'Map remains populated with ON after benchmark');

  // Test 16 (REGRESSION): Idle Live AWS mode does not cause unbounded evaluations or feedback loop
  clearCache();
  setCachedFlag('new_checkout', true, 1);
  let changeListenerDispatches = 0;
  let statsListenerDispatches = 0;
  const unchange = subscribeCacheChange(() => {
    changeListenerDispatches++;
  });
  const unstats = subscribeCacheStats(() => {
    statsListenerDispatches++;
  });
  // Reset counters after initial subscribe notification
  statsListenerDispatches = 0;

  // Simulate an SDK evaluation
  const evalRes = evaluateFlag('new_checkout');
  assert(evalRes.value === true && evalRes.isHit, 'Initial SDK evaluation succeeded');
  const lookupsAfterEval = getCacheStats().totalLookups;

  // Wait 100ms while completely idle
  await sleep(100);

  // Assert no additional evaluations happened while idle
  assert(
    getCacheStats().totalLookups === lookupsAfterEval,
    `Zero unbounded evaluations occurred while idle (total lookups = ${getCacheStats().totalLookups}, expected = ${lookupsAfterEval})`
  );
  assert(
    changeListenerDispatches === 0,
    'Zero cache change notifications dispatched during evaluation (feedback loop eliminated)'
  );
  assert(
    statsListenerDispatches === 0,
    'Zero stats notifications dispatched during evaluation (feedback loop eliminated)'
  );
  unchange();
  unstats();

  // Test 17 (REGRESSION): 10K benchmark performs purely local evaluations with ZERO per-iteration listener notifications
  clearCache();
  setCachedFlag('new_checkout', true, 1);
  let changeDispatchesDuring10k = 0;
  let statsDispatchesDuring10k = 0;
  const unchange2 = subscribeCacheChange(() => {
    changeDispatchesDuring10k++;
  });
  const unstats2 = subscribeCacheStats(() => {
    statsDispatchesDuring10k++;
  });
  // Reset counters after initial subscribe
  statsDispatchesDuring10k = 0;

  const tBenchStart = performance.now();
  const bench10k = await runSdkBenchmark(10_000, 'new_checkout');
  const tBenchEnd = performance.now();
  const benchWallClockMs = tBenchEnd - tBenchStart;

  assert(changeDispatchesDuring10k === 0, 'Zero cache change dispatches during 10K benchmark loop');
  assert(statsDispatchesDuring10k === 1, 'Exactly ONE stats notification dispatched after entire 10K batch completes (not 10,000)');
  assert(benchWallClockMs < 100, `10K benchmark finished in ${benchWallClockMs.toFixed(2)}ms (must be < 100ms, proving zero render interrupts)`);
  assert(bench10k.avgLatencyUs < 10, `Average latency per evaluation is ${bench10k.avgLatencyUs} µs (< 10µs, sub-microsecond hot path)`);
  assert(bench10k.trueCount === 10_000, 'All 10,000 evaluations validated as true');
  assert(peekCachedFlag('new_checkout').state === 'ON', 'Cache remains ON and NOT EXPIRED after benchmark');
  unchange2();
  unstats2();

  console.log('--- ALL IN-MEMORY FLAG CACHE TESTS (17/17) PASSED SUCCESSFULLY! ---\n');
}

runTests().catch((err) => {
  console.error('Test suite failed with unexpected error:', err);
  process.exit(1);
});
