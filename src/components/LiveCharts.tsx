import React from 'react';
import type { MetricHistoryPoint } from '../types/simulation';

interface LiveChartsProps {
  history: MetricHistoryPoint[];
}

export const LiveCharts: React.FC<LiveChartsProps> = ({ history }) => {
  const pointsCount = history.length;
  if (pointsCount < 2) return null;

  // Chart dimensions
  const width = 450;
  const height = 110;
  const padding = { top: 10, right: 12, bottom: 20, left: 45 };

  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  // Chart 1: Load vs Throughput
  const maxLoad = Math.max(2000, ...history.map((p) => Math.max(p.offeredLoad, p.throughput))) * 1.15;
  const getX = (idx: number) => padding.left + (idx / (pointsCount - 1)) * chartW;
  const getYLoad = (val: number) => padding.top + chartH - (val / maxLoad) * chartH;

  const offeredPath = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYLoad(p.offeredLoad)}`)
    .join(' ');

  const throughputPath = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYLoad(p.throughput)}`)
    .join(' ');

  const throughputArea = `${throughputPath} L ${getX(pointsCount - 1)} ${padding.top + chartH} L ${getX(0)} ${padding.top + chartH} Z`;

  // Chart 2: Average Latency vs p95 Latency
  const maxLatency = Math.max(5, ...history.map((p) => Math.max(p.avgLatency, p.p95Latency))) * 1.25;
  const getYLat = (val: number) => padding.top + chartH - (val / maxLatency) * chartH;

  const avgLatPath = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYLat(p.avgLatency)}`)
    .join(' ');

  const p95LatPath = history
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getYLat(p.p95Latency)}`)
    .join(' ');

  const latest = history[history.length - 1];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {/* Chart 1: Offered Load vs Throughput */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h4 className="text-xs font-bold text-slate-800">Offered Load vs Throughput</h4>
            <span className="text-[10px] text-slate-400">Plateaus when capacity is saturated (Simulated)</span>
          </div>
          <div className="flex items-center space-x-3 text-[11px]">
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-blue-500 rounded" />
              <span className="text-slate-600 font-medium">Offered:</span>
              <span className="font-bold text-blue-600">{latest.offeredLoad.toLocaleString()}</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-emerald-500 rounded" />
              <span className="text-slate-600 font-medium">Throughput:</span>
              <span className="font-bold text-emerald-600">{latest.throughput.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* SVG Chart */}
        <div className="w-full">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 overflow-visible">
            {/* Horizontal Grid lines */}
            <line
              x1={padding.left}
              y1={padding.top}
              x2={width - padding.right}
              y2={padding.top}
              stroke="#f1f5f9"
              strokeDasharray="2 2"
            />
            <line
              x1={padding.left}
              y1={padding.top + chartH / 2}
              x2={width - padding.right}
              y2={padding.top + chartH / 2}
              stroke="#f1f5f9"
              strokeDasharray="2 2"
            />
            <line
              x1={padding.left}
              y1={padding.top + chartH}
              x2={width - padding.right}
              y2={padding.top + chartH}
              stroke="#e2e8f0"
            />

            {/* Y axis labels */}
            <text x={padding.left - 6} y={padding.top + 8} textAnchor="end" fill="#94a3b8" fontSize="9">
              {Math.round(maxLoad).toLocaleString()}
            </text>
            <text x={padding.left - 6} y={padding.top + chartH} textAnchor="end" fill="#94a3b8" fontSize="9">
              0
            </text>

            {/* Area Fill for throughput */}
            <path d={throughputArea} fill="rgba(16, 185, 129, 0.08)" />

            {/* Lines */}
            <path d={offeredPath} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="3 2" />
            <path d={throughputPath} fill="none" stroke="#10b981" strokeWidth="2" />
          </svg>
        </div>
      </div>

      {/* Chart 2: Average Latency vs p95 Tail Latency */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
        <div className="flex items-center justify-between mb-1">
          <div>
            <h4 className="text-xs font-bold text-slate-800">Average Latency vs p95 Latency</h4>
            <span className="text-[10px] text-slate-400">Sub-ms cache lookup vs queue delays (Simulated)</span>
          </div>
          <div className="flex items-center space-x-3 text-[11px]">
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-amber-500 rounded" />
              <span className="text-slate-600 font-medium">Avg:</span>
              <span className="font-bold text-amber-600">{latest.avgLatency}ms</span>
            </div>
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-1 bg-red-500 rounded" />
              <span className="text-slate-600 font-medium">p95:</span>
              <span className="font-bold text-red-600">{latest.p95Latency}ms</span>
            </div>
          </div>
        </div>

        {/* SVG Chart */}
        <div className="w-full">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-24 overflow-visible">
            {/* Horizontal Grid lines */}
            <line
              x1={padding.left}
              y1={padding.top}
              x2={width - padding.right}
              y2={padding.top}
              stroke="#f1f5f9"
              strokeDasharray="2 2"
            />
            <line
              x1={padding.left}
              y1={padding.top + chartH / 2}
              x2={width - padding.right}
              y2={padding.top + chartH / 2}
              stroke="#f1f5f9"
              strokeDasharray="2 2"
            />
            <line
              x1={padding.left}
              y1={padding.top + chartH}
              x2={width - padding.right}
              y2={padding.top + chartH}
              stroke="#e2e8f0"
            />

            {/* Y axis labels */}
            <text x={padding.left - 6} y={padding.top + 8} textAnchor="end" fill="#94a3b8" fontSize="9">
              {Math.round(maxLatency)}ms
            </text>
            <text x={padding.left - 6} y={padding.top + chartH} textAnchor="end" fill="#94a3b8" fontSize="9">
              0ms
            </text>

            {/* Lines */}
            <path d={avgLatPath} fill="none" stroke="#f59e0b" strokeWidth="2" />
            <path d={p95LatPath} fill="none" stroke="#ef4444" strokeWidth="2" />
          </svg>
        </div>
      </div>
    </div>
  );
};
