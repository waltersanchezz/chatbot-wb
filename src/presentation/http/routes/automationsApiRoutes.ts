import { Router } from 'express';
import {
  AutomationService,
  AutomationValidationError,
} from '../../../application/services/AutomationService';
import type {
  AutomationCreateInput,
  AutomationTestInput,
  AutomationUpdateInput,
} from '../../../domain/dashboard/automationDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Automations API — reglas por tenant (Dashboard Sprint 14).
 */
export function createAutomationsApiRouter(
  automationService: AutomationService,
): Router {
  const router = Router();

  router.get('/logs', (req, res) => {
    try {
      const ruleId =
        typeof req.query.ruleId === 'string' ? req.query.ruleId : undefined;
      const limit =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : undefined;
      res.json({ logs: automationService.listLogs({ ruleId, limit }) });
    } catch (err) {
      logger.exception('GET /api/automations/logs failed', err, {
        service: 'AutomationsApi',
        operation: 'listLogs',
      });
      res.status(500).json({ error: 'No se pudieron cargar los logs' });
    }
  });

  router.post('/test', (req, res) => {
    try {
      const body = (req.body ?? {}) as AutomationTestInput;
      const result = automationService.test(body);
      res.json(result);
    } catch (err) {
      if (err instanceof AutomationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/automations/test failed', err, {
        service: 'AutomationsApi',
        operation: 'test',
      });
      res.status(500).json({ error: 'No se pudo probar la regla' });
    }
  });

  router.get('/', (_req, res) => {
    try {
      const rules = automationService.list();
      res.json({
        rules,
        total: rules.length,
        enabledCount: rules.filter((r) => r.enabled).length,
      });
    } catch (err) {
      logger.exception('GET /api/automations failed', err, {
        service: 'AutomationsApi',
        operation: 'list',
      });
      res.status(500).json({ error: 'No se pudieron listar automatizaciones' });
    }
  });

  router.post('/', (req, res) => {
    try {
      const body = (req.body ?? {}) as AutomationCreateInput;
      const created = automationService.create(body);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof AutomationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/automations failed', err, {
        service: 'AutomationsApi',
        operation: 'create',
      });
      res.status(500).json({ error: 'No se pudo crear la regla' });
    }
  });

  router.post('/:id/duplicate', (req, res) => {
    try {
      const dup = automationService.duplicate(req.params.id);
      if (!dup) {
        res.status(404).json({ error: 'Regla no encontrada' });
        return;
      }
      res.status(201).json(dup);
    } catch (err) {
      if (err instanceof AutomationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/automations/:id/duplicate failed', err, {
        service: 'AutomationsApi',
        operation: 'duplicate',
      });
      res.status(500).json({ error: 'No se pudo duplicar' });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const body = (req.body ?? {}) as AutomationUpdateInput;
      const updated = automationService.update(req.params.id, body);
      if (!updated) {
        res.status(404).json({ error: 'Regla no encontrada' });
        return;
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof AutomationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('PUT /api/automations/:id failed', err, {
        service: 'AutomationsApi',
        operation: 'update',
      });
      res.status(500).json({ error: 'No se pudo actualizar' });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const ok = automationService.delete(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'Regla no encontrada' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof AutomationValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('DELETE /api/automations/:id failed', err, {
        service: 'AutomationsApi',
        operation: 'delete',
      });
      res.status(500).json({ error: 'No se pudo eliminar' });
    }
  });

  return router;
}
