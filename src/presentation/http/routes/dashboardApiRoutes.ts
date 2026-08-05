import { Router } from 'express';
import type { DashboardService } from '../../../application/services/DashboardService';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * API del Dashboard React (Fase 2).
 * Independiente del CRM estático en /dashboard.
 */
export function createDashboardApiRouter(dashboardService: DashboardService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      const data = dashboardService.getDashboard();
      res.json(data);
    } catch (err) {
      logger.exception('GET /api/dashboard failed', err, {
        service: 'DashboardApi',
        operation: 'getDashboard',
      });
      res.status(500).json({ error: 'No se pudo cargar el dashboard' });
    }
  });

  return router;
}
