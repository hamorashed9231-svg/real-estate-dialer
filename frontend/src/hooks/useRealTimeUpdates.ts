import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/**
 * Custom React Hook to subscribe supervisor client to the real-time EventSource SSE pipeline.
 */
export function useRealTimeUpdates(companyId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!companyId) return;

    console.log('[SSE] Opening real-time stream connection.');
    
    // Connect to backend Server-Sent Events endpoint
    const eventSource = new EventSource('/api/dashboard/stream', {
      withCredentials: true,
    });

    // Handle agent status updates in real-time
    eventSource.addEventListener('agent-status', (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('[SSE EVENT: AGENT STATUS]', data);

        // Instantly update the agents status React Query cache
        queryClient.setQueryData(['agents-status'], (old: any) => {
          if (!old) return old;
          // Locate the specific agent and merge updated Redis state fields
          return old.map((agent: any) => {
            if (agent.agentId === data.agentId) {
              return {
                ...agent,
                status: data.status,
                // If the agent went calling, start active call timer
                callStartTime: data.status === 'calling' ? new Date().toISOString() : null,
              };
            }
            return agent;
          });
        });
      } catch (error) {
        console.error('[SSE AGENT STATUS JSON ERROR]', error);
      }
    });

    // Handle call log updates
    eventSource.addEventListener('call-update', (event) => {
      console.log('[SSE EVENT: CALL UPDATE]');
      // Invalidate live stats and recent calls to trigger fresh UI loads
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'live-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard', 'calls-by-hour'] });
      queryClient.invalidateQueries({ queryKey: ['calls', 'history'] });
      queryClient.invalidateQueries({ queryKey: ['agents-status'] });
    });

    // Handle abandonment rate warnings
    eventSource.addEventListener('abandonment-warning', () => {
      console.log('[SSE EVENT: ABANDONMENT WARNING]');
      toast.warning('⚠️ Outbound abandonment rate exceeds 3.0%! Active campaigns automatically paused.');
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
    });

    eventSource.onerror = (error) => {
      console.warn('[SSE STREAM ERROR] Connection dropped or failed. Re-establishing.');
    };

    // Close connection on component unmount
    return () => {
      console.log('[SSE] Closing real-time stream connection.');
      eventSource.close();
    };
  }, [companyId, queryClient]);
}
