import { Router } from 'express';
import type { HandleIncomingMessage } from '../../../application/use-cases/HandleIncomingMessage';
import { logger } from '../../../infrastructure/logging/logger';

interface WhatsAppTextMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
}

interface WhatsAppChangeValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string }; wa_id?: string }>;
  messages?: WhatsAppTextMessage[];
}

/**
 * Webhook WhatsApp Cloud API (verificación + recepción).
 */
export function createWhatsAppRouter(
  useCase: HandleIncomingMessage,
  verifyToken: string,
): Router {
  const router = Router();

  router.get('/', (req, res) => {
    console.log('[WEBHOOK] GET recibido');
    console.log(JSON.stringify(req.query, null, 2));

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === verifyToken) {
      logger.info('WhatsApp webhook verified');
      res.status(200).send(challenge);
      return;
    }

    res.sendStatus(403);
  });

  router.post('/', async (req, res) => {
    console.log('[WEBHOOK] POST recibido');
    console.log(JSON.stringify(req.body, null, 2));

    // Responder rápido a Meta
    res.sendStatus(200);

    try {
      const entry = req.body?.entry as Array<{
        changes?: Array<{ value?: WhatsAppChangeValue }>;
      }> | undefined;

      const changes = entry?.[0]?.changes ?? [];
      for (const change of changes) {
        const value = change.value;
        const message = value?.messages?.[0];
        if (!message || message.type !== 'text' || !message.text?.body) {
          console.log('[WhatsApp Webhook] Evento ignorado (no es texto)');
          continue;
        }

        console.log('[WhatsApp Webhook] Mensaje de texto', {
          from: message.from,
          preview: message.text.body.slice(0, 80),
        });

        const name = value?.contacts?.[0]?.profile?.name;
        await useCase.execute({
          phone: message.from,
          text: message.text.body,
          channel: 'whatsapp',
          externalConversationId: `whatsapp:${message.from}`,
          customerName: name,
          sendReply: true,
        });
        console.log('[WhatsApp Webhook] HandleIncomingMessage finalizó');
      }
    } catch (err) {
      console.error('[WhatsApp Webhook] Error procesando mensaje:');
      if (err instanceof Error) {
        console.error(err.message);
        console.error(err.stack);
      } else {
        console.error(err);
      }
      logger.error('WhatsApp webhook processing failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  });

  return router;
}
