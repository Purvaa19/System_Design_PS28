import type { LabOperationMode, RealtimeConnectionStatus, RealtimeSyncEvent } from '../types/simulation';

export interface BackendEndpointConfig {
  httpUrl: string;
  wsUrl: string;
}

function sanitizeUrl(url?: string): string {
  if (!url) return '';
  return url.trim().replace(/\/+$/, '');
}

// In-memory runtime override endpoints (for session testing if Vite env is unset)
let runtimeCustomHttpUrl: string | null = null;
let runtimeCustomWsUrl: string | null = null;

export function setCustomEndpoints(httpUrl?: string, wsUrl?: string): void {
  runtimeCustomHttpUrl = httpUrl ? sanitizeUrl(httpUrl) : null;
  runtimeCustomWsUrl = wsUrl ? sanitizeUrl(wsUrl) : null;
}

export function getEndpoints(mode: LabOperationMode): BackendEndpointConfig {
  if (mode === 'live_aws') {
    const envHttp = sanitizeUrl((import.meta as any).env?.VITE_AWS_API_URL);
    const envWs = sanitizeUrl((import.meta as any).env?.VITE_AWS_WS_URL);
    return {
      httpUrl: runtimeCustomHttpUrl || envHttp || '',
      wsUrl: runtimeCustomWsUrl || envWs || '',
    };
  }

  if (mode === 'local_backend') {
    const envHttp = sanitizeUrl((import.meta as any).env?.VITE_LOCAL_API_URL);
    const envWs = sanitizeUrl((import.meta as any).env?.VITE_LOCAL_WS_URL);
    return {
      httpUrl: envHttp || 'http://localhost:3001',
      wsUrl: envWs || 'ws://localhost:3001',
    };
  }

  return {
    httpUrl: '',
    wsUrl: '',
  };
}

/**
 * VOLATILE IN-MEMORY ADMIN KEY STORE
 * Stored strictly in JavaScript process memory (RAM).
 * NEVER written to localStorage, sessionStorage, cookies, IndexedDB, or Git.
 * Automatically destroyed when the browser tab/page is closed or refreshed.
 */
let inMemoryAdminKey: string | null = null;

export function setInMemoryAdminKey(key: string | null): void {
  inMemoryAdminKey = key && key.trim().length > 0 ? key.trim() : null;
}

export function getInMemoryAdminKey(): string | null {
  return inMemoryAdminKey;
}

export function hasInMemoryAdminKey(): boolean {
  return Boolean(inMemoryAdminKey && inMemoryAdminKey.length > 0);
}

export function clearInMemoryAdminKey(): void {
  inMemoryAdminKey = null;
}

// Backward-compatibility aliases for existing calls
export const setSessionAdminKey = setInMemoryAdminKey;
export const getSessionAdminKey = getInMemoryAdminKey;

/**
 * Fetch current persisted flag state from remote service (GET).
 * Public read operation: does not require or transmit administrative credentials.
 */
