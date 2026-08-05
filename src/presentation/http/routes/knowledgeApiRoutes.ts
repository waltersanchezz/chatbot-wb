import { Router } from 'express';
import {
  KnowledgeService,
  KnowledgeValidationError,
} from '../../../application/services/KnowledgeService';
import type {
  KnowledgeCreateInput,
  KnowledgeListFilters,
  KnowledgeUpdateInput,
} from '../../../domain/dashboard/knowledgeItemDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Knowledge API — administrador de conocimiento por tenant (Dashboard Sprint 13).
 */
export function createKnowledgeApiRouter(knowledgeService: KnowledgeService): Router {
  const router = Router();

  router.get('/search', (req, res) => {
    try {
      const q = String(req.query.q ?? req.query.query ?? '');
      res.json({ items: knowledgeService.search(q), query: q });
    } catch (err) {
      logger.exception('GET /api/knowledge/search failed', err, {
        service: 'KnowledgeApi',
        operation: 'search',
      });
      res.status(500).json({ error: 'No se pudo buscar conocimiento' });
    }
  });

  router.get('/export', (req, res) => {
    try {
      const filters = parseListFilters(req.query as Record<string, unknown>);
      const csv = knowledgeService.exportCsv(filters);
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        'attachment; filename="knowledge.csv"',
      );
      res.send(csv);
    } catch (err) {
      logger.exception('GET /api/knowledge/export failed', err, {
        service: 'KnowledgeApi',
        operation: 'export',
      });
      res.status(500).json({ error: 'No se pudo exportar' });
    }
  });

  router.post('/import', (req, res) => {
    try {
      const csv =
        typeof req.body?.csv === 'string'
          ? req.body.csv
          : typeof req.body === 'string'
            ? req.body
            : '';
      const result = knowledgeService.importCsv(csv);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof KnowledgeValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/knowledge/import failed', err, {
        service: 'KnowledgeApi',
        operation: 'import',
      });
      res.status(500).json({ error: 'No se pudo importar' });
    }
  });

  router.get('/', (req, res) => {
    try {
      const filters = parseListFilters(req.query as Record<string, unknown>);
      res.json(knowledgeService.list(filters));
    } catch (err) {
      logger.exception('GET /api/knowledge failed', err, {
        service: 'KnowledgeApi',
        operation: 'list',
      });
      res.status(500).json({ error: 'No se pudo listar conocimiento' });
    }
  });

  router.post('/', (req, res) => {
    try {
      const body = (req.body ?? {}) as KnowledgeCreateInput;
      const created = knowledgeService.create(body);
      res.status(201).json(created);
    } catch (err) {
      if (err instanceof KnowledgeValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/knowledge failed', err, {
        service: 'KnowledgeApi',
        operation: 'create',
      });
      res.status(500).json({ error: 'No se pudo crear el ítem' });
    }
  });

  router.post('/:id/duplicate', (req, res) => {
    try {
      const dup = knowledgeService.duplicate(req.params.id);
      if (!dup) {
        res.status(404).json({ error: 'Ítem no encontrado' });
        return;
      }
      res.status(201).json(dup);
    } catch (err) {
      if (err instanceof KnowledgeValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/knowledge/:id/duplicate failed', err, {
        service: 'KnowledgeApi',
        operation: 'duplicate',
      });
      res.status(500).json({ error: 'No se pudo duplicar' });
    }
  });

  router.put('/:id', (req, res) => {
    try {
      const body = (req.body ?? {}) as KnowledgeUpdateInput;
      const updated = knowledgeService.update(req.params.id, body);
      if (!updated) {
        res.status(404).json({ error: 'Ítem no encontrado' });
        return;
      }
      res.json(updated);
    } catch (err) {
      if (err instanceof KnowledgeValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('PUT /api/knowledge/:id failed', err, {
        service: 'KnowledgeApi',
        operation: 'update',
      });
      res.status(500).json({ error: 'No se pudo actualizar' });
    }
  });

  router.delete('/:id', (req, res) => {
    try {
      const ok = knowledgeService.delete(req.params.id);
      if (!ok) {
        res.status(404).json({ error: 'Ítem no encontrado' });
        return;
      }
      res.status(204).send();
    } catch (err) {
      if (err instanceof KnowledgeValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('DELETE /api/knowledge/:id failed', err, {
        service: 'KnowledgeApi',
        operation: 'delete',
      });
      res.status(500).json({ error: 'No se pudo eliminar' });
    }
  });

  return router;
}

function parseListFilters(
  query: Record<string, unknown>,
): KnowledgeListFilters {
  const filters: KnowledgeListFilters = {};
  if (typeof query.q === 'string' && query.q.trim()) filters.q = query.q;
  if (typeof query.category === 'string' && query.category.trim()) {
    filters.category = query.category;
  }
  if (query.enabled === 'true' || query.enabled === true) filters.enabled = true;
  if (query.enabled === 'false' || query.enabled === false) {
    filters.enabled = false;
  }
  return filters;
}
