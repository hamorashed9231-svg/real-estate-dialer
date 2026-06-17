import { Router, Request, Response, NextFunction } from 'express';
import twilio from 'twilio';
import prisma from '../lib/prisma';
import * as twilioService from '../services/twilioService';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import redis from '../lib/redis';

const router = Router();

const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || 'your_twilio_auth_token';

/**
 * Middleware to validate Twilio Webhook requests in production.
 */
function verifyTwilioWebhook(req: Request, res: Response, next: NextFunction) {
  // Bypass validation in non-production environments to ease local development/testing
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  const signature = req.headers['x-twilio-signature'] as string;
  if (!signature) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Twilio Signature validation failed: Header missing.',
      },
    });
  }

  // Handle standard reverse proxy forwarding headers for correct URL building
  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  const url = `${protocol}://${host}${req.originalUrl}`;

  // Twilio validates POST payloads from raw URL-encoded fields
  const isValid = twilio.validateRequest(TWILIO_AUTH_TOKEN, signature, url, req.body);
  if (!isValid) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Twilio Signature validation failed: Invalid cryptographic payload.',
      },
    });
  }

  return next();
}

/**
 * POST /twilio/token
 * Returns WebRTC Client Access Token for the authenticated agent.
 */
router.post('/token', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User context is missing.' },
      });
    }

    const token = twilioService.generateClientToken(req.user.id, req.user.companyId);

    return res.status(200).json({
      success: true,
      data: {
        token,
      },
    });
  } catch (error: any) {
    console.error('[TWILIO TOKEN ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to generate WebRTC token.',
      },
    });
  }
});

/**
 * POST /twilio/voice
 * TwiML Webhook endpoint invoked by Twilio voice setup to route outbound browser dial commands.
 */
router.post('/voice', verifyTwilioWebhook, async (req: Request, res: Response) => {
  const { To, From, to, from } = req.body;
  
  // Extract destination number (Vite SDK might pass it in uppercase/lowercase)
  const targetNumber = To || to;
  const outboundCallerId = From || from || process.env.TWILIO_NUMBER || '+1234567890';

  if (!targetNumber) {
    const response = new twilio.twiml.VoiceResponse();
    response.say('Error: Missing destination number.');
    res.type('text/xml');
    return res.send(response.toString());
  }

  const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  const callbackBaseUrl = `${protocol}://${host}`;

  const twiml = twilioService.buildOutboundTwiML(targetNumber, outboundCallerId, callbackBaseUrl);
  
  res.type('text/xml');
  return res.send(twiml);
});

/**
 * POST /twilio/status
 * Callback status webhook from Twilio to keep database calls synchronized.
 */
router.post('/status', verifyTwilioWebhook, async (req: Request, res: Response) => {
  const { CallSid, CallStatus, CallDuration } = req.body;

  try {
    let statusUpdate = 'initiated';
    let disposition = null;

    switch (CallStatus) {
      case 'ringing':
        statusUpdate = 'ringing';
        break;
      case 'answered':
      case 'in-progress':
        statusUpdate = 'answered';
        break;
      case 'completed':
        statusUpdate = 'completed';
        break;
      case 'busy':
        statusUpdate = 'failed';
        disposition = 'busy';
        break;
      case 'no-answer':
        statusUpdate = 'failed';
        disposition = 'no-answer';
        break;
      case 'failed':
        statusUpdate = 'failed';
        disposition = 'failed';
        break;
      default:
        statusUpdate = 'initiated';
    }

    const duration = CallDuration ? parseInt(CallDuration, 10) : undefined;

    // 1. Locate the Call record in the database
    const dbCall = await prisma.call.findUnique({
      where: { voipCallSid: CallSid },
    });

    if (dbCall) {
      // 2. Update the Call details
      await prisma.call.update({
        where: { voipCallSid: CallSid },
        data: {
          status: statusUpdate,
          duration: duration,
          disposition: disposition || undefined,
        },
      });

      // Publish update to Redis Pub/Sub for Supervisor dashboard
      await redis.publish(
        'call-updates',
        JSON.stringify({
          callId: dbCall.id,
          companyId: dbCall.companyId,
          status: statusUpdate,
          disposition,
        })
      );

      // 3. TCPA Handling: If call failed, recycle lead status back to pending in queue
      if (CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') {
        const campaignLead = await prisma.campaignLead.findFirst({
          where: {
            leadId: dbCall.leadId,
            campaignId: dbCall.campaignId || undefined,
          },
        });

        if (campaignLead) {
          await prisma.campaignLead.update({
            where: { id: campaignLead.id },
            data: {
              status: 'pending', // Recycle to dialer retry queue
              lockedBy: null,
              lockedAt: null,
              callAttempts: { increment: 1 },
            },
          });
        }
      }
    }

    res.type('text/xml');
    return res.send(new twilio.twiml.VoiceResponse().toString());
  } catch (error: any) {
    console.error('[TWILIO STATUS WEBHOOK EXCEPTION]', error);
    return res.status(500).send('Status callback handling failed');
  }
});

/**
 * POST /twilio/recording
 * Callback webhook containing links to finished audio recordings.
 */
router.post('/recording', verifyTwilioWebhook, async (req: Request, res: Response) => {
  const { CallSid, RecordingSid } = req.body;

  try {
    if (CallSid && RecordingSid) {
      const recordingUrl = twilioService.getRecordingUrl(RecordingSid);

      await prisma.call.update({
        where: { voipCallSid: CallSid },
        data: {
          recordingUrl,
        },
      });
    }

    res.type('text/xml');
    return res.send(new twilio.twiml.VoiceResponse().toString());
  } catch (error: any) {
    console.error('[TWILIO RECORDING WEBHOOK EXCEPTION]', error);
    return res.status(500).send('Recording callback handling failed');
  }
});

export default router;
