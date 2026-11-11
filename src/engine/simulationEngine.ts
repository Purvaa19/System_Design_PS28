import type {
  ComponentId,
  FlagState,
  MetricHistoryPoint,
  ScenarioId,
  SimulationEvent,
  SimulationMetrics,
  SystemComponent,
} from '../types/simulation';
import { INITIAL_COMPONENTS } from './initialComponents';

export interface SimulationState {
  isRunning: boolean;
  offeredLoad: number;
  concurrentClients: number;
  networkDelayMs: number;
  components: Record<ComponentId, SystemComponent>;
  flagState: FlagState;
  metrics: SimulationMetrics;
  metricHistory: MetricHistoryPoint[];
  events: SimulationEvent[];
  activeScenario: ScenarioId;
  selectedComponentId: ComponentId | null;
  // Counters for cache lookups – incremented each tick
  cacheHits: number;
  cacheMisses: number;
}

export const INITIAL_FLAG_STATE: FlagState = {
  id: 'flag_new_checkout',
  name: 'new_checkout',
  description: 'Switches the mobile checkout experience between standard form and 1-Click Express Checkout.',
  desiredValue: false,
  persistedValue: false,
  publishedValue: false,
  sseBroadcastValue: false,
  phoneClientValue: false,
  lastUpdated: Date.now(),
  isPropagating: false,
  propagationStatus: 'synchronized',
  lastPropagationTimeMs: 32.5,
};

export const INITIAL_METRICS: SimulationMetrics = {
  offeredLoad: 1500,
  successfulThroughput: 1500,
  avgLatencyMs: 1.1,
  p95LatencyMs: 1.8,
  errorRate: 0.0,
  cacheHitRatio: 99.8,
  updatePropagationMs: 32.5,
  totalEvaluations: 15000,
  totalErrors: 0,
};

export function createInitialSimulationState(): SimulationState {
  return {
    isRunning: true,
    offeredLoad: 1500,
    concurrentClients: 1000,
    networkDelayMs: 0,
    components: JSON.parse(JSON.stringify(INITIAL_COMPONENTS)),
    flagState: { ...INITIAL_FLAG_STATE },
    metrics: { ...INITIAL_METRICS },
    metricHistory: generateInitialHistory(),
    events: [
      {
        id: 'ev-init-1',
        timestamp: getTimestamp(),
        type: 'recovery',
        message: 'Distributed Feature Flag Service initialized.',
        details: 'All 10 architecture nodes online. SDK Local Cache warmed up.',
      },
      {
        id: 'ev-init-2',
        timestamp: getTimestamp(),
        type: 'request',
        message: 'Evaluation pipeline active at 1,500 req/s.',
        details: '99.8% cache hit ratio, sub-millisecond local evaluation.',
      },
    ],
    activeScenario: 'normal',
    selectedComponentId: 'client_sdk',
    cacheHits: 14970,
    cacheMisses: 30,
  };
}

function getTimestamp(): string {
  const d = new Date();
  return d.toTimeString().split(' ')[0];
}

function generateInitialHistory(): MetricHistoryPoint[] {
  const history: MetricHistoryPoint[] = [];
  const now = Date.now();
  for (let i = 20; i >= 0; i--) {
    const t = new Date(now - i * 1000);
    history.push({
      timestamp: t.toTimeString().split(' ')[0],
      offeredLoad: 1500,
      throughput: 1500,
      avgLatency: 1.1 + (Math.random() * 0.15 - 0.07),
      p95Latency: 1.8 + (Math.random() * 0.2 - 0.1),
      errorRate: 0,
      queueDepth: 0,
    });
  }
  return history;
}

/**
 * Step the simulation by one tick (e.g. 1 second).
 * Computes exact per-component loads, queues, utilization, throughput, latencies, and errors.
 */
