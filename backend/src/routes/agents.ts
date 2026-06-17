import { Router, Response } from 'express';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import { enforceTenancy } from '../middleware/tenancy';
import { setAgentStatus, getAgentStatus } from '../services/dialerService';
import prisma from '../lib/prisma';

const router = Router();

/**
 * PATCH /agents/status
 * Updates the calling state/status of an active agent in Redis & Database.
 */
router.patch('/status', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { status } = req.body;
  const agentId = req.user!.id;
  const companyId = req.user!.companyId;

  if (!status) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Status payload is required.',
      },
    });
  }

  try {
    await setAgentStatus(agentId, status, companyId);
    return res.status(200).json({
      success: true,
      message: 'Agent status updated successfully.',
    });
  } catch (error: any) {
    console.error('[AGENT STATUS PATCH ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to update agent status.',
      },
    });
  }
});

/**
 * GET /agents/status
 * Fetch status of all agents in the company (for managers/admins) or single active agent (for agents).
 */
router.get('/status', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const agentId = req.user!.id;
  const companyId = (req as any).companyId || req.user!.companyId;
  const role = req.user!.role;

  try {
    if (role === 'admin' || role === 'manager') {
      // Fetch all users belonging to this company tenant context
      const users = await prisma.user.findMany({
        where: { companyId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);

      // Aggregate status for each agent from Redis + PostgreSQL
      const agentsList = await Promise.all(
        users.map(async (user: any) => {
          const status = await getAgentStatus(user.id);
          const name = user.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user.email;

          // Compute agent calls volume today
          const callsToday = await prisma.call.count({
            where: { userId: user.id, createdAt: { gte: startOfToday } },
          });

          // Compute agent answer rate today
          const totalToday = await prisma.call.count({
            where: { userId: user.id, createdAt: { gte: startOfToday } },
          });
          const answeredToday = await prisma.call.count({
            where: { userId: user.id, status: 'answered', createdAt: { gte: startOfToday } },
          });
          const answerRate = totalToday > 0 ? Math.round((answeredToday / totalToday) * 100) : 0;

          // Compute average call handling duration
          const durationAgg = await prisma.call.aggregate({
            where: { userId: user.id, duration: { not: null }, createdAt: { gte: startOfToday } },
            _avg: { duration: true },
          });
          const avgHandleTime = Math.round(durationAgg._avg.duration || 0);

          // Find current call details if active
          const activeCall = await prisma.call.findFirst({
            where: {
              userId: user.id,
              status: { in: ['initiated', 'ringing', 'answered'] },
            },
            orderBy: { createdAt: 'desc' },
          });

          return {
            agentId: user.id,
            name,
            status,
            currentCallSid: activeCall?.voipCallSid || null,
            callStartTime: activeCall?.createdAt || null,
            callsToday,
            avgHandleTime,
            answerRate,
          };
        })
      );

      return res.status(200).json({
        success: true,
        data: agentsList,
      });
    } else {
      // Normal Agent payload fallback
      const status = await getAgentStatus(agentId);
      return res.status(200).json({
        success: true,
        data: {
          status,
        },
      });
    }
  } catch (error: any) {
    console.error('[GET AGENTS STATUS ALL ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to fetch agent status.',
      },
    });
  }
});

export default router;
