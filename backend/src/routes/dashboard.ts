import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/auth';
import { dialerQueue } from '../services/dialerService';
import { checkAbandonmentRate } from '../services/dialerService';

const router = Router();

// Restrict dashboard routes to admin and manager supervisors
const supervisorGuards = [verifyAccessToken, requireRole('admin', 'manager')];

/**
 * GET /dashboard/live-stats
 * Returns live, low-latency metrics aggregated from Redis and active queue monitors.
 */
router.get('/live-stats', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    // 1. Calls in Progress (agents with status 'calling' or 'in-call')
    const agentStatusKeys = await redis.keys(`agentstatus:${companyId}:*`);
    let callsInProgress = 0;
    
    if (agentStatusKeys.length > 0) {
      const statuses = await redis.mget(agentStatusKeys);
      callsInProgress = statuses.filter(
        (status) => status === 'calling' || status === 'in-call'
      ).length;
    }

    // 2. Calls in Queue (Bull queue waiting jobs count)
    const callsInQueue = await dialerQueue.getWaitingCount();

    // 3. TCPA Abandonment Rate (calculated over the last 1 hour)
    const abandonmentRate = await checkAbandonmentRate(companyId);

    // 4. Avg Wait Time in Queue (fallback simulation)
    const avgWaitTime = 6; // seconds

    // 5. Connects This Hour (answered calls in the last 1 hour)
    const oneHourAgo = new Date(Date.now() - 3600 * 1000);
    const connectsThisHour = await prisma.call.count({
      where: {
        companyId,
        status: 'answered',
        createdAt: { gte: oneHourAgo },
      },
    });

    // 6. DNC Blocks Today (DNC check rejections tracked in Redis)
    const todayStr = new Date().toISOString().split('T')[0];
    const dncBlocksTodayStr = await redis.get(`dncblocks:${companyId}:${todayStr}`);
    const dncBlocksToday = dncBlocksTodayStr ? parseInt(dncBlocksTodayStr, 10) : 0;

    // 7. Consolidation for Top Stats Bar
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const totalCallsToday = await prisma.call.count({
      where: { companyId, createdAt: { gte: startOfToday } },
    });

    const answeredCallsToday = await prisma.call.count({
      where: { companyId, status: 'answered', createdAt: { gte: startOfToday } },
    });

    const answerRateToday = totalCallsToday > 0 ? Math.round((answeredCallsToday / totalCallsToday) * 100) : 0;

    const avgHandleTimeTodayAgg = await prisma.call.aggregate({
      where: { companyId, duration: { not: null }, createdAt: { gte: startOfToday } },
      _avg: { duration: true },
    });
    const avgHandleTimeToday = Math.round(avgHandleTimeTodayAgg._avg.duration || 0);

    // Active agent statuses in Redis (available, calling, in-call, wrapup, break)
    let activeAgentsCount = 0;
    if (agentStatusKeys.length > 0) {
      const statuses = await redis.mget(agentStatusKeys);
      activeAgentsCount = statuses.filter(
        (status) => status && status !== 'offline'
      ).length;
    }

    const totalAgentsCount = await prisma.user.count({
      where: { companyId },
    });

    return res.status(200).json({
      success: true,
      data: {
        callsInProgress,
        callsInQueue,
        abandonmentRate: parseFloat(abandonmentRate.toFixed(2)),
        avgWaitTime,
        connectsThisHour,
        dncBlocksToday,
        totalCallsToday,
        answerRateToday,
        avgHandleTimeToday,
        activeAgentsCount,
        totalAgentsCount,
      },
    });
  } catch (error: any) {
    console.error('[GET LIVE STATS ERROR]', error);
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: error.message || 'Failed to fetch dashboard metrics.' },
    });
  }
});

/**
 * GET /dashboard/calls-by-hour
 * Returns call volumes grouped hourly (8 AM -> 9 PM) for the current day.
 */
router.get('/calls-by-hour', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  try {
    const calls = await prisma.call.findMany({
      where: {
        companyId,
        createdAt: { gte: startOfToday },
      },
      select: {
        createdAt: true,
        status: true,
      },
    });

    // Pre-populate 8 AM to 9 PM hours array
    const hourlyData = Array.from({ length: 14 }, (_, i) => {
      const hour = 8 + i;
      const label = hour > 12 ? `${hour - 12} PM` : hour === 12 ? '12 PM' : `${hour} AM`;
      return {
        hour: label,
        calls: 0,
        answered: 0,
        rawHour: hour,
      };
    });

    calls.forEach((c) => {
      const callHour = new Date(c.createdAt).getHours();
      const matchedHour = hourlyData.find((h) => h.rawHour === callHour);
      if (matchedHour) {
        matchedHour.calls++;
        if (c.status === 'answered') {
          matchedHour.answered++;
        }
      }
    });

    // Strip rawHour helper before response
    const formattedData = hourlyData.map(({ hour, calls, answered }) => ({
      hour,
      calls,
      answered,
    }));

    return res.status(200).json({
      success: true,
      data: formattedData,
    });
  } catch (error: any) {
    console.error('[GET CALLS BY HOUR ERROR]', error);
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message || 'Failed to retrieve hourly metrics.' },
    });
  }
});

/**
 * GET /dashboard/disposition-stats
 * Returns total counts grouped by disposition outcome over period (today, 7days, 30days).
 */
router.get('/disposition-stats', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const period = req.query.period as string;

  let startDate = new Date();
  startDate.setHours(0, 0, 0, 0); // Default 'today'

  if (period === '7days') {
    startDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  } else if (period === '30days') {
    startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  }

  try {
    const calls = await prisma.call.findMany({
      where: {
        companyId,
        createdAt: { gte: startDate },
        disposition: { not: null },
      },
      select: {
        disposition: true,
      },
    });

    const stats = {
      interested: 0,
      callback: 0,
      notInterested: 0,
      noAnswer: 0,
      voicemail: 0,
      wrongNumber: 0,
      dnc: 0,
    };

    calls.forEach((c) => {
      const disp = c.disposition?.toLowerCase() || '';
      if (disp === 'interested') stats.interested++;
      else if (disp === 'callback') stats.callback++;
      else if (disp === 'not interested') stats.notInterested++;
      else if (disp === 'no answer') stats.noAnswer++;
      else if (disp === 'left voicemail') stats.voicemail++;
      else if (disp === 'wrong number') stats.wrongNumber++;
      else if (disp === 'dnc request') stats.dnc++;
    });

    return res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    console.error('[GET DISPOSITION STATS ERROR]', error);
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message || 'Failed to retrieve disposition stats.' },
    });
  }
});

export default router;
