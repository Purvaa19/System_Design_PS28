import React from 'react';
import {
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
  CheckCircle2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import type { ComponentId, SystemComponent } from '../types/simulation';

interface SidebarProps {
  components: Record<ComponentId, SystemComponent>;
  selectedComponentId: ComponentId | null;
  onSelectComponent: (id: ComponentId) => void;
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

export const Sidebar: React.FC<SidebarProps> = ({
  components,
  selectedComponentId,
  onSelectComponent,
}) => {
  const compList = Object.values(components);

  const evalGroup = compList.filter((c) => c.category === 'evaluation');
  const controlGroup = compList.filter((c) => c.category === 'control_plane');
  const monGroup = compList.filter((c) => c.category === 'monitoring');

  const renderComponentItem = (comp: SystemComponent) => {
    const isSelected = selectedComponentId === comp.id;

    let healthBadge = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
    if (comp.isFailed) {
      healthBadge = <XCircle className="w-3.5 h-3.5 text-red-500" />;
    } else if (comp.health === 'warning') {
      healthBadge = <AlertCircle className="w-3.5 h-3.5 text-amber-500" />;
    }

    return (
      <button
        key={comp.id}
        onClick={() => onSelectComponent(comp.id)}
        className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between group ${
          isSelected
            ? 'bg-blue-50/80 border-blue-300 ring-1 ring-blue-400 shadow-xs'
            : 'bg-white hover:bg-slate-50 border-slate-200'
        }`}
      >
        <div className="flex items-center space-x-2.5 min-w-0">
          <div className="p-1.5 rounded-md bg-slate-50 border border-slate-200 group-hover:bg-white shrink-0">
            {COMPONENT_ICONS[comp.id]}
          </div>
          <div className="truncate">
            <div className="text-xs font-semibold text-slate-800 truncate flex items-center space-x-1.5">
              <span>{comp.name}</span>
            </div>
            <div className="text-[11px] text-slate-500 flex items-center space-x-2">
              <span>{comp.incomingLoad.toLocaleString()} req/s</span>
              <span>•</span>
              <span className={comp.utilization > 85 ? 'text-amber-600 font-semibold' : ''}>
                {comp.utilization}% util
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0 pl-1.5 flex flex-col items-end">
          {healthBadge}
          {comp.queueDepth > 0 && (
            <span className="mt-1 text-[10px] px-1 py-0.2 rounded bg-amber-100 text-amber-800 font-mono font-bold">
              Q:{comp.queueDepth}
            </span>
          )}
        </div>
      </button>
    );
  };

  return (
    <aside className="w-64 xl:w-72 bg-slate-50/60 border-r border-slate-200 p-3 flex flex-col h-full overflow-y-auto space-y-4">
      <div>
        <div className="flex items-center justify-between mb-2 px-1">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">
            System Components
          </h2>
          <span className="text-[11px] font-semibold text-slate-400">10 Nodes</span>
        </div>
        <p className="text-[11px] text-slate-500 px-1 mb-2">
          Click any component to inspect metrics, adjust capacity, or inject failures.
        </p>
      </div>

      {/* Group 1: Client Evaluation */}
      <div className="space-y-1.5">
        <div className="flex items-center space-x-1 px-1 text-[11px] font-bold text-blue-800 uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-blue-600 mr-1" />
          Client Evaluation (Hot Path)
        </div>
        <div className="space-y-1.5">{evalGroup.map(renderComponentItem)}</div>
      </div>

      {/* Group 2: Control Plane */}
      <div className="space-y-1.5">
        <div className="flex items-center space-x-1 px-1 text-[11px] font-bold text-purple-800 uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-purple-600 mr-1" />
          Config Control Plane
        </div>
        <div className="space-y-1.5">{controlGroup.map(renderComponentItem)}</div>
      </div>

      {/* Group 3: Monitoring */}
      <div className="space-y-1.5">
        <div className="flex items-center space-x-1 px-1 text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
          <span className="w-2 h-2 rounded-full bg-emerald-600 mr-1" />
          Telemetry & Monitoring
        </div>
        <div className="space-y-1.5">{monGroup.map(renderComponentItem)}</div>
      </div>
    </aside>
  );
};
