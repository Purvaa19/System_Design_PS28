import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { SimulationState } from './engine/simulationEngine';
import {
  createInitialSimulationState,
  stepSimulation,
  toggleFeatureFlag,
  toggleComponentFailure,
  updateComponentCapacity,
  applyScenario,
} from './engine/simulationEngine';
import type { ComponentId, ScenarioId, LabOperationMode, RealtimeConnectionStatus, RealtimeSyncEvent } from './types/simulation';
import { runEvaluationBenchmark, updateBenchmarkLocalCache } from './engine/benchmarkEvaluation';
import {
  toggleRemoteFlag,
  fetchRemoteFlag,
  RealtimeClientManager,
  hasInMemoryAdminKey,
} from './services/backendClient';
import {
  handleWebSocketFlagUpdate,
  setCachedFlag,
  recordAwsGetRtt,
} from './services/flagCacheEngine';
import { TopBar } from './components/TopBar';
import { ScenarioBanner } from './components/ScenarioBanner';
import { AwsLiveStatusBar } from './components/AwsLiveStatusBar';
import { AdminKeyModal } from './components/AdminKeyModal';
import { Sidebar } from './components/Sidebar';
import { ArchitectureCanvas } from './components/ArchitectureCanvas';
import { FlagControls } from './components/FlagControls';
import { PhonePreview } from './components/PhonePreview';
import { TrafficControls } from './components/TrafficControls';
import { MetricsCards } from './components/MetricsCards';
import { LiveCharts } from './components/LiveCharts';
import { ComponentInspector } from './components/ComponentInspector';
import { EventLog } from './components/EventLog';

