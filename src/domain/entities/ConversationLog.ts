export interface ConversationLog {
  id: string;
  date: Date;
  customerId: string;
  customerPhone: string;
  conversationId: string;
  inboundMessage: string;
  outboundResponse: string;
  durationMs: number;
  error?: string;
  metadata?: Record<string, unknown>;
}
