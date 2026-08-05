import { Router } from 'express';
import type { TaskService } from '../../../application/services/TaskService';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Task Center API — tareas comerciales (Dashboard Sprint 6).
 */
export function createTasksApiRouter(taskService: TaskService): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      res.json(taskService.getTasks());
    } catch (err) {
      logger.exception('GET /api/tasks failed', err, {
        service: 'TasksApi',
        operation: 'getTasks',
      });
      res.status(500).json({ error: 'No se pudieron cargar las tareas' });
    }
  });

  return router;
}
