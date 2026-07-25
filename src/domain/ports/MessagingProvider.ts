import type { Channel } from '../../shared/types';

export interface OutboundMessage {
  to: string;
  body: string;
  channel: Channel;
}

export interface MessagingProvider {
  sendText(message: OutboundMessage): Promise<{ ok: boolean; providerMessageId?: string }>;
}
