import { create } from 'zustand';
import { Device, Call } from '@twilio/voice-sdk';
import api from '../lib/axios';

export type CallStatus = 'idle' | 'connecting' | 'ringing' | 'in-call' | 'wrapup';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  status: string;
  customFields: Record<string, any>;
}

interface DialerState {
  device: Device | null;
  callStatus: CallStatus;
  activeCall: Call | null;
  currentLead: Lead | null;
  isMuted: boolean;
  isOnHold: boolean;
  callDuration: number;
  initDevice: (token: string) => Promise<void>;
  makeCall: (phoneNumber: string, leadId: string, campaignId?: string) => Promise<void>;
  hangup: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  dropVoicemail: (voicemailUrl: string) => Promise<void>;
  setDisposition: (disposition: string, notes: string, leadStatus?: string) => Promise<void>;
  resetDialer: () => void;
}

let durationTimer: NodeJS.Timeout | null = null;

export const useDialerStore = create<DialerState>((set, get) => ({
  device: null,
  callStatus: 'idle',
  activeCall: null,
  currentLead: null,
  isMuted: false,
  isOnHold: false,
  callDuration: 0,

  initDevice: async (token: string) => {
    // Avoid re-initializing if device already exists
    if (get().device) return;

    try {
      if (token.startsWith('mock_')) {
        console.log('[DIALER STORE] Initializing Mock Twilio WebRTC Device.');
        set({ device: null });
        return;
      }

      console.log('[DIALER STORE] Initializing Twilio WebRTC Device.');
      const device = new Device(token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      // Register device listeners
      device.on('registered', () => {
        console.log('[TWILIO DEVICE] Device registered successfully.');
      });

      device.on('error', (error) => {
        console.error('[TWILIO DEVICE ERROR]', error.message);
      });

      device.on('disconnect', () => {
        console.log('[TWILIO DEVICE] Call disconnected.');
        if (durationTimer) {
          clearInterval(durationTimer);
          durationTimer = null;
        }
        set({ callStatus: 'wrapup', activeCall: null, isOnHold: false, isMuted: false });
      });

      await device.register();
      set({ device });
    } catch (error) {
      console.error('[TWILIO DEVICE INIT FAILED]', error);
    }
  },

  makeCall: async (phoneNumber: string, leadId: string, campaignId?: string) => {
    set({ callStatus: 'connecting', isOnHold: false, isMuted: false, callDuration: 0 });

    try {
      // 1. Fetch Lead details from backend
      const leadResponse = await api.get(`/leads/${leadId}`);
      const lead = leadResponse.data.data;
      set({ currentLead: lead });

      // 2. Initiate Call record on backend (triggers TCPA checks)
      const initiateResponse = await api.post('/calls/initiate', {
        leadId,
        campaignId,
        phone: phoneNumber,
      });

      const { callId, twilioCallSid } = initiateResponse.data.data;

      // 3. Connect WebRTC line
      const device = get().device;
      if (device) {
        // Real WebRTC Connect
        const call = await device.connect({
          params: {
            To: phoneNumber,
            callId,
          },
        });

        // Set call listeners
        call.on('accept', () => {
          set({ callStatus: 'in-call', activeCall: call });
          // Start duration timer
          durationTimer = setInterval(() => {
            set((state) => ({ callDuration: state.callDuration + 1 }));
          }, 1000);
        });

        call.on('disconnect', () => {
          if (durationTimer) {
            clearInterval(durationTimer);
            durationTimer = null;
          }
          set({ callStatus: 'wrapup', activeCall: null });
        });
      } else {
        // Mock connection simulation (for local dev without real Twilio token)
        console.log(`[MOCK DIALER] Outbound WebRTC dialing ${phoneNumber} (Call ID: ${callId})`);
        set({ callStatus: 'ringing' });

        // Simulate Ringing -> Connected transitions
        setTimeout(() => {
          set({ callStatus: 'in-call' });
          durationTimer = setInterval(() => {
            set((state) => ({ callDuration: state.callDuration + 1 }));
          }, 1000);
        }, 2500);
      }
    } catch (error: any) {
      console.error('[DIALER MAKE CALL ERROR]', error);
      set({ callStatus: 'idle', currentLead: null });
      throw error; // Propagate to display toast in UI
    }
  },

  hangup: () => {
    const activeCall = get().activeCall;
    if (activeCall) {
      activeCall.disconnect();
    } else {
      // Mock hangup simulation
      if (durationTimer) {
        clearInterval(durationTimer);
        durationTimer = null;
      }
      set({ callStatus: 'wrapup' });
    }
  },

  toggleMute: () => {
    const activeCall = get().activeCall;
    const nextMuteState = !get().isMuted;
    
    if (activeCall) {
      activeCall.mute(nextMuteState);
    }
    set({ isMuted: nextMuteState });
  },

  toggleHold: () => {
    // Hold toggle normally dials hold music or bridges call on backend
    const nextHoldState = !get().isOnHold;
    set({ isOnHold: nextHoldState });
    console.log(`[DIALER HOLD] Toggled hold: ${nextHoldState}`);
  },

  dropVoicemail: async (voicemailUrl: string) => {
    const activeCall = get().activeCall;
    console.log(`[DIALER VOICEMAIL DROP] Dropping voicemail audio: ${voicemailUrl}`);
    
    try {
      // Trigger TwiML Play & Hangup on active call
      if (activeCall) {
        await api.post('/twilio/voice', {
          To: get().currentLead?.phone,
          VoicemailUrl: voicemailUrl,
        });
        activeCall.disconnect();
      } else {
        // Mock voicemail drop simulation
        get().hangup();
      }
    } catch (error) {
      console.error('[VOICEMAIL DROP ERROR]', error);
    }
  },

  setDisposition: async (disposition: string, notes: string, leadStatus?: string) => {
    const lead = get().currentLead;
    if (!lead) return;

    try {
      // Call disposition PATCH endpoint to record wrapping details
      // Locate active Call SID (or use mock Call ID)
      const callHistoryResponse = await api.get('/calls/history?limit=1');
      const latestCall = callHistoryResponse.data.data.calls[0];

      if (latestCall) {
        await api.patch(`/calls/${latestCall.id}/disposition`, {
          disposition,
          noteText: notes,
          leadStatus: leadStatus || lead.status,
        });
      }

      get().resetDialer();
    } catch (error) {
      console.error('[SET DISPOSITION ERROR]', error);
    }
  },

  resetDialer: () => {
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = null;
    }
    set({
      callStatus: 'idle',
      activeCall: null,
      currentLead: null,
      isMuted: false,
      isOnHold: false,
      callDuration: 0,
    });
  },
}));
