import type { MessagingProvider, OutboundMessage } from '../../domain/ports/MessagingProvider';
import { logger } from '../logging/logger';

export class ConsoleMessagingProvider implements MessagingProvider {
  async sendText(message: OutboundMessage): Promise<{ ok: boolean; providerMessageId?: string }> {
    logger.info('Outbound message', {
      channel: message.channel,
      to: message.to,
      body: message.body,
    });
    return { ok: true, providerMessageId: `local-${Date.now()}` };
  }
}
