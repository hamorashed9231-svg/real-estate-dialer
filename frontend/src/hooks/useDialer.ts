import { useDialerStore } from '../store/dialerStore';
import { useAgentStore, AgentStatus } from '../store/agentStore';
import { useQueryClient } from '@tanstack/react-query';
import api from '../lib/axios';
import { toast } from 'sonner';

/**
 * Custom hook to aggregate core dialer orchestrations.
 */
export function useDialer() {
  const dialerStore = useDialerStore();
  const agentStore = useAgentStore();
  const queryClient = useQueryClient();

  /**
   * Loads Twilio Access Token and registers browser WebRTC.
   * Falls back automatically to Mock Simulator Mode if Twilio is not configured.
   */
  const initializeTwilioDevice = async () => {
    try {
      const response = await api.post('/twilio/token');
      const token = response.data.data.token;
      await dialerStore.initDevice(token);
    } catch (error: any) {
      console.warn('[useDialer] Twilio token fetch failed. Defaulting WebRTC to Mock Mode.');
      await dialerStore.initDevice('mock_token');
    }
  };

  /**
   * Initiates outbound call, shifts agent state to calling, and updates CRM logs.
   */
  const startCall = async (leadId: string, phoneNumber: string, campaignId?: string) => {
    try {
      await agentStore.setStatus('calling');
      await dialerStore.makeCall(phoneNumber, leadId, campaignId);
      // Invalidate queries to refresh call histories
      queryClient.invalidateQueries({ queryKey: ['leads', leadId] });
      queryClient.invalidateQueries({ queryKey: ['calls'] });
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Outbound call creation failed.';
      toast.error(message);
      await agentStore.setStatus('available');
    }
  };

  /**
   * Terminates active WebRTC call session and moves agent to wrap-up.
   */
  const endCall = async () => {
    try {
      dialerStore.hangup();
      await agentStore.setStatus('wrapup');
    } catch (error) {
      toast.error('Failed to end call.');
    }
  };

  /**
   * Requests and locks the next pending lead in the campaign queue.
   */
  const fetchNextLead = async (campaignId: string) => {
    try {
      const response = await api.post(`/campaigns/${campaignId}/next-lead`);
      const nextLead = response.data.data;

      if (nextLead) {
        useDialerStore.setState({ currentLead: nextLead });
      } else {
        toast.info(response.data.message || 'No more pending leads in this campaign queue.');
        useDialerStore.setState({ currentLead: null });
      }
    } catch (error: any) {
      toast.error('Failed to fetch next lead.');
    }
  };

  return {
    initializeTwilioDevice,
    startCall,
    endCall,
    fetchNextLead,
  };
}
