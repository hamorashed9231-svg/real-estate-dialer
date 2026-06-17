import { Router, Response } from 'express';
import { verifyAccessToken, AuthenticatedRequest } from '../middleware/auth';
import redis from '../lib/redis';

const router = Router();

/**
 * GET /dashboard/stream
 * Server-Sent Events (SSE) endpoint for real-time manager dashboard feeds.
 */
router.get('/stream', verifyAccessToken, async (req: AuthenticatedRequest, res: Response) => {
  // Ensure the user role is authorized (admin or manager)
  if (req.user?.role !== 'admin' && req.user?.role !== 'manager') {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Supervisor permissions required.' },
    });
  }

  // Set standard SSE Headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in Nginx reverse proxies

  // Send initial connection establish comment
  res.write(': ok\n\n');

  // Create dedicated Redis subscription connection
  const subscriber = redis.duplicate();
  
  try {
    await subscriber.subscribe('agent-status-updates', 'call-updates');
  } catch (error) {
    console.error('[SSE REDIS SUBSCRIBE ERROR]', error);
    res.end();
    return;
  }

  // Listen for Redis Pub/Sub publications and forward them to SSE
  subscriber.on('message', (channel, message) => {
    // Map backend Redis channel names to frontend event names
    let eventName = channel;
    if (channel === 'agent-status-updates') {
      eventName = 'agent-status';
    } else if (channel === 'call-updates') {
      eventName = 'call-update';
    }

    res.write(`event: ${eventName}\ndata: ${message}\n\n`);
  });

  // Heartbeat ping every 30 seconds to prevent connection drops by intermediate proxies
  const heartbeat = setInterval(() => {
    res.write(': heartbeat\n\n');
  }, 30000);

  // Clean up resources on connection closure
  req.on('close', () => {
    console.log('[SSE CONNECTION CLOSED] Cleaning up subscriber client.');
    clearInterval(heartbeat);
    subscriber.unsubscribe();
    subscriber.quit().catch(() => {});
  });
});

export default router;
