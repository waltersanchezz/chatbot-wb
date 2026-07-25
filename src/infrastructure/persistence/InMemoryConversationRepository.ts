import type { Conversation } from '../../domain/entities/Conversation';
import type { ConversationRepository } from '../../domain/ports/ConversationRepository';

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly byId = new Map<string, Conversation>();
  private readonly byExternal = new Map<string, string>();

  async findByExternalId(externalId: string): Promise<Conversation | null> {
    const id = this.byExternal.get(externalId);
    if (!id) return null;
    return this.clone(this.byId.get(id));
  }

  async findById(id: string): Promise<Conversation | null> {
    return this.clone(this.byId.get(id));
  }

  async save(conversation: Conversation): Promise<Conversation> {
    const copy = this.clone(conversation)!;
    this.byId.set(copy.id, copy);
    this.byExternal.set(copy.externalId, copy.id);
    return this.clone(copy)!;
  }

  async deleteExpired(now: Date = new Date()): Promise<number> {
    let removed = 0;
    for (const [id, conv] of this.byId) {
      if (conv.expiresAt < now) {
        this.byId.delete(id);
        this.byExternal.delete(conv.externalId);
        removed += 1;
      }
    }
    return removed;
  }

  private clone(conversation?: Conversation | null): Conversation | null {
    if (!conversation) return null;
    return structuredClone(conversation);
  }
}
