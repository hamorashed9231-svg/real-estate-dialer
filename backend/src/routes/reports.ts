import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/auth';

const router = Router();

const supervisorGuards = [verifyAccessToken, requireRole('admin', 'manager')];

/**
 * GET /reports/summary
 * Returns call summary counts and daily timeline lists.
 */
router.get('/summary', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const period = req.query.period as string;

  let startDate = new Date(Date.now() - 7 * 24 * 3600 * 1000); // Default 7d
  if (period === '1d') {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
  } else if (period === '30d') {
    startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  }

  try {
    const calls = await prisma.call.findMany({
      where: {
        companyId,
        createdAt: { gte: startDate },
      },
      select: {
        createdAt: true,
        status: true,
        disposition: true,
        duration: true,
      },
    });

    const totalCalls = calls.length;
    const answered = calls.filter((c) => c.status === 'answered').length;
    const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 0;

    const durationCalls = calls.filter((c) => c.duration !== null);
    const totalDuration = durationCalls.reduce((acc, c) => acc + (c.duration || 0), 0);
    const avgHandleTime = durationCalls.length > 0 ? Math.round(totalDuration / durationCalls.length) : 0;

    const voicemails = calls.filter((c) => c.disposition?.toLowerCase() === 'left voicemail').length;
    const converted = calls.filter((c) => c.disposition?.toLowerCase() === 'interested').length;

    // Daily Timeline grouping in memory to maintain DB independence (Pg/SQLite/etc.)
    const dailyMap: Record<string, { date: string; calls: number; answered: number }> = {};
    
    // Seed dates
    const daysCount = period === '1d' ? 1 : period === '30d' ? 30 : 7;
    for (let i = daysCount - 1; i >= 0; i--) {
      const dateStr = new Date(Date.now() - i * 24 * 3600 * 1000).toISOString().split('T')[0];
      dailyMap[dateStr] = { date: dateStr, calls: 0, answered: 0 };
    }

    calls.forEach((c) => {
      const dateStr = new Date(c.createdAt).toISOString().split('T')[0];
      if (dailyMap[dateStr]) {
        dailyMap[dateStr].calls++;
        if (c.status === 'answered') {
          dailyMap[dateStr].answered++;
        }
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        totalCalls,
        answered,
        answerRate,
        avgHandleTime,
        voicemails,
        converted,
        byDay: Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
      },
    });
  } catch (error: any) {
    console.error('[REPORTS SUMMARY EXCEPTION]', error);
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * GET /reports/agents
 * Compiles performance metrics for each active dialing agent.
 */
router.get('/agents', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const period = req.query.period as string;

  let startDate = new Date(Date.now() - 7 * 24 * 3600 * 1000); // Default 7d
  if (period === '1d') {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
  } else if (period === '30d') {
    startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  }

  try {
    const agents = await prisma.user.findMany({
      where: { companyId },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const report = await Promise.all(
      agents.map(async (agent) => {
        const agentName = agent.firstName ? `${agent.firstName} ${agent.lastName || ''}`.trim() : agent.email;

        const totalCalls = await prisma.call.count({
          where: { userId: agent.id, companyId, createdAt: { gte: startDate } },
        });

        const answered = await prisma.call.count({
          where: { userId: agent.id, companyId, status: 'answered', createdAt: { gte: startDate } },
        });

        const answerRate = totalCalls > 0 ? Math.round((answered / totalCalls) * 100) : 0;

        const durationAgg = await prisma.call.aggregate({
          where: { userId: agent.id, companyId, duration: { not: null }, createdAt: { gte: startDate } },
          _avg: { duration: true },
        });
        const avgHandleTime = Math.round(durationAgg._avg.duration || 0);

        const conversions = await prisma.call.count({
          where: { userId: agent.id, companyId, disposition: 'Interested', createdAt: { gte: startDate } },
        });

        const dncRequests = await prisma.call.count({
          where: { userId: agent.id, companyId, disposition: 'DNC Request', createdAt: { gte: startDate } },
        });

        const avgDialsToConnect = answered > 0 ? parseFloat((totalCalls / answered).toFixed(1)) : totalCalls;

        return {
          agentId: agent.id,
          name: agentName,
          callsMade: totalCalls,
          answerRate,
          avgHandleTime,
          avgDialsToConnect,
          conversions,
          dncRequests,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * GET /reports/campaigns
 * Compiles performance metrics for campaigns.
 */
router.get('/campaigns', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const campaigns = await prisma.campaign.findMany({
      where: { companyId },
      include: {
        campaignLeads: {
          select: {
            status: true,
          },
        },
      },
    });

    const report = await Promise.all(
      campaigns.map(async (c) => {
        const totalLeads = c.campaignLeads.length;
        const contacted = await prisma.call.count({
          where: { campaignId: c.id, companyId, status: 'answered' },
        });

        const contactedPercent = totalLeads > 0 ? Math.round((contacted / totalLeads) * 100) : 0;

        const interested = await prisma.call.count({
          where: { campaignId: c.id, companyId, disposition: 'Interested' },
        });

        const interestedPercent = totalLeads > 0 ? Math.round((interested / totalLeads) * 100) : 0;

        const conversionRate = contacted > 0 ? Math.round((interested / contacted) * 100) : 0;

        return {
          campaignId: c.id,
          name: c.name,
          totalLeads,
          contactedPercent,
          interestedPercent,
          conversionRate,
          status: c.status,
        };
      })
    );

    return res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * GET /reports/export
 * Compiles and returns CSV formatted file attachment streams.
 */
router.get('/export', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { type = 'calls', period = '7d' } = req.query;

  let startDate = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  if (period === '1d') {
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
  } else if (period === '30d') {
    startDate = new Date(Date.now() - 30 * 24 * 3600 * 1000);
  }

  try {
    let csvContent = '';
    const filename = `propdial-${type}-report-${new Date().toISOString().split('T')[0]}.csv`;

    if (type === 'calls') {
      const calls = await prisma.call.findMany({
        where: { companyId, createdAt: { gte: startDate } },
        include: { lead: true, user: true },
        orderBy: { createdAt: 'desc' },
      });

      // Headers
      csvContent += 'Date,Agent,Lead Name,Phone,Duration (sec),Status,Disposition\n';
      calls.forEach((c) => {
        const date = new Date(c.createdAt).toLocaleString().replace(/,/g, '');
        const agent = c.user ? `${c.user.firstName || ''} ${c.user.lastName || ''}`.trim() : 'Dialer System';
        const lead = c.lead?.name || 'Manual dial';
        const phone = c.phoneNumber;
        const duration = c.duration || 0;
        const status = c.status;
        const disp = c.disposition || 'None';

        csvContent += `${date},"${agent}","${lead}",${phone},${duration},${status},"${disp}"\n`;
      });
    } else if (type === 'agents') {
      const users = await prisma.user.findMany({
        where: { companyId },
        select: { id: true, firstName: true, lastName: true, email: true },
      });

      csvContent += 'Agent Name,Dials Made,Connect Rate (%),Avg Handle Time (sec),Conversions,DNC Requests\n';

      for (const u of users) {
        const name = u.firstName ? `${u.firstName} ${u.lastName || ''}`.trim() : u.email;
        const total = await prisma.call.count({ where: { userId: u.id, companyId, createdAt: { gte: startDate } } });
        const answered = await prisma.call.count({ where: { userId: u.id, companyId, status: 'answered', createdAt: { gte: startDate } } });
        const rate = total > 0 ? Math.round((answered / total) * 100) : 0;
        
        const durAgg = await prisma.call.aggregate({
          where: { userId: u.id, companyId, duration: { not: null }, createdAt: { gte: startDate } },
          _avg: { duration: true },
        });
        const handle = Math.round(durAgg._avg.duration || 0);

        const convs = await prisma.call.count({ where: { userId: u.id, companyId, disposition: 'Interested', createdAt: { gte: startDate } } });
        const dncs = await prisma.call.count({ where: { userId: u.id, companyId, disposition: 'DNC Request', createdAt: { gte: startDate } } });

        csvContent += `"${name}",${total},${rate},${handle},${convs},${dncs}\n`;
      }
    } else if (type === 'campaigns') {
      const campaigns = await prisma.campaign.findMany({
        where: { companyId },
        include: { campaignLeads: true },
      });

      csvContent += 'Campaign Name,Total Leads,Contacted (%),Interested (%),Status\n';

      for (const c of campaigns) {
        const leads = c.campaignLeads.length;
        const contacted = await prisma.call.count({ where: { campaignId: c.id, companyId, status: 'answered' } });
        const rate = leads > 0 ? Math.round((contacted / leads) * 100) : 0;

        const interested = await prisma.call.count({ where: { campaignId: c.id, companyId, disposition: 'Interested' } });
        const interestedRate = leads > 0 ? Math.round((interested / leads) * 100) : 0;

        csvContent += `"${c.name}",${leads},${rate},${interestedRate},${c.status}\n`;
      }
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(csvContent);
  } catch (error: any) {
    console.error('[REPORTS EXPORT ERROR]', error);
    return res.status(500).send('Failed to generate CSV export.');
  }
});

export default router;
