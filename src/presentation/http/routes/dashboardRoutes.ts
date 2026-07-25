import { Router } from 'express';
import path from 'path';

/**
 * Sirve el CRM estático en /dashboard.
 * Independiente del motor del chatbot.
 */
export function createDashboardRouter(): Router {
  const router = Router();
  const dashboardDir = path.join(process.cwd(), 'dashboard');

  router.get(['/', ''], (_req, res) => {
    res.sendFile(path.join(dashboardDir, 'index.html'));
  });

  return router;
}

export function getDashboardStaticPath(): string {
  return path.join(process.cwd(), 'dashboard');
}
