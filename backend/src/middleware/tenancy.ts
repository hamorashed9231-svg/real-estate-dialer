import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './auth';

/**
 * Middleware to extract tenant ID (companyId) from the authenticated user
 * and bind it to the request context. Rejects the request if companyId is missing.
 */
export function enforceTenancy(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  // Ensure user is authenticated and has a valid tenant association
  if (!req.user || !req.user.companyId) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'TENANT_REQUIRED',
        message: 'Tenant context (companyId) is required and missing from the authentication token.',
      },
    });
  }

  // Bind the companyId directly to the request object for easy accessibility in controller actions
  (req as any).companyId = req.user.companyId;

  return next();
}

/**
 * Helper utility to verify that a resource lookup matches the tenant ID
 */
export function verifyTenantResource(resourceCompanyId: string, reqCompanyId: string): boolean {
  return resourceCompanyId === reqCompanyId;
}
