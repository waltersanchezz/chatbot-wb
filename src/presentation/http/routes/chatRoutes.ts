import { Router } from 'express';
import { z } from 'zod';
import type { HandleIncomingMessage } from '../../../application/use-cases/HandleIncomingMessage';

const bodySchema = z.object({
  phone: z.string().min(7).max(32),
  message: z.string().min(1).max(4000),
  channel: z
    .enum(['whatsapp', 'facebook', 'instagram', 'web', 'marketplace', 'api'])
    .default('api'),
  customerName: z.string().optional(),
  conversationId: z.string().optional(),
});

export function createChatRouter(useCase: HandleIncomingMessage): Router {
  const router = Router();

  router.post('/', async (req, res, next) => {
    try {
      const body = bodySchema.parse(req.body);
      const result = await useCase.execute({
        phone: body.phone,
        text: body.message,
        channel: body.channel,
        externalConversationId: body.conversationId,
        customerName: body.customerName,
        sendReply: false,
      });

      res.json({
        conversationId: result.conversationId,
        customerId: result.customerId,
        reply: result.reply,
        needsHumanHandoff: result.needsHumanHandoff,
        durationMs: result.durationMs,
      });
    } catch (err) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: 'Invalid request', details: err.flatten() });
        return;
      }
      next(err);
    }
  });

  return router;
}
