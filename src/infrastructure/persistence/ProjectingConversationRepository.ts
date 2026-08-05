import type { Conversation } from '../../domain/entities/Conversation';
import type { ConversationRepository } from '../../domain/ports/ConversationRepository';
import type { PersistenceRepository } from '../../domain/ports/PersistenceRepository';
import {
  ConversationSessionProjector,
} from '../../application/persistence/ConversationSessionProjector';
import { logger } from '../logging/logger';

const MAX_PROJECTION_ATTEMPTS = 3; // intento inicial + 2 reintentos (C3/C7)

/**
 * Decorator R2: tras save CRM exitoso, proyecta a persisted_sessions.
 * Writer único de sessions en el write path del canal (ADR).
 * Fallo de proyección: log + no throw (canal/CRM ya committed).
 */
export class ProjectingConversationRepository implements ConversationRepository {
  private readonly projector: ConversationSessionProjector;

  constructor(
    /** CRM write model (p.ej. SQLiteChatConversationRepository). */
    readonly inner: ConversationRepository,
    private readonly persistence: PersistenceRepository,
    projector: ConversationSessionProjector = new ConversationSessionProjector(),
  ) {
    this.projector = projector;
  }

  findByExternalId(externalId: string): Promise<Conversation | null> {
    return this.inner.findByExternalId(externalId);
  }

  findById(id: string): Promise<Conversation | null> {
    return this.inner.findById(id);
  }

  async save(conversation: Conversation): Promise<Conversation> {
    const saved = await this.inner.save(conversation);
    this.projectBestEffort(saved);
    return saved;
  }

  deleteExpired(now?: Date): Promise<number> {
    return this.inner.deleteExpired(now);
  }

  private projectBestEffort(conversation: Conversation): void {
    const session = this.projector.project({ conversation });
    let lastError: unknown;

    for (let attempt = 1; attempt <= MAX_PROJECTION_ATTEMPTS; attempt += 1) {
      try {
        this.persistence.save(session);
        return;
      } catch (err) {
        lastError = err;
        logger.warn('ProjectingConversationRepository — proyección fallida; reintento', {
          service: 'ProjectingConversationRepository',
          operation: 'projectBestEffort',
          conversationId: conversation.id,
          attempt,
          maxAttempts: MAX_PROJECTION_ATTEMPTS,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.exception(
      'ProjectingConversationRepository — proyección agotada (CRM ya guardado; canal no se tumba)',
      lastError,
      {
        service: 'ProjectingConversationRepository',
        operation: 'projectBestEffort',
        conversationId: conversation.id,
        waIdSuffix: conversation.externalId.slice(-4),
      },
    );
  }
}
