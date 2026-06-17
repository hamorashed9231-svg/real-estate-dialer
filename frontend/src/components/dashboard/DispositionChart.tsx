import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { PieChart as PieIcon, Loader2 } from 'lucide-react';
import api from '../../lib/axios';

const COLORS = {
  interested: '#22c55e',      // Emerald Green
  callback: '#3b82f6',        // Blue
  notInterested: '#ef4444',   // Red
  noAnswer: '#94a3b8',        // Gray
  voicemail: '#a855f7',       // Purple
  wrongNumber: '#f97316',     // Orange
  dnc: '#1e293b',             // Dark Slate
};

const LABELS = {
  interested: 'Interested',
  callback: 'Callback Scheduled',
  notInterested: 'Not Interested',
  noAnswer: 'No Answer',
  voicemail: 'Left Voicemail',
  wrongNumber: 'Wrong Number',
  dnc: 'DNC Request',
};

export default function DispositionChart() {
  const [period, setPeriod] = useState<'today' | '7days' | '30days'>('7days');

  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboard', 'disposition-stats', period],
    queryFn: async () => {
      const res = await api.get(`/dashboard/disposition-stats?period=${period}`);
      return res.data.data;
    },
    refetchInterval: 60000, // Refetches every 1 minute
  });

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6">
        <div className="flex flex-col items-center gap-2 text-zinc-550 text-xs">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span>Analyzing disposition outcomes...</span>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="h-[300px] flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6 text-red-455 text-xs">
        <PieIcon className="h-5 w-5 mx-auto mb-2 text-zinc-650" />
        Failed to load disposition outcomes.
      </div>
    );
  }

  // Calculate total calls counted in this period
  const totalCalls =
    stats.interested +
    stats.callback +
    stats.notInterested +
    stats.noAnswer +
    stats.voicemail +
    stats.wrongNumber +
    stats.dnc;

  // Format statistics object for Recharts consumption
  const chartData = Object.entries(stats)
    .map(([key, value]) => ({
      name: LABELS[key as keyof typeof LABELS] || key,
      value: value as number,
      color: COLORS[key as keyof typeof COLORS] || '#71717a',
    }))
    .filter((item) => item.value > 0); // Hide empty segments to prevent clutter

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-3xl space-y-4 h-full flex flex-col justify-between">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-sm font-bold text-zinc-200">Call Outcome Dispositions</h3>
          <p className="text-[10px] text-zinc-500">Call routing outcome status summary.</p>
        </div>

        {/* Period Selector Dropdown */}
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as any)}
          className="bg-zinc-950 border border-zinc-850 rounded-xl px-2.5 py-1.5 text-[10px] font-bold text-zinc-400 focus:outline-none"
        >
          <option value="today">Today</option>
          <option value="7days">Last 7 Days</option>
          <option value="30days">Last 30 Days</option>
        </select>
      </div>

      <div className="flex-1 flex flex-col md:flex-row items-center justify-center relative mt-2 gap-4">
        {/* Donut Chart Canvas */}
        <div className="relative h-[160px] w-[160px] shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={75}
                paddingAngle={3}
                dataKey="value"
              >
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} stroke="#18181b" strokeWidth={1} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: '#09090b',
                  border: '1px solid #27272a',
                  borderRadius: '12px',
                  fontSize: '10px',
                  color: '#f4f4f5',
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          {/* Core Total Calls Text Overlay inside Donut Hole */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-[9px] uppercase font-bold text-zinc-500 tracking-wider">Total Calls</span>
            <span className="text-xl font-bold font-mono text-zinc-100">{totalCalls}</span>
          </div>
        </div>

        {/* Custom Clean Grid Legend */}
        <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[10px] font-semibold text-zinc-400 w-full">
          {Object.entries(stats).map(([key, val]) => {
            const color = COLORS[key as keyof typeof COLORS];
            const label = LABELS[key as keyof typeof LABELS];
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="truncate max-w-[100px]">{label}:</span>
                <span className="font-mono text-zinc-200 font-bold">{val as number}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
