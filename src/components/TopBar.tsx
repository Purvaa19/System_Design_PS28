import React from 'react';
import { Play, Pause, RotateCcw, Activity, Globe, Server, Key } from 'lucide-react';
import type { ScenarioId, LabOperationMode, RealtimeConnectionStatus } from '../types/simulation';

interface TopBarProps {
  isRunning: boolean;
  onToggleRunning: () => void;
  onReset: () => void;
  activeScenario: ScenarioId;
  onSelectScenario: (scenario: ScenarioId) => void;
  operationMode: LabOperationMode;
  onSelectMode: (mode: LabOperationMode) => void;
  connectionStatus: RealtimeConnectionStatus;
  onOpenAdminKeyModal?: () => void;
  hasAdminKey?: boolean;
}

export const TopBar: React.FC<TopBarProps> = ({
  isRunning,
  onToggleRunning,
  onReset,
  activeScenario,
  onSelectScenario,
  operationMode,
  onSelectMode,
  connectionStatus,
  onOpenAdminKeyModal,
  hasAdminKey = false,
}) => {
  return (
    <header className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between sticky top-0 z-30 shadow-xs">
      {/* Brand & Project Identification */}
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
          <Activity className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              Feature Flag System Simulator
            </h1>
            <span className="px-2 py-0.5 text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 rounded-full">
              PS 28 — Distributed Systems
            </span>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            Low-Latency Evaluation & Real-Time Push Propagation Simulator
          </p>
        </div>
      </div>

      {/* Middle: Mode Switcher (Simulation vs Local Backend vs Live AWS) */}
      <div className="flex items-center space-x-1.5 bg-slate-100 p-1 rounded-lg border border-slate-200">
        <button
          onClick={() => onSelectMode('simulation')}
          className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            operationMode === 'simulation'
              ? 'bg-white text-blue-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
          title="Educational in-browser simulation (Zero AWS Cost)"
        >
          <span>Virtual Lab</span>
        </button>
        <button
          onClick={() => onSelectMode('local_backend')}
          className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            operationMode === 'local_backend'
              ? 'bg-white text-purple-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
          title="Real Local HTTP REST API & WebSocket Push Server"
        >
          <Server className="w-3 h-3" />
          <span>Local Server</span>
        </button>
        <button
          onClick={() => onSelectMode('live_aws')}
          className={`flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            operationMode === 'live_aws'
              ? 'bg-white text-emerald-700 shadow-xs font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
          title="Real AWS Cloud (API Gateway + DynamoDB + SNS + WebSocket)"
        >
          <Globe className="w-3 h-3" />
          <span>Live AWS</span>
        </button>

        {/* Real-time Connection status pill (when not in purely offline simulation) */}
        {operationMode !== 'simulation' && (
          <div className="flex items-center space-x-1 pl-1.5 pr-2 py-0.5 border-l border-slate-300 text-[11px] font-semibold">
            <span
              className={`w-2 h-2 rounded-full ${
                connectionStatus === 'connected'
                  ? 'bg-emerald-500 animate-pulse'
                  : connectionStatus === 'connecting'
                  ? 'bg-amber-500 animate-pulse'
                  : 'bg-red-500'
              }`}
            />
            <span className="text-slate-600 capitalize">{connectionStatus}</span>
          </div>
        )}

        {/* In-Memory Admin Key Status / Trigger (Live AWS Mode) */}
        {operationMode === 'live_aws' && onOpenAdminKeyModal && (
          <button
            onClick={onOpenAdminKeyModal}
            className={`flex items-center space-x-1 pl-1.5 pr-2 py-0.5 border-l border-slate-300 text-[11px] font-semibold transition-colors cursor-pointer ${
              hasAdminKey
                ? 'text-emerald-700 hover:text-emerald-800'
                : 'text-amber-700 hover:text-amber-800 font-bold animate-pulse'
            }`}
            title="Configure volatile in-memory Admin API Key for flag toggle mutation"
          >
            <Key className="w-3 h-3" />
            <span>{hasAdminKey ? 'Key: Set' : 'Key: Needed'}</span>
          </button>
        )}
      </div>

      {/* Scenarios Quick Selector (Desktop) */}
      <div className="hidden xl:flex items-center space-x-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
        <button
          onClick={() => onSelectScenario('normal')}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            activeScenario === 'normal'
              ? 'bg-white text-blue-700 shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          1. Normal
        </button>
        <button
          onClick={() => onSelectScenario('spike')}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            activeScenario === 'spike'
              ? 'bg-white text-orange-700 shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          2. Spike
        </button>
        <button
          onClick={() => onSelectScenario('pubsub_failure')}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            activeScenario === 'pubsub_failure'
              ? 'bg-white text-red-700 shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          3. Pub/Sub Fault
        </button>
        <button
          onClick={() => onSelectScenario('storage_failure')}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
            activeScenario === 'storage_failure'
              ? 'bg-white text-red-700 shadow-xs font-semibold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
          }`}
        >
          4. Storage Fault
        </button>
      </div>

      {/* Right Controls: Simulation Status, Play/Pause, Reset */}
      <div className="flex items-center space-x-2 md:space-x-3">
        {/* Status indicator */}
        <div className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200 text-xs font-medium text-slate-700">
          <span
            className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
            }`}
          />
          <span>{isRunning ? 'Running' : 'Paused'}</span>
        </div>

        {/* Start / Pause */}
        <button
          onClick={onToggleRunning}
          className={`inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
            isRunning
              ? 'bg-slate-200 hover:bg-slate-300 text-slate-800'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
          <span>{isRunning ? 'Pause' : 'Resume'}</span>
        </button>

        {/* Reset */}
        <button
          onClick={onReset}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 shadow-xs transition-colors"
          title="Reset simulation to default clean state"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset</span>
        </button>
      </div>
    </header>
  );
};
