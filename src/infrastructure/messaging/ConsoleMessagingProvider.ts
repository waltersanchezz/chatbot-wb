import type { MessagingProvider, OutboundMessage } from '../../domain/ports/MessagingProvider';
import { logger } from '../logging/logger';
import { whatsappDeliveryAudit } from './WhatsAppDeliveryAudit';

export class ConsoleMessagingProvider implements MessagingProvider {
  async sendText(message: OutboundMessage): Promise<{ ok: boolean; providerMessageId?: string }> {
    const stack = new Error('sendText_trace').stack ?? '';
    logger.info('Outbound message', {
      channel: message.channel,
      to: message.to,
      body: message.body,
      inboundWamid: message.inboundWamid,
    });
    const providerMessageId = `local-${Date.now()}`;
    whatsappDeliveryAudit.recordSend({
      wamid: message.inboundWamid,
      conversationId: message.conversationId,
      to: message.to,
      providerMessageId,
      ok: true,
      stack,
    });
    return { ok: true, providerMessageId };
  }
}
