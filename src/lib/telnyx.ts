/**
 * Telnyx VoIP Integration Helper
 * 
 * Supports outbound calling via Telnyx Call Control API.
 * Falls back to Mock Carrier Mode if environment variables are not configured.
 */

interface TelnyxCallResponse {
  success: boolean;
  call_control_id?: string;
  provider: 'telnyx' | 'mock';
  details?: any;
  mock?: boolean;
  call_status?: string;
  call_id?: string;
}

export async function createOutboundCall(
  toNumber: string,
  fromNumberOverride?: string
): Promise<TelnyxCallResponse> {
  const apiKey = process.env.TELNYX_API_KEY;
  const connectionId = process.env.TELNYX_CONNECTION_ID;
  const defaultFromNumber = process.env.TELNYX_FROM_NUMBER || '+12345678900';
  const fromNumber = fromNumberOverride || defaultFromNumber;

  // 1. Check if we have active Telnyx configurations. If not, trigger Mock Carrier Mode.
  const isMockMode = 
    !apiKey || 
    apiKey === 'your-telnyx-api-key' || 
    apiKey.startsWith('your-') ||
    !connectionId || 
    connectionId === 'your-telnyx-call-control-connection-id' ||
    connectionId.startsWith('your-');

  if (isMockMode) {
    const timestamp = Date.now();
    const mockId = `mock_${timestamp}`;
    console.log(`[MOCK CARRIER] Dialing outbound call: From ${fromNumber} to ${toNumber}. Call ID: ${mockId}`);
    return {
      success: true,
      mock: true,
      call_status: 'initiated',
      call_id: mockId,
      call_control_id: mockId,
      provider: 'mock',
    };
  }

  // 2. Perform live API request to Telnyx
  try {
    const response = await fetch('https://api.telnyx.com/v2/calls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        connection_id: connectionId,
        to: toNumber,
        from: fromNumber,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TELNYX ERROR] Failed to originate call:', errorText);
      throw new Error(errorText); // Throw raw provider response text
    }

    const payload = await response.json();
    const callControlId = payload.data?.call_control_id;

    if (!callControlId) {
      throw new Error('Telnyx call origin response did not contain call_control_id');
    }

    return {
      success: true,
      call_control_id: callControlId,
      provider: 'telnyx',
      details: payload.data,
    };
  } catch (error: any) {
    console.error('[TELNYX EXCEPTION]', error.message);
    throw error;
  }
}