export function stepSimulation(state: SimulationState): SimulationState {
  if (!state.isRunning) return state;

  const nextComponents = { ...state.components };
  const offered = state.offeredLoad;
  const netDelay = state.networkDelayMs;

  let droppedRequests = 0;
  let totalQueue = 0;

  // 1. Client Instances
  const clientInst = { ...nextComponents.client_instances };
  if (clientInst.isFailed) {
    clientInst.incomingLoad = 0;
    clientInst.utilization = 0;
    clientInst.currentLatencyMs = 0;
    droppedRequests += offered;
  } else {
    clientInst.incomingLoad = offered;
    clientInst.utilization = Math.min(100, Math.round((offered / clientInst.capacity) * 1000) / 10);
    clientInst.currentLatencyMs = clientInst.baseLatencyMs;
  }
  nextComponents.client_instances = clientInst;

  // 2. Load Generator
  const loadGen = { ...nextComponents.load_generator };
  const loadGenIn = clientInst.isFailed ? 0 : offered;
  loadGen.incomingLoad = loadGenIn;
  if (loadGen.isFailed) {
    loadGen.utilization = 0;
    loadGen.queueDepth = 0;
    loadGen.currentLatencyMs = 0;
    droppedRequests += loadGenIn;
  } else {
    loadGen.utilization = Math.min(100, Math.round((loadGenIn / loadGen.capacity) * 1000) / 10);
    // Queue calculation
    if (loadGenIn > loadGen.capacity) {
      const excess = loadGenIn - loadGen.capacity;
      loadGen.queueDepth = Math.min(loadGen.maxQueueDepth, loadGen.queueDepth + excess);
      if (loadGen.queueDepth >= loadGen.maxQueueDepth) {
        droppedRequests += excess;
      }
      loadGen.health = 'warning';
    } else {
      loadGen.queueDepth = Math.max(0, loadGen.queueDepth - (loadGen.capacity - loadGenIn));
      loadGen.health = 'healthy';
    }
    const qDelay = (loadGen.queueDepth / Math.max(1, loadGen.capacity)) * 1000;
    loadGen.currentLatencyMs = Math.round((loadGen.baseLatencyMs + qDelay) * 10) / 10;
  }
  totalQueue += loadGen.queueDepth;
  nextComponents.load_generator = loadGen;

  const loadGenThroughput = loadGen.isFailed ? 0 : Math.min(loadGenIn, loadGen.capacity);

  // 3. Client SDK
  const sdk = { ...nextComponents.client_sdk };
  sdk.incomingLoad = loadGenThroughput;
  if (sdk.isFailed) {
    sdk.utilization = 0;
    sdk.queueDepth = 0;
    sdk.currentLatencyMs = 0;
    droppedRequests += loadGenThroughput;
  } else {
    sdk.utilization = Math.min(100, Math.round((loadGenThroughput / sdk.capacity) * 1000) / 10);
    if (loadGenThroughput > sdk.capacity) {
      const excess = loadGenThroughput - sdk.capacity;
      sdk.queueDepth = Math.min(sdk.maxQueueDepth, sdk.queueDepth + excess);
      if (sdk.queueDepth >= sdk.maxQueueDepth) {
        droppedRequests += excess;
      }
      sdk.health = 'warning';
    } else {
      sdk.queueDepth = Math.max(0, sdk.queueDepth - (sdk.capacity - loadGenThroughput));
      sdk.health = 'healthy';
    }
    const qDelay = (sdk.queueDepth / Math.max(1, sdk.capacity)) * 1000;
    sdk.currentLatencyMs = Math.round((sdk.baseLatencyMs + qDelay) * 10) / 10;
  }
  totalQueue += sdk.queueDepth;
  nextComponents.client_sdk = sdk;

  const sdkThroughput = sdk.isFailed ? 0 : Math.min(loadGenThroughput, sdk.capacity);

  // 4. Local Flag Cache (L1 in memory hash table)
  const cache = { ...nextComponents.local_flag_cache };
  cache.incomingLoad = sdkThroughput;
  // Determine cache hit vs miss based on capacity
  let cacheHit = true;
  if (cache.isFailed) {
    cache.utilization = 0;
    cache.queueDepth = 0;
    cache.currentLatencyMs = 0;
    cacheHit = false;
    cache.health = 'failed';
  } else {
    // Utilization based on incoming load
    cache.utilization = Math.min(100, Math.round((sdkThroughput / cache.capacity) * 1000) / 10);
    if (sdkThroughput > cache.capacity) {
      // Miss: overload beyond cache capacity
      const excess = sdkThroughput - cache.capacity;
      cache.queueDepth = Math.min(cache.maxQueueDepth, cache.queueDepth + excess);
      cache.health = 'warning';
      cacheHit = false;
    } else {
      cache.queueDepth = Math.max(0, cache.queueDepth - (cache.capacity - sdkThroughput));
      cache.health = 'healthy';
    }
    const qDelay = (cache.queueDepth / Math.max(1, cache.capacity)) * 1000;
    cache.currentLatencyMs = Math.round((cache.baseLatencyMs + qDelay) * 10) / 10;
  }
  totalQueue += cache.queueDepth;
  nextComponents.local_flag_cache = cache;

  // 5. SDK Evaluation Engine (Rule evaluation & user bucketing)
  const evalEngine = { ...nextComponents.sdk_eval_engine };
  evalEngine.incomingLoad = sdkThroughput;
  if (evalEngine.isFailed) {
    evalEngine.utilization = 0;
    evalEngine.queueDepth = 0;
    evalEngine.currentLatencyMs = 0;
    droppedRequests += sdkThroughput;
    evalEngine.health = 'failed';
  } else {
    evalEngine.utilization = Math.min(100, Math.round((sdkThroughput / evalEngine.capacity) * 1000) / 10);
    if (sdkThroughput > evalEngine.capacity) {
      const excess = sdkThroughput - evalEngine.capacity;
      evalEngine.queueDepth = Math.min(evalEngine.maxQueueDepth, evalEngine.queueDepth + excess);
      if (evalEngine.queueDepth >= evalEngine.maxQueueDepth) {
        droppedRequests += excess;
      }
      evalEngine.health = 'warning';
    } else {
      evalEngine.queueDepth = Math.max(0, evalEngine.queueDepth - (evalEngine.capacity - sdkThroughput));
      evalEngine.health = 'healthy';
    }
    const qDelay = (evalEngine.queueDepth / Math.max(1, evalEngine.capacity)) * 1000;
    evalEngine.currentLatencyMs = Math.round((evalEngine.baseLatencyMs + qDelay) * 10) / 10;
  }
  totalQueue += evalEngine.queueDepth;
  nextComponents.sdk_eval_engine = evalEngine;

  // Final successful throughput along the evaluation path
  const completedThroughput = evalEngine.isFailed || sdk.isFailed || cache.isFailed
    ? 0
    : Math.min(sdkThroughput, evalEngine.capacity, cache.capacity);

  // 6, 7, 8, 9: Configuration Control Plane components
  // CRITICAL REQUIREMENT: These are NOT on the normal evaluation path!
  // Evaluation path requests never hit Cloud Storage or Pub/Sub!
  const cfgService = { ...nextComponents.config_service };
  const cloudStorage = { ...nextComponents.cloud_storage };
  const pubsub = { ...nextComponents.pubsub_broker };
  const sse = { ...nextComponents.sse_server };

  // Idle background load (heartbeats / polling checks)
  cfgService.incomingLoad = cfgService.isFailed ? 0 : 2;
  cfgService.utilization = cfgService.isFailed ? 0 : Math.round((2 / cfgService.capacity) * 1000) / 10;
  cfgService.currentLatencyMs = cfgService.baseLatencyMs;

  cloudStorage.incomingLoad = cloudStorage.isFailed ? 0 : 2;
  cloudStorage.utilization = cloudStorage.isFailed ? 0 : Math.round((2 / cloudStorage.capacity) * 1000) / 10;
  cloudStorage.currentLatencyMs = cloudStorage.baseLatencyMs;

  pubsub.incomingLoad = pubsub.isFailed ? 0 : 2;
  pubsub.utilization = pubsub.isFailed ? 0 : Math.round((2 / pubsub.capacity) * 1000) / 10;
  pubsub.currentLatencyMs = pubsub.baseLatencyMs;

  if (sse.isFailed) {
    sse.incomingLoad = 0;
    sse.utilization = 0;
    sse.queueDepth = 0;
    sse.currentLatencyMs = 0;
    sse.health = 'failed';
  } else if (sse.queueDepth > 0) {
    // Drain queued fan-out broadcast backlog
    sse.queueDepth = Math.max(0, sse.queueDepth - sse.capacity);
    const sseQDelay = (sse.queueDepth / Math.max(1, sse.capacity)) * 1000;
    sse.currentLatencyMs = Math.round((sse.baseLatencyMs + sseQDelay) * 10) / 10;
    sse.health = sse.queueDepth > 0 ? 'warning' : 'healthy';
    sse.incomingLoad = sse.queueDepth > 0 ? sse.capacity : 2;
    sse.utilization = sse.queueDepth > 0 ? 100 : Math.round((2 / sse.capacity) * 1000) / 10;
  } else {
    sse.incomingLoad = 2;
    sse.utilization = Math.round((2 / sse.capacity) * 1000) / 10;
    sse.currentLatencyMs = sse.baseLatencyMs;
    sse.health = 'healthy';
  }

  nextComponents.config_service = cfgService;
  nextComponents.cloud_storage = cloudStorage;
  nextComponents.pubsub_broker = pubsub;
  nextComponents.sse_server = sse;

  // 10. Monitoring (receives sampled telemetry from Client SDK ~ 5%)
  const mon = { ...nextComponents.monitoring };
  const monLoad = mon.isFailed ? 0 : Math.round(completedThroughput * 0.05);
  mon.incomingLoad = monLoad;
  if (!mon.isFailed) {
    mon.utilization = Math.min(100, Math.round((monLoad / mon.capacity) * 1000) / 10);
    mon.currentLatencyMs = mon.baseLatencyMs;
    mon.health = mon.utilization > 90 ? 'warning' : 'healthy';
  }
  nextComponents.monitoring = mon;

  // Compute Overall System Metrics
  // Base latency along the evaluation path:
  // Client Instances -> Load Gen -> Client SDK -> Local Flag Cache & Eval Engine
  const pathLatency =
    (clientInst.isFailed ? 0 : clientInst.currentLatencyMs) +
    (loadGen.isFailed ? 0 : loadGen.currentLatencyMs) +
    (sdk.isFailed ? 0 : sdk.currentLatencyMs) +
    (cache.isFailed ? 0 : cache.currentLatencyMs) +
    (evalEngine.isFailed ? 0 : evalEngine.currentLatencyMs) +
    netDelay;

  const avgLatency = Math.round(pathLatency * 10) / 10;
  // Tail latency p95 includes jitter and queue distribution
  const jitterFactor = 1.35 + (totalQueue > 0 ? Math.min(1.5, totalQueue / 200) : 0.1);
  const p95Latency = Math.round(avgLatency * jitterFactor * 10) / 10;

  const errorPct = offered > 0 ? Math.min(100, Math.round((droppedRequests / offered) * 1000) / 10) : 0;
  
  // Track modeled cache hits and misses
  const tickHits = cacheHit ? Math.round(completedThroughput * 0.998) : 0;
  const tickMisses = completedThroughput - tickHits;
  const nextCacheHits = (state.cacheHits ?? 14970) + tickHits;
  const nextCacheMisses = (state.cacheMisses ?? 30) + tickMisses;
  const totalLookups = nextCacheHits + nextCacheMisses;
  const cacheHitRatio = totalLookups > 0
    ? Math.round((nextCacheHits / totalLookups) * 1000) / 10
    : (cacheHit ? 99.8 : 0.0);

  const nextMetrics: SimulationMetrics = {
    offeredLoad: offered,
    successfulThroughput: completedThroughput,
    avgLatencyMs: avgLatency,
    p95LatencyMs: p95Latency,
    errorRate: errorPct,
    cacheHitRatio: cacheHitRatio,
    updatePropagationMs: state.flagState.lastPropagationTimeMs,
    totalEvaluations: state.metrics.totalEvaluations + completedThroughput,
    totalErrors: state.metrics.totalErrors + droppedRequests,
  };

  // Add point to Metric History (keep last 30 points)
  const historyPoint: MetricHistoryPoint = {
    timestamp: getTimestamp(),
    offeredLoad: offered,
    throughput: completedThroughput,
    avgLatency: avgLatency,
    p95Latency: p95Latency,
    errorRate: errorPct,
    queueDepth: totalQueue,
  };

  const nextHistory = [...state.metricHistory.slice(-29), historyPoint];

  // Periodic simulated events for realism when running
  let nextEvents = [...state.events];
  if (Math.random() < 0.15 && errorPct > 0) {
    nextEvents = [
      {
        id: `ev-err-${Date.now()}`,
        timestamp: getTimestamp(),
        type: 'warning',
        component: evalEngine.queueDepth > 0 ? 'sdk_eval_engine' : 'load_generator',
        message: `High load saturation: ${droppedRequests} req/s throttled or queued.`,
        details: `Queue depth at ${totalQueue}. Latency elevated to ${avgLatency}ms.`,
      },
      ...nextEvents.slice(0, 50),
    ];
  }

  return {
    ...state,
    components: nextComponents,
    metrics: nextMetrics,
    metricHistory: nextHistory,
    events: nextEvents,
    cacheHits: nextCacheHits,
    cacheMisses: nextCacheMisses,
  };
}

