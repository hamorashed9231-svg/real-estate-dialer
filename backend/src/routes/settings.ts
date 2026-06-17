import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import { requireRole } from '../middleware/auth';

const router = Router();

// Ensure uploads folder exists in workspace
const VOICEMAIL_UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'voicemails');
if (!fs.existsSync(VOICEMAIL_UPLOAD_DIR)) {
  fs.mkdirSync(VOICEMAIL_UPLOAD_DIR, { recursive: true });
}

// Multer Disk storage configuration for custom audio templates
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, VOICEMAIL_UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB Max size limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.mp3', '.wav', '.ogg'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio file type. Only mp3, wav, and ogg are permitted.'));
    }
  },
});

const supervisorGuards = [verifyAccessToken, requireRole('admin', 'manager')];

/**
 * GET /settings/company
 * Retrieve active company profile details.
 */
router.get('/company', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
    });

    // Also read business hours from Redis or mock default
    const bizHoursKey = `settings:bizhours:${companyId}`;
    const bizHoursStr = await redis.get(bizHoursKey);
    const businessHours = bizHoursStr ? JSON.parse(bizHoursStr) : {
      timezone: 'America/New_York',
      hours: {
        monday: { from: '09:00', to: '17:00' },
        tuesday: { from: '09:00', to: '17:00' },
        wednesday: { from: '09:00', to: '17:00' },
        thursday: { from: '09:00', to: '17:00' },
        friday: { from: '09:00', to: '17:00' },
        saturday: { from: '10:00', to: '14:00' },
        sunday: { from: 'closed', to: 'closed' },
      }
    };

    return res.status(200).json({
      success: true,
      data: {
        id: company?.id,
        name: company?.name,
        createdAt: company?.createdAt,
        businessHours,
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
 * PATCH /settings/company
 * Updates company profile details.
 */
router.patch('/company', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { name, businessHours } = req.body;

  try {
    if (name) {
      await prisma.company.update({
        where: { id: companyId },
        data: { name },
      });
    }

    if (businessHours) {
      const bizHoursKey = `settings:bizhours:${companyId}`;
      await redis.set(bizHoursKey, JSON.stringify(businessHours));
    }

    return res.status(200).json({
      success: true,
      message: 'Company profile updated successfully.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * GET /settings/caller-ids
 * Fetch Caller ID Pool list.
 */
router.get('/caller-ids', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const pool = await prisma.callerIDPool.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return res.status(200).json({
      success: true,
      data: pool,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * POST /settings/caller-ids
 * Adds a new phone number to the local presence caller ID pool.
 */
router.post('/caller-ids', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { phoneNumber, state, areaCode } = req.body;

  if (!phoneNumber) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'phoneNumber E.164 string is required.' },
    });
  }

  try {
    const newCallerId = await prisma.callerIDPool.create({
      data: {
        companyId,
        phoneNumber,
        areaCode: areaCode || phoneNumber.substring(2, 5),
        state: state || 'Unknown',
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      data: newCallerId,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * DELETE /settings/caller-ids/:id
 * Removes a number from the caller ID pool.
 */
router.delete('/caller-ids/:id', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = req.user!.companyId;

  try {
    await prisma.callerIDPool.deleteMany({
      where: { id, companyId },
    });

    return res.status(200).json({
      success: true,
      message: 'Caller ID removed from pool successfully.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * GET /settings/voicemail-templates
 * Reads company voicemail drops templates list from Redis.
 */
router.get('/voicemail-templates', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;

  try {
    const listKey = `settings:voicemails:${companyId}`;
    const templatesStr = await redis.get(listKey);
    const templates = templatesStr ? JSON.parse(templatesStr) : [
      {
        id: 'template_default_1',
        name: 'Standard FSBO Intro Drop',
        duration: 12,
        url: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
        isDefault: true,
      }
    ];

    return res.status(200).json({
      success: true,
      data: templates,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * POST /settings/voicemail-templates
 * Uploads audio templates and tracks metadata in Redis.
 */
router.post('/voicemail-templates', supervisorGuards, upload.single('file'), async (req: AuthenticatedRequest, res: Response) => {
  const companyId = req.user!.companyId;
  const { name } = req.body;

  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'No audio file uploaded.' },
    });
  }

  try {
    const templateId = uuidv4();
    const relativeUrl = `/uploads/voicemails/${req.file.filename}`;

    const listKey = `settings:voicemails:${companyId}`;
    const templatesStr = await redis.get(listKey);
    const templates = templatesStr ? JSON.parse(templatesStr) : [];

    const newTemplate = {
      id: templateId,
      name: name || req.file.originalname,
      duration: 15, // standard duration approximation
      url: relativeUrl,
      isDefault: templates.length === 0,
    };

    templates.push(newTemplate);
    await redis.set(listKey, JSON.stringify(templates));

    return res.status(201).json({
      success: true,
      data: newTemplate,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'UPLOAD_ERROR', message: error.message },
    });
  }
});

/**
 * DELETE /settings/voicemail-templates/:id
 * Removes a voicemail template.
 */
router.delete('/voicemail-templates/:id', supervisorGuards, async (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const companyId = req.user!.companyId;

  try {
    const listKey = `settings:voicemails:${companyId}`;
    const templatesStr = await redis.get(listKey);
    
    if (templatesStr) {
      let templates = JSON.parse(templatesStr);
      const target = templates.find((t: any) => t.id === id);

      if (target) {
        // If it was a local file, remove it from the file system
        if (target.url.startsWith('/uploads/voicemails/')) {
          const filepath = path.join(process.cwd(), target.url);
          if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
          }
        }

        templates = templates.filter((t: any) => t.id !== id);
        await redis.set(listKey, JSON.stringify(templates));
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Voicemail template deleted successfully.',
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

/**
 * GET /settings/integrations
 * Evaluates CRM stubs and connected states checking active env keys.
 */
router.get('/integrations', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const integrations = [
      {
        name: 'HubSpot',
        connected: !!process.env.HUBSPOT_API_KEY,
        keyStub: 'HUBSPOT_API_KEY',
      },
      {
        name: 'Salesforce',
        connected: !!process.env.SALESFORCE_CLIENT_ID && !!process.env.SALESFORCE_CLIENT_SECRET,
        keyStub: 'SALESFORCE_CLIENT_ID',
      },
      {
        name: 'GoHighLevel',
        connected: !!process.env.GHL_API_KEY,
        keyStub: 'GHL_API_KEY',
      },
      {
        name: 'Follow Up Boss',
        connected: !!process.env.FUB_API_KEY,
        keyStub: 'FUB_API_KEY',
      },
    ];

    return res.status(200).json({
      success: true,
      data: integrations,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: { code: 'DATABASE_ERROR', message: error.message },
    });
  }
});

export default router;
