import { Router, Response, Request } from 'express';
import { z } from 'zod';
import multer from 'multer';
import Papa from 'papaparse';
import fs from 'fs';
import os from 'os';
import Queue from '../lib/mockQueue';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import { enforceTenancy } from '../middleware/tenancy';
import { checkDNC } from '../services/tcpaService';

const router = Router();
const upload = multer({ dest: os.tmpdir() });
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Initialize Bull Queue for background CSV imports
export const csvImportQueue = new Queue('csv-import-queue', REDIS_URL);

// Process CSV import queue in background
csvImportQueue.process(async (job) => {
  const { filePath, companyId, campaignId } = job.data;
  const jobId = job.id;

  try {
    await redis.set(`csv_job:${jobId}`, JSON.stringify({ status: 'processing', progress: 0 }), 'EX', 86400);

    const csvText = fs.readFileSync(filePath, 'utf-8');
    const parsed = (Papa as any).parse(csvText, {
      header: true,
      skipEmptyLines: true,
      trimHeaders: true,
    });

    const rows = parsed.data as any[];
    let imported = 0;
    let skipped = 0;
    const errors: { row: number; phone: string; error: string }[] = [];

    const chunkSize = 100;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      
      const leadsToUpsert: any[] = [];
      const campaignLeadsToCreate: any[] = [];

      for (let j = 0; j < chunk.length; j++) {
        const row = chunk[j];
        const rowNum = i + j + 1;

        const firstName = row.firstName || '';
        const lastName = row.lastName || '';
        const name = `${firstName} ${lastName}`.trim() || row.name || 'Unknown Lead';
        const rawPhone = row.phone;

        if (!rawPhone) {
          errors.push({ row: rowNum, phone: '', error: 'Missing phone number' });
          skipped++;
          continue;
        }

        // Validate & Format phone number to E.164
        const digits = rawPhone.replace(/\D/g, '');
        if (digits.length < 10) {
          errors.push({ row: rowNum, phone: rawPhone, error: 'Invalid phone number format (too short)' });
          skipped++;
          continue;
        }

        const formattedPhone = digits.length === 10 ? `+1${digits}` : `+${digits}`;

        // Check DNC
        const isDnc = await checkDNC(formattedPhone, companyId);
        if (isDnc) {
          errors.push({ row: rowNum, phone: formattedPhone, error: 'Call blocked: Number is on the Do Not Call (DNC) list.' });
          skipped++;
          continue;
        }

        const customFields = {
          address: row.address || null,
          city: row.city || null,
          state: row.state || null,
          zip: row.zip || null,
          source: row.source || null,
          notes: row.notes || null,
        };

        leadsToUpsert.push({
          companyId,
          name,
          phone: formattedPhone,
          email: row.email || null,
          status: 'New',
          customFields: customFields as any,
        });
      }

      // Perform Batch Upsert (ON CONFLICT DO UPDATE)
      if (leadsToUpsert.length > 0) {
        for (const leadData of leadsToUpsert) {
          try {
            const lead = await prisma.lead.upsert({
              where: {
                companyId_phone: {
                  companyId: leadData.companyId,
                  phone: leadData.phone,
                },
              },
              update: {
                name: leadData.name,
                email: leadData.email,
                customFields: leadData.customFields as any,
                isDeleted: false, // Restore soft-deleted leads if re-imported
              },
              create: leadData as any,
            });

            imported++;

            // If campaignId is specified, bind the lead to the campaign
            if (campaignId) {
              campaignLeadsToCreate.push({
                campaignId,
                leadId: lead.id,
                companyId,
                status: 'pending',
                priority: 0,
              });
            }
          } catch (e: any) {
            errors.push({ row: i + leadsToUpsert.indexOf(leadData) + 1, phone: leadData.phone, error: e.message });
            skipped++;
          }
        }
      }

      // Add leads to campaign junction queue
      if (campaignId && campaignLeadsToCreate.length > 0) {
        for (const cl of campaignLeadsToCreate) {
          await prisma.campaignLead.upsert({
            where: {
              campaignId_leadId: {
                campaignId: cl.campaignId,
                leadId: cl.leadId,
              },
            },
            update: {
              status: 'pending', // Reset status if already in campaign
            },
            create: cl,
          });
        }
      }

      // Update progress
      const progress = Math.round(((i + chunk.length) / rows.length) * 100);
      await redis.set(`csv_job:${jobId}`, JSON.stringify({ status: 'processing', progress }), 'EX', 86400);
    }

    // Save final status
    await redis.set(
      `csv_job:${jobId}`,
      JSON.stringify({ status: 'completed', progress: 100, imported, skipped, errors }),
      'EX',
      86400
    );
  } catch (error: any) {
    console.error('[CSV PROCESS EXCEPTION]', error);
    await redis.set(`csv_job:${jobId}`, JSON.stringify({ status: 'failed', error: error.message }), 'EX', 86400);
  } finally {
    // Clean up temp file
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// Zod schema for single lead
const leadSchema = z.object({
  name: z.string().min(2, 'Name is required'),
  phone: z.string().min(5, 'Phone number must be at least 5 digits'),
  email: z.string().email().optional().nullable(),
  status: z.string().optional(),
  customFields: z.record(z.any()).optional(),
});

/**
 * GET /leads
 * Paginated, filterable Leads CRM list.
 */
router.get('/', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = (req as any).companyId;
  
  const page = parseInt(req.query.page as string, 10) || 1;
  const limit = parseInt(req.query.limit as string, 10) || 50;
  const skip = (page - 1) * limit;

  const { status, campaignId, search } = req.query;

  const whereClause: any = {
    companyId,
    isDeleted: false,
  };

  if (status) {
    whereClause.status = status as string;
  }

  if (campaignId) {
    whereClause.campaignLeads = {
      some: {
        campaignId: campaignId as string,
      },
    };
  }

  if (search) {
    whereClause.OR = [
      { name: { contains: search as string, mode: 'insensitive' } },
      { phone: { contains: search as string } },
    ];
  }

  try {
    const [leads, total] = await prisma.$transaction([
      prisma.lead.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.lead.count({ where: whereClause }),
    ]);

    return res.status(200).json({
      success: true,
      data: {
        leads,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
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
 * POST /leads
 * Creates or updates (upserts) a single lead.
 */
router.post('/', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = (req as any).companyId;

  const parseResult = leadSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: parseResult.error.errors[0].message },
    });
  }

  const { name, phone, email, status = 'New', customFields = {} } = parseResult.data;

  // Format phone to E.164
  const digits = phone.replace(/\D/g, '');
  const formattedPhone = digits.length === 10 ? `+1${digits}` : `+${digits}`;

  // TCPA Pre-check DNC
  const isDnc = await checkDNC(formattedPhone, companyId);
  if (isDnc) {
    return res.status(403).json({
      success: false,
      error: { code: 'DNC_RESTRICTED', message: 'This phone number is registered on the Do Not Call (DNC) list.' },
    });
  }

  try {
    const lead = await prisma.lead.upsert({
      where: {
        companyId_phone: {
          companyId,
          phone: formattedPhone,
        },
      },
      update: {
        name,
        email,
        status,
        customFields: customFields as any,
        isDeleted: false,
      },
      create: {
        companyId,
        name,
        phone: formattedPhone,
        email,
        status,
        customFields: customFields as any,
      },
    });

    return res.status(201).json({
      success: true,
      data: lead,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * POST /leads/import
 * Background CSV Upload handler.
 */
router.post('/import', verifyAccessToken, enforceTenancy, upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  const companyId = (req as any).companyId;
  const { campaignId } = req.body;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Multer upload failed: file is missing.' },
    });
  }

  try {
    // Read count of rows dynamically
    const fileContent = fs.readFileSync(req.file.path, 'utf-8');
    const rowCount = fileContent.split('\n').filter(line => line.trim()).length - 1; // subtract header

    // Queue import background job
    const job = await csvImportQueue.add({
      filePath: req.file.path,
      companyId,
      campaignId,
    });

    // If large CSV (>10,000 rows) or normal background logic
    return res.status(202).json({
      success: true,
      data: {
        jobId: job.id,
        rowCount,
        status: 'queued',
        message: rowCount > 10000 
          ? 'Large CSV upload detected. Processing asynchronously.' 
          : 'CSV processing started in the background.',
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: error.message },
    });
  }
});

/**
 * GET /leads/jobs/:jobId
 * Poll endpoint for CSV import progress/results.
 */
router.get('/jobs/:jobId', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  const { jobId } = req.params;

  try {
    const jobStatus = await redis.get(`csv_job:${jobId}`);
    if (!jobStatus) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Job status not found.' },
      });
    }

    return res.status(200).json({
      success: true,
      data: JSON.parse(jobStatus),
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_SERVER_ERROR', message: error.message },
    });
  }
});

