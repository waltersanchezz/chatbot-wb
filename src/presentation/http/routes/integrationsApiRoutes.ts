import { Router } from 'express';
import {
  IntegrationService,
  IntegrationValidationError,
} from '../../../application/services/IntegrationService';
import type {
  ConnectorCreateInput,
  ConnectorListFilters,
  ConnectorUpdateInput,
} from '../../../domain/dashboard/connectorDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Integration Hub API — conectores externos (Sprint 20).
 */
export function createIntegrationsApiRouter(
  integrationService: IntegrationService,
): Router {
  const router = Router();

  router.get('/connectors/logs', (req, res) => {
    try {
      const connectorId =
        typeof req.query.connectorId === 'string'
          ? req.query.connectorId
          : undefined;
      const limitRaw = req.query.limit;
      const limit =
        typeof limitRaw === 'string' && limitRaw.trim()
          ? Number(limitRaw)
          : undefined;
      const logs = integrationService.listLogs({
        connectorId,
        limit: Number.isFinite(limit) ? limit : undefined,
      });
      res.json({ logs, total: logs.length });
    } catch (err) {
      logger.exception('GET /api/connectors/logs failed', err, {
        service: 'IntegrationsApi',
        operation: 'listLogs',
      });
      res.status(500).json({ error: 'No se pudieron listar logs' });
    }
  });

  router.get('/connectors', (req, res) => {
    try {
      const filters = parseFilters(req.query as Record<string, unknown>);
      const connectors = integrationService.list(filters);
      res.json({ connectors, total: connectors.length });
    } catch (err) {
      logger.exception('GET /api/connectors failed', err, {
        service: 'IntegrationsApi',
        operation: 'list',
      });
      res.status(500).json({ error: 'No se pudieron listar conectores' });
    }
  });

  router.get('/connectors/:id', (req, res) => {
    try {
      const connector = integrationService.getById(req.params.id);
      if (!connector) {
        res.status(404).json({ error: 'Conector no encontrado' });
        return;
      }
      res.json(connector);
    } catch (err) {
      logger.exception('GET /api/connectors/:id failed', err, {
        service: 'IntegrationsApi',
        operation: 'get',
      });
      res.status(500).json({ error: 'No se pudo cargar el conector' });
    }
  });

  router.post('/connectors', (req, res) => {
    try {
      const body = (req.body ?? {}) as ConnectorCreateInput;
      const connector = integrationService.create(body);
      res.status(201).json(connector);
    } catch (err) {
      if (err instanceof IntegrationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/connectors failed', err, {
        service: 'IntegrationsApi',
        operation: 'create',
      });
      res.status(500).json({ error: 'No se pudo crear el conector' });
    }
  });

  router.put('/connectors/:id', (req, res) => {
    try {
      const body = (req.body ?? {}) as ConnectorUpdateInput;
      const connector = integrationService.update(req.params.id, body);
      if (!connector) {
        res.status(404).json({ error: 'Conector no encontrado' });
        return;
      }
      res.json(connector);
    } catch (err) {
      if (err instanceof IntegrationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('PUT /api/connectors/:id failed', err, {
        service: 'IntegrationsApi',
        operation: 'update',
      });
      res.status(500).json({ error: 'No se pudo actualizar el conector' });
    }
  });

  router.delete('/connectors/:id', (req, res) => {
    try {
      const ok = integrationService.delete(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'Conector no encontrado' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof IntegrationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('DELETE /api/connectors/:id failed', err, {
        service: 'IntegrationsApi',
        operation: 'delete',
      });
      res.status(500).json({ error: 'No se pudo eliminar el conector' });
    }
  });

  router.post('/connectors/:id/connect', async (req, res) => {
    try {
      const result = await integrationService.connect(req.params.id);
      res.json(result);
    } catch (err) {
      if (err instanceof IntegrationValidationError) {
        const status = err.message.includes('no encontrado') ? 404 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/connectors/:id/connect failed', err, {
        service: 'IntegrationsApi',
        operation: 'connect',
      });
      res.status(500).json({ error: 'No se pudo conectar' });
    }
  });

  router.post('/connectors/:id/disconnect', async (req, res) => {
    try {
      const result = await integrationService.disconnect(req.params.id);
      res.json(result);
    } catch (err) {
      if (err instanceof IntegrationValidationError) {
        const status = err.message.includes('no encontrado') ? 404 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/connectors/:id/disconnect failed', err, {
        service: 'IntegrationsApi',
        operation: 'disconnect',
      });
      res.status(500).json({ error: 'No se pudo desconectar' });
    }
  });

  router.post('/connectors/:id/test', async (req, res) => {
    try {
      const result = await integrationService.test(req.params.id);
      res.json(result);
    } catch (err) {
      if (err instanceof IntegrationValidationError) {
        const status = err.message.includes('no encontrado') ? 404 : 400;
        res.status(status).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/connectors/:id/test failed', err, {
        service: 'IntegrationsApi',
        operation: 'test',
      });
      res.status(500).json({ error: 'No se pudo probar la conexión' });
    }
  });

  return router;
}

function parseFilters(
  query: Record<string, unknown>,
): ConnectorListFilters {
  const filters: ConnectorListFilters = {};
  if (typeof query.q === 'string') filters.q = query.q;
  if (typeof query.category === 'string') filters.category = query.category;
  if (typeof query.provider === 'string') filters.provider = query.provider;
  if (typeof query.status === 'string') filters.status = query.status;
  if (query.enabled === 'true' || query.enabled === true) filters.enabled = true;
  if (query.enabled === 'false' || query.enabled === false) {
    filters.enabled = false;
  }
  return filters;
}
