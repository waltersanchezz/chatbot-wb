import type {
  ConversationListDto,
  ConversationListQuery,
} from './conversationListDto';

/**
 * Puerto de listado de conversaciones para el Dashboard API.
 * Independiente del ConversationRepository del chatbot (puerto de sesión).
 */
export interface ConversationRepository {
  list(query?: ConversationListQuery): ConversationListDto;
}
