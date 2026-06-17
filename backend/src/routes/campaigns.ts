import { Router, Response } from 'express';
import { z } from 'zod';
import prisma from '../lib/prisma';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import { enforceTenancy } from '../middleware/tenancy';
import * as dialerService from '../services/dialerService';

const router = Router();

const campaignSchema = z.object({
  name: z.string().min(2, 'Campaign name must be at least 2 characters'),
  mode: z.enum(['power', 'preview']).default('power'),
  linesPerAgent: z.number().int().min(1).max(3).default(1),
});

const addLeadsSchema = z.object({
  leadIds: z.array(z.string().uuid('Invalid lead ID format')),
});

/**
 * GET /campaigns
 * Lists all campaigns belonging to the company tenant context.
 */
router.get('/', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = (req as any).companyId;

  try {
    const campaigns = await prisma.campaign.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: campaigns,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * POST /campaigns
 * Creates a new campaign.
 */
router.post('/', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = (req as any).companyId;

  const parseResult = campaignSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parseResult.error.errors[0].message },
    });
  }

  const { name, mode, linesPerAgent } = parseResult.data;

  try {
    const campaign = await prisma.campaign.create({
      data: {
        companyId,
        name,
        mode,
        linesPerAgent,
        status: 'paused', // Defaults to paused/draft state
      },
    });

    return res.status(201).json({
      success: true,
      data: campaign,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * GET /campaigns/:id
 * Fetches campaign details and progress metrics.
 */
router.get('/:id', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = (req as any).companyId;

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId },
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Campaign not found.' },
      });
    }

    // Calculate queue progress
    const totalLeads = await prisma.campaignLead.count({ where: { campaignId: id } });
    const completedLeads = await prisma.campaignLead.count({ where: { campaignId: id, status: 'completed' } });
    const skippedLeads = await prisma.campaignLead.count({ where: { campaignId: id, status: 'skipped' } });
    
    const progress = totalLeads > 0 ? Math.round(((completedLeads + skippedLeads) / totalLeads) * 100) : 0;

    return res.status(200).json({
      success: true,
      data: {
        campaign,
        metrics: {
          totalLeads,
          completedLeads,
          skippedLeads,
          progress,
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * PATCH /campaigns/:id
 * Modifies campaign configuration parameters.
 */
router.patch('/:id', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = (req as any).companyId;

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId },
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Campaign not found or unauthorized.' },
      });
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: req.body,
    });

    return res.status(200).json({
      success: true,
      data: updated,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * POST /campaigns/:id/start
 * Starts the campaign queue dialing routines.
 */
router.post('/:id/start', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = (req as any).companyId;

  try {
    await dialerService.startCampaign(id, companyId);
    return res.status(200).json({
      success: true,
      message: 'Campaign dialer processing started.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DIALER_START_FAILED', message: error.message },
    });
  }
});

/**
 * POST /campaigns/:id/pause
 * Pauses campaign dialing queue.
 */
router.post('/:id/pause', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = (req as any).companyId;

  try {
    await dialerService.pauseCampaign(id, companyId);
    return res.status(200).json({
      success: true,
      message: 'Campaign dialer processing paused.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DIALER_PAUSE_FAILED', message: error.message },
    });
  }
});

/**
 * POST /campaigns/:id/leads
 * Adds existing CRM leads to the campaign queue junction.
 */
router.post('/:id/leads', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = (req as any).companyId;

  const parseResult = addLeadsSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parseResult.error.errors[0].message },
    });
  }

  const { leadIds } = parseResult.data;

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId },
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Campaign not found.' },
      });
    }

    const campaignLeadsData = leadIds.map((leadId) => ({
      campaignId: id,
      leadId,
      companyId,
      status: 'pending',
      priority: 0,
    }));

    // Perform bulk insertion skipping conflicts if the lead is already queued
    for (const cl of campaignLeadsData) {
      await prisma.campaignLead.upsert({
        where: {
          campaignId_leadId: {
            campaignId: cl.campaignId,
            leadId: cl.leadId,
          },
        },
        update: {
          status: 'pending', // Recycle to queue if they already existed
        },
        create: cl,
      });
    }

    return res.status(201).json({
      success: true,
      message: `${leadIds.length} leads successfully assigned to the campaign queue.`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * POST /campaigns/:id/next-lead
 * Atomic extraction and agent locking of the next pending lead in the campaign queue.
 */
router.post('/:id/next-lead', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = (req as any).companyId;
  const agentId = req.user!.id;

  try {
    const nextLead = await prisma.$transaction(async (tx) => {
      // Find the highest priority pending lead in the campaign queue
      const campaignLead = await tx.campaignLead.findFirst({
        where: {
          campaignId: id,
          companyId,
          status: 'pending',
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'asc' },
        ],
        include: {
          lead: true,
        },
      });

      if (!campaignLead) return null;

      // Transition to calling status and assign to current agent
      const updatedCampaignLead = await tx.campaignLead.update({
        where: { id: campaignLead.id },
        data: {
          status: 'calling',
          lockedBy: agentId,
          lockedAt: new Date(),
        },
      });

      return {
        ...campaignLead.lead,
        campaignLeadId: updatedCampaignLead.id,
      };
    });

    if (!nextLead) {
      return res.status(200).json({
        success: true,
        data: null,
        message: 'Queue is empty: no more pending leads found.',
      });
    }

    return res.status(200).json({
      success: true,
      data: nextLead,
    });
  } catch (error: any) {
    console.error('[NEXT LEAD QUEUE EXCEPTION]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'Failed to pull next lead from queue.',
      },
    });
  }
});

/**
 * POST /campaigns/:id/skip
 * Marks a campaign lead as skipped so the agent can bypass it.
 */
router.post('/:id/skip', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { leadId } = req.body;
  const companyId = (req as any).companyId;

  if (!leadId) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'leadId is required in payload.' },
    });
  }

  try {
    await prisma.campaignLead.updateMany({
      where: {
        campaignId: id,
        leadId,
        companyId,
      },
      data: {
        status: 'skipped',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Lead marked as skipped in campaign queue.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * DELETE /campaigns/:id
 * Soft delete a campaign (only allowed if campaign state is paused/draft).
 */
router.delete('/:id', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = (req as any).companyId;

  try {
    const campaign = await prisma.campaign.findFirst({
      where: { id, companyId },
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Campaign not found.' },
      });
    }

    // Only allow deletion of paused/draft campaigns (not active ones)
    if (campaign.status === 'active') {
      return res.status(400).json({
        success: false,
        error: {
          code: 'ACTIVE_CAMPAIGN',
          message: 'Active campaigns cannot be deleted. Please pause the campaign first.',
        },
      });
    }

    // Delete the campaign (cascade will delete its CampaignLeads in schema)
    await prisma.campaign.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'Campaign deleted successfully.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

export default router;
