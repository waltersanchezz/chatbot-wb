import { Router } from 'express';
import {
  DeveloperService,
  DeveloperValidationError,
} from '../../../application/services/DeveloperService';
import type {
  ApiKeyCreateInput,
  ApiKeyUpdateInput,
} from '../../../domain/dashboard/developerDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Developer Platform API — API Keys y SDKs (Sprint 22).
 */
export function createDeveloperApiRouter(
  developerService: DeveloperService,
): Router {
  const router = Router();

  router.get('/developer/keys', (_req, res) => {
    try {
      const keys = developerService.listKeys();
      res.json({ keys, total: keys.length });
    } catch (err) {
      logger.exception('GET /api/developer/keys failed', err, {
        service: 'DeveloperApi',
        operation: 'listKeys',
      });
      res.status(500).json({ error: 'No se pudieron listar API keys' });
    }
  });

  router.post('/developer/keys', (req, res) => {
    try {
      const body = (req.body ?? {}) as ApiKeyCreateInput;
      const created = developerService.createKey(body);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof DeveloperValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/developer/keys failed', err, {
        service: 'DeveloperApi',
        operation: 'createKey',
      });
      res.status(500).json({ error: 'No se pudo crear la API key' });
    }
  });

  router.put('/developer/keys/:id', (req, res) => {
    try {
      const body = (req.body ?? {}) as ApiKeyUpdateInput;
      const key = developerService.updateKey(req.params.id, body);
      if (!key) {
        res.status(404).json({ error: 'API Key no encontrada' });
        return;
      }
      res.json(key);
    } catch (err) {
      if (err instanceof DeveloperValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('PUT /api/developer/keys/:id failed', err, {
        service: 'DeveloperApi',
        operation: 'updateKey',
      });
      res.status(500).json({ error: 'No se pudo actualizar la API key' });
    }
  });

  router.delete('/developer/keys/:id', (req, res) => {
    try {
      const ok = developerService.deleteKey(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'API Key no encontrada' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof DeveloperValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('DELETE /api/developer/keys/:id failed', err, {
        service: 'DeveloperApi',
        operation: 'deleteKey',
      });
      res.status(500).json({ error: 'No se pudo eliminar la API key' });
    }
  });

  router.post('/developer/keys/:id/rotate', (req, res) => {
    try {
      const rotated = developerService.rotateKey(req.params.id);
      res.json(rotated);
    } catch (err) {
      if (err instanceof DeveloperValidationError) {
        const status = err.message.includes('no encontrada') ? 404 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/developer/keys/:id/rotate failed', err, {
        service: 'DeveloperApi',
        operation: 'rotateKey',
      });
      res.status(500).json({ error: 'No se pudo rotar la API key' });
    }
  });

  router.get('/developer/requests', (req, res) => {
    try {
      const apiKeyId =
        typeof req.query.apiKeyId === 'string' ? req.query.apiKeyId : undefined;
      const limitRaw = req.query.limit;
      const limit =
        typeof limitRaw === 'string' && limitRaw.trim()
          ? Number(limitRaw)
          : undefined;
      const requests = developerService.listRequests({
        apiKeyId,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      const usage = developerService.getUsageStats(
        Number.isFinite(limit) ? (limit as number) : 200,
      );
      res.json({ requests, total: requests.length, usage });
    } catch (err) {
      logger.exception('GET /api/developer/requests failed', err, {
        service: 'DeveloperApi',
        operation: 'listRequests',
      });
      res.status(500).json({ error: 'No se pudieron listar requests' });
    }
  });

  router.get('/developer/sdk', (_req, res) => {
    try {
      res.json(developerService.getSdkCatalog());
    } catch (err) {
      logger.exception('GET /api/developer/sdk failed', err, {
        service: 'DeveloperApi',
        operation: 'sdk',
      });
      res.status(500).json({ error: 'No se pudo cargar el catálogo SDK' });
    }
  });

  return router;
}
