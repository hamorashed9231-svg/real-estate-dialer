import React, { useState } from 'react';
import { Mic, MicOff, Pause, Play, Mail, PhoneForwarded, Keyboard, FileText, X, Loader2, ArrowRight } from 'lucide-react';
import { useDialerStore } from '../../store/dialerStore';
import DTMFKeypad from './DTMFKeypad';
import { toast } from 'sonner';

interface CallControlsProps {
  onToggleVoicemail: () => void;
  onToggleNotes: () => void;
  isNotesOpen?: boolean;
  isVoicemailOpen?: boolean;
}

export default function CallControls({
  onToggleVoicemail,
  onToggleNotes,
  isNotesOpen = false,
  isVoicemailOpen = false,
}: CallControlsProps) {
  const isMuted = useDialerStore((state) => state.isMuted);
  const isOnHold = useDialerStore((state) => state.isOnHold);
  const toggleMute = useDialerStore((state) => state.toggleMute);
  const toggleHold = useDialerStore((state) => state.toggleHold);

  const [isKeypadOpen, setIsKeypadOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [transferNumber, setTransferNumber] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);

  const handleTransferSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferNumber) {
      toast.error('Please enter a destination phone number.');
      return;
    }
    
    setIsTransferring(true);
    // STUB: Simulate backend transfer trigger
    setTimeout(() => {
      setIsTransferring(false);
      setIsTransferOpen(false);
      setTransferNumber('');
      toast.success(`Transfer initiated to ${transferNumber} (Paid feature simulation).`);
    }, 1500);
  };

  const controlButtons = [
    {
      id: 'mute',
      label: isMuted ? 'Unmute' : 'Mute',
      icon: isMuted ? MicOff : Mic,
      active: isMuted,
      onClick: toggleMute,
      color: isMuted ? 'text-red-500 bg-red-500/10 border-red-500/30' : 'text-zinc-300 hover:text-white',
    },
    {
      id: 'hold',
      label: isOnHold ? 'Resume' : 'Hold',
      icon: isOnHold ? Play : Pause,
      active: isOnHold,
      onClick: toggleHold,
      color: isOnHold ? 'text-amber-500 bg-amber-500/10 border-amber-500/30' : 'text-zinc-300 hover:text-white',
    },
    {
      id: 'vmdrop',
      label: 'VM Drop',
      icon: Mail,
      active: isVoicemailOpen,
      onClick: onToggleVoicemail,
      color: isVoicemailOpen ? 'text-blue-500 bg-blue-500/10 border-blue-500/30' : 'text-zinc-300 hover:text-white',
    },
    {
      id: 'transfer',
      label: 'Transfer',
      icon: PhoneForwarded,
      active: isTransferOpen,
      onClick: () => setIsTransferOpen(true),
      color: 'text-zinc-300 hover:text-white',
    },
    {
      id: 'keypad',
      label: 'Keypad',
      icon: Keyboard,
      active: isKeypadOpen,
      onClick: () => setIsKeypadOpen(!isKeypadOpen),
      color: isKeypadOpen ? 'text-blue-500 bg-blue-500/10 border-blue-500/30' : 'text-zinc-300 hover:text-white',
    },
    {
      id: 'notes',
      label: 'Notes',
      icon: FileText,
      active: isNotesOpen,
      onClick: onToggleNotes,
      color: isNotesOpen ? 'text-blue-500 bg-blue-500/10 border-blue-500/30' : 'text-zinc-300 hover:text-white',
    },
  ];

  return (
    <div className="relative">
      {/* 3x2 Grid Controls */}
      <div className="grid grid-cols-3 gap-3">
        {controlButtons.map((btn) => {
          const Icon = btn.icon;
          return (
            <div key={btn.id} className="relative">
              <button
                type="button"
                onClick={btn.onClick}
                className={`w-full py-4 rounded-2xl border flex flex-col items-center justify-center gap-2 transition-all duration-200 active:scale-[0.96] ${
                  btn.active
                    ? `${btn.color} border-current`
                    : `${btn.color} border-zinc-800 bg-zinc-950/60 hover:bg-zinc-900/60 hover:border-zinc-700`
                }`}
              >
                <Icon className="h-5 w-5 stroke-[2px]" />
                <span className="text-[10px] font-bold uppercase tracking-wider">{btn.label}</span>
              </button>

              {/* Embed DTMF Keypad floating directly relative to its key */}
              {btn.id === 'keypad' && isKeypadOpen && (
                <DTMFKeypad onClose={() => setIsKeypadOpen(false)} />
              )}
            </div>
          );
        })}
      </div>

      {/* Transfer Call Stub Modal */}
      {isTransferOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 p-6 rounded-3xl shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-bold text-zinc-100">Transfer Active Call</h3>
                <p className="text-xs text-zinc-400 mt-1">
                  Route this client to another department or dial a custom number.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferOpen(false)}
                className="p-1.5 hover:bg-zinc-800 rounded-lg text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Destination Phone / Agent Ext.
                </label>
                <input
                  type="text"
                  required
                  placeholder="+1 (555) 000-0000"
                  value={transferNumber}
                  onChange={(e) => setTransferNumber(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="bg-zinc-950/50 border border-zinc-800/80 p-3 rounded-xl">
                <p className="text-[10px] leading-relaxed text-zinc-500">
                  <span className="font-bold text-amber-500/80 uppercase">Notice:</span> Cold and warm bridges require an active Twilio Conference room session. In local mock mode, this will bridge calls virtually.
                </p>
              </div>

              <button
                type="submit"
                disabled={isTransferring}
                className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                {isTransferring ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Connecting Transfer...
                  </>
                ) : (
                  <>
                    Initiate Transfer
                    <ArrowRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