export async function fetchRemoteFlag(mode: LabOperationMode): Promise<any> {
  const config = getEndpoints(mode);
  if (!config.httpUrl) {
    throw new Error(`No HTTP URL configured for mode '${mode}'. Set VITE_AWS_API_URL in your environment.`);
  }

  const res = await fetch(`${config.httpUrl}/api/flags/new_checkout`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    let errBody: any;
    try {
      errBody = await res.json();
    } catch {
      errBody = { error: res.statusText };
    }
    throw new Error(errBody.message || errBody.error || `HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

export interface RemoteToggleResult {
  success: boolean;
  flagState: {
    flagId: string;
    value: boolean;
    version: number;
    updatedAt: string;
  };
  durationMs: number;
  propagationStatus: 'synchronized' | 'blocked_storage' | 'blocked_pubsub' | 'blocked_sse';
  error?: string;
  statusCode?: number;
}

/**
 * Send real toggle mutation to backend service (POST).
 * Measures exact network roundtrip duration via performance.now().
 * Authentication header (x-admin-key) is pulled strictly from volatile memory.
 */
export async function toggleRemoteFlag(
  mode: LabOperationMode,
  desiredValue?: boolean,
  adminKeyOverride?: string
): Promise<RemoteToggleResult> {
  const config = getEndpoints(mode);
  if (!config.httpUrl) {
    return {
      success: false,
      flagState: {
        flagId: 'new_checkout',
        value: Boolean(desiredValue),
        version: 0,
        updatedAt: new Date().toISOString(),
      },
      durationMs: 0,
      propagationStatus: 'blocked_storage',
      error: `Missing HTTP API URL for mode '${mode}'. Configure VITE_AWS_API_URL in Netlify or .env.`,
    };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const activeKey = adminKeyOverride || getInMemoryAdminKey();
  if (activeKey) {
    headers['x-admin-key'] = activeKey;
  }

  const t0 = performance.now();
  try {
    const res = await fetch(`${config.httpUrl}/api/flags/new_checkout/toggle`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ desiredValue }),
    });

    const t1 = performance.now();
    const durationMs = Math.round((t1 - t0) * 10) / 10;

    if (!res.ok) {
      let errBody: any;
      try {
        errBody = await res.json();
      } catch {
        errBody = { error: res.statusText };
      }

      return {
        success: false,
        statusCode: res.status,
        flagState: {
          flagId: 'new_checkout',
          value: Boolean(desiredValue),
          version: 0,
          updatedAt: new Date().toISOString(),
        },
        durationMs,
        propagationStatus: res.status === 503 ? 'blocked_storage' : 'blocked_pubsub',
        error: errBody.message || errBody.error || `HTTP ${res.status}: ${res.statusText}`,
      };
    }

    const data = await res.json();
    return {
      success: true,
      statusCode: 200,
      flagState: data.flagState,
      durationMs,
      propagationStatus: data.propagationStatus || 'synchronized',
    };
  } catch (netErr: any) {
    const t1 = performance.now();
    return {
      success: false,
      flagState: {
        flagId: 'new_checkout',
        value: Boolean(desiredValue),
        version: 0,
        updatedAt: new Date().toISOString(),
      },
      durationMs: Math.round((t1 - t0) * 10) / 10,
      propagationStatus: 'blocked_storage',
      error: netErr?.message || 'Network connection failed. Verify AWS HTTP API Gateway is reachable.',
    };
  }
}

/**
 * Real-time WebSocket connection manager for AWS API Gateway / Local server
 */
export class RealtimeClientManager {
  private ws: WebSocket | null = null;
  private mode: LabOperationMode = 'simulation';
  private onMessageCallback: ((event: RealtimeSyncEvent) => void) | null = null;
  private onStatusCallback: ((status: RealtimeConnectionStatus) => void) | null = null;
  private reconnectTimer: any = null;
  private isExplicitlyClosed = false;

  constructor(
    onMessage: (event: RealtimeSyncEvent) => void,
    onStatus: (status: RealtimeConnectionStatus) => void
  ) {
    this.onMessageCallback = onMessage;
    this.onStatusCallback = onStatus;
  }

  public connect(mode: LabOperationMode) {
    this.disconnect();
    this.mode = mode;
    this.isExplicitlyClosed = false;

    if (mode === 'simulation') {
      this.onStatusCallback?.('disconnected');
      return;
    }

    const config = getEndpoints(mode);
    if (!config.wsUrl) {
      console.warn(`[RealtimeClient] No WebSocket URL configured for mode: ${mode}`);
      this.onStatusCallback?.('error');
      return;
    }

    this.onStatusCallback?.('connecting');
    try {
      this.ws = new WebSocket(config.wsUrl);

      this.ws.onopen = () => {
        console.log(`[RealtimeClient] Connected to ${config.wsUrl} (${mode})`);
        this.onStatusCallback?.('connected');
      };

      this.ws.onmessage = (msgEvent) => {
        try {
          const data = JSON.parse(msgEvent.data);
          if (data.type === 'FLAG_DELTA_PUSH' || data.type === 'INIT_STATE') {
            this.onMessageCallback?.(data as RealtimeSyncEvent);
          }
        } catch (e) {
          console.error('[RealtimeClient] Failed to parse WebSocket message:', e);
        }
      };

      this.ws.onerror = (err) => {
        console.warn(`[RealtimeClient] WebSocket error (${mode}):`, err);
        this.onStatusCallback?.('error');
      };

      this.ws.onclose = (event) => {
        console.log(`[RealtimeClient] WebSocket closed (${mode}, code: ${event.code})`);
        this.onStatusCallback?.('disconnected');
        if (!this.isExplicitlyClosed && (this.mode === 'local_backend' || this.mode === 'live_aws')) {
          // Automatic reconnect with backoff
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[RealtimeClient] Failed to create WebSocket connection:', err);
      this.onStatusCallback?.('error');
    }
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = setTimeout(() => {
      if (!this.isExplicitlyClosed && this.mode !== 'simulation') {
        console.log('[RealtimeClient] Attempting WebSocket reconnect...');
        this.connect(this.mode);
      }
    }, 3000);
  }

  public disconnect() {
    this.isExplicitlyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
    this.onStatusCallback?.('disconnected');
  }
}
