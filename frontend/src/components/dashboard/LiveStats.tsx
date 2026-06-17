import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { PhoneCall, Layers, AlertTriangle, Clock, UserCheck, ShieldAlert, Loader2 } from 'lucide-react';
import api from '../../lib/axios';

export default function LiveStats() {
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'live-stats'],
    queryFn: async () => {
      const res = await api.get('/dashboard/live-stats');
      return res.data.data;
    },
    refetchInterval: 10000, // Polling fallback if SSE drops
  });

  if (isLoading) {
    return (
      <div className="h-full min-h-[300px] flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6">
        <div className="flex flex-col items-center gap-2 text-zinc-550 text-xs">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span>Syncing queue stats...</span>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="h-full min-h-[300px] flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6 text-red-400 text-xs text-center">
        <AlertTriangle className="h-5 w-5 mx-auto mb-2 text-red-500" />
        Failed to load live metrics.
      </div>
    );
  }

  const isAbandonmentHigh = stats.abandonmentRate > 3.0;

  const kpis = [
    {
      id: 'inprogress',
      label: 'Calls in Progress',
      value: stats.callsInProgress,
      icon: PhoneCall,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/5',
      borderColor: 'border-blue-500/10',
    },
    {
      id: 'queue',
      label: 'Calls in Queue',
      value: stats.callsInQueue,
      icon: Layers,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/5',
      borderColor: 'border-indigo-500/10',
    },
    {
      id: 'abandonment',
      label: 'Abandonment Rate',
      value: `${stats.abandonmentRate}%`,
      icon: AlertTriangle,
      color: isAbandonmentHigh ? 'text-red-400' : 'text-emerald-400',
      bgColor: isAbandonmentHigh ? 'bg-red-950/20' : 'bg-emerald-500/5',
      borderColor: isAbandonmentHigh ? 'border-red-500/40' : 'border-emerald-500/10',
      warning: isAbandonmentHigh,
    },
    {
      id: 'waittime',
      label: 'Avg Wait Time',
      value: `${stats.avgWaitTime}s`,
      icon: Clock,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/5',
      borderColor: 'border-amber-500/10',
    },
    {
      id: 'connects',
      label: 'Connects (Hour)',
      value: stats.connectsThisHour,
      icon: UserCheck,
      color: 'text-sky-400',
      bgColor: 'bg-sky-500/5',
      borderColor: 'border-sky-500/10',
    },
    {
      id: 'dncblocks',
      label: 'DNC Blocks Today',
      value: stats.dncBlocksToday,
      icon: ShieldAlert,
      color: 'text-rose-400',
      bgColor: 'bg-rose-500/5',
      borderColor: 'border-rose-500/10',
    },
  ];

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-3xl space-y-4 h-full flex flex-col justify-between">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-bold text-zinc-200">Live Queue Monitor</h3>
          <p className="text-[10px] text-zinc-500">Real-time campaigns KPI scoreboard.</p>
        </div>
        <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
          Live Connected
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 flex-1 mt-2">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.id}
              className={`p-4 rounded-2xl border flex flex-col justify-between transition-all relative overflow-hidden ${kpi.bgColor} ${kpi.borderColor} ${
                kpi.warning ? 'ring-1 ring-red-500/30' : ''
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider max-w-[100px] leading-tight">
                  {kpi.label}
                </span>
                <Icon className={`h-4.5 w-4.5 ${kpi.color} shrink-0`} />
              </div>

              <div className="mt-4 flex items-baseline gap-1.5">
                <span className={`text-2xl font-bold font-mono tracking-tight text-zinc-100`}>
                  {kpi.value}
                </span>
                {kpi.warning && (
                  <span className="text-[9px] font-bold text-red-500 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded uppercase">
                    &gt; 3% limit
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
