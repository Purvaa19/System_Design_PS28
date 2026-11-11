export type ComponentId =
  | 'client_instances'
  | 'load_generator'
  | 'client_sdk'
  | 'sdk_eval_engine'
  | 'local_flag_cache'
  | 'config_service'
  | 'cloud_storage'
  | 'pubsub_broker'
  | 'sse_server'
  | 'monitoring';

export type ComponentHealth = 'healthy' | 'warning' | 'failed';

export type ComponentCategory = 'evaluation' | 'control_plane' | 'monitoring';

export interface SystemComponent {
  id: ComponentId;
  name: string;
  category: ComponentCategory;
  purpose: string;
  health: ComponentHealth;
  incomingLoad: number; // req/s
  capacity: number; // req/s max
  defaultCapacity: number;
  utilization: number; // 0 to 100%
  queueDepth: number; // current queue items
  maxQueueDepth: number;
  baseLatencyMs: number; // base processing latency
  currentLatencyMs: number; // including queue delay
  isFailed: boolean;
  x: number; // Canvas X position
  y: number; // Canvas Y position
}

export interface FlagState {
  id: string;
  name: string;
  description: string;
  desiredValue: boolean; // What the admin configured
  persistedValue: boolean; // Stored in Cloud Storage
  publishedValue: boolean; // Published to Pub/Sub
  sseBroadcastValue: boolean; // Broadcasted by SSE
  phoneClientValue: boolean; // Received by the phone's Client SDK
  lastUpdated: number;
  isPropagating: boolean;
  propagationStatus: 'synchronized' | 'in_flight' | 'blocked_storage' | 'blocked_pubsub' | 'blocked_sse';
  lastPropagationTimeMs: number;
}

export interface SimulationMetrics {
  offeredLoad: number; // req/s entering system
  successfulThroughput: number; // evals/s successfully returned
  avgLatencyMs: number; // milliseconds
  p95LatencyMs: number; // 95th percentile ms
  errorRate: number; // 0 - 100%
  cacheHitRatio: number; // 0 - 100%
  updatePropagationMs: number; // ms taken for last flag update
  totalEvaluations: number;
  totalErrors: number;
}

export interface MetricHistoryPoint {
  timestamp: string;
  offeredLoad: number;
  throughput: number;
  avgLatency: number;
  p95Latency: number;
  errorRate: number;
  queueDepth: number;
}

export type EventLogType = 'request' | 'update' | 'error' | 'recovery' | 'warning';

export interface SimulationEvent {
  id: string;
  timestamp: string;
  type: EventLogType;
  component?: ComponentId;
  message: string;
  details?: string;
}

export type ScenarioId = 'normal' | 'spike' | 'pubsub_failure' | 'storage_failure';

export type ScenarioDefinition = {
  id: ScenarioId;
  title: string;
  tagline: string;
  description: string;
  expectedObservation: string;
};

export type LabOperationMode = 'simulation' | 'local_backend' | 'live_aws';

export type RealtimeConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface RealtimeSyncEvent {
  type: string;
  flagId: string;
  value: boolean;
  version: number;
  updatedAt: string;
  source: string;
  serverTimestamp?: number;
}