/**
 * GET /leads/stats
 * Dashboard summary statistics.
 */
router.get('/stats', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = (req as any).companyId;

  try {
    const totalLeads = await prisma.lead.count({
      where: { companyId, isDeleted: false },
    });

    const statusCounts = await prisma.lead.groupBy({
      by: ['status'],
      where: { companyId, isDeleted: false },
      _count: true,
    });

    const byStatus: Record<string, number> = {
      new: 0,
      contacted: 0,
      interested: 0,
      not_interested: 0,
      callback: 0,
      converted: 0,
    };

    statusCounts.forEach((group) => {
      const statusKey = group.status.toLowerCase().replace(/\s/g, '_');
      byStatus[statusKey] = group._count;
    });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const todayImported = await prisma.lead.count({
      where: {
        companyId,
        isDeleted: false,
        createdAt: { gte: startOfToday },
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        total: totalLeads,
        byStatus,
        todayImported,
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
 * GET /leads/:leadId
 * Fetch lead detail + call timeline logs.
 */
router.get('/:leadId', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { leadId } = req.params;
  const companyId = (req as any).companyId;

  try {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId, isDeleted: false },
      include: {
        calls: {
          orderBy: { createdAt: 'desc' },
        },
        notes: {
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lead not found.' },
      });
    }

    return res.status(200).json({
      success: true,
      data: lead,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * PATCH /leads/:leadId
 * Update lead details.
 */
router.patch('/:leadId', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { leadId } = req.params;
  const companyId = (req as any).companyId;

  try {
    const updatedLead = await prisma.lead.updateMany({
      where: { id: leadId, companyId, isDeleted: false },
      data: req.body,
    });

    if (updatedLead.count === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lead not found or unauthorized.' },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Lead updated successfully.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * DELETE /leads/:leadId
 * Soft delete lead (isDeleted: true).
 */
router.delete('/:leadId', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { leadId } = req.params;
  const companyId = (req as any).companyId;

  try {
    const deleted = await prisma.lead.updateMany({
      where: { id: leadId, companyId, isDeleted: false },
      data: { isDeleted: true },
    });

    if (deleted.count === 0) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lead not found or already deleted.' },
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Lead soft-deleted successfully.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * POST /leads/:leadId/dnc
 * Adds the phone number of a lead to the company DNC scrubbing list.
 */
router.post('/:leadId/dnc', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { leadId } = req.params;
  const companyId = (req as any).companyId;

  try {
    const lead = await prisma.lead.findFirst({
      where: { id: leadId, companyId, isDeleted: false },
    });

    if (!lead) {
      return res.status(404).json({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Lead not found.' },
      });
    }

    // Upsert into DNCRecords list
    await prisma.dNCRecord.upsert({
      where: {
        companyId_phone: {
          companyId,
          phone: lead.phone,
        },
      },
      update: {
        consent: false,
        consentDate: null,
      },
      create: {
        companyId,
        phone: lead.phone,
        consent: false,
      },
    });

    // Mark lead status to not interested / DNC in crm
    await prisma.lead.update({
      where: { id: leadId },
      data: { status: 'Not Interested' },
    });

    return res.status(201).json({
      success: true,
      message: 'Phone number added to Do Not Call (DNC) list successfully.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * POST /leads/:leadId/notes
 * Creates a new note for a lead.
 */
router.post('/:leadId/notes', verifyAccessToken, enforceTenancy, async (req: AuthenticatedRequest, res: Response) => {
  const { leadId } = req.params;
  const { noteText } = req.body;
  const companyId = (req as any).companyId;
  const agentId = req.user!.id;

  if (!noteText) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'noteText is required in payload.' },
    });
  }

  try {
    const note = await prisma.note.create({
      data: {
        companyId,
        leadId,
        userId: agentId,
        noteText,
      },
    });

    return res.status(201).json({
      success: true,
      data: note,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

export default router;
