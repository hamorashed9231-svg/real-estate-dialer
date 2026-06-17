import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { User, PhoneOff, Eye, Volume2, ShieldAlert, X, Loader2, Play } from 'lucide-react';
import api from '../../lib/axios';
import { toast } from 'sonner';

interface Agent {
  agentId: string;
  name: string;
  status: 'available' | 'calling' | 'in-call' | 'wrapup' | 'break' | 'offline';
  currentCallSid: string | null;
  callStartTime: string | null;
  callsToday: number;
  avgHandleTime: number;
  answerRate: number;
}

// Sub-component to compute and display call elapsed duration dynamically on client-side
function AgentTimer({ startTime }: { startTime: string | null }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!startTime) {
      setElapsed(0);
      return;
    }

    const updateTimer = () => {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      const diff = Math.max(0, Math.floor((now - start) / 1000));
      setElapsed(diff);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const formatElapsed = (secs: number) => {
    const mins = Math.floor(secs / 65); // safe grouping
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  return <span className="font-mono text-[10px] text-blue-400 font-bold bg-blue-500/10 px-1.5 py-0.5 rounded ml-1.5">{formatElapsed(elapsed)}</span>;
}

export default function AgentBoard() {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [showSupervisorModal, setShowSupervisorModal] = useState(false);

  // Fetch all agent states (SSE will invalidate, polling as fallback every 5s)
  const { data: agents = [], isLoading, error } = useQuery<Agent[]>({
    queryKey: ['agents-status'],
    queryFn: async () => {
      const res = await api.get('/agents/status');
      return res.data.data;
    },
    refetchInterval: 5000,
  });

  const getStatusBadge = (status: Agent['status'], startTime: string | null) => {
    switch (status) {
      case 'available':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full uppercase">
            ● Available
          </span>
        );
      case 'calling':
      case 'in-call':
        return (
          <span className="inline-flex items-center text-[10px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2.5 py-0.5 rounded-full uppercase">
            ● On Call
            <AgentTimer startTime={startTime} />
          </span>
        );
      case 'wrapup':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2.5 py-0.5 rounded-full uppercase">
            ● Wrap-up
          </span>
        );
      case 'break':
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-2.5 py-0.5 rounded-full uppercase">
            ● Break
          </span>
        );
      case 'offline':
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-zinc-500 bg-zinc-950 border border-zinc-850 px-2.5 py-0.5 rounded-full uppercase">
            ● Offline
          </span>
        );
    }
  };

  const handleAgentClick = (agent: Agent) => {
    const isCoachable = agent.status === 'calling' || agent.status === 'in-call';
    if (isCoachable) {
      setSelectedAgent(agent);
      setShowSupervisorModal(true);
    }
  };

  const handleSupervisorAction = (action: 'barge' | 'whisper') => {
    toast.error(
      `Conferencing Stub: "${action === 'barge' ? 'Barge In' : 'Whisper Coached'}" is a premium feature requiring active Twilio Conference room channels.`,
      {
        description: 'Standard outbound bridging handles call coaching on premium Twilio packages.',
        duration: 5000,
      }
    );
  };

  if (isLoading) {
    return (
      <div className="h-full min-h-[300px] flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6">
        <div className="flex flex-col items-center gap-2 text-zinc-550 text-xs">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
          <span>Syncing supervisor rosters...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full min-h-[300px] flex items-center justify-center bg-zinc-900/40 border border-zinc-800/80 rounded-3xl p-6 text-red-400 text-xs text-center">
        <PhoneOff className="h-5 w-5 mx-auto mb-2 text-red-500" />
        Failed to load agent metrics.
      </div>
    );
  }

  return (
    <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-3xl space-y-4 h-full flex flex-col min-h-0 overflow-hidden">
      <div>
        <h3 className="text-sm font-bold text-zinc-200">Active Agent Roster</h3>
        <p className="text-[10px] text-zinc-500">Live dialing status board and supervisor tools.</p>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 mt-2 border border-zinc-850 rounded-2xl bg-zinc-950/30">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-zinc-850 text-zinc-500 uppercase tracking-widest text-[9px] font-bold bg-zinc-950/70 sticky top-0 z-10">
              <th className="py-3 px-4">Agent</th>
              <th className="py-3 px-4">State</th>
              <th className="py-3 px-4 text-center">Calls</th>
              <th className="py-3 px-4 text-center">Answer Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900/60 font-medium">
            {agents.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-8 text-center text-zinc-650">
                  No agents found.
                </td>
              </tr>
            ) : (
              agents.map((agent) => {
                const isOnCall = agent.status === 'calling' || agent.status === 'in-call';
                return (
                  <tr
                    key={agent.agentId}
                    onClick={() => handleAgentClick(agent)}
                    className={`transition-colors duration-150 ${
                      isOnCall
                        ? 'hover:bg-blue-500/5 cursor-pointer border-l-2 border-l-blue-500'
                        : 'hover:bg-zinc-900/20'
                    }`}
                  >
                    <td className="py-3.5 px-4 flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center text-[10px] font-bold text-zinc-400 font-mono">
                        {agent.name.split(' ').map((n) => n[0]).join('')}
                      </div>
                      <span className="font-bold text-zinc-200 truncate max-w-[110px]">
                        {agent.name}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {getStatusBadge(agent.status, agent.callStartTime)}
                    </td>
                    <td className="py-3.5 px-4 text-center text-zinc-300 font-mono">
                      {agent.callsToday}
                    </td>
                    <td className="py-3.5 px-4 text-center text-zinc-300 font-mono">
                      {agent.answerRate}%
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Supervisor Call Coaching Modal */}
      {showSupervisorModal && selectedAgent && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-zinc-100">Supervisor Call Console</h3>
                <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider">
                  Listening to: <span className="text-blue-400 font-bold">{selectedAgent.name}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSupervisorModal(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="bg-zinc-950/50 border border-zinc-850 p-4 rounded-2xl space-y-2.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-550">Active Call SID:</span>
                <span className="font-mono text-zinc-400 font-bold truncate max-w-[180px]">
                  {selectedAgent.currentCallSid || 'mock_sid_null'}
                </span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-550">Elapsed Time:</span>
                <AgentTimer startTime={selectedAgent.callStartTime} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleSupervisorAction('barge')}
                className="py-3 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl font-bold text-xs text-zinc-200 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
              >
                <Eye className="h-4 w-4 text-blue-500" />
                Barge In
              </button>
              <button
                type="button"
                onClick={() => handleSupervisorAction('whisper')}
                className="py-3 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 rounded-xl font-bold text-xs text-zinc-200 flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
              >
                <Volume2 className="h-4 w-4 text-emerald-500" />
                Whisper Coach
              </button>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/10 p-3.5 rounded-2xl flex items-start gap-2.5">
              <ShieldAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[9.5px] leading-relaxed text-amber-450">
                Supervisor barge-in and whispered coaching requires setting up a Twilio Conference bridge during outbound calling. The manager will join the room muted or coached.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
