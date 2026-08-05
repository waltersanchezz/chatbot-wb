import { Router } from 'express';
import {
  OnboardingService,
  OnboardingValidationError,
} from '../../../application/services/OnboardingService';
import type { OnboardingFinishInput } from '../../../domain/dashboard/onboardingDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Onboarding API — wizard de instalación (Sprint 12).
 */
export function createOnboardingApiRouter(
  onboardingService: OnboardingService,
): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    try {
      res.json(onboardingService.getStatus());
    } catch (err) {
      logger.exception('GET /api/onboarding failed', err, {
        service: 'OnboardingApi',
        operation: 'getStatus',
      });
      res.status(500).json({ error: 'No se pudo cargar el onboarding' });
    }
  });

  router.put('/step', (req, res) => {
    try {
      const step = Number(req.body?.step);
      if (!Number.isFinite(step)) {
        res.status(400).json({ error: 'step inválido' });
        return;
      }
      res.json(onboardingService.setStep(step));
    } catch (err) {
      logger.exception('PUT /api/onboarding/step failed', err, {
        service: 'OnboardingApi',
        operation: 'setStep',
      });
      res.status(500).json({ error: 'No se pudo guardar el paso' });
    }
  });

  router.post('/finish', (req, res) => {
    try {
      const body = (req.body ?? {}) as OnboardingFinishInput;
      const result = onboardingService.finish(body);
      res.json(result);
    } catch (err) {
      if (err instanceof OnboardingValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/onboarding/finish failed', err, {
        service: 'OnboardingApi',
        operation: 'finish',
      });
      res.status(500).json({ error: 'No se pudo finalizar la instalación' });
    }
  });

  return router;
}
