import twilio from 'twilio';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || 'ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'your_twilio_auth_token';
const TWILIO_TWIML_APP_SID = process.env.TWILIO_TWIML_APP_SID || 'APXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const TWILIO_API_KEY = process.env.TWILIO_API_KEY || 'SKXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
const TWILIO_API_SECRET = process.env.TWILIO_API_SECRET || 'your_twilio_api_secret';

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;
const VoiceResponse = twilio.twiml.VoiceResponse;

// Initialize Twilio client
const client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);

/**
 * Generates a WebRTC Capability Token for the browser agent client.
 */
export function generateClientToken(agentId: string, companyId: string): string {
  const token = new AccessToken(
    TWILIO_ACCOUNT_SID,
    TWILIO_API_KEY,
    TWILIO_API_SECRET,
    {
      identity: `agent_${agentId}`,
      ttl: 3600, // Valid for 1 hour
    }
  );

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: TWILIO_TWIML_APP_SID,
    incomingAllow: true, // Allow incoming WebRTC calls to this agent
  });

  token.addGrant(voiceGrant);

  return token.toJwt();
}

/**
 * Builds TwiML response for Outbound calling.
 */
export function buildOutboundTwiML(to: string, from: string, callbackBaseUrl: string): string {
  const response = new VoiceResponse();
  const dial = response.dial({
    callerId: from,
    timeout: 30,
    record: 'record-from-answer-dual', // Records call once answered
    recordingStatusCallback: `${callbackBaseUrl}/twilio/recording`,
    action: `${callbackBaseUrl}/twilio/status`,
    method: 'POST',
  });
  dial.number(to);
  return response.toString();
}

/**
 * Builds TwiML response for dropping a pre-recorded voicemail message.
 */
export function buildVoicemailTwiML(voicemailUrl: string): string {
  const response = new VoiceResponse();
  response.play(voicemailUrl);
  response.hangup();
  return response.toString();
}

/**
 * Fetches real-time call details from the Twilio REST API.
 */
export async function getCallDetails(callSid: string) {
  try {
    return await client.calls(callSid).fetch();
  } catch (error: any) {
    console.error(`[TWILIO SERVICE ERROR] Fetch call details failed for ${callSid}:`, error.message);
    throw error;
  }
}

/**
 * Cancels or terminates a call using its Call SID.
 * (Critical for hanging up concurrent dialer lines once a call is answered).
 */
export async function cancelCall(callSid: string) {
  try {
    return await client.calls(callSid).update({ status: 'completed' });
  } catch (error: any) {
    console.error(`[TWILIO SERVICE ERROR] Cancel call failed for ${callSid}:`, error.message);
    throw error;
  }
}

/**
 * Standardized path for Twilio audio recordings.
 */
export function getRecordingUrl(recordingSid: string): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Recordings/${recordingSid}.mp3`;
}
