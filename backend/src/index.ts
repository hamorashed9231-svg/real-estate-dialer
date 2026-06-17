import express, { Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Import routers
import authRouter from './routes/auth';
import twilioRouter from './routes/twilio';
import callsRouter from './routes/calls';
import leadsRouter from './routes/leads';
import campaignsRouter from './routes/campaigns';
import agentsRouter from './routes/agents';
import dashboardRouter from './routes/dashboard';
import streamRouter from './routes/stream';
import reportsRouter from './routes/reports';
import settingsRouter from './routes/settings';

const app = express();
const PORT = process.env.PORT || 5000;

// Security Middlewares
app.use(helmet());

// CORS Configuration
const allowedOrigins = [
  'http://localhost:5173', // Vite Frontend default
  'http://localhost:3000', // Alternative dev port
];

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin, allowed local origins, or public tunnel subdomains
      if (!origin || allowedOrigins.includes(origin) || origin.includes('loca.lt') || origin.includes('serveousercontent.com')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  })
);

// Logging Middleware
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Body & Cookie Parsers
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Base Route / Health Check
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'PropDial Backend API is healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// Mount Routes
app.use('/auth', authRouter);
app.use('/twilio', twilioRouter);
app.use('/calls', callsRouter);
app.use('/leads', leadsRouter);
app.use('/campaigns', campaignsRouter);
app.use('/agents', agentsRouter);
app.use('/dashboard', dashboardRouter);
app.use('/dashboard', streamRouter);
app.use('/reports', reportsRouter);
app.use('/settings', settingsRouter);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: express.NextFunction) => {
  console.error('[GLOBAL ERROR]', err);
  
  // CORS block error handling
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: {
        code: 'CORS_ERROR',
        message: 'Origin blocked by security policy.',
      },
    });
  }

  return res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: process.env.NODE_ENV === 'production' ? 'Internal server error occurred.' : err.message,
    },
  });
});

// Start listening
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 PropDial API running on port ${PORT}`);
  console.log(`   Environment: ${process.env.NODE_ENV}`);
  console.log(`=========================================`);
});

export default app;