/**
 * Handle user toggling the feature flag.
 * Executes the full configuration-update flow step by step:
 * Feature Flag Toggle -> Config Service -> Cloud Storage -> Pub/Sub Broker -> SSE Server -> Client SDK -> Local Flag Cache
 */
export function toggleFeatureFlag(state: SimulationState): SimulationState {
  const newDesired = !state.flagState.desiredValue;
  const timestamp = getTimestamp();
  let nextEvents = [...state.events];

  nextEvents.unshift({
    id: `ev-toggle-${Date.now()}`,
    timestamp,
    type: 'update',
    component: 'config_service',
    message: `Feature flag 'new_checkout' toggled to ${newDesired ? 'ON' : 'OFF'}.`,
    details: 'Initiating configuration update pipeline across control plane.',
  });

  const nextComponents = { ...state.components };
  const nextFlagState = { ...state.flagState, desiredValue: newDesired, isPropagating: true };

  // Temporarily stimulate load on control plane components
  if (!nextComponents.config_service.isFailed) {
    nextComponents.config_service.incomingLoad = 120;
    nextComponents.config_service.utilization = 24.0;
  }

  // 1. Check Configuration Service
  if (nextComponents.config_service.isFailed) {
    nextEvents.unshift({
      id: `ev-cfg-err-${Date.now()}`,
      timestamp,
      type: 'error',
      component: 'config_service',
      message: 'Configuration Service failed! Flag update rejected (HTTP 503).',
      details: 'Control plane unavailable. No changes persisted.',
    });
    nextFlagState.propagationStatus = 'blocked_storage';
    nextFlagState.isPropagating = false;
    return { ...state, flagState: nextFlagState, events: nextEvents.slice(0, 60), components: nextComponents };
  }

  // 2. Check Cloud Storage
  if (nextComponents.cloud_storage.isFailed) {
    nextEvents.unshift({
      id: `ev-storage-err-${Date.now()}`,
      timestamp,
      type: 'error',
      component: 'cloud_storage',
      message: 'Cloud Storage write transaction failed! Flag mutation aborted.',
      details: 'Storage is offline. Client caches continue serving existing configuration.',
    });
    nextFlagState.propagationStatus = 'blocked_storage';
    nextFlagState.isPropagating = false;
    return { ...state, flagState: nextFlagState, events: nextEvents.slice(0, 60), components: nextComponents };
  }

  // Persist succeeded
  nextFlagState.persistedValue = newDesired;
  if (!nextComponents.cloud_storage.isFailed) {
    nextComponents.cloud_storage.incomingLoad = 80;
    nextComponents.cloud_storage.utilization = 20.0;
  }
  nextEvents.unshift({
    id: `ev-storage-ok-${Date.now()}`,
    timestamp,
    type: 'update',
    component: 'cloud_storage',
    message: `Configuration persisted to Cloud Storage (version v${Math.floor(Date.now() / 1000)}).`,
    details: 'Durable state updated in primary data store.',
  });

  // 3. Check Pub/Sub Broker
  if (nextComponents.pubsub_broker.isFailed) {
    nextEvents.unshift({
      id: `ev-pubsub-err-${Date.now()}`,
      timestamp,
      type: 'error',
      component: 'pubsub_broker',
      message: 'Pub/Sub Broker is down! Change event could not be published.',
      details: 'Event bus failure. Clients will not receive push notification.',
    });
    nextFlagState.propagationStatus = 'blocked_pubsub';
    nextFlagState.isPropagating = false;
    return { ...state, flagState: nextFlagState, events: nextEvents.slice(0, 60), components: nextComponents };
  }

  // Pub/Sub succeeded
  nextFlagState.publishedValue = newDesired;
  if (!nextComponents.pubsub_broker.isFailed) {
    nextComponents.pubsub_broker.incomingLoad = 150;
    nextComponents.pubsub_broker.utilization = 6.0;
  }
  nextEvents.unshift({
    id: `ev-pubsub-ok-${Date.now()}`,
    timestamp,
    type: 'update',
    component: 'pubsub_broker',
    message: "Event published to topic 'feature_flags.delta'.",
    details: 'Broadcasting to SSE update server listeners.',
  });

  // 4. Check SSE Update Server
  if (nextComponents.sse_server.isFailed) {
    nextEvents.unshift({
      id: `ev-sse-err-${Date.now()}`,
      timestamp,
      type: 'error',
      component: 'sse_server',
      message: 'SSE Update Server is offline! Streaming fan-out interrupted.',
      details: 'HTTP streaming connection severed. Phone client remains on previous flag state.',
    });
    nextFlagState.propagationStatus = 'blocked_sse';
    nextFlagState.isPropagating = false;
    return { ...state, flagState: nextFlagState, events: nextEvents.slice(0, 60), components: nextComponents };
  }

  // SSE Broadcast step
  nextFlagState.sseBroadcastValue = newDesired;
  if (!nextComponents.sse_server.isFailed) {
    const offeredClients = state.concurrentClients;
    const capacity = nextComponents.sse_server.capacity;
    // Preserve full offered fan-out workload rather than clamping to capacity
    nextComponents.sse_server.incomingLoad = offeredClients;
    nextComponents.sse_server.utilization = Math.min(100, Math.round((offeredClients / capacity) * 1000) / 10);

    if (offeredClients > capacity) {
      const excess = offeredClients - capacity;
      nextComponents.sse_server.queueDepth = Math.min(nextComponents.sse_server.maxQueueDepth, excess);
      nextComponents.sse_server.health = 'warning';
      const sseQDelay = (nextComponents.sse_server.queueDepth / Math.max(1, capacity)) * 1000;
      nextComponents.sse_server.currentLatencyMs = Math.round((nextComponents.sse_server.baseLatencyMs + sseQDelay) * 10) / 10;

      nextEvents.unshift({
        id: `ev-sse-warn-${Date.now()}`,
        timestamp,
        type: 'warning',
        component: 'sse_server',
        message: `SSE fan-out saturation: ${offeredClients.toLocaleString()} clients offered exceeds capacity (${capacity.toLocaleString()}/s).`,
        details: `Queue buffered ${nextComponents.sse_server.queueDepth.toLocaleString()} broadcasts (+${Math.round(sseQDelay)}ms fan-out queue delay).`,
      });
    } else {
      nextComponents.sse_server.queueDepth = 0;
      nextComponents.sse_server.currentLatencyMs = nextComponents.sse_server.baseLatencyMs;
      nextComponents.sse_server.health = 'healthy';

      nextEvents.unshift({
        id: `ev-sse-ok-${Date.now()}`,
        timestamp,
        type: 'update',
        component: 'sse_server',
        message: `SSE stream broadcasted delta to ${offeredClients.toLocaleString()} connected clients.`,
        details: 'Long-lived HTTP persistent event stream push completed.',
      });
    }
  }

  // 5. Check Client SDK & Local Flag Cache
  if (nextComponents.client_sdk.isFailed) {
    nextEvents.unshift({
      id: `ev-sdk-err-${Date.now()}`,
      timestamp,
      type: 'error',
      component: 'client_sdk',
      message: 'Client SDK is offline! Update cannot reach mobile application.',
      details: 'Client connection lost. Mobile app preview remains on previous cached state.',
    });
    nextFlagState.propagationStatus = 'blocked_sse';
    nextFlagState.isPropagating = false;
    return { ...state, flagState: nextFlagState, events: nextEvents.slice(0, 60), components: nextComponents };
  }

  if (nextComponents.local_flag_cache.isFailed) {
    nextEvents.unshift({
      id: `ev-cache-err-${Date.now()}`,
      timestamp,
      type: 'error',
      component: 'local_flag_cache',
      message: 'Local Flag Cache memory failure! Cannot write configuration delta.',
      details: 'Cache write rejected. Existing state retained.',
    });
    nextFlagState.propagationStatus = 'blocked_sse';
    nextFlagState.isPropagating = false;
    return { ...state, flagState: nextFlagState, events: nextEvents.slice(0, 60), components: nextComponents };
  }

  // 6. Client SDK & Local Flag Cache updated
  // Deterministic calculation of total configuration update propagation delay:
  // Sequential stages: Config Service -> Cloud Storage -> Pub/Sub Broker -> SSE Server -> Client SDK -> Local Flag Cache + WAN Network Transit
  const stageLatencies =
    nextComponents.config_service.currentLatencyMs +
    nextComponents.cloud_storage.currentLatencyMs +
    nextComponents.pubsub_broker.currentLatencyMs +
    nextComponents.sse_server.currentLatencyMs +
    nextComponents.client_sdk.currentLatencyMs +
    nextComponents.local_flag_cache.currentLatencyMs;

  const propTime = Math.round((stageLatencies + state.networkDelayMs) * 10) / 10;
  nextFlagState.phoneClientValue = newDesired;
  nextFlagState.isPropagating = false;
  nextFlagState.propagationStatus = 'synchronized';
  nextFlagState.lastPropagationTimeMs = propTime;
  nextFlagState.lastUpdated = Date.now();

  nextEvents.unshift({
    id: `ev-client-sync-${Date.now()}`,
    timestamp,
    type: 'update',
    component: 'client_sdk',
    message: `Phone Client SDK received delta; Local Flag Cache updated in ${propTime}ms!`,
    details: `ShopEasy mobile preview instantly switched to: ${newDesired ? 'NEW CHECKOUT EXPERIENCE' : 'OLD CHECKOUT EXPERIENCE'}.`,
  });

  return {
    ...state,
    components: nextComponents,
    flagState: nextFlagState,
    events: nextEvents.slice(0, 60),
  };
}

