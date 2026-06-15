import { DialerStats } from '@/types/dialer';

interface DialerStatsProps {
  stats: DialerStats;
}

export function DialerStatsWidget({ stats }: DialerStatsProps) {
  const statItems = [
    {
      label: 'Calls Today',
      value: stats.calls_today,
      colorClass: 'text-zinc-100',
      bgColor: 'bg-zinc-950/60 border-zinc-800',
      icon: (
        <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 00.099.281l-.918.918A12.063 12.063 0 0014.28 17l.918-.918a1 1 0 01.282-.099l2.2-.548a1 1 0 01.282-.099L21 19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
        </svg>
      ),
    },
    {
      label: 'Contacts Reached',
      value: stats.contacts_reached,
      colorClass: 'text-emerald-400',
      bgColor: 'bg-emerald-500/5 border-emerald-500/10',
      icon: (
        <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      label: 'Interested Leads',
      value: stats.interested_leads,
      colorClass: 'text-blue-400',
      bgColor: 'bg-blue-500/5 border-blue-500/10',
      icon: (
        <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      label: 'Callbacks',
      value: stats.callbacks_scheduled,
      colorClass: 'text-amber-400',
      bgColor: 'bg-amber-500/5 border-amber-500/10',
      icon: (
        <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full bg-zinc-900 border border-zinc-800 p-5 rounded-2xl shadow-xl shadow-black/10">
      {statItems.map((item, idx) => (
        <div
          key={idx}
          className={`flex items-center justify-between p-4 rounded-xl border ${item.bgColor} transition-all duration-200 hover:-translate-y-[1px] hover:shadow-lg`}
        >
          <div className="space-y-1">
            <span className="text-[10px] text-zinc-400 font-semibold uppercase tracking-wider block">
              {item.label}
            </span>
            <span className={`text-2xl font-bold tracking-tight ${item.colorClass} block`}>
              {item.value}
            </span>
          </div>
          <div className="p-2 bg-zinc-900/80 rounded-lg border border-zinc-800">
            {item.icon}
          </div>
        </div>
      ))}
    </div>
  );
}
