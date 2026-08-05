import type { NextFunction, Request, Response } from 'express';
import type { AuthService } from '../../../application/services/AuthService';
import { CurrentUser } from '../../../domain/auth/CurrentUser';
import { runWithTenant } from '../../../domain/tenant/TenantContext';

export function extractBearerToken(req: Request): string | null {
  const header = req.header('authorization') || req.header('Authorization');
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

/**
 * Si hay Bearer válido: carga CurrentUser y fija TenantContext al tenant del usuario.
 * Si no hay token: continúa (rutas públicas / canal WhatsApp).
 */
export function createOptionalAuthMiddleware(authService: AuthService) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req);
    if (!token) {
      next();
      return;
    }

    const user = authService.authenticate(token);
    if (!user) {
      next();
      return;
    }

    CurrentUser.run(user, () => {
      runWithTenant(user.tenantId, () => next());
    });
  };
}

/** Exige usuario autenticado (APIs del dashboard). */
export function requireAuth(
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  const user = CurrentUser.get();
  if (!user) {
    res.status(401).json({ error: 'No autenticado' });
    return;
  }
  next();
}

/** Adjunta token crudo en req para logout. */
export function attachAccessToken(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  (req as Request & { accessToken?: string }).accessToken =
    extractBearerToken(req) ?? undefined;
  next();
}
