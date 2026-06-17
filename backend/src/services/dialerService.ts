import Queue from '../lib/mockQueue';
import prisma from '../lib/prisma';
import redis from '../lib/redis';
import * as twilioService from './twilioService';
import { validateCallLegal } from './tcpaService';
import twilio from 'twilio';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

export interface DialerJob {
  campaignLeadId: string;
  leadId: string;
  agentId: string;
  companyId: string;
  phoneNumber: string;
  mode: 'preview' | 'power';
  lineIndex: number; // 0, 1, 2 for multi-line
}

// 1. Initialize Bull Queue for dialer
export const dialerQueue = new Queue<DialerJob>('dialer-queue', REDIS_URL, {
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

// Register job processor
dialerQueue.process(async (job) => {
  await processDialerJob(job);
});

/**
 * Starts a campaign by loading all pending leads into the queue.
 */
export async function startCampaign(campaignId: string, companyId: string): Promise<void> {
  const pendingLeads = await prisma.campaignLead.findMany({
    where: {
      campaignId,
      companyId,
      status: 'pending',
    },
    include: {
      lead: true,
    },
  });

  // Check campaign existence and details
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, companyId },
  });

  if (!campaign) {
    throw new Error('Campaign not found');
  }

  // Update campaign status to active in DB
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'active' },
  });

  // Resume queue processing if it was paused
  await dialerQueue.resume();

  // Add each pending lead to the Bull queue
  for (const item of pendingLeads) {
    const jobPayload: DialerJob = {
      campaignLeadId: item.id,
      leadId: item.leadId,
      agentId: '', // Assigned dynamically during job processing
      companyId,
      phoneNumber: item.lead.phone,
      mode: campaign.mode as 'preview' | 'power',
      lineIndex: 0,
    };

    // Use priority parameter based on CampaignLead priority
    await dialerQueue.add(jobPayload, {
      priority: item.priority > 0 ? 1 : 10, // Bull: 1 is highest priority, 10 is normal
    });
  }
}

/**
 * Pauses campaign dialing queue.
 */
export async function pauseCampaign(campaignId: string, companyId: string): Promise<void> {
  await prisma.campaign.updateMany({
    where: { id: campaignId, companyId },
    data: { status: 'paused' },
  });

  // Pause queue execution
  await dialerQueue.pause();
}

/**
 * Adds a single lead to the queue using an atomic lock in Redis.
 */
export async function addLeadToQueue(campaignLeadId: string, priority?: number): Promise<void> {
  const lockKey = `lock:campaignLead:${campaignLeadId}`;
  
  // Set Redis lock with NX (Only set if not exists) and EX (expire in 60s)
  const locked = await redis.set(lockKey, 'locked', 'EX', 60, 'NX');
  if (!locked) {
    console.log(`[DIALER LOCK] CampaignLead ${campaignLeadId} is already locked in queue processing. Skipping.`);
    return;
  }

  const campaignLead = await prisma.campaignLead.findUnique({
    where: { id: campaignLeadId },
    include: { lead: true, campaign: true },
  });

  if (!campaignLead || campaignLead.status !== 'pending') {
    await redis.del(lockKey); // release lock
    return;
  }

  const jobPayload: DialerJob = {
    campaignLeadId: campaignLead.id,
    leadId: campaignLead.leadId,
    agentId: '',
    companyId: campaignLead.companyId,
    phoneNumber: campaignLead.lead.phone,
    mode: campaignLead.campaign.mode as 'preview' | 'power',
    lineIndex: 0,
  };

  await dialerQueue.add(jobPayload, {
    priority: priority ? (priority > 0 ? 1 : 10) : 10,
  });
}

/**
 * Main processor worker for dialer queue jobs.
 */
