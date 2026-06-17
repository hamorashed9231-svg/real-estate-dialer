import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import redis from '../lib/redis';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_access_token';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'fallback_secret_for_refresh_token';

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days in seconds

export interface TokenPayload {
  userId: string;
  companyId: string;
  role: string;
}

/**
 * Hashes a plaintext password using bcrypt with 12 salt rounds
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Compares a plaintext password against a hashed password
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generates a short-lived access token (JWT)
 */
export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(
    {
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

/**
 * Generates a long-lived refresh token with a unique identifier (jti)
 */
export function generateRefreshToken(payload: TokenPayload): { token: string; jti: string } {
  const jti = Math.random().toString(36).substring(2) + Date.now().toString(36);
  const token = jwt.sign(
    {
      userId: payload.userId,
      companyId: payload.companyId,
      role: payload.role,
      jti,
    },
    JWT_REFRESH_SECRET,
    { expiresIn: '7d' }
  );
  return { token, jti };
}

/**
 * Stores the active refresh token's JTI in Redis.
 * Key: refresh:{userId}
 */
export async function saveRefreshToken(userId: string, jti: string): Promise<void> {
  const key = `refresh:${userId}`;
  await redis.set(key, jti, 'EX', REFRESH_TOKEN_EXPIRY_SECONDS);
}

/**
 * Retrieves the currently active refresh token's JTI for a user from Redis
 */
export async function getActiveRefreshTokenJti(userId: string): Promise<string | null> {
  const key = `refresh:${userId}`;
  return redis.get(key);
}

/**
 * Revokes the active refresh token for a user from Redis
 */
export async function revokeRefreshToken(userId: string): Promise<void> {
  const key = `refresh:${userId}`;
  await redis.del(key);
}

/**
 * Verifies a refresh token and returns its decoded payload
 */
export function verifyRefreshToken(token: string): TokenPayload & { jti: string } {
  return jwt.verify(token, JWT_REFRESH_SECRET) as TokenPayload & { jti: string };
}
