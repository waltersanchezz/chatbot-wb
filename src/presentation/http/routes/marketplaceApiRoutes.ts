import { Router } from 'express';
import {
  MarketplaceService,
  MarketplaceValidationError,
} from '../../../application/services/MarketplaceService';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Marketplace API — catálogo e instalación de plantillas (Sprint 18).
 */
export function createMarketplaceApiRouter(
  marketplaceService: MarketplaceService,
): Router {
  const router = Router();

  router.get('/templates', (req, res) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const category =
        typeof req.query.category === 'string' ? req.query.category : undefined;
      const templates = marketplaceService.listTemplates({ q, category });
      res.json({ templates, total: templates.length });
    } catch (err) {
      logger.exception('GET /api/templates failed', err, {
        service: 'MarketplaceApi',
        operation: 'list',
      });
      res.status(500).json({ error: 'No se pudieron listar plantillas' });
    }
  });

  router.get('/templates/:id', (req, res) => {
    try {
      const template = marketplaceService.getTemplate(req.params.id);
      if (!template) {
        res.status(404).json({ error: 'Plantilla no encontrada' });
        return;
      }
      res.json(template);
    } catch (err) {
      logger.exception('GET /api/templates/:id failed', err, {
        service: 'MarketplaceApi',
        operation: 'get',
      });
      res.status(500).json({ error: 'No se pudo cargar la plantilla' });
    }
  });

  router.post('/templates/:id/install', (req, res) => {
    try {
      const force = Boolean(req.body?.force);
      const result = marketplaceService.install(req.params.id, { force });
      res.status(result.updated ? 200 : 201).json(result);
    } catch (err) {
      if (err instanceof MarketplaceValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/templates/:id/install failed', err, {
        service: 'MarketplaceApi',
        operation: 'install',
      });
      res.status(500).json({ error: 'No se pudo instalar la plantilla' });
    }
  });

  router.delete('/templates/:id/install', (req, res) => {
    try {
      const ok = marketplaceService.uninstall(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'Instalación no encontrada' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof MarketplaceValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('DELETE /api/templates/:id/install failed', err, {
        service: 'MarketplaceApi',
        operation: 'uninstall',
      });
      res.status(500).json({ error: 'No se pudo desinstalar' });
    }
  });

  router.get('/template-installs', (_req, res) => {
    try {
      const installs = marketplaceService.listInstalls();
      res.json({ installs, total: installs.length });
    } catch (err) {
      logger.exception('GET /api/template-installs failed', err, {
        service: 'MarketplaceApi',
        operation: 'listInstalls',
      });
      res.status(500).json({ error: 'No se pudieron listar instalaciones' });
    }
  });

  return router;
}
