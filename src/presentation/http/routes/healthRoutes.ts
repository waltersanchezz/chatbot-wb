import { Router } from 'express';
import { env } from '../../../infrastructure/config/env';

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      app: env.appName,
      company: env.companyName,
      version: '1.0.0',
      aiProvider: env.aiProvider,
    });
  });

  return router;
}
