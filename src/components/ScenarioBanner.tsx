import React from 'react';
import { Info, AlertTriangle, Play } from 'lucide-react';
import type { ScenarioDefinition, ScenarioId } from '../types/simulation';

interface ScenarioBannerProps {
  activeScenario: ScenarioId;
  onSelectScenario: (scenario: ScenarioId) => void;
}

export const SCENARIOS: Record<ScenarioId, ScenarioDefinition> = {
  normal: {
    id: 'normal',
    title: '1. Normal Operation',
    tagline: 'Local cache evaluation at ~1.1ms with healthy push propagation.',
    description: 'Clients evaluate flags instantly using the in-memory cache without hitting cloud storage.',
    expectedObservation: 'Observation: Normal evaluations take ~1.1ms directly from SDK cache. Flag toggles reach phone preview in ~25ms via SSE.',
  },
  spike: {
    id: 'spike',
    title: '2. Traffic Spike',
    tagline: 'Offered load surges to 7,500 req/s, exceeding Evaluation Engine capacity (6,000 req/s).',
    description: 'Generates heavy evaluation traffic to show the first component that reaches capacity.',
    expectedObservation: 'Observation: Evaluation Engine queue grows, utilization hits 100%, and latency spikes while control plane remains idle.',
  },
  pubsub_failure: {
    id: 'pubsub_failure',
    title: '3. Pub/Sub Failure',
    tagline: 'Pub/Sub Broker down. Toggling flag persists in DB but cannot broadcast to SSE.',
    description: 'Demonstrates decoupled failure domain: config propagation stalls while cached evaluations run unaffected.',
    expectedObservation: 'Observation: Phone preview stays on old UI (stale flag), but all 1,500 evals/sec continue serving fast from local cache!',
  },
  storage_failure: {
    id: 'storage_failure',
    title: '4. Storage Failure',
    tagline: 'Cloud Configuration Storage fails. New flag writes are rejected at the control plane.',
    description: 'Demonstrates resilient edge read path when control-plane persistence is broken.',
    expectedObservation: 'Observation: Flag mutations fail with error in Event Log, yet all client evaluations continue uninterrupted.',
  },
};

export const ScenarioBanner: React.FC<ScenarioBannerProps> = ({ activeScenario, onSelectScenario }) => {
  const current = SCENARIOS[activeScenario];

  return (
    <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-2.5 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-gradient-to-r from-blue-50/40 via-white to-slate-50">
      <div className="flex items-center space-x-3 text-xs">
        <div className="px-2 py-1 rounded bg-blue-100 text-blue-800 font-bold uppercase tracking-wider text-[11px] shrink-0 flex items-center space-x-1">
          <Info className="w-3.5 h-3.5 mr-1" />
          Active Scenario
        </div>
        <div>
          <span className="font-bold text-slate-900 mr-2">{current.title}:</span>
          <span className="text-slate-600 hidden sm:inline">{current.tagline}</span>
        </div>
      </div>

      <div className="flex items-center space-x-2 w-full md:w-auto">
        <button
          onClick={() => onSelectScenario(activeScenario)}
          className="px-2.5 py-1 text-xs font-bold rounded-md bg-blue-600 text-white hover:bg-blue-700 shadow-xs flex items-center space-x-1 shrink-0"
          title="Re-run active scenario"
        >
          <Play className="w-3 h-3 fill-white" />
          <span>Run Scenario</span>
        </button>

        <div className="text-xs bg-amber-50 text-amber-900 border border-amber-200/80 px-3 py-1.5 rounded-lg flex items-center space-x-2 flex-1 md:flex-initial shadow-xs">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="font-medium text-[11px]">{current.expectedObservation}</span>
        </div>
      </div>
    </div>
  );
};