export async function processDialerJob(job: any): Promise<void> {
  const { campaignLeadId, leadId, companyId, phoneNumber, mode } = job.data;

  // 1. TCPA Compliance validation
  const compliance = await validateCallLegal(phoneNumber, companyId);
  if (!compliance.allowed) {
    console.log(`[TCPA BLOCKED] Lead ${leadId} dialing is prohibited: ${compliance.reason}`);
    
    // Mark CampaignLead as skipped in DB
    await prisma.campaignLead.update({
      where: { id: campaignLeadId },
      data: {
        status: 'skipped',
        lockedBy: null,
        lockedAt: null,
      },
    });
    
    return;
  }

  // 2. Locate an available agent for this tenant (Company)
  const availableAgents = await getAvailableAgents(companyId);
  if (availableAgents.length === 0) {
    console.log(`[DIALER QUEUE] No available agents for company ${companyId}. Re-queueing job in 30 seconds.`);
    // Add job back to the queue with a 30s delay
    await dialerQueue.add(job.data, { delay: 30000 });
    return;
  }

  const agentId = availableAgents[0];

  // 3. Mark Agent state as calling
  await setAgentStatus(agentId, 'on_call', companyId);

  // 4. Update CampaignLead status to calling and assign lock
  await prisma.campaignLead.update({
    where: { id: campaignLeadId },
    data: {
      status: 'calling',
      lockedBy: agentId,
      lockedAt: new Date(),
    },
  });

  // 5. Originate call via Twilio
  const callerIdPool = await prisma.callerIDPool.findFirst({
    where: {
      companyId,
      isActive: true,
      areaCode: phoneNumber.replace(/\D/g, '').substring(1, 4),
    },
  });
  const callerId = callerIdPool?.phoneNumber || process.env.TWILIO_NUMBER || '+1234567890';

  let callSid = `mock_${Math.random().toString(36).substring(2) + Date.now().toString(36)}`;
  
  const isTwilioConfigured =
    process.env.TWILIO_ACCOUNT_SID &&
    !process.env.TWILIO_ACCOUNT_SID.includes('ACXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

  if (isTwilioConfigured) {
    try {
      const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      
      // We pass outbound calling webhook endpoint as handler
      const callbackBaseUrl = process.env.VITE_API_URL || 'http://localhost:5000';
      
      const twilioCall = await twilioClient.calls.create({
        from: callerId,
        to: phoneNumber,
        url: `${callbackBaseUrl}/twilio/voice`,
        statusCallback: `${callbackBaseUrl}/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
        statusCallbackMethod: 'POST',
      });
      callSid = twilioCall.sid;
    } catch (err: any) {
      console.error('[DIALER SERVICE] Twilio API call origin crashed:', err.message);
      // Reset agent status and campaign lead status
      await setAgentStatus(agentId, 'available', companyId);
      await prisma.campaignLead.update({
        where: { id: campaignLeadId },
        data: {
          status: 'pending',
          lockedBy: null,
          lockedAt: null,
        },
      });
      throw err;
    }
  }

  // 6. Save active call SID in Redis set for multi-line tracking
  const activeCallsKey = `activecalls:${agentId}`;
  await redis.sadd(activeCallsKey, callSid);

  // Save the mapping from callSid to agentId for lookup on answer
  await redis.set(`call_agent:${callSid}`, agentId, 'EX', 7200); // 2 hours
  await redis.set(`call_campaign_lead:${callSid}`, campaignLeadId, 'EX', 7200);

  // 7. Store call record in database
  await prisma.call.create({
    data: {
      companyId,
      userId: agentId,
      leadId,
      phoneNumber,
      status: 'initiated',
      voipCallSid: callSid,
    },
  });
}

/**
 * Cancels all other concurrent calls when one connects (TCPA requirement).
 */
export async function handleMultiLine(agentId: string, answeredCallSid: string): Promise<void> {
  const activeCallsKey = `activecalls:${agentId}`;
  const activeCalls = await redis.smembers(activeCallsKey);

  for (const callSid of activeCalls) {
    if (callSid !== answeredCallSid) {
      try {
        console.log(`[DIALER MULTILINE] Cancelling redundant outbound call: ${callSid}`);
        await twilioService.cancelCall(callSid);
        
        // Log the call as abandoned in database
        const dbCall = await prisma.call.findUnique({
          where: { voipCallSid: callSid },
        });

        if (dbCall) {
          await prisma.call.update({
            where: { id: dbCall.id },
            data: {
              status: 'failed',
              disposition: 'abandoned',
            },
          });
        }
      } catch (err: any) {
        console.error(`[DIALER MULTILINE ERROR] Failed cancelling SID ${callSid}:`, err.message);
      }
    }
  }

  // Reset active calls in Redis to only contain the answered line
  await redis.del(activeCallsKey);
  await redis.sadd(activeCallsKey, answeredCallSid);
}

/**
 * Scans calls table and logs to enforce < 3% abandonment rate.
 */
export async function checkAbandonmentRate(companyId: string): Promise<number> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

  const totalCalls = await prisma.call.count({
    where: {
      companyId,
      campaignId: { not: null },
      createdAt: { gte: oneHourAgo },
    },
  });

  if (totalCalls === 0) return 0;

  const abandonedCalls = await prisma.call.count({
    where: {
      companyId,
      campaignId: { not: null },
      disposition: 'abandoned',
      createdAt: { gte: oneHourAgo },
    },
  });

  const rate = (abandonedCalls / totalCalls) * 100;

  if (rate > 3.0) {
    console.warn(`[TCPA ALERT] Abandonment rate is ${rate.toFixed(2)}% (> 3.0%). Pausing active campaigns.`);
    
    // Fetch active campaigns and pause them
    const activeCampaigns = await prisma.campaign.findMany({
      where: { companyId, status: 'active' },
    });

    for (const campaign of activeCampaigns) {
      await pauseCampaign(campaign.id, companyId);
    }
  }

  return rate;
}

/**
 * Returns current status of an agent from Redis, falling back to DB.
 */
export async function getAgentStatus(agentId: string): Promise<string> {
  const keys = await redis.keys(`agentstatus:*:${agentId}`);
  if (keys.length > 0) {
    const status = await redis.get(keys[0]);
    if (status) return status;
  }

  const dbState = await prisma.agentState.findUnique({
    where: { userId: agentId },
  });

  return dbState?.status || 'offline';
}

/**
 * Updates agent status in Redis + Database and publishes dashboard events.
 */
export async function setAgentStatus(agentId: string, status: string, companyId: string): Promise<void> {
  const key = `agentstatus:${companyId}:${agentId}`;
  
  // Set in Redis with 8-hour expiry
  await redis.set(key, status, 'EX', 8 * 60 * 60);

  // Update DB schema
  await prisma.agentState.upsert({
    where: { userId: agentId },
    update: { status },
    create: { userId: agentId, status },
  });

  // Publish Redis pub/sub real-time event for manager dashboard
  const eventPayload = JSON.stringify({ agentId, status, companyId });
  await redis.publish('agent-status-updates', eventPayload);
}

/**
 * Helper to retrieve all available agents for a company (tenant) from Redis status keys.
 */
async function getAvailableAgents(companyId: string): Promise<string[]> {
  const keys = await redis.keys(`agentstatus:${companyId}:*`);
  const availableAgents: string[] = [];

  for (const key of keys) {
    const status = await redis.get(key);
    if (status === 'available') {
      const parts = key.split(':');
      const agentId = parts[parts.length - 1];
      availableAgents.push(agentId);
    }
  }

  return availableAgents;
}
