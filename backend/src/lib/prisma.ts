import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Middleware to stringify customFields on write, and parse on read for SQLite compatibility
prisma.$use(async (params, next) => {
  if (params.model === 'Lead') {
    if (params.action === 'create' || params.action === 'update' || params.action === 'upsert') {
      const data = params.args.data || params.args.create || params.args.update;
      if (data && data.customFields && typeof data.customFields === 'object') {
        data.customFields = JSON.stringify(data.customFields);
      }
      if (params.args.create && params.args.create.customFields && typeof params.args.create.customFields === 'object') {
        params.args.create.customFields = JSON.stringify(params.args.create.customFields);
      }
      if (params.args.update && params.args.update.customFields && typeof params.args.update.customFields === 'object') {
        params.args.update.customFields = JSON.stringify(params.args.update.customFields);
      }
    }
  }

  const result = await next(params);

  if (params.model === 'Lead' && result) {
    const parseLead = (lead: any) => {
      if (lead && typeof lead.customFields === 'string') {
        try {
          lead.customFields = JSON.parse(lead.customFields);
        } catch (e) {
          // Keep as string if parsing fails
        }
      }
    };

    if (Array.isArray(result)) {
      result.forEach(parseLead);
    } else {
      parseLead(result);
    }
  }

  return result;
});

export default prisma;
