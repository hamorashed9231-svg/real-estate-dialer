import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, AlertTriangle, Play, Pause, ChevronRight, User, MapPin, Signal, RefreshCw, Mail, VolumeX } from 'lucide-react';
import { useDialerStore } from '../../store/dialerStore';
import { useAgentStore, AgentStatus } from '../../store/agentStore';
import { useDialer } from '../../hooks/useDialer';
import CallControls from './CallControls';
import CallDisposition from './CallDisposition';
import VoicemailDrop from './VoicemailDrop';
import api from '../../lib/axios';
import { toast } from 'sonner';

interface DialerWidgetProps {
  campaignId?: string;
  campaignName?: string;
  onNotesToggle?: () => void;
  isNotesOpen?: boolean;
}

export default function DialerWidget({
  campaignId,
  campaignName,
  onNotesToggle,
  isNotesOpen = false,
}: DialerWidgetProps) {
  const { startCall, endCall } = useDialer();
  
  // Store states
  const callStatus = useDialerStore((state) => state.callStatus);
  const currentLead = useDialerStore((state) => state.currentLead);
  const callDuration = useDialerStore((state) => state.callDuration);
  const resetDialer = useDialerStore((state) => state.resetDialer);
  const dropVoicemail = useDialerStore((state) => state.dropVoicemail);

  const agentStatus = useAgentStore((state) => state.status);
  const setAgentStatus = useAgentStore((state) => state.setStatus);

  // Local component states
  const [manualPhone, setManualPhone] = useState('');
  const [isDialingManual, setIsDialingManual] = useState(false);
  const [isVoicemailOpen, setIsVoicemailOpen] = useState(false);

  // Agent Status styling helper
  const getStatusColor = (status: AgentStatus) => {
    switch (status) {
      case 'available':
        return 'bg-emerald-500';
      case 'calling':
        return 'bg-blue-500 animate-pulse';
      case 'wrapup':
        return 'bg-amber-500 animate-pulse';
      case 'break':
        return 'bg-orange-500';
      case 'offline':
      default:
        return 'bg-zinc-500';
    }
  };

  // Helper to format call duration timer
  const formatTime = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Auto close Voicemail panel if call transitions away from calling states
  useEffect(() => {
    if (callStatus !== 'in-call' && callStatus !== 'ringing') {
      setIsVoicemailOpen(false);
    }
  }, [callStatus]);

  // Handle manual dialing
  const handleManualCall = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPhone.trim()) {
      toast.error('Please enter a valid phone number.');
      return;
    }

    setIsDialingManual(true);
    try {
      // Clean phone number format
      const digits = manualPhone.replace(/\D/g, '');
      const formatted = digits.length === 10 ? `+1${digits}` : `+${digits}`;

      // 1. Search or create a CRM lead for this phone number
      const searchResponse = await api.get(`/leads?search=${digits}`);
      let lead = searchResponse.data.data.leads[0];

      if (!lead) {
        // Create manual lead on the fly
        const createResponse = await api.post('/leads', {
          name: `Manual Outbound Lead`,
          phone: formatted,
          status: 'New',
        });
        lead = createResponse.data.data;
        toast.info('Created new CRM contact record for manual call.');
      }

      // 2. Start call using the hook
      await startCall(lead.id, formatted, campaignId);
      setManualPhone('');
    } catch (err: any) {
      console.error('[MANUAL CALL ERROR]', err);
    } finally {
      setIsDialingManual(false);
    }
  };

  return (
    <div className="w-full max-w-[480px] mx-auto glass rounded-3xl border border-zinc-800/80 shadow-2xl p-6 relative overflow-hidden transition-all duration-300">
      {/* Glow highlight based on call state */}
      <div
        className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl opacity-20 transition-colors duration-500 pointer-events-none ${
          callStatus === 'in-call'
            ? 'bg-blue-500'
            : callStatus === 'ringing' || callStatus === 'connecting'
            ? 'bg-amber-500'
            : callStatus === 'wrapup'
            ? 'bg-purple-500'
            : 'bg-emerald-500'
        }`}
      />

      {/* Widget Header: Agent Status Selector */}
      <div className="flex justify-between items-center pb-4 border-b border-zinc-800/60 mb-6 z-10 relative">
        <div className="flex items-center gap-2">
          <div className={`h-2.5 w-2.5 rounded-full ${getStatusColor(agentStatus)}`} />
          <select
            value={agentStatus}
            onChange={(e) => setAgentStatus(e.target.value as AgentStatus)}
            className="bg-transparent text-xs font-bold text-zinc-400 hover:text-zinc-200 focus:outline-none cursor-pointer uppercase tracking-wider"
          >
            <option value="available" className="bg-zinc-900 text-emerald-400">Available</option>
            <option value="break" className="bg-zinc-900 text-orange-400">On Break</option>
            <option value="offline" className="bg-zinc-900 text-zinc-400">Offline</option>
          </select>
        </div>

        {campaignName && (
          <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20 px-2.5 py-1 rounded-full uppercase tracking-wider max-w-[150px] truncate">
            Camp: {campaignName}
          </span>
        )}
      </div>

      {/* STATE 1: IDLE */}
      {callStatus === 'idle' && (
        <div className="space-y-6 py-4 animate-in fade-in duration-300">
          <div className="text-center space-y-2.5">
            {/* PropDial Logo Icon */}
            <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-zinc-950/80 border border-zinc-800 text-blue-500 mb-2 shadow-inner">
              <Phone className="h-7 w-7" />
            </div>
            <h2 className="text-xl font-bold text-zinc-200 tracking-tight">Ready to dial</h2>
            <p className="text-xs text-zinc-500 max-w-[280px] mx-auto">
              Select a campaign to begin queue dialing, or enter a number below to call manually.
            </p>
          </div>

          {/* Manual Call Form */}
          <form onSubmit={handleManualCall} className="space-y-3 pt-2">
            <div className="relative flex items-center">
              <input
                type="tel"
                required
                placeholder="Enter phone number..."
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                className="w-full h-12 bg-zinc-950/70 border border-zinc-800 rounded-2xl pl-4 pr-12 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={isDialingManual}
                className="absolute right-2 p-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl transition-all hover:scale-105 active:scale-95"
              >
                <Phone className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STATE 2: CONNECTING */}
      {callStatus === 'connecting' && (
        <div className="space-y-8 py-8 text-center animate-in fade-in duration-300">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-zinc-200">{currentLead?.name || 'Loading Contact...'}</h3>
            <p className="text-xs text-zinc-500 font-mono">{currentLead?.phone}</p>
          </div>

          {/* Pulsing Dot Animation */}
          <div className="relative flex items-center justify-center h-24 my-6">
            <div className="absolute h-20 w-20 rounded-full border border-blue-500/20 bg-blue-500/5 animate-ping" />
            <div className="absolute h-12 w-12 rounded-full border border-blue-500/40 bg-blue-500/10 animate-pulse" />
            <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center text-white">
              <RefreshCw className="h-3 w-3 animate-spin duration-1000" />
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold text-blue-500 uppercase tracking-widest">Connecting...</p>
            <button
              type="button"
              onClick={resetDialer}
              className="px-6 py-2.5 bg-zinc-950 hover:bg-zinc-900 border border-zinc-850 hover:border-zinc-700 text-xs font-bold rounded-xl text-zinc-400 hover:text-zinc-200 transition-colors"
            >
              Cancel Call
            </button>
          </div>
        </div>
      )}

      {/* STATE 3: RINGING */}
      {callStatus === 'ringing' && (
        <div className="space-y-8 py-8 text-center animate-in fade-in duration-300">
          <div className="space-y-2">
            <h3 className="text-lg font-bold text-zinc-200">{currentLead?.name}</h3>
            <p className="text-xs text-zinc-500 font-mono">{currentLead?.phone}</p>
          </div>

          {/* 3 Concentric Ringing Ripple Waves */}
          <div className="relative flex items-center justify-center h-24 my-6">
            <div className="absolute h-24 w-24 rounded-full border border-amber-500/10 bg-amber-500/5 animate-ping duration-[3000ms]" />
            <div className="absolute h-16 w-16 rounded-full border border-amber-500/20 bg-amber-500/5 animate-ping duration-[2000ms]" />
            <div className="absolute h-10 w-10 rounded-full border border-amber-500/30 bg-amber-500/10 animate-ping duration-[1000ms]" />
            <div className="h-6 w-6 rounded-full bg-amber-500 flex items-center justify-center text-white">
              <Phone className="h-3 w-3 animate-bounce" />
            </div>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-bold text-amber-500 uppercase tracking-widest">Ringing...</p>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={() => setIsVoicemailOpen(!isVoicemailOpen)}
                className="px-4 py-2.5 bg-zinc-950 border border-zinc-850 text-xs font-bold rounded-xl text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors"
              >
                VM Drop Preview
              </button>
              <button
                type="button"
                onClick={resetDialer}
                className="px-4 py-2.5 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 text-xs font-bold rounded-xl text-red-500 hover:bg-red-500/5 transition-colors"
              >
                Cancel Call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STATE 4: IN-CALL */}
      {callStatus === 'in-call' && (
        <div className="space-y-6 py-2 animate-in fade-in duration-300">
          <div className="flex justify-between items-start">
            <div className="space-y-1">
              <h3 className="text-xl font-bold text-zinc-100">{currentLead?.name}</h3>
              <div className="flex items-center gap-1.5 text-zinc-500 text-xs">
                <span className="font-mono">{currentLead?.phone}</span>
                {currentLead?.customFields?.city && (
                  <>
                    <span>•</span>
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-3 w-3" />
                      {currentLead.customFields.city}, {currentLead.customFields.state}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 text-right">
              {/* Call Timer */}
              <span className="text-base font-bold text-blue-500 font-mono tracking-wider">
                {formatTime(callDuration)}
              </span>
              {/* WebRTC RTC Signal */}
              <div className="flex items-center gap-1 text-emerald-500 text-[10px] font-bold">
                <Signal className="h-3.5 w-3.5" />
                <span>RTC STABLE</span>
              </div>
            </div>
          </div>

          {/* Voicemail Panel Toggle */}
          {isVoicemailOpen && (
            <div className="animate-in slide-in-from-bottom-2 duration-300">
              <VoicemailDrop />
            </div>
          )}

          {/* 3x2 Grid Controls */}
          <CallControls
            onToggleVoicemail={() => setIsVoicemailOpen(!isVoicemailOpen)}
            onToggleNotes={onNotesToggle || (() => {})}
            isNotesOpen={isNotesOpen}
            isVoicemailOpen={isVoicemailOpen}
          />

          {/* Hangup Trigger */}
          <div className="flex justify-center pt-2">
            <button
              type="button"
              onClick={endCall}
              className="h-14 w-14 rounded-full bg-red-600 hover:bg-red-700 flex items-center justify-center text-white shadow-lg shadow-red-900/30 hover:shadow-red-900/40 hover:scale-105 active:scale-95 transition-all duration-200"
              title="Hangup Call"
            >
              <PhoneOff className="h-6 w-6" />
            </button>
          </div>
        </div>
      )}

      {/* STATE 5: WRAPUP */}
      {callStatus === 'wrapup' && (
        <div className="space-y-6 py-2 animate-in fade-in duration-300">
          <div className="flex justify-between items-center pb-4 border-b border-zinc-800/40">
            <div>
              <h3 className="text-base font-bold text-zinc-200">Call Ended</h3>
              <p className="text-xs text-zinc-500">Log outcome to complete wrapup status.</p>
            </div>
            <div className="bg-zinc-950 px-3 py-1.5 border border-zinc-850 rounded-xl">
              <p className="text-xs text-zinc-400 font-medium">
                Duration: <span className="font-mono text-zinc-200 font-bold">{formatTime(callDuration)}</span>
              </p>
            </div>
          </div>

          <CallDisposition campaignId={campaignId} />
        </div>
      )}
    </div>
  );
}
