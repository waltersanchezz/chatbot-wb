import type { MessagingProvider, OutboundMessage } from '../../domain/ports/MessagingProvider';
import { logger } from '../logging/logger';
import { whatsappDeliveryAudit } from './WhatsAppDeliveryAudit';

export interface WhatsAppCloudConfig {
  accessToken: string;
  phoneNumberId: string;
  apiVersion: string;
}

/**
 * Adaptador WhatsApp Cloud API.
 * Si no hay token, degrada a log local (desarrollo).
 */
export class WhatsAppCloudProvider implements MessagingProvider {
  constructor(private readonly config: WhatsAppCloudConfig) {}

  async sendText(message: OutboundMessage): Promise<{ ok: boolean; providerMessageId?: string }> {
    const stack = new Error('sendText_trace').stack ?? '';

    if (!this.config.accessToken || !this.config.phoneNumberId) {
      logger.info('WhatsApp stub send (no credentials)', {
        to: message.to,
        body: message.body,
      });
      const providerMessageId = `wa-stub-${Date.now()}`;
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

    const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: message.to,
        type: 'text',
        text: { body: message.body },
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      logger.error('WhatsApp send failed', { status: response.status, errorBody });
      whatsappDeliveryAudit.recordSend({
        wamid: message.inboundWamid,
        conversationId: message.conversationId,
        to: message.to,
        ok: false,
        stack,
      });
      return { ok: false };
    }

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>;
    };

    const providerMessageId = data.messages?.[0]?.id;
    whatsappDeliveryAudit.recordSend({
      wamid: message.inboundWamid,
      conversationId: message.conversationId,
      to: message.to,
      providerMessageId,
      ok: true,
      stack,
    });

    return {
      ok: true,
      providerMessageId,
    };
  }
}
