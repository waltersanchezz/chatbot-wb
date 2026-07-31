import { Router } from 'express';
import type { HandleIncomingMessage } from '../../../application/use-cases/HandleIncomingMessage';
import type { WhatsAppIdempotencyGate } from '../../../infrastructure/messaging/WhatsAppMessageIdempotency';
import { MemoryWhatsAppMessageIdempotency } from '../../../infrastructure/messaging/WhatsAppMessageIdempotency';
import { whatsappDeliveryAudit } from '../../../infrastructure/messaging/WhatsAppDeliveryAudit';
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

interface WhatsAppChange {
  field?: string;
  value?: WhatsAppChangeValue;
}

interface WhatsAppEntry {
  id?: string;
  changes?: WhatsAppChange[];
}

/**
 * Extrae todos los mensajes de texto del payload Meta (todos los entry/changes).
 */
export function extractWhatsAppTextMessages(body: unknown): Array<{
  message: WhatsAppTextMessage;
  contactName?: string;
}> {
  const root = body as { entry?: WhatsAppEntry[] } | null;
  const entries = Array.isArray(root?.entry) ? root.entry : [];
  const out: Array<{ message: WhatsAppTextMessage; contactName?: string }> = [];

  for (const entry of entries) {
    const changes = Array.isArray(entry?.changes) ? entry.changes : [];
    for (const change of changes) {
      if (change.field && change.field !== 'messages') continue;
      const value = change.value;
      const messages = Array.isArray(value?.messages) ? value.messages : [];
      const contactName = value?.contacts?.[0]?.profile?.name;
      for (const message of messages) {
        if (!message || message.type !== 'text' || !message.text?.body?.trim()) {
          continue;
        }
        out.push({ message, contactName });
      }
    }
  }
  return out;
}

/**
 * Webhook WhatsApp Cloud API (verificación + recepción).
 * Idempotencia por wamid: Meta reenvía el mismo evento (at-least-once).
 */
export function createWhatsAppRouter(
  useCase: HandleIncomingMessage,
  verifyToken: string,
  idempotencyGate?: WhatsAppIdempotencyGate,
): Router {
  const idempotency = idempotencyGate ?? new MemoryWhatsAppMessageIdempotency();
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
    const requestId = whatsappDeliveryAudit.newRequestId();
    const items = extractWhatsAppTextMessages(req.body);
    const wamids = items.map((i) => i.message.id);

    whatsappDeliveryAudit.recordPost({
      requestId,
      wamids,
      path: req.originalUrl || '/webhook/whatsapp',
    });

    console.log(`AUDIT_INSTANCE=${whatsappDeliveryAudit.auditInstance}`);
    console.log('[WEBHOOK] POST recibido', {
      requestId,
      auditInstance: whatsappDeliveryAudit.auditInstance,
      wamids,
      textMessageCount: items.length,
      time: new Date().toISOString(),
    });
    console.log(JSON.stringify(req.body, null, 2));

    // ACK inmediato — evita que Meta reintente por timeout mientras procesamos.
    res.sendStatus(200);

    try {
      if (items.length === 0) {
        console.log('[WhatsApp Webhook] Evento ignorado (sin mensajes de texto)', {
          requestId,
        });
        return;
      }

      for (const { message, contactName } of items) {
        const claimed = idempotency.claim(message.id);
        whatsappDeliveryAudit.recordClaim({
          requestId,
          wamid: message.id,
          result: claimed ? 'claim_ok' : 'duplicate_skipped',
        });

        if (!claimed) {
          console.log('[WhatsApp Webhook] Duplicado ignorado', {
            requestId,
            messageId: message.id,
          });
          logger.info('WhatsApp webhook duplicate skipped', {
            requestId,
            messageId: message.id,
          });
          continue;
        }

        console.log('[WhatsApp Webhook] claim OK — procesando', {
          requestId,
          from: message.from,
          messageId: message.id,
          preview: message.text!.body.slice(0, 80),
        });

        await useCase.execute({
          phone: message.from,
          text: message.text!.body,
          channel: 'whatsapp',
          externalConversationId: `whatsapp:${message.from}`,
          customerName: contactName,
          sendReply: true,
          inboundWamid: message.id,
          auditRequestId: requestId,
        });
        console.log('[WhatsApp Webhook] HandleIncomingMessage finalizó', {
          requestId,
          messageId: message.id,
        });
      }
    } catch (err) {
      console.error('[WhatsApp Webhook] Error procesando mensaje:', { requestId });
      if (err instanceof Error) {
        console.error(err.message);
        console.error(err.stack);
      } else {
        console.error(err);
      }
      logger.error('WhatsApp webhook processing failed', {
        requestId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  });

  return router;
}
