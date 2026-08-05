import type { ConversationDetailDto } from '../../domain/dashboard/conversationDetailDto';
import type { ConversationDetailRepository } from '../../domain/dashboard/ConversationDetailRepository';

/**
 * Conversation Detail API — lectura para el Dashboard.
 * No modifica el flujo conversacional.
 */
export class ConversationDetailService {
  constructor(private readonly repository: ConversationDetailRepository) {}

  getById(id: string): ConversationDetailDto | null {
    const trimmed = id?.trim();
    if (!trimmed) return null;
    return this.repository.findById(trimmed);
  }
}
