import React, { useState } from 'react';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  Smartphone,
  Gauge,
  Package,
  HardDrive,
  Cpu,
  Sliders,
  Database,
  Radio,
  Wifi,
  Activity,
} from 'lucide-react';
import type { ComponentId, SystemComponent } from '../types/simulation';

interface ArchitectureCanvasProps {
  components: Record<ComponentId, SystemComponent>;
  selectedComponentId: ComponentId | null;
  onSelectComponent: (id: ComponentId) => void;
  isRunning: boolean;
  isPropagating: boolean;
}

const COMPONENT_ICONS: Record<ComponentId, React.ReactNode> = {
  client_instances: <Smartphone className="w-4 h-4 text-blue-600" />,
  load_generator: <Gauge className="w-4 h-4 text-blue-600" />,
  client_sdk: <Package className="w-4 h-4 text-blue-600" />,
  local_flag_cache: <HardDrive className="w-4 h-4 text-blue-600" />,
  sdk_eval_engine: <Cpu className="w-4 h-4 text-blue-600" />,
  config_service: <Sliders className="w-4 h-4 text-purple-600" />,
  cloud_storage: <Database className="w-4 h-4 text-purple-600" />,
  pubsub_broker: <Radio className="w-4 h-4 text-purple-600" />,
  sse_server: <Wifi className="w-4 h-4 text-purple-600" />,
  monitoring: <Activity className="w-4 h-4 text-emerald-600" />,
};

// Fixed node dimensions for canvas layout
const NODE_WIDTH = 150;
const NODE_HEIGHT = 86;

