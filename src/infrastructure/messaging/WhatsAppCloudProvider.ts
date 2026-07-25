import type { MessagingProvider, OutboundMessage } from '../../domain/ports/MessagingProvider';
import { logger } from '../logging/logger';

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
    if (!this.config.accessToken || !this.config.phoneNumberId) {
      logger.info('WhatsApp stub send (no credentials)', {
        to: message.to,
        body: message.body,
      });
      return { ok: true, providerMessageId: `wa-stub-${Date.now()}` };
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
      return { ok: false };
    }

    const data = (await response.json()) as {
      messages?: Array<{ id: string }>;
    };

    return {
      ok: true,
      providerMessageId: data.messages?.[0]?.id,
    };
  }
}
