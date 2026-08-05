import { Router } from 'express';
import {
  BillingService,
  BillingValidationError,
} from '../../../application/services/BillingService';
import type { SubscriptionUpdateInput } from '../../../domain/dashboard/billingDto';
import { logger } from '../../../infrastructure/logging/logger';

/**
 * Billing API — planes, suscripción y uso por tenant (Sprint 17).
 */
export function createBillingApiRouter(billingService: BillingService): Router {
  const router = Router();

  router.get('/plans', (_req, res) => {
    try {
      const plans = billingService.listPlans();
      res.json({ plans, total: plans.length });
    } catch (err) {
      logger.exception('GET /api/plans failed', err, {
        service: 'BillingApi',
        operation: 'listPlans',
      });
      res.status(500).json({ error: 'No se pudieron cargar los planes' });
    }
  });

  router.get('/subscription', (_req, res) => {
    try {
      res.json(billingService.getBillingOverview());
    } catch (err) {
      logger.exception('GET /api/subscription failed', err, {
        service: 'BillingApi',
        operation: 'getSubscription',
      });
      res.status(500).json({ error: 'No se pudo cargar la suscripción' });
    }
  });

  router.put('/subscription', (req, res) => {
    try {
      const body = (req.body ?? {}) as SubscriptionUpdateInput;
      const updated = billingService.updateSubscription(sanitizeUpdate(body));
      res.json({
        subscription: updated,
        plan: billingService.getPlan(updated.planId),
        usage: billingService.getUsage(),
      });
    } catch (err) {
      if (err instanceof BillingValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('PUT /api/subscription failed', err, {
        service: 'BillingApi',
        operation: 'updateSubscription',
      });
      res.status(500).json({ error: 'No se pudo actualizar la suscripción' });
    }
  });

  router.get('/usage', (req, res) => {
    try {
      const period =
        typeof req.query.period === 'string' ? req.query.period : undefined;
      res.json(billingService.getUsage(period));
    } catch (err) {
      logger.exception('GET /api/usage failed', err, {
        service: 'BillingApi',
        operation: 'getUsage',
      });
      res.status(500).json({ error: 'No se pudo cargar el uso' });
    }
  });

  router.get('/billing/events', (req, res) => {
    try {
      const limit =
        typeof req.query.limit === 'string'
          ? Number(req.query.limit)
          : undefined;
      res.json({ events: billingService.listEvents(limit) });
    } catch (err) {
      logger.exception('GET /api/billing/events failed', err, {
        service: 'BillingApi',
        operation: 'listEvents',
      });
      res.status(500).json({ error: 'No se pudieron cargar los eventos' });
    }
  });

  /** Registro opcional de uso (módulos / pruebas). No bloquea. */
  router.post('/usage', (req, res) => {
    try {
      const metric = String(req.body?.metric ?? '');
      const delta = Number(req.body?.delta ?? 1);
      const result = billingService.registerUsage(metric, delta);
      res.status(201).json(result);
    } catch (err) {
      if (err instanceof BillingValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      logger.exception('POST /api/usage failed', err, {
        service: 'BillingApi',
        operation: 'registerUsage',
      });
      res.status(500).json({ error: 'No se pudo registrar el uso' });
    }
  });

  return router;
}

function sanitizeUpdate(body: SubscriptionUpdateInput): SubscriptionUpdateInput {
  const out: SubscriptionUpdateInput = {};
  if (body.planId !== undefined) out.planId = String(body.planId).trim();
  if (body.status !== undefined) out.status = body.status;
  if (body.cancel !== undefined) out.cancel = Boolean(body.cancel);
  if (body.reactivate !== undefined) out.reactivate = Boolean(body.reactivate);
  if (body.billingCycle === 'monthly' || body.billingCycle === 'annual') {
    out.billingCycle = body.billingCycle;
  }
  return out;
}