/**
 * Toggle component failure (Fail / Restore).
 * If restored, attempts automatic resync of pending flag state if needed.
 */
export function toggleComponentFailure(state: SimulationState, componentId: ComponentId): SimulationState {
  const comp = state.components[componentId];
  if (!comp) return state;

  const willBeFailed = !comp.isFailed;
  const timestamp = getTimestamp();
  const nextComponents = { ...state.components };
  let nextEvents = [...state.events];

  nextComponents[componentId] = {
    ...comp,
    isFailed: willBeFailed,
    health: willBeFailed ? 'failed' : 'healthy',
    incomingLoad: willBeFailed ? 0 : comp.incomingLoad,
    queueDepth: willBeFailed ? 0 : comp.queueDepth,
  };

  if (willBeFailed) {
    nextEvents.unshift({
      id: `ev-fail-${Date.now()}`,
      timestamp,
      type: 'error',
      component: componentId,
      message: `Component injected with FAILURE: ${comp.name}.`,
      details: `Health set to FAILED. Capacity reduced to 0 req/s.`,
    });
  } else {
    nextEvents.unshift({
      id: `ev-recov-${Date.now()}`,
      timestamp,
      type: 'recovery',
      component: componentId,
      message: `Component RESTORED to healthy: ${comp.name}.`,
      details: `Processing capacity returned to ${comp.capacity} req/s.`,
    });
  }

  // Check if we need to auto-resynchronize phone preview when control plane components are restored!
  let nextFlagState = { ...state.flagState };
  if (!willBeFailed && nextFlagState.desiredValue !== nextFlagState.phoneClientValue) {
    // Check if the entire update path is now healthy
    const canSync =
      !nextComponents.config_service.isFailed &&
      !nextComponents.cloud_storage.isFailed &&
      !nextComponents.pubsub_broker.isFailed &&
      !nextComponents.sse_server.isFailed &&
      !nextComponents.client_sdk.isFailed &&
      !nextComponents.local_flag_cache.isFailed;

    if (canSync) {
      nextFlagState.persistedValue = nextFlagState.desiredValue;
      nextFlagState.publishedValue = nextFlagState.desiredValue;
      nextFlagState.sseBroadcastValue = nextFlagState.desiredValue;
      nextFlagState.phoneClientValue = nextFlagState.desiredValue;
      nextFlagState.propagationStatus = 'synchronized';
      nextFlagState.lastUpdated = Date.now();
      const stageLatencies =
        nextComponents.config_service.currentLatencyMs +
        nextComponents.cloud_storage.currentLatencyMs +
        nextComponents.pubsub_broker.currentLatencyMs +
        nextComponents.sse_server.currentLatencyMs +
        nextComponents.client_sdk.currentLatencyMs +
        nextComponents.local_flag_cache.currentLatencyMs;
      nextFlagState.lastPropagationTimeMs = Math.round((stageLatencies + state.networkDelayMs) * 10) / 10;

      nextEvents.unshift({
        id: `ev-resync-${Date.now()}`,
        timestamp,
        type: 'recovery',
        component: 'client_sdk',
        message: 'Pipeline recovered: Phone Client SDK resynchronized with SSE stream!',
        details: `Local cache updated. Mobile app preview synchronized to ${nextFlagState.desiredValue ? 'NEW CHECKOUT' : 'OLD CHECKOUT'}.`,
      });
    }
  }

  return {
    ...state,
    components: nextComponents,
    flagState: nextFlagState,
    events: nextEvents.slice(0, 60),
  };
}

