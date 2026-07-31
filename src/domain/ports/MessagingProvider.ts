import type { Channel } from '../../shared/types';

export interface OutboundMessage {
  to: string;
  body: string;
  channel: Channel;
  /** Correlación auditoría WhatsApp (wamid inbound). */
  inboundWamid?: string;
  /** Correlación auditoría: requestId del POST webhook (solo traza). */
  auditRequestId?: string;
  conversationId?: string;
}

export interface MessagingProvider {
  sendText(message: OutboundMessage): Promise<{ ok: boolean; providerMessageId?: string }>;
}
