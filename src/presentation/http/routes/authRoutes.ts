import { Router } from 'express';
import type { AuthService } from '../../../application/services/AuthService';
import { CurrentUser } from '../../../domain/auth/CurrentUser';
import { logger } from '../../../infrastructure/logging/logger';
import {
  attachAccessToken,
  extractBearerToken,
  requireAuth,
} from '../middleware/authMiddleware';

/**
 * Auth API — login / logout / me (Sprint 10).
 */
export function createAuthRouter(authService: AuthService): Router {
  const router = Router();

  router.post('/login', (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim();
      const password = String(req.body?.password ?? '');
      if (!email || !password) {
        res.status(400).json({ error: 'email y password son requeridos' });
        return;
      }

      const result = authService.login(email, password);
      if (!result) {
        res.status(401).json({ error: 'Credenciales inválidas' });
        return;
      }

      res.json(result);
    } catch (err) {
      logger.exception('POST /api/login failed', err, {
        service: 'AuthApi',
        operation: 'login',
      });
      res.status(500).json({ error: 'No se pudo iniciar sesión' });
    }
  });

  router.post('/logout', attachAccessToken, (req, res) => {
    try {
      const token =
        (req as typeof req & { accessToken?: string }).accessToken ||
        extractBearerToken(req);
      if (token) authService.logout(token);
      res.json({ ok: true });
    } catch (err) {
      logger.exception('POST /api/logout failed', err, {
        service: 'AuthApi',
        operation: 'logout',
      });
      res.status(500).json({ error: 'No se pudo cerrar sesión' });
    }
  });

  router.get('/me', (req, res) => {
    try {
      const token = extractBearerToken(req);
      if (!token) {
        res.status(401).json({ error: 'No autenticado' });
        return;
      }
      const user = authService.me(token);
      if (!user) {
        res.status(401).json({ error: 'Sesión inválida' });
        return;
      }
      res.json(user);
    } catch (err) {
      logger.exception('GET /api/me failed', err, {
        service: 'AuthApi',
        operation: 'me',
      });
      res.status(500).json({ error: 'No se pudo obtener el usuario' });
    }
  });

  /** Variante que usa CurrentUser si el middleware opcional ya autenticó. */
  router.get('/me/context', requireAuth, (_req, res) => {
    res.json(CurrentUser.require());
  });

  return router;
}
