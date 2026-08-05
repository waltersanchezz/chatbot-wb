import { Router } from 'express';
import type { AnalyticsService } from '../../../application/services/AnalyticsService';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Analytics API — analítica comercial (Dashboard Sprint 7).
 */
export function createAnalyticsApiRouter(
  analyticsService: AnalyticsService,
): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      res.json(analyticsService.getAnalytics());
    } catch (err) {
      logger.exception('GET /api/analytics failed', err, {
        service: 'AnalyticsApi',
        operation: 'getAnalytics',
      });
      res.status(500).json({ error: 'No se pudo cargar la analítica' });
    }
  });

  return router;
}
