import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, Users, Percent, Timer, Loader2, ArrowUpRight, Search, FileText, CheckCircle2, ShieldAlert, Play, Square, X, Calendar } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useRealTimeUpdates } from '../hooks/useRealTimeUpdates';
import LiveStats from '../components/dashboard/LiveStats';
import AgentBoard from '../components/dashboard/AgentBoard';
import CallVolumeChart from '../components/dashboard/CallVolumeChart';
import DispositionChart from '../components/dashboard/DispositionChart';
import api from '../lib/axios';

interface CallRecord {
  id: string;
  voipCallSid: string | null;
  phoneNumber: string;
  status: string;
  duration: number | null;
  recordingUrl: string | null;
  disposition: string | null;
  createdAt: string;
  lead: {
    name: string;
    phone: string;
    email: string | null;
  };
  user: {
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
}

export default function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const companyId = user?.companyId;

  // Initialize Server-Sent Events subscription for supervisors
  useRealTimeUpdates(companyId);

  // Local state for Call Inspector Modal
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [isInspectorOpen, setIsInspectorOpen] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioInstance, setAudioInstance] = useState<HTMLAudioElement | null>(null);

  // 1. Query live stats/top stats summary (SSE-invalidated, fallback to 10s poll)
  const { data: liveStats } = useQuery({
    queryKey: ['dashboard', 'live-stats'],
    queryFn: async () => {
      const res = await api.get('/dashboard/live-stats');
      return res.data.data;
    },
    refetchInterval: 10000,
  });

  // 2. Query Recent 20 Calls history
  const { data: recentCallsData, isLoading: isLoadingRecent } = useQuery({
    queryKey: ['calls', 'history', 'limit-20'],
    queryFn: async () => {
      const res = await api.get('/calls/history?limit=20');
      return res.data.data.calls as CallRecord[];
    },
    refetchInterval: 10000,
  });

  // Helper to format average handle time seconds -> MM:SS
  const formatHandleTime = (seconds: number) => {
    if (!seconds) return '00:00';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleRowClick = (call: CallRecord) => {
    setSelectedCall(call);
    setIsInspectorOpen(true);
  };

  const handleAudioPlay = (call: CallRecord) => {
    if (!call.recordingUrl) return;

    if (playingAudioId === call.id) {
      if (audioInstance) {
        audioInstance.pause();
        audioInstance.currentTime = 0;
      }
      setPlayingAudioId(null);
      setAudioInstance(null);
      return;
    }

    if (audioInstance) {
      audioInstance.pause();
    }

    const audio = new Audio(call.recordingUrl);
    audio.play();
    setPlayingAudioId(call.id);
    setAudioInstance(audio);

    audio.onended = () => {
      setPlayingAudioId(null);
      setAudioInstance(null);
    };
  };

  const handleCloseInspector = () => {
    setIsInspectorOpen(false);
    setSelectedCall(null);
    if (audioInstance) {
      audioInstance.pause();
      setAudioInstance(null);
      setPlayingAudioId(null);
    }
  };

  // Top metric card configurations
  const metricCards = [
    {
      id: 'totalcalls',
      label: 'Calls Dialed Today',
      value: liveStats?.totalCallsToday ?? 0,
      icon: Phone,
      color: 'text-blue-400',
      bgColor: 'bg-blue-500/5',
      borderColor: 'border-blue-500/10',
    },
    {
      id: 'answerrate',
      label: 'Connect Rate Today',
      value: `${liveStats?.answerRateToday ?? 0}%`,
      icon: Percent,
      color: 'text-emerald-400',
      bgColor: 'bg-emerald-500/5',
      borderColor: 'border-emerald-500/10',
    },
    {
      id: 'handletime',
      label: 'Avg Handle Time Today',
      value: formatHandleTime(liveStats?.avgHandleTimeToday ?? 0),
      icon: Timer,
      color: 'text-amber-400',
      bgColor: 'bg-amber-500/5',
      borderColor: 'border-amber-500/10',
    },
    {
      id: 'activeagents',
      label: 'Dialer Supervision Roster',
      value: `${liveStats?.activeAgentsCount ?? 0} / ${liveStats?.totalAgentsCount ?? 0}`,
      desc: 'Active / Total Agents',
      icon: Users,
      color: 'text-indigo-400',
      bgColor: 'bg-indigo-500/5',
      borderColor: 'border-indigo-500/10',
    },
  ];

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-300">
      
      {/* Top Welcome Title Banner */}
      <div className="flex justify-between items-center pb-4 border-b border-zinc-800/40">
        <div>
          <h1 className="text-xl font-bold text-zinc-100">Supervisor dialer Command Center</h1>
          <p className="text-xs text-zinc-500">Real-time outbound dialing SLA parameters and call coaching controls.</p>
        </div>
        <div className="text-xs font-bold text-zinc-400 bg-zinc-950 border border-zinc-850 px-3.5 py-2 rounded-xl">
          Logged company tenant Context: <span className="text-blue-500">{user?.companyName}</span>
        </div>
      </div>

      {/* Section 1: Top Stats Bar (4 Metric Cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.id}
              className={`p-5 rounded-3xl border flex items-center justify-between transition-all duration-200 hover:border-zinc-700/80 ${card.bgColor} ${card.borderColor}`}
            >
              <div className="space-y-2">
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest leading-none">
                  {card.label}
                </span>
                <p className="text-2xl font-bold font-mono tracking-tight text-zinc-100 mt-1">
                  {card.value}
                </p>
                {card.desc && (
                  <p className="text-[9px] text-zinc-550 font-bold uppercase tracking-wider">
                    {card.desc}
                  </p>
                )}
              </div>
              <div className={`p-3 rounded-2xl bg-zinc-950 border border-zinc-850 ${card.color}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Section 2: Live Monitor Row */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <div className="xl:col-span-3">
          <LiveStats />
        </div>
        <div className="xl:col-span-2">
          <AgentBoard />
        </div>
      </div>

      {/* Section 3: Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CallVolumeChart />
        <DispositionChart />
      </div>

      {/* Section 4: Recent Calls Table */}
      <div className="bg-zinc-900/40 border border-zinc-800/80 p-5 rounded-3xl space-y-4">
        <div className="flex justify-between items-center pb-2 border-b border-zinc-850">
          <div>
            <h3 className="text-sm font-bold text-zinc-200">Recent Outbound call Logs</h3>
            <p className="text-[10px] text-zinc-500">Last 20 calls completed by active company dialing agents.</p>
          </div>
        </div>

        <div className="overflow-x-auto border border-zinc-850 rounded-2xl bg-zinc-950/20">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-zinc-850 text-zinc-500 uppercase tracking-widest text-[9px] font-bold bg-zinc-950/70">
                <th className="py-3.5 px-4">Agent</th>
                <th className="py-3.5 px-4">Lead Name</th>
                <th className="py-3.5 px-4">Phone</th>
                <th className="py-3.5 px-4 text-center">Duration</th>
                <th className="py-3.5 px-4 text-center">Disposition</th>
                <th className="py-3.5 px-4 text-right">Date &amp; Time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-900/60 font-medium">
              {isLoadingRecent ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-500 text-xs">
                    <div className="flex items-center justify-center gap-1.5">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      Loading recent calls logs...
                    </div>
                  </td>
                </tr>
              ) : !recentCallsData || recentCallsData.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-zinc-650 text-xs">
                    No outbound calls logged today.
                  </td>
                </tr>
              ) : (
                recentCallsData.map((call) => {
                  const agentName = call.user
                    ? `${call.user.firstName || ''} ${call.user.lastName || ''}`.trim()
                    : 'System Dialer';
                  return (
                    <tr
                      key={call.id}
                      onClick={() => handleRowClick(call)}
                      className="hover:bg-zinc-900/20 cursor-pointer transition-colors duration-150"
                    >
                      <td className="py-3 px-4 font-bold text-zinc-300">{agentName}</td>
                      <td className="py-3 px-4 text-zinc-200">{call.lead?.name || 'Manual Dialer Client'}</td>
                      <td className="py-3 px-4 font-mono text-zinc-400">{call.phoneNumber}</td>
                      <td className="py-3 px-4 text-center font-mono text-zinc-300">
                        {call.duration ? `${call.duration}s` : '0s'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex px-2 py-0.5 rounded text-[10px] font-bold capitalize bg-zinc-900 border border-zinc-800 text-zinc-300">
                          {call.disposition || 'No Disposition'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-zinc-500 text-[10px] font-mono">
                        {new Date(call.createdAt).toLocaleString()}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Call Inspector Modal */}
      {isInspectorOpen && selectedCall && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-zinc-100">Outbound Call Log Inspector</h3>
                <p className="text-[10px] text-zinc-400 mt-1 uppercase tracking-wider font-mono font-bold">
                  CALL SID: {selectedCall.voipCallSid || 'mock_sid'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseInspector}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Profile Summary Card */}
            <div className="bg-zinc-950/50 border border-zinc-850 p-4 rounded-2xl space-y-3">
              <div className="flex justify-between text-xs border-b border-zinc-900 pb-2">
                <span className="text-zinc-550 font-bold uppercase tracking-wider">Agent Details</span>
                <span className="text-zinc-200 font-bold">
                  {selectedCall.user
                    ? `${selectedCall.user.firstName || ''} ${selectedCall.user.lastName || ''}`.trim()
                    : 'System Outbound Dialer'}
                </span>
              </div>
              
              <div className="flex justify-between text-xs border-b border-zinc-900 pb-2">
                <span className="text-zinc-550 font-bold uppercase tracking-wider">Lead Profile</span>
                <span className="text-zinc-200 font-bold">
                  {selectedCall.lead?.name || 'Manual Dial Client'}
                </span>
              </div>

              <div className="flex justify-between text-xs border-b border-zinc-900 pb-2">
                <span className="text-zinc-550 font-bold uppercase tracking-wider">Phone number</span>
                <span className="text-zinc-400 font-mono font-bold">{selectedCall.phoneNumber}</span>
              </div>

              <div className="flex justify-between text-xs border-b border-zinc-900 pb-2">
                <span className="text-zinc-550 font-bold uppercase tracking-wider">Outcome Disposition</span>
                <span className="text-zinc-300 font-bold capitalize">
                  {selectedCall.disposition || 'Pending wrapup outcome'}
                </span>
              </div>

              <div className="flex justify-between text-xs">
                <span className="text-zinc-550 font-bold uppercase tracking-wider">Call duration</span>
                <span className="text-zinc-300 font-bold font-mono">
                  {selectedCall.duration ? `${selectedCall.duration} seconds` : '0 seconds'}
                </span>
              </div>
            </div>

            {/* Interactive Recording Playback widget if audio URL is loaded */}
            {selectedCall.recordingUrl ? (
              <div className="bg-zinc-950 border border-zinc-850 p-4 rounded-2xl flex items-center justify-between gap-3 animate-in slide-in-from-bottom-2 duration-200">
                <div className="space-y-0.5">
                  <p className="text-[10px] font-bold text-zinc-450 uppercase tracking-widest">VoIP Audio Recording</p>
                  <p className="text-[9px] text-zinc-600">Archived compliance voice logger.</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleAudioPlay(selectedCall)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all duration-150 active:scale-[0.97] ${
                    playingAudioId === selectedCall.id
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  }`}
                >
                  {playingAudioId === selectedCall.id ? (
                    <>
                      <Square className="h-3 w-3 fill-current" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="h-3 w-3 fill-current" />
                      Play Recording
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-zinc-950/40 border border-zinc-900 p-3.5 rounded-2xl flex items-center gap-2.5 justify-center">
                <ShieldAlert className="h-4 w-4 text-zinc-650 shrink-0" />
                <p className="text-[10px] text-zinc-600 font-medium">
                  Voice recording not captured for this call log session.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={handleCloseInspector}
                className="px-4 py-2 bg-zinc-950 hover:bg-zinc-800 border border-zinc-850 text-xs font-bold text-zinc-400 hover:text-zinc-200 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
