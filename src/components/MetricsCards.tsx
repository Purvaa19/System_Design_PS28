import React from 'react';
import type { SimulationMetrics, LabOperationMode } from '../types/simulation';

interface MetricsCardsProps {
  metrics: SimulationMetrics;
  operationMode?: LabOperationMode;
  realAwsLatencyMs?: number | null;
  liveVersion?: number | null;
}

export const MetricsCards: React.FC<MetricsCardsProps> = ({
  metrics,
  operationMode = 'simulation',
  realAwsLatencyMs = null,
  liveVersion = null,
}) => {
  const isLiveAws = operationMode === 'live_aws';

  return (
    <div className="space-y-1.5">
      {isLiveAws && (
        <div className="flex flex-wrap items-center justify-between px-1 text-[11px]">
          <span className="font-bold text-slate-600 uppercase tracking-wider text-[10px]">
            System Performance Metrics
          </span>
          <span className="text-[10px] font-medium text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
            Cards 1–6: Client-Side Evaluation Benchmark & Simulated Load • Card 7: Real Measured AWS Cloud RTT
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
        {/* 1. Offered Load */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Offered Load
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-black text-slate-800 tracking-tight">
              {metrics.offeredLoad.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">req/s</span>
          </div>
          <span className="text-[10px] text-blue-600 font-semibold mt-1">
            {isLiveAws ? 'Simulated Ingress' : 'Ingress arrival'}
          </span>
        </div>

        {/* 2. Successful Throughput */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Throughput
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-lg font-black tracking-tight ${metrics.successfulThroughput < metrics.offeredLoad ? 'text-amber-600' : 'text-emerald-600'}`}>
              {metrics.successfulThroughput.toLocaleString()}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">evals/s</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold mt-1">
            {isLiveAws ? 'Simulated Rate' : 'Completed'}
          </span>
        </div>

        {/* 3. Average Latency */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Avg Latency
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-lg font-black tracking-tight ${metrics.avgLatencyMs > 10 ? 'text-red-600' : metrics.avgLatencyMs > 3 ? 'text-amber-600' : 'text-blue-600'}`}>
              {metrics.avgLatencyMs}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">ms</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium mt-1">
            {isLiveAws ? 'Local SDK Hot-Path' : 'Mean path time'}
          </span>
        </div>

        {/* 4. p95 Latency */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            p95 Latency
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-lg font-black tracking-tight ${metrics.p95LatencyMs > 20 ? 'text-red-600' : metrics.p95LatencyMs > 5 ? 'text-amber-600' : 'text-slate-800'}`}>
              {metrics.p95LatencyMs}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">ms</span>
          </div>
          <span className="text-[10px] text-slate-500 font-medium mt-1">
            {isLiveAws ? 'Local 95th %ile' : '95th percentile'}
          </span>
        </div>

        {/* 5. Error Rate */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Error Rate
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-lg font-black tracking-tight ${metrics.errorRate > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
              {metrics.errorRate}%
            </span>
            <span className="text-[10px] text-slate-400 font-medium">dropped</span>
          </div>
          <span className={`text-[10px] font-semibold mt-1 ${metrics.errorRate > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
            {metrics.errorRate === 0 ? 'Zero drop' : 'Over capacity'}
          </span>
        </div>

        {/* 6. Cache Hit Ratio */}
        <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Cache Hit Ratio
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-lg font-black tracking-tight ${metrics.cacheHitRatio > 95 ? 'text-emerald-600' : 'text-red-600'}`}>
              {metrics.cacheHitRatio}%
            </span>
            <span className="text-[10px] text-slate-400 font-medium">L1 cache</span>
          </div>
          <span className="text-[10px] text-emerald-600 font-semibold mt-1">In-Memory Hash</span>
        </div>

        {/* 7. Update Propagation / Live AWS Mutation Latency */}
        <div className={`p-3 rounded-xl border shadow-xs flex flex-col justify-between ${
          isLiveAws ? 'bg-indigo-50/50 border-indigo-200' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
              {isLiveAws ? 'AWS RTT Latency' : 'Update Propagation'}
            </span>
            {isLiveAws && (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                REAL AWS
              </span>
            )}
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-lg font-black text-purple-700 tracking-tight">
              {isLiveAws && realAwsLatencyMs !== null
                ? realAwsLatencyMs
                : metrics.updatePropagationMs}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">ms</span>
          </div>
          <span className="text-[10px] text-purple-700 font-semibold mt-1">
            {isLiveAws
              ? liveVersion !== null
                ? `DynamoDB v${liveVersion} + SNS`
                : 'API Gateway RTT'
              : 'SSE broadcast'}
          </span>
        </div>
      </div>
    </div>
  );
};
