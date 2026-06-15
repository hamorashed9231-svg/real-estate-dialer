import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { Lead, Call, Note, QueueMetrics, DialerStats, Campaign } from '@/types/dialer';

interface UseDialerProps {
  sessionToken: string;
  userId: string;
  companyId: string;
}

export function useDialer({
  sessionToken,
  userId,
  companyId,
}: UseDialerProps) {
  const [activeCampaignId, setActiveCampaignId] = useState<string | null>(null);
  const [currentLead, setCurrentLead] = useState<Lead | null>(null);
  const [currentCampaignLeadId, setCurrentCampaignLeadId] = useState<string | null>(null);
  const [callStatus, setCallStatus] = useState<Call['status'] | 'idle'>('idle');
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [queueMetrics, setQueueMetrics] = useState<QueueMetrics>({
    pending: 0,
    calling_now: 0,
    completed: 0,
    skipped: 0,
  });
  const [leadHistory, setLeadHistory] = useState<any[]>([]);
  const [stats, setStats] = useState<DialerStats>({
    calls_today: 0,
    contacts_reached: 0,
    interested_leads: 0,
    callbacks_scheduled: 0,
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callSubscriptionRef = useRef<RealtimeChannel | null>(null);
  const queueSubscriptionRef = useRef<RealtimeChannel | null>(null);

  // Helper: fetch headers
  const getAuthHeaders = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${sessionToken}`,
    };
  }, [sessionToken]);

  // =====================================================================
  // PRODUCTIVITY STATS QUERIES
  // =====================================================================
  const fetchProductivityStats = useCallback(async () => {
    if (!supabase) return;
    try {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const isoTodayStart = todayStart.toISOString();

      // 1. Calls Today (Count)
      const { count: callsTodayCount, error: err1 } = await supabase
        .from('calls')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', isoTodayStart);

      // 2. Contacts Reached (Outbound calls that were answered or completed today)
      const { count: contactsCount, error: err2 } = await supabase
        .from('calls')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['answered', 'completed'])
        .gte('created_at', isoTodayStart);

      // 3. Interested Leads (Company wide CRM count)
      const { count: interestedCount, error: err3 } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'interested');

      // 4. Callbacks Scheduled (Company wide CRM count)
      const { count: callbacksCount, error: err4 } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .eq('status', 'callback');

      if (err1 || err2 || err3 || err4) {
        throw new Error('Failed to query productivity dashboard counts');
      }

      setStats({
        calls_today: callsTodayCount || 0,
        contacts_reached: contactsCount || 0,
        interested_leads: interestedCount || 0,
        callbacks_scheduled: callbacksCount || 0,
      });
    } catch (err: any) {
      console.error('[STATS ERROR]', err.message);
    }
  }, [supabase, userId, companyId]);

  // =====================================================================
  // QUEUE METRICS QUERIES
  // =====================================================================
  const fetchQueueMetrics = useCallback(async (campaignId: string) => {
    if (!supabase) return;
    try {
      const { data: leads, error: err } = await supabase
        .from('campaign_leads')
        .select('status')
        .eq('campaign_id', campaignId)
        .eq('company_id', companyId);

      if (err) throw err;

      const metrics = {
        pending: 0,
        calling_now: 0,
        completed: 0,
        skipped: 0,
      };

      leads?.forEach((lead) => {
        if (lead.status === 'pending') metrics.pending++;
        else if (lead.status === 'calling') metrics.calling_now++;
        else if (lead.status === 'completed') metrics.completed++;
        else if (lead.status === 'skipped') metrics.skipped++;
      });

      setQueueMetrics(metrics);
    } catch (err: any) {
      console.error('[METRICS ERROR] Failed to fetch queue metrics:', err.message);
    }
  }, [supabase, companyId]);

  // Subscribe to realtime queue modifications
  useEffect(() => {
    if (!supabase) return;
    if (queueSubscriptionRef.current) {
      supabase.removeChannel(queueSubscriptionRef.current);
    }

    if (activeCampaignId) {
      fetchQueueMetrics(activeCampaignId);

      // Establish Supabase Realtime channel
      const channel = supabase
        .channel(`queue-changes-${activeCampaignId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'campaign_leads',
            filter: `campaign_id=eq.${activeCampaignId}`,
          },
          () => {
            // Re-fetch metrics and refresh UI counts dynamically
            fetchQueueMetrics(activeCampaignId);
          }
        )
        .subscribe();

      queueSubscriptionRef.current = channel;
    }

    return () => {
      if (queueSubscriptionRef.current) {
        supabase.removeChannel(queueSubscriptionRef.current);
      }
    };
  }, [activeCampaignId, fetchQueueMetrics, supabase]);

  // Fetch stats and metrics on mount/login
  useEffect(() => {
    if (userId && companyId) {
      fetchProductivityStats();
    }
  }, [userId, companyId, fetchProductivityStats]);

  // =====================================================================
  // ACTIVE CALL TIMER
  // =====================================================================
  useEffect(() => {
    if (callStatus === 'answered') {
      timerRef.current = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else if (callStatus === 'completed' || callStatus === 'failed' || callStatus === 'idle') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [callStatus]);

  // =====================================================================
  // LEAD HISTORY TIMELINE
  // =====================================================================
  const fetchLeadHistory = useCallback(async (leadId: string) => {
    if (!supabase) return;
    try {
      // Fetch historical calls
      const { data: calls, error: callsErr } = await supabase
        .from('calls')
        .select('id, status, duration, created_at, user_id, profiles(full_name)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      // Fetch historical notes
      const { data: notes, error: notesErr } = await supabase
        .from('notes')
        .select('id, note_text, created_at, user_id, profiles(full_name)')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false });

      if (callsErr || notesErr) throw new Error('Failed to load lead contact logs');

      // Interleave calls and notes, sorting newest first
      const combinedHistory: any[] = [
        ...(calls || []).map((c) => ({ ...c, type: 'call' })),
        ...(notes || []).map((n) => ({ ...n, type: 'note' })),
      ].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setLeadHistory(combinedHistory);
    } catch (err: any) {
      console.error('[HISTORY ERROR]', err.message);
    }
  }, [supabase]);

  // =====================================================================
  // DIALER METHODS
  // =====================================================================

  // Fetch Next Lead (Locks row atomically using backend Stored Procedure)
  const fetchNextLead = async () => {
    if (!activeCampaignId) {
      setError('Select a campaign to begin dialing.');
      return;
    }

    setLoading(true);
    setError(null);
    setCurrentLead(null);
    setLeadHistory([]);
    setCallStatus('idle');
    setCallDuration(0);

    try {
      const response = await fetch(`/api/leads/next?campaignId=${activeCampaignId}`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch next lead.');
      }

      if (data.message) {
        // Queue is empty
        setError(data.message);
        setCurrentLead(null);
        setCurrentCampaignLeadId(null);
      } else {
        const lead: Lead = {
          id: data.lead_id,
          company_id: companyId,
          name: data.name,
          phone: data.phone,
          email: data.email,
          status: data.status,
          custom_fields: data.custom_fields || {},
          created_at: new Date().toISOString(), // Mock fallback
        };
        setCurrentLead(lead);
        setCurrentCampaignLeadId(data.campaign_lead_id);
        fetchLeadHistory(lead.id);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Start Call (Dials via Telnyx/Mock and logs in database)
  const startCall = async () => {
    if (!supabase || !currentLead) return;

    setLoading(true);
    setError(null);
    setCallDuration(0);

    try {
      const response = await fetch('/api/calls/start', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          campaignId: activeCampaignId,
          leadId: currentLead.id,
          phone: currentLead.phone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Outbound connection failed.');
      }

      const call: Call = data.call;
      setActiveCall(call);
      setCallStatus(call.status);

      // Establish Supabase Realtime channel to subscribe to updates on the call row
      if (callSubscriptionRef.current) {
        supabase.removeChannel(callSubscriptionRef.current);
      }

      const channel = supabase
        .channel(`call-state-${call.id}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'calls',
            filter: `id=eq.${call.id}`,
          },
          (payload) => {
            const updatedCall = payload.new as Call;
            console.log('[REALTIME CALL UPDATE]', updatedCall.status);
            setCallStatus(updatedCall.status);
            setActiveCall(updatedCall);
            if (updatedCall.duration) setCallDuration(updatedCall.duration);
          }
        )
        .subscribe();

      callSubscriptionRef.current = channel;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // End Call (Tear down call/Hangup)
  const endCall = async () => {
    if (!supabase || !activeCall) return;

    setLoading(true);
    try {
      const response = await fetch('/api/calls/update', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          callId: activeCall.id,
          status: 'completed',
          duration: callDuration,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to hangup call.');

      setCallStatus('completed');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Submit Disposition & Save Notes
  const submitDisposition = async (
    disposition: Lead['status'],
    noteText: string
  ) => {
    if (!supabase || !currentLead) return;

    setLoading(true);
    try {
      // Determine what queue status matches the business disposition
      let campaignLeadStatus: 'completed' | 'skipped' | 'pending' = 'completed';
      if (disposition === 'callback') {
        campaignLeadStatus = 'pending'; // Recycle to pending queue if agent scheduled callback
      }

      const response = await fetch('/api/calls/update', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          callId: activeCall?.id,
          status: 'completed',
          duration: callDuration,
          leadStatus: disposition,
          campaignLeadStatus,
          noteText: noteText,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Outcome save failed.');

      // Clear state for next lead
      setCurrentLead(null);
      setCurrentCampaignLeadId(null);
      setActiveCall(null);
      setCallStatus('idle');
      setCallDuration(0);
      setLeadHistory([]);

      // Unsubscribe from call realtime updates
      if (callSubscriptionRef.current) {
        supabase.removeChannel(callSubscriptionRef.current);
        callSubscriptionRef.current = null;
      }

      // Update counters
      fetchProductivityStats();
      if (activeCampaignId) {
        fetchQueueMetrics(activeCampaignId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Clean up all subscriptions on unmount
  useEffect(() => {
    return () => {
      if (!supabase) return;
      if (callSubscriptionRef.current) {
        supabase.removeChannel(callSubscriptionRef.current);
      }
      if (queueSubscriptionRef.current) {
        supabase.removeChannel(queueSubscriptionRef.current);
      }
    };
  }, [supabase]);

  return {
    activeCampaignId,
    setActiveCampaignId,
    currentLead,
    currentCampaignLeadId,
    callStatus,
    callDuration,
    queueMetrics,
    leadHistory,
    stats,
    loading,
    error,
    fetchNextLead,
    startCall,
    endCall,
    submitDisposition,
    fetchProductivityStats,
    supabaseClient: supabase,
  };
}
