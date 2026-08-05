import { Router } from 'express';
import {
  CopilotService,
  CopilotValidationError,
} from '../../../application/services/CopilotService';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * AI Copilot API — generación y aplicación de configuraciones (Sprint 19).
 */
export function createCopilotApiRouter(copilotService: CopilotService): Router {
  const router = Router();

  router.post('/copilot/generate', async (req, res) => {
    try {
      const prompt =
        typeof req.body?.prompt === 'string' ? req.body.prompt : '';
      const session = await copilotService.generate(prompt);
      res.status(201).json({ session });
    } catch (err) {
      if (err instanceof CopilotValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/copilot/generate failed', err, {
        service: 'CopilotApi',
        operation: 'generate',
      });
      res.status(500).json({ error: 'No se pudo generar la configuración' });
    }
  });

  router.post('/copilot/apply', (req, res) => {
    try {
      const body = req.body ?? {};
      const result = copilotService.apply({
        sessionId:
          typeof body.sessionId === 'string' ? body.sessionId : '',
        response: body.response,
        saveAsTemplate: Boolean(body.saveAsTemplate),
        templateType:
          typeof body.templateType === 'string'
            ? body.templateType
            : undefined,
        installMarketplace:
          body.installMarketplace === undefined
            ? undefined
            : Boolean(body.installMarketplace),
      });
      res.json(result);
    } catch (err) {
      if (err instanceof CopilotValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/copilot/apply failed', err, {
        service: 'CopilotApi',
        operation: 'apply',
      });
      res.status(500).json({ error: 'No se pudieron aplicar los cambios' });
    }
  });

  router.get('/copilot/history', (req, res) => {
    try {
      const limitRaw = req.query.limit;
      const limit =
        typeof limitRaw === 'string' && limitRaw.trim()
          ? Number(limitRaw)
          : undefined;
      const history = copilotService.listHistory(
        Number.isFinite(limit) ? limit : undefined,
      );
      res.json(history);
    } catch (err) {
      logger.exception('GET /api/copilot/history failed', err, {
        service: 'CopilotApi',
        operation: 'history',
      });
      res.status(500).json({ error: 'No se pudo cargar el historial' });
    }
  });

  router.delete('/copilot/history/:id', (req, res) => {
    try {
      const ok = copilotService.deleteHistory(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'Sesión no encontrada' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof CopilotValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('DELETE /api/copilot/history/:id failed', err, {
        service: 'CopilotApi',
        operation: 'deleteHistory',
      });
      res.status(500).json({ error: 'No se pudo eliminar la sesión' });
    }
  });

  return router;
}
