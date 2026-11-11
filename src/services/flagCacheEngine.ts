/**
 * Real Client-Side Feature Flag SDK & In-Memory Evaluation Engine
 * Part of PS 28: Low-Latency Distributed Feature Flag Service
 *
 * Implements an in-memory JavaScript Map cache for sub-millisecond local
 * flag evaluations, with TTL expiration, in-flight deduplication, and
 * real-time WebSocket cache synchronization.
 */

import { fetchRemoteFlag } from './backendClient';

export interface CachedFlagRecord {
  flagKey: string;
  value: boolean;
  version?: number;
  cachedAt: number;
  expiresAt: number;
}

export type CachedFlagState = 'ON' | 'OFF' | 'EMPTY' | 'EXPIRED';

export interface PeekedFlagResult {
  state: CachedFlagState;
  value?: boolean;
  version?: number;
  expiresAt?: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number; // 0 to 100 percentage
  totalLookups: number;
  awsRequestsAvoided: number; // equal to hits
  lastStatus: 'HIT' | 'MISS' | 'UPDATED' | 'EXPIRED' | 'IDLE';
  lastEvaluatedKey?: string;
  lastEvaluatedValue?: boolean;
  lastEvaluationDurationUs?: number;
  lastAwsGetRttMs?: number;
  cachedFlagsCount: number;
}

export interface SdkBenchmarkResult {
  evaluationCount: number;
  totalDurationMs: number;
  avgLatencyMs: number;
  avgLatencyUs: number;
  throughputOpsPerSec: number;
  trueCount: number;
  falseCount: number;
  evaluatedValue: boolean;
  timestamp: number;
}

// Configurable 30-second TTL (Requirement 2)
export const DEFAULT_FLAG_TTL_MS = 30_000;

// In-Memory Storage: JavaScript Map (Requirement 2)
const flagCache = new Map<string, CachedFlagRecord>();

// In-Flight Request Deduplication Map (Requirement 2)
const inFlightRequests = new Map<string, Promise<{ value: boolean; version?: number; rttMs: number }>>();

// Cache Statistics Tracking
let cacheHits = 0;
let cacheMisses = 0;
let lastStatus: CacheStats['lastStatus'] = 'IDLE';
let lastEvaluatedKey: string | undefined;
let lastEvaluatedValue: boolean | undefined;
let lastEvaluationDurationUs: number | undefined;
let lastAwsGetRttMs: number | undefined;

// Subscribers for cache change events (WebSocket push, Sync GET, Clear Cache, Refill)
type CacheChangeListener = (flagKey?: string) => void;
const cacheChangeListeners = new Set<CacheChangeListener>();

function notifyCacheChange(flagKey?: string): void {
  cacheChangeListeners.forEach((listener) => {
    try {
      listener(flagKey);
    } catch (err) {
      console.error('[FlagCacheEngine] Error in cache change listener:', err);
    }
  });
}

export function subscribeCacheChange(listener: CacheChangeListener): () => void {
  cacheChangeListeners.add(listener);
  return () => {
    cacheChangeListeners.delete(listener);
  };
}

// Subscribers for telemetry / stats panel updates (end of benchmark, sync RTT, clear)
type CacheStatsListener = (stats: CacheStats) => void;
const statsListeners = new Set<CacheStatsListener>();

function notifyStatsListeners(): void {
  const stats = getCacheStats();
  statsListeners.forEach((listener) => {
    try {
      listener(stats);
    } catch (err) {
      console.error('[FlagCacheEngine] Error in cache stats listener:', err);
    }
  });
}

export function subscribeCacheStats(listener: CacheStatsListener): () => void {
  statsListeners.add(listener);
  // Emit current stats immediately
  listener(getCacheStats());
  return () => {
    statsListeners.delete(listener);
  };
}

/**
 * Return actual cache statistics (Requirement 2)
 */
