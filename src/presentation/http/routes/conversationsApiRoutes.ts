import { Router } from 'express';
import type { ConversationDetailService } from '../../../application/services/ConversationDetailService';
import type { ConversationService } from '../../../application/services/ConversationService';
import type { ConversationListQuery } from '../../../domain/dashboard/conversationListDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Conversations API del Dashboard React (Sprint 2–3).
 */
export function createConversationsApiRouter(
  conversationService: ConversationService,
  conversationDetailService: ConversationDetailService,
): Router {
  const router = Router();

  router.get('/', (req, res) => {
    try {
      const query: ConversationListQuery = {
        page: parsePositiveInt(req.query.page, 1),
        pageSize: parsePositiveInt(req.query.pageSize, 20),
        q: typeof req.query.q === 'string' ? req.query.q : undefined,
        sortBy:
          req.query.sortBy === 'createdAt' ? 'createdAt' : 'lastActivityAt',
        sortOrder: req.query.sortOrder === 'asc' ? 'asc' : 'desc',
      };
      res.json(conversationService.listConversations(query));
    } catch (err) {
      logger.exception('GET /api/conversations failed', err, {
        service: 'ConversationsApi',
        operation: 'list',
      });
      res.status(500).json({ error: 'No se pudo listar conversaciones' });
    }
  });

  router.get('/:id', (req, res) => {
    try {
      const id = String(req.params.id ?? '');
      const detail = conversationDetailService.getById(id);
      if (!detail) {
        res.status(404).json({ error: 'Conversación no encontrada' });
        return;
      }
      res.json(detail);
    } catch (err) {
      logger.exception('GET /api/conversations/:id failed', err, {
        service: 'ConversationsApi',
        operation: 'getById',
      });
      res.status(500).json({ error: 'No se pudo cargar el detalle' });
    }
  });

  return router;
}

function parsePositiveInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}
