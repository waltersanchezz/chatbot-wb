import { Router } from 'express';
import { z } from 'zod';
import type { CustomerProfileService } from '../../../application/services/CustomerProfileService';
import type { InteractionService } from '../../../application/services/InteractionService';
import {
  INTERACTION_TYPES,
  type InteractionType,
} from '../../../domain/entities/Interaction';
import {
  serializeCustomerProfile,
  serializeInteraction,
  serializeLead,
  serializeVehicle,
} from './leadSerialize';

const interactionsQuerySchema = z.object({
  limit: z.coerce.number().int().min(0).optional(),
  before: z.string().datetime({ offset: true }).optional(),
  types: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

function parseInteractionTypes(raw: string | undefined): InteractionType[] | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (!(INTERACTION_TYPES as readonly string[]).includes(part)) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: ['types'],
          message: `Tipo de interacción inválido: ${part}`,
        },
      ]);
    }
  }
  return parts.length ? (parts as InteractionType[]) : undefined;
}

function handleCustomerRouteError(
  err: unknown,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Validación inválida', details: err.flatten() });
    return;
  }
  next(err);
}

export function createCustomerRouter(
  customerProfileService: CustomerProfileService,
  interactionService: InteractionService,
): Router {
  const router = Router();

  router.get('/by-phone/:phone', async (req, res, next) => {
    try {
      const phone = decodeURIComponent(req.params.phone).trim();
      if (!phone) {
        res.status(400).json({ error: 'Teléfono requerido' });
        return;
      }
      const detail = await customerProfileService.getDetail({ phone });
      if (!detail) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
      }
      res.json(serializeCustomerProfile(detail));
    } catch (err) {
      handleCustomerRouteError(err, res, next);
    }
  });

  router.get('/:customerId', async (req, res, next) => {
    try {
      const detail = await customerProfileService.getDetail({
        customerId: req.params.customerId,
      });
      if (!detail) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
      }
      res.json(serializeCustomerProfile(detail));
    } catch (err) {
      handleCustomerRouteError(err, res, next);
    }
  });

  router.get('/:customerId/leads', async (req, res, next) => {
    try {
      const detail = await customerProfileService.getDetail({
        customerId: req.params.customerId,
      });
      if (!detail) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
      }
      res.json({
        count: detail.leads.length,
        items: detail.leads.map(serializeLead),
      });
    } catch (err) {
      handleCustomerRouteError(err, res, next);
    }
  });

  router.get('/:customerId/vehicles', async (req, res, next) => {
    try {
      const detail = await customerProfileService.getDetail({
        customerId: req.params.customerId,
      });
      if (!detail) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
      }
      res.json({
        count: detail.vehicles.length,
        items: detail.vehicles.map(serializeVehicle),
      });
    } catch (err) {
      handleCustomerRouteError(err, res, next);
    }
  });

  router.get('/:customerId/interactions', async (req, res, next) => {
    try {
      const profile = await customerProfileService.getByCustomerId(
        req.params.customerId,
      );
      if (!profile) {
        res.status(404).json({ error: 'Cliente no encontrado' });
        return;
      }

      const query = interactionsQuerySchema.parse(req.query);
      const types = parseInteractionTypes(query.types);
      const order = query.order ?? 'desc';

      const items = await interactionService.listTimeline(req.params.customerId, {
        limit: query.limit,
        before: query.before ? new Date(query.before) : undefined,
        types,
        order,
      });

      res.json({
        count: items.length,
        order,
        items: items.map(serializeInteraction),
      });
    } catch (err) {
      handleCustomerRouteError(err, res, next);
    }
  });

  return router;
}
