import React from 'react';
import {
  X,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Sliders,
  RotateCcw,
} from 'lucide-react';
import type { ComponentId, SystemComponent } from '../types/simulation';

interface ComponentInspectorProps {
  component: SystemComponent | null;
  onClose: () => void;
  onToggleFailure: (id: ComponentId) => void;
  onChangeCapacity: (id: ComponentId, capacity: number) => void;
}

export const ComponentInspector: React.FC<ComponentInspectorProps> = ({
  component,
  onClose,
  onToggleFailure,
  onChangeCapacity,
}) => {
  if (!component) return null;

  const isFailed = component.isFailed;
  const isWarning = component.health === 'warning';

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3.5 mb-3">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <div className="p-1 rounded-md bg-blue-50 text-blue-600 border border-blue-200">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-900 tracking-tight">
              {component.name}
            </h3>
            <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
              {component.category.replace('_', ' ')} Layer
            </span>
          </div>
        </div>

        {/* Health status pill and close button */}
        <div className="flex items-center space-x-1.5">
          {isFailed ? (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-700">
              <XCircle className="w-3 h-3 text-red-600" />
              <span>FAILED</span>
            </span>
          ) : isWarning ? (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-700">
              <AlertTriangle className="w-3 h-3 text-amber-600" />
              <span>OVERLOADED</span>
            </span>
          ) : (
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
              <span>HEALTHY</span>
            </span>
          )}

          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors ml-1"
            title="Close inspector"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Purpose Description */}
      <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs text-slate-600 leading-relaxed">
        <strong>Role: </strong> {component.purpose}
      </div>

      {/* Live State Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-[10px] text-slate-400 font-bold block uppercase">Incoming Load</span>
          <span className="text-sm font-black text-slate-800">
            {component.incomingLoad.toLocaleString()} <span className="text-[10px] font-medium text-slate-400">req/s</span>
          </span>
        </div>

        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-[10px] text-slate-400 font-bold block uppercase">Processing Latency</span>
          <span className="text-sm font-black text-slate-800">
            {component.currentLatencyMs} <span className="text-[10px] font-medium text-slate-400">ms</span>
          </span>
        </div>

        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-[10px] text-slate-400 font-bold block uppercase">Utilization</span>
          <span className={`text-sm font-black ${component.utilization > 80 ? 'text-amber-600' : 'text-slate-800'}`}>
            {component.utilization}%
          </span>
          <div className="w-full bg-slate-200 h-1.5 rounded-full mt-1 overflow-hidden">
            <div
              className={`h-full ${component.utilization > 90 ? 'bg-red-500' : component.utilization > 70 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${Math.min(100, component.utilization)}%` }}
            />
          </div>
        </div>

        <div className="p-2 rounded-lg bg-slate-50 border border-slate-200">
          <span className="text-[10px] text-slate-400 font-bold block uppercase">Queue Depth</span>
          <span className={`text-sm font-black ${component.queueDepth > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
            {component.queueDepth} <span className="text-[10px] font-medium text-slate-400">/ {component.maxQueueDepth}</span>
          </span>
        </div>
      </div>

      {/* Capacity Tuning Slider */}
      <div className="space-y-1.5 pt-1">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">Configured Capacity:</span>
          <div className="flex items-center space-x-2">
            <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
              {component.capacity.toLocaleString()} req/s
            </span>
            {component.capacity !== component.defaultCapacity && (
              <button
                onClick={() => onChangeCapacity(component.id, component.defaultCapacity)}
                className="text-[10px] text-blue-600 hover:underline flex items-center"
                title="Reset to default capacity"
              >
                <RotateCcw className="w-2.5 h-2.5 mr-0.5" />
                Reset
              </button>
            )}
          </div>
        </div>
        <input
          type="range"
          min={200}
          max={15000}
          step={200}
          value={component.capacity}
          onChange={(e) => onChangeCapacity(component.id, Number(e.target.value))}
          className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-400">
          <span>200 req/s</span>
          <span>Default: {component.defaultCapacity.toLocaleString()}</span>
          <span>15,000 req/s</span>
        </div>
      </div>

      {/* Failure Injection & Recovery Control */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-600">Simulate Fault:</span>
        <button
          onClick={() => onToggleFailure(component.id)}
          className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all shadow-xs flex items-center space-x-1.5 ${
            isFailed
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
              : 'bg-red-50 hover:bg-red-100 border border-red-300 text-red-700'
          }`}
        >
          {isFailed ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Restore Component</span>
            </>
          ) : (
            <>
              <XCircle className="w-3.5 h-3.5" />
              <span>Fail Component</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
