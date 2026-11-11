import React from 'react';
import { Gauge } from 'lucide-react';

interface TrafficControlsProps {
  offeredLoad: number;
  concurrentClients: number;
  networkDelayMs: number;
  onChangeOfferedLoad: (val: number) => void;
  onChangeClients: (val: number) => void;
  onChangeNetworkDelay: (val: number) => void;
}

export const TrafficControls: React.FC<TrafficControlsProps> = ({
  offeredLoad,
  concurrentClients,
  networkDelayMs,
  onChangeOfferedLoad,
  onChangeClients,
  onChangeNetworkDelay,
}) => {
  const setPreset = (load: number, clients: number, delay: number = 0) => {
    onChangeOfferedLoad(load);
    onChangeClients(clients);
    onChangeNetworkDelay(delay);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
      {/* Header and Quick Presets */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
            <Gauge className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              Traffic Controls & Ingress Rate
            </h3>
            <p className="text-[11px] text-slate-500">
              Tune workload dynamically to test component bottlenecks
            </p>
          </div>
        </div>

        {/* Quick Presets */}
        <div className="flex items-center space-x-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setPreset(250, 200, 0)}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
              offeredLoad <= 500 ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Low Load (250)
          </button>
          <button
            onClick={() => setPreset(1500, 1000, 0)}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
              offeredLoad === 1500 ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Normal (1,500)
          </button>
          <button
            onClick={() => setPreset(4500, 3000, 10)}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
              offeredLoad === 4500 ? 'bg-white text-orange-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            High (4,500)
          </button>
          <button
            onClick={() => setPreset(8500, 5000, 25)}
            className={`px-2 py-1 text-[11px] font-semibold rounded transition-colors ${
              offeredLoad >= 8000 ? 'bg-white text-red-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Overload (8,500)
          </button>
        </div>
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Slider 1: Request Rate */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <span>Offered Request Rate:</span>
            </span>
            <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
              {offeredLoad.toLocaleString()} req/s
            </span>
          </div>
          <input
            type="range"
            min={100}
            max={10000}
            step={100}
            value={offeredLoad}
            onChange={(e) => onChangeOfferedLoad(Number(e.target.value))}
            className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>100 req/s</span>
            <span>5,000</span>
            <span>10,000 req/s</span>
          </div>
        </div>

        {/* Slider 2: Concurrent Clients */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <span>Concurrent Clients:</span>
            </span>
            <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              {concurrentClients.toLocaleString()}
            </span>
          </div>
          <input
            type="range"
            min={100}
            max={5000}
            step={100}
            value={concurrentClients}
            onChange={(e) => onChangeClients(Number(e.target.value))}
            className="w-full accent-slate-700 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>100 clients</span>
            <span>2,500</span>
            <span>5,000 clients</span>
          </div>
        </div>

        {/* Slider 3: Network Delay */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center space-x-1.5">
              <span>Simulated Network Delay:</span>
            </span>
            <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
              +{networkDelayMs} ms
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={networkDelayMs}
            onChange={(e) => onChangeNetworkDelay(Number(e.target.value))}
            className="w-full accent-slate-700 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-400">
            <span>0 ms (Localhost)</span>
            <span>50 ms</span>
            <span>100 ms (WAN)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
