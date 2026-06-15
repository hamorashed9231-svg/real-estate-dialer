import { Lead } from '@/types/dialer';

interface LeadCardProps {
  lead: Lead | null;
  history?: any[];
  loading: boolean;
  variant?: 'identity' | 'details';
  focusMode?: boolean;
}

export function LeadCard({ lead, history = [], loading, variant = 'identity', focusMode = false }: LeadCardProps) {
  // 1. SKELETON LOADING STATES
  if (loading && !lead) {
    if (variant === 'identity') {
      return (
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-6 items-center justify-center space-y-4 h-[180px] shadow-lg animate-pulse">
          <div className="h-6 bg-zinc-800 rounded w-1/3"></div>
          <div className="h-4 bg-zinc-800 rounded w-1/2"></div>
        </div>
      );
    } else {
      return (
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 animate-pulse shadow-lg">
          <div className="space-y-3">
            <div className="h-4 bg-zinc-800 rounded w-1/4"></div>
            <div className="h-24 bg-zinc-950 border border-zinc-850 rounded-xl"></div>
          </div>
          <div className="space-y-3">
            <div className="h-4 bg-zinc-800 rounded w-1/4"></div>
            <div className="h-32 bg-zinc-950 border border-zinc-850 rounded-xl"></div>
          </div>
        </div>
      );
    }
  }

  // 2. EMPTY STATES
  if (!lead) {
    if (variant === 'identity') {
      return (
        <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-8 items-center justify-center text-center space-y-4 h-[180px] shadow-lg">
          <div className="p-3 bg-zinc-950 rounded-xl border border-zinc-800">
            <svg className="w-6 h-6 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-zinc-300">No Lead Loaded</h4>
            <p className="text-[10px] text-zinc-500 max-w-xs">
              Select an active campaign queue and fetch a lead to begin.
            </p>
          </div>
        </div>
      );
    } else {
      return null; // Don't show empty details card if no lead is loaded
    }
  }

  // 3. IDENTITY VARIANT (CENTER PANEL)
  if (variant === 'identity') {
    return (
      <div className={`flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-xl shadow-black/10 transition-all duration-300 ${focusMode ? 'text-center items-center justify-center py-12' : ''}`}>
        <div className={`flex ${focusMode ? 'flex-col items-center' : 'items-start justify-between'} gap-3`}>
          <div>
            <h2 className={`font-bold tracking-tight text-white ${focusMode ? 'text-3xl' : 'text-xl'}`}>
              {lead.name}
            </h2>
            <span className="text-[10px] text-zinc-500 font-mono block mt-1 truncate">
              ID: {lead.id.substring(0, 8)}...
            </span>
          </div>
          <span className={`px-3 py-1 text-[10px] font-bold rounded-full border uppercase tracking-wider ${
            lead.status === 'new' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
            lead.status === 'interested' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' :
            lead.status === 'callback' ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' :
            'bg-zinc-800 border-zinc-700 text-zinc-400'
          }`}>
            Status: {lead.status}
          </span>
        </div>

        <div className={`mt-6 border-t border-zinc-800/80 pt-6 grid grid-cols-1 ${focusMode ? 'gap-4' : 'sm:grid-cols-2 gap-4'}`}>
          <div className="flex flex-col bg-zinc-950/60 p-3 rounded-xl border border-zinc-850/50">
            <span className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider block">Phone Number</span>
            <span className={`font-bold tracking-tight text-zinc-200 mt-1 font-mono ${focusMode ? 'text-2xl text-blue-400' : 'text-base'}`}>
              {lead.phone}
            </span>
          </div>
          <div className="flex flex-col bg-zinc-950/60 p-3 rounded-xl border border-zinc-850/50">
            <span className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider block">Email Address</span>
            <span className="text-xs font-bold text-zinc-300 mt-1 truncate">
              {lead.email || 'No email provided'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // 4. DETAILS VARIANT (RIGHT PANEL)
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-6 shadow-xl shadow-black/10">
      {/* Lead Custom Fields Grid */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Property & Lead Metadata
        </h4>
        {Object.keys(lead.custom_fields).length === 0 ? (
          <div className="text-xs text-zinc-500 italic bg-zinc-950/40 p-4 rounded-xl border border-zinc-800/50 text-center">
            No custom fields found for this lead.
          </div>
        ) : (
          <div className="bg-zinc-950 rounded-xl border border-zinc-800 overflow-hidden text-xs">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-900/50 border-b border-zinc-800 text-[10px] text-zinc-400 font-bold uppercase tracking-wider">
                  <th className="px-4 py-2.5">Field</th>
                  <th className="px-4 py-2.5">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-[11px]">
                {Object.entries(lead.custom_fields).map(([key, value]) => (
                  <tr key={key} className="hover:bg-zinc-900/30 transition-colors">
                    <td className="px-4 py-2.5 font-semibold text-zinc-400 capitalize">{key.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2.5 text-zinc-200">{String(value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Activity Timeline */}
      <div className="space-y-3 pt-2">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Activity Timeline
        </h4>
        <div className="bg-zinc-950/40 rounded-xl border border-zinc-800/80 p-4 overflow-y-auto max-h-[300px] space-y-4">
          {history.length === 0 ? (
            <div className="text-xs text-zinc-500 text-center py-6 italic">
              No previous contact history.
            </div>
          ) : (
            <div className="relative border-l border-zinc-800 pl-4 space-y-5">
              {history.map((item) => {
                const isCall = 'status' in item;

                return (
                  <div key={item.id} className="relative text-xs">
                    {/* Circle icon on the timeline */}
                    <span
                      className={`absolute -left-[22px] top-1.5 h-3 w-3 rounded-full border border-zinc-950 shadow-sm flex items-center justify-center ${
                        isCall
                          ? item.status === 'completed'
                            ? 'bg-emerald-500'
                            : 'bg-zinc-650'
                          : 'bg-blue-500'
                      }`}
                    />

                    <div className="flex items-center justify-between text-zinc-500 text-[9px] font-semibold uppercase tracking-wider">
                      <span>
                        By: {item.profiles?.full_name || 'Agent'}
                      </span>
                      <span className="font-mono">
                        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="mt-1 text-zinc-200">
                      {isCall ? (
                        <div className="flex items-center justify-between bg-zinc-900/40 px-3 py-2 rounded-lg border border-zinc-850/50">
                          <span className="font-semibold text-zinc-300 capitalize">
                            Call ({item.status})
                          </span>
                          {item.duration !== null && (
                            <span className="text-zinc-400 font-mono text-[10px]">
                              {item.duration}s
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className="bg-zinc-900/60 p-3 rounded-xl border border-zinc-850/60 text-zinc-300 italic">
                          "{item.note_text}"
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