export function getCacheStats(): CacheStats {
  const totalLookups = cacheHits + cacheMisses;
  const hitRate = totalLookups > 0 ? (cacheHits / totalLookups) * 100 : 0;

  return {
    hits: cacheHits,
    misses: cacheMisses,
    hitRate: Math.round(hitRate * 10) / 10,
    totalLookups,
    awsRequestsAvoided: cacheHits,
    lastStatus,
    lastEvaluatedKey,
    lastEvaluatedValue,
    lastEvaluationDurationUs,
    lastAwsGetRttMs,
    cachedFlagsCount: flagCache.size,
  };
}

/**
 * Record AWS GET RTT measurement from manual or automatic sync.
 */
export function recordAwsGetRtt(rttMs: number): void {
  lastAwsGetRttMs = Math.round(rttMs * 10) / 10;
  notifyStatsListeners();
}

/**
 * Store a flag in memory (Requirement 2)
 * Correctly handles both true and false values.
 */
export function setCachedFlag(
  flagKey: string,
  value: boolean,
  version?: number,
  ttlMs: number = DEFAULT_FLAG_TTL_MS
): void {
  const now = Date.now();
  flagCache.set(flagKey, {
    flagKey,
    value: Boolean(value),
    version,
    cachedAt: now,
    expiresAt: now + ttlMs,
  });

  lastStatus = 'UPDATED';
  lastEvaluatedKey = flagKey;
  lastEvaluatedValue = Boolean(value);

  // Notify cache change listeners (PhonePreview SDK) and stats listeners (panel)
  notifyCacheChange(flagKey);
  notifyStatsListeners();
}

/**
 * Evaluate a locally cached flag (Requirement 2 & 5)
 * Synchronous, in-memory look up. Zero network/HTTP overhead.
 * Correctly handles boolean true and false.
 * CRITICAL PERFORMANCE GUARANTEE: Does NOT call listener notifications.
 * Never causes recursive loop or React re-renders on hot-path evaluations.
 */
export function evaluateFlag(flagKey: string): {
  value: boolean;
  isHit: boolean;
  isExpired: boolean;
  version?: number;
} {
  const t0 = performance.now();
  const record = flagCache.get(flagKey);

  lastEvaluatedKey = flagKey;

  // Cache Miss: Not in Map
  if (!record || record.value === undefined) {
    cacheMisses++;
    lastStatus = 'MISS';
    lastEvaluatedValue = false;
    const t1 = performance.now();
    lastEvaluationDurationUs = Math.round((t1 - t0) * 1000 * 100) / 100;
    return { value: false, isHit: false, isExpired: false };
  }

  // Cache Miss: TTL Expired
  const now = Date.now();
  if (now > record.expiresAt) {
    cacheMisses++;
    lastStatus = 'EXPIRED';
    lastEvaluatedValue = record.value;
    const t1 = performance.now();
    lastEvaluationDurationUs = Math.round((t1 - t0) * 1000 * 100) / 100;
    return { value: record.value, isHit: false, isExpired: true, version: record.version };
  }

  // Cache Hit
  cacheHits++;
  lastStatus = 'HIT';
  lastEvaluatedValue = record.value;
  const t1 = performance.now();
  lastEvaluationDurationUs = Math.round((t1 - t0) * 1000 * 100) / 100;

  return {
    value: record.value,
    isHit: true,
    isExpired: false,
    version: record.version,
  };
}

/**
 * Cache-first lookup, fetching from AWS on a miss (Requirement 2)
 * Deduplicates simultaneous requests for the same flag.
 * Prevents stale in-flight GET responses from overwriting newer updates.
 */
