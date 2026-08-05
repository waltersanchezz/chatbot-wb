import { Router, type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

/**
 * Panel Vite del operador (Production Sprint 3).
 * Estáticos en apps/dashboard/dist — independiente del motor del chatbot.
 */
export function getDashboardStaticPath(): string {
  return path.join(process.cwd(), 'apps', 'dashboard', 'dist');
}

export function createDashboardRouter(): Router {
  const router = Router();
  const dashboardDir = getDashboardStaticPath();
  const indexHtml = path.join(dashboardDir, 'index.html');

  function sendIndex(_req: Request, res: Response, next: NextFunction): void {
    if (!fs.existsSync(indexHtml)) {
      res.status(503).json({
        error:
          'Dashboard no construido. Ejecuta: npm run dashboard:build',
      });
      return;
    }
    res.sendFile(indexHtml, (err) => {
      if (err) next(err);
    });
  }

  router.get(['/', ''], sendIndex);

  /** SPA fallback: rutas del React Router → index.html */
  router.get(/.*/, (req, res, next) => {
    const last = req.path.split('/').pop() ?? '';
    if (last.includes('.')) {
      next();
      return;
    }
    sendIndex(req, res, next);
  });

  return router;
}
