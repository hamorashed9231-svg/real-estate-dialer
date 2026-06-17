import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, SkipForward, User, Phone, Mail, MapPin, Clock, FileText, Ban, Trash2, ShieldAlert, AlertCircle, CheckCircle2, ChevronRight, Play, Pause, Loader2 } from 'lucide-react';
import { useDialerStore, Lead } from '../store/dialerStore';
import { useAgentStore } from '../store/agentStore';
import { useDialer } from '../hooks/useDialer';
import DialerWidget from '../components/dialer/DialerWidget';
import api from '../lib/axios';
import { toast } from 'sonner';

export default function Dialer() {
  const queryClient = useQueryClient();
  const { fetchNextLead, initializeTwilioDevice } = useDialer();

  // Zustand Store variables
  const currentLead = useDialerStore((state) => state.currentLead);
  const callStatus = useDialerStore((state) => state.callStatus);

  // Local component states
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isNotesOpen, setIsNotesOpen] = useState<boolean>(true);
  const [newNoteText, setNewNoteText] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);
  const [rightActiveTab, setRightActiveTab] = useState<'profile' | 'history' | 'notes'>('profile');

  // Initialize Twilio Device on mount
  useEffect(() => {
    initializeTwilioDevice();
  }, []);

  // 1. Fetch campaigns for the company
  const { data: campaigns = [], isLoading: isLoadingCampaigns } = useQuery({
    queryKey: ['campaigns'],
    queryFn: async () => {
      const res = await api.get('/campaigns');
      return res.data.data;
    },
  });

  const activeCampaign = campaigns.find((c: any) => c.id === selectedCampaignId);

  // 2. Fetch the Lead Queue for the selected campaign
  const { data: queueLeads = [], isLoading: isLoadingQueue, refetch: refetchQueue } = useQuery({
    queryKey: ['campaign-leads-queue', selectedCampaignId],
    queryFn: async () => {
      const res = await api.get(`/leads?campaignId=${selectedCampaignId}`);
      // Show pending/contacted leads in the queue, filter out deleted or completely non-functional
      return res.data.data.leads.filter((l: Lead) => l.status !== 'Not Interested' && l.status !== 'DNC');
    },
    enabled: !!selectedCampaignId,
  });

  // 3. Fetch detailed info of the current active lead (including call history and notes)
  const { data: activeLeadDetail, refetch: refetchLeadDetail, isLoading: isLoadingLeadDetail } = useQuery({
    queryKey: ['active-lead-detail', currentLead?.id],
    queryFn: async () => {
      const res = await api.get(`/leads/${currentLead?.id}`);
      return res.data.data;
    },
    enabled: !!currentLead?.id,
  });

  // Automatically fetch next lead if campaign status shifts to active and we have no lead
  useEffect(() => {
    if (selectedCampaignId && activeCampaign?.status === 'active' && !currentLead && callStatus === 'idle') {
      fetchNextLead(selectedCampaignId);
    }
  }, [selectedCampaignId, activeCampaign?.status, currentLead, callStatus]);

  // Campaign State Mutations
  const toggleCampaignStatusMutation = useMutation({
    mutationFn: async () => {
      const nextStatus = activeCampaign?.status === 'active' ? 'pause' : 'start';
      await api.post(`/campaigns/${selectedCampaignId}/${nextStatus}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success(
        activeCampaign?.status === 'active' ? 'Campaign dialing paused.' : 'Campaign dialing active.'
      );
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to modify campaign state.');
    },
  });

  // Skip Lead Mutation
  const skipLeadMutation = useMutation({
    mutationFn: async (leadId: string) => {
      await api.post(`/campaigns/${selectedCampaignId}/skip`, { leadId });
    },
    onSuccess: () => {
      refetchQueue();
      toast.info('Lead skipped.');
      // If we skipped the current active lead, fetch the next one
      if (currentLead && currentLead.id === currentLead?.id) {
        fetchNextLead(selectedCampaignId);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to skip lead.');
    },
  });

  // DNC Mutation
  const dncMutation = useMutation({
    mutationFn: async (leadId: string) => {
      await api.post(`/leads/${leadId}/dnc`);
    },
    onSuccess: () => {
      toast.warning('Lead added to DNC Registry and removed from dialing canvas.');
      refetchQueue();
      useDialerStore.setState({ currentLead: null });
      if (selectedCampaignId && activeCampaign?.status === 'active') {
        fetchNextLead(selectedCampaignId);
      }
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error?.message || 'Failed to register DNC.');
    },
  });

  // Save Note Mutation
  const saveNote = async () => {
    if (!currentLead || !newNoteText.trim()) return;
    setIsSavingNote(true);
    try {
      await api.post(`/leads/${currentLead.id}/notes`, { noteText: newNoteText });
      toast.success('Note recorded successfully.');
      setNewNoteText('');
      refetchLeadDetail();
    } catch (err: any) {
      toast.error('Failed to save note.');
    } finally {
      setIsSavingNote(false);
    }
  };

  // Preview lead manually when clicked in the queue
  const handlePreviewLead = (lead: Lead) => {
    if (callStatus !== 'idle') {
      toast.warning('Cannot change lead while call is active.');
      return;
    }
    useDialerStore.setState({ currentLead: lead });
    setRightActiveTab('profile');
  };

  // Filter queue based on search query
  const filteredQueue = queueLeads.filter((lead: Lead) => {
    const term = searchQuery.toLowerCase();
    return (
      lead.name.toLowerCase().includes(term) ||
      lead.phone.includes(term) ||
      (lead.customFields?.city?.toLowerCase() || '').includes(term) ||
      (lead.customFields?.state?.toLowerCase() || '').includes(term)
    );
  });

  return (
    <div className="flex flex-col h-[calc(100vh-6rem)] gap-4 animate-in fade-in duration-300">
      
      {/* Top Banner Control: Campaign Select & Metrics */}
      <div className="glass rounded-3xl border border-zinc-800/80 p-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="bg-zinc-950/80 p-2.5 rounded-2xl border border-zinc-850">
            <Clock className="h-5 w-5 text-blue-500" />
          </div>
          <div>
            <h1 className="text-base font-bold text-zinc-200">Softphone Calling Canvas</h1>
            <p className="text-xs text-zinc-500">Agent dialing station and real-time lead queue.</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Campaign Selector */}
          <select
            value={selectedCampaignId}
            onChange={(e) => {
              setSelectedCampaignId(e.target.value);
              useDialerStore.setState({ currentLead: null });
            }}
            disabled={callStatus !== 'idle'}
            className="h-11 bg-zinc-950 border border-zinc-850 rounded-2xl px-4 text-xs font-bold text-zinc-300 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 max-w-[200px]"
          >
            <option value="">Select Campaign...</option>
            {campaigns.map((camp: any) => (
              <option key={camp.id} value={camp.id}>
                {camp.name} ({camp.mode})
              </option>
            ))}
          </select>

          {/* Toggle Campaign Button */}
          {selectedCampaignId && (
            <button
              type="button"
              onClick={() => toggleCampaignStatusMutation.mutate()}
              disabled={toggleCampaignStatusMutation.isPending}
              className={`h-11 px-5 rounded-2xl text-xs font-bold flex items-center gap-2 transition-all ${
                activeCampaign?.status === 'active'
                  ? 'bg-amber-600 hover:bg-amber-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {toggleCampaignStatusMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : activeCampaign?.status === 'active' ? (
                <>
                  <Pause className="h-3.5 w-3.5" />
                  Pause Campaign
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Start Campaign
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Main 3-Column Working Canvas */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 min-h-0 overflow-hidden">
        
        {/* COLUMN 1: Lead Queue (320px) */}
        <div className="w-full md:w-80 glass rounded-3xl border border-zinc-800/80 flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b border-zinc-850 space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-xs font-bold text-zinc-300 uppercase tracking-widest">Lead Queue</h2>
              <span className="text-[10px] font-bold bg-zinc-950 border border-zinc-850 px-2 py-0.5 rounded-lg text-zinc-400">
                {filteredQueue.length} Pending
              </span>
            </div>

            {/* Local Queue Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-650" />
              <input
                type="text"
                placeholder="Search queue leads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full h-9 bg-zinc-950/70 border border-zinc-850 rounded-xl pl-9 pr-4 text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 space-y-2">
            {!selectedCampaignId ? (
              <div className="text-center py-12 text-zinc-600 text-xs">
                Select a campaign above to populate the lead queue.
              </div>
            ) : isLoadingQueue ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-zinc-500 text-xs">
                <Loader2 className="h-5 w-5 animate-spin" />
                Loading campaign queue...
              </div>
            ) : filteredQueue.length === 0 ? (
              <div className="text-center py-12 text-zinc-650 text-xs">
                Queue is empty. No more leads found.
              </div>
            ) : (
              filteredQueue.map((lead: Lead) => {
                const isSelected = currentLead?.id === lead.id;
                return (
                  <div
                    key={lead.id}
                    onClick={() => handlePreviewLead(lead)}
                    className={`p-3 rounded-2xl border transition-all cursor-pointer select-none group relative ${
                      isSelected
                        ? 'border-blue-500/50 bg-blue-500/5'
                        : 'border-zinc-900 bg-zinc-950/30 hover:border-zinc-850 hover:bg-zinc-950/50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="space-y-0.5 max-w-[190px]">
                        <p className={`text-xs font-bold truncate ${isSelected ? 'text-blue-400' : 'text-zinc-200'}`}>
                          {lead.name}
                        </p>
                        <p className="text-[10px] text-zinc-550 font-mono">{lead.phone}</p>
                        {lead.customFields?.city && (
                          <p className="text-[9px] text-zinc-600 font-medium">
                            {lead.customFields.city}, {lead.customFields.state}
                          </p>
                        )}
                      </div>

                      {/* Attempts Counter & Skip Outlaw */}
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-[9px] font-bold text-zinc-555 uppercase tracking-wide">
                          Attempts: {lead.customFields?.attempts || 0}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            skipLeadMutation.mutate(lead.id);
                          }}
                          className="p-1 bg-zinc-950 border border-zinc-850 hover:border-zinc-700 hover:text-white rounded-lg text-zinc-500 transition-colors opacity-0 group-hover:opacity-100"
                          title="Skip Lead"
                        >
                          <SkipForward className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* COLUMN 2: Central Softphone (flex-1) */}
        <div className="flex-1 flex items-center justify-center p-4 bg-zinc-950/20 border border-zinc-800/40 rounded-3xl overflow-y-auto">
          <DialerWidget
            campaignId={selectedCampaignId}
            campaignName={activeCampaign?.name}
            onNotesToggle={() => {
              setIsNotesOpen(!isNotesOpen);
              setRightActiveTab('notes');
            }}
            isNotesOpen={isNotesOpen && rightActiveTab === 'notes'}
          />
        </div>

        {/* COLUMN 3: Lead Profile Details & History (320px) */}
        <div className="w-full md:w-80 glass rounded-3xl border border-zinc-800/80 flex flex-col min-h-0 overflow-hidden">
          {!currentLead ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center text-zinc-650 space-y-3">
              <div className="p-3 bg-zinc-950/60 border border-zinc-850 rounded-2xl text-zinc-600">
                <User className="h-8 w-8" />
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">No Active Lead</p>
                <p className="text-[11px] text-zinc-600 mt-1 max-w-[200px] mx-auto">
                  Click a contact from the queue or start the campaign to load CRM details.
                </p>
              </div>
            </div>
          ) : isLoadingLeadDetail ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-zinc-500 text-xs">
              <Loader2 className="h-5 w-5 animate-spin" />
              Syncing CRM records...
            </div>
          ) : (
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              
              {/* Tab Navigation header */}
              <div className="grid grid-cols-3 border-b border-zinc-850 p-2 gap-1 bg-zinc-950/30">
                {(['profile', 'history', 'notes'] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setRightActiveTab(tab)}
                    className={`py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all ${
                      rightActiveTab === tab
                        ? 'bg-zinc-900 border border-zinc-800 text-white'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Dynamic Tab Body */}
              <div className="flex-1 overflow-y-auto p-4 min-h-0">
                
                {/* TAB 1: Profile Details */}
                {rightActiveTab === 'profile' && activeLeadDetail && (
                  <div className="space-y-5 animate-in fade-in duration-200">
                    <div className="text-center space-y-1.5 pb-4 border-b border-zinc-850">
                      <div className="inline-flex h-12 w-12 rounded-full bg-blue-500/10 border border-blue-500/20 items-center justify-center text-blue-500 text-sm font-bold">
                        {activeLeadDetail.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <h3 className="font-bold text-zinc-200">{activeLeadDetail.name}</h3>
                      <span className="text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                        {activeLeadDetail.status}
                      </span>
                    </div>

                    <div className="space-y-3.5">
                      <div className="flex items-center gap-3 text-xs">
                        <Phone className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-zinc-300 font-mono">{activeLeadDetail.phone}</span>
                      </div>
                      {activeLeadDetail.email && (
                        <div className="flex items-center gap-3 text-xs">
                          <Mail className="h-3.5 w-3.5 text-zinc-500" />
                          <span className="text-zinc-300 truncate">{activeLeadDetail.email}</span>
                        </div>
                      )}
                      {activeLeadDetail.customFields?.city && (
                        <div className="flex items-start gap-3 text-xs">
                          <MapPin className="h-3.5 w-3.5 text-zinc-500 mt-0.5" />
                          <span className="text-zinc-300">
                            {activeLeadDetail.customFields.address && `${activeLeadDetail.customFields.address}, `}
                            {activeLeadDetail.customFields.city}, {activeLeadDetail.customFields.state} {activeLeadDetail.customFields.zip}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* DNC trigger button */}
                    <div className="pt-4 border-t border-zinc-850">
                      <button
                        type="button"
                        onClick={() => dncMutation.mutate(activeLeadDetail.id)}
                        disabled={dncMutation.isPending}
                        className="w-full py-2.5 bg-red-950/20 hover:bg-red-950/40 border border-red-500/20 hover:border-red-500/40 text-red-400 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Register to DNC Pool
                      </button>
                    </div>
                  </div>
                )}

                {/* TAB 2: Call History */}
                {rightActiveTab === 'history' && activeLeadDetail && (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest">Call History</h3>
                    
                    {!activeLeadDetail.calls || activeLeadDetail.calls.length === 0 ? (
                      <p className="text-center py-6 text-zinc-600 text-xs">No previous calls logged.</p>
                    ) : (
                      <div className="relative border-l border-zinc-850 pl-3.5 ml-2.5 space-y-4 py-1">
                        {activeLeadDetail.calls.slice(0, 5).map((call: any) => (
                          <div key={call.id} className="relative space-y-1">
                            {/* Dot indicator */}
                            <div className="absolute -left-[20px] top-1 h-2 w-2 rounded-full border border-zinc-950 bg-blue-500" />
                            <div className="flex justify-between items-center text-[10px]">
                              <span className="font-bold text-zinc-300 capitalize">{call.disposition || 'No Disposition'}</span>
                              <span className="text-zinc-550 font-medium">
                                {new Date(call.createdAt).toLocaleDateString()}
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 leading-relaxed font-mono">
                              Duration: {call.duration ? `${call.duration}s` : 'Unknown'} | Dialed Outbound
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: Notes Timeline & Editor */}
                {rightActiveTab === 'notes' && activeLeadDetail && (
                  <div className="space-y-4 flex flex-col h-full min-h-0 animate-in fade-in duration-200">
                    
                    {/* Notes List */}
                    <div className="flex-1 overflow-y-auto space-y-2.5 max-h-[170px] pr-1">
                      {!activeLeadDetail.notes || activeLeadDetail.notes.length === 0 ? (
                        <p className="text-center py-4 text-zinc-650 text-xs">No previous notes logged.</p>
                      ) : (
                        activeLeadDetail.notes.map((note: any) => (
                          <div key={note.id} className="p-2.5 bg-zinc-950/60 border border-zinc-850 rounded-xl space-y-1">
                            <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500">
                              <span>Logged Agent note</span>
                              <span>{new Date(note.createdAt).toLocaleDateString()}</span>
                            </div>
                            <p className="text-[10px] text-zinc-300 leading-relaxed">
                              {note.noteText}
                            </p>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Notes Textarea Editor */}
                    <div className="space-y-2 pt-2 border-t border-zinc-850">
                      <textarea
                        rows={2}
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        placeholder="Log notes while in-call..."
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-xl p-2.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                      />
                      <button
                        type="button"
                        onClick={saveNote}
                        disabled={isSavingNote || !newNoteText.trim()}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-[10px] font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        {isSavingNote ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <FileText className="h-3 w-3" />
                        )}
                        Save Active Note
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