export const App: React.FC = () => {
  const [state, setState] = useState<SimulationState>(() => createInitialSimulationState());
  const [operationMode, setOperationMode] = useState<LabOperationMode>('simulation');
  const [connectionStatus, setConnectionStatus] = useState<RealtimeConnectionStatus>('disconnected');
  const [isAsyncToggling, setIsAsyncToggling] = useState(false);
  const [isAdminKeyModalOpen, setIsAdminKeyModalOpen] = useState(false);
  const [adminKeyPromptReason, setAdminKeyPromptReason] = useState('');
  const [pendingToggleOnAuth, setPendingToggleOnAuth] = useState(false);
  const [lastAwsMutationDurationMs, setLastAwsMutationDurationMs] = useState<number | null>(null);
  const [liveVersion, setLiveVersion] = useState<number | null>(null);
  const [isAwsRefreshing, setIsAwsRefreshing] = useState(false);

  const realtimeManagerRef = useRef<RealtimeClientManager | null>(null);
  const prevConnStatusRef = useRef<RealtimeConnectionStatus>('disconnected');
  const operationModeRef = useRef<LabOperationMode>(operationMode);

  useEffect(() => {
    operationModeRef.current = operationMode;
  }, [operationMode]);

  // Sync flag state from AWS via GET /api/flags/new_checkout
  const handleSyncFromAws = useCallback(async () => {
    setIsAwsRefreshing(true);
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
    const t0 = performance.now();
    try {
      const data = await fetchRemoteFlag('live_aws');
      const t1 = performance.now();
      const rttMs = Math.round((t1 - t0) * 10) / 10;
      setIsAwsRefreshing(false);
      setLiveVersion(data.version || 1);

      // Record AWS GET RTT and update in-memory Map cache
      recordAwsGetRtt(rttMs);
      setCachedFlag('new_checkout', data.value, data.version || 1);

      setState((prev) => {
        const nextFlag = {
          ...prev.flagState,
          desiredValue: data.value,
          persistedValue: data.value,
          phoneClientValue: data.value,
          publishedValue: data.value,
          sseBroadcastValue: data.value,
          propagationStatus: 'synchronized' as const,
          lastUpdated: Date.now(),
        };
        updateBenchmarkLocalCache('new_checkout', data.value, data.version || 1);
        const syncEvent = {
          id: `ev-aws-sync-${Date.now()}`,
          timestamp,
          type: 'update' as const,
          component: 'cloud_storage' as ComponentId,
          message: `[AWS SYNC] Synchronized flag state from DynamoDB: new_checkout = ${data.value ? 'ON' : 'OFF'} (v${data.version || 1}) [${rttMs}ms RTT]`,
          details: `Source: GET /api/flags/new_checkout. In-memory Map cache & phone preview refreshed.`,
        };
        return {
          ...prev,
          flagState: nextFlag,
          events: [syncEvent, ...prev.events.slice(0, 50)],
        };
      });
    } catch (err: any) {
      setIsAwsRefreshing(false);
      setState((prev) => {
        const warnEvent = {
          id: `ev-aws-warn-${Date.now()}`,
          timestamp,
          type: 'warning' as const,
          component: 'cloud_storage' as ComponentId,
          message: `[AWS SYNC NOTICE] ${err.message || 'Could not reach AWS HTTP API Gateway'}`,
          details: `Verify VITE_AWS_API_URL is configured in your Netlify or environment settings.`,
        };
        return {
          ...prev,
          events: [warnEvent, ...prev.events.slice(0, 50)],
        };
      });
    }
  }, []);

  // Initialize Realtime WebSocket Client Manager
  useEffect(() => {
    const manager = new RealtimeClientManager(
      (event: RealtimeSyncEvent) => {
        // Incoming real-time push frame from WebSocket (Local Server or AWS API Gateway)
        const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
        if (event.version) {
          setLiveVersion(event.version);
        }

        // Update real client-side in-memory cache engine
        handleWebSocketFlagUpdate({
          flagId: event.flagId,
          value: event.value,
          version: event.version,
        });

        setState((prev) => {
          const nextFlag = {
            ...prev.flagState,
            desiredValue: event.value,
            persistedValue: event.value,
            publishedValue: event.value,
            sseBroadcastValue: event.value,
            phoneClientValue: event.value,
            lastUpdated: Date.now(),
            propagationStatus: 'synchronized' as const,
            isPropagating: false,
          };

          // Synchronize local in-memory benchmark cache
          updateBenchmarkLocalCache(event.flagId, event.value, event.version);

          const pushEvent = {
            id: `ev-ws-${Date.now()}`,
            timestamp,
            type: 'update' as const,
            component: 'client_sdk' as ComponentId,
            message: `[REAL-TIME PUSH] Received delta over WebSocket: ${event.value ? 'ON' : 'OFF'} (v${event.version})`,
            details: `Source: ${event.source || 'REMOTE_PUSH'}. Real in-memory cache & phone client synchronized.`,
          };

          return {
            ...prev,
            flagState: nextFlag,
            events: [pushEvent, ...prev.events.slice(0, 50)],
          };
        });
      },
      (status: RealtimeConnectionStatus) => {
        setConnectionStatus(status);
        // When WebSocket reconnects, refresh flag state from GET endpoint
        if (status === 'connected' && prevConnStatusRef.current !== 'connected' && operationModeRef.current === 'live_aws') {
          handleSyncFromAws();
        }
        prevConnStatusRef.current = status;
      }
    );

    realtimeManagerRef.current = manager;
    return () => manager.disconnect();
  }, [handleSyncFromAws]);

  // Connect/disconnect WebSocket whenever operationMode changes
  useEffect(() => {
    if (realtimeManagerRef.current) {
      realtimeManagerRef.current.connect(operationMode);
    }
  }, [operationMode]);

  // Handler: Change operation mode
  const handleSelectMode = useCallback(
    (mode: LabOperationMode) => {
      setOperationMode(mode);
      if (mode === 'live_aws') {
        handleSyncFromAws();
      }
    },
    [handleSyncFromAws]
  );

  // Simulation Tick Loop: runs every 1000ms when isRunning is true
  useEffect(() => {
    if (!state.isRunning) return;

    const timer = setInterval(() => {
      // 1. Run real in-memory benchmark on evaluation hot path using performance.now()
      runEvaluationBenchmark(1000, state.flagState.phoneClientValue);

      // 2. Step the simulation state model
      setState((prev) => stepSimulation(prev));
    }, 1000);

    return () => clearInterval(timer);
  }, [state.isRunning, state.flagState.phoneClientValue]);

  // Handler: Toggle Run / Pause
  const handleToggleRunning = useCallback(() => {
    setState((prev) => ({ ...prev, isRunning: !prev.isRunning }));
  }, []);

  // Handler: Reset Simulation to clean state
  const handleReset = useCallback(() => {
    setState(createInitialSimulationState());
    updateBenchmarkLocalCache('new_checkout', false, 1);
    setCachedFlag('new_checkout', false, 1);
  }, []);

  // Handler: Select Scenario
  const handleSelectScenario = useCallback((scenarioId: ScenarioId) => {
    setState((prev) => applyScenario(prev, scenarioId));
  }, []);

  // Handler: Select Component
  const handleSelectComponent = useCallback((id: ComponentId) => {
    setState((prev) => ({ ...prev, selectedComponentId: id }));
  }, []);

  // Handler: Execute remote toggle mutation
  const executeRemoteToggle = useCallback(async () => {
    setIsAsyncToggling(true);
    const targetValue = !state.flagState.desiredValue;
    const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });

    try {
      const result = await toggleRemoteFlag(operationMode, targetValue);
      setIsAsyncToggling(false);

      if (result.success) {
        if (operationMode === 'live_aws') {
          setLastAwsMutationDurationMs(result.durationMs);
          setLiveVersion(result.flagState.version);
          setCachedFlag('new_checkout', result.flagState.value, result.flagState.version);
        }

        setState((prev) => {
          const nextFlag = {
            ...prev.flagState,
            desiredValue: result.flagState.value,
            persistedValue: result.flagState.value,
            lastPropagationTimeMs: result.durationMs,
            propagationStatus: result.propagationStatus,
            isPropagating: false,
            lastUpdated: Date.now(),
          };

          const logMsg = {
            id: `ev-remote-${Date.now()}`,
            timestamp,
            type: 'update' as const,
            component: 'config_service' as ComponentId,
            message: `[LIVE ${operationMode === 'live_aws' ? 'AWS' : 'LOCAL'}] Feature flag updated in ${result.durationMs}ms`,
            details: `Persisted to ${operationMode === 'live_aws' ? 'Amazon DynamoDB & published to SNS' : 'local durable store'}. Version v${result.flagState.version}.`,
          };

          return {
            ...prev,
            flagState: nextFlag,
            events: [logMsg, ...prev.events.slice(0, 50)],
          };
        });
      } else {
        if (result.statusCode === 401 && operationMode === 'live_aws') {
          setAdminKeyPromptReason('AWS API Gateway returned 401 Unauthorized: Invalid or missing x-admin-key header.');
          setIsAdminKeyModalOpen(true);
        }

        setState((prev) => {
          const errorEvent = {
            id: `ev-err-${Date.now()}`,
            timestamp,
            type: 'error' as const,
            component: 'config_service' as ComponentId,
            message: `[LIVE ${operationMode === 'live_aws' ? 'AWS' : 'LOCAL'} ERROR] ${result.error || 'Request failed'}`,
            details: `Mutation aborted after ${result.durationMs}ms. Serving cached flag value.`,
          };

          return {
            ...prev,
            flagState: {
              ...prev.flagState,
              propagationStatus: result.propagationStatus,
              isPropagating: false,
            },
            events: [errorEvent, ...prev.events.slice(0, 50)],
          };
        });
      }
    } catch (err: any) {
      setIsAsyncToggling(false);
      setState((prev) => {
        const errorEvent = {
          id: `ev-err-${Date.now()}`,
          timestamp,
          type: 'error' as const,
          component: 'config_service' as ComponentId,
          message: `Network communication error to ${operationMode}: ${err?.message || 'Connection refused'}`,
          details: `Is the backend running? Ensure local server or AWS endpoint is available.`,
        };
        return {
          ...prev,
          events: [errorEvent, ...prev.events.slice(0, 50)],
        };
      });
    }
  }, [operationMode, state.flagState.desiredValue]);

  // Handler: Toggle Feature Flag (Dual-Mode: Simulation vs Local Backend vs Live AWS)
  const handleToggleFlag = useCallback(async () => {
    if (operationMode === 'simulation') {
      // 100% In-Browser Simulation
      setState((prev) => toggleFeatureFlag(prev));
      return;
    }

    if (operationMode === 'live_aws' && !hasInMemoryAdminKey()) {
      setAdminKeyPromptReason('AWS Flag Mutation requires your Admin API Key. Enter the key configured during SAM deployment to authorize the write.');
      setPendingToggleOnAuth(true);
      setIsAdminKeyModalOpen(true);
      return;
    }

    await executeRemoteToggle();
  }, [operationMode, executeRemoteToggle]);

  const handleAdminKeyModalSuccess = useCallback(() => {
    if (pendingToggleOnAuth) {
      setPendingToggleOnAuth(false);
      executeRemoteToggle();
    }
  }, [pendingToggleOnAuth, executeRemoteToggle]);

  // Handler: Toggle Component Failure
  const handleToggleFailure = useCallback((id: ComponentId) => {
    setState((prev) => toggleComponentFailure(prev, id));
  }, []);

  // Handler: Change Component Capacity
  const handleChangeCapacity = useCallback((id: ComponentId, capacity: number) => {
    setState((prev) => updateComponentCapacity(prev, id, capacity));
  }, []);

  // Handler: Traffic Controls
  const handleChangeOfferedLoad = useCallback((val: number) => {
    setState((prev) => ({ ...prev, offeredLoad: val }));
  }, []);

  const handleChangeClients = useCallback((val: number) => {
    setState((prev) => ({ ...prev, concurrentClients: val }));
  }, []);

  const handleChangeNetworkDelay = useCallback((val: number) => {
    setState((prev) => ({ ...prev, networkDelayMs: val }));
  }, []);

  // Handler: Clear Event Log
  const handleClearEvents = useCallback(() => {
    setState((prev) => ({ ...prev, events: [] }));
  }, []);

  const selectedComponent = state.selectedComponentId
    ? state.components[state.selectedComponentId]
    : null;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* 1. TOP BAR */}
      <TopBar
        isRunning={state.isRunning}
        onToggleRunning={handleToggleRunning}
        onReset={handleReset}
        activeScenario={state.activeScenario}
        onSelectScenario={handleSelectScenario}
        operationMode={operationMode}
        onSelectMode={handleSelectMode}
        connectionStatus={connectionStatus}
        onOpenAdminKeyModal={() => {
          setAdminKeyPromptReason('');
          setIsAdminKeyModalOpen(true);
        }}
        hasAdminKey={hasInMemoryAdminKey()}
      />

      {/* 2. SCENARIO OBSERVATION BANNER */}
      <ScenarioBanner
        activeScenario={state.activeScenario}
        onSelectScenario={handleSelectScenario}
      />

      {/* 2B. LIVE AWS STATUS & REAL MEASUREMENT BAR (When in Live AWS Mode) */}
      {operationMode === 'live_aws' && (
        <AwsLiveStatusBar
          connectionStatus={connectionStatus}
          lastAwsMutationDurationMs={lastAwsMutationDurationMs}
          liveVersion={liveVersion}
          onOpenAdminKeyModal={() => {
            setAdminKeyPromptReason('');
            setIsAdminKeyModalOpen(true);
          }}
          onRefreshFromAws={handleSyncFromAws}
          isRefreshing={isAwsRefreshing}
        />
      )}

      {/* 3. MAIN WORKSPACE (Sidebar + Architecture Canvas + Right Phone & Controls) */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden border-b border-slate-200">
        {/* LEFT SIDEBAR: 10 Components */}
        <div className="w-full lg:w-64 xl:w-72 shrink-0 border-b lg:border-b-0 border-slate-200 bg-white">
          <Sidebar
            components={state.components}
            selectedComponentId={state.selectedComponentId}
            onSelectComponent={handleSelectComponent}
          />
        </div>

        {/* CENTER: Architecture Canvas */}
        <div className="flex-1 min-h-[460px] lg:min-h-[520px] bg-white flex flex-col border-b lg:border-b-0 lg:border-r border-slate-200 relative">
          <ArchitectureCanvas
            components={state.components}
            selectedComponentId={state.selectedComponentId}
            onSelectComponent={handleSelectComponent}
            isRunning={state.isRunning}
            isPropagating={state.flagState.isPropagating}
          />
        </div>

        {/* RIGHT SIDE: Feature Flag Toggle + Phone Preview + Inspector */}
        <div className="w-full lg:w-[350px] xl:w-[380px] shrink-0 bg-slate-50/60 p-4 flex flex-col space-y-3 overflow-y-auto max-h-[820px]">
          {/* Feature Flag Toggle Controls */}
          <FlagControls
            flagState={state.flagState}
            onToggleFlag={handleToggleFlag}
            operationMode={operationMode}
            isAsyncToggling={isAsyncToggling}
            onOpenAdminKeyModal={() => {
              setAdminKeyPromptReason('');
              setIsAdminKeyModalOpen(true);
            }}
            hasAdminKey={hasInMemoryAdminKey()}
            lastAwsLatencyMs={lastAwsMutationDurationMs}
          />

          {/* Component Inspector (shown for selected component) */}
          {selectedComponent && (
            <ComponentInspector
              component={selectedComponent}
              onClose={() => setState((prev) => ({ ...prev, selectedComponentId: null }))}
              onToggleFailure={handleToggleFailure}
              onChangeCapacity={handleChangeCapacity}
            />
          )}

          {/* Realistic Mobile Preview (ShopEasy App) */}
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                Mobile Preview: ShopEasy
              </span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">
                Client SDK #1
              </span>
            </div>
            <PhonePreview
              flagState={state.flagState}
              operationMode={operationMode}
            />
          </div>
        </div>
      </div>

      {/* 4. BOTTOM AREA: Traffic Controls, Main KPI Metrics, Charts, Event Log */}
      <footer className="bg-slate-50 p-4 md:p-6 space-y-4">
        {/* Traffic Controls Panel */}
        <TrafficControls
          offeredLoad={state.offeredLoad}
          concurrentClients={state.concurrentClients}
          networkDelayMs={state.networkDelayMs}
          onChangeOfferedLoad={handleChangeOfferedLoad}
          onChangeClients={handleChangeClients}
          onChangeNetworkDelay={handleChangeNetworkDelay}
        />

        {/* 7 KPI System Metrics Cards */}
        <MetricsCards
          metrics={state.metrics}
          operationMode={operationMode}
          realAwsLatencyMs={lastAwsMutationDurationMs}
          liveVersion={liveVersion}
        />

        {/* Live SVG Charts (Offered Load vs Throughput & Latencies) */}
        <LiveCharts history={state.metricHistory} />

        {/* Real-time System Event Log */}
        <EventLog events={state.events} onClearEvents={handleClearEvents} />

        {/* College Presentation Footer Info */}
        <div className="text-center text-xs text-slate-400 pt-2 flex flex-wrap items-center justify-center gap-4 border-t border-slate-200">
          <span>PS 28 — Low-Latency Distributed Feature Flag Service</span>
          <span>•</span>
          <span>System Design Virtual Lab</span>
          <span>•</span>
          <span>Light Theme Presentation Mode</span>
        </div>
      </footer>

      {/* Admin Key Prompt Modal (Volatile In-Memory Authorization) */}
      <AdminKeyModal
        isOpen={isAdminKeyModalOpen}
        onClose={() => {
          setIsAdminKeyModalOpen(false);
          setPendingToggleOnAuth(false);
        }}
        onSuccess={handleAdminKeyModalSuccess}
        promptReason={adminKeyPromptReason}
      />
    </div>
  );
};

export default App;
