import { Router } from 'express';
import type { PipelineService } from '../../../application/services/PipelineService';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Pipeline API — Kanban comercial (Dashboard Sprint 5).
 */
export function createPipelineApiRouter(pipelineService: PipelineService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      res.json(pipelineService.getPipeline());
    } catch (err) {
      logger.exception('GET /api/pipeline failed', err, {
        service: 'PipelineApi',
        operation: 'getPipeline',
      });
      res.status(500).json({ error: 'No se pudo cargar el pipeline' });
    }
  });

  return router;
}