/**
 * Update component processing capacity
 */
export function updateComponentCapacity(
  state: SimulationState,
  componentId: ComponentId,
  capacity: number
): SimulationState {
  const comp = state.components[componentId];
  if (!comp) return state;

  const nextComponents = {
    ...state.components,
    [componentId]: {
      ...comp,
      capacity,
    },
  };

  return {
    ...state,
    components: nextComponents,
  };
}

/**
 * Apply one of the 4 defined scenarios
 */
export function applyScenario(state: SimulationState, scenarioId: ScenarioId): SimulationState {
  const timestamp = getTimestamp();
  let nextComponents = JSON.parse(JSON.stringify(INITIAL_COMPONENTS)) as Record<ComponentId, SystemComponent>;
  let nextOfferedLoad = 1500;
  let nextClients = 1000;
  let nextNetDelay = 0;
  let nextFlagState = { ...state.flagState };
  let scenarioMsg = '';

  switch (scenarioId) {
    case 'normal':
      scenarioMsg = 'Scenario 1 (Normal Operation): Moderate 1,500 req/s, all nodes healthy, ~1.1ms latency.';
      nextOfferedLoad = 1500;
      nextClients = 1000;
      nextNetDelay = 0;
      // Resynchronize flag state
      nextFlagState.persistedValue = nextFlagState.desiredValue;
      nextFlagState.publishedValue = nextFlagState.desiredValue;
      nextFlagState.sseBroadcastValue = nextFlagState.desiredValue;
      nextFlagState.phoneClientValue = nextFlagState.desiredValue;
      nextFlagState.propagationStatus = 'synchronized';
      break;

    case 'spike':
      scenarioMsg = 'Scenario 2 (Traffic Spike): Traffic surged to 7,500 req/s. SDK Evaluation Engine exceeds capacity (6,000 req/s)!';
      nextOfferedLoad = 7500;
      nextClients = 4000;
      nextNetDelay = 2;
      break;

    case 'pubsub_failure':
      scenarioMsg = 'Scenario 3 (Pub/Sub Failure): Pub/Sub Broker failed! Flag toggles cannot reach SSE or clients, but local cached evals continue fast.';
      nextOfferedLoad = 1500;
      nextClients = 1000;
      nextComponents.pubsub_broker.isFailed = true;
      nextComponents.pubsub_broker.health = 'failed';
      break;

    case 'storage_failure':
      scenarioMsg = 'Scenario 4 (Storage Failure): Cloud Storage failed! New flag mutations are rejected at write time, but cached evaluations stay unaffected.';
      nextOfferedLoad = 1500;
      nextClients = 1000;
      nextComponents.cloud_storage.isFailed = true;
      nextComponents.cloud_storage.health = 'failed';
      break;
  }

  const nextEvents = [
    {
      id: `ev-scen-${Date.now()}`,
      timestamp,
      type: 'recovery' as const,
      message: `Switched to ${scenarioMsg}`,
      details: 'Simulation parameters and node health updated accordingly.',
    },
    ...state.events.slice(0, 50),
  ];

  return {
    ...state,
    activeScenario: scenarioId,
    offeredLoad: nextOfferedLoad,
    concurrentClients: nextClients,
    networkDelayMs: nextNetDelay,
    components: nextComponents,
    flagState: nextFlagState,
    events: nextEvents,
    isRunning: true,
  };
}
