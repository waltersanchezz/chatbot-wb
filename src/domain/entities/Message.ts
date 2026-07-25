export type MessageRole = 'customer' | 'assistant' | 'system' | 'human_agent';

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}
