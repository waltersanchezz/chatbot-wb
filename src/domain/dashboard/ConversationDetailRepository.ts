import type { ConversationDetailDto } from './conversationDetailDto';

/**
 * Puerto de detalle de conversación (Dashboard Sprint 3).
 */
export interface ConversationDetailRepository {
  findById(id: string): ConversationDetailDto | null;
}
