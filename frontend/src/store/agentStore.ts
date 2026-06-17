import { create } from 'zustand';
import api from '../lib/axios';

export type AgentStatus = 'available' | 'calling' | 'wrapup' | 'break' | 'offline';

interface AgentState {
  status: AgentStatus;
  setStatus: (status: AgentStatus) => Promise<void>;
}

export const useAgentStore = create<AgentState>((set) => ({
  status: 'offline',

  setStatus: async (status: AgentStatus) => {
    try {
      // Call backend API to persist state in Redis and DB
      await api.patch('/agents/status', { status });
      set({ status });
    } catch (error) {
      console.error('[AGENT STORE SET STATUS ERROR]', error);
      throw error;
    }
  },
}));
