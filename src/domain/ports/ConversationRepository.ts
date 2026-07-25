import type { Conversation } from '../entities/Conversation';

export interface ConversationRepository {
  findByExternalId(externalId: string): Promise<Conversation | null>;
  findById(id: string): Promise<Conversation | null>;
  save(conversation: Conversation): Promise<Conversation>;
  deleteExpired(now?: Date): Promise<number>;
}
