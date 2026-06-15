import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * Verifies Ed25519 signature from Telnyx webhook payload using native Node.js crypto.
 * Wraps raw 32-byte Ed25519 public key into standard SPKI DER format.
 */
function verifyTelnyxSignature(
  publicKeyHex: string,
  signatureBase64: string,
  timestamp: string,
  rawBody: string
): boolean {
  try {
    const publicKeyBuffer = Buffer.from(publicKeyHex, 'hex');
    const signatureBuffer = Buffer.from(signatureBase64, 'base64');

    // SPKI DER prefix for Ed25519 keys (12 bytes)
    const spkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
    const fullSpkiKey = Buffer.concat([spkiPrefix, publicKeyBuffer]);

    const key = crypto.createPublicKey({
      key: fullSpkiKey,
      format: 'der',
      type: 'spki',
    });

    const dataPayload = timestamp + '|' + rawBody;

    return crypto.verify(
      null,
      Buffer.from(dataPayload, 'utf8'),
      key,
      signatureBuffer
    );
  } catch (err: any) {
    console.error('[SIGNATURE ERROR] Cryptographic verification failed:', err.message);
    return false;
  }
}

/**
 * POST /api/webhooks/telnyx
 * 
 * Secure Webhook Listener with Ed25519 verification, Replay window checks,
 * and Upgraded collision-resistant idempotency checks.
 */
export async function POST(req: NextRequest) {
  try {
    // 1. Read headers and raw text body for verification
    const signature = req.headers.get('telnyx-signature-ed25519');
    const timestamp = req.headers.get('telnyx-timestamp');
    const rawBody = await req.text();

    const publicKey = process.env.TELNYX_PUBLIC_KEY;

    // A. Ed25519 Signature Validation (Strict in Production, Warning in Dev)
    if (publicKey) {
      if (!signature || !timestamp) {
        return NextResponse.json({ error: 'Missing Telnyx signing headers' }, { status: 401 });
      }

      // Replay Attack protection: check if timestamp is within a 5-minute window
      const now = Math.floor(Date.now() / 1000);
      const requestTime = parseInt(timestamp, 10);
      if (Math.abs(now - requestTime) > 300) {
        return NextResponse.json({ error: 'Request timestamp is outside the valid 5-minute replay window' }, { status: 401 });
      }

      // Verify cryptographic signature
      const isValid = verifyTelnyxSignature(publicKey, signature, timestamp, rawBody);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid Ed25519 signature' }, { status: 401 });
      }
    } else {
      console.warn('[SECURITY WARNING] TELNYX_PUBLIC_KEY is not configured. Webhook signature validation is bypassed for local development.');
    }

    // 2. Parse JSON payload
    const payload = JSON.parse(rawBody);
    const event = payload.data;

    if (!event || !event.event_type || !event.payload || !event.id) {
      return NextResponse.json({ error: 'Malformed payload structure' }, { status: 400 });
    }

    const eventId = event.id; // Unique event UUID from Telnyx
    const eventType = event.event_type;
    const callControlId = event.payload.call_control_id;

    if (!callControlId) {
      return NextResponse.json({ success: true, message: 'Non-call control event received' });
    }

    const supabaseAdmin = getSupabaseAdminClient();

    // B. Webhook Idempotency & Collision Protection (Upgraded)
    // Compute payload hash and insert with event_id, event_type, and provider
    const payloadHash = crypto.createHash('sha256').update(rawBody).digest('hex');
    const { error: idempotencyError } = await supabaseAdmin
      .from('webhook_events')
      .insert({
        event_id: eventId,
        event_type: eventType,
        provider: 'telnyx',
        payload_hash: payloadHash,
      });

    if (idempotencyError) {
      if (idempotencyError.code === '23505') {
        console.log(`[WEBHOOK IDEMPOTENCY] Event ${eventId} (${eventType}) already processed. Skipping duplicate processing.`);
        return NextResponse.json({ success: true, duplicated: true });
      }
      return NextResponse.json({ error: 'Failed to record idempotency log', details: idempotencyError.message }, { status: 500 });
    }

    let statusUpdate: 'initiated' | 'ringing' | 'answered' | 'completed' | 'failed' | null = null;
    let duration: number | null = null;
    let recordingUrl: string | null = null;

    // Map Telnyx voice events to Call states
    switch (eventType) {
      case 'call.initiated':
        statusUpdate = 'initiated';
        break;
      case 'call.ringing':
        statusUpdate = 'ringing';
        break;
      case 'call.answered':
        statusUpdate = 'answered';
        break;
      case 'call.hangup':
        statusUpdate = 'completed';
        if (event.payload.duration) {
          duration = Math.round(Number(event.payload.duration));
        }
        break;
      case 'call.recording.saved':
        recordingUrl = event.payload.recording_urls?.mp3 || event.payload.recording_urls?.wav || null;
        break;
      default:
        return NextResponse.json({ success: true, message: `Ignored event: ${eventType}` });
    }

    // Update database call record status (Bypassing RLS)
    if (statusUpdate) {
      const updatePayload: any = { status: statusUpdate };
      if (duration !== null) updatePayload.duration = duration;

      const { error } = await supabaseAdmin
        .from('calls')
        .update(updatePayload)
        .eq('voip_call_sid', callControlId);

      if (error) {
        console.error('[DATABASE ERROR] Webhook call status update failed:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    if (recordingUrl) {
      const { error } = await supabaseAdmin
        .from('calls')
        .update({ recording_url: recordingUrl })
        .eq('voip_call_sid', callControlId);

      if (error) {
        console.error('[DATABASE ERROR] Webhook call recording url update failed:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[WEBHOOK EXCEPTION] Signature or payload parsing crashed:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
