import { Router } from 'express';
import type { SseController } from '../sse/SseController';

/**
 * GET /events — Server-Sent Events (Dashboard Sprint 8).
 */
export function createEventsRouter(sseController: SseController): Router {
  const router = Router();
  router.get('/', (req, res) => {
    sseController.handle(req, res);
  });
  return router;
}