export async function getFlag(
  flagKey: string = 'new_checkout',
  fetcher?: (key: string) => Promise<{ value: boolean; version?: number }>
): Promise<{ value: boolean; isHit: boolean; version?: number; rttMs?: number }> {
  // 1. Cache-first lookup
  const cached = evaluateFlag(flagKey);
  if (cached.isHit) {
    return {
      value: cached.value,
      isHit: true,
      version: cached.version,
    };
  }

  // 2. Cache Miss: Deduplicate concurrent in-flight requests for same key
  if (inFlightRequests.has(flagKey)) {
    const sharedPromise = inFlightRequests.get(flagKey)!;
    const sharedResult = await sharedPromise;
    return {
      value: sharedResult.value,
      isHit: false,
      version: sharedResult.version,
      rttMs: sharedResult.rttMs,
    };
  }

  // 3. Initiate fetch from AWS
  const fetchPromise = (async () => {
    const t0 = performance.now();
    let data: any;

    if (fetcher) {
      data = await fetcher(flagKey);
    } else {
      data = await fetchRemoteFlag('live_aws');
    }

    const t1 = performance.now();
    const rttMs = Math.round((t1 - t0) * 10) / 10;
    lastAwsGetRttMs = rttMs;

    const fetchedValue = Boolean(data.value);
    const fetchedVersion = typeof data.version === 'number' ? data.version : undefined;

    // Concurrency Protection: Ensure a newer WebSocket update didn't arrive while GET was in flight
    const current = flagCache.get(flagKey);
    const isNewerOrEqual =
      !current ||
      fetchedVersion === undefined ||
      current.version === undefined ||
      fetchedVersion >= current.version;

    if (isNewerOrEqual) {
      setCachedFlag(flagKey, fetchedValue, fetchedVersion);
    }

    return { value: fetchedValue, version: fetchedVersion, rttMs };
  })();

  inFlightRequests.set(flagKey, fetchPromise);

  try {
    const result = await fetchPromise;
    return {
      value: result.value,
      isHit: false,
      version: result.version,
      rttMs: result.rttMs,
    };
  } finally {
    inFlightRequests.delete(flagKey);
  }
}

/**
 * Invalidate one cached flag (Requirement 2)
 */
export function invalidateFlag(flagKey: string): void {
  flagCache.delete(flagKey);
  lastStatus = 'IDLE';
  notifyCacheChange(flagKey);
  notifyStatsListeners();
}

/**
 * Clear the cache and reset stats (Requirement 2)
 */
export function clearCache(): void {
  flagCache.clear();
  inFlightRequests.clear();
  cacheHits = 0;
  cacheMisses = 0;
  lastStatus = 'IDLE';
  lastEvaluatedKey = undefined;
  lastEvaluatedValue = undefined;
  lastEvaluationDurationUs = undefined;
  notifyCacheChange();
  notifyStatsListeners();
}

/**
 * Inspect raw cached record (for testing or debugging)
 */
export function getCachedRecord(flagKey: string): CachedFlagRecord | undefined {
  return flagCache.get(flagKey);
}

/**
 * Pure read-only inspection of the cached flag state (CHANGE 4).
 * Crucial rules:
 * - Does NOT increment cache hits.
 * - Does NOT increment cache misses.
 * - Does NOT trigger AWS requests.
 * - Does NOT reset or alter TTL.
 */
export function peekCachedFlag(flagKey: string = 'new_checkout'): PeekedFlagResult {
  const record = flagCache.get(flagKey);
  if (!record || record.value === undefined) {
    return { state: 'EMPTY' };
  }
  const now = Date.now();
  if (now > record.expiresAt) {
    return {
      state: 'EXPIRED',
      value: record.value,
      version: record.version,
      expiresAt: record.expiresAt,
    };
  }
  return {
    state: record.value ? 'ON' : 'OFF',
    value: record.value,
    version: record.version,
    expiresAt: record.expiresAt,
  };
}

/**
 * Live AWS Phone SDK Cache-First Evaluation (CHANGE 1).
 * - Cache HIT: calls evaluateFlag(), returns cached boolean immediately with 0 network calls.
 * - Cache MISS (EMPTY or EXPIRED): calls getFlag() cache-aside flow, fetches from AWS,
 *   populates Map, and returns fetched value.
 */
