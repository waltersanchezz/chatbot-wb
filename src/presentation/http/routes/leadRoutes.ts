import { Router } from 'express';
import { z } from 'zod';
import { IllegalLeadTransitionError } from '../../../application/crm/leadStateMachine';
import {
  LeadNotFoundError,
  type LeadService,
} from '../../../application/services/LeadService';
import { LEAD_STATUSES } from '../../../domain/crm/leadStatuses';
import type { LeadListFilter } from '../../../domain/ports/LeadRepository';
import type { LeadPriority, LeadProduct, LeadStatus } from '../../../domain/entities/Lead';
import { serializeLead, serializeLeadEvent } from './leadSerialize';

const leadStatusEnum = z.enum(
  LEAD_STATUSES as unknown as [LeadStatus, ...LeadStatus[]],
);

const statusBodySchema = z.object({
  status: leadStatusEnum,
  lostReason: z.string().trim().min(1).optional(),
});

const assignBodySchema = z.object({
  assigneeId: z.string().trim().min(1),
  assigneeName: z.string().trim().min(1).optional(),
});

const recontactBodySchema = z.object({
  dueAt: z.string().datetime({ offset: true }).optional(),
  note: z.string().optional(),
});

const noteBodySchema = z.object({
  note: z.string().trim().min(1),
});

const productEnum = z.enum(['Batería', 'Rodamiento']);
const outcomeEnum = z.enum(['matched', 'partial', 'empty', 'unknown']);

const listQuerySchema = z.object({
  status: z.string().optional(),
  priority: z.string().optional(),
  product: productEnum.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  assigneeId: z.string().optional(),
  customerId: z.string().optional(),
  outcome: outcomeEnum.optional(),
  q: z.string().optional(),
});

function parseCsvEnum<T extends string>(
  raw: string | undefined,
  allowed: readonly T[],
  field: string,
): T | T[] | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    if (!(allowed as readonly string[]).includes(part)) {
      throw new z.ZodError([
        {
          code: 'custom',
          path: [field],
          message: `Valor inválido: ${part}`,
        },
      ]);
    }
  }
  if (parts.length === 0) return undefined;
  if (parts.length === 1) return parts[0] as T;
  return parts as T[];
}

function actorFromRequest(req: {
  header(name: string): string | undefined;
}): { actorId?: string } {
  const actorId = req.header('X-Actor-Id')?.trim();
  return actorId ? { actorId } : {};
}

function handleLeadRouteError(
  err: unknown,
  res: import('express').Response,
  next: import('express').NextFunction,
): void {
  if (err instanceof z.ZodError) {
    res.status(400).json({ error: 'Validación inválida', details: err.flatten() });
    return;
  }
  if (err instanceof LeadNotFoundError) {
    res.status(404).json({ error: 'Lead no encontrado', leadId: err.leadId });
    return;
  }
  if (err instanceof IllegalLeadTransitionError) {
    res.status(409).json({
      error: 'Transición de estado ilegal',
      from: err.from,
      to: err.to,
      code: err.code,
    });
    return;
  }
  next(err);
}

export function createLeadRouter(leadService: LeadService): Router {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const query = listQuerySchema.parse(req.query);
      const status = parseCsvEnum(
        query.status,
        LEAD_STATUSES,
        'status',
      ) as LeadStatus | LeadStatus[] | undefined;
      const priority = parseCsvEnum(
        query.priority,
        ['Alta', 'Media', 'Baja'] as const,
        'priority',
      ) as LeadPriority | LeadPriority[] | undefined;

      const filter: LeadListFilter = {
        status,
        priority,
        product: query.product as LeadProduct | undefined,
        from: query.from ? new Date(query.from) : undefined,
        to: query.to ? new Date(query.to) : undefined,
        assigneeId: query.assigneeId,
        customerId: query.customerId,
        outcome: query.outcome,
        q: query.q,
      };

      const items = await leadService.listLeads(filter);
      res.json({
        count: items.length,
        items: items.map(serializeLead),
      });
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const lead = await leadService.getLead(req.params.id);
      if (!lead) {
        res.status(404).json({ error: 'Lead no encontrado' });
        return;
      }
      res.json(serializeLead(lead));
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  router.get('/:id/events', async (req, res, next) => {
    try {
      const events = await leadService.listEvents(req.params.id);
      res.json({
        count: events.length,
        items: events.map(serializeLeadEvent),
      });
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  router.patch('/:id/status', async (req, res, next) => {
    try {
      const body = statusBodySchema.parse(req.body);
      const actor = actorFromRequest(req);
      const updated = await leadService.changeStatus(req.params.id, body.status, {
        lostReason: body.lostReason,
        actor: 'api',
        ...actor,
      });
      res.json(serializeLead(updated));
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  router.post('/:id/assign', async (req, res, next) => {
    try {
      const body = assignBodySchema.parse(req.body);
      const actor = actorFromRequest(req);
      const updated = await leadService.assign(
        req.params.id,
        {
          assigneeId: body.assigneeId,
          assigneeName: body.assigneeName,
        },
        { actor: 'api', ...actor },
      );
      res.json(serializeLead(updated));
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  router.post('/:id/claim', async (req, res, next) => {
    try {
      const actorId = req.header('X-Actor-Id')?.trim();
      if (!actorId) {
        res.status(400).json({
          error: 'Header X-Actor-Id requerido para claim',
        });
        return;
      }
      const assigneeName = req.header('X-Actor-Name')?.trim() || undefined;
      const updated = await leadService.claim(
        req.params.id,
        { assigneeId: actorId, assigneeName },
        { actor: 'advisor', actorId },
      );
      res.json(serializeLead(updated));
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  router.post('/:id/recontact', async (req, res, next) => {
    try {
      const body = recontactBodySchema.parse(req.body ?? {});
      const actor = actorFromRequest(req);
      const updated = await leadService.scheduleRecontact(req.params.id, {
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        note: body.note,
        actor: 'api',
        ...actor,
      });
      res.json(serializeLead(updated));
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  router.post('/:id/recontact/done', async (req, res, next) => {
    try {
      const actor = actorFromRequest(req);
      const updated = await leadService.completeRecontact(req.params.id, {
        actor: 'api',
        ...actor,
      });
      res.json(serializeLead(updated));
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  router.post('/:id/notes', async (req, res, next) => {
    try {
      const body = noteBodySchema.parse(req.body);
      const actor = actorFromRequest(req);
      const updated = await leadService.addNote(req.params.id, body.note, {
        actor: 'advisor',
        ...actor,
      });
      res.json(serializeLead(updated));
    } catch (err) {
      handleLeadRouteError(err, res, next);
    }
  });

  return router;
}
