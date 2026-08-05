import { Router, type Request } from 'express';
import type { HandleIncomingMessage } from '../../../application/use-cases/HandleIncomingMessage';
import type { WhatsAppIdempotencyGate } from '../../../infrastructure/messaging/WhatsAppMessageIdempotency';
import { MemoryWhatsAppMessageIdempotency } from '../../../infrastructure/messaging/WhatsAppMessageIdempotency';
import { whatsappDeliveryAudit } from '../../../infrastructure/messaging/WhatsAppDeliveryAudit';
import {
  summarizeWhatsAppPayload,
  verifyWhatsAppSignature,
} from '../../../infrastructure/messaging/whatsappSignature';
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

export interface WhatsAppRouterSecurity {
  appSecret?: string;
  requireSignature?: boolean;
}

type RequestWithRawBody = Request & { rawBody?: Buffer };

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
 * Production Sprint 1: firma X-Hub-Signature-256 + logs redactados.
 */
export function createWhatsAppRouter(
  useCase: HandleIncomingMessage,
  verifyToken: string,
  idempotencyGate?: WhatsAppIdempotencyGate,
  security: WhatsAppRouterSecurity = {},
): Router {
  const idempotency = idempotencyGate ?? new MemoryWhatsAppMessageIdempotency();
  const router = Router();
  const appSecret = security.appSecret?.trim() ?? '';
  const requireSignature = Boolean(security.requireSignature && appSecret);

  router.get('/', (req, res) => {
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
    if (requireSignature) {
      const raw =
        (req as RequestWithRawBody).rawBody ??
        Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
      const header =
        (req.header('x-hub-signature-256') ||
          req.header('X-Hub-Signature-256')) ??
        undefined;
      const ok = verifyWhatsAppSignature(raw, header, appSecret);
      if (!ok) {
        logger.warn('WhatsApp webhook signature rejected', {
          service: 'WhatsAppWebhook',
          operation: 'verifySignature',
        });
        res.sendStatus(403);
        return;
      }
    }

    const requestId = whatsappDeliveryAudit.newRequestId();
    const items = extractWhatsAppTextMessages(req.body);
    const summary = summarizeWhatsAppPayload(req.body);

    whatsappDeliveryAudit.recordPost({
      requestId,
      wamids: summary.wamids,
      path: req.originalUrl || '/webhook/whatsapp',
    });

    logger.info('WhatsApp webhook POST', {
      service: 'WhatsAppWebhook',
      requestId,
      entryCount: summary.entryCount,
      textMessageCount: summary.textMessageCount,
      wamidCount: summary.wamids.length,
    });

    // ACK inmediato — evita que Meta reintente por timeout mientras procesamos.
    res.sendStatus(200);

    try {
      if (items.length === 0) {
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
          logger.info('WhatsApp webhook duplicate skipped', {
            requestId,
            messageId: message.id,
          });
          continue;
        }

        logger.info('WhatsApp webhook processing message', {
          requestId,
          messageId: message.id,
          fromSuffix: message.from.slice(-4),
          previewLen: message.text!.body.length,
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
      }
    } catch (err) {
      logger.error('WhatsApp webhook processing failed', {
        requestId,
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  });

  return router;
}
