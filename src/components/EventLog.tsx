import React, { useState } from 'react';
import { Terminal, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import type { EventLogType, SimulationEvent } from '../types/simulation';

interface EventLogProps {
  events: SimulationEvent[];
  onClearEvents: () => void;
}

export const EventLog: React.FC<EventLogProps> = ({ events, onClearEvents }) => {
  const [filter, setFilter] = useState<'all' | 'request' | 'update' | 'error'>('all');
  const [isCollapsed, setIsCollapsed] = useState(false);

  const filteredEvents = events.filter((ev) => {
    if (filter === 'all') return true;
    if (filter === 'request') return ev.type === 'request';
    if (filter === 'update') return ev.type === 'update';
    if (filter === 'error') return ev.type === 'error' || ev.type === 'warning';
    return true;
  });

  const getBadgeStyle = (type: EventLogType) => {
    switch (type) {
      case 'request':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'update':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'error':
        return 'bg-red-50 text-red-700 border-red-200';
      case 'warning':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'recovery':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      {/* Header Bar */}
      <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Terminal className="w-4 h-4 text-slate-600" />
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
            System Event Log
          </h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-mono font-semibold">
            {filteredEvents.length}
          </span>
        </div>

        {/* Filters and Controls */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center space-x-1 bg-white p-0.5 rounded-md border border-slate-200 text-xs">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                filter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('request')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                filter === 'request' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Requests
            </button>
            <button
              onClick={() => setFilter('update')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                filter === 'update' ? 'bg-purple-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Updates
            </button>
            <button
              onClick={() => setFilter('error')}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                filter === 'error' ? 'bg-red-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Errors
            </button>
          </div>

          <button
            onClick={onClearEvents}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
            title="Clear event log"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
            title={isCollapsed ? 'Expand log' : 'Collapse log'}
          >
            {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Events Stream */}
      {!isCollapsed && (
        <div className="h-36 overflow-y-auto p-2 space-y-1.5 font-sans text-xs bg-slate-50/30">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs">
              No events found for current filter.
            </div>
          ) : (
            filteredEvents.map((ev) => (
              <div
                key={ev.id}
                className="bg-white p-2 rounded-lg border border-slate-200 flex items-start space-x-2 shadow-2xs hover:bg-slate-50/60 transition-colors"
              >
                <span className="font-mono text-[10px] text-slate-400 shrink-0 mt-0.5">
                  [{ev.timestamp}]
                </span>

                <span
                  className={`px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded border shrink-0 tracking-wide ${getBadgeStyle(
                    ev.type
                  )}`}
                >
                  {ev.type}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-800 leading-tight">
                    {ev.message}
                  </p>
                  {ev.details && (
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">
                      {ev.details}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};
