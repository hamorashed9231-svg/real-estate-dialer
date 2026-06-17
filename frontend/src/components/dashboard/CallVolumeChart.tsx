import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { BarChart2, Loader2 } from 'lucide-react';
import api from '../../lib/axios';

export default function CallVolumeChart() {
  const { data: chartData = [], isLoading, error } = useQuery({
    queryKey: ['dashboard', 'calls-by-hour'],
    queryFn: async () => {
      const res = await api.get('/dashboard/calls-by-hour');
      return res.data.data;
    },
    refetchInterval: 60000, // Refetches hourly statistics every 1 minute
  });

  if (isLoading) {
    return (
      <div className="h-[300px] flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6">
        <div className="flex flex-col items-center gap-2 text-zinc-550 text-xs">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500" />
          <span>Generating call volume projections...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-[300px] flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6 text-red-450 text-xs">
        <BarChart2 className="h-5 w-5 mx-auto mb-2 text-zinc-650" />
        Failed to load volume analytics.
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-3xl space-y-4 h-full flex flex-col">
      <div>
        <h3 className="text-sm font-bold text-zinc-200">Call Volume Hourly Timeline</h3>
        <p className="text-[10px] text-zinc-500">Outbound call frequency vs answered connections.</p>
      </div>

      <div className="flex-1 w-full min-h-[220px] mt-2">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" opacity={0.3} />
            <XAxis
              dataKey="hour"
              stroke="#71717a"
              fontSize={9}
              fontWeight="bold"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              stroke="#71717a"
              fontSize={9}
              fontWeight="bold"
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#09090b',
                border: '1px solid #27272a',
                borderRadius: '16px',
                fontSize: '11px',
                color: '#f4f4f5',
              }}
              labelStyle={{ fontWeight: 'bold', color: '#60a5fa' }}
            />
            <Legend
              verticalAlign="top"
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', color: '#a1a1aa' }}
            />
            <Line
              name="Total Outbound Dialed"
              type="monotone"
              dataKey="calls"
              stroke="#3b82f6"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#3b82f6', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
            <Line
              name="Answered Connections"
              type="monotone"
              dataKey="answered"
              stroke="#10b981"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#10b981', strokeWidth: 0 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
