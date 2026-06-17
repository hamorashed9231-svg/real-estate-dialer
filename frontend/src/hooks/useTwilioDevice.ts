import { useEffect } from 'react';
import { Device, Call } from '@twilio/voice-sdk';

/**
 * Custom hook to manage Twilio Device registration and cleanups.
 */
export function useTwilioDevice(token: string | null, onRegistered?: () => void, onError?: (err: any) => void) {
  useEffect(() => {
    if (!token || token.startsWith('mock_')) return;

    console.log('[useTwilioDevice] Registering Twilio Device...');
    const device = new Device(token, {
      codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
    });

    device.on('registered', () => {
      console.log('[useTwilioDevice] Device registered successfully.');
      if (onRegistered) onRegistered();
    });

    device.on('error', (error) => {
      console.error('[useTwilioDevice] Device error:', error.message);
      if (onError) onError(error);
    });

    device.register();

    return () => {
      console.log('[useTwilioDevice] Destroying Twilio Device...');
      device.destroy();
    };
  }, [token]);
}
