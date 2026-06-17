import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import twilio from 'twilio';
import prisma from '../lib/prisma';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import { validateCallLegal } from '../services/tcpaService';
import redis from '../lib/redis';

const router = Router();

/**
 * Express middleware to validate TCPA compliance and DNC records before call routing.
 */
export async function requireTCPA(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Destination phone number is required in request payload.',
      },
    });
  }

  const companyId = req.user?.companyId;
  if (!companyId) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Tenant context is missing from authorization headers.',
      },
    });
  }

  try {
    const compliance = await validateCallLegal(phone, companyId);
    if (!compliance.allowed) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'TCPA_RESTRICTED',
          message: compliance.reason || 'Call blocked by TCPA calling hour constraints or DNC registration.',
        },
      });
    }

    return next();
  } catch (error: any) {
    console.error('[TCPA MIDDLEWARE ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Failed to run TCPA compliance pre-flight checks.',
      },
    });
  }
}

const initiateCallSchema = z.object({
  leadId: z.string().uuid('Invalid leadId UUID format'),
  campaignId: z.string().uuid('Invalid campaignId UUID format').optional(),
  phone: z.string().min(5, 'Phone number must be at least 5 characters'),
});

const updateDispositionSchema = z.object({
  disposition: z.string().min(1, 'Disposition label is required'),
  noteText: z.string().optional(),
  leadStatus: z.string().optional(), // Optionally updates status of main lead table (Contacted, Interested, etc.)
});

/**
 * POST /calls/initiate
 * Performs TCPA validations and records a new outgoing call session in DB.
 */
router.post('/initiate', verifyAccessToken, requireTCPA, async (req: AuthenticatedRequest, res: Response) => {
  const parseResult = initiateCallSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0].message,
      },
    });
  }

  const { leadId, campaignId, phone } = parseResult.data;
  const companyId = req.user!.companyId;
  const agentId = req.user!.id;

  try {
    // 1. Determine Local Presence Caller ID from database pool
    // Extract target area code (USA: e.g. +13105550199 -> 310)
    let areaCode = '';
    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length === 11 && cleanDigits.startsWith('1')) {
      areaCode = cleanDigits.substring(1, 4);
    } else if (cleanDigits.length === 10) {
      areaCode = cleanDigits.substring(0, 3);
    }

    const matchedCallerId = await prisma.callerIDPool.findFirst({
      where: {
        companyId,
        areaCode,
        isActive: true,
      },
    });

    const callerId = matchedCallerId?.phoneNumber || process.env.TWILIO_NUMBER || '+1234567890';

    // 2. Originate call via Twilio REST API
    let twilioCallSid = `mock_${Math.random().toString(36).substring(2) + Date.now().toString(36)}`;
    
    const isTwilioConfigured =
      process.env.TWILIO_ACCOUNT_SID &&
      !process.env.TWILIO_ACCOUNT_SID.includes('ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

    if (isTwilioConfigured) {
      const protocol = (req.headers['x-forwarded-proto'] as string) || req.protocol;
      const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
      const callbackBaseUrl = `${protocol}://${host}`;

      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const call = await twilioClient.calls.create({
        from: callerId,
        to: phone,
        url: `${callbackBaseUrl}/twilio/voice`,
        statusCallback: `${callbackBaseUrl}/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      });
      twilioCallSid = call.sid;
    }

    // 3. Save Call record in Database
    const callRecord = await prisma.call.create({
      data: {
        companyId,
        userId: agentId,
        leadId,
        campaignId: campaignId || null,
        phoneNumber: phone,
        status: 'initiated',
        voipCallSid: twilioCallSid,
      },
    });

    // Publish update to Redis Pub/Sub for Supervisor dashboard
    await redis.publish(
      'call-updates',
      JSON.stringify({
        callId: callRecord.id,
        companyId,
        status: 'initiated',
      })
    );

    return res.status(201).json({
      success: true,
      data: {
        callId: callRecord.id,
        twilioCallSid: callRecord.voipCallSid,
      },
    });
  } catch (error: any) {
    console.error('[INITIATE OUTBOUND CALL ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Outbound call origin failed.',
      },
    });
  }
});

/**
 * GET /calls/:callId
 * Fetch single call log detail.
 */
router.get('/:callId', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  const { callId } = req.params;
  const companyId = req.user!.companyId;

  try {
    const call = await prisma.call.findFirst({
      where: { id: callId, companyId },
      include: { lead: true, user: true },
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Call log record not found.' },
      });
    }

    return res.status(200).json({
      success: true,
      data: call,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: error.message },
    });
  }
});

/**
 * PATCH /calls/:callId/disposition
 * Agent disposition input after wrapping up calls.
 */
router.patch('/:callId/disposition', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  const { callId } = req.params;
  const companyId = req.user!.companyId;
  const agentId = req.user!.id;

  const parseResult = updateDispositionSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: parseResult.error.errors[0].message,
      },
    });
  }

  const { disposition, noteText, leadStatus } = parseResult.data;

  try {
    const call = await prisma.call.findFirst({
      where: { id: callId, companyId },
    });

    if (!call) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Call log record not found.' },
      });
    }

    // Atomically save notes, update call disposition, and set lead status
    await prisma.$transaction(async (tx) => {
      // 1. Update Call Disposition
      await tx.call.update({
        where: { id: callId },
        data: { disposition },
      });

      // 2. Add Call wrapping note
      if (noteText) {
        await tx.note.create({
          data: {
            companyId,
            leadId: call.leadId,
            userId: agentId,
            noteText,
          },
        });
      }

      // 3. Update main Lead status (if CRM status shift is requested)
      if (leadStatus) {
        await tx.lead.update({
          where: { id: call.leadId },
          data: { status: leadStatus },
        });
      }

      // 4. Update CampaignLead Queue entry based on disposition
      const campaignLead = await tx.campaignLead.findFirst({
        where: {
          leadId: call.leadId,
          campaignId: call.campaignId || undefined,
        },
      });

      if (campaignLead) {
        // Recycle to queue if callback is scheduled, else mark completed
        const updatedStatus = disposition.toLowerCase() === 'callback' ? 'pending' : 'completed';
        await tx.campaignLead.update({
          where: { id: campaignLead.id },
          data: {
            status: updatedStatus,
            lockedBy: null,
            lockedAt: null,
            callAttempts: { increment: 1 },
          },
        });
      }
    });

    // Publish update to Redis Pub/Sub for Supervisor dashboard
    await redis.publish(
      'call-updates',
      JSON.stringify({
        callId,
        companyId,
        status: 'dispositioned',
        disposition,
      })
    );

    return res.status(200).json({
      success: true,
      message: 'Call outcome disposition saved successfully.',
    });
  } catch (error: any) {
    console.error('[SAVE DISPOSITION ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to record call wrapping disposition.',
      },
    });
  }
});

/**
 * GET /calls/history
 * Paginated calls logs history for the active logged-in agent.
 */
router.get('/history', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const agentId = req.user!.id;

  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 10;
  const skip = (page - 1) * limit;

  try {
    const [calls, total] = await prisma.$transaction([
      prisma.call.findMany({
        where: { companyId, userId: agentId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          lead: {
            select: { name: true, phone: true, email: true },
          },
        },
      }),
      prisma.call.count({
        where: { companyId, userId: agentId },
      }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        calls,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error: any) {
    console.error('[FETCH CALL HISTORY ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to retrieve call logs history.',
      },
    });
  }
});

export default router;
