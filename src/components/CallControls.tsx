import { Call } from '@/types/dialer';

interface CallControlsProps {
  currentLead: any | null;
  callStatus: Call['status'] | 'idle';
  callDuration: number;
  onStartCall: () => void;
  onEndCall: () => void;
  loading: boolean;
  focusMode?: boolean;
}

export function CallControls({
  currentLead,
  callStatus,
  callDuration,
  onStartCall,
  onEndCall,
  loading,
  focusMode = false,
}: CallControlsProps) {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const getStatusLabel = (status: typeof callStatus) => {
    switch (status) {
      case 'initiated': return 'Connecting...';
      case 'ringing': return 'Ringing...';
      case 'answered': return 'Connected';
      case 'completed': return 'Completed';
      case 'failed': return 'Call Failed';
      default: return 'Ready to Dial';
    }
  };

  const getStatusBadgeClass = (status: typeof callStatus) => {
    switch (status) {
      case 'initiated':
        return 'bg-blue-500/10 border-blue-500/20 text-blue-400 animate-pulse';
      case 'ringing':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400 animate-pulse';
      case 'answered':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      case 'completed':
        return 'bg-zinc-800 border-zinc-700 text-zinc-400';
      case 'failed':
        return 'bg-red-500/10 border-red-500/20 text-red-400';
      default:
        return 'bg-zinc-950/60 border-zinc-800 text-zinc-500';
    }
  };

  const isCallActive = ['initiated', 'ringing', 'answered'].includes(callStatus);

  if (!currentLead) return null;

  // 1. FOCUSED COCKPIT VIEW DURING ACTIVE CALLS
  if (focusMode) {
    return (
      <div className="flex flex-col items-center justify-center p-8 space-y-8 text-center">
        {/* Status Pill */}
        <div className="flex flex-col items-center space-y-2">
          <span
            className={`px-4 py-1.5 text-xs font-bold font-sans rounded-full border uppercase tracking-wider shadow-sm ${getStatusBadgeClass(
              callStatus
            )}`}
          >
            {getStatusLabel(callStatus)}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono">
            Active Outbound Session
          </span>
        </div>

        {/* Huge Digital Call Timer */}
        <div className="flex flex-col items-center justify-center py-4">
          <span className="text-6xl font-extrabold font-mono text-zinc-100 tracking-wider drop-shadow-[0_4px_12px_rgba(255,255,255,0.03)]">
            {formatTime(callDuration)}
          </span>
          <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider mt-2">
            Call Duration
          </span>
        </div>

        {/* Large red End Call Button */}
        <button
          onClick={onEndCall}
          disabled={loading}
          className="w-48 py-4 px-6 rounded-full flex items-center justify-center gap-3 text-sm font-bold text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-40 shadow-xl shadow-red-600/10"
        >
          <svg className="w-5 h-5 fill-current rotate-[135deg]" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-1C7.79 18 2 12.21 2 5V3z" />
          </svg>
          End Call
        </button>
      </div>
    );
  }

  // 2. NORMAL DIALER CARD VIEW (COLLAPSED STATE)
  return (
    <div className="flex flex-col bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4 shadow-xl shadow-black/10">
      <div className="flex items-center justify-between">
        <h4 className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Dialer Connection Control
        </h4>
        <span
          className={`px-2.5 py-0.5 text-[9px] font-bold font-sans rounded-full border uppercase tracking-wider ${getStatusBadgeClass(
            callStatus
          )}`}
        >
          {getStatusLabel(callStatus)}
        </span>
      </div>

      <div className="flex w-full gap-3 pt-1">
        {/* Dial Button */}
        <button
          onClick={onStartCall}
          disabled={loading || isCallActive}
          className="flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-emerald-600/10"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.94.725l.548 2.2a1 1 0 00.099.281l-.918.918A12.063 12.063 0 0014.28 17l.918-.918a1 1 0 01.282-.099l2.2-.548a1 1 0 01.282-.099L21 19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          {loading && callStatus === 'idle' ? 'Dialing...' : 'Start Call'}
        </button>

        {/* Hang Up Button */}
        <button
          onClick={onEndCall}
          disabled={loading || !isCallActive}
          className="flex-1 flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-xs font-bold text-white bg-red-600 hover:bg-red-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-red-600/10"
        >
          <svg className="w-4 h-4 fill-current rotate-[135deg]" viewBox="0 0 20 20">
            <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-1C7.79 18 2 12.21 2 5V3z" />
          </svg>
          End Call
        </button>
      </div>
    </div>
  );
}