export const ArchitectureCanvas: React.FC<ArchitectureCanvasProps> = ({
  components,
  selectedComponentId,
  onSelectComponent,
  isRunning,
  isPropagating,
}) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleZoomIn = () => setZoom((z) => Math.min(1.5, z + 0.1));
  const handleZoomOut = () => setZoom((z) => Math.max(0.65, z - 0.1));
  const handleResetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Node center coordinate helper
  const getNodeCenter = (id: ComponentId) => {
    const comp = components[id];
    return {
      x: comp.x + NODE_WIDTH / 2,
      y: comp.y + NODE_HEIGHT / 2,
    };
  };

  const cInst = getNodeCenter('client_instances');
  const cLoadGen = getNodeCenter('load_generator');
  const cSdk = getNodeCenter('client_sdk');
  const cCache = getNodeCenter('local_flag_cache');
  const cEngine = getNodeCenter('sdk_eval_engine');

  const cConfig = getNodeCenter('config_service');
  const cStorage = getNodeCenter('cloud_storage');
  const cPubSub = getNodeCenter('pubsub_broker');
  const cSse = getNodeCenter('sse_server');
  const cMon = getNodeCenter('monitoring');

  return (
    <div className="relative w-full h-full bg-slate-50/50 overflow-hidden select-none flex flex-col">
      {/* Canvas Top Bar Controls & Legend */}
      <div className="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
        {/* Flow Legend */}
        <div className="bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs flex items-center space-x-4 text-xs pointer-events-auto">
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 bg-blue-600 inline-block" />
            <span className="w-2 h-2 rounded-full bg-blue-600 inline-block" />
            <span className="font-semibold text-slate-700">Evaluation Flow</span>
            <span className="text-[11px] text-slate-400">(Sub-ms Cache Path)</span>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="w-3 h-0.5 bg-purple-600 inline-block" />
            <span className="w-2 h-2 rounded-full bg-purple-600 inline-block" />
            <span className="font-semibold text-slate-700">Config Update Flow</span>
            <span className="text-[11px] text-slate-400">(Async Push)</span>
          </div>
        </div>

        {/* Zoom & Fit Controls */}
        <div className="bg-white/95 backdrop-blur-xs p-1 rounded-lg border border-slate-200 shadow-xs flex items-center space-x-1 pointer-events-auto">
          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono px-1 text-slate-500">{Math.round(zoom * 100)}%</span>
          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <div className="w-px h-4 bg-slate-200" />
          <button
            onClick={handleResetView}
            className="p-1.5 rounded hover:bg-slate-100 text-slate-600 transition-colors"
            title="Fit to Screen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="w-full h-full flex items-center justify-center p-4">
        <svg
          viewBox="0 0 960 480"
          className="w-full h-full max-h-[560px] overflow-visible transition-transform duration-200 ease-out"
          style={{
            transform: `scale(${zoom}) translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          {/* Subtle Grid Pattern */}
          <defs>
            <pattern id="canvas-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" fill="#cbd5e1" opacity="0.45" />
            </pattern>
            {/* Arrowhead Markers */}
            <marker
              id="arrow-blue"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#2563eb" />
            </marker>
            <marker
              id="arrow-purple"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#9333ea" />
            </marker>
            <marker
              id="arrow-emerald"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#10b981" />
            </marker>
          </defs>

          {/* Canvas Background Grid */}
          <rect width="960" height="480" fill="url(#canvas-grid)" />

          {/* ZONE 1: Control Plane Area (Top) */}
          <rect
            x="190"
            y="20"
            width="735"
            height="145"
            rx="12"
            fill="#faf5ff"
            stroke="#e9d5ff"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text x="210" y="44" fill="#7e22ce" fontSize="11" fontWeight="700" letterSpacing="0.05em">
            CONFIGURATION CONTROL PLANE (PUSH-BASED CONFIGURATION PROPAGATION)
          </text>

          {/* ZONE 2: Client-side Evaluation Area (Bottom Left & Center) */}
          <rect
            x="20"
            y="175"
            width="725"
            height="285"
            rx="12"
            fill="#eff6ff"
            stroke="#bfdbfe"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text x="40" y="196" fill="#1d4ed8" fontSize="11" fontWeight="700" letterSpacing="0.05em">
            CLIENT-SIDE EVALUATION ZONE
          </text>
          <text x="40" y="210" fill="#3b82f6" fontSize="9" fontWeight="600" letterSpacing="0.03em">
            HOT IN-MEMORY PATH — SUB-MILLISECOND LATENCY
          </text>

          {/* ZONE 3: Monitoring Area (Bottom Right) */}
          <rect
            x="765"
            y="175"
            width="175"
            height="285"
            rx="12"
            fill="#ecfdf5"
            stroke="#a7f3d0"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />
          <text x="778" y="198" fill="#047857" fontSize="11" fontWeight="700" letterSpacing="0.05em">
            MONITORING ZONE
          </text>

          {/* ============================================================ */}
          {/* CONNECTIONS: CONFIGURATION-UPDATE FLOW (Purple Dashed Lines) */}
          {/* ============================================================ */}
          {/* Config Service -> Cloud Storage */}
          <line
            x1={cConfig.x + NODE_WIDTH / 2}
            y1={cConfig.y}
            x2={cStorage.x - NODE_WIDTH / 2}
            y2={cStorage.y}
            stroke="#9333ea"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            markerEnd="url(#arrow-purple)"
            className={isRunning || isPropagating ? 'flow-line-purple' : ''}
          />
          {/* Cloud Storage -> Pub/Sub Broker */}
          <line
            x1={cStorage.x + NODE_WIDTH / 2}
            y1={cStorage.y}
            x2={cPubSub.x - NODE_WIDTH / 2}
            y2={cPubSub.y}
            stroke="#9333ea"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            markerEnd="url(#arrow-purple)"
            className={isRunning || isPropagating ? 'flow-line-purple' : ''}
          />
          {/* Pub/Sub Broker -> SSE Update Server */}
          <line
            x1={cPubSub.x + NODE_WIDTH / 2}
            y1={cPubSub.y}
            x2={cSse.x - NODE_WIDTH / 2}
            y2={cSse.y}
            stroke="#9333ea"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            markerEnd="url(#arrow-purple)"
            className={isRunning || isPropagating ? 'flow-line-purple' : ''}
          />
          {/* 1. SSE Update Server -> Client SDK (Push configuration event down to client) */}
          <path
            d={`M ${cSse.x} ${cSse.y + NODE_HEIGHT / 2} C ${cSse.x} 185, ${cSdk.x} 185, ${cSdk.x} ${cSdk.y - NODE_HEIGHT / 2}`}
            fill="none"
            stroke="#9333ea"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            markerEnd="url(#arrow-purple)"
            className={isRunning || isPropagating ? 'flow-line-purple' : ''}
          />
          {/* 2. Client SDK -> Local Flag Cache (Cache update/write) */}
          <path
            d={`M ${cSdk.x + NODE_WIDTH / 2} ${cSdk.y - 18} C ${cSdk.x + NODE_WIDTH / 2 + 14} ${cSdk.y - 18}, ${cCache.x - NODE_WIDTH / 2 - 14} ${cCache.y + 18}, ${cCache.x - NODE_WIDTH / 2} ${cCache.y + 18}`}
            fill="none"
            stroke="#9333ea"
            strokeWidth="2.5"
            strokeDasharray="6 6"
            markerEnd="url(#arrow-purple)"
            className={isRunning || isPropagating ? 'flow-line-purple' : ''}
          />

          {/* ============================================================ */}
          {/* CONNECTIONS: EVALUATION FLOW (Blue Lines) */}
          {/* ============================================================ */}
          {/* Client Instances -> Load Generator */}
          <line
            x1={cInst.x + NODE_WIDTH / 2}
            y1={cInst.y}
            x2={cLoadGen.x - NODE_WIDTH / 2}
            y2={cLoadGen.y}
            stroke="#2563eb"
            strokeWidth="2.5"
            markerEnd="url(#arrow-blue)"
            className={isRunning ? 'flow-line-blue' : ''}
          />
          {/* Load Generator -> Client SDK */}
          <line
            x1={cLoadGen.x + NODE_WIDTH / 2}
            y1={cLoadGen.y}
            x2={cSdk.x - NODE_WIDTH / 2}
            y2={cSdk.y}
            stroke="#2563eb"
            strokeWidth="2.5"
            markerEnd="url(#arrow-blue)"
            className={isRunning ? 'flow-line-blue' : ''}
          />
          {/* Client SDK -> Local Flag Cache (L1 check) */}
          <path
            d={`M ${cSdk.x + NODE_WIDTH / 2} ${cSdk.y} C ${cSdk.x + NODE_WIDTH / 2 + 14} ${cSdk.y}, ${cCache.x - NODE_WIDTH / 2 - 14} ${cCache.y - 10}, ${cCache.x - NODE_WIDTH / 2} ${cCache.y - 10}`}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            markerEnd="url(#arrow-blue)"
            className={isRunning ? 'flow-line-blue' : ''}
          />
          {/* Client SDK -> SDK Evaluation Engine */}
          <path
            d={`M ${cSdk.x + NODE_WIDTH / 2} ${cSdk.y} C ${cSdk.x + NODE_WIDTH / 2 + 14} ${cSdk.y}, ${cEngine.x - NODE_WIDTH / 2 - 14} ${cEngine.y}, ${cEngine.x - NODE_WIDTH / 2} ${cEngine.y}`}
            fill="none"
            stroke="#2563eb"
            strokeWidth="2.5"
            markerEnd="url(#arrow-blue)"
            className={isRunning ? 'flow-line-blue' : ''}
          />

          {/* ============================================================ */}
          {/* CONNECTIONS: TELEMETRY (Green Dashed Line) */}
          {/* ============================================================ */}
          <line
            x1={cEngine.x + NODE_WIDTH / 2}
            y1={cEngine.y}
            x2={cMon.x - NODE_WIDTH / 2}
            y2={cMon.y}
            stroke="#10b981"
            strokeWidth="2"
            strokeDasharray="4 4"
            markerEnd="url(#arrow-emerald)"
          />

          {/* ============================================================ */}
          {/* NODES RENDERING */}
          {/* ============================================================ */}
          {Object.values(components).map((comp) => {
            const isSelected = selectedComponentId === comp.id;
            let statusBorder = 'stroke-slate-300';
            let statusBg = '#ffffff';

            if (comp.isFailed) {
              statusBorder = 'stroke-red-500 stroke-2';
              statusBg = '#fef2f2';
            } else if (comp.health === 'warning') {
              statusBorder = 'stroke-amber-500 stroke-2';
              statusBg = '#fffbeb';
            } else if (isSelected) {
              statusBorder = 'stroke-blue-500 stroke-2';
            }

            // Utilization color
            let utilBarColor = '#10b981'; // Green
            if (comp.utilization > 90) utilBarColor = '#ef4444'; // Red
            else if (comp.utilization > 70) utilBarColor = '#f59e0b'; // Amber

            return (
              <g
                key={comp.id}
                transform={`translate(${comp.x}, ${comp.y})`}
                onClick={() => onSelectComponent(comp.id)}
                className="cursor-pointer group"
              >
                {/* Selection Glow / Drop Shadow */}
                {isSelected && (
                  <rect
                    x="-4"
                    y="-4"
                    width={NODE_WIDTH + 8}
                    height={NODE_HEIGHT + 8}
                    rx="12"
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="2.5"
                    strokeDasharray="6 3"
                    className="animate-pulse"
                  />
                )}

                {/* Node Box */}
                <rect
                  x="0"
                  y="0"
                  width={NODE_WIDTH}
                  height={NODE_HEIGHT}
                  rx="8"
                  fill={statusBg}
                  className={`filter drop-shadow-xs transition-colors duration-150 ${statusBorder}`}
                  strokeWidth="1.5"
                />

                {/* Node Header: Icon & Name */}
                <foreignObject x="8" y="6" width={NODE_WIDTH - 16} height="32">
                  <div className="flex items-center space-x-1.5 overflow-hidden">
                    <span className="shrink-0">{COMPONENT_ICONS[comp.id]}</span>
                    <span className="text-[11px] font-bold text-slate-800 truncate" title={comp.name}>
                      {comp.name}
                    </span>
                  </div>
                </foreignObject>

                {/* Health Status Indicator Dot */}
                <circle
                  cx={NODE_WIDTH - 14}
                  cy="14"
                  r="4"
                  fill={comp.isFailed ? '#ef4444' : comp.health === 'warning' ? '#f59e0b' : '#10b981'}
                />

                {/* Incoming Load & Latency */}
                <text x="10" y="52" fill="#475569" fontSize="10" fontWeight="600">
                  {comp.incomingLoad.toLocaleString()} <tspan fill="#94a3b8" fontSize="9">req/s</tspan>
                </text>
                <text x={NODE_WIDTH - 10} y="52" textAnchor="end" fill="#64748b" fontSize="9" fontWeight="500">
                  {comp.currentLatencyMs}ms
                </text>

                {/* Utilization Progress Bar */}
                <rect x="10" y="60" width={NODE_WIDTH - 20} height="5" rx="2.5" fill="#e2e8f0" />
                <rect
                  x="10"
                  y="60"
                  width={Math.max(2, ((NODE_WIDTH - 20) * comp.utilization) / 100)}
                  height="5"
                  rx="2.5"
                  fill={utilBarColor}
                />

                {/* Utilization text & Queue indicator */}
                <text x="10" y="77" fill="#64748b" fontSize="8.5">
                  Util: <tspan fontWeight="700" fill={comp.utilization > 80 ? '#b45309' : '#334155'}>{comp.utilization}%</tspan>
                </text>

                {comp.queueDepth > 0 && (
                  <text
                    x={NODE_WIDTH - 10}
                    y="77"
                    textAnchor="end"
                    fill="#b45309"
                    fontSize="8.5"
                    fontWeight="700"
                  >
                    Q: {comp.queueDepth}
                  </text>
                )}

                {comp.isFailed && (
                  <rect
                    x="2"
                    y="2"
                    width={NODE_WIDTH - 4}
                    height={NODE_HEIGHT - 4}
                    rx="6"
                    fill="rgba(239, 68, 68, 0.12)"
                  />
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
