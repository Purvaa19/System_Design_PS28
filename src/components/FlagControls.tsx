import React, { useState, useEffect } from 'react';
import { ToggleLeft, ToggleRight, AlertCircle, CheckCircle2, Clock, Loader2, Key, Zap, RotateCcw } from 'lucide-react';
import type { FlagState, LabOperationMode } from '../types/simulation';
import {
  subscribeCacheStats,
  runSdkBenchmark,
  clearCache,
  getCacheStats,
  peekCachedFlag,
  type CacheStats,
  type SdkBenchmarkResult,
  type CachedFlagState,
} from '../services/flagCacheEngine';

interface FlagControlsProps {
  flagState: FlagState;
  onToggleFlag: () => void;
  operationMode?: LabOperationMode;
  isAsyncToggling?: boolean;
  onOpenAdminKeyModal?: () => void;
  hasAdminKey?: boolean;
  lastAwsLatencyMs?: number | null;
}

export const FlagControls: React.FC<FlagControlsProps> = ({
  flagState,
  onToggleFlag,
  operationMode = 'simulation',
  isAsyncToggling = false,
  onOpenAdminKeyModal,
  hasAdminKey = false,
  lastAwsLatencyMs = null,
}) => {
  const [cacheStats, setCacheStats] = useState<CacheStats>(() => getCacheStats());
  const [benchmarkResult, setBenchmarkResult] = useState<SdkBenchmarkResult | null>(null);
  const [isRunningBenchmark, setIsRunningBenchmark] = useState(false);
  const [cachedFlagState, setCachedFlagState] = useState<CachedFlagState>(
    () => peekCachedFlag(flagState.name || 'new_checkout').state
  );

  useEffect(() => {
    const updatePeek = () => {
      const peek = peekCachedFlag(flagState.name || 'new_checkout');
      setCachedFlagState(peek.state);
      return peek;
    };

    updatePeek();

    let expiryTimer: any = null;
    const scheduleExpiry = (expiresAt?: number) => {
      if (expiryTimer) clearTimeout(expiryTimer);
      if (expiresAt && expiresAt > Date.now()) {
        const remainingMs = Math.max(100, expiresAt - Date.now());
        expiryTimer = setTimeout(() => {
          updatePeek();
        }, remainingMs + 50);
      }
    };

    const initialPeek = updatePeek();
    scheduleExpiry(initialPeek.expiresAt);

    const unsubscribe = subscribeCacheStats((stats) => {
      setCacheStats(stats);
      const peek = updatePeek();
      scheduleExpiry(peek.expiresAt);
    });

    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      unsubscribe();
    };
  }, [flagState.name]);

  const handleRunBenchmark = async () => {
    setIsRunningBenchmark(true);
    try {
      // CHANGE 3: If cache is empty or expired, runSdkBenchmark genuinely fetches via getFlag first.
      // Zero pre-seeding from React state!
      const result = await runSdkBenchmark(10_000, flagState.name || 'new_checkout');
      setBenchmarkResult(result);
    } catch (err) {
      console.error('Benchmark execution error:', err);
    } finally {
      setIsRunningBenchmark(false);
    }
  };

  const handleClearCache = () => {
    clearCache();
    setBenchmarkResult(null);
    setCachedFlagState('EMPTY');
  };

  const isDesiredOn = flagState.desiredValue;
  const isClientOn = flagState.phoneClientValue;
  const isStale = isDesiredOn !== isClientOn;

  let propagationBadge = (
    <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
      <span>
        Synced ({operationMode === 'live_aws' && lastAwsLatencyMs !== null ? `${lastAwsLatencyMs}ms AWS` : `${flagState.lastPropagationTimeMs}ms`})
      </span>
    </span>
  );

  if (isAsyncToggling || flagState.isPropagating) {
    propagationBadge = (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
        <Clock className="w-3 h-3 text-purple-600 animate-spin" />
        <span>{operationMode === 'live_aws' ? 'Sending to AWS...' : 'Propagating...'}</span>
      </span>
    );
  } else if (isStale) {
    propagationBadge = (
      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 animate-pulse">
        <AlertCircle className="w-3 h-3 text-red-600" />
        <span>Update Blocked / Stale</span>
      </span>
    );
  }

  const handleToggleClick = () => {
    if (operationMode === 'live_aws' && !hasAdminKey && onOpenAdminKeyModal) {
      onOpenAdminKeyModal();
      return;
    }
    onToggleFlag();
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-xs mb-3">
      {/* Header and Toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
            {flagState.name}
          </span>
          {propagationBadge}
        </div>

        {/* ON / OFF Switch */}
        <button
          onClick={handleToggleClick}
          disabled={isAsyncToggling}
          className={`flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all shadow-xs ${
            isAsyncToggling
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : isDesiredOn
              ? 'bg-blue-600 text-white hover:bg-blue-700 cursor-pointer'
              : 'bg-slate-200 text-slate-700 hover:bg-slate-300 cursor-pointer'
          }`}
          title="Toggle feature flag"
        >
          {isAsyncToggling ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Sending...</span>
            </>
          ) : isDesiredOn ? (
            <>
              <ToggleRight className="w-4 h-4 text-white" />
              <span>FLAG: ON</span>
            </>
          ) : (
            <>
              <ToggleLeft className="w-4 h-4 text-slate-500" />
              <span>FLAG: OFF</span>
            </>
          )}
        </button>
      </div>

      <p className="text-xs text-slate-600 mb-2 leading-relaxed">
        {flagState.description}
      </p>

      {/* Target Mode Info Tag */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-[10px] text-slate-400">
        <span>Target Pipeline:</span>
        <span className="font-semibold text-slate-600 uppercase">
          {operationMode === 'simulation'
            ? 'Virtual Browser Simulation (Zero Cost)'
            : operationMode === 'local_backend'
            ? 'Local HTTP REST API & WebSocket Push'
            : 'AWS API Gateway + DynamoDB + SNS + WebSocket'}
        </span>
      </div>

      {operationMode === 'live_aws' && (
        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 text-[11px]">
          <span className="text-slate-500 font-medium">Write Auth:</span>
          {hasAdminKey ? (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold text-[10px] border border-emerald-200">
              <Key className="w-2.5 h-2.5" />
              <span>Admin Key In Memory</span>
            </span>
          ) : (
            <button
              onClick={onOpenAdminKeyModal}
              className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-50 text-amber-800 font-bold text-[10px] border border-amber-300 hover:bg-amber-100 transition-colors cursor-pointer"
            >
              <Key className="w-2.5 h-2.5" />
              <span>Click to Enter Admin Key</span>
            </button>
          )}
        </div>
      )}

      {/* State Synchronization Bar */}
      <div className="text-[11px] grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
        <div className="bg-slate-50 p-1.5 rounded border border-slate-200">
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Admin Desired:</span>
          <span className={`font-bold ${isDesiredOn ? 'text-blue-600' : 'text-slate-700'}`}>
            {isDesiredOn ? 'ON (New Checkout)' : 'OFF (Legacy)'}
          </span>
        </div>
        <div className={`p-1.5 rounded border ${isStale ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
          <span className="text-slate-400 block text-[10px] uppercase font-bold">Phone Client SDK:</span>
          <span className={`font-bold ${isClientOn ? 'text-blue-600' : 'text-slate-700'}`}>
            {isClientOn ? 'ON (New Checkout)' : 'OFF (Legacy)'}
          </span>
        </div>
      </div>

      {/* Real Cache Performance (Live AWS Mode) */}
      {operationMode === 'live_aws' && (
        <div className="mt-2.5 pt-2 border-t border-slate-200">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-1.5">
              <Zap className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-[11px] font-bold text-slate-700 tracking-tight">
                Real Cache Performance
              </span>
            </div>
            <span
              className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                cacheStats.lastStatus === 'HIT'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : cacheStats.lastStatus === 'MISS'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : cacheStats.lastStatus === 'UPDATED'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : cacheStats.lastStatus === 'EXPIRED'
                  ? 'bg-purple-50 text-purple-700 border-purple-200'
                  : 'bg-slate-100 text-slate-500 border-slate-200'
              }`}
            >
              {cacheStats.lastStatus}
            </span>
          </div>

          {/* Cached Flag (new_checkout): ON / OFF / EMPTY / EXPIRED (CHANGE 4) */}
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded px-2 py-1 mb-1.5 text-[11px]">
            <span className="text-slate-500 font-medium">
              Cached Flag <span className="font-mono text-[10px] text-slate-400">({flagState.name})</span>:
            </span>
            <span
              className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${
                cachedFlagState === 'ON'
                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                  : cachedFlagState === 'OFF'
                  ? 'bg-slate-100 text-slate-700 border-slate-300'
                  : cachedFlagState === 'EMPTY'
                  ? 'bg-amber-50 text-amber-700 border-amber-200'
                  : 'bg-purple-50 text-purple-700 border-purple-200'
              }`}
            >
              {cachedFlagState}
            </span>
          </div>

          {/* Metric Grid: AWS GET RTT, Local Latency, Hit Rate */}
          <div className="grid grid-cols-3 gap-1.5 text-center mb-1.5">
            <div className="bg-slate-50 border border-slate-200 rounded p-1">
              <span className="block text-[9px] text-slate-400 font-bold uppercase">AWS GET RTT</span>
              <span className="font-mono text-[11px] font-bold text-slate-800">
                {cacheStats.lastAwsGetRttMs !== undefined
                  ? `${cacheStats.lastAwsGetRttMs}ms`
                  : '—'}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded p-1">
              <span className="block text-[9px] text-slate-400 font-bold uppercase">Local Latency</span>
              <span className="font-mono text-[11px] font-bold text-blue-600">
                {benchmarkResult
                  ? `${benchmarkResult.avgLatencyUs}µs`
                  : cacheStats.lastEvaluationDurationUs !== undefined
                  ? `${cacheStats.lastEvaluationDurationUs}µs`
                  : '< 1µs'}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded p-1">
              <span className="block text-[9px] text-slate-400 font-bold uppercase">Hit Rate</span>
              <span className="font-mono text-[11px] font-bold text-emerald-600">
                {cacheStats.totalLookups > 0 ? `${cacheStats.hitRate}%` : '—'}
              </span>
            </div>
          </div>

          {/* Metric Grid: Cache Hits & Cache Misses */}
          <div className="grid grid-cols-2 gap-1.5 text-center mb-1.5">
            <div className="bg-slate-50 border border-slate-200 rounded p-1">
              <span className="block text-[9px] text-slate-400 font-bold uppercase">Cache Hits</span>
              <span className="font-mono text-[11px] font-bold text-emerald-700">
                {cacheStats.hits.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded p-1">
              <span className="block text-[9px] text-slate-400 font-bold uppercase">Cache Misses</span>
              <span className="font-mono text-[11px] font-bold text-slate-700">
                {cacheStats.misses.toLocaleString()}
              </span>
            </div>
          </div>

          {benchmarkResult && (
            <div className="mb-2 text-[10px] text-slate-600 bg-blue-50/70 border border-blue-200/60 rounded px-2 py-1 leading-snug">
              <span className="font-semibold text-blue-800">10k Test:</span>{' '}
              {benchmarkResult.evaluationCount.toLocaleString()} evaluations in{' '}
              <strong>{benchmarkResult.totalDurationMs}ms</strong> (~
              {Math.round(benchmarkResult.throughputOpsPerSec / 1000).toLocaleString()}k ops/sec)
            </div>
          )}

          {/* Action Buttons: Test Cache (10k) and Clear Cache */}
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={handleRunBenchmark}
              disabled={isRunningBenchmark}
              className="flex-1 flex items-center justify-center space-x-1 px-2 py-1 text-[10px] font-bold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 transition-colors shadow-xs cursor-pointer"
              title="Execute 10,000 real local Map evaluations to benchmark hot-path latency"
            >
              {isRunningBenchmark ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3 h-3" />
                  <span>Test Cache (10k)</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleClearCache}
              className="flex items-center justify-center space-x-1 px-2 py-1 text-[10px] font-semibold rounded bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 transition-colors cursor-pointer"
              title="Clear in-memory JavaScript Map cache and reset hit/miss counters"
            >
              <RotateCcw className="w-3 h-3 text-slate-500" />
              <span>Clear Cache</span>
            </button>
          </div>
        </div>
      )}

      {isStale && (
        <div className="mt-2 text-[11px] bg-red-50 text-red-800 border border-red-200 p-2 rounded-lg flex items-start space-x-1.5">
          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
          <span>
            <strong>Pathway Broken:</strong> Flag toggle did not reach the mobile client because a control plane component is down. Phone continues serving previously cached configuration.
          </span>
        </div>
      )}
    </div>
  );
};
