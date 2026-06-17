import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import * as authService from '../services/authService';

const router = Router();

// Zod schemas for request validation
const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  companyName: z.string().min(2, 'Company name must be at least 2 characters'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

/**
 * POST /auth/register
 * Register a new tenant (Company) and its admin user atomically.
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.errors[0].message,
        },
      });
    }

    const { name, email, password, companyName } = parseResult.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      return res.status(409).json({
        success: false,
        error: {
          code: 'USER_ALREADY_EXISTS',
          message: 'A user with this email address already exists.',
        },
      });
    }

    const hashedPassword = await authService.hashPassword(password);

    // Split name into first and last name if possible
    const nameParts = name.trim().split(/\s+/);
    const firstName = nameParts[0];
    const lastName = nameParts.slice(1).join(' ') || null;

    // Atomically create Company and User
    const result = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: companyName },
      });

      const user = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          password: hashedPassword,
          firstName,
          lastName,
          role: 'admin', // First user is the company administrator
          companyId: company.id,
        },
      });

      // Initialize default Agent State as offline
      await tx.agentState.create({
        data: {
          userId: user.id,
          status: 'offline',
        },
      });

      return { company, user };
    });

    return res.status(201).json({
      success: true,
      data: {
        userId: result.user.id,
        email: result.user.email,
        companyId: result.company.id,
        companyName: result.company.name,
      },
    });
  } catch (error: any) {
    console.error('[REGISTER ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'An unexpected error occurred.',
      },
    });
  }
});

/**
 * POST /auth/login
 * Authenticates users and issues short-lived JWT access token & secure httpOnly refresh token.
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: parseResult.error.errors[0].message,
        },
      });
    }

    const { email, password } = parseResult.data;

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { company: true },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      });
    }

    const isPasswordValid = await authService.comparePassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
      });
    }

    const payload = {
      userId: user.id,
      companyId: user.companyId,
      role: user.role,
    };

    // Generate tokens
    const accessToken = authService.generateAccessToken(payload);
    const { token: refreshToken, jti } = authService.generateRefreshToken(payload);

    // Save active refresh token JTI in Redis
    await authService.saveRefreshToken(user.id, jti);

    // Set Refresh Token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      success: true,
      data: {
        accessToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId,
          companyName: user.company.name,
        },
      },
    });
  } catch (error: any) {
    console.error('[LOGIN ERROR]', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: error.message || 'An unexpected error occurred.',
      },
    });
  }
});

/**
 * POST /auth/refresh
 * Refresh Token Rotation (RTR). Validates the refresh token and issues new access/refresh tokens.
 */
router.post('/refresh', async (req: Request, res: Response) => {
  const tokenFromCookie = req.cookies?.refreshToken;
  if (!tokenFromCookie) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'REFRESH_TOKEN_REQUIRED',
        message: 'Refresh token cookie is missing.',
      },
    });
  }

  try {
    // 1. Verify token cryptographic integrity
    const decoded = authService.verifyRefreshToken(tokenFromCookie);
    const { userId, companyId, role, jti } = decoded;

    // 2. Fetch the active JTI from Redis
    const activeJti = await authService.getActiveRefreshTokenJti(userId);

    if (!activeJti) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Refresh token has expired or session is invalid.',
        },
      });
    }

    // 3. Token Reuse Detection
    if (activeJti !== jti) {
      console.warn(`[SECURITY WARNING] Reused refresh token detected for User: ${userId}. Revoking session.`);
      // Clear Redis active session to block all tokens associated with this user
      await authService.revokeRefreshToken(userId);
      res.clearCookie('refreshToken');

      return res.status(401).json({
        success: false,
        error: {
          code: 'REVOKED_SESSION',
          message: 'Security breach: Old refresh token was used. Logging out of all devices.',
        },
      });
    }

    // 4. Issue new tokens (Rotation)
    const payload = { userId, companyId, role };
    const newAccessToken = authService.generateAccessToken(payload);
    const { token: newRefreshToken, jti: newJti } = authService.generateRefreshToken(payload);

    // Save the new JTI in Redis
    await authService.saveRefreshToken(userId, newJti);

    // Set new refresh token cookie
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      data: {
        accessToken: newAccessToken,
      },
    });
  } catch (error: any) {
    console.error('[REFRESH ERROR]', error);
    res.clearCookie('refreshToken');
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired refresh token.',
      },
    });
  }
});

/**
 * POST /auth/logout
 * Revokes active refresh token from Redis and clears client cookie.
 */
router.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.clearCookie('refreshToken');
    return res.status(200).json({ success: true });
  }

  try {
    const decoded = jwt.decode(token) as { userId?: string };
    if (decoded && decoded.userId) {
      await authService.revokeRefreshToken(decoded.userId);
    }
  } catch (err) {
    console.error('[LOGOUT REVOKE ERROR]', err);
  } finally {
    res.clearCookie('refreshToken');
  }

  return res.status(200).json({
    success: true,
    message: 'Logged out successfully.',
  });
});

export default router;
