import { useState } from 'react';
import { Lead } from '@/types/dialer';

interface DispositionPanelProps {
  currentLead: any | null;
  onSubmit: (disposition: Lead['status'], noteText: string) => void;
  loading: boolean;
  hasCallStarted: boolean;
}

export function DispositionPanel({
  currentLead,
  onSubmit,
  loading,
  hasCallStarted,
}: DispositionPanelProps) {
  const [selectedOutcome, setSelectedOutcome] = useState<Lead['status'] | null>(null);
  const [noteText, setNoteText] = useState<string>('');

  const outcomes: { value: Lead['status']; label: string; icon: string; activeClass: string; inactiveClass: string }[] = [
    {
      value: 'interested',
      label: 'Interested',
      icon: '🔥',
      activeClass: 'border-blue-500 bg-blue-600/20 text-blue-400 ring-2 ring-blue-500/20',
      inactiveClass: 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:bg-blue-500/5 hover:text-blue-400 hover:border-blue-500/30',
    },
    {
      value: 'callback',
      label: 'Callback',
      icon: '⏰',
      activeClass: 'border-amber-500 bg-amber-600/20 text-amber-400 ring-2 ring-amber-500/20',
      inactiveClass: 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:bg-amber-500/5 hover:text-amber-400 hover:border-amber-500/30',
    },
    {
      value: 'contacted',
      label: 'Contacted',
      icon: '🤝',
      activeClass: 'border-zinc-500 bg-zinc-800/30 text-zinc-200 ring-2 ring-zinc-500/20',
      inactiveClass: 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:bg-zinc-800/20 hover:text-zinc-200 hover:border-zinc-700',
    },
    {
      value: 'not_interested',
      label: 'Not Interested',
      icon: '❄️',
      activeClass: 'border-red-500 bg-red-600/20 text-red-400 ring-2 ring-red-500/20',
      inactiveClass: 'border-zinc-800 bg-zinc-950/40 text-zinc-400 hover:bg-red-500/5 hover:text-red-400 hover:border-red-500/30',
    },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOutcome) return;
    onSubmit(selectedOutcome, noteText);
    setSelectedOutcome(null);
    setNoteText('');
  };

  if (!currentLead) return null;

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-5 flex flex-col shadow-xl shadow-black/10"
    >
      <div>
        <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Call Outcome & Dispositions
        </h3>
        <p className="text-[11px] text-zinc-500 mt-1">
          Select call disposition to save outcome and unlock queue
        </p>
      </div>

      {/* Outcome Selection Buttons */}
      <div className="grid grid-cols-2 gap-2">
        {outcomes.map((outcome) => {
          const isSelected = selectedOutcome === outcome.value;
          return (
            <button
              key={outcome.value}
              type="button"
              disabled={loading || !hasCallStarted}
              onClick={() => setSelectedOutcome(outcome.value)}
              className={`px-3 py-3.5 border text-xs font-bold rounded-xl flex flex-col items-center gap-1.5 transition-all active:scale-[0.98] ${
                isSelected ? outcome.activeClass : outcome.inactiveClass
              } disabled:opacity-30 disabled:cursor-not-allowed`}
            >
              <span className="text-lg">{outcome.icon}</span>
              <span>{outcome.label}</span>
            </button>
          );
        })}
      </div>

      {/* Note Area */}
      <div className="space-y-2">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-zinc-500">
          Call Summary Notes
        </label>
        <textarea
          disabled={loading || !hasCallStarted}
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Enter details about call discussion..."
          className="w-full h-24 bg-zinc-950 border border-zinc-800 p-3 rounded-xl text-xs text-zinc-100 placeholder-zinc-650 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-30 transition-all font-mono"
        />
      </div>

      {/* Save Button */}
      <button
        type="submit"
        disabled={loading || !selectedOutcome || !hasCallStarted}
        className="w-full py-3 px-4 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-blue-600/10"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
            <span className="h-3 w-3 rounded-full border border-white border-t-transparent animate-spin" />
            Saving Outcome...
          </span>
        ) : (
          'Save & Unlock Lead'
        )}
      </button>
    </form>
  );
}
