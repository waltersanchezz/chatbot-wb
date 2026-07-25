import { Router } from 'express';
import type { LogRepository } from '../../../domain/ports/LogRepository';

export function createLogsRouter(logs: LogRepository): Router {
  const router = Router();

  router.get('/recent', async (req, res, next) => {
    try {
      const limit = Math.min(Number(req.query.limit ?? 20), 100);
      const items = await logs.listRecent(limit);
      res.json({
        count: items.length,
        items: items.map((l) => ({
          id: l.id,
          date: l.date.toISOString(),
          customer: l.customerPhone,
          message: l.inboundMessage,
          response: l.outboundResponse,
          durationMs: l.durationMs,
          error: l.error ?? null,
          metadata: l.metadata ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
