import { Router } from 'express';
import { z } from 'zod';
import type { LeadService } from '../../../application/services/LeadService';

const statusSchema = z.object({
  status: z.enum(['nuevo', 'cotizado', 'vendido', 'perdido']),
});

export function createLeadRouter(leadService: LeadService): Router {
  const router = Router();

  router.get('/', async (_req, res, next) => {
    try {
      const items = await leadService.listLeads();
      res.json({
        count: items.length,
        items: items.map((lead) => ({
          id: lead.id,
          createdAt: lead.createdAt.toISOString(),
          phone: lead.phone,
          product: lead.product,
          vehicleBrand: lead.vehicleBrand,
          vehicleModel: lead.vehicleModel,
          year: lead.year,
          optionLabel: lead.optionLabel,
          optionValue: lead.optionValue,
          recommendation: lead.recommendation,
          status: lead.status,
          name: lead.name ?? null,
          conversationId: lead.conversationId,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/status', async (req, res, next) => {
    try {
      const body = statusSchema.parse(req.body);
      const updated = await leadService.updateStatus(req.params.id, body.status);
      if (!updated) {
        res.status(404).json({ error: 'Lead no encontrado' });
        return;
      }
      res.json({
        id: updated.id,
        status: updated.status,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Estado inválido', details: err.flatten() });
        return;
      }
      next(err);
    }
  });

  return router;
}
