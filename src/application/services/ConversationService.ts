import type {
  ConversationListDto,
  ConversationListQuery,
} from '../../domain/dashboard/conversationListDto';
import type { ConversationRepository } from '../../domain/dashboard/ConversationRepository';

/**
 * Conversations API — listado paginado para el Dashboard.
 * No modifica el flujo conversacional ni motores Willard.
 */
export class ConversationService {
  constructor(private readonly repository: ConversationRepository) {}

  listConversations(query?: ConversationListQuery): ConversationListDto {
    return this.repository.list(query);
  }
}