export async function evaluateFlagSdk(
  flagKey: string = 'new_checkout',
  fetcher?: (key: string) => Promise<{ value: boolean; version?: number }>
): Promise<{ value: boolean; isHit: boolean; isExpired: boolean; version?: number }> {
  const peek = peekCachedFlag(flagKey);
  if (peek.state === 'ON' || peek.state === 'OFF') {
    const evalRes = evaluateFlag(flagKey);
    return {
      value: evalRes.value,
      isHit: true,
      isExpired: false,
      version: evalRes.version,
    };
  }

  // Cache MISS: entry is missing or expired, fetch via getFlag() cache-aside flow
  const getRes = await getFlag(flagKey, fetcher);
  return {
    value: getRes.value,
    isHit: false,
    isExpired: peek.state === 'EXPIRED',
    version: getRes.version,
  };
}

/**
 * Handle incoming WebSocket Flag Delta Push (Requirement 3)
 * Updates cache if incoming version >= current version, or if version not present.
 * Ignores older versions.
 */
export function handleWebSocketFlagUpdate(event: {
  flagId: string;
  value: boolean;
  version?: number;
}): boolean {
  const current = flagCache.get(event.flagId);

  // Ignore older versions if version information is available (Requirement 3)
  if (
    current &&
    typeof current.version === 'number' &&
    typeof event.version === 'number' &&
    event.version < current.version
  ) {
    console.warn(
      `[FlagCacheEngine] Ignored stale WebSocket update for ${event.flagId}: event v${event.version} < cached v${current.version}`
    );
    return false;
  }

  // Update in-memory Map cache
  setCachedFlag(event.flagId, event.value, event.version);
  return true;
}

/**
 * Benchmark 10,000 real local flag evaluations (CHANGE 3)
 * - If cache is empty or expired, genuinely performs cache-first fetch via getFlag() first.
 * - Keeps network fetch latency strictly separate from the timed local benchmark.
 * - Measures evaluateFlag() using batch performance.now() (pure local in-memory evaluations).
 * - Genuinely consumes the returned flag value to prevent compiler dead-code elimination.
 */
export async function runSdkBenchmark(
  sampleCount: number = 10_000,
  flagKey: string = 'new_checkout',
  fetcher?: (key: string) => Promise<{ value: boolean; version?: number }>
): Promise<SdkBenchmarkResult> {
  // 1. If cache is empty or expired, perform genuine cache-first fetch via getFlag() first
  const peek = peekCachedFlag(flagKey);
  if (peek.state === 'EMPTY' || peek.state === 'EXPIRED') {
    await getFlag(flagKey, fetcher);
  }

  // 2. JIT warm-up loop (50 iterations)
  for (let w = 0; w < 50; w++) {
    evaluateFlag(flagKey);
  }

  let trueCount = 0;
  let falseCount = 0;
  let lastVal = false;

  // 3. Batch timing: measures purely local in-memory evaluations
  const t0 = performance.now();
  for (let i = 0; i < sampleCount; i++) {
    const res = evaluateFlag(flagKey);
    // Genuinely consume returned flag value (Requirement 4)
    if (res.value) {
      trueCount++;
    } else {
      falseCount++;
    }
    lastVal = res.value;
  }
  const t1 = performance.now();

  const totalDurationMs = Math.max(0.0001, t1 - t0);
  const avgLatencyMs = totalDurationMs / sampleCount;
  const avgLatencyUs = Math.round(avgLatencyMs * 1000 * 100) / 100;
  const throughputOpsPerSec = Math.round(sampleCount / (totalDurationMs / 1000));

  const result: SdkBenchmarkResult = {
    evaluationCount: sampleCount,
    totalDurationMs: Math.round(totalDurationMs * 100) / 100,
    avgLatencyMs: Math.round(avgLatencyMs * 100000) / 100000,
    avgLatencyUs,
    throughputOpsPerSec,
    trueCount,
    falseCount,
    evaluatedValue: lastVal,
    timestamp: Date.now(),
  };

  // Single stats notification at the end of the entire batch (Zero per-iteration renders)
  notifyStatsListeners();
  return result;
}
