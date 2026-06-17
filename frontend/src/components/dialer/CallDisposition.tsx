import React, { useState } from 'react';
import { Star, Calendar, ThumbsDown, PhoneOff, Mail, XCircle, Ban, Loader2, Save } from 'lucide-react';
import { useDialerStore } from '../../store/dialerStore';
import { useAgentStore } from '../../store/agentStore';
import { useDialer } from '../../hooks/useDialer';
import api from '../../lib/axios';
import { toast } from 'sonner';

interface CallDispositionProps {
  campaignId?: string;
  onSaved?: () => void;
}

interface DispositionOption {
  value: string;
  label: string;
  icon: React.ComponentType<any>;
  color: string;
  borderColor: string;
  bgColor: string;
  leadStatus: string;
}

const DISPOSITION_OPTIONS: DispositionOption[] = [
  {
    value: 'Interested',
    label: 'Interested',
    icon: Star,
    color: 'text-amber-400',
    borderColor: 'border-amber-500/30',
    bgColor: 'bg-amber-500/10',
    leadStatus: 'Interested',
  },
  {
    value: 'Callback',
    label: 'Callback Scheduled',
    icon: Calendar,
    color: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/10',
    leadStatus: 'Callback',
  },
  {
    value: 'Not Interested',
    label: 'Not Interested',
    icon: ThumbsDown,
    color: 'text-zinc-400',
    borderColor: 'border-zinc-500/30',
    bgColor: 'bg-zinc-500/10',
    leadStatus: 'Not Interested',
  },
  {
    value: 'No Answer',
    label: 'No Answer',
    icon: PhoneOff,
    color: 'text-rose-400',
    borderColor: 'border-rose-500/30',
    bgColor: 'bg-rose-500/10',
    leadStatus: 'New',
  },
  {
    value: 'Left Voicemail',
    label: 'Left Voicemail',
    icon: Mail,
    color: 'text-indigo-400',
    borderColor: 'border-indigo-500/30',
    bgColor: 'bg-indigo-500/10',
    leadStatus: 'Contacted',
  },
  {
    value: 'Wrong Number',
    label: 'Wrong Number',
    icon: XCircle,
    color: 'text-orange-400',
    borderColor: 'border-orange-500/30',
    bgColor: 'bg-orange-500/10',
    leadStatus: 'Not Interested',
  },
  {
    value: 'DNC Request',
    label: 'DNC Request',
    icon: Ban,
    color: 'text-red-500',
    borderColor: 'border-red-500/30',
    bgColor: 'bg-red-500/10',
    leadStatus: 'Not Interested',
  },
];

export default function CallDisposition({ campaignId, onSaved }: CallDispositionProps) {
  const currentLead = useDialerStore((state) => state.currentLead);
  const resetDialer = useDialerStore((state) => state.resetDialer);
  const setAgentStatus = useAgentStore((state) => state.setStatus);
  const { fetchNextLead } = useDialer();

  const [selectedDisp, setSelectedDisp] = useState<string>('Interested');
  const [notes, setNotes] = useState<string>('');
  const [callbackTime, setCallbackTime] = useState<string>('');
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const activeOption = DISPOSITION_OPTIONS.find((opt) => opt.value === selectedDisp);

  const handleSave = async () => {
    if (!currentLead) {
      toast.error('No active lead to save disposition for.');
      return;
    }

    if (selectedDisp === 'Callback' && !callbackTime) {
      toast.error('Please specify a date and time for the callback.');
      return;
    }

    setIsSaving(true);
    try {
      // 1. Fetch the latest call record to find the ID of the call we just ended
      const historyResponse = await api.get('/calls/history?limit=1');
      const latestCall = historyResponse.data.data.calls[0];

      if (!latestCall) {
        throw new Error('Could not retrieve latest call record.');
      }

      // 2. Format notes to include callback time if selected
      let finalNotes = notes;
      if (selectedDisp === 'Callback') {
        const formattedDate = new Date(callbackTime).toLocaleString();
        finalNotes = `[Callback Scheduled for: ${formattedDate}] ${notes}`.trim();
      }

      // 3. Save disposition and notes
      await api.patch(`/calls/${latestCall.id}/disposition`, {
        disposition: selectedDisp,
        noteText: finalNotes,
        leadStatus: activeOption?.leadStatus || currentLead.status,
      });

      // 4. Handle DNC Request addition if selected
      if (selectedDisp === 'DNC Request') {
        await api.post(`/leads/${currentLead.id}/dnc`);
        toast.info('Lead added to DNC Registry.');
      }

      toast.success('Call disposition recorded.');

      // 5. Transition agent back to available
      await setAgentStatus('available');

      // 6. Reset dialer store state
      resetDialer();

      // 7. Fire parent callback
      if (onSaved) {
        onSaved();
      }

      // 8. If campaign is active, load the next lead automatically
      if (campaignId) {
        await fetchNextLead(campaignId);
      }
    } catch (error: any) {
      console.error('[DISPOSITION SAVE ERROR]', error);
      toast.error(error.response?.data?.error?.message || 'Failed to save call disposition.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-zinc-100">Select Call Outcome</h3>
        <p className="text-xs text-zinc-400">Choose a disposition to log this call and proceed.</p>
      </div>

      {/* Dispositions List */}
      <div className="grid grid-cols-2 gap-2.5">
        {DISPOSITION_OPTIONS.map((option) => {
          const Icon = option.icon;
          const isSelected = selectedDisp === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedDisp(option.value)}
              className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                isSelected
                  ? `${option.borderColor} ${option.bgColor} ring-1 ring-offset-2 ring-offset-zinc-950 ring-blue-500`
                  : 'border-zinc-800/60 bg-zinc-950/40 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200'
              }`}
            >
              <div className={`p-1.5 rounded-lg bg-zinc-900 border border-zinc-800 ${option.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xs font-bold">{option.label}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Callback Date/Time Picker */}
      {selectedDisp === 'Callback' && (
        <div className="space-y-2 p-4 bg-blue-500/5 border border-blue-500/10 rounded-xl animate-in fade-in slide-in-from-top-2 duration-200">
          <label className="block text-xs font-bold text-blue-400 uppercase tracking-wider">
            Callback Date & Time
          </label>
          <input
            type="datetime-local"
            value={callbackTime}
            onChange={(e) => setCallbackTime(e.target.value)}
            className="w-full bg-zinc-950 border border-zinc-850 rounded-xl px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      )}

      {/* Notes Editor */}
      <div className="space-y-2">
        <label className="block text-xs font-bold text-zinc-400 uppercase tracking-wider">
          Call Notes / Follow-up Details
        </label>
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Enter detailed outcome notes here..."
          className="w-full bg-zinc-950 border border-zinc-850 rounded-xl p-3 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 placeholder-zinc-600 resize-none"
        />
      </div>

      {/* Save Button */}
      <button
        type="button"
        onClick={handleSave}
        disabled={isSaving}
        className="w-full h-11 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-900/20 hover:shadow-blue-900/30 transition-all active:scale-[0.99]"
      >
        {isSaving ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Saving Disposition...
          </>
        ) : (
          <>
            <Save className="h-4 w-4" />
            Save &amp; Next Lead
          </>
        )}
      </button>
    </div>
  );
}
