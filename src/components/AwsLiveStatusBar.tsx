import React from 'react';
import {
  Globe,
  Radio,
  Key,
  Clock,
  Layers,
  Database,
} from 'lucide-react';
import type { RealtimeConnectionStatus } from '../types/simulation';
import { getEndpoints, hasInMemoryAdminKey } from '../services/backendClient';

interface AwsLiveStatusBarProps {
  connectionStatus: RealtimeConnectionStatus;
  lastAwsMutationDurationMs: number | null;
  liveVersion: number | null;
  onOpenAdminKeyModal: () => void;
  onRefreshFromAws: () => void;
  isRefreshing?: boolean;
}

export const AwsLiveStatusBar: React.FC<AwsLiveStatusBarProps> = ({
  connectionStatus,
  lastAwsMutationDurationMs,
  liveVersion,
  onOpenAdminKeyModal,
  onRefreshFromAws,
  isRefreshing = false,
}) => {
  const endpoints = getEndpoints('live_aws');
  const isKeySet = hasInMemoryAdminKey();
  const hasHttpEndpoint = Boolean(endpoints.httpUrl);
  const hasWsEndpoint = Boolean(endpoints.wsUrl);

  return (
    <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white px-4 py-2.5 border-b border-indigo-900/60 shadow-inner flex flex-col md:flex-row md:items-center md:justify-between gap-2.5 text-xs">
      {/* Left: AWS Stack Identity & Endpoint Connectivity */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Live Cloud Badge */}
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 font-bold text-[11px]">
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          <span>LIVE AWS CLOUD</span>
        </div>

        {/* Stack info */}
        <div className="flex items-center space-x-1 text-slate-300 text-[11px]">
          <Layers className="w-3 h-3 text-slate-400" />
          <span className="font-mono text-slate-200">system-design-virtuallab</span>
          <span className="text-slate-500">•</span>
          <span className="text-slate-400">us-east-1</span>
        </div>

        {/* HTTP API Gateway status */}
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${
              hasHttpEndpoint ? 'bg-emerald-400' : 'bg-amber-400 animate-pulse'
            }`}
          />
          <span className="text-slate-400">HTTP API:</span>
          <span className={hasHttpEndpoint ? 'text-emerald-300 font-semibold' : 'text-amber-300'}>
            {hasHttpEndpoint ? 'Connected' : 'Missing VITE_AWS_API_URL'}
          </span>
        </div>

        {/* WebSocket API Gateway status */}
        <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-slate-800/80 border border-slate-700 text-[11px]">
          <span
            className={`w-2 h-2 rounded-full ${
              connectionStatus === 'connected'
                ? 'bg-emerald-400 animate-pulse'
                : connectionStatus === 'connecting'
                ? 'bg-amber-400 animate-pulse'
                : 'bg-red-400'
            }`}
          />
          <Radio className="w-3 h-3 text-slate-400" />
          <span className="text-slate-400">WebSocket:</span>
          <span
            className={`font-semibold capitalize ${
              connectionStatus === 'connected'
                ? 'text-emerald-300'
                : connectionStatus === 'connecting'
                ? 'text-amber-300'
                : 'text-red-300'
            }`}
          >
            {hasWsEndpoint ? connectionStatus : 'Missing VITE_AWS_WS_URL'}
          </span>
        </div>
      </div>

      {/* Middle & Right: Real Measurements Strip & Admin Key Control */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        {/* Real Measured Cloud Latency Pill */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-900/60 border border-indigo-700/60 text-[11px]">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span className="text-indigo-200">Last Mutation:</span>
          <span className="font-mono font-bold text-white">
            {lastAwsMutationDurationMs !== null ? `${lastAwsMutationDurationMs}ms` : 'Ready'}
          </span>
          {liveVersion !== null && (
            <>
              <span className="text-indigo-400">•</span>
              <Database className="w-3 h-3 text-indigo-300" />
              <span className="font-mono text-indigo-200 font-bold">v{liveVersion}</span>
            </>
          )}
        </div>

        {/* Refresh button */}
        <button
          onClick={onRefreshFromAws}
          disabled={isRefreshing || !hasHttpEndpoint}
          className="px-2 py-1 text-[11px] font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-1"
          title="Query DynamoDB via GET /api/flags/new_checkout"
        >
          <span>{isRefreshing ? 'Syncing...' : 'Sync GET'}</span>
        </button>

        {/* Admin Key Button */}
        <button
          onClick={onOpenAdminKeyModal}
          className={`flex items-center space-x-1 px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all shadow-xs ${
            isKeySet
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-black animate-pulse'
          }`}
          title="Configure volatile in-memory admin API key for mutating feature flags"
        >
          <Key className="w-3.5 h-3.5" />
          <span>{isKeySet ? 'Admin Key: Loaded (RAM)' : 'Admin Key: Required'}</span>
        </button>
      </div>
    </div>
  );
};
