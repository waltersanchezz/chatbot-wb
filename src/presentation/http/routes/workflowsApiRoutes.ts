import { Router } from 'express';
import {
  WorkflowService,
  WorkflowValidationError,
} from '../../../application/services/WorkflowService';
import type {
  WorkflowCreateInput,
  WorkflowTestInput,
  WorkflowUpdateInput,
} from '../../../domain/dashboard/workflowDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Workflows API — orquestación visual por tenant (Dashboard Sprint 15).
 */
export function createWorkflowsApiRouter(
  workflowService: WorkflowService,
): Router {
  const router = Router();

  router.get('/runs', (req, res) => {
    try {
      const workflowId =
        typeof req.query.workflowId === 'string'
          ? req.query.workflowId
          : undefined;
      const limit =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : undefined;
      res.json({ runs: workflowService.listRuns({ workflowId, limit }) });
    } catch (err) {
      logger.exception('GET /api/workflows/runs failed', err, {
        service: 'WorkflowsApi',
        operation: 'listRuns',
      });
      res.status(500).json({ error: 'No se pudieron cargar las ejecuciones' });
    }
  });

  router.post('/test', (req, res) => {
    try {
      const body = (req.body ?? {}) as WorkflowTestInput;
      res.json(workflowService.test(body));
    } catch (err) {
      if (err instanceof WorkflowValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/workflows/test failed', err, {
        service: 'WorkflowsApi',
        operation: 'test',
      });
      res.status(500).json({ error: 'No se pudo probar el workflow' });
    }
  });

  router.get('/', (_req, res) => {
    try {
      const workflows = workflowService.list();
      res.json({
        workflows,
        total: workflows.length,
        enabledCount: workflows.filter((w) => w.enabled).length,
      });
    } catch (err) {
      logger.exception('GET /api/workflows failed', err, {
        service: 'WorkflowsApi',
        operation: 'list',
      });
      res.status(500).json({ error: 'No se pudieron listar workflows' });
    }
  });

  router.post('/', (req, res) => {
    try {
      const body = (req.body ?? {}) as WorkflowCreateInput;
      const created = workflowService.create(body);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof WorkflowValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/workflows failed', err, {
        service: 'WorkflowsApi',
        operation: 'create',
      });
      res.status(500).json({ error: 'No se pudo crear el workflow' });
    }
  });

  router.post('/:id/duplicate', (req, res) => {
    try {
      const dup = workflowService.duplicate(req.params.id);
      if (!dup) {
        res.status(404).json({ error: 'Workflow no encontrado' });
        return;
      }
      res.status(201).json(dup);
    } catch (err) {
      if (err instanceof WorkflowValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/workflows/:id/duplicate failed', err, {
        service: 'WorkflowsApi',
        operation: 'duplicate',
      });
      res.status(500).json({ error: 'No se pudo duplicar' });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const body = (req.body ?? {}) as WorkflowUpdateInput;
      const updated = workflowService.update(req.params.id, body);
      if (!updated) {
        res.status(404).json({ error: 'Workflow no encontrado' });
        return;
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof WorkflowValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('PUT /api/workflows/:id failed', err, {
        service: 'WorkflowsApi',
        operation: 'update',
      });
      res.status(500).json({ error: 'No se pudo actualizar' });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const ok = workflowService.delete(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'Workflow no encontrado' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof WorkflowValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('DELETE /api/workflows/:id failed', err, {
        service: 'WorkflowsApi',
        operation: 'delete',
      });
      res.status(500).json({ error: 'No se pudo eliminar' });
    }
  });

  return router;
}
